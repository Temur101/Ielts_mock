import React, { useEffect, useState, useRef } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  XCircle, 
  Maximize2, 
  Minimize2, 
  Radio 
} from 'lucide-react';
import { Button } from '../common/Button';
import { isAdminAuthenticated } from '../admin/AdminPasswordModal';

export function AntiCheatOverlay({
  exam,
  student,
  isExamActive,
  onDisqualify,
  onWarn,
}) {
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningTimer, setWarningTimer] = useState(10);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prevWarnCountRef = useRef(student?.warning_count || 0);

  const isAdminAuthed = isAdminAuthenticated();

  // Watch for instructor-initiated focus warnings
  useEffect(() => {
    if (isAdminAuthed) return;
    const currentCount = student?.warning_count || 0;
    if (currentCount > prevWarnCountRef.current) {
      setWarningModalOpen(true);
      setWarningTimer(10);
    }
    prevWarnCountRef.current = currentCount;
  }, [student?.warning_count, isAdminAuthed]);

  // Fullscreen state listener
  useEffect(() => {
    if (isAdminAuthed) return;
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [isAdminAuthed]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn("Fullscreen request failed:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Anti-Cheat Blur & Tab-switch Event Listeners
  useEffect(() => {
    if (isAdminAuthed) return;
    if (!isExamActive || student?.status !== 'in_progress') return;

    const handleViolation = (reason) => {
      const strictness = exam.anti_cheat_strictness || 'strict';

      if (strictness === 'strict') {
        onDisqualify(`Defocus detected: ${reason}`);
      } else if (strictness === 'warning') {
        if ((student.warning_count || 0) >= 1) {
          onDisqualify(`Exceeded 1 warning limit: ${reason}`);
        } else {
          onWarn(reason);
          setWarningModalOpen(true);
          setWarningTimer(10);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleViolation("Switched browser tab / window minimized");
      }
    };

    const handleWindowBlur = () => {
      handleViolation("Clicked outside exam window or lost focus");
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isExamActive, student?.status, student?.warning_count, exam.anti_cheat_strictness]);

  // Warning modal countdown
  useEffect(() => {
    if (!warningModalOpen) return;
    const interval = setInterval(() => {
      setWarningTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setWarningModalOpen(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [warningModalOpen]);

  // If admin is testing/proctoring, bypass all anti-cheat modals and overlays
  if (isAdminAuthed) {
    return null;
  }

  // If Student is Disqualified
  if (student?.status === 'disqualified' || student?.status === 'kicked') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-5 border border-rose-200 shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
            <XCircle className="w-10 h-10" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-slate-900">
              Exam Disqualified
            </h2>
            <p className="text-xs text-rose-600 font-semibold">
              {student.disqualification_reason || 'Anti-cheat integrity violation triggered.'}
            </p>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Your exam session has been terminated by the classroom proctoring system. Your score is recorded as 0 and your instructor has been notified in real time.
          </p>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-700">
            Candidate: <strong>{student.name}</strong> ({student.candidate_no})
          </div>

          {/* Official Disqualification Notice (Bypasses excised) */}
          <div className="pt-3 border-t border-slate-100 text-center">
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700">
              Disqualification is recorded. Workstation locked until authorized by instructor.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Warning Modal Overlay (in Warning strictness mode)
  if (warningModalOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 text-center space-y-4 border border-amber-300 shadow-2xl animate-bounce-short">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <h3 className="text-lg font-bold text-slate-900">
            Anti-Cheat Warning (1 of 1)
          </h3>

          <p className="text-xs text-slate-600">
            You left the exam window or switched tabs. Another violation will result in immediate disqualification.
          </p>

          <div className="text-xs font-bold text-amber-600">
            Auto-closing warning in {warningTimer}s...
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => setWarningModalOpen(false)}
            className="w-full"
          >
            I Understand — Return to Exam
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
