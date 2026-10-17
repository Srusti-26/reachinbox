import React, { useState } from 'react';
import {
  X,
  Bell,
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Send,
  Zap,
} from 'lucide-react';
import { SlackConfig } from '../types.js';

interface ConnectSlackModalProps {
  isOpen: boolean;
  onClose: () => void;
  slackConfig: SlackConfig;
  onUpdateSlack: () => void;
}

export const ConnectSlackModal: React.FC<ConnectSlackModalProps> = ({
  isOpen,
  onClose,
  slackConfig,
  onUpdateSlack,
}) => {
  const [webhookUrl, setWebhookUrl] = useState(
    slackConfig.webhookUrl || 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'
  );
  const [channelName, setChannelName] = useState(slackConfig.channelName || '#email-campaigns');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/v1/slack/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, channelName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect Slack');
      onUpdateSlack();
      setTestResult({ success: true, msg: 'Slack connected successfully! You can send a test notification.' });
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsSubmitting(true);
    try {
      await fetch('/api/v1/slack/disconnect', { method: 'POST' });
      onUpdateSlack();
      setTestResult({ success: true, msg: 'Slack disconnected.' });
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendTestAlert = async () => {
    setIsSubmitting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/v1/slack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch test notification');
      setTestResult({ success: true, msg: 'Test message sent to ' + channelName + '!' });
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerRateLimitAlert = async () => {
    setIsSubmitting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/v1/slack/trigger-rate-limit-alert', { method: 'POST' });
      const data = await res.json();
      setTestResult({
        success: data.success,
        msg: data.success
          ? 'Hourly rate limit alert dispatched to Slack!'
          : data.message || 'Alert failed',
      });
    } catch (err: any) {
      setTestResult({ success: false, msg: err.message });
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
        className="relative w-full max-w-md max-h-[88vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8 my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Slack Logo Icon */}
        <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-5 shadow-xs">
          <svg className="w-7 h-7" viewBox="0 0 122.8 122.8">
            <path
              fill="#E01E5A"
              d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
            />
            <path
              fill="#36C5F0"
              d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
            />
            <path
              fill="#2EB67D"
              d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
            />
            <path
              fill="#ECB22E"
              d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
            />
          </svg>
        </div>

        {/* Heading & Subtitle matching reference image */}
        <h3 className="text-xl font-bold text-slate-900 tracking-tight font-sans mb-1.5">
          Connect Slack
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed mb-6">
          Get notified when rate limits are hit, and receive important updates about your email campaigns.
        </p>

        {/* Feature List matching reference image */}
        <div className="space-y-3.5 mb-6 text-xs text-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-base">🔔</span>
            <span className="font-medium">Get notified on rate limit hits</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-base">📊</span>
            <span className="font-medium">Campaign status updates</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-base">⚠️</span>
            <span className="font-medium">Delivery failure alerts</span>
          </div>
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleConnect} className="space-y-4 mb-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Slack Incoming Webhook URL
            </label>
            <input
              type="url"
              required
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Channel Name
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="#email-alerts"
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5]"
            />
          </div>

          {/* Test Feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              )}
              <span>{testResult.msg}</span>
            </div>
          )}

          {/* Primary Action Button matching reference */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 text-sm font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-md shadow-[#5125F5]/25 transition-all disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            <span>{slackConfig.connected ? 'Save & Keep Connected' : 'Connect with Slack'}</span>
          </button>
        </form>

        {/* Action buttons if connected */}
        {slackConfig.connected && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSendTestAlert}
              disabled={isSubmitting}
              className="text-xs font-semibold text-[#5125F5] hover:underline flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Test Notification</span>
            </button>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isSubmitting}
              className="text-xs text-rose-600 hover:underline"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
