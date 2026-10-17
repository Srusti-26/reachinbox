import React, { useState, useRef } from 'react';
import {
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  UploadCloud,
  FileText,
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
  FileSpreadsheet,
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

  // Step 1: Compose fields
  const [subject, setSubject] = useState("Let's Build Something Great Together");
  const [body, setBody] = useState(
    `Hi there,\n\nI hope you're doing well! I came across your work and really impressed with what you're building. I'd love to explore potential collaboration opportunities.\n\nBest regards,\nSrusti`
  );
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // Step 2: Leads fields
  const [recipients, setRecipients] = useState<RecipientItem[]>([
    { email: 'john.doe@company.com', name: 'John Doe' },
    { email: 'sarah@techcorp.com', name: 'Sarah Jenkins' },
    { email: 'mike@startup.io', name: 'Mike Zhang' },
    { email: 'emily@designco.com', name: 'Emily Clark' },
    { email: 'david@innovate.com', name: 'David Ross' },
  ]);
  const [uploadedFileName, setUploadedFileName] = useState<string>('leads.csv');
  const [uploadedFileSize, setUploadedFileSize] = useState<string>('2.4 KB');
  const [invalidCount, setInvalidCount] = useState<number>(0);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Schedule fields
  const [scheduleMode, setScheduleMode] = useState<'immediate' | 'custom'>('immediate');
  const [startDate, setStartDate] = useState(
    new Date(Date.now() + 10 * 60 * 1000).toISOString().split('T')[0]
  );
  const [startTime, setStartTime] = useState('10:00');
  const [delayValue, setDelayValue] = useState<number>(3);
  const [delayUnit, setDelayUnit] = useState<'seconds' | 'minutes'>('seconds');
  const [hourlyLimit, setHourlyLimit] = useState<number>(1000);
  const [selectedSenderEmail, setSelectedSenderEmail] = useState<string>(
    senders[0]?.email || 'srusti@reachinbox.ai'
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Formatting helpers for Step 1
  const insertFormatting = (prefix: string, suffix: string = '') => {
    setBody((prev) => `${prev}${prefix}${suffix}`);
  };

  const insertVariable = (token: string) => {
    setBody((prev) => `${prev} {{${token}}}`);
  };

  // CSV parsing helper for Step 2
  const processUploadedContent = (text: string, filename: string, sizeBytes: number) => {
    const lines = text.split(/\r?\n/);
    const validEmails: RecipientItem[] = [];
    const seen = new Set<string>();
    let duplicates = 0;
    let invalids = 0;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Handle simple CSV (email, name) or single email per line
      const parts = line.split(',');
      let extractedEmail = parts[0]?.replace(/["']/g, '').trim();
      let extractedName = parts[1]?.replace(/["']/g, '').trim() || '';

      // Skip header row if "email"
      if (extractedEmail.toLowerCase() === 'email') continue;

      if (!emailRegex.test(extractedEmail)) {
        invalids++;
        continue;
      }

      const lowerEmail = extractedEmail.toLowerCase();
      if (seen.has(lowerEmail)) {
        duplicates++;
        continue;
      }

      seen.add(lowerEmail);
      validEmails.push({
        email: lowerEmail,
        name: extractedName,
      });
    }

    if (validEmails.length === 0) {
      setErrorMsg('No valid email addresses found in the uploaded file.');
      return;
    }

    setRecipients(validEmails);
    setUploadedFileName(filename);
    setUploadedFileSize(`${(sizeBytes / 1024).toFixed(1)} KB`);
    setInvalidCount(invalids);
    setDuplicateCount(duplicates);
    setErrorMsg(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setErrorMsg('Please upload a valid .csv or .txt file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processUploadedContent(text, file.name, file.size);
    };
    reader.readAsText(file);
  };

  const loadReferenceSampleLeads = (count: number) => {
    const sampleLeads: RecipientItem[] = [];
    const names = [
      'John Doe', 'Sarah Jenkins', 'Mike Zhang', 'Emily Clark', 'David Ross',
      'Clara Oswald', 'Harish Kumar', 'Lisa Wong', 'Alex Miller', 'Anna Taylor',
      'Tom Hollander', 'Rebecca Thorne', 'James Wilson', 'Elena Rostova', 'Lucas Scott'
    ];
    for (let i = 1; i <= count; i++) {
      const name = names[(i - 1) % names.length];
      const domain = ['company.com', 'techcorp.com', 'startup.io', 'designco.com', 'innovate.com'][i % 5];
      const email = `${name.toLowerCase().replace(' ', '.')}${i > 15 ? i : ''}@${domain}`;
      sampleLeads.push({ email, name });
    }
    setRecipients(sampleLeads);
    setUploadedFileName('leads.csv');
    setUploadedFileSize('2.4 KB');
    setInvalidCount(0);
    setDuplicateCount(0);
    setErrorMsg(null);
  };

  // Submit and schedule via backend API
  const handleScheduleSubmit = async () => {
    if (!subject.trim()) {
      setErrorMsg('Please enter an email subject.');
      setStep(1);
      return;
    }
    if (!body.trim()) {
      setErrorMsg('Please enter an email body.');
      setStep(1);
      return;
    }
    if (recipients.length === 0) {
      setErrorMsg('Please upload or load at least one valid recipient.');
      setStep(2);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const calculatedDelay = delayUnit === 'minutes' ? delayValue * 60 : delayValue;
    const startDateTime = scheduleMode === 'immediate'
      ? new Date(Date.now() - 5000)
      : new Date(`${startDate}T${startTime}:00`);

    try {
      const res = await fetch('/api/v1/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          recipients,
          startTime: startDateTime.toISOString(),
          delaySeconds: calculatedDelay,
          hourlyLimit,
          senderEmail: selectedSenderEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule campaign');
      }

      onCampaignCreated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error scheduling emails');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header - Pinned */}
        <div className="shrink-0 flex items-center justify-between px-6 sm:px-8 py-4 sm:py-5 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Compose New Email
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* 3-Step Wizard Breadcrumbs matching reference image - Pinned */}
        <div className="shrink-0 flex items-center justify-center gap-3 sm:gap-6 py-4 px-6 sm:px-8 bg-slate-50/60 border-b border-slate-100 text-xs sm:text-sm font-medium">
          {/* Step 1 */}
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step > 1
                  ? 'bg-emerald-500 text-white'
                  : step === 1
                  ? 'bg-[#5125F5] text-white shadow-xs'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {step > 1 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '1'}
            </div>
            <span className={step >= 1 ? 'font-semibold text-slate-900' : 'text-slate-400'}>
              Compose
            </span>
          </div>

          <div className="w-8 sm:w-16 h-0.5 bg-slate-200" />

          {/* Step 2 */}
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step > 2
                  ? 'bg-emerald-500 text-white'
                  : step === 2
                  ? 'bg-[#5125F5] text-white shadow-xs'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {step > 2 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '2'}
            </div>
            <span className={step >= 2 ? 'font-semibold text-slate-900' : 'text-slate-400'}>
              Upload Leads
            </span>
          </div>

          <div className="w-8 sm:w-16 h-0.5 bg-slate-200" />

          {/* Step 3 */}
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step === 3 ? 'bg-[#5125F5] text-white shadow-xs' : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </div>
            <span className={step === 3 ? 'font-semibold text-slate-900' : 'text-slate-400'}>
              Schedule
            </span>
          </div>
        </div>

        {/* Error notification bar if present */}
        {errorMsg && (
          <div className="shrink-0 mx-6 sm:mx-8 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step Body Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          {/* STEP 1: COMPOSE */}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Form Fields */}
              <div className="lg:col-span-7 space-y-5">
                {/* Subject Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Subject <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Let's Build Something Great Together"
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] transition-all"
                  />
                </div>

                {/* Email Body & Rich Toolbar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Email Body <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => insertVariable('name')}
                        className="px-2 py-0.5 text-[11px] font-semibold text-[#5125F5] bg-[#F0EEFF] hover:bg-[#5125F5]/15 rounded-md transition-colors"
                      >
                        + Insert Name
                      </button>
                    </div>
                  </div>

                  {/* Formatting Toolbar matching reference */}
                  <div className="flex items-center gap-1 p-2 bg-slate-50 border border-b-0 border-slate-200 rounded-t-xl text-slate-600">
                    <button
                      type="button"
                      onClick={() => insertFormatting('**', '**')}
                      className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Bold"
                    >
                      <Bold className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('*', '*')}
                      className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Italic"
                    >
                      <Italic className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('_', '_')}
                      className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Underline"
                    >
                      <Underline className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-slate-300 mx-1" />
                    <button
                      type="button"
                      onClick={() => insertFormatting('[', '](https://)')}
                      className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Link"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('\n1. ')}
                      className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Numbered List"
                    >
                      <ListOrdered className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('\n• ')}
                      className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Bullet List"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Textarea */}
                  <textarea
                    rows={8}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full p-4 text-sm bg-white border border-slate-200 rounded-b-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] transition-all font-sans resize-none leading-relaxed"
                  />
                </div>

                {/* Save as template */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="saveAsTemplate"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="w-4 h-4 rounded text-[#5125F5] focus:ring-[#5125F5] border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="saveAsTemplate" className="text-xs text-slate-600 cursor-pointer">
                    Save as template
                  </label>
                </div>
              </div>

              {/* Right Column: Live Email Preview matching reference */}
              <div className="lg:col-span-5 bg-slate-50/80 rounded-2xl border border-slate-200/80 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 pb-3 border-b border-slate-200">
                    <Eye className="w-4 h-4 text-[#5125F5]" />
                    <span>Live Preview</span>
                  </div>

                  <div className="bg-white rounded-xl p-5 border border-slate-200/60 shadow-xs min-h-[220px]">
                    <h4 className="font-bold text-slate-900 text-sm mb-3">
                      {subject || 'No subject'}
                    </h4>
                    <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {body.replace(/\{\{name\}\}/gi, 'John Doe')}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-400">
                  Tokens like <code className="text-[#5125F5] font-mono">{'{{name}}'}</code> are dynamically replaced with recipient details.
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: UPLOAD LEADS */}
          {step === 2 && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Drag and Drop Zone matching reference */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      processUploadedContent(event.target?.result as string, file.name, file.size);
                    };
                    reader.readAsText(file);
                  }
                }}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-3xl transition-all cursor-pointer ${
                  isDragging
                    ? 'border-[#5125F5] bg-[#F0EEFF]/50'
                    : 'border-slate-200 hover:border-[#5125F5]/60 bg-slate-50/50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv,.txt"
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-2xl bg-[#F0EEFF] text-[#5125F5] flex items-center justify-center mb-4">
                  <UploadCloud className="w-8 h-8" />
                </div>

                <p className="text-sm font-semibold text-slate-800 text-center mb-1">
                  Drag and drop your CSV or text file here
                </p>
                <p className="text-xs text-slate-500 mb-4">or</p>

                <button
                  type="button"
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#5125F5] rounded-xl hover:bg-[#431dd6] shadow-sm transition-colors"
                >
                  Choose File
                </button>

                <p className="text-[11px] text-slate-400 mt-4">
                  Supports .csv, .txt (up to 5MB)
                </p>
              </div>

              {/* Uploaded File Badge matching reference */}
              {recipients.length > 0 && (
                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {uploadedFileName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {uploadedFileSize} • {recipients.length} email addresses
                      </div>
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
              )}

              {/* Success Notification Card matching reference */}
              {recipients.length > 0 && (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">
                      {recipients.length} email addresses found
                    </h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      We've successfully parsed {recipients.length} valid email addresses from your file.
                      {duplicateCount > 0 && ` (${duplicateCount} duplicates removed)`}
                    </p>
                  </div>
                </div>
              )}

              {/* Sample leads helper buttons */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-400">Quick Test Actions:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadReferenceSampleLeads(5)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Load 5 Sample Leads
                  </button>
                  <button
                    type="button"
                    onClick={() => loadReferenceSampleLeads(120)}
                    className="px-3 py-1.5 text-xs font-medium text-[#5125F5] bg-[#F0EEFF] hover:bg-[#5125F5]/20 rounded-lg transition-colors"
                  >
                    Load 120 Leads (from reference)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SCHEDULE SETTINGS */}
          {step === 3 && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Delivery Timing Options: Immediate vs Scheduled */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Delivery Mode & Timing <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleMode('immediate');
                      setDelayValue(3);
                    }}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      scheduleMode === 'immediate'
                        ? 'bg-[#5125F5] text-white border-[#5125F5] shadow-md shadow-[#5125F5]/25'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>⚡ Send Immediately</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('custom')}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      scheduleMode === 'custom'
                        ? 'bg-[#5125F5] text-white border-[#5125F5] shadow-md shadow-[#5125F5]/25'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Schedule for Later</span>
                  </button>
                </div>

                {scheduleMode === 'immediate' ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="font-medium">
                      Emails will begin dispatching into the BullMQ delivery pipeline immediately upon confirmation.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                    />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                    />
                  </div>
                )}
              </div>

              {/* Delay Between Emails */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Delay Between Emails <span className="text-rose-500">*</span>
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
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Minimum time gap between each email send.
                </p>
              </div>

              {/* Hourly Limit */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Hourly Limit <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Math.max(1, Number(e.target.value)))}
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Maximum number of emails to send per hour.
                </p>
              </div>

              {/* Sender Account */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Sender Account & Mailbox
                </label>
                <select
                  value={selectedSenderEmail}
                  onChange={(e) => setSelectedSenderEmail(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
                >
                  {senders.map((s) => (
                    <option key={s.id} value={s.email}>
                      {s.name} ({s.email}) — {s.smtpConfig?.host ? `[Real SMTP: ${s.smtpConfig.host}]` : '[Ethereal Sandbox]'}
                    </option>
                  ))}
                </select>

                {/* Delivery Mode Badge */}
                {(() => {
                  const s = senders.find(item => item.email === selectedSenderEmail) || senders[0];
                  const isReal = !!s?.smtpConfig?.host;
                  return (
                    <div className={`mt-2 p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                      isReal
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-purple-50 border-purple-200 text-purple-800'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${isReal ? 'bg-emerald-500 animate-pulse' : 'bg-purple-500'}`} />
                      <span className="font-semibold">
                        {isReal
                          ? `Real World Delivery Mode Active: Delivering to recipient inboxes via ${s?.smtpConfig?.host}.`
                          : `Sandbox Mode Active: Using Ethereal test sandbox with webmail message inspection.`}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Summary Card matching reference */}
              <div className="p-5 bg-[#F0EEFF] border border-[#5125F5]/20 rounded-2xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#5125F5] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#5125F5]/20">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#101A33]">
                    Total emails to be scheduled: {recipients.length}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Based on your uploaded file
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Action Controls - Pinned */}
        <div className="shrink-0 flex items-center justify-between px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/70">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as any)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !subject.trim()) {
                    setErrorMsg('Please specify a subject line.');
                    return;
                  }
                  if (step === 2 && recipients.length === 0) {
                    setErrorMsg('Please upload leads to continue.');
                    return;
                  }
                  setErrorMsg(null);
                  setStep((step + 1) as any);
                }}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-md shadow-[#5125F5]/25 transition-all"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleScheduleSubmit}
                className="flex items-center gap-2 px-7 py-2.5 text-sm font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-md shadow-[#5125F5]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Scheduling Queue...</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    <span>Schedule Emails</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
