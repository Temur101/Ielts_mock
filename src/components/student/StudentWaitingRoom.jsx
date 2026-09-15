import React, { useEffect } from 'react';
import { 
  Clock, 
  Wifi, 
  ShieldCheck, 
  AlertCircle, 
  FileText, 
  CheckCircle2, 
  Radio,
  Sparkles,
  Play,
  LogOut,
  ArrowRight
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

export function StudentWaitingRoom({ exam, student, onStartSolo, onLeave }) {
  const isExamActive = exam?.status === 'active';

  // If exam becomes active, notify/auto-trigger
  useEffect(() => {
    if (isExamActive && onStartSolo) {
      const timer = setTimeout(() => {
        onStartSolo();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isExamActive, onStartSolo]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6 text-center">
        
        {/* Animated Radar Pulse */}
        <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-30" />
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-brand-500 to-brand-600 text-white flex items-center justify-center shadow-glow shadow-brand-500/30">
            <Radio className="w-8 h-8 animate-pulse" />
          </div>
        </div>

        {/* Status Header */}
        <div className="space-y-1.5">
          <Badge variant={isExamActive ? "brand" : "success"} pulse size="md">
            {isExamActive ? "LIVE EXAM IN PROGRESS" : "CONNECTED TO CLASSROOM"}
          </Badge>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {isExamActive 
              ? "Exam has Started! Entering Room..." 
              : "Waiting for Instructor to Start Exam..."}
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isExamActive
              ? "Your examination session is live. Click below to enter the exam room immediately."
              : "Please keep this tab open and active. Your timer and exam paper will automatically synchronize when the instructor clicks start."}
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
          {isExamActive && onStartSolo && (
            <Button
              variant="primary"
              size="md"
              icon={ArrowRight}
              onClick={onStartSolo}
              className="w-full sm:w-auto font-extrabold shadow-glow"
            >
              Enter Exam Room Now
            </Button>
          )}

          {onLeave && (
            <Button
              variant="ghost"
              size="md"
              icon={LogOut}
              onClick={onLeave}
              className="w-full sm:w-auto text-slate-500 hover:text-slate-700"
            >
              Change Name / Leave
            </Button>
          )}
        </div>

        {/* Candidate & Session Info Card */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Candidate Name</div>
              <div className="text-sm font-bold text-slate-900">{student.name}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400">Candidate Number</div>
              <div className="text-xs font-mono font-bold text-brand-600">{student.candidate_no}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-white border border-slate-200">
              <div className="text-[10px] text-slate-400 font-semibold">Duration</div>
              <div className="font-bold text-slate-800">{exam.duration_mins || 60} mins</div>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-200">
              <div className="text-[10px] text-slate-400 font-semibold">Questions</div>
              <div className="font-bold text-slate-800">40 Items</div>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-200">
              <div className="text-[10px] text-slate-400 font-semibold">Realtime Ping</div>
              <div className="font-mono font-bold text-emerald-600 flex items-center justify-center gap-1">
                <Wifi className="w-3 h-3" />
                {student.ping_ms || 24}ms
              </div>
            </div>
          </div>
        </div>

        {/* Anti-Cheat & Rules Reminder */}
        <div className="text-left bg-brand-50/50 p-4 rounded-2xl border border-brand-200/60 space-y-2">
          <div className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-brand-600" />
            Important Exam Instructions:
          </div>
          <ul className="text-xs text-brand-900/80 space-y-1 list-disc list-inside">
            <li>Do not switch tabs, minimize the browser, or click outside the window.</li>
            <li>The test contains 3 Reading Passages with 40 questions in total.</li>
            <li>Answers are automatically saved in real-time as you type or select.</li>
            <li>All student countdowns will synchronize immediately upon start.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
