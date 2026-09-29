import React, { useState } from 'react';
import { 
  GraduationCap, 
  ShieldCheck, 
  Users, 
  Copy, 
  Check, 
  Database, 
  Volume2, 
  VolumeX, 
  Sparkles,
  RefreshCw,
  Edit2,
  CheckCheck
} from 'lucide-react';
import { Badge } from './common/Badge';
import { generateCryptoPin } from '../lib/supabase';
import { getRemainingSeconds, formatExamTimer } from '../lib/examTimerUtils';

export function Navbar({
  currentRole, // 'admin' | 'student'
  onRoleChange,
  exam,
  student,
  soundEnabled,
  onToggleSound,
  onUpdatePinCode,
  isStudentOnly = false,
  onOpenSuperAdmin,
  isAdminAuthed: propIsAdminAuthed,
}) {
  const isAdminAuthed = propIsAdminAuthed ?? (typeof window !== 'undefined' && sessionStorage.getItem('ielts_admin_authenticated') === 'true');
  const [copiedPin, setCopiedPin] = useState(false);
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [pinInput, setPinInput] = useState(exam?.pin_code || '');

  React.useEffect(() => {
    if (exam?.pin_code && !isEditingPin) {
      setPinInput(exam.pin_code);
    }
  }, [exam?.pin_code, isEditingPin]);

  const handleCopyPin = (e) => {
    e.stopPropagation();
    if (!exam?.pin_code) return;
    navigator.clipboard.writeText(exam.pin_code);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const handleGeneratePin = (e) => {
    e.stopPropagation();
    const newPin = generateCryptoPin();
    setPinInput(newPin);
    if (onUpdatePinCode) {
      onUpdatePinCode(newPin);
    }
  };

  const handleSavePin = () => {
    setIsEditingPin(false);
    if (pinInput.trim() && onUpdatePinCode) {
      onUpdatePinCode(pinInput.trim().toUpperCase());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSavePin();
    } else if (e.key === 'Escape') {
      setIsEditingPin(false);
      setPinInput(exam?.pin_code || '');
    }
  };

  const [navTimer, setNavTimer] = useState(0);

  React.useEffect(() => {
    const isStageActive = exam?.current_stage?.endsWith('_active');
    if (!isStageActive) {
      setNavTimer(0);
      return;
    }
    const update = () => {
      setNavTimer(getRemainingSeconds(exam, exam?.current_stage));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [exam?.current_stage, exam?.stage_ends_at, exam?.stage_started_at]);

  const getStatusBadge = () => {
    if (!exam) return null;
    const isStageActive = exam?.current_stage?.endsWith('_active');
    if (exam.status === 'in_progress' || exam.status === 'active' || isStageActive) {
      const stageName = exam.current_stage ? exam.current_stage.replace('_active', '').toUpperCase() : 'EXAM';
      return (
        <Badge variant="brand" pulse size="md">
          LIVE: {stageName} • {formatExamTimer(navTimer)}
        </Badge>
      );
    }
    if (exam.status === 'finished' || exam.current_stage === 'exam_completed' || exam.current_stage === 'writing_finished') {
      return <Badge variant="slate" size="md">EXAM CONCLUDED</Badge>;
    }
    return <Badge variant="success" pulse size="md">LOBBY ACTIVE</Badge>;
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Left: Logo & Clean Title (No subtitle/badges) */}
          <div className="flex items-center gap-2.5 shrink-0 min-w-[140px]">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shadow-2xs">
              <GraduationCap className="w-5 h-5 text-slate-700" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-slate-700">
              IELTS<span className="text-slate-700">Sync</span>
            </span>
          </div>

          {/* Center: Exactly Centered Test Code / PIN */}
          <div className="flex-1 flex items-center justify-center px-2">
            {isStudentOnly || (!isAdminAuthed && student) || currentRole === 'student' ? (
              exam?.pin_code ? (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-mono text-xs shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">EXAM PIN:</span>
                  <span className="font-extrabold tracking-widest text-slate-700 text-sm">{exam.pin_code}</span>
                </div>
              ) : null
            ) : isEditingPin ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border-2 border-slate-400 shadow-xs transition-all">
                <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">PIN:</span>
                <input
                  type="text"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="w-24 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 font-mono font-extrabold text-sm text-slate-700 uppercase focus:outline-none focus:ring-2 focus:ring-slate-400 text-center"
                />
                <button
                  onClick={handleSavePin}
                  className="p-1 text-emerald-600 hover:text-emerald-700 rounded-md hover:bg-emerald-50 transition"
                  title="Save PIN (Immediate Realtime Sync)"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
                <button
                  onClick={handleGeneratePin}
                  className="p-1 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition"
                  title="Generate Random PIN"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div 
                onClick={() => setIsEditingPin(true)}
                className="group flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-xs shadow-2xs hover:bg-slate-200/80 border border-slate-200 cursor-pointer transition-all transform hover:-translate-y-0.5"
                title="Click to edit Session PIN (Instant update across candidates)"
              >
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  PIN
                </span>
                <span className="tracking-wider text-sm font-extrabold text-slate-700">
                  {exam?.pin_code || '—'}
                </span>
                <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-slate-700 transition" />

                <span className="w-px h-3.5 bg-slate-300 mx-0.5" />

                <button
                  type="button"
                  onClick={handleCopyPin}
                  className="text-slate-500 hover:text-slate-800 transition p-0.5"
                  title="Copy PIN"
                >
                  {copiedPin ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right: Only for Teacher / Admin, Clean Spacer for Students */}
          <div className="flex items-center justify-end gap-2.5 shrink-0 min-w-[140px]">
            {isAdminAuthed ? (
              <>
                <button
                  onClick={onToggleSound}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                  title={soundEnabled ? "Mute sounds" : "Enable exam audio alerts"}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4 text-slate-700" /> : <VolumeX className="w-4 h-4" />}
                </button>

                {onOpenSuperAdmin && (
                  <button
                    onClick={onOpenSuperAdmin}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition border border-slate-300 shadow-2xs"
                    title="Open Super-Admin Command Center"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                    Super-Admin
                  </button>
                )}

                {/* Role Switcher Pill for Admin */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => onRoleChange('admin')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      currentRole === 'admin'
                        ? 'bg-white text-slate-900 border border-slate-200 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Teacher View
                  </button>
                  <button
                    onClick={() => onRoleChange('student')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      currentRole === 'student'
                        ? 'bg-white text-slate-900 border border-slate-200 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Student View
                  </button>
                </div>
              </>
            ) : null}
          </div>

        </div>
      </div>
    </header>
  );
}
