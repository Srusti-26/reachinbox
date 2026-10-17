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

  if (hasRealSmtp) {
    try {
      await db.addSender({
        id: `snd_${crypto.randomUUID()}`,
        userId,
        email: smtpUser!,
        name: 'ReachInbox Outreach',
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
      console.log(`[Senders] ✓ Gmail SMTP sender seeded: ${smtpUser}`);
      return db.getSenders(userId);
    } catch (err: any) {
      console.error('[Senders] Gmail seed failed:', err.message);
    }
  }

  // Fallback: try live Ethereal API first, then use a guaranteed local sandbox sender
  try {
    const created = await provisionEtherealSenders(userId, 1);
    if (created.length > 0) {
      console.log(`[Senders] ✓ Provisioned Ethereal sender: ${created[0].email}`);
      return created;
    }
  } catch (err: any) {
    console.warn('[Senders] Ethereal API unavailable, using local sandbox sender:', err.message);
  }

  // Guaranteed fallback: seed a local sandbox sender that uses the shared mailer transporter
  // (no external API call needed — nodemailer handles the transport lazily)
  const sandboxEmail = `sandbox-${userId.slice(0, 8)}@reachinbox.local`;
  await db.addSender({
    id: `snd_${crypto.randomUUID()}`,
    userId,
    email: sandboxEmail,
    name: 'ReachInbox Sandbox',
    isDefault: true,
    type: 'ethereal',
    hourlyLimit: config.maxEmailsPerHourPerSender,
    emailsSentCurrentHour: 0,
    isLiveDelivery: false,
    smtpConfig: undefined,
  });
  console.log(`[Senders] ✓ Local sandbox sender seeded: ${sandboxEmail}`);
  return db.getSenders(userId);
}
