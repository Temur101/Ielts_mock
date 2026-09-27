import React, { useState } from 'react';
import { 
  Users, 
  Play, 
  Wifi, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  Check, 
  Sparkles,
  Layers,
  FileText,
  PenTool,
  Headphones,
  Award
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { calculateStageDurationSeconds, formatExamTimer } from '../../lib/examTimerUtils';

export function LiveLobby({ 
  exam, 
  students, 
  onStartExam, 
  onOpenLobby,
  onSetStage,
  onResetSession,
  onOpenMasterResults,
  onKickStudent 
}) {
  const [copiedPin, setCopiedPin] = useState(false);

  const handleCopyPin = () => {
    if (!exam?.pin_code) return;
    navigator.clipboard.writeText(exam.pin_code);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const currentStage = exam.current_stage || 'listening_lobby';
  const isExamConcluded = currentStage === 'exam_completed' || currentStage === 'writing_finished' || exam.status === 'finished';
  const isLobbyOpen = exam.is_lobby_open || false;

  // Filter candidates strictly for current exam session
  const examStudents = (students || []).filter(s => {
    if (!exam?.id) return true;
    return !s.exam_id || s.exam_id === exam.id;
  });

  const waitingCount = examStudents.filter(s => {
    if (isExamConcluded) return false;
    if (currentStage === 'reading_lobby') return s.reading_status === 'lobby' || s.listening_status === 'completed';
    if (currentStage === 'writing_lobby') return s.writing_status === 'lobby' || s.reading_status === 'completed';
    return s.status === 'waiting' || s.status === 'in_progress';
  }).length;

  const handleStartListeningClick = () => {
    if (!isLobbyOpen && onOpenLobby) {
      onOpenLobby();
      return;
    }
    if (onSetStage) {
      onSetStage('listening_active');
    } else if (onStartExam) {
      onStartExam();
    }
  };

  const listeningDurationSec = calculateStageDurationSeconds('listening_active', exam);
  const listeningDurationMins = Math.round(listeningDurationSec / 60);

  return (
    <div className="space-y-6">

      {/* Hero Master Control Card - Only visible when Lobby is NOT opened yet */}
      {!isLobbyOpen && !isExamConcluded && (
        <div className="relative overflow-hidden bg-white rounded-3xl p-8 text-slate-900 shadow-sm border-2 border-brand-300 animate-fadeIn">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-72 h-72 bg-orange-100/50 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <Badge variant="brand" pulse size="sm">
                  STAGE 1: LISTENING CLASSROOM LOBBY
                </Badge>
                <span className="text-xs font-mono text-slate-500 font-semibold">
                  Duration: {listeningDurationMins} mins ({formatExamTimer(listeningDurationSec)})
                </span>
              </div>
              
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                {exam.title || "IELTS Academic Master Assessment 2026"}
              </h2>
              
              <p className="text-sm text-slate-600">
                Click START LISTENING FOR ALL to activate the 3-stage proctoring manager and allow candidates to enter via the Session PIN.
              </p>
            </div>

            {/* Master Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <div 
                onClick={handleCopyPin}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-orange-50 border-2 border-brand-300 hover:border-brand-500 cursor-pointer transition shadow-xs"
              >
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Candidate PIN</div>
                  <div className="text-xl font-mono font-extrabold text-brand-600 tracking-wider">
                    {exam.pin_code}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-white text-brand-600 border border-brand-200">
                  {copiedPin ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                icon={Play}
                onClick={handleStartListeningClick}
                className="py-4 text-base font-extrabold shadow-glow-lg whitespace-nowrap bg-brand-500 hover:bg-brand-600 text-white"
              >
                START LISTENING FOR ALL ({examStudents.length})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting Room Roster Bar */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Connected Candidates ({examStudents.length})
            </h3>
            <p className="text-xs text-slate-500">
              Real-time WebSocket / Broadcast heartbeat active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bot test button excised */}
        </div>
      </div>

      {/* Student Cards Grid */}
      {examStudents.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center space-y-3">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <h4 className="text-base font-bold text-slate-700">No Candidates in Waiting Room</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Direct candidates to enter Session PIN <strong className="font-mono text-brand-600">{exam.pin_code}</strong> on the candidate portal to join the waiting room.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {examStudents.map((student, sIdx) => {
            if (!student) return null;
            const isReadyInLobby = (currentStage === 'reading_lobby' && (student.reading_status === 'lobby' || student.listening_status === 'completed')) ||
                                  (currentStage === 'writing_lobby' && (student.writing_status === 'lobby' || student.reading_status === 'completed')) ||
                                  (currentStage === 'listening_lobby' && (student.status === 'waiting' || student.status === 'in_progress'));

            const studentInitial = (student.name || 'S').trim().charAt(0).toUpperCase() || 'S';

            return (
              <div 
                key={student.id || sIdx}
                className="group bg-white p-4 rounded-2xl border border-slate-200 hover:border-brand-300 shadow-card hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 font-bold text-slate-700 flex items-center justify-center text-sm">
                      {studentInitial}
                    </div>
                    <Badge variant={isReadyInLobby ? "success" : "warning"} pulse={isReadyInLobby} size="sm">
                      {isReadyInLobby ? "READY IN LOBBY" : "TRANSITIONING"}
                    </Badge>
                  </div>

                  <div className="mt-3">
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-brand-600 transition truncate">
                      {student.name || 'Candidate'}
                    </h4>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">
                      {student.candidate_no || 'ID-0000'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-600">
                    <Wifi className="w-3 h-3" />
                    <span>{student.ping_ms ? `${student.ping_ms}ms` : '—'}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onKickStudent && onKickStudent(student.id)}
                    className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg font-semibold transition cursor-pointer"
                    title="Remove student from waiting room"
                  >
                    Kick
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
