export type EmailStatus = 'scheduled' | 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
}

export interface ScheduledEmailItem {
  id: string;
  campaignId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
  scheduledTime: string; // ISO string
  sentTime?: string;     // ISO string
  status: EmailStatus;
  senderEmail: string;
  senderName: string;
  etherealPreviewUrl?: string;
  error?: string;
  jobId?: string;
  delaySeconds: number;
  attachments?: EmailAttachment[];
}

export interface Campaign {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  totalRecipients: number;
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
  startTime: string;
  delayBetweenEmailsSeconds: number;
  hourlyLimit: number;
  senderEmail: string;
  createdAt: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  attachments?: EmailAttachment[]; // stored once per campaign, loaded by the worker at send time
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64
  contentType: string;
  size: number;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

export interface SenderAccount {
  id: string;
  email: string;
  name: string;
  isDefault: boolean;
  type: 'ethereal' | 'smtp' | 'google';
  hourlyLimit: number;
  emailsSentCurrentHour: number;
  isLiveDelivery?: boolean;
  smtpConfig?: SmtpConfig;
}

export interface CampaignStats {
  scheduledEmails: number;
  sentEmails: number;
  failedEmails: number;
  openRatePercent: number;
  openRateDelta: number;
  hourlySentCount: number;
  hourlyLimit: number;
}

export interface SlackConfig {
  connected: boolean;
  webhookUrl?: string;
  channelName?: string;
  teamName?: string;
  notifyOnRateLimit: boolean;
  notifyOnFailure: boolean;
  notifyOnCampaignComplete: boolean;
  lastNotifiedAt?: string;
}

export interface QueueHealthStats {
  waiting: number;
  delayed: number;
  active: number;
  completed: number;
  failed: number;
  concurrency: number;
  rateLimitPaused: boolean;
  nextEligibleSendTime?: string;
}
