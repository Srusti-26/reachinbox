import { PrismaClient } from '@prisma/client';
import { ScheduledEmailItem, Campaign, SenderAccount, SlackConfig, UserProfile } from '../src/types.js';

const prisma = new PrismaClient();

export { prisma };

// ─── Type helpers ────────────────────────────────────────────────────────────

function mapEmail(e: any): ScheduledEmailItem {
  return {
    id: e.id,
    campaignId: e.campaignId,
    recipientEmail: e.recipientEmail,
    recipientName: e.recipientName ?? undefined,
    subject: e.subject,
    body: e.body,
    scheduledTime: e.scheduledTime.toISOString(),
    sentTime: e.sentTime?.toISOString(),
    status: e.status as ScheduledEmailItem['status'],
    senderEmail: e.senderEmail,
    senderName: e.senderName,
    etherealPreviewUrl: e.etherealPreviewUrl ?? undefined,
    error: e.error ?? undefined,
    jobId: e.jobId ?? undefined,
    delaySeconds: e.delaySeconds,
  };
}

function mapCampaign(c: any): Campaign {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    subject: c.subject,
    body: c.body,
    totalRecipients: c.totalRecipients,
    scheduledCount: c.scheduledCount,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    startTime: c.startTime.toISOString(),
    delayBetweenEmailsSeconds: c.delayBetweenEmailsSeconds,
    hourlyLimit: c.hourlyLimit,
    senderEmail: c.senderEmail,
    createdAt: c.createdAt.toISOString(),
    status: c.status as Campaign['status'],
  };
}

function mapSender(s: any): SenderAccount {
  return {
    id: s.id,
    email: s.email,
    name: s.name,
    isDefault: s.isDefault,
    type: s.type as SenderAccount['type'],
    hourlyLimit: s.hourlyLimit,
    emailsSentCurrentHour: s.emailsSentCurrentHour,
    isLiveDelivery: s.isLiveDelivery ?? false,
    smtpConfig: s.smtpConfig ? JSON.parse(s.smtpConfig) : undefined,
  };
}

function mapSlack(s: any): SlackConfig {
  return {
    connected: s.connected,
    webhookUrl: s.webhookUrl ?? undefined,
    channelName: s.channelName ?? undefined,
    teamName: s.teamName ?? undefined,
    notifyOnRateLimit: s.notifyOnRateLimit,
    notifyOnFailure: s.notifyOnFailure,
    notifyOnCampaignComplete: s.notifyOnCampaignComplete,
    lastNotifiedAt: s.lastNotifiedAt?.toISOString(),
  };
}

// ─── Settings (stored in a simple Redis-backed or DB approach) ────────────────
// We store settings in a dedicated table. For simplicity we use a single row keyed by userId.

interface AppSettings {
  workerConcurrency: number;
  minDelayBetweenEmailsSeconds: number;
  maxEmailsPerHour: number;
}

// ─── Database class ───────────────────────────────────────────────────────────

class Database {
  // ── User ──────────────────────────────────────────────────────────────────

  async getUser(userId?: string): Promise<UserProfile> {
    const user = await prisma.user.findFirst({
      where: userId ? { id: userId } : undefined,
      orderBy: { createdAt: 'asc' },
    });
    if (!user) {
      // Return a default profile if no user exists yet (pre-OAuth)
      return {
        id: 'guest',
        name: 'Guest',
        email: '',
        role: 'User',
        createdAt: new Date().toISOString(),
      };
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? undefined,
      role: 'Campaign Lead',
      createdAt: user.createdAt.toISOString(),
    };
  }

  async upsertUser(data: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }): Promise<UserProfile> {
    const user = await prisma.user.upsert({
      where: { googleId: data.googleId },
      update: { name: data.name, avatarUrl: data.avatarUrl, email: data.email },
      create: {
        googleId: data.googleId,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
      },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? undefined,
      role: 'Campaign Lead',
      createdAt: user.createdAt.toISOString(),
    };
  }

  // ── Emails ────────────────────────────────────────────────────────────────

  async getEmails(): Promise<ScheduledEmailItem[]> {
    const rows = await prisma.scheduledEmail.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapEmail);
  }

  async getEmailById(id: string): Promise<ScheduledEmailItem | undefined> {
    const row = await prisma.scheduledEmail.findUnique({ where: { id } });
    return row ? mapEmail(row) : undefined;
  }

  async addEmails(emails: ScheduledEmailItem[]): Promise<void> {
    await prisma.scheduledEmail.createMany({
      data: emails.map((e) => ({
        id: e.id,
        campaignId: e.campaignId,
        recipientEmail: e.recipientEmail,
        recipientName: e.recipientName,
        subject: e.subject,
        body: e.body,
        scheduledTime: new Date(e.scheduledTime),
        sentTime: e.sentTime ? new Date(e.sentTime) : undefined,
        status: e.status,
        senderEmail: e.senderEmail,
        senderName: e.senderName,
        etherealPreviewUrl: e.etherealPreviewUrl,
        error: e.error,
        jobId: e.jobId,
        delaySeconds: e.delaySeconds,
        idempotencyKey: e.id, // use email id as idempotency key
      })),
      skipDuplicates: true,
    });
  }

  async updateEmail(id: string, partial: Partial<ScheduledEmailItem>): Promise<ScheduledEmailItem | null> {
    try {
      const row = await prisma.scheduledEmail.update({
        where: { id },
        data: {
          ...(partial.status !== undefined && { status: partial.status }),
          ...(partial.sentTime !== undefined && { sentTime: new Date(partial.sentTime) }),
          ...(partial.scheduledTime !== undefined && { scheduledTime: new Date(partial.scheduledTime) }),
          ...(partial.etherealPreviewUrl !== undefined && { etherealPreviewUrl: partial.etherealPreviewUrl }),
          ...(partial.error !== undefined && { error: partial.error }),
          ...(partial.delaySeconds !== undefined && { delaySeconds: partial.delaySeconds }),
        },
      });
      return mapEmail(row);
    } catch {
      return null;
    }
  }

  async cancelEmail(id: string): Promise<boolean> {
    const email = await this.getEmailById(id);
    if (!email || email.status === 'sent') return false;
    await this.updateEmail(id, { status: 'cancelled' });
    return true;
  }

  // ── Campaigns ─────────────────────────────────────────────────────────────

  async getCampaigns(userId?: string): Promise<Campaign[]> {
    const rows = await prisma.campaign.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapCampaign);
  }

  async addCampaign(campaign: Campaign): Promise<void> {
    await prisma.campaign.create({
      data: {
        id: campaign.id,
        userId: campaign.userId,
        name: campaign.name,
        subject: campaign.subject,
        body: campaign.body,
        totalRecipients: campaign.totalRecipients,
        scheduledCount: campaign.scheduledCount,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount,
        startTime: new Date(campaign.startTime),
        delayBetweenEmailsSeconds: campaign.delayBetweenEmailsSeconds,
        hourlyLimit: campaign.hourlyLimit,
        senderEmail: campaign.senderEmail,
        status: campaign.status,
      },
    });
  }

  async updateCampaign(id: string, partial: Partial<Campaign>): Promise<Campaign | null> {
    try {
      const row = await prisma.campaign.update({
        where: { id },
        data: {
          ...(partial.sentCount !== undefined && { sentCount: partial.sentCount }),
          ...(partial.failedCount !== undefined && { failedCount: partial.failedCount }),
          ...(partial.scheduledCount !== undefined && { scheduledCount: partial.scheduledCount }),
          ...(partial.status !== undefined && { status: partial.status }),
        },
      });
      return mapCampaign(row);
    } catch {
      return null;
    }
  }

  // ── Senders ───────────────────────────────────────────────────────────────

  async getSenders(userId?: string): Promise<SenderAccount[]> {
    const rows = await prisma.senderAccount.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapSender);
  }

  async addSender(sender: SenderAccount & { userId: string }): Promise<SenderAccount> {
    const row = await prisma.senderAccount.create({
      data: {
        id: sender.id,
        userId: sender.userId,
        email: sender.email,
        name: sender.name,
        isDefault: sender.isDefault,
        type: sender.type,
        hourlyLimit: sender.hourlyLimit,
        emailsSentCurrentHour: sender.emailsSentCurrentHour,
        isLiveDelivery: sender.isLiveDelivery ?? false,
        smtpConfig: sender.smtpConfig ? JSON.stringify(sender.smtpConfig) : undefined,
      },
    });
    return mapSender(row);
  }

  async updateSender(id: string, partial: Partial<SenderAccount>): Promise<SenderAccount | null> {
    try {
      const row = await prisma.senderAccount.update({
        where: { id },
        data: {
          ...(partial.name !== undefined && { name: partial.name }),
          ...(partial.email !== undefined && { email: partial.email }),
          ...(partial.isDefault !== undefined && { isDefault: partial.isDefault }),
          ...(partial.type !== undefined && { type: partial.type }),
          ...(partial.hourlyLimit !== undefined && { hourlyLimit: partial.hourlyLimit }),
          ...(partial.emailsSentCurrentHour !== undefined && { emailsSentCurrentHour: partial.emailsSentCurrentHour }),
          ...(partial.isLiveDelivery !== undefined && { isLiveDelivery: partial.isLiveDelivery }),
          ...(partial.smtpConfig !== undefined && { smtpConfig: JSON.stringify(partial.smtpConfig) }),
        },
      });
      return mapSender(row);
    } catch {
      return null;
    }
  }

  async deleteSender(id: string): Promise<boolean> {
    try {
      await prisma.senderAccount.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // ── Slack ─────────────────────────────────────────────────────────────────

  async getSlackConfig(userId?: string): Promise<SlackConfig> {
    const row = await prisma.slackIntegration.findFirst({
      where: userId ? { userId } : undefined,
    });
    if (!row) {
      return {
        connected: false,
        channelName: '#email-alerts',
        notifyOnRateLimit: true,
        notifyOnFailure: true,
        notifyOnCampaignComplete: true,
      };
    }
    return mapSlack(row);
  }

  async updateSlackConfig(partial: Partial<SlackConfig> & { userId?: string }): Promise<SlackConfig> {
    const userId = partial.userId || (await this.getFirstUserId());
    if (!userId) return this.getSlackConfig();

    const row = await prisma.slackIntegration.upsert({
      where: { userId },
      update: {
        ...(partial.connected !== undefined && { connected: partial.connected }),
        ...(partial.webhookUrl !== undefined && { webhookUrl: partial.webhookUrl }),
        ...(partial.channelName !== undefined && { channelName: partial.channelName }),
        ...(partial.teamName !== undefined && { teamName: partial.teamName }),
        ...(partial.notifyOnRateLimit !== undefined && { notifyOnRateLimit: partial.notifyOnRateLimit }),
        ...(partial.notifyOnFailure !== undefined && { notifyOnFailure: partial.notifyOnFailure }),
        ...(partial.notifyOnCampaignComplete !== undefined && { notifyOnCampaignComplete: partial.notifyOnCampaignComplete }),
        ...(partial.lastNotifiedAt !== undefined && { lastNotifiedAt: new Date(partial.lastNotifiedAt) }),
      },
      create: {
        userId,
        connected: partial.connected ?? false,
        webhookUrl: partial.webhookUrl,
        channelName: partial.channelName ?? '#email-alerts',
        teamName: partial.teamName,
        notifyOnRateLimit: partial.notifyOnRateLimit ?? true,
        notifyOnFailure: partial.notifyOnFailure ?? true,
        notifyOnCampaignComplete: partial.notifyOnCampaignComplete ?? true,
      },
    });
    return mapSlack(row);
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async getSettings(): Promise<AppSettings> {
    const row = await prisma.appSettings.findFirst();
    return {
      workerConcurrency: row?.workerConcurrency ?? 5,
      minDelayBetweenEmailsSeconds: row?.minDelayBetweenEmailsSeconds ?? 30,
      maxEmailsPerHour: row?.maxEmailsPerHour ?? (Number(process.env.MAX_EMAILS_PER_HOUR) || 1000),
    };
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const existing = await prisma.appSettings.findFirst();
    if (existing) {
      const row = await prisma.appSettings.update({
        where: { id: existing.id },
        data: {
          ...(partial.workerConcurrency !== undefined && { workerConcurrency: partial.workerConcurrency }),
          ...(partial.minDelayBetweenEmailsSeconds !== undefined && { minDelayBetweenEmailsSeconds: partial.minDelayBetweenEmailsSeconds }),
          ...(partial.maxEmailsPerHour !== undefined && { maxEmailsPerHour: partial.maxEmailsPerHour }),
        },
      });
      return {
        workerConcurrency: row.workerConcurrency,
        minDelayBetweenEmailsSeconds: row.minDelayBetweenEmailsSeconds,
        maxEmailsPerHour: row.maxEmailsPerHour,
      };
    } else {
      const row = await prisma.appSettings.create({
        data: {
          workerConcurrency: partial.workerConcurrency ?? 5,
          minDelayBetweenEmailsSeconds: partial.minDelayBetweenEmailsSeconds ?? 30,
          maxEmailsPerHour: partial.maxEmailsPerHour ?? 1000,
        },
      });
      return {
        workerConcurrency: row.workerConcurrency,
        minDelayBetweenEmailsSeconds: row.minDelayBetweenEmailsSeconds,
        maxEmailsPerHour: row.maxEmailsPerHour,
      };
    }
  }

  // ── Hourly rate limit (Redis-backed in queue.ts, DB-backed here for stats) ─

  async incrementHourlyCount(amount: number = 1): Promise<number> {
    const hourKey = this.getCurrentHourKey();
    const row = await prisma.hourlyRateLimit.upsert({
      where: { senderEmail_hourKey: { senderEmail: 'global', hourKey } },
      update: { count: { increment: amount } },
      create: { senderEmail: 'global', hourKey, count: amount },
    });
    return row.count;
  }

  async getHourlyCount(): Promise<number> {
    const hourKey = this.getCurrentHourKey();
    const row = await prisma.hourlyRateLimit.findUnique({
      where: { senderEmail_hourKey: { senderEmail: 'global', hourKey } },
    });
    return row?.count ?? 0;
  }

  private getCurrentHourKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}:${now.getUTCHours()}`;
  }

  private async getFirstUserId(): Promise<string | null> {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    return user?.id ?? null;
  }
}

export const db = new Database();
