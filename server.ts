import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db } from './server/db.js';
import { emailQueue } from './server/queue.js';
import { searchEmails } from './server/search.js';
import { sendSlackRateLimitAlert, sendSlackTestMessage } from './server/slack.js';
import { sendEmail, verifySmtpConnection } from './server/mailer.js';
import { Campaign, ScheduledEmailItem, SenderAccount } from './src/types.js';

dotenv.config();

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

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
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
  // Allow dev bypass with a cookie for testing without OAuth
  if (!isProduction && req.cookies?.reachinbox_dev_bypass === 'true') return next();
  return res.status(401).json({ error: 'Unauthorized: Please sign in with Google.' });
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────

app.get('/api/v1/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get(
  '/api/v1/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (_req, res) => {
    res.redirect('/');
  }
);

app.get('/api/v1/auth/me', (req: Request, res: Response) => {
  if (req.isAuthenticated() && req.user) {
    return res.json({ user: req.user, authenticated: true });
  }
  // Dev bypass
  if (!isProduction && req.cookies?.reachinbox_dev_bypass === 'true') {
    return res.json({
      user: {
        id: 'dev_user',
        name: 'Dev User',
        email: 'dev@reachinbox.ai',
        role: 'Campaign Lead',
        createdAt: new Date().toISOString(),
      },
      authenticated: true,
    });
  }
  return res.status(401).json({ error: 'Not authenticated' });
});

app.post('/api/v1/auth/logout', (req: Request, res: Response) => {
  req.logout(() => {
    res.clearCookie('reachinbox_dev_bypass');
    res.json({ success: true });
  });
});

// Dev-only: bypass auth for local testing without Google OAuth credentials
app.post('/api/v1/auth/dev-login', (req: Request, res: Response) => {
  if (isProduction) return res.status(404).json({ error: 'Not found' });
  res.cookie('reachinbox_dev_bypass', 'true', { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, message: 'Dev bypass enabled' });
});

// ─── Helper: get userId from request ─────────────────────────────────────────

function getUserId(req: Request): string {
  return (req.user as any)?.id || 'dev_user';
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

app.get('/api/v1/stats', requireAuth, async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const emails = await db.getEmails();
  const settings = await db.getSettings();

  const scheduledEmails = emails.filter(
    (e) => e.status === 'scheduled' || e.status === 'queued' || e.status === 'processing'
  ).length;
  const sentEmails = emails.filter((e) => e.status === 'sent').length;
  const failedEmails = emails.filter((e) => e.status === 'failed').length;

  res.json({
    scheduledEmails,
    sentEmails,
    failedEmails,
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

  const result = await searchEmails({ type: 'scheduled', term, status: status === 'all' ? undefined : status, offset, limit });
  res.json({
    data: result.items,
    pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) || 1 },
    tookMs: result.tookMs,
  });
});

app.get('/api/v1/emails/sent', requireAuth, async (req: Request, res: Response) => {
  const term = (req.query.search as string) || '';
  const status = (req.query.status as string) || 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Number(req.query.limit) || 5);
  const offset = (page - 1) * limit;

  const result = await searchEmails({ type: 'sent', term, status: status === 'all' ? undefined : status, offset, limit });
  res.json({
    data: result.items,
    pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) || 1 },
    tookMs: result.tookMs,
  });
});

app.post('/api/v1/emails/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  const success = await db.cancelEmail(req.params.id);
  if (!success) return res.status(400).json({ error: 'Email could not be cancelled or has already been sent.' });
  res.json({ success: true });
});

app.post('/api/v1/emails/:id/retry', requireAuth, async (req: Request, res: Response) => {
  const success = await emailQueue.retryEmail(req.params.id);
  if (!success) return res.status(404).json({ error: 'Email not found.' });
  res.json({ success: true });
});

app.post('/api/v1/emails/:id/send-now', requireAuth, async (req: Request, res: Response) => {
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
  const { subject, body, recipients, startTime, delaySeconds = 30, hourlyLimit = 200, senderEmail, attachments } = req.body;

  if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });
  if (!Array.isArray(recipients) || recipients.length === 0)
    return res.status(400).json({ error: 'At least one recipient is required.' });

  const userId = getUserId(req);
  const senders = await db.getSenders(userId);
  const selectedSender = senders.find((s) => s.email === senderEmail) || senders[0];

  if (!selectedSender) return res.status(400).json({ error: 'No sender account configured.' });

  const campaignId = 'cmp_' + Date.now();
  const newCampaign: Campaign = {
    id: campaignId,
    userId,
    name: subject.slice(0, 50),
    subject,
    body,
    totalRecipients: recipients.length,
    scheduledCount: recipients.length,
    sentCount: 0,
    failedCount: 0,
    startTime: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
    delayBetweenEmailsSeconds: Number(delaySeconds) || 30,
    hourlyLimit: Number(hourlyLimit) || selectedSender.hourlyLimit,
    senderEmail: selectedSender.email,
    createdAt: new Date().toISOString(),
    status: 'active',
  };

  await db.addCampaign(newCampaign);

  const startTimestamp = startTime ? new Date(startTime).getTime() : Date.now();
  const delayMs = (Number(delaySeconds) || 30) * 1000;

  const emailItems: ScheduledEmailItem[] = recipients.map((r: any, idx: number) => {
    const emailStr = typeof r === 'string' ? r : r.email;
    const nameStr = typeof r === 'string' ? '' : r.name || '';
    const scheduledTime = new Date(startTimestamp + idx * delayMs).toISOString();
    const personalizedBody = body.replace(/\{\{name\}\}/gi, nameStr || 'there');

    return {
      id: `eml_${Date.now()}_${idx}`,
      campaignId,
      recipientEmail: emailStr,
      recipientName: nameStr,
      subject,
      body: personalizedBody,
      scheduledTime,
      status: 'scheduled' as const,
      senderEmail: selectedSender.email,
      senderName: selectedSender.name,
      delaySeconds: Number(delaySeconds) || 30,
      attachments: attachments || [],
    };
  });

  await db.addEmails(emailItems);

  // Schedule each email as a BullMQ delayed job
  for (const item of emailItems) {
    await emailQueue.addEmailJob(item.id, new Date(item.scheduledTime));
  }

  res.status(201).json({ success: true, campaign: newCampaign, scheduledCount: emailItems.length });
});

// ─── Queue Health ─────────────────────────────────────────────────────────────

app.get('/api/v1/queue/health', requireAuth, async (_req: Request, res: Response) => {
  const health = await emailQueue.getQueueHealth();
  res.json({ queue: 'email-dispatch', timestamp: new Date().toISOString(), ...health });
});

// ─── Slack ────────────────────────────────────────────────────────────────────

app.get('/api/v1/slack/status', requireAuth, async (req: Request, res: Response) => {
  const slack = await db.getSlackConfig(getUserId(req));
  res.json({ data: slack });
});

app.post('/api/v1/slack/connect', requireAuth, async (req: Request, res: Response) => {
  const { webhookUrl, channelName } = req.body;
  const updated = await db.updateSlackConfig({
    userId: getUserId(req),
    connected: true,
    webhookUrl: webhookUrl || '',
    channelName: channelName || '#email-campaigns',
    teamName: 'ReachInbox Workspace',
  });
  res.json({ success: true, data: updated });
});

app.post('/api/v1/slack/disconnect', requireAuth, async (req: Request, res: Response) => {
  const updated = await db.updateSlackConfig({ userId: getUserId(req), connected: false, webhookUrl: '' });
  res.json({ success: true, data: updated });
});

app.post('/api/v1/slack/test', requireAuth, async (req: Request, res: Response) => {
  const { webhookUrl } = req.body;
  const slack = await db.getSlackConfig(getUserId(req));
  const targetUrl = webhookUrl || slack.webhookUrl;
  if (!targetUrl) return res.status(400).json({ error: 'Please enter a Slack Webhook URL.' });

  const result = await sendSlackTestMessage(targetUrl);
  if (!result.success) return res.status(400).json({ error: result.message || 'Webhook failed' });
  res.json({ success: true, message: 'Test notification sent.' });
});

app.post('/api/v1/slack/trigger-rate-limit-alert', requireAuth, async (req: Request, res: Response) => {
  const senders = await db.getSenders(getUserId(req));
  const sender = senders[0];
  if (!sender) return res.status(400).json({ error: 'No sender configured.' });

  const result = await sendSlackRateLimitAlert({
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
  res.json({ settings, senders, slack });
});

app.post('/api/v1/settings', requireAuth, async (req: Request, res: Response) => {
  const { workerConcurrency, minDelayBetweenEmailsSeconds, maxEmailsPerHour } = req.body;
  const updated = await db.updateSettings({
    ...(workerConcurrency !== undefined && { workerConcurrency: Number(workerConcurrency) }),
    ...(minDelayBetweenEmailsSeconds !== undefined && { minDelayBetweenEmailsSeconds: Number(minDelayBetweenEmailsSeconds) }),
    ...(maxEmailsPerHour !== undefined && { maxEmailsPerHour: Number(maxEmailsPerHour) }),
  });
  res.json({ success: true, settings: updated });
});

// ─── Senders ──────────────────────────────────────────────────────────────────

app.post('/api/v1/senders', requireAuth, async (req: Request, res: Response) => {
  const { id, name, email, type, hourlyLimit, smtpConfig, isLiveDelivery } = req.body;
  const userId = getUserId(req);

  if (!email || !name) return res.status(400).json({ error: 'Sender name and email are required.' });

  if (id) {
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
  for (const s of senders) {
    await db.updateSender(s.id, { isDefault: s.id === req.params.id });
  }
  res.json({ success: true, senders: await db.getSenders(userId) });
});

app.delete('/api/v1/senders/:id', requireAuth, async (req: Request, res: Response) => {
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

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ─── Vite Dev / Static Serve ──────────────────────────────────────────────────

async function startServer() {
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

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
