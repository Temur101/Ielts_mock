import React, { useState } from 'react';
import { 
  GraduationCap, 
  KeyRound, 
  User, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles,
  AlertTriangle,
  FileCheck,
  RefreshCw
} from 'lucide-react';
import { Button } from '../common/Button';
import { fetchExamByPin } from '../../lib/supabase';

export function StudentJoin({ onJoin, defaultPin = '', isLobbyOpen = false, examStatus = 'lobby', shortCircuitPin = '' }) {
  // Check URL query parameter ?pin=...
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialPin = (shortCircuitPin || urlParams?.get('pin') || defaultPin || '').trim().toUpperCase();

  const [name, setName] = useState('');
  const [candidateNo, setCandidateNo] = useState('');
  const [pinCode, setPinCode] = useState(initialPin);
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const isPinPrefilled = Boolean(shortCircuitPin || urlParams?.get('pin'));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your full name as shown on official ID');
      return;
    }
    if (!pinCode.trim()) {
      setError('Please enter the active 6-digit Session PIN');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const cleanPin = pinCode.trim().toUpperCase();
      const { data: dbExam } = await fetchExamByPin(cleanPin);

      if (dbExam) {
        if (dbExam.status === 'finished') {
          setError('This exam session has already concluded.');
          return;
        }

        if (dbExam.is_lobby_open === false && dbExam.status !== 'active') {
          setError('The classroom lobby has not been opened yet by the instructor. Please wait for your instructor to start.');
          return;
        }

        const finalCandidateNo = candidateNo.trim() || `CAND-${Math.floor(1000 + Math.random() * 9000)}`;
        onJoin({
          name: name.trim(),
          candidate_no: finalCandidateNo,
          pin_code: cleanPin,
          dbExam: dbExam,
        });
      } else {
        // If Supabase not reachable or offline, fallback to match current local exam PIN
        const activeLocalPin = (defaultPin || '').trim().toUpperCase();
        if (activeLocalPin && cleanPin === activeLocalPin) {
          if (isLobbyOpen === false && examStatus !== 'active') {
            setError('The classroom lobby has not been opened yet by the instructor. Please wait for your instructor to start.');
            return;
          }

          const finalCandidateNo = candidateNo.trim() || `CAND-${Math.floor(1000 + Math.random() * 9000)}`;
          onJoin({
            name: name.trim(),
            candidate_no: finalCandidateNo,
            pin_code: cleanPin,
            dbExam: null,
          });
        } else {
          setError('Invalid PIN Code. Please check the code provided by your instructor.');
        }
      }
    } catch (err) {
      console.warn("Validation error:", err);
      setError('Invalid PIN Code. Please check the code provided by your instructor.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleQuickDemo = () => {
    const demoNames = [
      "Javohir Toshpulatov", 
      "Dilnoza Rahimova", 
      "Sardor Ikromov", 
      "Nigora Yusupova",
      "Azizbek Kobilov"
    ];
    const pickedName = demoNames[Math.floor(Math.random() * demoNames.length)];
    setName(pickedName);
    setCandidateNo(`UZB-${Math.floor(1000 + Math.random() * 9000)}`);
    setPinCode(defaultPin || '');
    setError('');
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-500 to-brand-600 text-white flex items-center justify-center mx-auto shadow-glow shadow-brand-500/30">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            IELTS Mock Examination
          </h2>
          <p className="text-xs text-slate-500">
            Enter candidate credentials & active Session PIN to enter the proctored waiting room.
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Join Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Full Name (as on Passport / ID)
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. Anvar Saidov"
                value={name}
                autoFocus={isPinPrefilled}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Candidate Number <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <FileCheck className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. UZB-8921"
                value={candidateNo}
                onChange={(e) => setCandidateNo(e.target.value.toUpperCase())}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Session PIN
              </label>
              {isPinPrefilled && (
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                  ✓ Pre-filled & Verified
                </span>
              )}
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Enter Session PIN (e.g. IELTS-07)"
                value={pinCode}
                readOnly={isPinPrefilled}
                onChange={(e) => { setPinCode(e.target.value.toUpperCase()); setError(''); }}
                className={`w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border-2 font-mono font-extrabold uppercase tracking-wider transition ${
                  isPinPrefilled 
                    ? 'bg-orange-100/50 border-orange-400 text-orange-700 cursor-not-allowed shadow-inner' 
                    : 'border-brand-500 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-brand-600 bg-orange-50/30'
                }`}
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            icon={isValidating ? RefreshCw : ArrowRight}
            disabled={isValidating}
            className="w-full py-3.5 text-sm font-extrabold shadow-glow"
          >
            {isValidating ? 'Validating PIN...' : 'ENTER EXAM WAITING ROOM'}
          </Button>
        </form>

        {/* Quick Demo Button */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">Testing candidate flow?</span>
          <button
            type="button"
            onClick={handleQuickDemo}
            className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-fill Test Profile
          </button>
        </div>

        {/* Strict Anti-Cheat policy banner */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-500 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
          <span>
            <strong>Anti-Cheat Active:</strong> Tab switching, window blur, or exiting fullscreen immediately triggers disqualification.
          </span>
        </div>

      </div>
    </div>
  );
}
