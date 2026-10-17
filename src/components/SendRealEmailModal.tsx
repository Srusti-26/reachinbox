import React, { useState } from 'react';
import {
  X,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Mail,
  Zap,
  Globe,
  Settings,
} from 'lucide-react';
import { SenderAccount } from '../types.js';

interface SendRealEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  senders: SenderAccount[];
  defaultRecipient: string;
  onEmailSent: () => void;
  onOpenSettings: () => void;
}

export const SendRealEmailModal: React.FC<SendRealEmailModalProps> = ({
  isOpen,
  onClose,
  senders,
  defaultRecipient,
  onEmailSent,
  onOpenSettings,
}) => {
  const [toEmail, setToEmail] = useState(defaultRecipient || '');
  const [selectedSenderEmail, setSelectedSenderEmail] = useState(
    senders.find((s) => s.isDefault)?.email || senders[0]?.email || ''
  );
  const [subject, setSubject] = useState('ReachInbox: Live Delivery Verification');
  const [body, setBody] = useState(
    `Hi there,\n\nThis is a real-world test email sent directly from your ReachInbox dashboard!\n\nIf you are seeing this in your inbox, your email delivery pipeline, SMTP handshake, and queue workers are fully operational.\n\nSent at: ${new Date().toLocaleString()}\n\nBest regards,\nReachInbox Engine`
  );

  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message?: string;
    isRealDelivery?: boolean;
    previewUrl?: string;
  } | null>(null);

  if (!isOpen) return null;

  const currentSender = senders.find((s) => s.email === selectedSenderEmail) || senders[0];
  const isRealSmtp = !!currentSender?.smtpConfig?.host;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/v1/send-real-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail,
          subject,
          body,
          senderEmail: currentSender?.email,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResult({
          success: true,
          message: data.isRealDelivery
            ? `Real email dispatched to ${toEmail}! Check your inbox (or spam folder).`
            : `Delivered via Ethereal sandbox (preview link generated below). To send to your actual inbox, connect your Gmail or SMTP in Settings.`,
          isRealDelivery: data.isRealDelivery,
          previewUrl: data.etherealPreviewUrl,
        });
        onEmailSent();
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to dispatch email.',
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || 'Network error occurred.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[88vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#5125F5] to-[#7B57F8] text-white flex items-center justify-center shadow-md shadow-[#5125F5]/25">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Send Real-World Test Email
              </h3>
              <p className="text-[11px] text-slate-500">
                Dispatch an immediate live email to any recipient inbox
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Sender mode indicator */}
          <div className="px-6 pt-4">
            <div
              className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                isRealSmtp
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-purple-50 border-purple-200 text-purple-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe className={`w-4 h-4 ${isRealSmtp ? 'text-emerald-600' : 'text-[#5125F5]'}`} />
                <div>
                  <span className="font-semibold block">
                    {isRealSmtp
                      ? `Live Real SMTP (${currentSender.smtpConfig?.host})`
                      : 'Sandbox Test Mailer (Ethereal)'}
                  </span>
                  <span className="text-[11px] opacity-80">
                    {isRealSmtp
                      ? 'Delivers directly across the internet to real inboxes'
                      : 'Generates instant click-to-view preview links'}
                  </span>
                </div>
              </div>
              {!isRealSmtp && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#5125F5] bg-white rounded-lg shadow-xs hover:bg-purple-100 transition-colors shrink-0"
                >
                  + Connect Real SMTP
                </button>
              )}
            </div>
          </div>

        {/* Form */}
        <form onSubmit={handleSend} className="p-6 space-y-4">
          {/* Recipient */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Recipient Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
            />
          </div>

          {/* Sender mailbox selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              From Mailbox
            </label>
            <select
              value={selectedSenderEmail}
              onChange={(e) => setSelectedSenderEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.email}>
                  {s.name} ({s.email}) — {s.smtpConfig?.host ? 'Real SMTP' : 'Sandbox'}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Subject Line
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Message Content
            </label>
            <textarea
              rows={4}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] resize-none leading-relaxed"
            />
          </div>

          {/* Result Alert */}
          {result && (
            <div
              className={`p-3.5 rounded-xl text-xs flex flex-col gap-2 ${
                result.success
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {result.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="font-medium">{result.message}</span>
              </div>

              {result.previewUrl && (
                <a
                  href={result.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#5125F5] font-semibold hover:underline mt-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Ethereal Delivered Message Preview</span>
                </a>
              )}
            </div>
          )}

          {/* Action button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSending}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-md shadow-[#5125F5]/25 transition-all disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Delivering Email...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Real Email Now</span>
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};
