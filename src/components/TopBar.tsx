import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Settings as SettingsIcon,
  ShieldCheck,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile } from '../types.js';

interface TopBarProps {
  user: UserProfile;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  onToggleSidebarMobile: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenQueueMonitor: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  user,
  searchTerm,
  onSearchChange,
  onToggleSidebarMobile,
  onLogout,
  onOpenSettings,
  onOpenQueueMonitor,
}) => {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-20 px-6 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      {/* Left zone: Sidebar toggle & Global Search */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <button
          onClick={onToggleSidebarMobile}
          className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search Bar matching reference image */}
        <div className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search emails, subjects or campaigns..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5125F5]/20 focus:border-[#5125F5] transition-all"
          />
        </div>
      </div>

      {/* Right zone: Notification & User Avatar */}
      <div className="flex items-center gap-4">
        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#5125F5] rounded-full ring-2 ring-white" />
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-900">Campaign Alerts</span>
                <span className="text-[11px] font-medium text-[#5125F5] bg-[#5125F5]/10 px-2 py-0.5 rounded-full">
                  Live
                </span>
              </div>
              <div className="py-2 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-800 leading-tight">
                      Spring Partnership Outreach active
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      BullMQ queue dispatched batch on schedule
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-purple-50 text-[#5125F5] flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-800 leading-tight">
                      Rate limit tracker synced
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      200 of 1000 emails sent in current hour
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill & Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
          >
            <img
              src={user.avatarUrl || '/src/assets/images/srusti_avatar_1792219223879.jpg'}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-xs"
              onError={(e) => {
                // Fallback avatar if load fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-slate-900 leading-tight">
                {user.name}
              </div>
              <div className="text-xs text-slate-400 max-w-[160px] truncate">
                {user.email}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 transition-transform duration-200" />
          </button>

          {/* Profile Dropdown Menu */}
          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs font-semibold text-slate-900">{user.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-emerald-600 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Google OAuth Verified</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setProfileDropdownOpen(false);
                  onOpenQueueMonitor();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors text-left"
              >
                <Activity className="w-4 h-4 text-[#5125F5]" />
                <span>BullMQ Live Queue</span>
              </button>

              <button
                onClick={() => {
                  setProfileDropdownOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors text-left"
              >
                <SettingsIcon className="w-4 h-4 text-slate-500" />
                <span>Account & Sending Settings</span>
              </button>

              <div className="my-1 border-t border-slate-100" />

              <button
                onClick={() => {
                  setProfileDropdownOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
