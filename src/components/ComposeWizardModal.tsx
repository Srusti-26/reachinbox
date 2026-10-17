import React, { useState, useRef } from 'react';
import {
  X,
  Check,
  ChevronLeft,
  ArrowRight,
  UploadCloud,
  Calendar,
  Send,
  Bold,
  Italic,
  Underline,
  Link2,
  List,
  ListOrdered,
  Eye,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { SenderAccount } from '../types.js';

interface RecipientItem {
  email: string;
  name?: string;
}

interface ComposeWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  senders: SenderAccount[];
  onCampaignCreated: () => void;
}

export const ComposeWizardModal: React.FC<ComposeWizardModalProps> = ({
  isOpen,
  onClose,
  senders,
  onCampaignCreated,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Hi there,\n\nI hope you\'re doing well!\n\nBest regards,\nReachInbox Team');

  // Step 2
  const [recipients, setRecipients] = useState<RecipientItem[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [invalidCount, setInvalidCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3
  const [scheduleMode, setScheduleMode] = useState<'immediate' | 'custom'>('custom');
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState(tomorrow.toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [delayValue, setDelayValue] = useState(30);
  const [delayUnit, setDelayUnit] = useState<'seconds' | 'minutes'>('seconds');
  const [hourlyLimit, setHourlyLimit] = useState(1000);
  const [selectedSenderEmail, setSelectedSenderEmail] = useState(senders[0]?.email || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const insertFormatting = (prefix: string, suffix = '') =>
    setBody((prev) => `${prev}${prefix}${suffix}`);

  const parseEmails = (text: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    const valid: RecipientItem[] = [];
    let invalids = 0, dups = 0;
    for (const token of text.split(/[,\n;\s]+/).map(t => t.trim()).filter(Boolean)) {
      if (!emailRegex.test(token)) { invalids++; continue; }
      const lower = token.toLowerCase();
      if (seen.has(lower)) { dups++; continue; }
      seen.add(lower);
      valid.push({ email: lower });
    }
    setRecipients(valid);
    setInvalidCount(invalids);
    setDuplicateCount(dups);
  };

  const processCSV = (text: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    const valid: RecipientItem[] = [];
    let invalids = 0, dups = 0;
    let isFirstRow = true;
    for (const rawLine of text.split(/\r?\n/)) {
      const parts = rawLine.trim().split(',').map(p => p.replace(/["']/g, '').trim());
      if (!parts.some(Boolean)) continue;
      if (isFirstRow) {
        isFirstRow = false;
        if (!parts.some(p => emailRegex.test(p.toLowerCase()))) continue;
      }
      const emailCol = parts.find(p => emailRegex.test(p.toLowerCase()));
      if (!emailCol) { invalids++; continue; }
      const email = emailCol.toLowerCase();
      const name = parts.find(p => p && !emailRegex.test(p.toLowerCase())) || '';
      if (seen.has(email)) { dups++; continue; }
      seen.add(email);
      valid.push({ email, name });
    }
    if (valid.length === 0) { setErrorMsg('No valid emails found in file.'); return; }
    setRecipients(valid);
    setManualInput(valid.map(r => r.email).join('\n'));
    setInvalidCount(invalids);
    setDuplicateCount(dups);
    setErrorMsg(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => processCSV(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleScheduleSubmit = async () => {
    if (!subject.trim()) { setErrorMsg('Please enter a subject.'); setStep(1); return; }
    if (!body.trim()) { setErrorMsg('Please enter an email body.'); setStep(1); return; }
    if (recipients.length === 0) { setErrorMsg('Please add at least one recipient.'); setStep(2); return; }

    setIsSubmitting(true);
    setErrorMsg(null);

    const delaySeconds = delayUnit === 'minutes' ? delayValue * 60 : delayValue;
    const startDateTime = scheduleMode === 'immediate'
      ? new Date(Date.now() - 5000)
      : new Date(`${startDate}T${startTime}:00`);

    try {
      const res = await fetch('/api/v1/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject, body, recipients,
          startTime: startDateTime.toISOString(),
          delaySeconds, hourlyLimit,
          senderEmail: selectedSenderEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule campaign');
      onCampaignCreated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error scheduling emails');
    } finally {
      setIsSubmitting(false);
    }
  };

  const scheduledLabel = scheduleMode === 'custom'
    ? new Date(`${startDate}T${startTime}:00`).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Immediately';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 sm:px-8 py-4 sm:py-5 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Compose New Email</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Steps */}
        <div className="shrink-0 flex items-center justify-center gap-3 sm:gap-6 py-4 px-6 sm:px-8 bg-slate-50/60 border-b border-slate-100 text-xs sm:text-sm font-medium">
          {[['Compose', 1], ['Recipients', 2], ['Schedule', 3]].map(([label, n]) => (
            <React.Fragment key={n}>
              {Number(n) > 1 && <div className="w-8 sm:w-16 h-0.5 bg-slate-200" />}
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step > Number(n) ? 'bg-emerald-500 text-white'
                  : step === Number(n) ? 'bg-[#5125F5] text-white'
                  : 'bg-slate-200 text-slate-600'
                }`}>
                  {step > Number(n) ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : n}
                </div>
                <span className={step >= Number(n) ? 'font-semibold text-slate-900' : 'text-slate-400'}>{label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Error bar */}
        {errorMsg && (
          <div className="shrink-0 mx-6 sm:mx-8 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">

          {/* STEP 1: COMPOSE */}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Subject <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Let's collaborate!"
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] transition-all"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Email Body <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setBody((prev) => `${prev} {{name}}`)}
                      className="px-2 py-0.5 text-[11px] font-semibold text-[#5125F5] bg-[#F0EEFF] hover:bg-[#5125F5]/15 rounded-md transition-colors"
                    >
                      + Insert Name
                    </button>
                  </div>
                  <div className="flex items-center gap-1 p-2 bg-slate-50 border border-b-0 border-slate-200 rounded-t-xl text-slate-600">
                    {[
                      [() => insertFormatting('**', '**'), <Bold className="w-4 h-4" />, 'Bold'],
                      [() => insertFormatting('*', '*'), <Italic className="w-4 h-4" />, 'Italic'],
                      [() => insertFormatting('_', '_'), <Underline className="w-4 h-4" />, 'Underline'],
                    ].map(([fn, icon, title]: any) => (
                      <button key={title} type="button" onClick={fn} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors" title={title}>{icon}</button>
                    ))}
                    <div className="w-px h-4 bg-slate-300 mx-1" />
                    <button type="button" onClick={() => insertFormatting('[', '](https://)')} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"><Link2 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => insertFormatting('\n1. ')} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"><ListOrdered className="w-4 h-4" /></button>
                    <button type="button" onClick={() => insertFormatting('\n• ')} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"><List className="w-4 h-4" /></button>
                  </div>
                  <textarea
                    rows={8}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full p-4 text-sm bg-white border border-slate-200 rounded-b-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] transition-all font-sans resize-none leading-relaxed"
                  />
                </div>
              </div>

              <div className="lg:col-span-5 bg-slate-50/80 rounded-2xl border border-slate-200/80 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 pb-3 border-b border-slate-200">
                    <Eye className="w-4 h-4 text-[#5125F5]" />
                    <span>Live Preview</span>
                  </div>
                  <div className="bg-white rounded-xl p-5 border border-slate-200/60 shadow-xs min-h-[220px]">
                    <h4 className="font-bold text-slate-900 text-sm mb-3">{subject || 'No subject'}</h4>
                    <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {body.replace(/\{\{name\}\}/gi, 'John Doe')}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-400">
                  <code className="text-[#5125F5] font-mono">{'{{name}}'}</code> is replaced with each recipient's name.
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: RECIPIENTS */}
          {step === 2 && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  To — Recipient Emails <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={6}
                  value={manualInput}
                  onChange={(e) => { setManualInput(e.target.value); parseEmails(e.target.value); }}
                  placeholder={`Type or paste email addresses:\n\nfriend@gmail.com\ncolleague@company.com, boss@work.com`}
                  className="w-full p-4 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] font-mono resize-none leading-relaxed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Separate by comma, space, or new line. Duplicates removed automatically.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">OR upload a CSV</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault(); setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) { const r = new FileReader(); r.onload = (ev) => processCSV(ev.target?.result as string); r.readAsText(file); }
                }}
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                  isDragging ? 'border-[#5125F5] bg-[#F0EEFF]/50' : 'border-slate-200 hover:border-[#5125F5]/60 bg-slate-50/50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv,.txt" className="hidden" />
                <UploadCloud className="w-7 h-7 text-[#5125F5] mb-2" />
                <p className="text-xs font-semibold text-slate-700">Drag & drop CSV or <span className="text-[#5125F5]">browse</span></p>
                <p className="text-[11px] text-slate-400 mt-1">One email per row, or email,name format</p>
              </div>

              {recipients.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="text-xs text-emerald-800">
                    <span className="font-bold">{recipients.length} valid recipient{recipients.length !== 1 ? 's' : ''}</span>
                    {duplicateCount > 0 && ` · ${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} removed`}
                    {invalidCount > 0 && ` · ${invalidCount} invalid skipped`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: SCHEDULE */}
          {step === 3 && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  When to Send <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('immediate')}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${
                      scheduleMode === 'immediate'
                        ? 'bg-[#5125F5] text-white border-[#5125F5] shadow-md shadow-[#5125F5]/25'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ⚡ Send Immediately
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('custom')}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${
                      scheduleMode === 'custom'
                        ? 'bg-[#5125F5] text-white border-[#5125F5] shadow-md shadow-[#5125F5]/25'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Calendar className="w-4 h-4" /> Schedule for Later
                  </button>
                </div>

                {scheduleMode === 'immediate' ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="font-medium">Emails will dispatch immediately upon confirmation.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Date</label>
                        <input
                          type="date"
                          value={startDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Time</label>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                        />
                      </div>
                    </div>
                    <div className="p-3 bg-[#F0EEFF] border border-[#5125F5]/20 rounded-xl text-xs text-[#5125F5] font-medium">
                      📅 Will send on: {scheduledLabel}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Delay Between Emails
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    value={delayValue}
                    onChange={(e) => setDelayValue(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                  />
                  <select
                    value={delayUnit}
                    onChange={(e) => setDelayUnit(e.target.value as any)}
                    className="px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                  >
                    <option value="seconds">seconds</option>
                    <option value="minutes">minutes</option>
                  </select>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Gap between each email in the campaign.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Sender Account
                </label>
                {senders.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    No sender configured yet — one will be auto-provisioned when you submit.
                  </div>
                ) : (
                  <select
                    value={selectedSenderEmail}
                    onChange={(e) => setSelectedSenderEmail(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                  >
                    {senders.map((s) => (
                      <option key={s.id} value={s.email}>
                        {s.name} ({s.email}) — {s.smtpConfig?.host ? `[SMTP: ${s.smtpConfig.host}]` : '[Sandbox]'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="p-5 bg-[#F0EEFF] border border-[#5125F5]/20 rounded-2xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#5125F5] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#5125F5]/20">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#101A33]">
                    {recipients.length} email{recipients.length !== 1 ? 's' : ''} → {scheduledLabel}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    BullMQ will hold the jobs in Redis until the scheduled time.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/70">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as any)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !subject.trim()) { setErrorMsg('Please enter a subject.'); return; }
                  if (step === 2 && recipients.length === 0) { setErrorMsg('Please add at least one recipient.'); return; }
                  setErrorMsg(null);
                  setStep((step + 1) as any);
                }}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-md shadow-[#5125F5]/25 transition-all"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleScheduleSubmit}
                className="flex items-center gap-2 px-7 py-2.5 text-sm font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-md shadow-[#5125F5]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Scheduling...</>
                ) : (
                  <><Calendar className="w-4 h-4" /> Schedule Emails</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
