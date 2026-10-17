import React from 'react';
import { Send, CheckCircle2, XCircle, BarChart3, ArrowUpRight } from 'lucide-react';
import { CampaignStats } from '../types.js';

interface MetricCardsProps {
  stats: CampaignStats;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 lg:gap-5 mb-6 sm:mb-8">
      {/* 1. Scheduled Emails Card */}
      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center gap-3.5 sm:gap-4 min-w-0">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#F0EEFF] text-[#5125F5] flex items-center justify-center shrink-0">
          <Send className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight truncate">
            {stats.scheduledEmails}
          </div>
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 mt-0.5 truncate">
            Scheduled Emails
          </div>
        </div>
      </div>

      {/* 2. Sent Emails Card */}
      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center gap-3.5 sm:gap-4 min-w-0">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight truncate">
            {stats.sentEmails}
          </div>
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 mt-0.5 truncate">
            Sent Emails
          </div>
        </div>
      </div>

      {/* 3. Failed Emails Card */}
      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center gap-3.5 sm:gap-4 min-w-0">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
          <XCircle className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight truncate">
            {stats.failedEmails}
          </div>
          <div className="text-[11px] sm:text-xs font-medium text-slate-500 mt-0.5 truncate">
            Failed Emails
          </div>
        </div>
      </div>

      {/* 4. Open Rate Card */}
      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between min-w-0">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight truncate">
              {stats.openRatePercent}%
            </div>
            <div className="text-[11px] sm:text-xs font-medium text-slate-500 mt-0.5 truncate">
              Open Rate
            </div>
          </div>
        </div>
        {/* Percentage delta pill */}
        <div className="hidden sm:flex items-center gap-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full shrink-0">
          <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="font-mono">{stats.openRateDelta}%</span>
        </div>
      </div>
    </div>
  );
};
