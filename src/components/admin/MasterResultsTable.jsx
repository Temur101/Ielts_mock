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
  Filter,
  Loader2,
  Phone
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
import { apiGradeWritingSubmission } from '../../lib/ai/gemini-client';
import { exportSessionPdf, computeGradedStudents } from '../../lib/sessionPdfReport';

export function MasterResultsTable({
  exam,
  students,
  onSaveGrades,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentForGrading, setSelectedStudentForGrading] = useState(null);
  const [viewDiffStudent, setViewDiffStudent] = useState(null); // { student, section: 'reading' | 'listening' }
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [evaluatingMap, setEvaluatingMap] = useState({}); // { [studentId]: boolean }
  const [isBatchEvaluating, setIsBatchEvaluating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const readingTotalQs = exam?.reading?.questions?.length || exam?.questions?.length || 40;
  const listeningTotalQs = exam?.listening?.questions?.length || 40;

  // Filter students
  const filteredStudents = students.filter(s => 
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.candidate_no && s.candidate_no.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Compute stats using shared grading helper
  const gradedStudents = computeGradedStudents(exam, students);

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

  const handleDownloadPDF = () => {
    exportSessionPdf({ exam, students });
  };

  const handleEvaluateStudent = async (student) => {
    if (!student) return;
    const studentId = student.id;
    setEvaluatingMap(prev => ({ ...prev, [studentId]: true }));
    try {
      const task1Text = student.writing_task1_essay || student.answers?.writing?.task1 || "";
      const task2Text = student.writing_task2_essay || student.answers?.writing?.task2 || "";
      const task1PromptText = exam?.task_1_prompt || exam?.writing_tasks?.task1?.prompt || exam?.writing?.task1?.prompt || exam?.writing_task1 || "";
      const task2PromptText = exam?.task_2_prompt || exam?.writing_tasks?.task2?.prompt || exam?.writing?.task2?.prompt || exam?.writing_task2 || "";

      const result = await apiGradeWritingSubmission({
        task1Prompt: task1PromptText,
        task1Text: task1Text,
        task2Prompt: task2PromptText,
        task2Text: task2Text,
        studentId: student.id,
      });

      const t1Band = result?.task_1?.band ?? result?.task1_evaluation?.band;
      const t2Band = result?.task_2?.band ?? result?.task2_evaluation?.band;
      const finalT1 = t1Band !== undefined && t1Band !== null ? Number(t1Band) : null;
      const finalT2 = t2Band !== undefined && t2Band !== null ? Number(t2Band) : null;

      const rAns = student.answers?.reading || student.answers || {};
      const lAns = student.answers?.listening || {};
      const rQuestions = exam?.reading?.questions || exam?.questions || [];
      const lQuestions = exam?.listening?.questions || [];
      const rScore = student.reading_score ?? rQuestions.filter(q => isAnswerCorrect(rAns[q.questionNumber], q.acceptedAnswers)).length;
      const rBand = student.reading_band ?? calculateIeltsReadingBand(rScore, rQuestions.length || 40);
      const lScore = student.listening_score ?? lQuestions.filter(q => isAnswerCorrect(lAns[q.questionNumber], q.acceptedAnswers)).length;
      const lBand = student.listening_band ?? calculateIeltsListeningBand(lScore, lQuestions.length || 40);

      const writingBand = calculateWritingBand(finalT1, finalT2);
      const overallBand = calculateOverallIeltsBand(rBand, lBand, writingBand);

      if (onSaveGrades) {
        await onSaveGrades(student.id, {
          writing_task1_band: finalT1,
          writing_task2_band: finalT2,
          writing_band: writingBand,
          overall_band: overallBand,
          writing_ai_evaluation: result,
        });
      }
    } catch (err) {
      console.error("Single student AI grading failed:", err);
      alert(`Ошибка оценки ИИ для ${student.name || 'кандидата'}: ${err.message || 'Проверьте Gemini API'}`);
    } finally {
      setEvaluatingMap(prev => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    }
  };

  const pendingAiCandidates = students.filter(s => {
    const hasEssays = Boolean((s.writing_task1_essay || s.answers?.writing?.task1 || '').trim()) || 
                      Boolean((s.writing_task2_essay || s.answers?.writing?.task2 || '').trim());
    const isPending = s.writing_band === null || s.writing_band === undefined;
    return hasEssays && isPending;
  });

  const handleBatchEvaluateAll = async () => {
    if (pendingAiCandidates.length === 0 || isBatchEvaluating) return;

    setIsBatchEvaluating(true);
    setBatchProgress({ current: 0, total: pendingAiCandidates.length });

    for (let i = 0; i < pendingAiCandidates.length; i++) {
      const student = pendingAiCandidates[i];
      setBatchProgress({ current: i + 1, total: pendingAiCandidates.length });
      await handleEvaluateStudent(student);
    }

    setIsBatchEvaluating(false);
    setBatchProgress({ current: 0, total: 0 });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & PDF Export Button */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
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

        <div className="flex items-center gap-2 flex-wrap">
          {pendingAiCandidates.length > 0 && (
            <Button
              variant="outline"
              size="md"
              icon={isBatchEvaluating ? Loader2 : Sparkles}
              onClick={handleBatchEvaluateAll}
              disabled={isBatchEvaluating}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-extrabold shadow-2xs"
            >
              {isBatchEvaluating 
                ? `Оценка ИИ (${batchProgress.current}/${batchProgress.total})...`
                : `⚡ Оценить всех через ИИ (${pendingAiCandidates.length})`}
            </Button>
          )}

          <Button
            variant="primary"
            size="md"
            icon={Download}
            onClick={handleDownloadPDF}
            className="font-extrabold shadow-2xs bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300"
          >
            Download Results Table (PDF)
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
          <div className="text-[10px] uppercase font-bold text-slate-700">Reading Avg</div>
          <div className="text-xl font-mono font-extrabold text-slate-900 mt-1">Band {avgReadingBand}</div>
          <div className="text-[10px] font-mono text-slate-400">{avgReadingScore} / {readingTotalQs}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-[10px] uppercase font-bold text-slate-700">Writing Avg</div>
          <div className="text-xl font-mono font-extrabold text-slate-900 mt-1">
            {avgWritingBand === '—' ? 'Pending' : `Band ${avgWritingBand}`}
          </div>
          <div className="text-[10px] font-mono text-slate-400">T1 & T2 Evaluation</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border-2 border-slate-300 shadow-sm text-center col-span-2 sm:col-span-2">
          <div className="text-[10px] uppercase font-bold text-slate-500">Overall Class Average</div>
          <div className="text-2xl font-mono font-extrabold text-slate-900 mt-1">
            {avgOverallBand === '—' ? 'Pending' : `IELTS Band ${avgOverallBand}`}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">Official IELTS 0.5 Rounding</div>
        </div>
      </div>

      {/* Printable Official Document Header (Visible on print) */}
      <div className="hidden print:block p-6 bg-slate-900 text-white rounded-2xl mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black tracking-tight">OFFICIAL IELTS ACADEMIC MOCK EXAMINATION</h1>
            <p className="text-sm font-semibold text-slate-300">Master Roster & Institutional Results Report</p>
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
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-slate-800"
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

                const t1Band = student.writing_task1_band ?? null;
                const t2Band = student.writing_task2_band ?? null;
                const wBand = student.writing_band ?? (t1Band !== null && t2Band !== null ? calculateWritingBand(t1Band, t2Band) : null);

                const overallBand = student.overall_band ?? (wBand !== null ? calculateOverallIeltsBand(rBand, lBand, wBand) : null);

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
                          {(student.phone || student.phone_number || student.answers?.candidate_phone) && (
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-1 font-medium">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{student.phone || student.phone_number || student.answers?.candidate_phone}</span>
                            </div>
                          )}
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
                      <div className="font-mono font-extrabold text-sm text-slate-900">
                        Band {rBand}
                      </div>
                      <button
                        onClick={() => setViewDiffStudent({ student, section: 'reading' })}
                        className="text-[10px] font-mono text-slate-500 hover:text-slate-900 underline cursor-pointer print:no-underline"
                      >
                        {rScore} / {rQuestions.length || readingTotalQs} correct
                      </button>
                    </td>

                    {/* Writing Score & Word Counts */}
                    <td className="py-4 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {wBand !== null && wBand !== undefined ? (
                          <span className="font-mono font-extrabold text-sm text-slate-900">
                            Band {wBand}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400">
                            Pending
                          </span>
                        )}
                        {student.writing_ai_evaluation && (
                          <span 
                            onClick={() => setSelectedStudentForGrading(student)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[9px] font-mono font-bold cursor-pointer hover:bg-slate-200 transition border border-slate-200"
                            title="Graded by Google Gemini AI (Click to view breakdown)"
                          >
                            <Sparkles className="w-2.5 h-2.5 text-slate-600" />
                            AI
                          </span>
                        )}
                        {(wBand === null || wBand === undefined) && (
                          <button
                            onClick={() => handleEvaluateStudent(student)}
                            disabled={Boolean(evaluatingMap[student.id]) || isBatchEvaluating}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[10px] font-bold cursor-pointer shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                            title="Оценить эссе Task 1 + Task 2 с помощью Gemini AI"
                          >
                            {evaluatingMap[student.id] ? (
                              <>
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                <span>Проверка...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-2.5 h-2.5 text-slate-700" />
                                <span>⚡ Оценить ИИ</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        T1: {t1Words}w ({t1Band !== null && t1Band !== undefined ? t1Band : '—'}) • T2: {t2Words}w ({t2Band !== null && t2Band !== undefined ? t2Band : '—'})
                      </div>
                    </td>

                    {/* Overall IELTS Band */}
                    <td className="py-4 px-4 text-center">
                      <span className="inline-block px-3 py-1 rounded-xl bg-slate-100 text-slate-900 font-mono font-extrabold text-sm border border-slate-300 shadow-2xs">
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
