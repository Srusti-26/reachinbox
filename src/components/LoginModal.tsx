import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onLoginSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onLoginSuccess }) => {
  if (!isOpen) return null;

  const handleGoogleSignIn = () => {
    // Redirect to real Google OAuth flow
    window.location.href = '/api/v1/auth/google';
  };

  const handleDevLogin = async () => {
    // Dev-only bypass — works without Google OAuth credentials
    await fetch('/api/v1/auth/dev-login', { method: 'POST' });
    onLoginSuccess();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onLoginSuccess}
    >
      <div
        className="relative w-full max-w-md max-h-[88vh] overflow-y-auto bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 sm:p-10 text-center my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onLoginSuccess}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          aria-label="Close"
        >
          <span className="text-xl leading-none">×</span>
        </button>
        {/* ReachInbox Logo & Wordmark matching reference */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#5125F5] to-[#7B57F8] flex items-center justify-center shadow-lg shadow-[#5125F5]/30">
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
          <span className="text-2xl font-bold tracking-tight text-[#101A33] font-sans">
            ReachInbox
          </span>
        </div>

        {/* Heading & Subtitle */}
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-sans mb-1.5">
          Welcome Back
        </h2>
        <p className="text-xs text-slate-500 mb-8">
          Sign in to your account
        </p>

        {/* Continue with Google button matching reference */}
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3.5 py-3 px-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all mb-4"
        >
          {/* Google Multi-color G logo */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <button
          onClick={handleDevLogin}
          className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-4"
        >
          Dev mode: skip OAuth
        </button>

        {/* Footer disclaimer matching reference */}
        <p className="text-[11px] text-slate-400 leading-relaxed">
          By continuing, you agree to our{' '}
          <a href="#" className="underline hover:text-slate-600">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="underline hover:text-slate-600">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
};
