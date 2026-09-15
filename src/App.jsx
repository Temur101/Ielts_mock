import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { StudentJoin } from './components/student/StudentJoin';
import { StudentWaitingRoom } from './components/student/StudentWaitingRoom';
import { StudentExamRoom } from './components/student/StudentExamRoom';
import { DEFAULT_IELTS_EXAM, INITIAL_MOCK_STUDENTS } from './lib/mockData';
import { realtimeBus } from './lib/realtimeBus';
import { 
  updateExamStage, 
  updateStudentStage, 
  subscribeToExamRealtime,
  updateExamPinCode,
  upsertStudent 
} from './lib/supabase';
import { 
  gradeSectionExam, 
  calculateWritingBand, 
  calculateOverallIeltsBand 
} from './lib/ieltsGrading';
import { archiveCurrentSession } from './lib/sessionHistory';
import { loadPersistentExam, savePersistentExam, isCorruptedExam } from './lib/persistentStorage';
import { apiGradeWritingSubmission } from './lib/ai/gemini-client';

// Web Audio tone generator
function playExamTone(type = 'start') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'start') {
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } else if (type === 'warning') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'finish') {
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    }
  } catch (err) {
    // AudioContext blocked
  }
}

export default function App() {
  const [currentRole, setCurrentRole] = useState(() => {
    return localStorage.getItem('ielts_active_role') || 'admin';
  });

  const [exam, setExam] = useState(() => {
    try {
      const saved = localStorage.getItem('ielts_current_exam');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!isCorruptedExam(parsed)) {
          return parsed;
        }
        localStorage.removeItem('ielts_current_exam');
      }
    } catch (e) {}
    return DEFAULT_IELTS_EXAM;
  });

  const [students, setStudents] = useState(() => {
    const saved = localStorage.getItem('ielts_students_list');
    return saved ? JSON.parse(saved) : INITIAL_MOCK_STUDENTS;
  });

  const [currentStudent, setCurrentStudent] = useState(() => {
    const saved = localStorage.getItem('ielts_current_student');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeAdminTab, setActiveAdminTab] = useState(() => {
    return localStorage.getItem('ielts_admin_tab') || 'lobby';
  });

  const [soundEnabled, setSoundEnabled] = useState(true);

  // Load master exam from IndexedDB persistent storage on startup
  useEffect(() => {
    async function initExamFromStorage() {
      try {
        const persisted = await loadPersistentExam();
        if (persisted && persisted.id) {
          setExam(prev => {
            const updatedReading = { ...(prev.reading || {}), ...(persisted.reading || {}) };
            const updatedListening = { ...(prev.listening || {}), ...(persisted.listening || {}) };
            const updatedWriting = { ...(prev.writing || {}), ...(persisted.writing || {}) };

            return {
              ...prev,
              ...persisted,
              reading: updatedReading,
              writing: updatedWriting,
              listening: updatedListening,
              passages: persisted.passages || persisted.reading_passages || updatedReading.passages || prev.passages,
              questions: persisted.questions || persisted.reading_questions || updatedReading.questions || prev.questions,
            };
          });
        }
      } catch (err) {
        console.warn("Could not load exam from persistent storage:", err);
      }
    }
    initExamFromStorage();
  }, []);

  // Sync state changes to localStorage and IndexedDB
  useEffect(() => {
    localStorage.setItem('ielts_admin_tab', activeAdminTab);
  }, [activeAdminTab]);

  useEffect(() => {
    localStorage.setItem('ielts_active_role', currentRole);
  }, [currentRole]);

  useEffect(() => {
    savePersistentExam(exam);
  }, [exam]);

  useEffect(() => {
    localStorage.setItem('ielts_students_list', JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    if (currentStudent) {
      localStorage.setItem('ielts_current_student', JSON.stringify(currentStudent));
    }
  }, [currentStudent]);

  // Real-time Event Subscription Listener
  useEffect(() => {
    const unsubscribe = realtimeBus.subscribe(({ type, payload }) => {
      switch (type) {
        case 'ADMIN_OPEN_LOBBY': {
          setExam(prev => ({ ...prev, is_lobby_open: true }));
          break;
        }
        case 'ADMIN_SET_STAGE': {
          const { stage, stage_started_at } = payload;
          setExam(prev => {
            const isFinished = stage === 'exam_completed' || stage === 'writing_finished';
            const isActive = stage.endsWith('_active');
            return {
              ...prev,
              current_stage: stage,
              status: isFinished ? 'finished' : isActive ? 'active' : 'lobby',
              stage_started_at: stage_started_at || (isActive ? new Date().toISOString() : prev.stage_started_at),
              started_at: (stage === 'listening_active' && !prev.started_at) ? (stage_started_at || new Date().toISOString()) : prev.started_at,
              ended_at: isFinished ? new Date().toISOString() : prev.ended_at
            };
          });

          // Sync student statuses
          setStudents(prev => prev.map(s => {
            if (stage === 'listening_active') {
              return { ...s, status: s.status === 'waiting' ? 'in_progress' : s.status, listening_status: 'in_progress', current_stage: 'listening_active' };
            }
            if (stage === 'listening_finished') {
              return { ...s, listening_status: 'completed' };
            }
            if (stage === 'reading_lobby') {
              return { ...s, reading_status: 'lobby', current_stage: 'reading_lobby' };
            }
            if (stage === 'reading_active') {
              return { ...s, status: 'in_progress', reading_status: 'in_progress', current_stage: 'reading_active' };
            }
            if (stage === 'reading_finished') {
              return { ...s, reading_status: 'completed' };
            }
            if (stage === 'writing_lobby') {
              return { ...s, writing_status: 'lobby', current_stage: 'writing_lobby' };
            }
            if (stage === 'writing_active') {
              return { ...s, status: 'in_progress', writing_status: 'in_progress', current_stage: 'writing_active' };
            }
            if (stage === 'writing_finished' || stage === 'exam_completed') {
              const rRes = gradeSectionExam(exam.reading?.questions || exam.questions || [], s.answers?.reading || s.answers || {}, 'reading');
              const lRes = gradeSectionExam(exam.listening?.questions || [], s.answers?.listening || {}, 'listening');
              const wBand = calculateWritingBand(s.writing_task1_band ?? 6.5, s.writing_task2_band ?? 7.0);
              const oBand = calculateOverallIeltsBand(rRes.bandScore, lRes.bandScore, wBand);

              return {
                ...s,
                status: 'submitted',
                current_stage: 'exam_completed',
                reading_status: 'completed',
                writing_status: 'completed',
                listening_status: 'completed',
                reading_score: rRes.rawScore,
                reading_band: rRes.bandScore,
                listening_score: lRes.rawScore,
                listening_band: lRes.bandScore,
                writing_band: wBand,
                overall_band: oBand,
                score: rRes.rawScore,
                band_score: rRes.bandScore,
              };
            }
            return s;
          }));

          setCurrentStudent(prev => {
            if (!prev) return null;
            if (stage === 'listening_active') {
              return { ...prev, status: prev.status === 'waiting' ? 'in_progress' : prev.status, listening_status: 'in_progress', current_stage: 'listening_active' };
            }
            if (stage === 'listening_finished') {
              return { ...prev, listening_status: 'completed' };
            }
            if (stage === 'reading_lobby') {
              return { ...prev, reading_status: 'lobby', current_stage: 'reading_lobby' };
            }
            if (stage === 'reading_active') {
              return { ...prev, status: 'in_progress', reading_status: 'in_progress', current_stage: 'reading_active' };
            }
            if (stage === 'reading_finished') {
              return { ...prev, reading_status: 'completed' };
            }
            if (stage === 'writing_lobby') {
              return { ...prev, writing_status: 'lobby', current_stage: 'writing_lobby' };
            }
            if (stage === 'writing_active') {
              return { ...prev, status: 'in_progress', writing_status: 'in_progress', current_stage: 'writing_active' };
            }
            if (stage === 'writing_finished' || stage === 'exam_completed') {
              const rRes = gradeSectionExam(exam.reading?.questions || exam.questions || [], prev.answers?.reading || prev.answers || {}, 'reading');
              const lRes = gradeSectionExam(exam.listening?.questions || [], prev.answers?.listening || {}, 'listening');
              const wBand = calculateWritingBand(prev.writing_task1_band ?? 6.5, prev.writing_task2_band ?? 7.0);
              const oBand = calculateOverallIeltsBand(rRes.bandScore, lRes.bandScore, wBand);

              return {
                ...prev,
                status: 'submitted',
                current_stage: 'exam_completed',
                reading_status: 'completed',
                writing_status: 'completed',
                listening_status: 'completed',
                reading_score: rRes.rawScore,
                reading_band: rRes.bandScore,
                listening_score: lRes.rawScore,
                listening_band: lRes.bandScore,
                writing_band: wBand,
                overall_band: oBand,
                score: rRes.rawScore,
                band_score: rRes.bandScore,
              };
            }
            return prev;
          });

          if (soundEnabled) {
            if (stage.endsWith('_active')) playExamTone('start');
            else if (stage === 'exam_completed') playExamTone('finish');
          }
          break;
        }

        case 'STUDENT_SECTION_TRANSITION': {
          const { studentId, nextStage, stageUpdates } = payload;
          setStudents(prev => prev.map(s => {
            if (s.id === studentId) {
              return {
                ...s,
                current_stage: nextStage,
                ...(stageUpdates || {}),
                last_seen: new Date().toISOString()
              };
            }
            return s;
          }));

          if (currentStudent?.id === studentId) {
            setCurrentStudent(prev => prev ? {
              ...prev,
              current_stage: nextStage,
              ...(stageUpdates || {}),
              last_seen: new Date().toISOString()
            } : null);
          }
          break;
        }

        case 'ADMIN_START_EXAM':
          handleSetStage('listening_active');
          break;

        case 'ADMIN_FORCE_END':
          handleSetStage('exam_completed');
          break;

        case 'ADMIN_UPDATE_PIN':
          setExam(prev => ({
            ...prev,
            pin_code: payload.pin_code
          }));
          break;

        case 'ADMIN_UPDATE_EXAM':
          setExam(payload.exam);
          break;

        case 'ADMIN_RESET_SESSION': {
          const resetPin = payload.pin_code || `IELTS-${Math.floor(100 + Math.random() * 900)}`;
          setExam(payload.exam || {
            ...DEFAULT_IELTS_EXAM,
            pin_code: resetPin,
            status: 'lobby',
            current_stage: 'listening_lobby',
            started_at: null,
            stage_started_at: null,
            ended_at: null,
          });
          setStudents([]);
          setCurrentStudent(null);
          localStorage.removeItem('ielts_current_student');
          localStorage.removeItem('ielts_students_list');
          break;
        }

        case 'STUDENT_JOIN':
          setStudents(prev => {
            const exists = prev.some(s => s.id === payload.student.id);
            if (exists) return prev;
            return [...prev, payload.student];
          });
          break;

        case 'STUDENT_ANSWER_UPDATE':
          setStudents(prev => prev.map(s => {
            if (s.id === payload.studentId) {
              return {
                ...s,
                answers: payload.answers,
                answered_count: payload.answeredCount,
                last_seen: new Date().toISOString()
              };
            }
            return s;
          }));
          break;

        case 'STUDENT_STATUS_UPDATE':
          setStudents(prev => prev.map(s => {
            if (s.id === payload.studentId) {
              return {
                ...s,
                ...payload.updates,
                last_seen: new Date().toISOString()
              };
            }
            return s;
          }));

          if (payload.updates?.status === 'disqualified' && soundEnabled) {
            playExamTone('warning');
          }
          break;

        case 'ADMIN_SAVE_GRADES':
          setStudents(prev => prev.map(s => {
            if (s.id === payload.studentId) {
              return {
                ...s,
                ...payload.grades,
              };
            }
            return s;
          }));
          break;

        case 'ADMIN_KICK_STUDENT':
          setStudents(prev => prev.map(s => {
            if (s.id === payload.studentId) {
              return { ...s, status: 'kicked', disqualification_reason: 'Kicked by instructor' };
            }
            return s;
          }));
          if (currentStudent?.id === payload.studentId) {
            setCurrentStudent(prev => prev ? { ...prev, status: 'kicked', disqualification_reason: 'Kicked by instructor' } : null);
          }
          break;

        case 'ADMIN_UNBAN_STUDENT':
          setStudents(prev => prev.map(s => {
            if (s.id === payload.studentId) {
              return { 
                ...s, 
                status: exam.status === 'active' ? 'in_progress' : 'waiting', 
                disqualification_reason: null, 
                warning_count: 0,
              };
            }
            return s;
          }));
          if (currentStudent?.id === payload.studentId) {
            setCurrentStudent(prev => prev ? { 
              ...prev, 
              status: exam.status === 'active' ? 'in_progress' : 'waiting', 
              disqualification_reason: null, 
              warning_count: 0,
            } : null);
          }
          break;

        case 'ADMIN_WARN_STUDENT':
          if (currentStudent?.id === payload.studentId) {
            setCurrentStudent(prev => prev ? { ...prev, warning_count: (prev.warning_count || 0) + 1 } : null);
            if (soundEnabled) playExamTone('warning');
          }
          setStudents(prev => prev.map(s => {
            if (s.id === payload.studentId) {
              return { ...s, warning_count: (s.warning_count || 0) + 1 };
            }
            return s;
          }));
          break;

        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [soundEnabled, exam, currentStudent?.id]);

  // Live Supabase Realtime Channel Subscription (Instant Asset & State Broadcast)
  useEffect(() => {
    if (!exam?.pin_code) return;

    const channel = subscribeToExamRealtime(exam.pin_code, {
      onExamChange: (payload) => {
        if (payload.new && (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')) {
          const newExam = payload.new;
          setExam(prev => ({
            ...prev,
            title: newExam.title || prev.title,
            duration_mins: newExam.duration_mins || prev.duration_mins,
            anti_cheat_strictness: newExam.anti_cheat_strictness || prev.anti_cheat_strictness,
            reading_pdf_url: newExam.reading_pdf_url !== undefined ? newExam.reading_pdf_url : prev.reading_pdf_url,
            reading_pdf_name: newExam.reading_pdf_name || prev.reading_pdf_name,
            reading_passages: newExam.reading_passages || prev.reading_passages,
            reading_questions: newExam.reading_questions || prev.reading_questions,
            writing_pdf_url: newExam.writing_pdf_url !== undefined ? newExam.writing_pdf_url : prev.writing_pdf_url,
            writing_pdf_name: newExam.writing_pdf_name || prev.writing_pdf_name,
            writing_task1: newExam.writing_task1 || prev.writing_task1,
            writing_task2: newExam.writing_task2 || prev.writing_task2,
            listening_audio_parts: newExam.listening_audio_parts || prev.listening_audio_parts,
            listening_pdf_url: newExam.listening_pdf_url !== undefined ? newExam.listening_pdf_url : prev.listening_pdf_url,
            listening_pdf_name: newExam.listening_pdf_name || prev.listening_pdf_name,
            listening_parts: newExam.listening_parts || prev.listening_parts,
            listening_parts_data: newExam.listening_parts_data || prev.listening_parts_data,
            listening_questions: newExam.listening_questions || prev.listening_questions,
            reading: {
              ...(prev.reading || {}),
              pdf_url: newExam.reading_pdf_url !== undefined ? newExam.reading_pdf_url : prev.reading?.pdf_url,
              pdf_name: newExam.reading_pdf_name || prev.reading?.pdf_name,
              passages: newExam.reading_passages || prev.reading?.passages,
              questions: newExam.reading_questions || prev.reading?.questions,
            },
            listening: {
              ...(prev.listening || {}),
              pdf_url: newExam.listening_pdf_url !== undefined ? newExam.listening_pdf_url : prev.listening?.pdf_url,
              pdf_name: newExam.listening_pdf_name || prev.listening?.pdf_name,
              parts: newExam.listening_parts || prev.listening?.parts,
              parts_data: newExam.listening_parts_data || prev.listening?.parts_data,
              questions: newExam.listening_questions || prev.listening?.questions,
            },
            passages: newExam.reading_passages || prev.passages,
            questions: newExam.reading_questions || prev.questions,
          }));
        }
      },
      onStudentChange: (payload) => {
        if (payload.new && (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')) {
          const updatedStudent = payload.new;
          setStudents(prev => {
            const exists = prev.some(s => s.id === updatedStudent.id);
            if (exists) {
              return prev.map(s => s.id === updatedStudent.id ? { ...s, ...updatedStudent } : s);
            }
            return [...prev, updatedStudent];
          });
          if (currentStudent?.id === updatedStudent.id) {
            setCurrentStudent(prev => prev ? { ...prev, ...updatedStudent } : null);
          }
        }
      }
    });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [exam?.pin_code, currentStudent?.id]);

  // Auto-sync: If exam stage is active, ensure waiting candidate transitions immediately
  useEffect(() => {
    if (exam.current_stage?.endsWith('_active') && currentStudent && (currentStudent.status === 'waiting' || currentStudent.reading_status === 'lobby' || currentStudent.writing_status === 'lobby' || currentStudent.listening_status === 'lobby')) {
      const activeStage = exam.current_stage;
      setCurrentStudent(prev => prev ? {
        ...prev,
        status: 'in_progress',
        current_stage: activeStage,
        reading_status: activeStage === 'reading_active' ? 'in_progress' : prev.reading_status,
        writing_status: activeStage === 'writing_active' ? 'in_progress' : prev.writing_status,
        listening_status: activeStage === 'listening_active' ? 'in_progress' : prev.listening_status,
        started_at: exam.started_at || new Date().toISOString()
      } : null);
      
      setStudents(prev => prev.map(s => {
        if (s.id === currentStudent.id) {
          return {
            ...s,
            status: 'in_progress',
            current_stage: activeStage,
            reading_status: activeStage === 'reading_active' ? 'in_progress' : s.reading_status,
            writing_status: activeStage === 'writing_active' ? 'in_progress' : s.writing_status,
            listening_status: activeStage === 'listening_active' ? 'in_progress' : s.listening_status,
            started_at: exam.started_at || new Date().toISOString()
          };
        }
        return s;
      }));
    }
  }, [exam.current_stage, currentStudent?.status, exam.started_at, currentStudent?.id]);

  // Active Test Bot Simulator during Exam Stages
  useEffect(() => {
    const stage = exam.current_stage || 'listening_lobby';
    if (!stage.endsWith('_active') && stage !== 'listening_finished' && stage !== 'reading_finished') return;

    const interval = setInterval(() => {
      setStudents(prev => {
        return prev.map(s => {
          if (!s.is_bot) return s;

          // Auto-transition bots in intermission
          if (stage === 'listening_finished' && s.listening_status === 'in_progress') {
            return { ...s, listening_status: 'completed', reading_status: 'lobby', current_stage: 'reading_lobby' };
          }
          if (stage === 'reading_finished' && s.reading_status === 'in_progress') {
            return { ...s, reading_status: 'completed', writing_status: 'lobby', current_stage: 'writing_lobby' };
          }

          if (s.status !== 'in_progress') return s;

          // 1. Listening stage simulation (FIRST)
          if (stage === 'listening_active') {
            const currentLCount = Object.keys(s.answers?.listening || {}).length;
            const targetQuestions = exam.listening?.questions || [];
            const maxL = targetQuestions.length || 40;
            if (currentLCount >= maxL) return s;

            const nextQ = currentLCount + 1;
            const targetQ = targetQuestions.find(q => q.questionNumber === nextQ);
            let botAns = "harrington";

            if (targetQ) {
              if (targetQ.type === 'MULTIPLE_CHOICE') {
                botAns = ["A", "B", "C", "D"][Math.floor(Math.random() * 4)];
              } else {
                botAns = Array.isArray(targetQ.acceptedAnswers) ? targetQ.acceptedAnswers[0] : "078923411";
              }
            }

            const updatedListening = { ...(s.answers?.listening || {}), [nextQ]: botAns };
            const updatedAnswers = { ...(s.answers || {}), listening: updatedListening };

            return {
              ...s,
              answers: updatedAnswers,
              answered_count: Object.keys(s.answers?.reading || {}).length + Object.keys(updatedListening).length,
              last_seen: new Date().toISOString()
            };
          }

          // 2. Reading stage simulation (SECOND)
          if (stage === 'reading_active') {
            const currentRCount = Object.keys(s.answers?.reading || {}).length;
            const targetQuestions = exam.reading?.questions || exam.questions || [];
            const maxR = targetQuestions.length || 40;
            if (currentRCount >= maxR) return s;

            const nextQ = currentRCount + 1;
            const targetQ = targetQuestions.find(q => q.questionNumber === nextQ);
            let botAns = "TRUE";

            if (targetQ) {
              if (targetQ.type === 'MULTIPLE_CHOICE') {
                botAns = ["A", "B", "C", "D"][Math.floor(Math.random() * 4)];
              } else if (targetQ.type === 'TRUE_FALSE_NOT_GIVEN') {
                botAns = ["TRUE", "FALSE", "NOT GIVEN"][Math.floor(Math.random() * 3)];
              } else if (targetQ.type === 'YES_NO_NOT_GIVEN') {
                botAns = ["YES", "NO", "NOT GIVEN"][Math.floor(Math.random() * 3)];
              } else {
                botAns = Array.isArray(targetQ.acceptedAnswers) ? targetQ.acceptedAnswers[0] : "travertine";
              }
            }

            const updatedReading = { ...(s.answers?.reading || {}), [nextQ]: botAns };
            const updatedAnswers = { ...(s.answers || {}), reading: updatedReading };

            return {
              ...s,
              answers: updatedAnswers,
              answered_count: Object.keys(updatedReading).length + Object.keys(s.answers?.listening || {}).length,
              last_seen: new Date().toISOString()
            };
          }

          // 3. Writing stage simulation (THIRD)
          if (stage === 'writing_active') {
            if (!s.writing_task1_essay) {
              return {
                ...s,
                writing_task1_essay: "The chart illustrates renewable energy shares across four countries...",
                writing_task2_essay: "Artificial intelligence has brought profound transformations in contemporary medicine...",
                last_seen: new Date().toISOString()
              };
            }
            return s;
          }

          return s;
        });
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [exam.current_stage, exam.reading, exam.listening, exam.questions]);

  // Stage Controller Action
  const handleSetStage = (stage) => {
    const startedAt = new Date().toISOString();
    const isFinished = stage === 'exam_completed' || stage === 'writing_finished';

    if (stage === 'listening_active') {
      setActiveAdminTab('monitor');
    } else if (isFinished) {
      setActiveAdminTab('master');
    }

    setExam(prev => {
      const isActive = stage.endsWith('_active');
      const updated = {
        ...prev,
        current_stage: stage,
        status: isFinished ? 'finished' : isActive ? 'active' : 'lobby',
        stage_started_at: isActive ? startedAt : prev.stage_started_at,
        started_at: (stage === 'listening_active' && !prev.started_at) ? startedAt : prev.started_at,
        ended_at: isFinished ? startedAt : prev.ended_at
      };

      if (isFinished && students.length > 0) {
        archiveCurrentSession(updated, students);
      }

      return updated;
    });

    realtimeBus.broadcast('ADMIN_SET_STAGE', {
      stage,
      stage_started_at: startedAt
    });

    updateExamStage(exam.id, stage, { stage_started_at: startedAt });
  };

  const handleStartExam = () => {
    setActiveAdminTab('monitor');
    handleSetStage('listening_active');
  };

  const handleForceEndExam = () => {
    setActiveAdminTab('master');
    handleSetStage('exam_completed');
  };

  const handleOpenLobby = () => {
    setExam(prev => {
      const updated = { ...prev, is_lobby_open: true };
      realtimeBus.broadcast('ADMIN_OPEN_LOBBY', { exam: updated });
      return updated;
    });
    updateExamStage(exam.id, exam.current_stage || 'listening_lobby', { is_lobby_open: true });
  };

  const handleResetSession = () => {
    if (students.length > 0) {
      archiveCurrentSession(exam, students);
    }
    const randomPin = `IELTS-${Math.floor(100 + Math.random() * 900)}`;
    const resetExam = {
      ...exam, // Keep all teacher-configured materials (PDFs, Audio tracks, questions, duration, passages, etc.)
      pin_code: randomPin,
      status: 'lobby',
      is_lobby_open: false,
      current_stage: 'listening_lobby',
      started_at: null,
      stage_started_at: null,
      ended_at: null,
    };
    setExam(resetExam);
    setStudents([]);
    setCurrentStudent(null);
    setActiveAdminTab('lobby');
    localStorage.removeItem('ielts_current_student');
    localStorage.removeItem('ielts_students_list');
    realtimeBus.broadcast('ADMIN_RESET_SESSION', { pin_code: randomPin, exam: resetExam });
    updateExamStage(exam.id, 'listening_lobby', { status: 'lobby', is_lobby_open: false, started_at: null, stage_started_at: null, ended_at: null });
    updateExamPinCode(exam.id, randomPin);
  };

  const handleUpdateExam = (updatedExam) => {
    setExam(updatedExam);
    realtimeBus.broadcast('ADMIN_UPDATE_EXAM', { exam: updatedExam });
  };

  const handleUpdatePinCode = (newPin) => {
    const cleanPin = newPin.trim().toUpperCase();
    const updatedExam = { ...exam, pin_code: cleanPin };
    setExam(updatedExam);
    realtimeBus.broadcast('ADMIN_UPDATE_PIN', { pin_code: cleanPin });
    realtimeBus.broadcast('ADMIN_UPDATE_EXAM', { exam: updatedExam });
    updateExamPinCode(exam.id, cleanPin);
  };

  const handleSaveGrades = async (studentId, grades) => {
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return { ...s, ...grades };
      }
      return s;
    }));
    if (currentStudent && currentStudent.id === studentId) {
      setCurrentStudent(prev => ({ ...prev, ...grades }));
    }
    realtimeBus.broadcast('ADMIN_SAVE_GRADES', { studentId, grades });
    realtimeBus.broadcast('STUDENT_STATUS_UPDATE', {
      studentId,
      updates: grades
    });
    try {
      await upsertStudent({ id: studentId, ...grades });
    } catch (err) {
      console.warn('Could not persist student grades to Supabase:', err);
    }
  };

  const handleAddMockStudents = () => {
    const names = [
      "Azizbek Kobilov",
      "Shakhzoda Karimova",
      "Jamshid Saidov",
      "Malika Nurmatova",
      "Temur Abdullayev"
    ];
    const newBots = names.slice(0, 2).map((name, i) => ({
      id: `bot-${Date.now()}-${i}`,
      exam_id: exam.id,
      name,
      candidate_no: `UZB-${Math.floor(2000 + Math.random() * 7000)}`,
      status: exam.current_stage?.endsWith('_active') ? 'in_progress' : 'waiting',
      current_stage: exam.current_stage || 'listening_lobby',
      listening_status: exam.current_stage === 'listening_active' ? 'in_progress' : 'waiting',
      reading_status: exam.current_stage === 'reading_active' ? 'in_progress' : 'waiting',
      writing_status: exam.current_stage === 'writing_active' ? 'in_progress' : 'waiting',
      answers: { reading: {}, listening: {}, writing: {} },
      answered_count: 0,
      reading_score: null,
      reading_band: null,
      listening_score: null,
      listening_band: null,
      writing_task1_essay: "",
      writing_task2_essay: "",
      writing_task1_band: null,
      writing_task2_band: null,
      writing_band: null,
      overall_band: null,
      score: null,
      band_score: null,
      last_seen: new Date().toISOString(),
      is_bot: true,
      ping_ms: Math.floor(18 + Math.random() * 30),
      warning_count: 0,
    }));

    newBots.forEach(bot => {
      realtimeBus.broadcast('STUDENT_JOIN', { student: bot });
    });
  };

  const handleKickStudent = (studentId) => {
    realtimeBus.broadcast('ADMIN_KICK_STUDENT', { studentId });
  };

  const handleUnbanStudent = (studentId) => {
    realtimeBus.broadcast('ADMIN_UNBAN_STUDENT', { studentId });
  };

  const handleWarnStudent = (studentId) => {
    realtimeBus.broadcast('ADMIN_WARN_STUDENT', { studentId });
  };

  // Student Actions
  const handleStudentJoin = (candidateInfo) => {
    if (candidateInfo.dbExam) {
      const dbExam = candidateInfo.dbExam;
      setExam(prev => ({
        ...prev,
        ...dbExam,
        reading: {
          ...(prev.reading || {}),
          pdf_url: dbExam.reading_pdf_url !== undefined ? dbExam.reading_pdf_url : prev.reading?.pdf_url,
          pdf_name: dbExam.reading_pdf_name || prev.reading?.pdf_name,
          passages: dbExam.reading_passages || prev.reading?.passages,
          questions: dbExam.reading_questions || prev.reading?.questions,
        },
        listening: {
          ...(prev.listening || {}),
          pdf_url: dbExam.listening_pdf_url !== undefined ? dbExam.listening_pdf_url : prev.listening?.pdf_url,
          pdf_name: dbExam.listening_pdf_name || prev.listening?.pdf_name,
          parts: dbExam.listening_parts || prev.listening?.parts,
          parts_data: dbExam.listening_parts_data || prev.listening?.parts_data,
          questions: dbExam.listening_questions || prev.listening?.questions,
        },
      }));
    }

    const isStageActive = exam.current_stage?.endsWith('_active');
    const newStudent = {
      id: `std-${Date.now()}`,
      exam_id: candidateInfo.dbExam?.id || exam.id,
      name: candidateInfo.name,
      candidate_no: candidateInfo.candidate_no,
      status: isStageActive ? 'in_progress' : 'waiting',
      current_stage: exam.current_stage || 'listening_lobby',
      listening_status: exam.current_stage === 'listening_active' ? 'in_progress' : 'waiting',
      reading_status: exam.current_stage === 'reading_active' ? 'in_progress' : 'waiting',
      writing_status: exam.current_stage === 'writing_active' ? 'in_progress' : 'waiting',
      answers: { reading: {}, listening: {}, writing: {} },
      answered_count: 0,
      reading_score: null,
      reading_band: null,
      listening_score: null,
      listening_band: null,
      writing_task1_essay: "",
      writing_task2_essay: "",
      writing_task1_band: null,
      writing_task2_band: null,
      writing_band: null,
      overall_band: null,
      score: null,
      band_score: null,
      last_seen: new Date().toISOString(),
      is_bot: false,
      ping_ms: 22,
      warning_count: 0,
    };

    setCurrentStudent(newStudent);
    realtimeBus.broadcast('STUDENT_JOIN', { student: newStudent });
    upsertStudent(newStudent);
  };

  const handleStudentTransitionStage = (studentId, nextStage, stageUpdates) => {
    setCurrentStudent(prev => prev ? { ...prev, current_stage: nextStage, ...(stageUpdates || {}) } : null);
    realtimeBus.broadcast('STUDENT_SECTION_TRANSITION', {
      studentId,
      nextStage,
      stageUpdates
    });
    updateStudentStage(studentId, { current_stage: nextStage, ...(stageUpdates || {}) });
  };

  const handleStudentUpdateAnswers = (studentId, answers, answeredCount) => {
    setCurrentStudent(prev => prev ? { ...prev, answers, answered_count: answeredCount } : null);
    realtimeBus.broadcast('STUDENT_ANSWER_UPDATE', {
      studentId,
      answers,
      answeredCount
    });
  };

  const handleStudentSubmit = async (
    studentId, 
    answers, 
    readingScore, 
    readingBand, 
    listeningScore, 
    listeningBand,
    task1Essay,
    task2Essay
  ) => {
    let t1Band = currentStudent?.writing_task1_band ?? 6.5;
    let t2Band = currentStudent?.writing_task2_band ?? 7.0;
    let wBand = calculateWritingBand(t1Band, t2Band);
    let oBand = calculateOverallIeltsBand(readingBand, listeningBand, wBand);

    const initialUpdates = {
      status: 'submitted',
      current_stage: 'exam_completed',
      reading_status: 'completed',
      writing_status: 'completed',
      listening_status: 'completed',
      answers,
      reading_score: readingScore,
      reading_band: readingBand,
      listening_score: listeningScore,
      listening_band: listeningBand,
      writing_task1_essay: task1Essay,
      writing_task2_essay: task2Essay,
      writing_task1_band: t1Band,
      writing_task2_band: t2Band,
      writing_band: wBand,
      overall_band: oBand,
      score: readingScore,
      band_score: readingBand,
    };

    // Immediately reflect submitted state so candidate screen locks to Results confirmation
    setCurrentStudent(prev => prev ? { ...prev, ...initialUpdates } : null);
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...initialUpdates } : s));
    realtimeBus.broadcast('STUDENT_STATUS_UPDATE', {
      studentId,
      updates: initialUpdates
    });
    if (soundEnabled) playExamTone('finish');

    // Trigger Gemini AI Writing Evaluation asynchronously
    try {
      const task1Prompt = exam?.task_1_prompt || exam?.writing_tasks?.task1?.prompt || exam?.writing?.task1?.prompt || '';
      const task2Prompt = exam?.task_2_prompt || exam?.writing_tasks?.task2?.prompt || exam?.writing?.task2?.prompt || '';

      const evalResult = await apiGradeWritingSubmission({
        task1Text: task1Essay || '',
        task2Text: task2Essay || '',
        task1Prompt,
        task2Prompt,
        studentId,
      });

      if (evalResult) {
        t1Band = evalResult.task_1?.band ?? evalResult.task1_evaluation?.band ?? t1Band;
        t2Band = evalResult.task_2?.band ?? evalResult.task2_evaluation?.band ?? t2Band;
        wBand = evalResult.overall_writing_band ?? calculateWritingBand(t1Band, t2Band);
        oBand = calculateOverallIeltsBand(readingBand, listeningBand, wBand);

        const aiUpdates = {
          writing_task1_band: t1Band,
          writing_task2_band: t2Band,
          writing_band: wBand,
          overall_band: oBand,
          writing_ai_evaluation: evalResult,
        };

        setCurrentStudent(prev => prev ? { ...prev, ...aiUpdates } : null);
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...aiUpdates } : s));
        realtimeBus.broadcast('STUDENT_STATUS_UPDATE', {
          studentId,
          updates: aiUpdates
        });

        // Persist to Supabase
        try {
          await upsertStudent({
            id: studentId,
            ...initialUpdates,
            ...aiUpdates,
          });
        } catch (sbErr) {
          console.warn("Supabase writing AI evaluation sync failed:", sbErr);
        }
      }
    } catch (aiErr) {
      console.warn("AI grading failed during submission, preserved calculated band:", aiErr);
    }
  };

  const handleStudentDisqualify = (studentId, reason) => {
    const updates = {
      status: 'disqualified',
      reading_score: 0,
      reading_band: 1.0,
      listening_score: 0,
      listening_band: 1.0,
      writing_band: 1.0,
      overall_band: 1.0,
      score: 0,
      band_score: 1.0,
      disqualification_reason: reason
    };

    setCurrentStudent(prev => prev ? { ...prev, ...updates } : null);
    realtimeBus.broadcast('STUDENT_STATUS_UPDATE', {
      studentId,
      updates
    });
    if (soundEnabled) playExamTone('warning');
  };

  const handleStudentWarn = (studentId, reason) => {
    const newWarnCount = (currentStudent?.warning_count || 0) + 1;
    setCurrentStudent(prev => prev ? { ...prev, warning_count: newWarnCount } : null);
    realtimeBus.broadcast('STUDENT_STATUS_UPDATE', {
      studentId,
      updates: {
        status: 'in_progress',
        warning_count: newWarnCount,
      }
    });
    if (soundEnabled) playExamTone('warning');
  };


  return (
    <div className="min-h-screen bg-[#fafbfc] flex flex-col font-sans selection:bg-brand-500 selection:text-white">
      
      {/* Top Navigation */}
      <Navbar
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        exam={exam}
        student={currentStudent}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(prev => !prev)}
        onUpdatePinCode={handleUpdatePinCode}
      />

      {/* Main Role Container */}
      <main className="flex-1">
        {currentRole === 'admin' ? (
          <AdminDashboard
            exam={exam}
            students={students}
            activeTab={activeAdminTab}
            onTabChange={setActiveAdminTab}
            onUpdateExam={handleUpdateExam}
            onSetStage={handleSetStage}
            onStartExam={handleStartExam}
            onForceEndExam={handleForceEndExam}
            onResetSession={handleResetSession}
            onOpenLobby={handleOpenLobby}
            onAddMockStudents={handleAddMockStudents}
            onKickStudent={handleKickStudent}
            onUnbanStudent={handleUnbanStudent}
            onWarnStudent={handleWarnStudent}
            onSaveGrades={handleSaveGrades}
          />
        ) : (
          <div>
            {!currentStudent ? (
              <StudentJoin
                onJoin={handleStudentJoin}
                defaultPin={exam.pin_code}
                isLobbyOpen={exam.is_lobby_open}
                examStatus={exam.status}
              />
            ) : exam.status === 'lobby' && currentStudent.status === 'waiting' && (exam.current_stage === 'listening_lobby' || exam.current_stage === 'reading_lobby') ? (
              <StudentWaitingRoom
                exam={exam}
                student={currentStudent}
                onStartSolo={handleStartExam}
                onLeave={() => {
                  setCurrentStudent(null);
                  localStorage.removeItem('ielts_current_student');
                }}
              />
            ) : (
              <StudentExamRoom
                exam={exam}
                student={currentStudent}
                onUpdateAnswers={handleStudentUpdateAnswers}
                onStudentSubmit={handleStudentSubmit}
                onStudentTransitionStage={handleStudentTransitionStage}
                onDisqualifyStudent={handleStudentDisqualify}
                onWarnStudent={handleStudentWarn}
                onExit={() => {
                  setCurrentStudent(null);
                  localStorage.removeItem('ielts_current_student');
                }}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
