import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertTriangle, 
  GraduationCap,
  KeyRound,
  RefreshCw
} from 'lucide-react';
import { signInSuperAdmin } from '../../lib/superAdminService';

export function SuperAdminLogin({ onLoginSuccess, onNavigateHome }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { user, error: authError } = await signInSuperAdmin(email, password);
      if (authError || !user) {
        setError(authError?.message || 'Invalid credentials or missing Super-Admin privileges.');
      } else {
        onLoginSuccess(user);
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[90vh] flex items-center justify-center p-4 sm:p-6 bg-slate-900/5 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-slate-200/80 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Top Accent Strip */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600" />

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-800 text-orange-500 flex items-center justify-center mx-auto shadow-xl shadow-slate-900/20 border border-slate-700">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Super-Admin Hub
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Enterprise Master Command Center Authentication
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-[10px] font-extrabold uppercase tracking-wider text-orange-700">
            <Lock className="w-3 h-3" />
            Supabase Protected (role = 'super_admin')
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Super-Admin Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                placeholder="superadmin@domain.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-medium"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Master Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="Enter access password (1234)"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono"
                required
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Master Access Password: <span className="font-mono font-bold text-slate-600">1234</span></p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 active:scale-98 transition disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {loading ? 'Authenticating...' : 'Sign In to Super-Admin'}
          </button>
        </form>

        {/* Navigation Return */}
        <div className="pt-3 border-t border-slate-100 flex flex-col items-center">
          <button
            type="button"
            onClick={onNavigateHome}
            className="text-xs text-slate-500 hover:text-slate-800 hover:underline pt-1"
          >
            &larr; Return to IELTS Classroom Main
          </button>
        </div>
      </div>
    </div>
  );
}
