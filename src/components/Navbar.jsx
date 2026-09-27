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
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white shadow-glow shadow-brand-500/30">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">
                  IELTS<span className="text-brand-500">Sync</span>
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-100 text-brand-700 border border-brand-200 shadow-xs">
                  Proctor Suite
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Full-Stack Real-Time Assessment Platform
              </p>
            </div>
          </div>

          {/* Center: Session Status & Glowing Orange Session PIN Badge */}
          <div className="hidden md:flex items-center gap-4">
            {getStatusBadge()}

            {/* Dynamic Editable Glowing Orange Pill Badge */}
            <div className="relative flex items-center">
              {isStudentOnly || (!isAdminAuthed && student) || currentRole === 'student' ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-brand-300 text-brand-700 font-mono font-bold text-xs shadow-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-brand-500">EXAM PIN:</span>
                  <span className="font-extrabold tracking-wider">{exam?.pin_code || '—'}</span>
                </div>
              ) : isEditingPin ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border-2 border-brand-500 shadow-glow transition-all">
                  <span className="text-[11px] font-extrabold text-brand-700 uppercase tracking-wider">PIN:</span>
                  <input
                    type="text"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="w-24 bg-white border border-brand-300 rounded-lg px-2 py-0.5 font-mono font-extrabold text-sm text-brand-600 uppercase focus:outline-none focus:ring-2 focus:ring-brand-500 text-center"
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
                    className="p-1 text-slate-500 hover:text-brand-600 rounded-md hover:bg-orange-100 transition"
                    title="Generate Random PIN"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div 
                  onClick={() => setIsEditingPin(true)}
                  className="group flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-brand-600 text-white font-mono font-bold text-xs shadow-glow hover:shadow-glow-lg border border-orange-400 cursor-pointer transition-all transform hover:-translate-y-0.5"
                  title="Click to edit Session PIN (Instant update across candidates)"
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-100">
                    PIN
                  </span>
                  <span className="tracking-wider text-sm font-extrabold">
                    {exam?.pin_code || '—'}
                  </span>
                  <Edit2 className="w-3 h-3 text-orange-200 group-hover:text-white transition" />

                  <span className="w-px h-3.5 bg-orange-400/80 mx-0.5" />

                  <button
                    type="button"
                    onClick={handleCopyPin}
                    className="text-orange-200 hover:text-white transition p-0.5"
                    title="Copy PIN"
                  >
                    {copiedPin ? (
                      <Check className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Role Switcher & Utilities */}
          <div className="flex items-center gap-2.5">
            {/* Audio Toggle */}
            <button
              onClick={onToggleSound}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
              title={soundEnabled ? "Mute sounds" : "Enable exam audio alerts"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-brand-500" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Show controls ALWAYS if admin is authenticated (even while taking a test), or when not in student-only mode */}
            {(isAdminAuthed || (!isStudentOnly && !student)) && (
              <>
                {onOpenSuperAdmin && (
                  <button
                    onClick={onOpenSuperAdmin}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs"
                    title="Open Super-Admin Command Center"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
                    Super-Admin
                  </button>
                )}

                {/* Role Switcher Pill */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => onRoleChange('admin')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      currentRole === 'admin'
                        ? 'bg-white text-brand-600 shadow-sm'
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
                        ? 'bg-white text-brand-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    {isAdminAuthed ? 'Student (Test)' : 'Student View'}
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
