import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  CheckCircle2, 
  Lock, 
  ShieldCheck, 
  FileCheck, 
  Clock, 
  Send,
  Sparkles,
  Award,
  Users
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { LogOut, RotateCcw } from 'lucide-react';

export function ResultsScreen({ student, exam, onExit }) {
  useEffect(() => {
    // Gentle celebration confetti upon successful lock & transmission
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#f97316', '#ea580c', '#38bdf8', '#34d399']
      });
    } catch (e) {
      // ignore
    }
  }, []);

  const submissionTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-xl space-y-6 text-center animate-in fade-in zoom-in duration-200">
        
        {/* Success Icon with Glowing Orange & Emerald Ring */}
        <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <CheckCircle2 className="w-10 h-10" />
          </div>
        </div>

        {/* Header Confirmation Message */}
        <div className="space-y-2">
          <Badge variant="success" size="md">SUBMISSION ENCRYPTED & DELIVERED</Badge>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Exam Concluded
          </h2>
          <p className="text-sm font-semibold text-slate-700">
            Thank you for completing the test. Your answers have been securely submitted to your instructor.
          </p>
        </div>

        {/* Strict Privacy & No Student Results Policy Card */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-200">
            <Lock className="w-4 h-4 text-brand-600" />
            Classroom Security & Privacy Protocol
          </div>
          
          <p className="text-xs text-slate-600 leading-relaxed">
            In accordance with the classroom examination rules, individual band scores, question breakdowns, and answer keys are not displayed on candidate devices. Your complete answer sheets (Reading, Listening, and Writing) have been securely routed to your instructor’s grading workspace.
          </p>

          <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Candidate Name</div>
              <div className="font-bold text-slate-900 truncate">{student.name}</div>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Candidate ID</div>
              <div className="font-mono font-bold text-brand-600 truncate">{student.candidate_no}</div>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Session PIN</div>
              <div className="font-mono font-bold text-slate-800">{exam.pin_code}</div>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Submitted At</div>
              <div className="font-mono font-semibold text-slate-700">{submissionTime}</div>
            </div>
          </div>
        </div>

        {/* Section Verification Chips */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="text-[10px] font-bold text-emerald-800 uppercase">Reading</div>
            <div className="text-xs font-bold text-emerald-700 mt-0.5">● Locked</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="text-[10px] font-bold text-emerald-800 uppercase">Listening</div>
            <div className="text-xs font-bold text-emerald-700 mt-0.5">● Locked</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="text-[10px] font-bold text-emerald-800 uppercase">Writing</div>
            <div className="text-xs font-bold text-emerald-700 mt-0.5">● Locked</div>
          </div>
        </div>

        {/* Instructions & Next Steps */}
        <div className="p-3 bg-brand-50/60 rounded-xl border border-brand-200/70 text-xs text-brand-900 text-left flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          <span>
            Please wait quietly for the session to conclude. Your teacher will publish official feedback and band scores in the cohort gradebook.
          </span>
        </div>

        {/* Exit & Register New Candidate Button */}
        {onExit && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="md"
              icon={LogOut}
              onClick={onExit}
              className="w-full text-xs font-bold text-slate-600 hover:text-slate-900 border-slate-300 hover:bg-slate-50"
            >
              Exit Exam & Register New Candidate
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
