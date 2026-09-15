import React, { useState, useEffect } from 'react';
import { 
  FolderArchive, 
  Calendar, 
  Clock, 
  Users, 
  Award, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Search, 
  ExternalLink,
  Printer,
  Download,
  CheckCircle2,
  Lock,
  Headphones,
  PenTool,
  ArrowRight,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { getSessionHistory, deleteSessionFromHistory, clearAllSessionHistory } from '../../lib/sessionHistory';

export function ExamHistoryModal({ isOpen, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [inspectStudent, setInspectStudent] = useState(null); // student to inspect answers

  useEffect(() => {
    if (isOpen) {
      setSessions(getSessionHistory());
    }
  }, [isOpen]);

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to remove this session from history?")) {
      const updated = deleteSessionFromHistory(id);
      setSessions(updated);
      if (expandedSessionId === id) setExpandedSessionId(null);
    }
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all archived session records?")) {
      const updated = clearAllSessionHistory();
      setSessions(updated);
      setExpandedSessionId(null);
    }
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `ielts_history_archive_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredSessions = sessions.filter(s => {
    const q = searchQuery.toLowerCase();
    const matchPin = (s.pin_code || '').toLowerCase().includes(q);
    const matchDate = (s.date || '').toLowerCase().includes(q);
    const matchTitle = (s.title || '').toLowerCase().includes(q);
    const matchStudent = (s.students || []).some(st => (st.name || '').toLowerCase().includes(q) || (st.candidate_no || '').toLowerCase().includes(q));
    return matchPin || matchDate || matchTitle || matchStudent;
  });

  const totalTested = sessions.reduce((acc, s) => acc + (s.total_candidates || 0), 0);
  const allOveralls = sessions.map(s => s.avg_overall_band).filter(b => typeof b === 'number');
  const grandAvgBand = allOveralls.length > 0 ? (allOveralls.reduce((a, b) => a + b, 0) / allOveralls.length).toFixed(1) : '—';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📁 Examination History & Session Archive"
      maxWidth="max-w-5xl"
    >
      <div className="space-y-6">
        
        {/* Top Metric Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-orange-50 border border-brand-200 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-extrabold shadow-sm">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Archived Sessions</div>
              <div className="text-xl font-extrabold text-slate-900">{sessions.length}</div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center font-extrabold shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Candidates Tested</div>
              <div className="text-xl font-extrabold text-slate-900">{totalTested}</div>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-extrabold shadow-sm">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Historical Avg Band</div>
              <div className="text-xl font-extrabold text-emerald-900">Band {grandAvgBand}</div>
            </div>
          </div>
        </div>

        {/* Search & Actions Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pb-2 border-b border-slate-100">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by PIN, date, candidate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={handleExportJSON}
              disabled={sessions.length === 0}
              className="text-xs font-bold"
            >
              Export Archive (JSON)
            </Button>
            {sessions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={handleClearAll}
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              >
                Clear History
              </Button>
            )}
          </div>
        </div>

        {/* Sessions List */}
        {filteredSessions.length === 0 ? (
          <div className="text-center py-12 px-4 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FolderArchive className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-700">No Exam Sessions Archived Yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When an IELTS test cycle concludes and you reset or finish the exam, student responses and gradebooks will be automatically saved here.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {filteredSessions.map((session, idx) => {
              const isExpanded = expandedSessionId === session.id;
              const dateDisplay = session.date || new Date(session.started_at).toLocaleDateString();

              return (
                <div 
                  key={session.id || idx}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:border-brand-300 transition-all"
                >
                  {/* Session Header Card */}
                  <div 
                    onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                    className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/60 transition"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 text-brand-700 flex items-center justify-center font-extrabold text-sm shrink-0 border border-orange-200">
                        #{sessions.length - idx}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900">
                            {session.title || 'IELTS Academic Master Assessment'}
                          </h3>
                          <span className="px-2 py-0.5 rounded-md bg-orange-500 text-white font-mono font-extrabold text-[11px] shadow-sm">
                            PIN: {session.pin_code}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {dateDisplay}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono text-slate-600">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {session.time_range || 'Completed'} ({session.duration_mins || 60}m)
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {session.total_candidates} Candidates
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Band Averages & Action Buttons */}
                    <div className="flex items-center gap-3 justify-between md:justify-end shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      
                      {/* Band Pills */}
                      <div className="flex items-center gap-1.5">
                        <div className="text-center px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200">
                          <div className="text-[9px] font-bold uppercase text-slate-400">R Band</div>
                          <div className="text-xs font-mono font-extrabold text-slate-800">
                            {session.avg_reading_band ?? '—'}
                          </div>
                        </div>

                        <div className="text-center px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200">
                          <div className="text-[9px] font-bold uppercase text-slate-400">L Band</div>
                          <div className="text-xs font-mono font-extrabold text-slate-800">
                            {session.avg_listening_band ?? '—'}
                          </div>
                        </div>

                        <div className="text-center px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200">
                          <div className="text-[9px] font-bold uppercase text-slate-400">W Band</div>
                          <div className="text-xs font-mono font-extrabold text-slate-800">
                            {session.avg_writing_band ?? '—'}
                          </div>
                        </div>

                        <div className="text-center px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800">
                          <div className="text-[9px] font-extrabold uppercase text-emerald-700">Avg Band</div>
                          <div className="text-xs font-mono font-extrabold text-emerald-700">
                            {session.avg_overall_band ? `Band ${session.avg_overall_band}` : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleDelete(session.id, e)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete session"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="p-1.5 text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-brand-600" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Expanded Session Students Roster */}
                  {isExpanded && (
                    <div className="p-5 bg-slate-50 border-t border-slate-200 space-y-4 animate-in fade-in duration-150">
                      
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                          <Award className="w-4 h-4 text-brand-600" />
                          <span>Candidate Results Roster ({session.students?.length || 0})</span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          Click on any candidate to inspect their submitted answers & essays
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-left">
                          <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="px-3.5 py-2.5">Candidate</th>
                              <th className="px-3.5 py-2.5">ID / No</th>
                              <th className="px-3.5 py-2.5 text-center">Reading (40)</th>
                              <th className="px-3.5 py-2.5 text-center">Listening (40)</th>
                              <th className="px-3.5 py-2.5 text-center">Writing Band</th>
                              <th className="px-3.5 py-2.5 text-center">Overall Band</th>
                              <th className="px-3.5 py-2.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(session.students || []).map((std, sIdx) => {
                              return (
                                <tr key={std.id || sIdx} className="hover:bg-orange-50/40 transition">
                                  <td className="px-3.5 py-2.5 font-bold text-slate-900">
                                    {std.name}
                                  </td>
                                  <td className="px-3.5 py-2.5 font-mono text-slate-500">
                                    {std.candidate_no}
                                  </td>
                                  <td className="px-3.5 py-2.5 text-center font-mono">
                                    <span className="font-bold text-slate-800">{std.reading_score ?? '—'}/40</span>
                                    <span className="text-slate-400 text-[10px] ml-1">(B {std.reading_band ?? '—'})</span>
                                  </td>
                                  <td className="px-3.5 py-2.5 text-center font-mono">
                                    <span className="font-bold text-slate-800">{std.listening_score ?? '—'}/40</span>
                                    <span className="text-slate-400 text-[10px] ml-1">(B {std.listening_band ?? '—'})</span>
                                  </td>
                                  <td className="px-3.5 py-2.5 text-center font-mono font-bold text-slate-800">
                                    {std.writing_band ? `Band ${std.writing_band}` : '—'}
                                  </td>
                                  <td className="px-3.5 py-2.5 text-center font-mono">
                                    <span className="px-2 py-0.5 rounded-full font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      Band {std.overall_band ?? (std.reading_band || '—')}
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-2.5 text-right">
                                    <Button
                                      variant="outline"
                                      size="xs"
                                      icon={BookOpen}
                                      onClick={() => setInspectStudent(std)}
                                      className="text-[11px] font-bold"
                                    >
                                      Inspect Answers
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Inspect Candidate Modal */}
      {inspectStudent && (
        <Modal
          isOpen={true}
          onClose={() => setInspectStudent(null)}
          title={`Candidate Submission: ${inspectStudent.name} (${inspectStudent.candidate_no})`}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-6">
            
            {/* Candidate Header Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-center">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Reading Score</div>
                <div className="font-mono font-bold text-slate-900">{inspectStudent.reading_score ?? '—'}/40 (Band {inspectStudent.reading_band ?? '—'})</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Listening Score</div>
                <div className="font-mono font-bold text-slate-900">{inspectStudent.listening_score ?? '—'}/40 (Band {inspectStudent.listening_band ?? '—'})</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Writing Band</div>
                <div className="font-mono font-bold text-slate-900">{inspectStudent.writing_band ? `Band ${inspectStudent.writing_band}` : '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-emerald-600 uppercase">Overall Band</div>
                <div className="font-mono font-extrabold text-emerald-700 text-sm">Band {inspectStudent.overall_band ?? '—'}</div>
              </div>
            </div>

            {/* Task 1 & Task 2 Essays */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-brand-600" /> Writing Task 1 Response (Report)
                </h4>
                <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs font-serif leading-relaxed text-slate-800 whitespace-pre-wrap max-h-48 overflow-y-auto shadow-inner">
                  {inspectStudent.writing_task1_essay || inspectStudent.answers?.writing?.task1 || 'No Task 1 response submitted.'}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-brand-600" /> Writing Task 2 Response (Essay)
                </h4>
                <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs font-serif leading-relaxed text-slate-800 whitespace-pre-wrap max-h-48 overflow-y-auto shadow-inner">
                  {inspectStudent.writing_task2_essay || inspectStudent.answers?.writing?.task2 || 'No Task 2 response submitted.'}
                </div>
              </div>
            </div>

            {/* Reading & Listening Answers Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-600" /> Reading Answers Sample
                </h4>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono max-h-36 overflow-y-auto space-y-1">
                  {Object.keys(inspectStudent.answers?.reading || {}).length > 0 ? (
                    Object.entries(inspectStudent.answers.reading).map(([q, ans]) => (
                      <div key={q} className="flex justify-between border-b border-slate-200/60 py-0.5">
                        <span className="text-slate-500">Q{q}:</span>
                        <span className="font-bold text-slate-900">{String(ans)}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-slate-400 italic">No recorded answers</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5 text-sky-600" /> Listening Answers Sample
                </h4>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono max-h-36 overflow-y-auto space-y-1">
                  {Object.keys(inspectStudent.answers?.listening || {}).length > 0 ? (
                    Object.entries(inspectStudent.answers.listening).map(([q, ans]) => (
                      <div key={q} className="flex justify-between border-b border-slate-200/60 py-0.5">
                        <span className="text-slate-500">Q{q}:</span>
                        <span className="font-bold text-slate-900">{String(ans)}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-slate-400 italic">No recorded answers</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setInspectStudent(null)}
              >
                Close Candidate Details
              </Button>
            </div>

          </div>
        </Modal>
      )}

    </Modal>
  );
}
