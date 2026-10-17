import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { db } from './server/db.js';
import { emailQueue, emailBullQueue, startWorker, reconcileQueue } from './server/queue.js';
import { config } from './server/config.js';
import { initSearch, indexEmails } from './server/es.js';
import { ensureSenders, provisionEtherealSenders } from './server/senders.js';
import { searchEmails } from './server/search.js';
import { sendSlackRateLimitAlert, sendSlackTestMessage } from './server/slack.js';
import { sendEmail, verifySmtpConnection } from './server/mailer.js';
import { Campaign, ScheduledEmailItem, SenderAccount } from './src/types.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'reachinbox_session_secret_change_in_prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

// ─── Passport Google OAuth 2.0 ───────────────────────────────────────────────
// Only register the strategy when real credentials are provided (avoids crash in dev-login-only mode).

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/api/v1/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await db.upsertUser({
            googleId: profile.id,
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
          });
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}

passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await db.getUser(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized: Please sign in with Google.' });
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────

app.get('/api/v1/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/?auth=not_configured');
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get(
  '/api/v1/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    // Give first-time users Ethereal sender mailboxes in the background (rate limits are per sender).
    ensureSenders((req.user as any).id).catch((e) => console.error('[Senders]', e.message));
    res.redirect('/');
  }
);

app.get('/api/v1/auth/me', (req: Request, res: Response) => {
  if (req.isAuthenticated() && req.user) {
    return res.json({ user: req.user, authenticated: true });
  }
  return res.status(401).json({ error: 'Not authenticated' });
});

app.post('/api/v1/auth/logout', (req: Request, res: Response) => {
  req.logout(() => {
    req.session.destroy(() => res.json({ success: true }));
  });
});

// Tells the login screen whether to show the dev shortcut (off unless ALLOW_DEV_LOGIN=true and not production).
app.get('/api/v1/auth/config', (_req: Request, res: Response) => {
  res.json({ devLogin: config.allowDevLogin, googleConfigured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET });
});

// Dev-only: creates a REAL local user + session (previously a cookie bypass with a user id that didn't exist in the DB).
app.post('/api/v1/auth/dev-login', async (req: Request, res: Response) => {
  if (!config.allowDevLogin) return res.status(404).json({ error: 'Not found' });
  const user = await db.upsertUser({ googleId: 'dev-local', email: 'dev@reachinbox.local', name: 'Dev User' });
  req.login(user as any, async (err) => {
    if (err) return res.status(500).json({ error: err.message });
    await ensureSenders(user.id).catch(() => {});
    res.json({ success: true });
  });
});

// ─── Helper: get userId from request ─────────────────────────────────────────

function getUserId(req: Request): string {
  return (req.user as any).id as string; // requireAuth guarantees a real user
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

app.get('/api/v1/stats', requireAuth, async (req: Request, res: Response) => {
  const [counts, settings] = await Promise.all([db.getStatsForUser(getUserId(req)), db.getSettings()]);
  res.json({
    scheduledEmails: counts.scheduled,
    sentEmails: counts.sent,
    failedEmails: counts.failed,
    // NOTE: open tracking isn't implemented (no tracking pixel). These two are static placeholders for the Figma card.
    openRatePercent: 67,
    openRateDelta: 12,
    hourlySentCount: await db.getHourlyCount(),
    hourlyLimit: settings.maxEmailsPerHour,
  });
});

// ─── Email List Routes ────────────────────────────────────────────────────────

app.get('/api/v1/emails/scheduled', requireAuth, async (req: Request, res: Response) => {
  const term = (req.query.search as string) || '';
  const status = (req.query.status as string) || 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Number(req.query.limit) || 5);
  const offset = (page - 1) * limit;

  const result = await searchEmails({ userId: getUserId(req), type: 'scheduled', term, status: status === 'all' ? undefined : status, offset, limit });
  res.json({
    data: result.items,
    pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) || 1 },
    tookMs: result.tookMs,
    engine: result.engine,
  });
});

app.get('/api/v1/emails/sent', requireAuth, async (req: Request, res: Response) => {
  const term = (req.query.search as string) || '';
  const status = (req.query.status as string) || 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Number(req.query.limit) || 5);
  const offset = (page - 1) * limit;

  const result = await searchEmails({ userId: getUserId(req), type: 'sent', term, status: status === 'all' ? undefined : status, offset, limit });
  res.json({
    data: result.items,
    pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) || 1 },
    tookMs: result.tookMs,
    engine: result.engine,
  });
});

app.post('/api/v1/emails/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  if (!(await db.emailOwnedBy(req.params.id, getUserId(req)))) return res.status(404).json({ error: 'Email not found.' });
  const success = await db.cancelEmail(req.params.id);
  if (!success) return res.status(400).json({ error: 'Email could not be cancelled or has already been sent.' });
  res.json({ success: true });
});

app.post('/api/v1/emails/:id/retry', requireAuth, async (req: Request, res: Response) => {
  if (!(await db.emailOwnedBy(req.params.id, getUserId(req)))) return res.status(404).json({ error: 'Email not found.' });
  const success = await emailQueue.retryEmail(req.params.id);
  if (!success) return res.status(404).json({ error: 'Email not found.' });
  res.json({ success: true });
});

app.post('/api/v1/emails/:id/send-now', requireAuth, async (req: Request, res: Response) => {
  if (!(await db.emailOwnedBy(req.params.id, getUserId(req)))) return res.status(404).json({ error: 'Email not found.' });
  const success = await emailQueue.sendNow(req.params.id);
  if (!success) return res.status(400).json({ error: 'Email could not be dispatched.' });
  const updated = await db.getEmailById(req.params.id);
  res.json({ success: true, email: updated });
});

// ─── Campaigns ────────────────────────────────────────────────────────────────

app.get('/api/v1/campaigns', requireAuth, async (req: Request, res: Response) => {
  const campaigns = await db.getCampaigns(getUserId(req));
  res.json({ data: campaigns });
});

app.post('/api/v1/campaigns', requireAuth, async (req: Request, res: Response) => {
  const { subject, body, recipients, startTime, delaySeconds, hourlyLimit, senderEmail } = req.body;

  if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });
  if (!Array.isArray(recipients) || recipients.length === 0)
    return res.status(400).json({ error: 'At least one recipient is required.' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set<string>();
  const leads: { email: string; name: string }[] = [];
  for (const r of recipients) {
    const email = String(typeof r === 'string' ? r : r?.email ?? '').trim().toLowerCase();
    if (!emailRegex.test(email) || seen.has(email)) continue;
    seen.add(email);
    leads.push({ email, name: typeof r === 'string' ? '' : String(r?.name ?? '') });
  }
  if (leads.length === 0) return res.status(400).json({ error: 'No valid recipient email addresses.' });

  const start = startTime ? new Date(startTime) : new Date();
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start time.' });
  const delay = Math.max(0, Number(delaySeconds ?? 30)) || 0;
  const delayMs = delay * 1000;

  const userId = getUserId(req);
  const allSenders = await ensureSenders(userId); // auto-provisions Ethereal mailboxes for new users
  // A specific sender if asked, otherwise rotate across ALL mailboxes so per-sender hourly caps spread the load.
  const pool = (senderEmail && senderEmail.trim()) ? allSenders.filter((s) => s.email === senderEmail) : allSenders;
  if (pool.length === 0) return res.status(400).json({ error: 'No sender account configured.' });

  const campaignId = `cmp_${crypto.randomUUID()}`;
  const effectiveLimit = Math.max(1, Math.floor(Number(hourlyLimit) || pool[0].hourlyLimit));

  const newCampaign: Campaign = {
    id: campaignId,
    userId,
    name: String(subject).slice(0, 50),
    subject,
    body,
    totalRecipients: leads.length,
    scheduledCount: leads.length,
    sentCount: 0,
    failedCount: 0,
    startTime: start.toISOString(),
    delayBetweenEmailsSeconds: delay,
    hourlyLimit: effectiveLimit,
    senderEmail: pool.length === 1 ? pool[0].email : 'multiple',
    createdAt: new Date().toISOString(),
    status: 'active',
  };

  const emailItems: ScheduledEmailItem[] = leads.map((lead, idx) => {
    const sender = pool[idx % pool.length];
    return {
      id: `eml_${crypto.randomUUID()}`, // UUID: the old Date.now()+idx ids could collide across campaigns
      campaignId,
      recipientEmail: lead.email,
      recipientName: lead.name,
      subject,
      body: String(body).replace(/\{\{name\}\}/gi, lead.name || 'there'),
      scheduledTime: new Date(start.getTime() + idx * delayMs).toISOString(),
      status: 'scheduled' as const,
      senderEmail: sender.email,
      senderName: sender.name,
      delaySeconds: delay,
    };
  });

  await db.addCampaign(newCampaign);
  await db.addEmails(emailItems);

  // Rows are committed first. If we crash before/while enqueuing, reconcileQueue() on boot re-creates the missing jobs.
  for (const item of emailItems) await emailQueue.addEmailJob(item.id, new Date(item.scheduledTime));
  void indexEmails(userId, emailItems); // best-effort, non-blocking

  res.status(201).json({ success: true, campaign: newCampaign, scheduledCount: emailItems.length, skipped: recipients.length - leads.length });
});

// ─── Queue Health ─────────────────────────────────────────────────────────────

app.get('/api/v1/queue/health', requireAuth, async (_req: Request, res: Response) => {
  const health = await emailQueue.getQueueHealth();
  res.json({ queue: 'email-dispatch', timestamp: new Date().toISOString(), ...health });
});

// ─── Slack ────────────────────────────────────────────────────────────────────

app.get('/api/v1/slack/status', requireAuth, async (req: Request, res: Response) => {
  const slack = await db.getSlackConfig(getUserId(req));
  res.json({ data: { ...slack, webhookUrl: undefined } });
});

// Real Slack OAuth v2: user clicks "Connect with Slack" -> Slack consent -> callback stores the per-user incoming webhook.
app.get('/api/v1/slack/oauth/start', requireAuth, (req: Request, res: Response) => {
  if (!config.slack.clientId || !config.slack.clientSecret) {
    return res.redirect('/?slack=not_configured');
  }
  const state = crypto.randomBytes(16).toString('hex');
  (req.session as any).slackOAuthState = state;
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', config.slack.clientId);
  url.searchParams.set('scope', 'incoming-webhook');
  url.searchParams.set('redirect_uri', config.slack.redirectUri);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/api/v1/slack/oauth/callback', requireAuth, async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const expected = (req.session as any).slackOAuthState;
  delete (req.session as any).slackOAuthState;

  if (error) return res.redirect(`/?slack=denied`);
  if (!code || !state || !expected || state !== expected) return res.redirect('/?slack=invalid_state'); // CSRF guard

  try {
    const r = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.slack.clientId,
        client_secret: config.slack.clientSecret,
        redirect_uri: config.slack.redirectUri,
      }),
    });
    const data: any = await r.json();
    if (!data.ok || !data.incoming_webhook?.url) {
      console.error('[Slack OAuth] failed:', data.error);
      return res.redirect(`/?slack=failed`);
    }
    await db.updateSlackConfig({
      userId: getUserId(req),
      connected: true,
      webhookUrl: data.incoming_webhook.url,
      channelName: data.incoming_webhook.channel,
      teamName: data.team?.name,
      accessToken: data.access_token,
    });
    res.redirect('/?slack=connected');
  } catch (err: any) {
    console.error('[Slack OAuth] exception:', err.message);
    res.redirect('/?slack=failed');
  }
});

app.get('/api/v1/slack/oauth/config', requireAuth, (_req: Request, res: Response) => {
  res.json({ configured: !!config.slack.clientId && !!config.slack.clientSecret, redirectUri: config.slack.redirectUri });
});

app.post('/api/v1/slack/disconnect', requireAuth, async (req: Request, res: Response) => {
  const updated = await db.updateSlackConfig({ userId: getUserId(req), connected: false, webhookUrl: '', accessToken: '' });
  res.json({ success: true, data: { ...updated, webhookUrl: undefined } });
});

app.post('/api/v1/slack/test', requireAuth, async (req: Request, res: Response) => {
  const slack = await db.getSlackConfig(getUserId(req));
  if (!slack.connected || !slack.webhookUrl) return res.status(400).json({ error: 'Connect Slack first.' });
  const result = await sendSlackTestMessage(slack.webhookUrl);
  if (!result.success) return res.status(400).json({ error: result.message || 'Slack request failed' });
  res.json({ success: true, message: 'Test notification sent.' });
});

app.post('/api/v1/slack/trigger-rate-limit-alert', requireAuth, async (req: Request, res: Response) => {
  const senders = await db.getSenders(getUserId(req));
  const sender = senders[0];
  if (!sender) return res.status(400).json({ error: 'No sender configured.' });

  const result = await sendSlackRateLimitAlert({
    userId: getUserId(req),
    senderEmail: sender.email,
    hourlyLimit: sender.hourlyLimit,
    currentCount: sender.hourlyLimit,
    campaignContext: 'Rate Limit Simulation',
    nextEligibleWindow: 'Next hour boundary',
  });
  res.json({ success: result.success, message: result.message || 'Alert dispatched.' });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

app.get('/api/v1/settings', requireAuth, async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const [settings, senders, slack] = await Promise.all([
    db.getSettings(),
    db.getSenders(userId),
    db.getSlackConfig(userId),
  ]);
  res.json({ settings, senders, slack: { ...slack, webhookUrl: undefined } });
});

app.post('/api/v1/settings', requireAuth, async (req: Request, res: Response) => {
  const { workerConcurrency, minDelayBetweenEmailsSeconds, maxEmailsPerHour } = req.body;
  const updated = await db.updateSettings({
    ...(workerConcurrency !== undefined && { workerConcurrency: Number(workerConcurrency) }),
    ...(minDelayBetweenEmailsSeconds !== undefined && { minDelayBetweenEmailsSeconds: Number(minDelayBetweenEmailsSeconds) }),
    ...(maxEmailsPerHour !== undefined && { maxEmailsPerHour: Number(maxEmailsPerHour) }),
  });
  emailQueue.applyConcurrency(updated.workerConcurrency);
  res.json({ success: true, settings: updated });
});

// ─── Senders ──────────────────────────────────────────────────────────────────

app.post('/api/v1/senders', requireAuth, async (req: Request, res: Response) => {
  const { id, name, email, type, hourlyLimit, smtpConfig, isLiveDelivery } = req.body;
  const userId = getUserId(req);

  if (!email || !name) return res.status(400).json({ error: 'Sender name and email are required.' });

  if (id) {
    if (!(await db.getSenders(userId)).some((x) => x.id === id)) return res.status(404).json({ error: 'Sender not found.' });
    const updated = await db.updateSender(id, { name, email, type, hourlyLimit: Number(hourlyLimit) || 500, isLiveDelivery, smtpConfig });
    return res.json({ success: true, sender: updated });
  }

  const senders = await db.getSenders(userId);
  const newSender = await db.addSender({
    id: 'snd_' + Date.now(),
    userId,
    email,
    name,
    isDefault: senders.length === 0,
    type: type || 'smtp',
    hourlyLimit: Number(hourlyLimit) || 500,
    emailsSentCurrentHour: 0,
    isLiveDelivery: isLiveDelivery !== false,
    smtpConfig,
  });
  res.status(201).json({ success: true, sender: newSender });
});

app.post('/api/v1/senders/verify', requireAuth, async (req: Request, res: Response) => {
  const { smtpConfig } = req.body;
  if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass)
    return res.status(400).json({ error: 'Host, username, and password are required.' });

  const result = await verifySmtpConnection(smtpConfig);
  if (!result.success) return res.status(400).json({ error: result.error || 'SMTP verification failed.' });
  res.json({ success: true, message: 'SMTP credentials verified!' });
});

app.post('/api/v1/senders/:id/default', requireAuth, async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const senders = await db.getSenders(userId);
  if (!senders.some((x) => x.id === req.params.id)) return res.status(404).json({ error: 'Sender not found.' });
  for (const s of senders) {
    await db.updateSender(s.id, { isDefault: s.id === req.params.id });
  }
  res.json({ success: true, senders: await db.getSenders(userId) });
});

app.post('/api/v1/senders/provision-ethereal', requireAuth, async (req: Request, res: Response) => {
  const count = Math.min(5, Math.max(1, Number(req.body?.count) || 3));
  const created = await provisionEtherealSenders(getUserId(req), count);
  res.status(201).json({ success: true, senders: created });
});

app.delete('/api/v1/senders/:id', requireAuth, async (req: Request, res: Response) => {
  if (!(await db.getSenders(getUserId(req))).some((x) => x.id === req.params.id)) return res.status(404).json({ error: 'Sender not found.' });
  const success = await db.deleteSender(req.params.id);
  res.json({ success });
});

// ─── Real Email Dispatcher ────────────────────────────────────────────────────

app.post('/api/v1/send-real-test', requireAuth, async (req: Request, res: Response) => {
  const { toEmail, subject, body, senderEmail, customSmtp } = req.body;
  if (!toEmail) return res.status(400).json({ error: 'Recipient email is required.' });

  const userId = getUserId(req);
  const senders = await db.getSenders(userId);
  const matchedSender = senders.find((s) => s.email === senderEmail) || senders.find((s) => s.isDefault) || senders[0];
  const smtpToUse = customSmtp || matchedSender?.smtpConfig;

  const emailSubject = subject || 'Real Test Email from ReachInbox';
  const emailBody = body || `Hello!\n\nThis is a real-world test email dispatched via ReachInbox.\n\nDelivered at: ${new Date().toISOString()}\n\nBest regards,\nReachInbox Team`;

  const result = await sendEmail({
    fromName: matchedSender?.name || 'ReachInbox Outreach',
    fromEmail: matchedSender?.email || 'outreach@reachinbox.ai',
    toEmail,
    subject: emailSubject,
    textBody: emailBody,
    smtpConfig: smtpToUse,
  });

  const nowIso = new Date().toISOString();
  const testRecord: ScheduledEmailItem = {
    id: 'eml_live_' + Date.now(),
    campaignId: 'cmp_real_test',
    recipientEmail: toEmail,
    recipientName: toEmail.split('@')[0],
    subject: emailSubject,
    body: emailBody,
    scheduledTime: nowIso,
    sentTime: nowIso,
    status: result.success ? 'sent' : 'failed',
    senderEmail: matchedSender?.email || 'outreach@reachinbox.ai',
    senderName: matchedSender?.name || 'ReachInbox Outreach',
    etherealPreviewUrl: result.etherealPreviewUrl,
    error: result.error,
    delaySeconds: 0,
  };

  // Ensure a campaign exists for real test emails
  const campaigns = await db.getCampaigns(userId);
  if (!campaigns.find((c) => c.id === 'cmp_real_test')) {
    await db.addCampaign({
      id: 'cmp_real_test',
      userId,
      name: 'Real Test Emails',
      subject: emailSubject,
      body: emailBody,
      totalRecipients: 0,
      scheduledCount: 0,
      sentCount: 0,
      failedCount: 0,
      startTime: nowIso,
      delayBetweenEmailsSeconds: 0,
      hourlyLimit: 1000,
      senderEmail: matchedSender?.email || 'outreach@reachinbox.ai',
      createdAt: nowIso,
      status: 'active',
    });
  }

  await db.addEmails([testRecord]);

  if (result.success) {
    await db.incrementHourlyCount(1);
    return res.json({
      success: true,
      messageId: result.messageId,
      etherealPreviewUrl: result.etherealPreviewUrl,
      isRealDelivery: result.isRealDelivery,
      email: testRecord,
    });
  }

  res.status(500).json({ success: false, error: result.error || 'Failed to dispatch email', email: testRecord });
});

// ─── Bull Board: live BullMQ dashboard (auth required) ───────────────────────

const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailBullQueue)], serverAdapter: bullBoardAdapter });
app.use('/admin/queues', requireAuth, bullBoardAdapter.getRouter());

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ─── Vite Dev / Static Serve ──────────────────────────────────────────────────

async function startServer() {
  await initSearch();
  await startWorker();
  await reconcileQueue();
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.resolve(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] ReachInbox running on http://0.0.0.0:${PORT}`);
    console.log(`[Server] Google OAuth callback: ${process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/api/v1/auth/google/callback`}`);
  });
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    console.log(`[Server] ${sig}: closing worker gracefully (in-flight jobs finish)`);
    await emailQueue.stopWorker().catch(() => {});
    process.exit(0);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
