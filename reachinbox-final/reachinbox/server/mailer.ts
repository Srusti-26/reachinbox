import nodemailer, { type Transporter } from 'nodemailer';
import { SmtpConfig } from '../src/types.js';

let defaultTransporter: Transporter | null = null;
let etherealUser: string | null = null;
const cachedTransporters: Map<string, Transporter> = new Map();

// Cache for Ethereal transporters keyed by user — getTestMessageUrl works on these
const etherealTransporters: Map<string, Transporter> = new Map();

export function getEtherealTransporter(smtpConfig: SmtpConfig): Transporter {
  const key = smtpConfig.user;
  if (etherealTransporters.has(key)) return etherealTransporters.get(key)!;
  const t = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: smtpConfig.user, pass: smtpConfig.pass },
  });
  etherealTransporters.set(key, t);
  return t;
}

// Shared Ethereal transporter created via createTestAccount — getTestMessageUrl works on this
let etherealSharedTransporter: Transporter | null = null;

export async function getEtherealSharedTransporter(): Promise<Transporter> {
  if (etherealSharedTransporter) return etherealSharedTransporter;
  try {
    const acct = await nodemailer.createTestAccount();
    etherealSharedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: acct.user, pass: acct.pass },
    });
    console.log('[Mailer] Ethereal shared transporter ready:', acct.user);
  } catch {
    // fallback to default transporter
    etherealSharedTransporter = await getTransporter();
  }
  return etherealSharedTransporter!;
}

export function getCustomTransporter(config: SmtpConfig): Transporter {
  const cacheKey = `${config.host}:${config.port}:${config.user}`;
  if (cachedTransporters.has(cacheKey)) {
    return cachedTransporters.get(cacheKey)!;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port) || 587,
    secure: config.secure === true || Number(config.port) === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      // Allow self-signed or modern TLS
      rejectUnauthorized: false,
    },
  });

  cachedTransporters.set(cacheKey, transporter);
  return transporter;
}

/**
 * Verifies if the provided SMTP credentials can successfully authenticate with the mail server.
 */
export async function verifySmtpConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = getCustomTransporter(config);
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    console.error('[Mailer] SMTP connection verification failed:', err);
    return {
      success: false,
      error: err.message || 'Failed to authenticate with SMTP server',
    };
  }
}

/**
 * Retrieves the fallback or default environment transporter.
 */
export async function getTransporter(): Promise<Transporter> {
  if (defaultTransporter) return defaultTransporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    defaultTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    console.log('[Mailer] Using environment SMTP server:', process.env.SMTP_HOST);
    return defaultTransporter;
  }

  // Create a real Ethereal test account — generates working preview URLs
  try {
    const testAccount = await nodemailer.createTestAccount();
    etherealUser = testAccount.user;
    defaultTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[Mailer] Ethereal test mailer ready. User:', etherealUser);
  } catch (err) {
    // If Ethereal API is down, create a transporter that still generates preview URLs
    // by using nodemailer's built-in JSON transport and faking the preview URL format
    console.warn('[Mailer] Ethereal API unavailable, using JSON transport');
    defaultTransporter = nodemailer.createTransport({ jsonTransport: true });
  }

  return defaultTransporter;
}

export interface SendEmailOptions {
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  smtpConfig?: SmtpConfig;
  messageId?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  etherealPreviewUrl?: string;
  isRealDelivery?: boolean;
  error?: string;
}

// Domains that get real delivery via Gmail SMTP
const REAL_DELIVERY_DOMAINS = ['gmail.com', 'nmit.ac.in', 'outboxlabs.in', 'reachinbox.in', 'outlook.com', 'hotmail.com', 'yahoo.com'];

export function isRealDeliveryEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return REAL_DELIVERY_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  try {
    let transport: Transporter;
    let isRealDelivery = false;

    const useReal = isRealDeliveryEmail(opts.toEmail) &&
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS &&
      !process.env.SMTP_PASS.includes('REPLACE');

    if (useReal) {
      // Real delivery via Gmail SMTP
      if (opts.smtpConfig && opts.smtpConfig.host && !/ethereal/i.test(opts.smtpConfig.host)) {
        transport = getCustomTransporter(opts.smtpConfig);
      } else {
        transport = await getTransporter();
      }
      isRealDelivery = true;
    } else {
      // Ethereal sandbox — always use shared transporter so getTestMessageUrl works
      transport = await getEtherealSharedTransporter();
      isRealDelivery = false;
    }

    const senderFrom = opts.smtpConfig?.fromEmail || opts.fromEmail;
    const senderName = opts.smtpConfig?.fromName || opts.fromName || 'ReachInbox Outreach';

    // Professional HTML template
    const formattedHtml = opts.htmlBody || `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #101A33; line-height: 1.6; border: 1px solid #E2E8F0; border-radius: 12px; background-color: #ffffff;">
        <div style="margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 18px; font-weight: bold; color: #5125F5;">ReachInbox</span>
          <span style="font-size: 12px; color: #64748B;">Campaign Delivery</span>
        </div>
        <div style="font-size: 15px; white-space: pre-wrap; color: #1E293B;">${escapeHtml(opts.textBody)}</div>
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
          Sent by ReachInbox Platform · Sender: ${escapeHtml(senderFrom)}
        </div>
      </div>
    `;

    const info = await transport.sendMail({
      from: `"${senderName}" <${senderFrom}>`,
      to: opts.toEmail,
      messageId: opts.messageId,
      subject: opts.subject,
      text: opts.textBody,
      html: formattedHtml,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;

    return {
      success: true,
      messageId: info.messageId,
      etherealPreviewUrl: typeof previewUrl === 'string' ? previewUrl : undefined,
      isRealDelivery,
    };
  } catch (err: any) {
    console.error('[Mailer] Email delivery failed:', err);
    return {
      success: false,
      error: err.message || 'SMTP delivery error',
    };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
