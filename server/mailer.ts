import nodemailer, { type Transporter } from 'nodemailer';
import { SmtpConfig, EmailAttachment } from '../src/types.js';

let defaultTransporter: Transporter | null = null;
let etherealUser: string | null = null;
let etherealSharedTransporter: Transporter | null = null;
const cachedTransporters: Map<string, Transporter> = new Map();

/**
 * Creates or retrieves a Nodemailer transporter for custom real-world SMTP configurations.
 */
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

  // Check if custom SMTP is configured in environment variables
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    defaultTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('[Mailer] Using environment SMTP server:', process.env.SMTP_HOST);
    return defaultTransporter;
  }

  // Otherwise generate an official Ethereal test account
  try {
    const testAccount = await nodemailer.createTestAccount();
    etherealUser = testAccount.user;
    defaultTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('[Mailer] Ethereal test mailer ready. User:', etherealUser);
  } catch (err) {
    console.warn('[Mailer] Could not create Ethereal test account, using json transport fallback:', err);
    defaultTransporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return defaultTransporter;
}

const REAL_DELIVERY_DOMAINS = ['gmail.com', 'nmit.ac.in', 'outboxlabs.in', 'reachinbox.in', 'outlook.com', 'hotmail.com', 'yahoo.com'];

export function isRealDeliveryEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && REAL_DELIVERY_DOMAINS.includes(domain);
}

async function getEtherealSharedTransporter(): Promise<Transporter> {
  if (etherealSharedTransporter) return etherealSharedTransporter;
  const testAccount = await nodemailer.createTestAccount();
  etherealSharedTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  console.log('[Mailer] Ethereal shared transporter ready:', testAccount.user);
  return etherealSharedTransporter;
}

export interface SendEmailOptions {
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  smtpConfig?: SmtpConfig;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  etherealPreviewUrl?: string;
  isRealDelivery?: boolean;
  error?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  try {
    let transport: Transporter;
    let isRealDelivery = false;

    if (opts.smtpConfig && opts.smtpConfig.host && opts.smtpConfig.user) {
      transport = getCustomTransporter(opts.smtpConfig);
      isRealDelivery = true;
    } else if (isRealDeliveryEmail(opts.toEmail) && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transport = await getTransporter();
      isRealDelivery = true;
    } else {
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
      subject: opts.subject,
      text: opts.textBody,
      html: formattedHtml,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
        contentType: a.contentType,
      })),
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
