import React, { useState } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Send,
  PenSquare,
  Settings,
  Hash,
  Crown,
  HelpCircle,
  X,
  Activity,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export type NavTab = 'dashboard' | 'scheduled' | 'sent' | 'settings' | 'queue-monitor';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenCompose: () => void;
  onOpenSlack: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  hourlySentCount: number;
  hourlyLimit: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenCompose,
  onOpenSlack,
  isOpenMobile,
  onCloseMobile,
  hourlySentCount,
  hourlyLimit,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const percentUsed = Math.min(100, Math.round((hourlySentCount / (hourlyLimit || 1000)) * 100));

  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'scheduled' as NavTab, label: 'Scheduled Emails', icon: Calendar },
    { id: 'sent' as NavTab, label: 'Sent Emails', icon: Send },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col justify-between bg-[#101A33] text-white transition-all duration-300 ease-in-out border-r border-slate-800/60 shadow-xl overflow-y-auto overflow-x-hidden ${
          isCollapsed ? 'w-20' : 'w-64'
        } ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top: Logo & Nav items */}
        <div className="flex flex-col px-3.5 pt-5">
          {/* Logo & Wordmark */}
          <div className="flex items-center justify-between mb-7 px-1.5">
            <div
              className={`flex items-center gap-3 cursor-pointer ${
                isCollapsed ? 'justify-center w-full' : ''
              }`}
              onClick={() => {
                onSelectTab('dashboard');
                onCloseMobile();
              }}
              title="ReachInbox Dashboard"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#5125F5] to-[#7B57F8] flex items-center justify-center shrink-0 shadow-lg shadow-[#5125F5]/30">
                <svg
                  className="w-5 h-5 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              {!isCollapsed && (
                <div className="flex flex-col">
                  <span className="text-xl font-bold tracking-tight text-white font-sans leading-tight">
                    ReachInbox
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase">
                    Outreach Engine
                  </span>
                </div>
              )}
            </div>

            {/* Mobile close button */}
            <button
              onClick={onCloseMobile}
              className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col space-y-1 font-medium text-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  title={item.label}
                  className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-left ${
                    isCollapsed ? 'justify-center px-0' : ''
                  } ${
                    isActive
                      ? 'bg-[#5125F5] text-white shadow-md shadow-[#5125F5]/30 font-semibold'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}

            {/* Compose Email */}
            <button
              onClick={() => {
                onOpenCompose();
                onCloseMobile();
              }}
              title="Compose Email"
              className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition-all text-left ${
                isCollapsed ? 'justify-center px-0' : ''
              }`}
            >
              <PenSquare className="w-5 h-5 shrink-0 text-violet-400" />
              {!isCollapsed && <span className="truncate">Compose Email</span>}
            </button>

            {/* Settings */}
            <button
              onClick={() => {
                onSelectTab('settings');
                onCloseMobile();
              }}
              title="Settings & Senders"
              className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-left ${
                isCollapsed ? 'justify-center px-0' : ''
              } ${
                currentTab === 'settings'
                  ? 'bg-[#5125F5] text-white shadow-md shadow-[#5125F5]/30 font-semibold'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Settings className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="truncate">Settings</span>}
            </button>

            {/* Queue Monitor */}
            <button
              onClick={() => {
                onSelectTab('queue-monitor');
                onCloseMobile();
              }}
              title="Queue Monitor (BullMQ)"
              className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-left ${
                isCollapsed ? 'justify-center px-0' : ''
              } ${
                currentTab === 'queue-monitor'
                  ? 'bg-[#5125F5] text-white shadow-md shadow-[#5125F5]/30 font-semibold'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Activity className="w-5 h-5 shrink-0 text-amber-400" />
              {!isCollapsed && <span className="truncate">Queue Monitor</span>}
            </button>

            {/* Connect Slack */}
            <button
              onClick={() => {
                onOpenSlack();
                onCloseMobile();
              }}
              title="Connect Slack Notifications"
              className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition-all text-left ${
                isCollapsed ? 'justify-center px-0' : ''
              }`}
            >
              <Hash className="w-5 h-5 shrink-0 text-[#E01E5A]" />
              {!isCollapsed && <span className="truncate">Connect Slack</span>}
            </button>
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="p-3.5 space-y-3 shrink-0">
          {/* Subscription Usage Card */}
          {!isCollapsed ? (
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-semibold text-white tracking-wide">Pro Plan</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">Active</span>
              </div>
              <div className="text-xs text-slate-300 mb-2 font-mono tabular-nums">
                {hourlySentCount} / {hourlyLimit} emails this hour
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#5125F5] to-[#8B5CF6] rounded-full transition-all duration-500"
                  style={{ width: `${percentUsed}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex justify-center" title={`Pro Plan: ${hourlySentCount}/${hourlyLimit} sent this hour`}>
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400">
                <Crown className="w-5 h-5 fill-amber-400" />
              </div>
            </div>
          )}

          {/* Desktop Collapse Toggle */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex items-center justify-center gap-2 w-full py-2 px-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-[11px] font-medium">Collapse Menu</span>
                </>
              )}
            </button>
          )}

          {/* Support link */}
          {!isCollapsed ? (
            <a
              href="mailto:support@reachinbox.ai"
              className="flex items-center gap-2.5 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-medium text-slate-300 leading-none">Need help?</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Contact support</p>
              </div>
            </a>
          ) : (
            <a
              href="mailto:support@reachinbox.ai"
              className="flex justify-center p-2 text-slate-400 hover:text-slate-200 transition-colors"
              title="Contact support"
            >
              <HelpCircle className="w-4 h-4" />
            </a>
          )}
        </div>
      </aside>
    </>
  );
};
