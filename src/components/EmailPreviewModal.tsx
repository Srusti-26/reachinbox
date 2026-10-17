import React from 'react';
import { X, ExternalLink, Calendar, Mail, User, ShieldAlert, CheckCircle2, Zap } from 'lucide-react';
import { ScheduledEmailItem } from '../types.js';

interface EmailPreviewModalProps {
  email: ScheduledEmailItem | null;
  onClose: () => void;
  onSendNow?: (id: string) => void;
}

export const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({ email, onClose, onSendNow }) => {
  if (!email) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed & Pinned */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#F0EEFF] text-[#5125F5] flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">Email Details</h3>
              <p className="text-[11px] text-slate-500 font-mono">ID: {email.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Details & Body - Smoothly Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
            <div>
              <span className="text-slate-400 block mb-0.5">Recipient:</span>
              <span className="font-semibold text-slate-800 font-mono break-all">{email.recipientEmail}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Sender:</span>
              <span className="font-semibold text-slate-800 font-mono break-all">{email.senderEmail}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Scheduled Time:</span>
              <span className="font-medium text-slate-700 font-mono">
                {new Date(email.scheduledTime).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Status:</span>
              <span className="inline-flex items-center gap-1 font-semibold capitalize text-slate-800">
                {email.status === 'sent' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                {email.status === 'failed' && <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />}
                {email.status}
              </span>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Subject
            </label>
            <div className="text-sm font-bold text-slate-900 bg-white p-3 rounded-xl border border-slate-200">
              {email.subject}
            </div>
          </div>

          {/* Body */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Message Content
            </label>
            <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed bg-white p-4 rounded-xl border border-slate-200 max-h-56 overflow-y-auto">
              {email.body}
            </div>
          </div>

          {/* Error Message if Failed */}
          {email.error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <span className="font-bold">Failure reason: </span>
              {email.error}
            </div>
          )}
        </div>

        {/* Footer - Fixed & Pinned */}
        <div className="shrink-0 px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div>
            {email.etherealPreviewUrl && (
              <a
                href={email.etherealPreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#5125F5] hover:bg-[#5125F5]/10 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Ethereal Webmail</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(email.status === 'scheduled' || email.status === 'queued') && onSendNow && (
              <button
                onClick={() => {
                  onSendNow(email.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-md shadow-[#5125F5]/25 transition-all cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Send Now</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
