import React, { useState, useEffect } from 'react';
import { 
  Play, 
  StopCircle, 
  CheckCircle2, 
  Clock, 
  FileText, 
  PenTool, 
  Headphones, 
  Lock, 
  Coffee, 
  FastForward, 
  Sparkles,
  AlertTriangle,
  Award,
  Check,
  Zap,
  ArrowRight,
  FolderArchive,
  RotateCcw
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { getRemainingSeconds, formatExamTimer } from '../../lib/examTimerUtils';

export function StageControlBar({
  exam,
  students,
  onSetStage,
  onOpenMasterResults,
  onOpenHistory,
  onResetSession,
}) {
  const currentStage = exam.current_stage || (exam.status === 'active' ? 'listening_active' : 'listening_lobby');

  const readingTotalCount = exam.reading?.questions?.length || exam.questions?.length || 40;
  const listeningTotalCount = exam.listening?.questions?.length || 40;

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState(null);

  // 60-second Intermission Break Countdown timers
  // Break before Reading (after Listening finishes)
  const [readingBreakSeconds, setReadingBreakSeconds] = useState(60);
  const [isReadingBreakSkipped, setIsReadingBreakSkipped] = useState(false);

  // Break before Writing (after Reading finishes)
  const [writingBreakSeconds, setWritingBreakSeconds] = useState(60);
  const [isWritingBreakSkipped, setIsWritingBreakSkipped] = useState(false);

  // Active stage countdown timer
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Sync active section countdown timer with Server-Anchored stage_ends_at
  useEffect(() => {
    const isStageActive = currentStage.endsWith('_active');
    if (!isStageActive) {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      const diff = getRemainingSeconds(exam, currentStage);
      setTimeRemaining(diff);

      if (diff <= 0 && isStageActive) {
        if (currentStage === 'listening_active') onSetStage('listening_finished');
        else if (currentStage === 'reading_active') onSetStage('reading_finished');
        else if (currentStage === 'writing_active') onSetStage('exam_completed');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentStage, exam?.stage_ends_at, exam?.stage_started_at]);

  // Handle 60s Break Countdown for Reading (after Listening)
  useEffect(() => {
    if (currentStage !== 'listening_finished' && currentStage !== 'reading_lobby') {
      setReadingBreakSeconds(60);
      setIsReadingBreakSkipped(false);
      return;
    }

    if (isReadingBreakSkipped) return;

    const updateBreak = () => {
      if (exam?.stage_ends_at) {
        const diff = getRemainingSeconds(exam, currentStage);
        setReadingBreakSeconds(diff);
      } else {
        setReadingBreakSeconds((prev) => Math.max(0, prev - 1));
      }
    };

    updateBreak();
    const interval = setInterval(updateBreak, 1000);
    return () => clearInterval(interval);
  }, [currentStage, exam?.stage_ends_at, isReadingBreakSkipped]);

  // Handle 60s Break Countdown for Writing (after Reading)
  useEffect(() => {
    if (currentStage !== 'reading_finished' && currentStage !== 'writing_lobby') {
      setWritingBreakSeconds(60);
      setIsWritingBreakSkipped(false);
      return;
    }

    if (isWritingBreakSkipped) return;

    const updateBreak = () => {
      if (exam?.stage_ends_at) {
        const diff = getRemainingSeconds(exam, currentStage);
        setWritingBreakSeconds(diff);
      } else {
        setWritingBreakSeconds((prev) => Math.max(0, prev - 1));
      }
    };

    updateBreak();
    const interval = setInterval(updateBreak, 1000);
    return () => clearInterval(interval);
  }, [currentStage, exam?.stage_ends_at, isWritingBreakSkipped]);

  const formatSeconds = (sec) => {
    return formatExamTimer(sec);
  };

  // Determine stage status
  // 1. Listening Section
  const isListeningActive = currentStage === 'listening_active';
  const isListeningDone = currentStage !== 'listening_lobby' && currentStage !== 'listening_active';

  // 2. Reading Section (Unlocks only after Listening completes)
  const isReadingLobby = currentStage === 'listening_finished' || currentStage === 'reading_lobby';
  const isReadingActive = currentStage === 'reading_active';
  const isReadingDone = isListeningDone && currentStage !== 'listening_finished' && currentStage !== 'reading_lobby' && currentStage !== 'reading_active';

  // 3. Writing Section (Unlocks only after Reading completes)
  const isWritingLobby = currentStage === 'reading_finished' || currentStage === 'writing_lobby';
  const isWritingActive = currentStage === 'writing_active';
  const isWritingDone = isReadingDone && currentStage !== 'reading_finished' && currentStage !== 'writing_lobby' && currentStage !== 'writing_active';

  const isExamConcluded = currentStage === 'exam_completed' || currentStage === 'writing_finished';

  const handleTriggerAction = (targetStage, title, description) => {
    if (targetStage.endsWith('_finished') || targetStage === 'exam_completed') {
      setConfirmModal({
        targetStage,
        title,
        description
      });
    } else {
      onSetStage(targetStage);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center font-extrabold shadow-sm border border-brand-100">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Sequential 3-Stage Section Manager
              </h2>
              <Badge variant="brand" size="sm">STEP-BY-STEP PROCTORING</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Control the sequence: <strong className="text-slate-800">1. Listening ({exam.listening_duration_mins || 35}m)</strong> → <strong className="text-slate-800">2. Reading ({exam.reading_duration_mins || 60}m)</strong> → <strong className="text-slate-800">3. Writing ({exam.writing_duration_mins || 60}m)</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            Session PIN: <strong className="text-brand-600 font-extrabold">{exam.pin_code}</strong>
          </span>
          {isExamConcluded && (
            <>
              {onOpenHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={FolderArchive}
                  onClick={onOpenHistory}
                  className="font-bold text-xs border-brand-300 text-brand-700 hover:bg-brand-50"
                >
                  Exam History
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                icon={Award}
                onClick={onOpenMasterResults}
                className="font-bold text-xs"
              >
                Master Gradebook
              </Button>
              {onResetSession && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={RotateCcw}
                  onClick={onResetSession}
                  className="shadow-glow font-extrabold text-xs"
                >
                  Start New Session (Reset)
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3 Dedicated Vertical Rows: LISTENING -> READING -> WRITING */}
      <div className="space-y-4">
        
        {/* ========================================================================= */}
        {/* ROW 1: LISTENING SECTION (TOP - FIRST) */}
        {/* ========================================================================= */}
        <div className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isListeningActive
            ? 'bg-orange-50/70 border-brand-300 ring-2 ring-brand-500/20 shadow-sm'
            : isListeningDone
            ? 'bg-emerald-50/40 border-emerald-200'
            : 'bg-white border-slate-200 hover:border-slate-300'
        }`}>
          
          {/* Left info */}
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
              isListeningDone
                ? 'bg-emerald-600 text-white'
                : isListeningActive
                ? 'bg-slate-200 text-slate-900 border border-slate-300 shadow-2xs animate-pulse'
                : 'bg-slate-100 text-slate-800 border border-slate-200'
            }`}>
              {isListeningDone ? <Check className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  1. Listening Section
                </h3>
                
                {isListeningDone ? (
                  <Badge variant="success" size="sm">
                    <CheckCircle2 className="w-3 h-3" /> FINISHED & LOCKED
                  </Badge>
                ) : isListeningActive ? (
                  <Badge variant="brand" pulse size="sm">
                    ● IN PROGRESS (AUDIO ACTIVE)
                  </Badge>
                ) : (
                  <Badge variant="default" size="sm">
                    READY TO LAUNCH
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span>4 Audio Parts • {listeningTotalCount} Questions</span>
                <span>•</span>
                <span className="font-mono font-bold text-slate-700">
                  {isListeningActive ? (
                    <span className="text-brand-600 font-extrabold">{formatSeconds(timeRemaining)} remaining</span>
                  ) : isListeningDone ? (
                    <span className="text-emerald-700 font-semibold">Answers Frozen</span>
                  ) : (
                    <span>Duration: {exam.listening_duration_mins || 35} mins</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Right Action */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {!isListeningDone && !isListeningActive && (
              <Button
                variant="primary"
                size="md"
                icon={Play}
                onClick={() => handleTriggerAction('listening_active', 'Start Listening Section', 'Synchronously starts the Listening section and audio tracks for all connected candidates.')}
                disabled={students.length === 0}
                className="w-full sm:w-auto shadow-2xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300"
              >
                Start Listening ({students.length})
              </Button>
            )}

            {isListeningActive && (
              <Button
                variant="danger"
                size="md"
                icon={StopCircle}
                onClick={() => handleTriggerAction('listening_finished', 'End Listening Section', 'Immediately freezes all listening answer sheets and starts the intermission break before Reading.')}
                className="w-full sm:w-auto font-bold"
              >
                End Listening (Stop & Collect)
              </Button>
            )}

            {isListeningDone && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100/70 text-emerald-800 font-bold text-xs border border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Listening Completed</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ROW 2: READING SECTION (MIDDLE - UNLOCKS AFTER LISTENING) */}
        {/* ========================================================================= */}
        <div className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          !isListeningDone
            ? 'opacity-50 bg-slate-50 border-slate-200 pointer-events-none'
            : isReadingActive
            ? 'bg-orange-50/70 border-brand-300 ring-2 ring-brand-500/20 shadow-sm'
            : isReadingDone
            ? 'bg-emerald-50/40 border-emerald-200'
            : 'bg-white border-slate-200'
        }`}>
          
          {/* Left info */}
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
              !isListeningDone
                ? 'bg-slate-200 text-slate-400'
                : isReadingDone
                ? 'bg-emerald-600 text-white'
                : isReadingActive
                ? 'bg-slate-200 text-slate-900 border border-slate-300 shadow-2xs animate-pulse'
                : 'bg-slate-100 text-slate-800 border border-slate-200'
            }`}>
              {!isListeningDone ? <Lock className="w-5 h-5" /> : isReadingDone ? <Check className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  2. Reading Section
                </h3>
                
                {!isListeningDone ? (
                  <Badge variant="default" size="sm">
                    <Lock className="w-3 h-3" /> LOCKED (AWAITING LISTENING)
                  </Badge>
                ) : isReadingDone ? (
                  <Badge variant="success" size="sm">
                    <CheckCircle2 className="w-3 h-3" /> FINISHED & LOCKED
                  </Badge>
                ) : isReadingActive ? (
                  <Badge variant="brand" pulse size="sm">
                    ● IN PROGRESS
                  </Badge>
                ) : isReadingLobby && readingBreakSeconds > 0 && !isReadingBreakSkipped ? (
                  <Badge variant="warning" pulse size="sm">
                    <Coffee className="w-3 h-3" /> BREAK / TRANSITION: {formatSeconds(readingBreakSeconds)}
                  </Badge>
                ) : (
                  <Badge variant="brand" size="sm">
                    READY TO START
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span>3 Passages • {readingTotalCount} Questions</span>
                <span>•</span>
                <span className="font-mono font-bold text-slate-700">
                  {isReadingActive ? (
                    <span className="text-brand-600 font-extrabold">{formatSeconds(timeRemaining)} remaining</span>
                  ) : isReadingDone ? (
                    <span className="text-emerald-700 font-semibold">Answers Frozen</span>
                  ) : (
                    <span>Duration: {exam.reading_duration_mins || 60} mins</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Right Action */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {!isListeningDone ? (
              <span className="text-xs font-semibold text-slate-400 italic">
                Unlocks after Listening
              </span>
            ) : !isReadingDone && !isReadingActive ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {readingBreakSeconds > 0 && !isReadingBreakSkipped ? (
                  <>
                    <Button
                      variant="primary"
                      size="md"
                      icon={Play}
                      onClick={() => handleTriggerAction('reading_active', 'Start Reading Section', 'Synchronously starts the 60-minute Reading section for all connected candidates.')}
                      className="shadow-glow font-bold"
                    >
                      Start Reading ({formatSeconds(readingBreakSeconds)})
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    icon={Play}
                    onClick={() => handleTriggerAction('reading_active', 'Start Reading Section', 'Synchronously starts the 60-minute Reading section for all connected candidates.')}
                    className="w-full sm:w-auto shadow-glow font-bold"
                  >
                    Start Reading Section
                  </Button>
                )}
              </div>
            ) : isReadingActive ? (
              <Button
                variant="danger"
                size="md"
                icon={StopCircle}
                onClick={() => handleTriggerAction('reading_finished', 'End Reading Section', 'Immediately freezes all reading answer sheets and starts the intermission before Writing.')}
                className="w-full sm:w-auto font-bold"
              >
                End Reading (Stop & Collect)
              </Button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100/70 text-emerald-800 font-bold text-xs border border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Reading Completed</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ROW 3: WRITING SECTION (BOTTOM - FINAL SECTION) */}
        {/* ========================================================================= */}
        <div className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          !isReadingDone
            ? 'opacity-50 bg-slate-50 border-slate-200 pointer-events-none'
            : isWritingActive
            ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/20 shadow-sm'
            : isWritingDone
            ? 'bg-emerald-50/40 border-emerald-200'
            : 'bg-white border-slate-200'
        }`}>
          
          {/* Left info */}
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
              !isReadingDone
                ? 'bg-slate-200 text-slate-400'
                : isWritingDone
                ? 'bg-emerald-600 text-white'
                : isWritingActive
                ? 'bg-amber-500 text-white shadow-glow shadow-amber-500/30 animate-pulse'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {!isReadingDone ? <Lock className="w-5 h-5" /> : isWritingDone ? <Check className="w-5 h-5" /> : <PenTool className="w-5 h-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  3. Writing Section
                </h3>
                
                {!isReadingDone ? (
                  <Badge variant="default" size="sm">
                    <Lock className="w-3 h-3" /> LOCKED (AWAITING READING)
                  </Badge>
                ) : isWritingDone ? (
                  <Badge variant="success" size="sm">
                    <CheckCircle2 className="w-3 h-3" /> EXAM CONCLUDED
                  </Badge>
                ) : isWritingActive ? (
                  <Badge variant="brand" pulse size="sm" className="bg-amber-500/20 text-amber-700 border-amber-300">
                    ● IN PROGRESS
                  </Badge>
                ) : isWritingLobby && writingBreakSeconds > 0 && !isWritingBreakSkipped ? (
                  <Badge variant="warning" pulse size="sm">
                    <Coffee className="w-3 h-3" /> BREAK / TRANSITION: {formatSeconds(writingBreakSeconds)}
                  </Badge>
                ) : (
                  <Badge variant="brand" size="sm">
                    READY TO START
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span>Task 1 (Report) & Task 2 (Essay)</span>
                <span>•</span>
                <span className="font-mono font-bold text-slate-700">
                  {isWritingActive ? (
                    <span className="text-amber-600 font-extrabold">{formatSeconds(timeRemaining)} remaining</span>
                  ) : isWritingDone ? (
                    <span className="text-emerald-700 font-semibold">Essays Locked</span>
                  ) : (
                    <span>Duration: {exam.writing_duration_mins || 60} mins</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Right Action */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {!isReadingDone ? (
              <span className="text-xs font-semibold text-slate-400 italic">
                Unlocks after Reading
              </span>
            ) : !isWritingDone && !isWritingActive ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {writingBreakSeconds > 0 && !isWritingBreakSkipped ? (
                  <>
                    <Button
                      variant="primary"
                      size="md"
                      icon={Play}
                      onClick={() => handleTriggerAction('writing_active', 'Start Writing Section', 'Launches the 60-minute Writing section prompts on student screens.')}
                      className="shadow-glow font-bold bg-amber-600 hover:bg-amber-700"
                    >
                      Start Writing ({formatSeconds(writingBreakSeconds)})
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    icon={Play}
                    onClick={() => handleTriggerAction('writing_active', 'Start Writing Section', 'Launches the 60-minute Writing section prompts on student screens.')}
                    className="w-full sm:w-auto shadow-glow font-bold bg-amber-600 hover:bg-amber-700"
                  >
                    Start Writing Section
                  </Button>
                )}
              </div>
            ) : isWritingActive ? (
              <Button
                variant="danger"
                size="md"
                icon={StopCircle}
                onClick={() => handleTriggerAction('exam_completed', 'End Entire Exam', 'Concludes the examination cycle for all students and reveals grading results.')}
                className="w-full sm:w-auto font-bold"
              >
                End Entire Exam
              </Button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100/70 text-emerald-800 font-bold text-xs border border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Writing Completed</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Confirmation Action Modal */}
      {confirmModal && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmModal(null)}
          title={`Confirm Action: ${confirmModal.title}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <p className="text-xs leading-relaxed font-semibold">
                {confirmModal.description}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  onSetStage(confirmModal.targetStage);
                  setConfirmModal(null);
                }}
                className="font-bold"
              >
                Confirm & Proceed
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
