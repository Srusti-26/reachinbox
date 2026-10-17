import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Mail,
  Clock,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Hash,
  Send,
  Save,
  Plus,
  Trash2,
  Check,
  Globe,
  Key,
  Server,
  Zap,
  Info,
} from 'lucide-react';
import { SenderAccount, SlackConfig, SmtpConfig, UserProfile } from '../types.js';

interface SettingsViewProps {
  user: UserProfile;
  senders: SenderAccount[];
  slackConfig: SlackConfig;
  onOpenSlackModal: () => void;
  onOpenSendRealModal: () => void;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  senders,
  slackConfig,
  onOpenSlackModal,
  onOpenSendRealModal,
  onRefresh,
}) => {
  const [concurrency, setConcurrency] = useState(5);
  const [minDelay, setMinDelay] = useState(30);
  const [maxPerHour, setMaxPerHour] = useState(1000);

  React.useEffect(() => {
    fetch('/api/v1/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setConcurrency(d.settings.workerConcurrency);
          setMinDelay(d.settings.minDelayBetweenEmailsSeconds);
          setMaxPerHour(d.settings.maxEmailsPerHour);
        }
      })
      .catch(() => {});
  }, []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New SMTP / Sender Form State
  const [showAddSenderModal, setShowAddSenderModal] = useState(false);
  const [senderName, setSenderName] = useState('My Outreach');
  const [senderEmail, setSenderEmail] = useState(user.email || '');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState(user.email || '');
  const [smtpPass, setSmtpPass] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState(500);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{ success: boolean; msg: string } | null>(null);

  // Apply Provider Presets
  const applyPreset = (provider: 'gmail' | 'resend' | 'brevo' | 'custom') => {
    setVerifyStatus(null);
    if (provider === 'gmail') {
      setSmtpHost('smtp.gmail.com');
      setSmtpPort(587);
      setSmtpSecure(false);
      setSmtpUser(user.email || '');
    } else if (provider === 'resend') {
      setSmtpHost('smtp.resend.com');
      setSmtpPort(465);
      setSmtpSecure(true);
      setSmtpUser('resend');
    } else if (provider === 'brevo') {
      setSmtpHost('smtp-relay.brevo.com');
      setSmtpPort(587);
      setSmtpSecure(false);
    }
  };

  const handleVerifySmtp = async () => {
    if (!smtpHost || !smtpUser || !smtpPass) {
      setVerifyStatus({ success: false, msg: 'Host, Username, and Password/App Password are required.' });
      return;
    }
    setIsVerifying(true);
    setVerifyStatus(null);

    try {
      const res = await fetch('/api/v1/senders/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: {
            host: smtpHost,
            port: Number(smtpPort),
            secure: smtpSecure,
            user: smtpUser,
            pass: smtpPass,
            fromEmail: senderEmail,
            fromName: senderName,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setVerifyStatus({ success: true, msg: 'Connection verified! SMTP server authenticated successfully.' });
      } else {
        setVerifyStatus({ success: false, msg: data.error || 'Connection failed.' });
      }
    } catch (err: any) {
      setVerifyStatus({ success: false, msg: err.message || 'Verification request failed.' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveSender = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: senderName,
          email: senderEmail,
          type: 'smtp',
          hourlyLimit,
          isLiveDelivery: true,
          smtpConfig: {
            host: smtpHost,
            port: Number(smtpPort),
            secure: smtpSecure,
            user: smtpUser,
            pass: smtpPass,
            fromEmail: senderEmail,
            fromName: senderName,
          },
        }),
      });

      if (res.ok) {
        setShowAddSenderModal(false);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetDefaultSender = async (id: string) => {
    await fetch(`/api/v1/senders/${id}/default`, { method: 'POST' });
    onRefresh();
  };

  const handleDeleteSender = async (id: string) => {
    await fetch(`/api/v1/senders/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerConcurrency: concurrency,
          minDelayBetweenEmailsSeconds: minDelay,
          maxEmailsPerHour: maxPerHour,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Settings</h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure sender mailboxes, real SMTP servers, queue concurrency, and Slack notifications.
          </p>
        </div>
      </div>

      {/* Account Info */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-[#F0EEFF] text-[#5125F5] flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Authenticated Account</h3>
            <p className="text-xs text-slate-500">Google OAuth 2.0 Identity Profile</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block mb-0.5">Account Name:</span>
            <span className="font-semibold text-slate-800">{user.name}</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">Email Address:</span>
            <span className="font-mono font-medium text-slate-800">{user.email}</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">Role / Tier:</span>
            <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
              Pro Plan Active
            </span>
          </div>
        </div>
      </div>

      {/* Real-World Senders & Mailboxes */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Configured Senders & Real SMTP Mailboxes</h3>
              <p className="text-xs text-slate-500">
                Connect your real Gmail, Google Workspace, Resend, Brevo, or custom SMTP
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddSenderModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Real Mailbox</span>
          </button>
        </div>

        {/* Sender list */}
        <div className="divide-y divide-slate-100">
          {senders.map((s) => {
            const hasSmtp = !!s.smtpConfig?.host;
            return (
              <div key={s.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                    {s.isDefault && (
                      <span className="px-2 py-0.5 bg-purple-50 text-[#5125F5] font-bold rounded-md text-[10px]">
                        DEFAULT SENDER
                      </span>
                    )}
                    {hasSmtp ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded-md text-[10px] border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Live Real SMTP ({s.smtpConfig?.host})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 font-medium rounded-md text-[10px]">
                        Ethereal Sandbox
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-slate-500">{s.email}</div>
                  <div className="text-[11px] text-slate-400">
                    Quota: <span className="font-mono font-medium text-slate-700">{s.hourlyLimit} emails/hour</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!s.isDefault && (
                    <button
                      onClick={() => handleSetDefaultSender(s.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                    >
                      Make Default
                    </button>
                  )}
                  {senders.length > 1 && (
                    <button
                      onClick={() => handleDeleteSender(s.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Remove Mailbox"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Queue & Rate Limit Controls */}
      <form onSubmit={handleSaveSettings} className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-[#5125F5] flex items-center justify-center">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Queue & Rate Limit Tuning</h3>
            <p className="text-xs text-slate-500">BullMQ worker concurrency and sending quotas</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Worker Concurrency
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
            />
            <p className="text-[11px] text-slate-400 mt-1">Parallel worker dispatches.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Min Delay Between Emails (Sec)
            </label>
            <input
              type="number"
              min={1}
              value={minDelay}
              onChange={(e) => setMinDelay(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
            />
            <p className="text-[11px] text-slate-400 mt-1">Prevents SMTP flood.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Global Hourly Quota
            </label>
            <input
              type="number"
              min={10}
              value={maxPerHour}
              onChange={(e) => setMaxPerHour(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
            />
            <p className="text-[11px] text-slate-400 mt-1">Trigger rollover & Slack alerts.</p>
          </div>
        </div>

        {saveSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved and applied to BullMQ worker queue!</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Slack Integration Card */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
            <Hash className="w-5 h-5 text-[#E01E5A]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Slack Webhook Alerts</h3>
            <p className="text-xs text-slate-500">
              {slackConfig.connected
                ? `Connected to ${slackConfig.channelName || '#email-campaigns'}`
                : 'Not connected'}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenSlackModal}
          className="px-4 py-2 text-xs font-semibold text-[#5125F5] bg-[#F0EEFF] hover:bg-[#5125F5]/15 rounded-xl transition-colors"
        >
          {slackConfig.connected ? 'Manage Slack' : 'Connect Slack'}
        </button>
      </div>

      {/* Modal: Connect Real Mailbox (SMTP) */}
      {showAddSenderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
          onClick={() => setShowAddSenderModal(false)}
        >
          <div
            className="relative w-full max-w-xl max-h-[88vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8 my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Connect Real Mailbox (SMTP)</h3>
                <p className="text-xs text-slate-500">Configure real email sending via Gmail, Resend, Brevo, or custom SMTP</p>
              </div>
              <button
                onClick={() => setShowAddSenderModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                aria-label="Close"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>

            {/* Quick Provider Presets */}
            <div className="mb-6">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                Quick Provider Presets:
              </label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('gmail')}
                  className="p-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-purple-50 hover:text-[#5125F5] border border-slate-200 rounded-xl transition-colors text-center"
                >
                  Gmail / G Suite
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('resend')}
                  className="p-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-purple-50 hover:text-[#5125F5] border border-slate-200 rounded-xl transition-colors text-center"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('brevo')}
                  className="p-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-purple-50 hover:text-[#5125F5] border border-slate-200 rounded-xl transition-colors text-center"
                >
                  Brevo
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('custom')}
                  className="p-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-purple-50 hover:text-[#5125F5] border border-slate-200 rounded-xl transition-colors text-center"
                >
                  Custom SMTP
                </button>
              </div>
            </div>

            {/* Gmail Notice */}
            {smtpHost.includes('gmail') && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 mb-5 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Using Gmail / Google Workspace?</span>
                  <p className="mt-0.5 text-blue-800 leading-relaxed">
                    Google requires a 16-character <strong>App Password</strong>. Generate one at{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-semibold"
                    >
                      myaccount.google.com/apppasswords
                    </a>{' '}
                    and paste it in the Password field below.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveSender} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Sender Name</label>
                  <input
                    type="text"
                    required
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#5125F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">From Email Address</label>
                  <input
                    type="email"
                    required
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:border-[#5125F5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    required
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:border-[#5125F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Port</label>
                  <input
                    type="number"
                    required
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:border-[#5125F5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Username / User</label>
                  <input
                    type="text"
                    required
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:border-[#5125F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Password / App Password</label>
                  <input
                    type="password"
                    required
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:border-[#5125F5]"
                  />
                </div>
              </div>

              {/* Verification Feedback */}
              {verifyStatus && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    verifyStatus.success
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {verifyStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{verifyStatus.msg}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-3 flex items-center justify-between gap-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={handleVerifySmtp}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  {isVerifying ? 'Verifying...' : 'Test SMTP Connection'}
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-xs transition-colors"
                >
                  Save & Connect Mailbox
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
