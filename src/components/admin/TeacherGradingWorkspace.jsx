import React, { useState, useEffect } from 'react';
import { 
  Award, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Headphones, 
  PenTool, 
  Sparkles, 
  HelpCircle, 
  Save, 
  Check, 
  Clock, 
  AlertTriangle,
  Layers,
  ChevronRight,
  ShieldCheck,
  User,
  Calculator,
  Key,
  Bot,
  Zap,
  RefreshCw,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { 
  calculateIeltsReadingBand, 
  calculateIeltsListeningBand, 
  calculateWritingBand, 
  calculateOverallIeltsBand, 
  isAnswerCorrect 
} from '../../lib/ieltsGrading';
import { apiGradeWritingSubmission } from '../../lib/ai/gemini-client';

export function TeacherGradingWorkspace({
  isOpen,
  onClose,
  student,
  exam,
  onSaveGrades,
}) {
  if (!isOpen || !student) return null;

  // Active Review Tab: 'listening' | 'reading' | 'writing' | 'overall'
  const [activeTab, setActiveTab] = useState('listening');

  // Teacher manual score inputs for Writing (0.0 - 9.0)
  const [task1Score, setTask1Score] = useState(
    student.writing_task1_band !== null && student.writing_task1_band !== undefined 
      ? student.writing_task1_band 
      : null
  );
  const [task2Score, setTask2Score] = useState(
    student.writing_task2_band !== null && student.writing_task2_band !== undefined 
      ? student.writing_task2_band 
      : null
  );

  const [filterReadingDiff, setFilterReadingDiff] = useState('all'); // 'all' | 'incorrect' | 'correct'
  const [filterListeningDiff, setFilterListeningDiff] = useState('all');
  const [saveToast, setSaveToast] = useState(false);

  // Gemini AI Auto-Grading State
  const [aiEvaluation, setAiEvaluation] = useState(student.writing_ai_evaluation || null);
  const [isEvaluatingAi, setIsEvaluatingAi] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiAppliedToast, setAiAppliedToast] = useState(false);

  // Sync state on student change
  useEffect(() => {
    if (student) {
      setTask1Score(
        student.writing_task1_band !== null && student.writing_task1_band !== undefined 
          ? student.writing_task1_band 
          : null
      );
      setTask2Score(
        student.writing_task2_band !== null && student.writing_task2_band !== undefined 
          ? student.writing_task2_band 
          : null
      );
      setAiEvaluation(student.writing_ai_evaluation || null);
      setAiError(null);
    }
  }, [student?.id]);

  // Raw and Band Scores
  const readingQuestions = exam.reading?.questions || exam.questions || [];
  const listeningQuestions = exam.listening?.questions || [];

  const studentReadingAnswers = student.answers?.reading || student.answers || {};
  const studentListeningAnswers = student.answers?.listening || {};

  // Reading calculations
  let readingCorrectCount = 0;
  const readingDiffs = readingQuestions.map(q => {
    const studentAns = studentReadingAnswers[q.questionNumber] || "";
    const correct = isAnswerCorrect(studentAns, q.acceptedAnswers);
    if (correct) readingCorrectCount++;
    return {
      qNum: q.questionNumber,
      passageId: q.passageId,
      text: q.text,
      studentAns,
      acceptedAnswers: q.acceptedAnswers,
      isCorrect: correct,
      explanation: q.explanation
    };
  });
  const readingBand = calculateIeltsReadingBand(readingCorrectCount, readingQuestions.length || 40);

  // Listening calculations
  let listeningCorrectCount = 0;
  const listeningDiffs = listeningQuestions.map(q => {
    const studentAns = studentListeningAnswers[q.questionNumber] || "";
    const correct = isAnswerCorrect(studentAns, q.acceptedAnswers);
    if (correct) listeningCorrectCount++;
    return {
      qNum: q.questionNumber,
      partId: q.partId,
      text: q.text,
      studentAns,
      acceptedAnswers: q.acceptedAnswers,
      isCorrect: correct,
      explanation: q.explanation
    };
  });
  const listeningBand = calculateIeltsListeningBand(listeningCorrectCount, listeningQuestions.length || 40);

  // Writing calculation (1/3 Task 1 + 2/3 Task 2)
  const writingBand = calculateWritingBand(task1Score, task2Score);

  // Combined Overall IELTS Band Score
  const overallBand = calculateOverallIeltsBand(readingBand, listeningBand, writingBand);

  // Word counts for essays
  const task1Text = student.writing_task1_essay || student.answers?.writing?.task1 || '';
  const task2Text = student.writing_task2_essay || student.answers?.writing?.task2 || '';
  const task1Words = task1Text.trim() ? task1Text.trim().split(/\s+/).filter(Boolean).length : 0;
  const task2Words = task2Text.trim() ? task2Text.trim().split(/\s+/).filter(Boolean).length : 0;

  const handleRunGeminiEvaluation = async () => {
    setIsEvaluatingAi(true);
    setAiError(null);
    try {
      const task1PromptText = exam.task_1_prompt || exam.writing_tasks?.task1?.prompt || exam.writing?.task1?.prompt || "";
      const task2PromptText = exam.task_2_prompt || exam.writing_tasks?.task2?.prompt || exam.writing?.task2?.prompt || "";
      const result = await apiGradeWritingSubmission({
        task1Prompt: task1PromptText,
        task1Text: task1Text,
        task2Prompt: task2PromptText,
        task2Text: task2Text,
        studentId: student.id,
      });
      setAiEvaluation(result);
    } catch (err) {
      console.error("Gemini AI evaluation failed:", err);
      setAiError(err.message || "Failed to complete AI grading. Please check your Gemini API key and network.");
    } finally {
      setIsEvaluatingAi(false);
    }
  };

  const handleAcceptAiGrade = () => {
    if (!aiEvaluation) return;
    const t1Band = aiEvaluation.task_1?.band ?? aiEvaluation.task1_evaluation?.band;
    const t2Band = aiEvaluation.task_2?.band ?? aiEvaluation.task2_evaluation?.band;
    if (t1Band !== undefined && t1Band !== null) {
      setTask1Score(Number(t1Band));
    }
    if (t2Band !== undefined && t2Band !== null) {
      setTask2Score(Number(t2Band));
    }
    setAiAppliedToast(true);
    setTimeout(() => setAiAppliedToast(false), 3000);
  };

  const handleSaveAllGrades = () => {
    if (onSaveGrades) {
      onSaveGrades(student.id, {
        reading_score: readingCorrectCount,
        reading_band: readingBand,
        listening_score: listeningCorrectCount,
        writing_task1_band: task1Score !== null && task1Score !== undefined ? Number(task1Score) : null,
        writing_task2_band: task2Score !== null && task2Score !== undefined ? Number(task2Score) : null,
        writing_band: writingBand,
        overall_band: overallBand,
        writing_ai_evaluation: aiEvaluation,
      });
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const filteredReading = readingDiffs.filter(d => {
    if (filterReadingDiff === 'incorrect') return !d.isCorrect;
    if (filterReadingDiff === 'correct') return d.isCorrect;
    return true;
  });

  const filteredListening = listeningDiffs.filter(d => {
    if (filterListeningDiff === 'incorrect') return !d.isCorrect;
    if (filterListeningDiff === 'correct') return d.isCorrect;
    return true;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Teacher Grading & Verification Sheet: ${student.name}`}
      subtitle={`Candidate ID: ${student.candidate_no}${student.phone || student.phone_number || student.answers?.candidate_phone ? ` • Phone: ${student.phone || student.phone_number || student.answers?.candidate_phone}` : ''} • Status: ${student.status.toUpperCase()} • Overall IELTS Band: ${overallBand !== null ? `Band ${overallBand}` : 'In Progress'}`}
      maxWidth="max-w-6xl"
    >
      <div className="space-y-6">
        
        {/* Score Summary Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 text-white p-4 rounded-2xl shadow-sm">
          
          {/* Listening Card */}
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <div className="text-[10px] uppercase font-bold text-slate-400">1. Listening (Auto)</div>
            <div className="text-xl font-mono font-extrabold text-sky-400 mt-0.5">
              Band {listeningBand}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Score: {listeningCorrectCount}/{listeningQuestions.length || 40}
            </div>
          </div>

          {/* Reading Card */}
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <div className="text-[10px] uppercase font-bold text-slate-400">2. Reading (Auto)</div>
            <div className="text-xl font-mono font-extrabold text-brand-400 mt-0.5">
              Band {readingBand}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Score: {readingCorrectCount}/{readingQuestions.length || 40}
            </div>
          </div>

          {/* Writing Card */}
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <div className="text-[10px] uppercase font-bold text-slate-400">3. Writing (Manual)</div>
            <div className="text-xl font-mono font-extrabold text-emerald-400 mt-0.5">
              {writingBand !== null && writingBand !== undefined ? `Band ${writingBand}` : 'Pending'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              T1: {task1Score !== null && task1Score !== undefined ? task1Score : '—'} • T2: {task2Score !== null && task2Score !== undefined ? task2Score : '—'}
            </div>
          </div>

          {/* Overall Band Card */}
          <div className="p-3 bg-white rounded-xl border-2 border-slate-300 shadow-sm flex flex-col justify-center text-slate-900">
            <div className="text-[10px] uppercase font-bold text-slate-500">Overall IELTS Band</div>
            <div className="text-2xl font-mono font-black text-slate-900 mt-0.5">
              {overallBand !== null && overallBand !== undefined ? `Band ${overallBand}` : 'Pending'}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              Official IELTS average
            </div>
          </div>

        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('listening')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'listening'
                  ? 'bg-slate-200 text-slate-900 border border-slate-300 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Headphones className="w-4 h-4" />
              Listening Diff ({listeningCorrectCount}/{listeningQuestions.length || 40})
            </button>

            <button
              onClick={() => setActiveTab('reading')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'reading'
                  ? 'bg-slate-200 text-slate-900 border border-slate-300 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              Reading Diff ({readingCorrectCount}/{readingQuestions.length || 40})
            </button>

            <button
              onClick={() => setActiveTab('writing')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'writing'
                  ? 'bg-slate-200 text-slate-900 border border-slate-300 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <PenTool className="w-4 h-4" />
              Writing Review Workspace
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={saveToast ? Check : Save}
            onClick={handleSaveAllGrades}
            className="font-bold shadow-2xs bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
          >
            {saveToast ? 'Grades Saved!' : 'Save & Lock Grades'}
          </Button>
        </div>

        {/* TAB 1: READING AUTO-SCORED VISUAL DIFF */}
        {activeTab === 'reading' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div className="text-slate-600">
                Auto-checked against accepted answer keys. Green = Match, Red = Discrepancy.
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setFilterReadingDiff('all')}
                  className={`px-3 py-1 font-bold rounded-lg ${filterReadingDiff === 'all' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600'}`}
                >
                  All (40)
                </button>
                <button
                  onClick={() => setFilterReadingDiff('incorrect')}
                  className={`px-3 py-1 font-bold rounded-lg ${filterReadingDiff === 'incorrect' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600'}`}
                >
                  Incorrect ({40 - readingCorrectCount})
                </button>
                <button
                  onClick={() => setFilterReadingDiff('correct')}
                  className={`px-3 py-1 font-bold rounded-lg ${filterReadingDiff === 'correct' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600'}`}
                >
                  Correct ({readingCorrectCount})
                </button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {filteredReading.map(diff => (
                <div 
                  key={diff.qNum}
                  className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                    diff.isCorrect 
                      ? 'bg-emerald-50/40 border-emerald-200' 
                      : 'bg-rose-50/40 border-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-7 h-7 rounded-lg font-mono font-bold flex items-center justify-center shrink-0 ${
                      diff.isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                    }`}>
                      {diff.qNum}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{diff.text}</div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 font-mono text-[11px]">
                        <div>
                          <span className="text-slate-400 font-sans">Student: </span>
                          <span className={`font-bold ${diff.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {diff.studentAns || <span className="italic text-slate-400">(Blank)</span>}
                          </span>
                        </div>
                        {!diff.isCorrect && (
                          <div>
                            <span className="text-slate-400 font-sans">Accepted Key: </span>
                            <span className="font-bold text-slate-800">
                              {Array.isArray(diff.acceptedAnswers) ? diff.acceptedAnswers.join(' / ') : diff.acceptedAnswers}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    diff.isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {diff.isCorrect ? '+1.0' : '0.0'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: LISTENING AUTO-SCORED VISUAL DIFF */}
        {activeTab === 'listening' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div className="text-slate-600">
                Listening Section (Audio-driven, 4 Parts). Auto-scored against answer key.
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setFilterListeningDiff('all')}
                  className={`px-3 py-1 font-bold rounded-lg ${filterListeningDiff === 'all' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600'}`}
                >
                  All (40)
                </button>
                <button
                  onClick={() => setFilterListeningDiff('incorrect')}
                  className={`px-3 py-1 font-bold rounded-lg ${filterListeningDiff === 'incorrect' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600'}`}
                >
                  Incorrect ({40 - listeningCorrectCount})
                </button>
                <button
                  onClick={() => setFilterListeningDiff('correct')}
                  className={`px-3 py-1 font-bold rounded-lg ${filterListeningDiff === 'correct' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600'}`}
                >
                  Correct ({listeningCorrectCount})
                </button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {filteredListening.map(diff => (
                <div 
                  key={diff.qNum}
                  className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                    diff.isCorrect 
                      ? 'bg-emerald-50/40 border-emerald-200' 
                      : 'bg-rose-50/40 border-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-7 h-7 rounded-lg font-mono font-bold flex items-center justify-center shrink-0 ${
                      diff.isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                    }`}>
                      {diff.qNum}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{diff.text}</div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 font-mono text-[11px]">
                        <div>
                          <span className="text-slate-400 font-sans">Student: </span>
                          <span className={`font-bold ${diff.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {diff.studentAns || <span className="italic text-slate-400">(Blank)</span>}
                          </span>
                        </div>
                        {!diff.isCorrect && (
                          <div>
                            <span className="text-slate-400 font-sans">Accepted Key: </span>
                            <span className="font-bold text-slate-800">
                              {Array.isArray(diff.acceptedAnswers) ? diff.acceptedAnswers.join(' / ') : diff.acceptedAnswers}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    diff.isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {diff.isCorrect ? '+1.0' : '0.0'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: WRITING REVIEW WORKSPACE & BAND SCORE INPUTS */}
        {activeTab === 'writing' && (
          <div className="space-y-6">
            
            {/* Score inputs Header */}
            <div className="p-4 bg-orange-50 border border-brand-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-900 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-brand-600" />
                  Examiner Band Score Assessor (0.0 – 9.0)
                </h4>
                <p className="text-xs text-brand-800/80 mt-0.5">
                  Official Formula: <code className="font-mono font-bold">(Task 1 + 2 × Task 2) / 3</code> = Combined Writing Band
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Task 1 Score Input */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-0.5">
                    Task 1 Band (1/3)
                  </label>
                  <select
                    value={task1Score ?? ''}
                    onChange={(e) => setTask1Score(e.target.value === '' ? null : Number(e.target.value))}
                    className="px-3 py-1.5 rounded-xl border border-brand-300 font-mono font-bold text-sm text-brand-700 bg-white focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Ungraded</option>
                    {[9.0, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0, 2.0, 1.0].map(b => (
                      <option key={b} value={b}>Band {b.toFixed(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Task 2 Score Input */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-0.5">
                    Task 2 Band (2/3)
                  </label>
                  <select
                    value={task2Score ?? ''}
                    onChange={(e) => setTask2Score(e.target.value === '' ? null : Number(e.target.value))}
                    className="px-3 py-1.5 rounded-xl border border-brand-300 font-mono font-bold text-sm text-brand-700 bg-white focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Ungraded</option>
                    {[9.0, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0, 2.0, 1.0].map(b => (
                      <option key={b} value={b}>Band {b.toFixed(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Combined Writing Result */}
                <div className="p-2.5 bg-brand-500 text-white rounded-xl text-center min-w-[100px] shadow-sm">
                  <div className="text-[10px] font-bold uppercase">Writing Band</div>
                  <div className="text-xl font-mono font-extrabold">{writingBand !== null && writingBand !== undefined ? writingBand : '—'}</div>
                </div>

                {/* Save Button in Writing Tab */}
                <Button
                  onClick={handleSaveAllGrades}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-2xs"
                >
                  {saveToast ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Saved!
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Save Writing
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* GEMINI AI AUTO-GRADING SECTION */}
            <div className="bg-white rounded-2xl p-6 text-slate-900 border-2 border-brand-300 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 border border-brand-200 flex items-center justify-center text-brand-600 shadow-sm">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-900">Gemini AI Writing Examiner</h4>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-orange-50 text-brand-700 border border-brand-200">
                        gemini-3.6-flash
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Automated assessment across 4 official criteria: Task Achievement/Response, Coherence & Cohesion, Lexical Resource, Grammatical Accuracy.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">

                  <Button
                    onClick={handleRunGeminiEvaluation}
                    disabled={isEvaluatingAi || (!task1Text && !task2Text)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-2xs disabled:opacity-50"
                  >
                    {isEvaluatingAi ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                        Analyzing with AI...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        {aiEvaluation ? "Re-evaluate with AI" : "Evaluate with Gemini AI"}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* No Essay Warning */}
              {!task1Text && !task2Text && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  Candidate has not submitted any text for Task 1 or Task 2 yet.
                </div>
              )}

              {/* AI Error Alert */}
              {aiError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div className="flex-1">
                    <div className="font-bold text-rose-900">Evaluation Error:</div>
                    <div className="text-rose-700 mt-0.5">{aiError}</div>
                  </div>
                </div>
              )}

              {/* AI Evaluating Progress Skeleton */}
              {isEvaluatingAi && (
                <div className="p-6 rounded-xl bg-orange-50/50 border border-brand-200 text-center space-y-3 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-orange-100 text-brand-600 mx-auto flex items-center justify-center">
                    <Zap className="w-6 h-6 animate-bounce" />
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    Examiner Gemini AI is Grading Submissions...
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Scoring Task Achievement/Response, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy against IELTS public band descriptors.
                  </p>
                </div>
              )}

              {/* AI Evaluation Results */}
              {aiEvaluation && !isEvaluatingAi && (() => {
                const t1Obj = aiEvaluation.task_1 || aiEvaluation.task1_evaluation;
                const t2Obj = aiEvaluation.task_2 || aiEvaluation.task2_evaluation;
                const t1Band = t1Obj?.band;
                const t2Band = t2Obj?.band;
                const overallBand = aiEvaluation.overall_writing_band;

                const allMistakes = [
                  ...(t1Obj?.mistakes || []).map(m => ({ ...m, task: 1 })),
                  ...(t2Obj?.mistakes || []).map(m => ({ ...m, task: 2 })),
                  ...(aiEvaluation.highlighted_errors || [])
                ].filter((item, idx, self) => 
                  idx === self.findIndex(t => t.original === item.original && t.correction === item.correction)
                );

                return (
                  <div className="space-y-4 pt-1">
                    
                    {/* AI Score Overview Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-orange-50/50 rounded-xl border border-brand-200">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-500">AI Task 1</div>
                          <div className="text-lg font-mono font-extrabold text-brand-600">
                            Band {t1Band !== undefined && t1Band !== null ? Number(t1Band).toFixed(1) : '—'}
                          </div>
                        </div>
                        <div className="text-brand-300 font-bold">+</div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-500">AI Task 2 (2x)</div>
                          <div className="text-lg font-mono font-extrabold text-brand-600">
                            Band {t2Band !== undefined && t2Band !== null ? Number(t2Band).toFixed(1) : '—'}
                          </div>
                        </div>
                        <div className="text-brand-300 font-bold">=</div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-500">AI Writing Band</div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-mono font-extrabold text-brand-600">
                              Band {overallBand !== undefined && overallBand !== null ? Number(overallBand).toFixed(1) : '—'}
                            </span>
                            {aiEvaluation.overall_skill_level && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-brand-800 border border-brand-200">
                                {aiEvaluation.overall_skill_level}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {aiAppliedToast && (
                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                            <Check className="w-4 h-4" />
                            Applied to Assessor!
                          </span>
                        )}
                        <Button
                          onClick={handleAcceptAiGrade}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-2xs"
                        >
                          <Check className="w-4 h-4 text-emerald-600" />
                          Accept AI Grade
                        </Button>
                      </div>
                    </div>

                    {/* 4 Criteria Sub-Scores Grids */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Task 1 Sub-Scores */}
                      {t1Obj && (
                        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="font-bold text-xs text-slate-900 flex items-center gap-2">
                              <span className="w-5 h-5 rounded bg-brand-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                                T1
                              </span>
                              Task 1 Criteria Breakdown
                            </span>
                            <div className="flex items-center gap-2">
                              {t1Obj.skill_level && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                  {t1Obj.skill_level}
                                </span>
                              )}
                              <span className="font-mono font-bold text-xs text-brand-600">
                                Band {t1Band !== undefined && t1Band !== null ? Number(t1Band).toFixed(1) : '—'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Task Achievement</div>
                              <div className="text-sm font-mono font-bold text-brand-600">
                                {(t1Obj.ta ?? t1Obj.task_achievement) !== undefined && (t1Obj.ta ?? t1Obj.task_achievement) !== null ? Number(t1Obj.ta ?? t1Obj.task_achievement).toFixed(1) : '—'}
                              </div>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Coherence & Cohesion</div>
                              <div className="text-sm font-mono font-bold text-brand-600">
                                {(t1Obj.cc ?? t1Obj.coherence_cohesion) !== undefined && (t1Obj.cc ?? t1Obj.coherence_cohesion) !== null ? Number(t1Obj.cc ?? t1Obj.coherence_cohesion).toFixed(1) : '—'}
                              </div>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Lexical Resource</div>
                              <div className="text-sm font-mono font-bold text-brand-600">
                                {(t1Obj.lr ?? t1Obj.lexical_resource) !== undefined && (t1Obj.lr ?? t1Obj.lexical_resource) !== null ? Number(t1Obj.lr ?? t1Obj.lexical_resource).toFixed(1) : '—'}
                              </div>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Grammatical Accuracy</div>
                              <div className="text-sm font-mono font-bold text-brand-600">
                                {(t1Obj.gra ?? t1Obj.grammatical_accuracy) !== undefined && (t1Obj.gra ?? t1Obj.grammatical_accuracy) !== null ? Number(t1Obj.gra ?? t1Obj.grammatical_accuracy).toFixed(1) : '—'}
                              </div>
                            </div>
                          </div>

                          {(t1Obj.feedback || t1Obj.comments) && (
                            <div className="text-xs text-slate-600 italic bg-orange-50/40 p-2.5 rounded-lg border border-brand-100">
                              "{t1Obj.feedback || t1Obj.comments}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* Task 2 Sub-Scores */}
                      {t2Obj && (
                        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="font-bold text-xs text-slate-900 flex items-center gap-2">
                              <span className="w-5 h-5 rounded bg-brand-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                                T2
                              </span>
                              Task 2 Criteria Breakdown
                            </span>
                            <div className="flex items-center gap-2">
                              {t2Obj.skill_level && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                  {t2Obj.skill_level}
                                </span>
                              )}
                              <span className="font-mono font-bold text-xs text-brand-600">
                                Band {t2Band !== undefined && t2Band !== null ? Number(t2Band).toFixed(1) : '—'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Task Response</div>
                              <div className="text-sm font-mono font-bold text-brand-600">
                                {(t2Obj.tr ?? t2Obj.task_response) !== undefined && (t2Obj.tr ?? t2Obj.task_response) !== null ? Number(t2Obj.tr ?? t2Obj.task_response).toFixed(1) : '—'}
                              </div>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Coherence & Cohesion</div>
                              <div className="text-sm font-mono font-bold text-brand-600">
                                {(t2Obj.cc ?? t2Obj.coherence_cohesion) !== undefined && (t2Obj.cc ?? t2Obj.coherence_cohesion) !== null ? Number(t2Obj.cc ?? t2Obj.coherence_cohesion).toFixed(1) : '—'}
                              </div>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Lexical Resource</div>
                              <div className="text-sm font-mono font-bold text-brand-600">
                                {(t2Obj.lr ?? t2Obj.lexical_resource) !== undefined && (t2Obj.lr ?? t2Obj.lexical_resource) !== null ? Number(t2Obj.lr ?? t2Obj.lexical_resource).toFixed(1) : '—'}
                              </div>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Grammatical Accuracy</div>
                              <div className="text-sm font-mono font-bold text-brand-600">
                                {(t2Obj.gra ?? t2Obj.grammatical_accuracy) !== undefined && (t2Obj.gra ?? t2Obj.grammatical_accuracy) !== null ? Number(t2Obj.gra ?? t2Obj.grammatical_accuracy).toFixed(1) : '—'}
                              </div>
                            </div>
                          </div>

                          {(t2Obj.feedback || t2Obj.comments) && (
                            <div className="text-xs text-slate-600 italic bg-orange-50/40 p-2.5 rounded-lg border border-brand-100">
                              "{t2Obj.feedback || t2Obj.comments}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Qualitative Feedback */}
                    {(aiEvaluation.feedback || (!t1Obj?.feedback && !t2Obj?.feedback)) && (
                      <div className="p-4 bg-orange-50/50 rounded-xl border border-brand-200 space-y-1 text-xs">
                        <div className="font-bold text-brand-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                          Examiner Qualitative Evaluation & Recommendations
                        </div>
                        <p className="text-slate-700 leading-relaxed pt-1">
                          {aiEvaluation.feedback || "Detailed evaluation recorded based on official IELTS writing band descriptors."}
                        </p>
                      </div>
                    )}

                    {/* Highlighted Errors & Suggestions */}
                    {allMistakes.length > 0 && (
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2.5 text-xs shadow-xs">
                        <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          Detected Errors & Academic Corrections ({allMistakes.length})
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {allMistakes.map((errItem, idx) => (
                            <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-white text-slate-600 border border-slate-200">
                                  Task {errItem.task || (idx % 2 === 0 ? 1 : 2)}
                                </span>
                                <span className="line-through text-rose-600 font-mono text-[11px]">
                                  {errItem.original}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="font-bold text-emerald-600 font-mono text-[11px]">
                                  {errItem.correction}
                                </span>
                              </div>
                              {(errItem.reason || errItem.explanation) && (
                                <div className="text-[11px] text-slate-500">
                                  {errItem.reason || errItem.explanation}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })()}
            </div>

            {/* Essays Grid: Task 1 vs Task 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Task 1 Review */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-brand-500 text-white font-mono text-xs flex items-center justify-center font-bold">
                      T1
                    </span>
                    <span className="font-bold text-xs text-slate-900">Task 1: Academic Report</span>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                    task1Words >= 150 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {task1Words} words (min 150)
                  </span>
                </div>

                {/* Prompt Excerpt */}
                <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-600">
                  <strong>Prompt: </strong> {exam.task_1_prompt || exam.writing_tasks?.task1?.prompt || exam.writing?.task1?.prompt || "Summarise the graph or chart data."}
                </div>

                {/* Essay Body */}
                <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 text-xs text-slate-800 leading-relaxed max-h-[320px] overflow-y-auto whitespace-pre-wrap font-sans">
                  {task1Text || <span className="italic text-slate-400">No essay submitted by candidate.</span>}
                </div>
              </div>

              {/* Task 2 Review */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-brand-500 text-white font-mono text-xs flex items-center justify-center font-bold">
                      T2
                    </span>
                    <span className="font-bold text-xs text-slate-900">Task 2: Discursive Essay</span>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                    task2Words >= 250 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {task2Words} words (min 250)
                  </span>
                </div>

                {/* Prompt Excerpt */}
                <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-600">
                  <strong>Prompt: </strong> {exam.task_2_prompt || exam.writing_tasks?.task2?.prompt || exam.writing?.task2?.prompt || "Discuss both views on this topic and give your opinion."}
                </div>

                {/* Essay Body */}
                <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 text-xs text-slate-800 leading-relaxed max-h-[320px] overflow-y-auto whitespace-pre-wrap font-sans">
                  {task2Text || <span className="italic text-slate-400">No essay submitted by candidate.</span>}
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

    </Modal>
  );
}
