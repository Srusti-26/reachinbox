import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { Sidebar, NavTab } from './components/Sidebar.js';
import { TopBar } from './components/TopBar.js';
import { MetricCards } from './components/MetricCards.js';
import { EmailTable } from './components/EmailTable.js';
import { ComposeWizardModal } from './components/ComposeWizardModal.js';
import { ConnectSlackModal } from './components/ConnectSlackModal.js';
import { EmailPreviewModal } from './components/EmailPreviewModal.js';
import { QueueMonitorModal } from './components/QueueMonitorModal.js';
import { LoginModal } from './components/LoginModal.js';
import { SettingsView } from './components/SettingsView.js';
import { SendRealEmailModal } from './components/SendRealEmailModal.js';
import { Zap } from 'lucide-react';
import {
  CampaignStats,
  ScheduledEmailItem,
  SenderAccount,
  SlackConfig,
  UserProfile,
} from './types.js';

export default function App() {
  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };
  // Navigation & Modal State
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [tableActiveTab, setTableActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [slackModalOpen, setSlackModalOpen] = useState(false);
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [selectedPreviewEmail, setSelectedPreviewEmail] = useState<ScheduledEmailItem | null>(null);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Data State — start empty; real values come from the API
  const [user, setUser] = useState<UserProfile>({
    id: '',
    name: '',
    email: '',
    role: 'Campaign Lead',
    createdAt: new Date().toISOString(),
  });

  const [stats, setStats] = useState<CampaignStats>({
    scheduledEmails: 0,
    sentEmails: 0,
    failedEmails: 0,
    openRatePercent: 0,
    openRateDelta: 0,
    hourlySentCount: 0,
    hourlyLimit: 1000,
  });

  const [senders, setSenders] = useState<SenderAccount[]>([]);

  const [slackConfig, setSlackConfig] = useState<SlackConfig>({
    connected: false,
    channelName: '#email-alerts',
    notifyOnRateLimit: true,
    notifyOnFailure: true,
    notifyOnCampaignComplete: true,
  });

  // Table filtering and pagination state
  const [emails, setEmails] = useState<ScheduledEmailItem[]>([]);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(5);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tableLoading, setTableLoading] = useState<boolean>(false);

  // Fetch current user and settings
  const fetchInitialData = useCallback(async () => {
    try {
      const authRes = await fetch('/api/v1/auth/me');
      if (!authRes.ok) {
        setLoginModalOpen(true);
        return;
      }
      const authData = await authRes.json();
      if (authData.user) setUser(authData.user);

      const settingsRes = await fetch('/api/v1/settings');
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (sData.senders) setSenders(sData.senders);
        if (sData.slack) setSlackConfig(sData.slack);
      }
    } catch (e) {
      console.warn('Initial data fetch notice:', e);
    }
  }, []);

  // Result of the Slack OAuth redirect (?slack=connected|denied|failed|invalid_state|not_configured)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('slack');
    if (!result) return;
    const messages: Record<string, [string, 'success' | 'error']> = {
      connected: ['Slack connected. Rate-limit alerts will now post to your channel.', 'success'],
      denied: ['Slack connection was cancelled.', 'error'],
      failed: ['Slack connection failed. Please try again.', 'error'],
      invalid_state: ['Slack connection could not be verified. Please try again.', 'error'],
      not_configured: ['Slack OAuth is not configured on the server (set SLACK_CLIENT_ID / SLACK_CLIENT_SECRET).', 'error'],
    };
    const [text, type] = messages[result] ?? ['Slack: unknown result.', 'error'];
    showToast(text, type);
    if (result === 'connected') fetchInitialData();
    window.history.replaceState({}, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch Dashboard Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.warn('Stats fetch notice:', e);
    }
  }, []);

  // Fetch Table Emails
  const fetchEmails = useCallback(async () => {
    setTableLoading(true);
    try {
      const endpoint =
        tableActiveTab === 'scheduled'
          ? `/api/v1/emails/scheduled?search=${encodeURIComponent(searchTerm)}&status=${statusFilter}&page=${currentPage}&limit=${pageSize}`
          : `/api/v1/emails/sent?search=${encodeURIComponent(searchTerm)}&status=${statusFilter}&page=${currentPage}&limit=${pageSize}`;

      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.data || []);
        setTotalResults(data.pagination?.total || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTableLoading(false);
    }
  }, [tableActiveTab, searchTerm, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    fetchInitialData();
    fetchStats();
  }, [fetchInitialData, fetchStats]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // Periodic polling for real-time queue updates
  useEffect(() => {
    const timer = setInterval(() => {
      fetchStats();
      fetchEmails();
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchStats, fetchEmails]);

  // Handle Tab Switch
  const handleNavSelect = (tab: NavTab) => {
    setCurrentTab(tab);
    if (tab === 'scheduled') {
      setTableActiveTab('scheduled');
    } else if (tab === 'sent') {
      setTableActiveTab('sent');
    } else if (tab === 'queue-monitor') {
      setQueueModalOpen(true);
    }
    setCurrentPage(1);
    setSearchTerm('');
    setStatusFilter('all');
  };

  const handleTableTabChange = (tab: 'scheduled' | 'sent') => {
    setTableActiveTab(tab);
    setCurrentPage(1);
    setStatusFilter('all');
  };

  const handleCancelEmail = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/emails/${id}/cancel`, { method: 'POST' });
      if (res.ok) {
        showToast('Scheduled email cancelled successfully.', 'success');
        fetchEmails();
        fetchStats();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to cancel email', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleRetryEmail = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/emails/${id}/retry`, { method: 'POST' });
      if (res.ok) {
        showToast('Email queued for retry dispatch.', 'success');
        fetchEmails();
        fetchStats();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to retry', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleSendNow = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/emails/${id}/send-now`, { method: 'POST' });
      if (res.ok) {
        showToast('Email dispatched immediately!', 'success');
        fetchEmails();
        fetchStats();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to dispatch email', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error dispatching email', 'error');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    setUser({ id: '', name: '', email: '', role: 'Campaign Lead', createdAt: new Date().toISOString() });
    setSenders([]);
    setEmails([]);
    setStats({ scheduledEmails: 0, sentEmails: 0, failedEmails: 0, openRatePercent: 0, openRateDelta: 0, hourlySentCount: 0, hourlyLimit: 1000 });
    setLoginModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#F0EEFF] flex font-sans antialiased text-[#101A33] overflow-x-hidden w-full">
      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white shadow-xl border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-200">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600" />
          )}
          <span className="text-xs font-semibold text-slate-800">{toastMessage.text}</span>
        </div>
      )}

      {/* Dark Navy Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleNavSelect}
        onOpenCompose={() => setComposeModalOpen(true)}
        onOpenSlack={() => setSlackModalOpen(true)}
        isOpenMobile={sidebarMobileOpen}
        onCloseMobile={() => setSidebarMobileOpen(false)}
        hourlySentCount={stats.hourlySentCount}
        hourlyLimit={stats.hourlyLimit}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'}`}>
        {/* Top Header */}
        <TopBar
          user={user}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onToggleSidebarMobile={() => setSidebarMobileOpen(!sidebarMobileOpen)}
          onLogout={handleLogout}
          onOpenSettings={() => setCurrentTab('settings')}
          onOpenQueueMonitor={() => setQueueModalOpen(true)}
        />

        {/* View Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
          {currentTab === 'settings' ? (
            <SettingsView
              user={user}
              senders={senders}
              slackConfig={slackConfig}
              onOpenSlackModal={() => setSlackModalOpen(true)}
              onOpenSendRealModal={() => {}}
              onRefresh={() => {
                fetchInitialData();
                fetchStats();
              }}
            />
          ) : (
            <>
              {/* Dashboard Heading & Greeting matching reference */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#101A33] font-sans">
                    {currentTab === 'sent'
                      ? 'Sent Emails'
                      : currentTab === 'scheduled'
                      ? 'Scheduled Emails'
                      : `${getGreeting()}, ${user.name || 'there'}! 👋`}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    {currentTab === 'sent'
                      ? 'View all your sent emails and their status'
                      : currentTab === 'scheduled'
                      ? 'Monitor and manage your upcoming delayed email queues'
                      : "Here's an overview of your email campaigns."}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setComposeModalOpen(true)}
                    className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#5125F5] hover:bg-[#431dd6] rounded-xl shadow-md shadow-[#5125F5]/30 hover:shadow-lg transition-all transform active:scale-98"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Compose New Email</span>
                  </button>
                </div>
              </div>

              {/* 4 Responsive Metric Cards (Only shown on Dashboard or top overview) */}
              {currentTab === 'dashboard' && <MetricCards stats={stats} />}

              {/* Email Management Section */}
              <EmailTable
                activeTab={tableActiveTab}
                onTabChange={handleTableTabChange}
                emails={emails}
                totalResults={totalResults}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                onViewEmail={(eml) => setSelectedPreviewEmail(eml)}
                onCancelEmail={handleCancelEmail}
                onRetryEmail={handleRetryEmail}
                onSendNow={handleSendNow}
                isLoading={tableLoading}
              />
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <ComposeWizardModal
        isOpen={composeModalOpen}
        onClose={() => setComposeModalOpen(false)}
        senders={senders}
        onCampaignCreated={() => {
          showToast('Campaign successfully scheduled into BullMQ delayed queue!', 'success');
          fetchEmails();
          fetchStats();
        }}
      />

      <ConnectSlackModal
        isOpen={slackModalOpen}
        onClose={() => setSlackModalOpen(false)}
        slackConfig={slackConfig}
        onUpdateSlack={() => {
          fetchInitialData();
          showToast('Slack notification configuration updated.', 'success');
        }}
      />

      <EmailPreviewModal
        email={selectedPreviewEmail}
        onClose={() => setSelectedPreviewEmail(null)}
        onSendNow={handleSendNow}
      />

      <QueueMonitorModal
        isOpen={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
      />

      <LoginModal
        isOpen={loginModalOpen}
        onLoginSuccess={() => {
          setLoginModalOpen(false);
          fetchInitialData();
          fetchStats();
          showToast('Authenticated via Google OAuth session.', 'success');
        }}
      />

      <SendRealEmailModal
        isOpen={false}
        onClose={() => {}}
        senders={senders}
        defaultRecipient={user.email}
        onEmailSent={() => {}}
        onOpenSettings={() => setCurrentTab('settings')}
      />
    </div>
  );
}
