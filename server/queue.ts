import { Queue, Worker, Job, DelayedError } from 'bullmq';
import { db } from './db.js';
import { config } from './config.js';
import { sendEmail } from './mailer.js';
import { notifyRateLimitHit } from './slack.js';
import { redisConnection } from './redis.js';
import { tryConsume, releaseSlot, rescheduleTime, nextWindowStart } from './rateLimit.js';
import { updateEmailDoc } from './es.js';
import { QueueHealthStats } from '../src/types.js';

export { redisConnection };
export const QUEUE_NAME = 'email-dispatch';
const MAX_ATTEMPTS = 3;

export const emailBullQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
    attempts: MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

/**
 * The job processor. Order matters:
 *   1. atomic DB claim  (scheduled -> processing; only one worker wins)  => no duplicate sends
 *   2. Redis Lua slot   (per sender, per hour window)                    => safe across workers/instances
 *   3. SMTP send, then mark sent
 * Over the cap the SAME job is moved to the next hour window (DelayedError); it is never failed or dropped.
 */
async function processor(job: Job, token?: string) {
  const { emailId } = job.data as { emailId: string };

  const ctx = await db.getEmailForWorker(emailId);
  if (!ctx) {
    console.warn(`[Worker] Email ${emailId} not found, skipping.`);
    return { skipped: 'not_found' };
  }
  const { email, userId, campaignHourlyLimit, campaignSubject } = ctx;

  if (email.status === 'sent' || email.status === 'cancelled') return { skipped: email.status };
  if (!(await db.claimEmail(emailId))) return { skipped: 'already_claimed' };

  const senders = await db.getSenders(userId);
  const sender = senders.find((s) => s.email === email.senderEmail);

  // Effective cap = tightest of: this campaign's limit, the mailbox's limit, the global per-sender ceiling.
  const limit = Math.min(
    campaignHourlyLimit > 0 ? campaignHourlyLimit : Infinity,
    sender?.hourlyLimit && sender.hourlyLimit > 0 ? sender.hourlyLimit : Infinity,
    config.maxEmailsPerHourPerSender
  );

  const allowed = await tryConsume(redisConnection, email.senderEmail, limit);
  if (!allowed) {
    const resumeAt = rescheduleTime(new Date(email.scheduledTime).getTime());
    await db.updateEmail(emailId, { status: 'scheduled', scheduledTime: new Date(resumeAt).toISOString() });
    await updateEmailDoc(emailId, { status: 'scheduled', scheduledTime: new Date(resumeAt).toISOString() });
    console.warn(`[Worker] ${email.senderEmail} hit ${limit}/hr. ${emailId} moved to ${new Date(resumeAt).toISOString()}`);

    await notifyRateLimitHit({
      userId,
      senderEmail: email.senderEmail,
      hourlyLimit: limit,
      currentCount: limit,
      campaignContext: campaignSubject,
      nextEligibleWindow: new Date(nextWindowStart()).toISOString(),
    });

    await job.moveToDelayed(resumeAt, token);
    throw new DelayedError();
  }

  try {
    const result = await sendEmail({
      fromName: email.senderName || sender?.name || 'ReachInbox Outreach',
      fromEmail: email.senderEmail,
      toEmail: email.recipientEmail,
      subject: email.subject,
      textBody: email.body,
      smtpConfig: sender?.smtpConfig,
      messageId: `<${emailId}@reachinbox.local>`, // stable id: same email => same Message-ID
    });
    if (!result.success) throw new Error(result.error || 'SMTP delivery failed');

    const sentTime = new Date().toISOString();
    await db.updateEmail(emailId, { status: 'sent', sentTime, etherealPreviewUrl: result.etherealPreviewUrl });
    await updateEmailDoc(emailId, { status: 'sent', sentTime });
    await db.incrementHourlyCount(1);
    await db.bumpCampaign(email.campaignId, { sent: 1 });
    console.log(`[Worker] ✓ ${email.recipientEmail} via ${email.senderEmail}. Preview: ${result.etherealPreviewUrl || 'N/A'}`);
    return { sent: true };
  } catch (err: any) {
    await releaseSlot(redisConnection, email.senderEmail); // a failed send must not burn quota
    // attemptsMade is 0-based for the attempt in flight; only the LAST attempt is a real failure.
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? MAX_ATTEMPTS);
    if (finalAttempt) {
      const sentTime = new Date().toISOString();
      await db.updateEmail(emailId, { status: 'failed', sentTime, error: err.message || 'Worker error' });
      await updateEmailDoc(emailId, { status: 'failed', sentTime });
      await db.bumpCampaign(email.campaignId, { failed: 1 });
    } else {
      // back to scheduled so the retry can claim it again
      await db.updateEmail(emailId, { status: 'scheduled', error: err.message || 'Worker error' });
    }
    throw err; // BullMQ applies exponential backoff
  }
}

let worker: Worker | null = null;

export async function startWorker(): Promise<void> {
  if (worker) return;
  const settings = await db.getSettings().catch(() => null);
  // env wins; the Settings UI value is the fallback
  const concurrency = process.env.WORKER_CONCURRENCY ? config.workerConcurrency : settings?.workerConcurrency ?? config.workerConcurrency;

  worker = new Worker(QUEUE_NAME, processor, {
    connection: redisConnection,
    concurrency,
    // Minimum gap between ANY two sends, shared across every worker on this queue.
    limiter: { max: 1, duration: config.minDelayBetweenSendsMs },
  });
  worker.on('failed', (job, err) => console.error(`[BullMQ] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`));
  worker.on('error', (err) => console.error('[BullMQ] Worker error:', err.message));
  console.log(`[Worker] started: concurrency=${concurrency}, min gap=${config.minDelayBetweenSendsMs}ms, cap=${config.maxEmailsPerHourPerSender}/hr/sender`);
}

/**
 * One-time startup recovery (NOT cron). Jobs normally survive restarts in Redis (AOF on), but this heals
 * the gaps: Redis flushed, the API crashed between the DB insert and the enqueue, or a worker died mid-send.
 * jobId === emailId makes it idempotent: anything that already has a job is left alone.
 */
export async function reconcileQueue(): Promise<{ reset: number; pending: number; requeued: number }> {
  const reset = await db.resetStuckProcessing();
  const pending = await db.getPendingForReconcile();
  let requeued = 0;
  for (const row of pending) {
    if (!(await emailBullQueue.getJob(row.id))) {
      await upsertJob(row.id, row.scheduledTime);
      requeued++;
    }
  }
  console.log(`[Reconcile] reset=${reset} pending=${pending.length} requeued=${requeued}`);
  return { reset, pending: pending.length, requeued };
}

/**
 * Add or re-time the job for an email. jobId === emailId, so a second add can't create a duplicate.
 * Finished jobs are removed first (BullMQ otherwise ignores the add and a retry silently does nothing).
 */
async function upsertJob(emailId: string, runAt: Date, opts: { retime?: boolean } = {}): Promise<void> {
  const delay = Math.max(0, runAt.getTime() - Date.now());
  const existing = await emailBullQueue.getJob(emailId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'completed' || state === 'failed') await existing.remove();
    else if (state === 'delayed' && opts.retime) {
      await existing.changeDelay(delay);
      return;
    } else return; // waiting / active / delayed: leave it
  }
  await emailBullQueue.add('send-email', { emailId }, { delay, jobId: emailId });
}

export const emailQueue = {
  async addEmailJob(emailId: string, scheduledTime: Date): Promise<void> {
    await upsertJob(emailId, scheduledTime);
  },

  async retryEmail(id: string): Promise<boolean> {
    const email = await db.getEmailById(id);
    if (!email || email.status === 'sent' || email.status === 'processing') return false;
    await db.updateEmail(id, { status: 'scheduled', scheduledTime: new Date().toISOString(), error: undefined });
    await upsertJob(id, new Date(), { retime: true });
    return true;
  },

  async sendNow(id: string): Promise<boolean> {
    const email = await db.getEmailById(id);
    if (!email || email.status === 'sent' || email.status === 'processing') return false;
    await db.updateEmail(id, { status: 'scheduled', scheduledTime: new Date().toISOString(), delaySeconds: 0 });
    await upsertJob(id, new Date(), { retime: true });
    return true;
  },

  async getQueueHealth(): Promise<QueueHealthStats> {
    const [waiting, delayed, active, completed, failed] = await Promise.all([
      emailBullQueue.getWaitingCount(),
      emailBullQueue.getDelayedCount(),
      emailBullQueue.getActiveCount(),
      emailBullQueue.getCompletedCount(),
      emailBullQueue.getFailedCount(),
    ]);
    const settings = await db.getSettings();
    const hourlyCount = await db.getHourlyCount();
    const rateLimitPaused = hourlyCount >= settings.maxEmailsPerHour;
    return {
      waiting,
      delayed,
      active,
      completed,
      failed,
      concurrency: worker?.opts.concurrency ?? config.workerConcurrency,
      rateLimitPaused,
      nextEligibleSendTime: rateLimitPaused ? new Date(nextWindowStart()).toISOString() : undefined,
    };
  },

  /** Apply a new concurrency from the Settings UI without a restart (env var, if set, still wins). */
  applyConcurrency(n: number): void {
    if (worker && !process.env.WORKER_CONCURRENCY && n > 0) worker.concurrency = n;
  },

  async stopWorker(): Promise<void> {
    await worker?.close();
    worker = null;
  },
};
