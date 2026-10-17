import { db } from './db.js';

interface SlackAlertOptions {
  senderEmail: string;
  hourlyLimit: number;
  currentCount: number;
  campaignContext?: string;
  nextEligibleWindow?: string;
}

export async function sendSlackRateLimitAlert(
  opts: SlackAlertOptions
): Promise<{ success: boolean; message?: string }> {
  const slackConfig = await db.getSlackConfig();

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
      await db.updateSlackConfig({ lastNotifiedAt: new Date().toISOString() });
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
