import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Send, 
  AlertTriangle, 
  CheckCircle, 
  FileText, 
  Headphones, 
  PenTool, 
  Layers,
  ChevronRight,
  ShieldCheck,
  Radio,
  Lock,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { PassageViewer } from './PassageViewer';
import { AnswerSheet } from './AnswerSheet';
import { ListeningSection } from './ListeningSection';
import { WritingSection } from './WritingSection';
import { AntiCheatOverlay } from './AntiCheatOverlay';
import { StudentIntermissionLobby } from './StudentIntermissionLobby';
import { ResultsScreen } from './ResultsScreen';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { gradeSectionExam } from '../../lib/ieltsGrading';
import { getSealedAnswerKeys, hydrateQuestionsWithAnswers } from '../../lib/answerVault';
import { fetchExamAnswerKeys } from '../../lib/supabase';
import { getRemainingSeconds, formatExamTimer } from '../../lib/examTimerUtils';

export function StudentExamRoom({
  exam,
  student,
  onUpdateAnswers,
  onStudentSubmit,
  onStudentTransitionStage,
  onDisqualifyStudent,
  onWarnStudent,
  onExit,
}) {
  const isAdminAuthed = typeof window !== 'undefined' && sessionStorage.getItem('ielts_admin_authenticated') === 'true';
  const currentStage = exam.current_stage || ((exam.status === 'active' || exam.status === 'in_progress') ? 'listening_active' : 'listening_lobby');

  // Local Storage Cache Key
  const storageKey = `ielts_student_answers_${exam.id}_${student.id}`;

  const getCachedAnswers = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };
  const cached = getCachedAnswers();

  // Reading State
  const [activePassageId, setActivePassageId] = useState(1);
  const [readingAnswers, setReadingAnswers] = useState(
    cached?.reading || student.answers?.reading || student.answers || {}
  );
  const [readingFlagged, setReadingFlagged] = useState({});

  // Listening State
  const [listeningAnswers, setListeningAnswers] = useState(
    cached?.listening || student.answers?.listening || {}
  );
  const [listeningFlagged, setListeningFlagged] = useState({});

  // Writing State
  const [task1Essay, setTask1Essay] = useState(
    cached?.writing?.task1 || student.writing_task1_essay || student.answers?.writing?.task1 || ''
  );
  const [task2Essay, setTask2Essay] = useState(
    cached?.writing?.task2 || student.writing_task2_essay || student.answers?.writing?.task2 || ''
  );

  // Section Auto-Lock & Intermission Modal State
  const [showSectionLockedModal, setShowSectionLockedModal] = useState(false);
  const [lockedSectionType, setLockedSectionType] = useState(null); // 'listening' | 'reading' | 'writing'
  const [timeRemaining, setTimeRemaining] = useState(() => getRemainingSeconds(exam, currentStage));

  // Determine current active section from exam.current_stage: Listening -> Reading -> Writing
  const activeSection = currentStage.startsWith('listening') 
    ? 'listening' 
    : currentStage.startsWith('reading') 
    ? 'reading' 
    : currentStage.startsWith('writing') 
    ? 'writing' 
    : 'listening';

  // Server-Anchored Synchronized Countdown Timer per Stage
  useEffect(() => {
    const isStageActive = currentStage.endsWith('_active');
    if (!isStageActive) {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      const hasDeadline = Boolean(exam?.stage_ends_at || exam?.stage_started_at);
      const diff = getRemainingSeconds(exam, currentStage);
      setTimeRemaining(diff);

      // Only lock section if timestamps have been verified and deadline actually passed
      if (hasDeadline && diff <= 0 && isStageActive) {
        handleSectionTimeUp(activeSection);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentStage, exam?.stage_ends_at, exam?.stage_started_at, activeSection]);

  // Handle stage change from teacher
  useEffect(() => {
    if (currentStage === 'listening_finished' && lockedSectionType !== 'listening') {
      setLockedSectionType('listening');
      setShowSectionLockedModal(true);
    } else if (currentStage === 'reading_finished' && lockedSectionType !== 'reading') {
      setLockedSectionType('reading');
      setShowSectionLockedModal(true);
    } else if ((currentStage === 'writing_finished' || currentStage === 'exam_completed') && student.status !== 'submitted' && student.status !== 'completed') {
      handleSubmitFinalExam();
    }
  }, [currentStage]);

  // Auto lock when timer hits 0
  const handleSectionTimeUp = (section) => {
    setLockedSectionType(section);
    setShowSectionLockedModal(true);
  };

  const persistAnswers = (reading, listening, writing) => {
    const fullAnswers = {
      reading,
      listening,
      writing,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(fullAnswers));
    } catch (e) {
      console.warn('Failed to sync answers to localStorage:', e);
    }
    const count =
      Object.keys(reading).filter((k) => reading[k]?.trim()).length +
      Object.keys(listening).filter((k) => listening[k]?.trim()).length;
    onUpdateAnswers(student.id, fullAnswers, count);
  };

  // Reading Answer Change
  const handleReadingAnswerChange = (questionNumber, value) => {
    if (currentStage !== 'reading_active' || student.status !== 'in_progress' || timeRemaining <= 0) return;

    const updated = {
      ...readingAnswers,
      [questionNumber]: value
    };
    setReadingAnswers(updated);
    persistAnswers(updated, listeningAnswers, { task1: task1Essay, task2: task2Essay });
  };

  // Listening Answer Change
  const handleListeningAnswerChange = (questionNumber, value) => {
    if (currentStage !== 'listening_active' || student.status !== 'in_progress' || timeRemaining <= 0) return;

    const updated = {
      ...listeningAnswers,
      [questionNumber]: value
    };
    setListeningAnswers(updated);
    persistAnswers(readingAnswers, updated, { task1: task1Essay, task2: task2Essay });
  };

  // Writing Essay Change
  const handleTask1Change = (text) => {
    if (currentStage !== 'writing_active' || student.status !== 'in_progress' || timeRemaining <= 0) return;

    setTask1Essay(text);
    persistAnswers(readingAnswers, listeningAnswers, { task1: text, task2: task2Essay });
  };

  const handleTask2Change = (text) => {
    if (currentStage !== 'writing_active' || student.status !== 'in_progress' || timeRemaining <= 0) return;

    setTask2Essay(text);
    persistAnswers(readingAnswers, listeningAnswers, { task1: task1Essay, task2: text });
  };

  // Transition to next section lobby
  const handleProceedToNextSection = () => {
    setShowSectionLockedModal(false);

    if (lockedSectionType === 'listening') {
      if (onStudentTransitionStage) {
        onStudentTransitionStage(student.id, 'reading_lobby', { listening_status: 'completed', reading_status: 'lobby' });
      }
    } else if (lockedSectionType === 'reading') {
      if (onStudentTransitionStage) {
        onStudentTransitionStage(student.id, 'writing_lobby', { reading_status: 'completed', writing_status: 'lobby' });
      }
    } else if (lockedSectionType === 'writing') {
      handleSubmitFinalExam();
    }
  };

  // Submit Final Exam -> Grade with hydrated keys from vault at final submit
  const handleSubmitFinalExam = async () => {
    setShowSectionLockedModal(false);

    let readingQs = exam.reading?.questions || exam.reading_questions || exam.parsed_questions || exam.questions || [];
    let listeningQs = exam.listening?.questions || exam.listening_questions || exam.questions || [];

    // SEC-06: Retrieve answer keys from private memory vault
    const pin = exam.pin_code || student.pin_code;
    let keys = getSealedAnswerKeys(pin);

    // Fallback: If vault was cleared on page reload, securely fetch keys from Supabase
    if (!keys && pin) {
      try {
        const { data: dbKeys } = await fetchExamAnswerKeys(pin);
        if (dbKeys) {
          keys = {
            readingQuestions: dbKeys.reading_questions || [],
            listeningQuestions: dbKeys.listening_questions || [],
            answerKeys: dbKeys.answer_keys || {}
          };
        }
      } catch (err) {
        console.warn("Failed to fetch answer keys from Supabase at submit time:", err);
      }
    }

    // Hydrate questions with acceptedAnswers for grading
    if (keys) {
      readingQs = hydrateQuestionsWithAnswers(readingQs, keys.readingQuestions, keys.answerKeys);
      listeningQs = hydrateQuestionsWithAnswers(listeningQs, keys.listeningQuestions, keys.answerKeys);
    }

    const readingResult = gradeSectionExam(readingQs, readingAnswers, 'reading');
    const listeningResult = gradeSectionExam(listeningQs, listeningAnswers, 'listening');

    const fullAnswers = {
      reading: readingAnswers,
      listening: listeningAnswers,
      writing: { task1: task1Essay, task2: task2Essay }
    };

    onStudentSubmit(
      student.id, 
      fullAnswers, 
      readingResult.rawScore, 
      readingResult.bandScore, 
      listeningResult.rawScore, 
      listeningResult.bandScore,
      task1Essay,
      task2Essay
    );
  };

  const formatTimer = (seconds) => {
    return formatExamTimer(seconds);
  };

  // STRICT PRIVACY RULE: If student is submitted or exam completed, ONLY show the ResultsScreen confirmation
  if (student.status === 'submitted' || student.status === 'completed' || currentStage === 'exam_completed') {
    return (
      <ResultsScreen
        student={student}
        exam={exam}
        onExit={onExit}
      />
    );
  }

  // Intermission Lobby Screens between sections
  // Strictly respect the exam's current stage: while listening_active is running, candidate stays in listening
  if (
    currentStage === 'reading_lobby' ||
    (currentStage !== 'listening_active' && (student.current_stage === 'reading_lobby' || student.reading_status === 'lobby'))
  ) {
    return (
      <StudentIntermissionLobby
        student={student}
        exam={exam}
        completedSection="listening"
        nextSection="reading"
      />
    );
  }

  if (
    currentStage === 'writing_lobby' ||
    (currentStage !== 'reading_active' && currentStage !== 'listening_active' && (student.current_stage === 'writing_lobby' || student.writing_status === 'lobby'))
  ) {
    return (
      <StudentIntermissionLobby
        student={student}
        exam={exam}
        completedSection="reading"
        nextSection="writing"
      />
    );
  }

  const readingQuestionsList = exam.reading?.questions || exam.questions || [];
  const listeningQuestionsList = exam.listening?.questions || [];
  const readingTotalCount = readingQuestionsList.length || 40;
  const listeningTotalCount = listeningQuestionsList.length || 40;

  const readingAnsweredCount = Object.keys(readingAnswers).filter(k => readingAnswers[k]?.trim()).length;
  const listeningAnsweredCount = Object.keys(listeningAnswers).filter(k => listeningAnswers[k]?.trim()).length;
  const isTimeCritical = timeRemaining < 300 && timeRemaining > 0;

  return (
    <div className={`h-full flex flex-col bg-white ${isAdminAuthed ? 'select-text [&_*]:select-text' : 'select-none'} overflow-hidden`}>
      
      {/* Top Synchronized Navigation & Stage Indicator (Max-Height: 48px) */}
      <div className="h-12 px-3 sm:px-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-xs z-20 shrink-0">
        
        {/* Left: Candidate Info & Stage Pill */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-800 font-extrabold flex items-center justify-center text-xs border border-slate-200 shrink-0">
            {student.name.charAt(0)}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span className="truncate max-w-[120px] sm:max-w-none">{student.name}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                {activeSection.toUpperCase()}
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {student.candidate_no} • PIN: <strong className="text-slate-900 font-bold">{exam.pin_code}</strong>
            </div>
          </div>
        </div>

        {/* Center: Stage Progress Tracker (1. Listening -> 2. Reading -> 3. Writing) */}
        <div className="hidden md:flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
            activeSection === 'listening' 
              ? 'bg-white text-slate-900 border border-slate-300 shadow-xs font-extrabold' 
              : activeSection === 'reading' || activeSection === 'writing'
              ? 'text-slate-800 bg-slate-50/80 border border-slate-200'
              : 'text-slate-400'
          }`}>
            <Headphones className="w-3 h-3 text-slate-600" />
            <span>1. Listening ({listeningAnsweredCount}/{listeningTotalCount})</span>
          </div>

          <ChevronRight className="w-3 h-3 text-slate-300" />

          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
            activeSection === 'reading' 
              ? 'bg-white text-slate-900 border border-slate-300 shadow-xs font-extrabold' 
              : activeSection === 'writing'
              ? 'text-slate-800 bg-slate-50/80 border border-slate-200'
              : 'text-slate-400'
          }`}>
            <FileText className="w-3 h-3 text-slate-600" />
            <span>2. Reading ({readingAnsweredCount}/{readingTotalCount})</span>
          </div>

          <ChevronRight className="w-3 h-3 text-slate-300" />

          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
            activeSection === 'writing' 
              ? 'bg-white text-slate-900 border border-slate-300 shadow-xs font-extrabold' 
              : 'text-slate-400'
          }`}>
            <PenTool className="w-3 h-3 text-slate-600" />
            <span>3. Writing</span>
          </div>
        </div>

        {/* Right: Section Countdown Timer */}
        <div className="flex items-center gap-2">
          <div 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono font-bold text-xs shadow-xs transition-all ${
              isTimeCritical 
                ? 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse' 
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <Clock className={`w-3.5 h-3.5 ${isTimeCritical ? 'text-rose-500' : 'text-slate-700'}`} />
            <span>{formatTimer(timeRemaining)}</span>
          </div>

          {activeSection === 'writing' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSectionTimeUp('writing')}
              className="text-xs font-bold border-slate-300 text-slate-800 hover:bg-slate-100 h-8 px-2.5 cursor-pointer"
            >
              Submit Exam
            </Button>
          )}
        </div>

      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {activeSection === 'reading' && (() => {
          const currentPartKey = `part${activePassageId}`;
          const currentPartData = exam.reading_parts?.[currentPartKey];
          const currentPartPdfUrl = currentPartData?.pdf_url || 
                                    exam.reading_passages?.[activePassageId - 1]?.pdf_url || 
                                    exam.reading?.passages?.[activePassageId - 1]?.pdf_url || 
                                    exam.reading?.pdf_url || 
                                    exam.reading_pdf_url;
          const currentPartPdfName = currentPartData?.pdf_name || 
                                     exam.reading_passages?.[activePassageId - 1]?.pdf_name || 
                                     exam.reading?.passages?.[activePassageId - 1]?.pdf_name || 
                                     exam.reading?.pdf_name || 
                                     exam.reading_pdf_name;

          const compiledPassages = [1, 2, 3].map(pId => {
            const pKey = `part${pId}`;
            const pData = exam.reading_parts?.[pKey];
            const existing = (exam.reading_passages || exam.reading?.passages || [])[pId - 1];
            const content = 
              pData?.content || 
              pData?.passage_text || 
              pData?.passageText || 
              pData?.text || 
              existing?.content || 
              existing?.passage_text || 
              existing?.passageText || 
              existing?.text || 
              '';

            return {
              id: pId,
              title: pData?.title || existing?.title || `Passage ${pId}`,
              content: content,
              passage_text: content,
              passageText: content,
              text: content,
              page_content_html: pData?.page_content_html || existing?.page_content_html || '',
              paragraphs: pData?.paragraphs || existing?.paragraphs || [],
              pdf_url: pData?.pdf_url || existing?.pdf_url || '',
              pdf_name: pData?.pdf_name || existing?.pdf_name || '',
              range: pData?.range || existing?.range || pData?.question_range || existing?.question_range || '',
              question_range: pData?.question_range || existing?.question_range || pData?.range || existing?.range || '',
              startQ: pData?.startQ ?? existing?.startQ ?? null,
              endQ: pData?.endQ ?? existing?.endQ ?? null,
              reference_box: pData?.reference_box || pData?.referenceBox || existing?.reference_box || existing?.referenceBox || null,
              referenceBox: pData?.reference_box || pData?.referenceBox || existing?.reference_box || existing?.referenceBox || null,
              options: pData?.options || existing?.options || null,
            };
          });

          const currentPassage = compiledPassages[activePassageId - 1];

          return (
            <div className="h-full min-h-0 flex flex-col md:flex-row overflow-hidden">
              <div className="w-full md:w-3/5 h-1/2 md:h-full min-h-0 border-b md:border-b-0 md:border-r border-slate-200 overflow-hidden flex flex-col">
                <PassageViewer
                  passages={compiledPassages}
                  activePassageId={activePassageId}
                  onSelectPassage={setActivePassageId}
                  pdfUrl={currentPartPdfUrl}
                  pdfName={currentPartPdfName}
                />
              </div>
              <div className="w-full md:w-2/5 h-1/2 md:h-full min-h-0 overflow-hidden bg-slate-50/50 flex flex-col">
                <AnswerSheet
                  questions={exam.reading?.questions || exam.reading_questions || exam.parsed_questions || exam.questions || []}
                  answers={readingAnswers}
                  flagged={readingFlagged}
                  onAnswerChange={handleReadingAnswerChange}
                  onToggleFlag={(qNum) => setReadingFlagged(prev => ({ ...prev, [qNum]: !prev[qNum] }))}
                  activePassageId={activePassageId}
                  onJumpToPassage={setActivePassageId}
                  passage={currentPassage}
                  passages={compiledPassages}
                  exam={exam}
                  isTimeUp={timeRemaining <= 0}
                  timeRemaining={timeRemaining}
                  bookletHtml={
                    exam.reading?.sections?.find(s => s.part === activePassageId)?.page_content_html ||
                    exam.reading_parts?.[`part${activePassageId}`]?.page_content_html ||
                    compiledPassages[activePassageId - 1]?.page_content_html ||
                    ''
                  }
                />
              </div>
            </div>
          );
        })()}

        {activeSection === 'writing' && (
          <div className="h-full overflow-hidden bg-slate-50">
            <WritingSection
              exam={exam}
              writingData={exam.writing_tasks || exam.writing}
              task1Essay={task1Essay}
              task2Essay={task2Essay}
              isTimeUp={timeRemaining <= 0}
              timeRemaining={timeRemaining}
              onTask1Change={handleTask1Change}
              onTask2Change={handleTask2Change}
            />
          </div>
        )}

        {activeSection === 'listening' && (
          <div className="h-full overflow-hidden bg-slate-50">
            <ListeningSection
              exam={exam}
              student={student}
              answers={listeningAnswers}
              flagged={listeningFlagged}
              isTimeUp={Boolean(exam?.stage_ends_at || exam?.stage_started_at) && timeRemaining <= 0}
              timeRemaining={timeRemaining}
              onAnswerChange={handleListeningAnswerChange}
              onToggleFlag={(qNum) => setListeningFlagged(prev => ({ ...prev, [qNum]: !prev[qNum] }))}
            />
          </div>
        )}
      </div>

      {/* Anti-Cheat Background Watchdog - Completely omitted for authenticated teacher/admin */}
      {!isAdminAuthed && (
        <AntiCheatOverlay
          exam={exam}
          student={student}
          isExamActive={Boolean(currentStage && currentStage.endsWith('_active'))}
          onDisqualify={onDisqualifyStudent}
          onWarn={onWarnStudent}
        />
      )}

      {/* Section Auto-Lock Modal */}
      {showSectionLockedModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xl text-center space-y-6">
            
            <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center mx-auto shadow-xs">
              <Lock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                <Clock className="w-3.5 h-3.5" /> SECTION COMPLETED & LOCKED
              </span>
              
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {lockedSectionType === 'reading' && 'Reading Section Has Ended'}
                {lockedSectionType === 'writing' && 'Writing Section Has Ended'}
                {lockedSectionType === 'listening' && 'Listening Section Has Ended'}
              </h3>
              
              <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
                Time is up or the examiner has closed this section. Your responses have been securely locked and saved to the examination server.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Candidate Name:</span>
                <span className="font-bold text-slate-900">{student.name}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Completed Module:</span>
                <span className="font-bold text-slate-900 uppercase">{lockedSectionType}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Status:</span>
                <span className="font-bold text-emerald-600">Encrypted & Transmitted</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              icon={ArrowRight}
              onClick={handleProceedToNextSection}
              className="w-full py-4 text-base font-extrabold bg-slate-800 hover:bg-slate-900 text-white shadow-xs"
            >
              {lockedSectionType === 'listening' && 'PROCEED TO READING'}
              {lockedSectionType === 'reading' && 'PROCEED TO WRITING'}
              {lockedSectionType === 'writing' && 'COMPLETE & SUBMIT EXAM'}
            </Button>

          </div>
        </div>
      )}

    </div>
  );
}
