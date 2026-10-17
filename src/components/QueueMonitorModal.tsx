import React, { useEffect, useState } from 'react';
import {
  X,
  Activity,
  Layers,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Zap,
  ShieldCheck,
  Server,
} from 'lucide-react';
import { QueueHealthStats } from '../types.js';

interface QueueMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueMonitorModal: React.FC<QueueMonitorModalProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<QueueHealthStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/queue/health');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
      const interval = setInterval(fetchHealth, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Pinned */}
        <div className="shrink-0 flex items-center justify-between px-6 sm:px-8 py-4 sm:py-5 border-b border-slate-100 bg-[#101A33] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#5125F5] flex items-center justify-center shadow-md shadow-[#5125F5]/30">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                BullMQ Live Queue Monitor
              </h3>
              <p className="text-xs text-slate-400">
                Queue: <code className="text-purple-300">email-dispatch</code> · Redis Delayed Jobs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/admin/queues"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-lg transition-colors"
              title="Open Bull Board"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Bull Board</span>
            </a>
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="Refresh Queue Stats"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {/* Status banner */}
          <div className="flex items-center justify-between p-4 bg-purple-50 rounded-2xl border border-purple-200/80">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-[#5125F5]" />
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  BullMQ Queue Engine Active
                </span>
                <span className="text-[11px] text-slate-600">
                  Persistent Redis-backed delayed scheduler · Concurrency: {stats?.concurrency || 5} workers
                </span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Healthy
            </span>
          </div>

          {/* Bull Board Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
            {/* Waiting */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <Clock className="w-5 h-5 text-slate-500 mx-auto mb-1.5" />
              <div className="text-xl font-bold text-slate-900 font-mono tabular-nums">
                {stats?.waiting ?? 0}
              </div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                Waiting
              </div>
            </div>

            {/* Delayed */}
            <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200 text-center">
              <Layers className="w-5 h-5 text-blue-600 mx-auto mb-1.5" />
              <div className="text-xl font-bold text-blue-900 font-mono tabular-nums">
                {stats?.delayed ?? 0}
              </div>
              <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider mt-0.5">
                Delayed
              </div>
            </div>

            {/* Active */}
            <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200 text-center">
              <Play className="w-5 h-5 text-amber-600 mx-auto mb-1.5" />
              <div className="text-xl font-bold text-amber-900 font-mono tabular-nums">
                {stats?.active ?? 0}
              </div>
              <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mt-0.5">
                Active
              </div>
            </div>

            {/* Completed */}
            <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 text-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1.5" />
              <div className="text-xl font-bold text-emerald-900 font-mono tabular-nums">
                {stats?.completed ?? 0}
              </div>
              <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider mt-0.5">
                Completed
              </div>
            </div>

            {/* Failed */}
            <div className="p-4 bg-rose-50/70 rounded-2xl border border-rose-200 text-center">
              <XCircle className="w-5 h-5 text-rose-600 mx-auto mb-1.5" />
              <div className="text-xl font-bold text-rose-900 font-mono tabular-nums">
                {stats?.failed ?? 0}
              </div>
              <div className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider mt-0.5">
                Failed
              </div>
            </div>
          </div>

          {/* Rate Limit and Concurrency Info */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-700">
              <span className="font-medium">Rate Limiting:</span>
              <span className={`font-semibold ${stats?.rateLimitPaused ? 'text-rose-600' : 'text-emerald-700'}`}>
                {stats?.rateLimitPaused ? '⏸ Paused — quota reached, jobs rescheduled' : '✅ Active — auto-reschedule on cap'}
              </span>
            </div>
            {stats?.nextEligibleSendTime && (
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-medium">Next Rollover Window:</span>
                <span className="font-mono text-purple-700">
                  {new Date(stats.nextEligibleSendTime).toLocaleTimeString()}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-slate-700">
              <span className="font-medium">Worker Concurrency:</span>
              <span className="font-mono">{stats?.concurrency ?? 5} simultaneous jobs</span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span className="font-medium">Idempotency:</span>
              <span className="text-emerald-700 font-medium">✅ jobId = emailId (no duplicate sends)</span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span className="font-medium">Min delay between sends:</span>
              <span className="font-mono">2 000 ms (BullMQ limiter)</span>
            </div>
          </div>

          {/* Bull Board CTA */}
          <a
            href="/admin/queues"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-semibold text-[#5125F5] bg-[#F0EEFF] hover:bg-[#5125F5]/15 rounded-2xl border border-[#5125F5]/20 transition-colors"
          >
            <Server className="w-4 h-4" />
            <span>Open Full Bull Board Dashboard →</span>
          </a>
        </div>
      </div>
    </div>
  );
};
