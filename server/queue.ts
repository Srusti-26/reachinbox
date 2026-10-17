import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { db } from './db.js';
import { sendEmail } from './mailer.js';
import { sendSlackRateLimitAlert } from './slack.js';
import { QueueHealthStats } from '../src/types.js';

const QUEUE_NAME = 'email-dispatch';

// Redis connection — shared across Queue, Worker, QueueEvents
export const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

// The BullMQ Queue — used to add delayed jobs
export const emailBullQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// Track senders alerted this hour to avoid duplicate Slack pings
const alertedSendersThisHour = new Set<string>();

// Reset alert set when hour rolls over
let lastAlertHour = new Date().getUTCHours();
function resetAlertsIfNewHour() {
  const currentHour = new Date().getUTCHours();
  if (currentHour !== lastAlertHour) {
    alertedSendersThisHour.clear();
    lastAlertHour = currentHour;
  }
}

// BullMQ Worker — processes email jobs from Redis queue
const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    resetAlertsIfNewHour();

    const { emailId } = job.data as { emailId: string };
    const email = await db.getEmailById(emailId);

    if (!email) {
      console.warn(`[Worker] Email ${emailId} not found in DB, skipping.`);
      return;
    }

    // Idempotency: skip if already sent or cancelled
    if (email.status === 'sent' || email.status === 'cancelled') {
      console.log(`[Worker] Email ${emailId} already ${email.status}, skipping.`);
      return;
    }

    const senders = await db.getSenders();
    const sender = senders.find((s) => s.email === email.senderEmail) || senders[0];
    const settings = await db.getSettings();

    // Per-sender hourly rate limit check using Redis counter
    const hourKey = getHourKey();
    const redisRateLimitKey = `rate:${email.senderEmail}:${hourKey}`;
    const senderHourlyLimit = sender?.hourlyLimit || settings.maxEmailsPerHour;

    const currentCount = await redisConnection.incr(redisRateLimitKey);
    // Set TTL of 2 hours on first increment so keys auto-expire
    if (currentCount === 1) {
      await redisConnection.expire(redisRateLimitKey, 7200);
    }

    if (currentCount > senderHourlyLimit) {
      // Decrement back since we won't send
      await redisConnection.decr(redisRateLimitKey);

      // Reschedule to next hour boundary
      const nextHour = getNextHourBoundary();
      const delayMs = nextHour.getTime() - Date.now();

      console.warn(
        `[Worker] Rate limit hit for ${email.senderEmail} (${senderHourlyLimit}/hr). Rescheduling ${emailId} to ${nextHour.toISOString()}`
      );

      await db.updateEmail(emailId, {
        scheduledTime: nextHour.toISOString(),
        status: 'scheduled',
      });

      // Re-add to BullMQ with delay to next hour
      await emailBullQueue.add(
        'send-email',
        { emailId },
        {
          delay: delayMs,
          jobId: `${emailId}_retry_${nextHour.getTime()}`,
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 200 },
        }
      );

      // Fire Slack alert once per sender per hour
      if (!alertedSendersThisHour.has(email.senderEmail)) {
        alertedSendersThisHour.add(email.senderEmail);
        sendSlackRateLimitAlert({
          senderEmail: email.senderEmail,
          hourlyLimit: senderHourlyLimit,
          currentCount: senderHourlyLimit,
          campaignContext: email.subject,
          nextEligibleWindow: nextHour.toLocaleTimeString(),
        }).catch((e) => console.error('[Worker] Slack alert error:', e));
      }

      return;
    }

    // Mark as processing (idempotency guard)
    await db.updateEmail(emailId, { status: 'processing' });

    try {
      const result = await sendEmail({
        fromName: email.senderName || sender?.name || 'ReachInbox Outreach',
        fromEmail: email.senderEmail,
        toEmail: email.recipientEmail,
        subject: email.subject,
        textBody: email.body,
        smtpConfig: sender?.smtpConfig,
      });

      const nowIso = new Date().toISOString();

      if (result.success) {
        await db.updateEmail(emailId, {
          status: 'sent',
          sentTime: nowIso,
          etherealPreviewUrl: result.etherealPreviewUrl,
          error: undefined,
        });

        // Sync DB hourly counter
        await db.incrementHourlyCount(1);

        if (email.campaignId) {
          const campaigns = await db.getCampaigns();
          const campaign = campaigns.find((c) => c.id === email.campaignId);
          if (campaign) {
            await db.updateCampaign(campaign.id, {
              sentCount: campaign.sentCount + 1,
              scheduledCount: Math.max(0, campaign.scheduledCount - 1),
            });
          }
        }

        console.log(
          `[Worker] ✓ Sent to ${email.recipientEmail}. Preview: ${result.etherealPreviewUrl || 'N/A'}`
        );
      } else {
        await db.updateEmail(emailId, {
          status: 'failed',
          sentTime: nowIso,
          error: result.error || 'Delivery failed',
        });

        if (email.campaignId) {
          const campaigns = await db.getCampaigns();
          const campaign = campaigns.find((c) => c.id === email.campaignId);
          if (campaign) {
            await db.updateCampaign(campaign.id, {
              failedCount: campaign.failedCount + 1,
              scheduledCount: Math.max(0, campaign.scheduledCount - 1),
            });
          }
        }

        console.warn(`[Worker] ✗ Failed for ${email.recipientEmail}: ${result.error}`);
        // Throw so BullMQ retries with backoff
        throw new Error(result.error || 'SMTP delivery failed');
      }
    } catch (err: any) {
      await db.updateEmail(emailId, {
        status: 'failed',
        sentTime: new Date().toISOString(),
        error: err.message || 'Worker error',
      });
      throw err; // Let BullMQ handle retries
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // overridden dynamically below
    limiter: {
      max: 10,
      duration: 1000, // max 10 jobs/sec across all workers
    },
  }
);

worker.on('completed', (job) => {
  console.log(`[BullMQ] Job ${job.id} completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`[BullMQ] Job ${job?.id} failed: ${err.message}`);
});

// Helper: Redis-safe hourly key
function getHourKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}:${now.getUTCHours()}`;
}

function getNextHourBoundary(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 5);
}

// Public API used by server.ts routes
export const emailQueue = {
  /**
   * Add a delayed email job to BullMQ. Uses deterministic jobId for idempotency.
   */
  async addEmailJob(emailId: string, scheduledTime: Date): Promise<void> {
    const delayMs = Math.max(0, scheduledTime.getTime() - Date.now());
    await emailBullQueue.add(
      'send-email',
      { emailId },
      {
        delay: delayMs,
        jobId: emailId, // deterministic — prevents duplicate jobs on restart
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );
  },

  async retryEmail(id: string): Promise<boolean> {
    const email = await db.getEmailById(id);
    if (!email) return false;
    await db.updateEmail(id, {
      status: 'scheduled',
      scheduledTime: new Date().toISOString(),
      error: undefined,
    });
    await this.addEmailJob(id, new Date());
    return true;
  },

  async sendNow(id: string): Promise<boolean> {
    const email = await db.getEmailById(id);
    if (!email || email.status === 'sent') return false;
    await db.updateEmail(id, {
      status: 'scheduled',
      scheduledTime: new Date(Date.now() - 1000).toISOString(),
      delaySeconds: 0,
    });
    await this.addEmailJob(id, new Date(Date.now() - 1000));
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

    const nextHour = getNextHourBoundary();

    return {
      waiting,
      delayed,
      active,
      completed,
      failed,
      concurrency: settings.workerConcurrency,
      rateLimitPaused,
      nextEligibleSendTime: rateLimitPaused ? nextHour.toISOString() : undefined,
    };
  },

  stopWorker(): void {
    worker.close().catch(console.error);
  },

  triggerTick(): void {
    // No-op: BullMQ handles this automatically via Redis
  },
};
