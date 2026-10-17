import React, { useState } from 'react';
import {
  Calendar,
  Mail,
  Search,
  Filter,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  RotateCcw,
  Ban,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ScheduledEmailItem, EmailStatus } from '../types.js';

interface EmailTableProps {
  activeTab: 'scheduled' | 'sent';
  onTabChange: (tab: 'scheduled' | 'sent') => void;
  emails: ScheduledEmailItem[];
  totalResults: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onViewEmail: (email: ScheduledEmailItem) => void;
  onCancelEmail: (id: string) => void;
  onRetryEmail: (id: string) => void;
  onSendNow?: (id: string) => void;
  isLoading?: boolean;
}

export const EmailTable: React.FC<EmailTableProps> = ({
  activeTab,
  onTabChange,
  emails,
  totalResults,
  currentPage,
  onPageChange,
  pageSize,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onViewEmail,
  onCancelEmail,
  onRetryEmail,
  onSendNow,
  isLoading,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);

  const toggleSelectAll = () => {
    if (selectedIds.length === emails.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(emails.map((e) => e.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const startIdx = totalResults === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(totalResults, currentPage * pageSize);

  const renderStatusBadge = (status: EmailStatus) => {
    switch (status) {
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#E8EEFF] text-[#2563EB] border border-[#2563EB]/15">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
            Scheduled
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
            Queued
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Processing
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#DCFCE7] text-[#16A34A] border border-[#16A34A]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            Sent
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FEE2E2] text-[#DC2626] border border-[#DC2626]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
            Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Cancelled
          </span>
        );
      default:
        return <span className="text-xs text-slate-500 capitalize">{status}</span>;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Top Tabs */}
      <div className="flex items-center border-b border-slate-200 px-6 pt-2">
        <button
          onClick={() => onTabChange('scheduled')}
          className={`flex items-center gap-2.5 px-4 py-3.5 text-sm font-semibold transition-colors border-b-2 -mb-[1px] ${
            activeTab === 'scheduled'
              ? 'border-[#5125F5] text-[#5125F5]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Scheduled Emails</span>
        </button>

        <button
          onClick={() => onTabChange('sent')}
          className={`flex items-center gap-2.5 px-4 py-3.5 text-sm font-semibold transition-colors border-b-2 -mb-[1px] ${
            activeTab === 'sent'
              ? 'border-[#5125F5] text-[#5125F5]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Sent Emails</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-slate-100">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by email, subject or status..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2 text-xs sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] cursor-pointer"
            >
              <option value="all">All Status</option>
              {activeTab === 'scheduled' ? (
                <>
                  <option value="scheduled">Scheduled</option>
                  <option value="queued">Queued</option>
                  <option value="processing">Processing</option>
                </>
              ) : (
                <>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                </>
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
              <ChevronRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>

          {/* Date Range Button */}
          <button
            onClick={() => {
              // Toggle or prompt date range
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>Select date range</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto min-h-[320px]">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="inline-block w-6 h-6 border-2 border-[#5125F5] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs">Loading campaign emails...</p>
          </div>
        ) : emails.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No emails found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search filters to find what you are looking for.'
                : 'No emails scheduled yet. Compose a new campaign to get started!'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 bg-slate-50/50">
                <th className="py-3.5 pl-6 pr-3 w-12">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === emails.length && emails.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-[#5125F5] focus:ring-[#5125F5] border-slate-300 cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Subject</th>
                <th className="py-3.5 px-4">
                  {activeTab === 'scheduled' ? 'Scheduled Time' : 'Sent Time'}
                </th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {emails.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  <td className="py-3.5 pl-6 pr-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelectRow(row.id)}
                      className="w-4 h-4 rounded text-[#5125F5] focus:ring-[#5125F5] border-slate-300 cursor-pointer"
                    />
                  </td>

                  <td className="py-3.5 px-4 font-medium text-slate-800">
                    <span className="font-mono text-xs">{row.recipientEmail}</span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-700 max-w-xs truncate">
                    {row.subject}
                  </td>

                  <td className="py-3.5 px-4 text-slate-500 font-mono text-xs tabular-nums whitespace-nowrap">
                    {formatDateTime(activeTab === 'scheduled' ? row.scheduledTime : row.sentTime)}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {renderStatusBadge(row.status)}
                  </td>

                  <td className="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5 text-left">
                      {activeTab === 'scheduled' && (row.status === 'scheduled' || row.status === 'queued') && onSendNow && (
                        <button
                          onClick={() => onSendNow(row.id)}
                          title="Send immediately (dispatch now)"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#5125F5] bg-[#F0EEFF] hover:bg-[#5125F5] hover:text-white rounded-lg transition-all shadow-2xs active:scale-95 cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>Send Now</span>
                        </button>
                      )}

                      <div className="relative">
                        <button
                          onClick={() =>
                            setActionMenuOpenId(actionMenuOpenId === row.id ? null : row.id)
                          }
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          aria-label="Row actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {actionMenuOpenId === row.id && (
                          <div
                            className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-100 p-1.5 z-40 text-left font-sans animate-in fade-in zoom-in-95 duration-100"
                            onMouseLeave={() => setActionMenuOpenId(null)}
                          >
                            {activeTab === 'scheduled' && (row.status === 'scheduled' || row.status === 'queued') && onSendNow && (
                              <button
                                onClick={() => {
                                  onSendNow(row.id);
                                  setActionMenuOpenId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#5125F5] hover:bg-[#F0EEFF] rounded-lg transition-colors cursor-pointer"
                              >
                                <Zap className="w-3.5 h-3.5 fill-[#5125F5]" />
                                <span>Send Now (Instant)</span>
                              </button>
                            )}

                            <button
                              onClick={() => {
                                onViewEmail(row);
                                setActionMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>Preview Content</span>
                            </button>

                            {row.etherealPreviewUrl && (
                              <a
                                href={row.etherealPreviewUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setActionMenuOpenId(null)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#5125F5] hover:bg-[#5125F5]/10 rounded-lg transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>View Ethereal Email</span>
                              </a>
                            )}

                            {activeTab === 'scheduled' && (row.status === 'scheduled' || row.status === 'queued') && (
                              <button
                                onClick={() => {
                                  onCancelEmail(row.id);
                                  setActionMenuOpenId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Cancel Scheduled</span>
                              </button>
                            )}

                            {row.status === 'failed' && (
                              <button
                                onClick={() => {
                                  onRetryEmail(row.id);
                                  setActionMenuOpenId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Retry Send Now</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <div>
          Showing <span className="font-semibold text-slate-800">{startIdx}</span> to{' '}
          <span className="font-semibold text-slate-800">{endIdx}</span> of{' '}
          <span className="font-semibold text-slate-800">{totalResults}</span> results
        </div>

        {/* Pagination Page Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum = i + 1;
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-7 h-7 rounded-lg font-medium text-xs flex items-center justify-center transition-all ${
                  currentPage === pageNum
                    ? 'bg-[#5125F5] text-white shadow-xs'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          {totalPages > 5 && (
            <>
              <span className="px-1 text-slate-400">...</span>
              <button
                onClick={() => onPageChange(totalPages)}
                className={`w-7 h-7 rounded-lg font-medium text-xs flex items-center justify-center transition-all ${
                  currentPage === totalPages
                    ? 'bg-[#5125F5] text-white shadow-xs'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
