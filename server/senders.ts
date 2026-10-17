import nodemailer from 'nodemailer';
import { db } from './db.js';
import { config } from './config.js';
import type { SenderAccount } from '../src/types.js';

export async function provisionEtherealSenders(userId: string, count = 3): Promise<SenderAccount[]> {
  const created: SenderAccount[] = [];
  const existing = await db.getSenders(userId);
  for (let i = 0; i < count; i++) {
    const acct = await nodemailer.createTestAccount();
    const sender = await db.addSender({
      id: `snd_${crypto.randomUUID()}`,
      userId,
      email: acct.user,
      name: `Ethereal Sender ${existing.length + i + 1}`,
      isDefault: existing.length + i === 0,
      type: 'ethereal',
      hourlyLimit: config.maxEmailsPerHourPerSender,
      emailsSentCurrentHour: 0,
      isLiveDelivery: false,
      smtpConfig: {
        host: acct.smtp.host,
        port: acct.smtp.port,
        secure: acct.smtp.secure,
        user: acct.user,
        pass: acct.pass,
        fromEmail: acct.user,
        fromName: 'ReachInbox Outreach',
      },
    });
    created.push(sender);
  }
  return created;
}

export async function ensureSenders(userId: string): Promise<SenderAccount[]> {
  const existing = await db.getSenders(userId);
  if (existing.length > 0) return existing;

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const hasRealSmtp = !!(smtpUser && smtpPass && !smtpPass.includes('REPLACE') && smtpPass.length > 4);

  // 1. Seed Gmail SMTP sender if credentials are available
  if (hasRealSmtp) {
    try {
      await db.addSender({
        id: `snd_${crypto.randomUUID()}`,
        userId,
        email: smtpUser!,
        name: 'ReachInbox Outreach (Gmail)',
        isDefault: true,
        type: 'smtp',
        hourlyLimit: config.maxEmailsPerHourPerSender,
        emailsSentCurrentHour: 0,
        isLiveDelivery: true,
        smtpConfig: {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          user: smtpUser!,
          pass: smtpPass!,
          fromEmail: smtpUser!,
          fromName: 'ReachInbox Outreach',
        },
      });
      console.log(`[Senders] Gmail SMTP sender seeded: ${smtpUser}`);
    } catch (err: any) {
      console.error('[Senders] Gmail seed failed:', err.message);
    }
  }

  // 2. Always seed 2 Ethereal sandbox senders for testing
  try {
    const ethereal = await provisionEtherealSenders(userId, 2);
    console.log(`[Senders] Ethereal senders seeded: ${ethereal.map(s => s.email).join(', ')}`);
  } catch (err: any) {
    console.warn('[Senders] Ethereal provisioning failed, using local sandbox:', err.message);
    const sandboxEmail = `sandbox-${userId.slice(0, 8)}@reachinbox.local`;
    await db.addSender({
      id: `snd_${crypto.randomUUID()}`,
      userId,
      email: sandboxEmail,
      name: 'ReachInbox Sandbox',
      isDefault: !hasRealSmtp,
      type: 'ethereal',
      hourlyLimit: config.maxEmailsPerHourPerSender,
      emailsSentCurrentHour: 0,
      isLiveDelivery: false,
      smtpConfig: undefined,
    });
  }

  return db.getSenders(userId);
}
