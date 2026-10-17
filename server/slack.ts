import { db } from './db.js';
import { redisConnection } from './redis.js';
import { claimRateLimitAlert } from './rateLimit.js';

interface SlackAlertOptions {
  userId: string;
  senderEmail: string;
  hourlyLimit: number;
  currentCount: number;
  campaignContext?: string;
  nextEligibleWindow?: string;
}

export async function sendSlackRateLimitAlert(
  opts: SlackAlertOptions
): Promise<{ success: boolean; message?: string }> {
  // Looked up per user at call time: connecting later works without a redeploy, and tenants never see each other's alerts.
  const slackConfig = await db.getSlackConfig(opts.userId);

  if (!slackConfig.connected || !slackConfig.webhookUrl) {
    console.log('[Slack] Rate limit alert skipped: Slack not connected.');
    return { success: false, message: 'Slack not connected' };
  }

  const payload = {
    text: `⚠️ Rate Limit: Sender ${opts.senderEmail} reached ${opts.hourlyLimit} emails/hour quota!`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🚨 ReachInbox Hourly Rate Limit Reached', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Sender Account:*\n\`${opts.senderEmail}\`` },
          { type: 'mrkdwn', text: `*Hourly Quota:*\n${opts.currentCount} / ${opts.hourlyLimit} emails` },
          { type: 'mrkdwn', text: `*Campaign:*\n${opts.campaignContext || 'Active scheduled queue'}` },
          { type: 'mrkdwn', text: `*Next Eligible Window:*\n${opts.nextEligibleWindow || 'Next hour boundary'}` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 *Action Taken:* BullMQ delayed queue has paused dispatch and rescheduled jobs to the next hour window.',
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(slackConfig.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await db.updateSlackConfig({ userId: opts.userId, lastNotifiedAt: new Date().toISOString() });
      console.log('[Slack] Rate limit notification sent to', slackConfig.channelName);
      return { success: true };
    }
    const errText = await res.text();
    return { success: false, message: `Webhook error: ${res.status} ${errText}` };
  } catch (err: any) {
    console.error('[Slack] Failed to send notification:', err);
    return { success: false, message: err.message };
  }
}

export async function sendSlackTestMessage(
  webhookUrl: string
): Promise<{ success: boolean; message?: string }> {
  const payload = {
    text: '🔔 Test notification from ReachInbox email scheduling platform.',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ *ReachInbox Slack Integration Verified*\nYour webhook is working. You will receive alerts when hourly sending quotas are reached.',
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Timestamp: ${new Date().toISOString()} · ReachInbox Engine` }],
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { success: true };
    const errText = await res.text();
    return { success: false, message: `Slack returned ${res.status}: ${errText}` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}


/**
 * Called by the worker when a sender hits its hourly cap. Never throws.
 * - Slack not connected  -> skip silently (and don't burn the once-per-window claim, so connecting later works).
 * - Connected            -> one live message per (user, sender, hour window) across all workers (Redis SET NX).
 * - Slack call fails     -> release the claim so the next rate-limited job retries the alert.
 */
export async function notifyRateLimitHit(opts: SlackAlertOptions): Promise<void> {
  try {
    const cfg = await db.getSlackConfig(opts.userId);
    if (!cfg.connected || !cfg.webhookUrl || !cfg.notifyOnRateLimit) return;
    if (!(await claimRateLimitAlert(redisConnection, opts.userId, opts.senderEmail))) return;
    const r = await sendSlackRateLimitAlert(opts);
    if (!r.success) {
      const { hourWindow } = await import('./rateLimit.js');
      await redisConnection.del(`rl:alert:${opts.userId}:${opts.senderEmail}:${hourWindow()}`);
    }
  } catch (err: any) {
    console.error('[Slack] notifyRateLimitHit failed (non-fatal):', err.message);
  }
}
