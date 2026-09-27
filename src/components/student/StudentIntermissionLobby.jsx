import React from 'react';
import { 
  Coffee, 
  Clock, 
  Lock, 
  CheckCircle2, 
  Sparkles, 
  FileText, 
  PenTool, 
  Headphones, 
  ShieldCheck, 
  Wifi,
  Info,
  Radio,
  ArrowRight
} from 'lucide-react';
import { Badge } from '../common/Badge';

export function StudentIntermissionLobby({ 
  student, 
  exam, 
  completedSection = 'reading',
  nextSection = 'writing' 
}) {
  const getSectionDetails = (sec) => {
    switch (sec) {
      case 'reading':
        return {
          title: 'Reading Section',
          icon: FileText,
          duration: exam.reading_duration_mins || 60,
          desc: '3 Passages • 40 Academic Questions',
          color: 'brand'
        };
      case 'writing':
        return {
          title: 'Writing Section',
          icon: PenTool,
          duration: exam.writing_duration_mins || 60,
          desc: 'Task 1 (Report, 150+ words) & Task 2 (Essay, 250+ words)',
          color: 'brand',
          tips: [
            'Spend approximately 20 minutes on Task 1 and 40 minutes on Task 2.',
            'Maintain formal academic style and accurate paragraphing.',
            'Task 2 contributes twice as much as Task 1 toward your Writing band score.'
          ]
        };
      case 'listening':
        return {
          title: 'Listening Section',
          icon: Headphones,
          duration: exam.listening_duration_mins || 35,
          desc: '4 Audio Parts • 40 Questions • Audio plays once',
          color: 'sky',
          tips: [
            'Ensure your headphones or audio output are plugged in and adjusted.',
            'Audio tracks play only once without rewinding.',
            'Transfer and verify all spellings carefully before the timer ends.'
          ]
        };
      default:
        return {
          title: 'Next Section',
          icon: FileText,
          duration: 60,
          desc: 'Academic Test Module',
          color: 'brand'
        };
    }
  };

  const completedInfo = getSectionDetails(completedSection);
  const nextInfo = getSectionDetails(nextSection);
  const NextIcon = nextInfo.icon;
  const CompletedIcon = completedInfo.icon;

  return (
    <div className="min-h-[85vh] max-w-4xl mx-auto px-4 py-8 flex flex-col justify-center">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Top Glowing Intermission Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-brand-950 p-6 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-brand-500/20 text-brand-300 border border-brand-500/40">
                  <Coffee className="w-3.5 h-3.5" /> INTERMISSION BREAK
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {completedInfo.title} Complete
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Take a Short Break
              </h2>
              <p className="text-sm text-slate-300">
                Your responses for {completedInfo.title} have been securely locked and transmitted.
              </p>
            </div>

            {/* Pulsing Live Examiner Radar */}
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10">
              <div className="relative flex items-center justify-center">
                <span className="w-3 h-3 rounded-full bg-brand-400 animate-ping absolute" />
                <span className="w-3 h-3 rounded-full bg-brand-500 relative" />
              </div>
              <div className="text-left">
                <div className="text-[10px] uppercase font-bold text-slate-400">Examiner Status</div>
                <div className="text-xs font-extrabold text-brand-300">Synchronizing Room...</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Main Waiting Card */}
          <div className="p-6 bg-brand-50/70 rounded-2xl border border-brand-200/80 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-500 text-white flex items-center justify-center mx-auto shadow-md shadow-brand-500/30 animate-pulse">
              <Radio className="w-6 h-6" />
            </div>
            
            <h3 className="text-lg font-bold text-slate-900">
              Section ended. Please wait for the examiner to begin the next stage.
            </h3>
            
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
              Your responses for {completedInfo.title} have been securely locked. When your examiner starts the {nextInfo.title} from the master console, this screen will automatically launch the test. <span className="font-semibold text-slate-800">Do not refresh or close this tab.</span>
            </p>
          </div>

          {/* Next Stage Preview Box */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <NextIcon className="w-4 h-4 text-brand-600" />
                Next Up: {nextInfo.title}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 bg-white px-3 py-1 rounded-xl border border-slate-200">
                <Clock className="w-3.5 h-3.5 text-brand-500" />
                Duration: {nextInfo.duration} mins
              </div>
            </div>

            <p className="text-xs font-semibold text-slate-700">
              {nextInfo.desc}
            </p>

            {nextInfo.tips && nextInfo.tips.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Section Tips:</div>
                <ul className="space-y-1 text-xs text-slate-600">
                  {nextInfo.tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Student Identification Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Candidate</div>
              <div className="font-bold text-slate-900 truncate mt-0.5">{student.name}</div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Candidate No</div>
              <div className="font-mono font-bold text-brand-600 truncate mt-0.5">{student.candidate_no}</div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Session PIN</div>
              <div className="font-mono font-bold text-slate-800 mt-0.5">{exam.pin_code}</div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400">Connection</div>
              <div className="flex items-center gap-1 font-mono font-bold text-emerald-600 mt-0.5">
                <Wifi className="w-3.5 h-3.5" />
                <span>{student.ping_ms ? `${student.ping_ms}ms (Active)` : 'Connected'}</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
