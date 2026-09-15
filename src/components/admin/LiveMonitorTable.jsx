import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Clock, 
  StopCircle, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Eye, 
  UserX, 
  Bell, 
  Search, 
  Download, 
  Award,
  Zap,
  PenTool,
  Headphones,
  FileText,
  Radio,
  Sliders,
  CheckCheck,
  Coffee,
  Lock,
  Sparkles
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { TeacherGradingWorkspace } from './TeacherGradingWorkspace';

export function LiveMonitorTable({
  exam,
  students,
  onForceEndExam,
  onSetStage,
  onKickStudent,
  onUnbanStudent,
  onWarnStudent,
  onOpenAnalytics,
  onSaveGrades,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentForGrading, setSelectedStudentForGrading] = useState(null);

  const currentStage = exam.current_stage || (exam.status === 'active' ? 'listening_active' : 'listening_lobby');
  const isExamConcluded = currentStage === 'exam_completed' || currentStage === 'writing_finished';

  const readingTotalQs = exam.reading?.questions?.length || exam.questions?.length || 40;
  const listeningTotalQs = exam.listening?.questions?.length || 40;

  const filteredStudents = students.filter(s => 
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.candidate_no && s.candidate_no.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const activeCount = students.filter(s => s.status === 'in_progress' || s.status === 'waiting').length;
  const inLobbyCount = students.filter(s => s.writing_status === 'lobby' || s.listening_status === 'lobby' || s.status === 'waiting').length;
  const submittedCount = students.filter(s => s.status === 'submitted').length;
  const dqCount = students.filter(s => s.status === 'disqualified' || s.status === 'kicked').length;
  const warningCount = students.filter(s => s.warning_count > 0 && s.status === 'in_progress').length;

  const getStatusDisplay = (student) => {
    if (student.status === 'disqualified') {
      return (
        <Badge variant="danger" size="sm">
          <XCircle className="w-3 h-3" /> DISQUALIFIED
        </Badge>
      );
    }
    if (student.status === 'kicked') {
      return (
        <Badge variant="danger" size="sm">
          <UserX className="w-3 h-3" /> KICKED
        </Badge>
      );
    }
    if (student.status === 'submitted' || isExamConcluded) {
      return (
        <Badge variant="info" size="sm">
          <CheckCircle className="w-3 h-3" /> SUBMITTED
        </Badge>
      );
    }
    if (student.writing_status === 'lobby' || student.listening_status === 'lobby') {
      return (
        <Badge variant="warning" pulse size="sm">
          <Coffee className="w-3 h-3" /> BREAK LOBBY
        </Badge>
      );
    }
    if (student.warning_count > 0) {
      return (
        <Badge variant="warning" pulse size="sm">
          <AlertTriangle className="w-3 h-3" /> FOCUS ALERT ({student.warning_count})
        </Badge>
      );
    }
    return (
      <Badge variant="success" pulse size="sm">
        <Zap className="w-3 h-3" /> LIVE (IN TEST)
      </Badge>
    );
  };

  return (
    <div className="space-y-6">

      {/* Real-time Heartbeat & KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        {/* Active Online */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-card flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Online</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">{activeCount}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live heartbeat
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        {/* Break Lobby */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-card flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">In Break Lobby</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1">{inLobbyCount}</div>
            <div className="text-[11px] text-amber-500 mt-0.5">Ready for next stage</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Coffee className="w-5 h-5" />
          </div>
        </div>

        {/* Focus Alerts */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-card flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Focus Alerts</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1">{warningCount}</div>
            <div className="text-[11px] text-amber-500 mt-0.5">Tab / Blur triggers</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Disqualified */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-card flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Disqualified</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 mt-1">{dqCount}</div>
            <div className="text-[11px] text-rose-400 mt-0.5">Strict enforcement</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <UserX className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Live Classroom Monitor & Full Grading Sheet Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden space-y-0">
        
        {/* Table Search & Filter Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidate name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {!isExamConcluded && (
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                🔒 Live Scores Locked until Exam Concludes
              </span>
            )}
            <div className="text-xs text-slate-500 font-semibold">
              Showing <strong>{filteredStudents.length}</strong> of <strong>{students.length}</strong> candidates
            </div>
          </div>
        </div>

        {/* Full Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="p-4">Candidate Profile</th>
                <th className="p-4">Live Status</th>
                <th className="p-4 text-center">Listening (40 Qs)</th>
                <th className="p-4 text-center">Reading (40 Qs)</th>
                <th className="p-4 text-center">Writing (T1 & T2)</th>
                <th className="p-4 text-center">Overall IELTS Band</th>
                <th className="p-4 text-right">Grading & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student) => {
                const readingScore = student.reading_score !== null && student.reading_score !== undefined ? student.reading_score : student.score;
                const readingBand = student.reading_band !== null && student.reading_band !== undefined ? student.reading_band : student.band_score;
                const listeningScore = student.listening_score;
                const listeningBand = student.listening_band;
                const writingBand = student.writing_band;
                const overallBand = student.overall_band;

                const rAnsCount = Object.keys(student.answers?.reading || student.answers || {}).length;
                const lAnsCount = Object.keys(student.answers?.listening || {}).length;
                const t1Words = (student.writing_task1_essay || student.answers?.writing?.task1 || '').trim().split(/\s+/).filter(Boolean).length;
                const t2Words = (student.writing_task2_essay || student.answers?.writing?.task2 || '').trim().split(/\s+/).filter(Boolean).length;

                return (
                  <tr 
                    key={student.id} 
                    className="hover:bg-slate-50/80 transition cursor-pointer"
                    onClick={() => {
                      if (isExamConcluded) setSelectedStudentForGrading(student);
                    }}
                  >
                    
                    {/* Candidate Profile */}
                    <td className="p-4">
                      <div className="font-bold text-slate-900 text-sm">{student.name}</div>
                      <div className="text-[11px] font-mono text-brand-600 mt-0.5">
                        {student.candidate_no || 'ID-0000'}
                      </div>
                    </td>

                    {/* Status & Alerts */}
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-1">
                        {getStatusDisplay(student)}
                        {student.disqualification_reason && (
                          <div className="text-[10px] text-rose-600 font-medium max-w-xs">
                            {student.disqualification_reason}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Listening Score / Progress */}
                    <td className="p-4 text-center font-mono">
                      {isExamConcluded && listeningBand !== null && listeningBand !== undefined ? (
                        <div className="inline-block px-2.5 py-1 rounded-xl bg-sky-50 border border-sky-200">
                          <span className="text-xs font-bold text-sky-700">Band {listeningBand}</span>
                          <span className="text-[10px] text-slate-400 block font-sans">({listeningScore}/{listeningTotalQs})</span>
                        </div>
                      ) : (
                        <div className="text-slate-600">
                          <span className="font-bold">{lAnsCount}/{listeningTotalQs}</span>
                          <span className="text-[10px] text-slate-400 block font-sans italic">In progress...</span>
                        </div>
                      )}
                    </td>

                    {/* Reading Score / Progress */}
                    <td className="p-4 text-center font-mono">
                      {isExamConcluded && readingBand !== null && readingBand !== undefined ? (
                        <div className="inline-block px-2.5 py-1 rounded-xl bg-orange-50 border border-brand-200">
                          <span className="text-xs font-bold text-brand-700">Band {readingBand}</span>
                          <span className="text-[10px] text-slate-400 block font-sans">({readingScore}/{readingTotalQs})</span>
                        </div>
                      ) : (
                        <div className="text-slate-600">
                          <span className="font-bold">{rAnsCount}/{readingTotalQs}</span>
                          <span className="text-[10px] text-slate-400 block font-sans italic">In progress...</span>
                        </div>
                      )}
                    </td>

                    {/* Writing Score / Progress */}
                    <td className="p-4 text-center font-mono">
                      {isExamConcluded && writingBand !== null && writingBand !== undefined ? (
                        <div className="inline-block px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200">
                          <span className="text-xs font-bold text-amber-700">Band {writingBand}</span>
                          <span className="text-[10px] text-slate-400 block font-sans">Evaluated</span>
                        </div>
                      ) : (
                        <div className="text-slate-600">
                          <span className="font-bold">{t1Words + t2Words} words</span>
                          <span className="text-[10px] text-slate-400 block font-sans italic">T1: {t1Words}w • T2: {t2Words}w</span>
                        </div>
                      )}
                    </td>

                    {/* Overall Band Score */}
                    <td className="p-4 text-center font-mono">
                      {isExamConcluded && overallBand !== null && overallBand !== undefined ? (
                        <div className="inline-block px-3 py-1 rounded-xl bg-gradient-to-r from-orange-500 to-brand-600 text-white shadow-sm font-extrabold text-xs">
                          Band {overallBand}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded-lg bg-slate-100">
                          <Lock className="w-3 h-3 text-slate-400" /> Pending Conclusion
                        </span>
                      )}
                    </td>

                    {/* Action Tools */}
                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        
                        {/* Review Sheet Button (Unlocks when exam concludes) */}
                        {isExamConcluded ? (
                          <button
                            type="button"
                            onClick={() => setSelectedStudentForGrading(student)}
                            className="px-2.5 py-1.5 text-xs font-bold text-brand-600 hover:text-white hover:bg-brand-500 bg-brand-50 border border-brand-200 rounded-xl transition flex items-center gap-1 shadow-sm"
                            title="Open Full Grading Sheet & Writing Review"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Review Sheet</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-xl cursor-not-allowed flex items-center gap-1 opacity-70"
                            title="Unlocks after entire exam concludes"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Grading Locked</span>
                          </button>
                        )}

                        {/* Send Focus Warning */}
                        {student.status === 'in_progress' && (
                          <button
                            type="button"
                            onClick={() => onWarnStudent(student.id)}
                            className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                            title="Send Focus Warning"
                          >
                            <Bell className="w-4 h-4" />
                          </button>
                        )}

                        {/* Disqualify / Unban */}
                        {student.status !== 'disqualified' && student.status !== 'kicked' ? (
                          <button
                            type="button"
                            onClick={() => onKickStudent(student.id)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                            title="Disqualify Candidate"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onUnbanStudent(student.id)}
                            className="px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-300 transition"
                            title="Restore Candidate"
                          >
                            Unban
                          </button>
                        )}

                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* Teacher Grading & Verification Workspace Modal */}
      {selectedStudentForGrading && (
        <TeacherGradingWorkspace
          isOpen={true}
          onClose={() => setSelectedStudentForGrading(null)}
          student={selectedStudentForGrading}
          exam={exam}
          onSaveGrades={onSaveGrades}
        />
      )}

    </div>
  );
}
