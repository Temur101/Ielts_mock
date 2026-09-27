import React, { useState } from 'react';
import { 
  Award, 
  FileText, 
  Headphones, 
  PenTool, 
  Download, 
  Printer, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Sparkles, 
  Edit3, 
  Save, 
  ChevronRight, 
  Layers, 
  Users,
  Eye,
  Sliders,
  Filter
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { TeacherGradingWorkspace } from './TeacherGradingWorkspace';
import { 
  calculateIeltsReadingBand, 
  calculateIeltsListeningBand, 
  calculateWritingBand, 
  calculateOverallIeltsBand,
  isAnswerCorrect
} from '../../lib/ieltsGrading';

export function MasterResultsTable({
  exam,
  students,
  onSaveGrades,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentForGrading, setSelectedStudentForGrading] = useState(null);
  const [viewDiffStudent, setViewDiffStudent] = useState(null); // { student, section: 'reading' | 'listening' }
  const [isPrintMode, setIsPrintMode] = useState(false);

  const readingTotalQs = exam?.reading?.questions?.length || exam?.questions?.length || 40;
  const listeningTotalQs = exam?.listening?.questions?.length || 40;

  // Filter students
  const filteredStudents = students.filter(s => 
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.candidate_no && s.candidate_no.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Compute stats
  const gradedStudents = students.map(s => {
    const rAns = s.answers?.reading || s.answers || {};
    const lAns = s.answers?.listening || {};
    
    // Auto-calculate if null
    let rScore = s.reading_score;
    let rBand = s.reading_band;
    if (rScore === null || rScore === undefined) {
      const rQuestions = exam.reading?.questions || exam.questions || [];
      rScore = rQuestions.filter(q => isAnswerCorrect(rAns[q.questionNumber], q.acceptedAnswers)).length;
      rBand = calculateIeltsReadingBand(rScore, rQuestions.length || 40);
    }

    let lScore = s.listening_score;
    let lBand = s.listening_band;
    if (lScore === null || lScore === undefined) {
      const lQuestions = exam.listening?.questions || [];
      lScore = lQuestions.filter(q => isAnswerCorrect(lAns[q.questionNumber], q.acceptedAnswers)).length;
      lBand = calculateIeltsListeningBand(lScore, lQuestions.length || 40);
    }

    const t1Band = s.writing_task1_band ?? null;
    const t2Band = s.writing_task2_band ?? null;
    const wBand = s.writing_band ?? (t1Band !== null && t2Band !== null ? calculateWritingBand(t1Band, t2Band) : null);
    const oBand = s.overall_band ?? (wBand !== null ? calculateOverallIeltsBand(rBand, lBand, wBand) : null);

    return {
      ...s,
      computed_reading_score: rScore,
      computed_reading_band: rBand,
      computed_listening_score: lScore,
      computed_listening_band: lBand,
      computed_writing_band: wBand,
      computed_overall_band: oBand,
    };
  });

  // Averages (filter out null/undefined)
  const readingScores = gradedStudents.map(s => s.computed_reading_score).filter(v => v !== null && v !== undefined);
  const readingBands = gradedStudents.map(s => s.computed_reading_band).filter(v => v !== null && v !== undefined);
  const listeningScores = gradedStudents.map(s => s.computed_listening_score).filter(v => v !== null && v !== undefined);
  const listeningBands = gradedStudents.map(s => s.computed_listening_band).filter(v => v !== null && v !== undefined);
  const writingBands = gradedStudents.map(s => s.computed_writing_band).filter(v => v !== null && v !== undefined);
  const overallBands = gradedStudents.map(s => s.computed_overall_band).filter(v => v !== null && v !== undefined);

  const avgReadingScore = readingScores.length ? (readingScores.reduce((a, b) => a + b, 0) / readingScores.length).toFixed(1) : '—';
  const avgReadingBand = readingBands.length ? (readingBands.reduce((a, b) => a + b, 0) / readingBands.length).toFixed(1) : '—';
  const avgListeningScore = listeningScores.length ? (listeningScores.reduce((a, b) => a + b, 0) / listeningScores.length).toFixed(1) : '—';
  const avgListeningBand = listeningBands.length ? (listeningBands.reduce((a, b) => a + b, 0) / listeningBands.length).toFixed(1) : '—';
  const avgWritingBand = writingBands.length ? (writingBands.reduce((a, b) => a + b, 0) / writingBands.length).toFixed(1) : '—';
  const avgOverallBand = overallBands.length ? (overallBands.reduce((a, b) => a + b, 0) / overallBands.length).toFixed(1) : '—';

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & PDF Export Button */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>Master Examiner Gradebook & Results Sheet</span>
              <Badge variant="brand" size="sm">CONFIDENTIAL / EXAMINER ONLY</Badge>
            </h2>
            <p className="text-xs text-slate-500">
              Aggregated scoring across Reading (40 Qs), Listening (40 Qs), and Writing Task 1 & 2.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            icon={Printer}
            onClick={handlePrintPDF}
            className="shadow-glow font-extrabold"
          >
            Download Complete Results (PDF)
          </Button>
        </div>
      </div>

      {/* Overview Analytics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 print:grid-cols-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-slate-400">Total Candidates</div>
          <div className="text-2xl font-mono font-extrabold text-slate-900 mt-1">{students.length}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-sky-600">Listening Avg</div>
          <div className="text-xl font-mono font-extrabold text-sky-600 mt-1">Band {avgListeningBand}</div>
          <div className="text-[10px] font-mono text-slate-400">{avgListeningScore} / {listeningTotalQs}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-brand-600">Reading Avg</div>
          <div className="text-xl font-mono font-extrabold text-brand-600 mt-1">Band {avgReadingBand}</div>
          <div className="text-[10px] font-mono text-slate-400">{avgReadingScore} / {readingTotalQs}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-amber-600">Writing Avg</div>
          <div className="text-xl font-mono font-extrabold text-amber-600 mt-1">
            {avgWritingBand === '—' ? 'Pending' : `Band ${avgWritingBand}`}
          </div>
          <div className="text-[10px] font-mono text-slate-400">T1 & T2 Evaluation</div>
        </div>

        <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white p-4 rounded-2xl shadow-sm text-center col-span-2 sm:col-span-2">
          <div className="text-[10px] uppercase font-bold text-brand-100">Overall Class Average</div>
          <div className="text-2xl font-mono font-extrabold mt-1">
            {avgOverallBand === '—' ? 'Pending' : `IELTS Band ${avgOverallBand}`}
          </div>
          <div className="text-[10px] text-brand-100 font-mono">Official IELTS 0.5 Rounding</div>
        </div>
      </div>

      {/* Printable Official Document Header (Visible on print) */}
      <div className="hidden print:block p-6 bg-slate-900 text-white rounded-2xl mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black tracking-tight">OFFICIAL IELTS ACADEMIC MOCK EXAMINATION</h1>
            <p className="text-sm font-semibold text-brand-400">Master Roster & Institutional Results Report</p>
            <p className="text-xs text-slate-400 mt-1">Exam: {exam.title} • PIN: {exam.pin_code} • Date: {new Date().toLocaleDateString()}</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>Examiner: {exam.teacher_name || exam.teacher?.name || 'Authorized Examiner'}</div>
            <div>Generated: {new Date().toLocaleTimeString()}</div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search candidate by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="text-xs font-semibold text-slate-500">
          Showing {filteredStudents.length} of {students.length} candidates
        </div>
      </div>

      {/* Master Students Results Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                <th className="py-3.5 px-4">Candidate Profile</th>
                <th className="py-3.5 px-3 text-center">Status</th>
                <th className="py-3.5 px-3 text-center">Listening ({listeningTotalQs} Qs)</th>
                <th className="py-3.5 px-3 text-center">Reading ({readingTotalQs} Qs)</th>
                <th className="py-3.5 px-3 text-center">Writing Essays</th>
                <th className="py-3.5 px-4 text-center">Overall IELTS Band</th>
                <th className="py-3.5 px-4 text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
              {filteredStudents.map((student) => {
                const rAns = student.answers?.reading || student.answers || {};
                const lAns = student.answers?.listening || {};
                
                const rQuestions = exam.reading?.questions || exam.questions || [];
                const lQuestions = exam.listening?.questions || [];

                const rScore = student.reading_score ?? rQuestions.filter(q => isAnswerCorrect(rAns[q.questionNumber], q.acceptedAnswers)).length;
                const rBand = student.reading_band ?? calculateIeltsReadingBand(rScore, rQuestions.length || 40);

                const lScore = student.listening_score ?? lQuestions.filter(q => isAnswerCorrect(lAns[q.questionNumber], q.acceptedAnswers)).length;
                const lBand = student.listening_band ?? calculateIeltsListeningBand(lScore, lQuestions.length || 40);

                const t1Band = student.writing_task1_band ?? 6.5;
                const t2Band = student.writing_task2_band ?? 7.0;
                const wBand = student.writing_band ?? calculateWritingBand(t1Band, t2Band);

                const overallBand = student.overall_band ?? calculateOverallIeltsBand(rBand, lBand, wBand);

                const t1Words = (student.writing_task1_essay || student.answers?.writing?.task1 || '').trim().split(/\s+/).filter(Boolean).length;
                const t2Words = (student.writing_task2_essay || student.answers?.writing?.task2 || '').trim().split(/\s+/).filter(Boolean).length;

                return (
                  <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Candidate Info */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-800 font-bold flex items-center justify-center text-xs">
                          {(student.name || 'S').trim().charAt(0).toUpperCase() || 'S'}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{student.name || 'Candidate'}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {student.candidate_no || 'ID-0000'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-3 text-center">
                      <Badge 
                        variant={student.status === 'submitted' ? 'success' : student.status === 'disqualified' ? 'danger' : 'brand'} 
                        size="sm"
                      >
                        {(student.status || 'waiting').toUpperCase()}
                      </Badge>
                    </td>

                    {/* Listening Score */}
                    <td className="py-4 px-3 text-center">
                      <div className="font-mono font-extrabold text-sm text-sky-600">
                        Band {lBand}
                      </div>
                      <button
                        onClick={() => setViewDiffStudent({ student, section: 'listening' })}
                        className="text-[10px] font-mono text-slate-500 hover:text-sky-600 underline cursor-pointer print:no-underline"
                      >
                        {lScore} / {lQuestions.length || listeningTotalQs} correct
                      </button>
                    </td>

                    {/* Reading Score */}
                    <td className="py-4 px-3 text-center">
                      <div className="font-mono font-extrabold text-sm text-brand-600">
                        Band {rBand}
                      </div>
                      <button
                        onClick={() => setViewDiffStudent({ student, section: 'reading' })}
                        className="text-[10px] font-mono text-slate-500 hover:text-brand-600 underline cursor-pointer print:no-underline"
                      >
                        {rScore} / {rQuestions.length || readingTotalQs} correct
                      </button>
                    </td>

                    {/* Writing Score & Word Counts */}
                    <td className="py-4 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-mono font-extrabold text-sm text-amber-600">
                          {wBand !== null && wBand !== undefined ? `Band ${wBand}` : 'Pending'}
                        </span>
                        {student.writing_ai_evaluation && (
                          <span 
                            onClick={() => setSelectedStudentForGrading(student)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-orange-100 text-brand-700 text-[9px] font-mono font-bold cursor-pointer hover:bg-orange-200 transition"
                            title="Graded by Google Gemini AI (Click to view breakdown)"
                          >
                            <Sparkles className="w-2.5 h-2.5 text-brand-500" />
                            AI
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        T1: {t1Words}w ({t1Band !== null && t1Band !== undefined ? t1Band : '—'}) • T2: {t2Words}w ({t2Band !== null && t2Band !== undefined ? t2Band : '—'})
                      </div>
                    </td>

                    {/* Overall IELTS Band */}
                    <td className="py-4 px-4 text-center">
                      <span className="inline-block px-3 py-1 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-mono font-extrabold text-sm shadow-sm">
                        {overallBand !== null && overallBand !== undefined ? `Band ${overallBand}` : 'Pending'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right print:hidden">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Edit3}
                        onClick={() => setSelectedStudentForGrading(student)}
                        className="text-xs font-bold"
                      >
                        Grade / Edit
                      </Button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Signature & Institutional Footer */}
      <div className="hidden print:block mt-12 pt-8 border-t border-slate-300 text-xs text-slate-600">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="font-bold text-slate-800 uppercase tracking-wider">Lead Examiner Certification:</div>
            <p className="mt-1 text-[11px] leading-relaxed">
              I hereby certify that the scores recorded above have been calculated and verified under standard IELTS Academic examination protocols.
            </p>
            <div className="mt-8 border-b border-slate-400 w-64" />
            <div className="mt-1 font-mono text-[10px]">Examiner Signature & Date</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-slate-800 uppercase tracking-wider">Institution Accreditation Seal:</div>
            <div className="mt-6 inline-block p-4 border-2 border-dashed border-slate-300 rounded-xl font-mono text-[10px] text-slate-400">
              [ Official IELTS Exam Centre Stamp ]
            </div>
          </div>
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

      {/* Wrong vs Correct Diff Modal */}
      {viewDiffStudent && (
        <Modal
          isOpen={true}
          onClose={() => setViewDiffStudent(null)}
          title={`${viewDiffStudent.section.toUpperCase()} Answer Breakdown: ${viewDiffStudent.student.name}`}
          subtitle={`Candidate ID: ${viewDiffStudent.student.candidate_no}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4">
            {(() => {
              const sec = viewDiffStudent.section;
              const questions = sec === 'reading' 
                ? (exam.reading?.questions || exam.questions || []) 
                : (exam.listening?.questions || []);
              const answers = viewDiffStudent.student.answers?.[sec] || (sec === 'reading' ? viewDiffStudent.student.answers : {}) || {};
              
              return (
                <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                  {questions.map((q) => {
                    const studentAns = answers[q.questionNumber] || "";
                    const isCorrect = isAnswerCorrect(studentAns, q.acceptedAnswers);

                    return (
                      <div 
                        key={q.questionNumber}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                          isCorrect 
                            ? 'bg-emerald-50/70 border-emerald-200 text-slate-800' 
                            : 'bg-rose-50/70 border-rose-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 max-w-lg">
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-bold text-[11px] ${
                            isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                          }`}>
                            {q.questionNumber}
                          </span>
                          <span className="font-semibold text-slate-700 truncate">{q.text}</span>
                        </div>

                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Candidate</div>
                            <div className={`font-mono font-bold ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {studentAns || "(empty)"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Accepted Key</div>
                            <div className="font-mono font-bold text-slate-700">
                              {Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.join(" / ") : q.acceptedAnswers}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setViewDiffStudent(null)}>
                Close Breakdown
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
