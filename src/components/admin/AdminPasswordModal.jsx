import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, X, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '../common/Button';

export const TEACHER_ACCESS_PASSWORD = '1234';
export const ADMIN_AUTH_SESSION_KEY = 'ielts_admin_authenticated';

/**
 * Checks whether the current browser session has validated the admin password.
 */
export function isAdminAuthenticated() {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(ADMIN_AUTH_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Sets the admin authenticated status in sessionStorage.
 */
export function setAdminAuthenticated(status = true) {
  if (typeof window === 'undefined') return;
  try {
    if (status) {
      sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, 'true');
    } else {
      sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
    }
  } catch {}
}

export function AdminPasswordModal({
  isOpen,
  onSuccess,
  onCancel,
  title = 'Teacher & Proctor Authentication',
  description = 'Please enter the proctor access password to enter Teacher View or Super-Admin.',
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError('');
      setShowPassword(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (password.trim() === TEACHER_ACCESS_PASSWORD) {
      setAdminAuthenticated(true);
      setError('');
      setPassword('');
      if (onSuccess) onSuccess();
    } else {
      setError('Incorrect password. Access denied.');
      inputRef.current?.select();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onCancel}
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div 
          className="relative w-full max-w-md transform overflow-hidden rounded-3xl bg-white p-6 sm:p-8 text-left shadow-2xl border border-slate-200 transition-all animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          {onCancel && (
            <button
              onClick={onCancel}
              className="absolute top-5 right-5 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Icon Header */}
          <div className="w-14 h-14 rounded-2xl bg-orange-100 text-brand-600 flex items-center justify-center mb-5 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>

          {/* Title & Prompt */}
          <div className="space-y-1 mb-6">
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Proctor Access Password
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Enter password..."
                  className={`w-full px-4 py-3 rounded-xl border ${
                    error ? 'border-rose-300 focus:ring-rose-500' : 'border-slate-300 focus:ring-brand-500'
                  } bg-slate-50 focus:bg-white text-slate-900 font-mono text-sm tracking-widest focus:outline-none focus:ring-2 transition pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-rose-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  className="flex-1 font-bold text-slate-600"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="flex-1 font-bold shadow-glow bg-brand-500 hover:bg-brand-600 text-white"
              >
                Verify & Enter
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
