import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { StudentJoin } from './components/student/StudentJoin';
import { StudentWaitingRoom } from './components/student/StudentWaitingRoom';
import { StudentExamRoom } from './components/student/StudentExamRoom';
import { DEFAULT_IELTS_EXAM, INITIAL_MOCK_STUDENTS } from './lib/mockData';
import { realtimeBus } from './lib/realtimeBus';
import { mergeStudentsById } from './lib/studentMerge';
import { 
  updateExamStage, 
  updateStudentStage, 
  updateStudentStatus,
  broadcastAdminAction,
  subscribeToExamRealtime, 
  removeExamRealtimeChannel,
  updateExamPinCode,
  updateExamStatus,
  updateExamAssets,
  upsertStudent,
  generateCryptoPin,
  generateUUID,
  getSupabaseClient,
  fetchStudentsForExam,
  resolveExamIdByPin
} from './lib/supabase';
import { 
  gradeSectionExam, 
  calculateWritingBand, 
  calculateOverallIeltsBand 
} from './lib/ieltsGrading';
import { 
  calculateStageDurationSeconds, 
  getRemainingSeconds, 
  formatExamTimer 
} from './lib/examTimerUtils';
import { archiveCurrentSession } from './lib/sessionHistory';
import { loadPersistentExam, savePersistentExam, isCorruptedExam } from './lib/persistentStorage';
import { apiGradeWritingSubmission } from './lib/ai/gemini-client';
import { SuperAdminHub } from './components/superadmin/SuperAdminHub';
import { SuperAdminLogin } from './components/superadmin/SuperAdminLogin';
import { getSuperAdminSession, signOutSuperAdmin } from './lib/superAdminService';
import { 
  AdminPasswordModal, 
  TEACHER_ACCESS_PASSWORD, 
  isAdminAuthenticated, 
  setAdminAuthenticated 
} from './components/admin/AdminPasswordModal';

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

// Route helper to support /super-admin, /super-admin/login, /admin, and /join?pin=...
function parseCurrentRoute() {
  if (typeof window === 'undefined') return { path: '/', pin: null };
  const pathname = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const pin = searchParams.get('pin')?.trim().toUpperCase() || null;
  const hostname = window.location.hostname.toLowerCase();

  if (hostname.startsWith('admin.') || pathname === '/super-admin') {
    return { path: '/super-admin', pin };
  }
  if (pathname === '/super-admin/login') {
    return { path: '/super-admin/login', pin };
  }
  if (pathname === '/admin') {
    return { path: '/admin', pin };
  }
  if (pathname === '/join' || pin) {
    return { path: '/join', pin };
  }
  return { path: '/', pin: null };
}

export default function App() {
  const [route, setRoute] = useState(parseCurrentRoute);
  const [currentRole, setCurrentRole] = useState(() => {
    const initialRoute = parseCurrentRoute();
    if (initialRoute.path === '/join') return 'student';
    const isAuthed = isAdminAuthenticated();
    if (isAuthed) return 'admin';
    return 'student';
  });
  const [superAdminUser, setSuperAdminUser] = useState(null);
  const [checkingSuperAdminAuth, setCheckingSuperAdminAuth] = useState(true);

  const navigateTo = (newPath, params = {}) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.origin + newPath);
      Object.entries(params).forEach(([k, v]) => {
        if (v) url.searchParams.set(k, v);
      });
      window.history.pushState({}, '', url.toString());
    }
    setRoute({ path: newPath, pin: params.pin || null });
  };

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseCurrentRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    async function initSuperAdmin() {
      try {
        const user = await getSuperAdminSession();
        setSuperAdminUser(user);
      } catch (e) {
        setSuperAdminUser(null);
      } finally {
        setCheckingSuperAdminAuth(false);
      }
    }
    initSuperAdmin();
  }, []);

  // Sync admin mode class on body for complete anti-cheat exemption (free copy/selection)
  useEffect(() => {
    const isAuthed = isAdminAuthenticated();
    if (typeof document !== 'undefined') {
      if (isAuthed) {
        document.body.classList.add('admin-mode');
      } else {
        document.body.classList.remove('admin-mode');
      }
    }
  }, [route.path, currentRole]);

  const [exam, setExam] = useState(() => {
    try {
      localStorage.removeItem('ielts_current_exam'); // Purge legacy heavy object
      const meta = localStorage.getItem('ielts_exam_meta');
      if (meta) {
        const parsedMeta = JSON.parse(meta);
        return {
          ...DEFAULT_IELTS_EXAM,
          id: parsedMeta.id || DEFAULT_IELTS_EXAM.id,
          title: parsedMeta.title || DEFAULT_IELTS_EXAM.title,
          pin_code: parsedMeta.pin_code || DEFAULT_IELTS_EXAM.pin_code,
          duration_mins: parsedMeta.duration_mins || DEFAULT_IELTS_EXAM.duration_mins,
          current_stage: parsedMeta.current_stage || DEFAULT_IELTS_EXAM.current_stage,
          status: parsedMeta.status || DEFAULT_IELTS_EXAM.status,
          stage_started_at: parsedMeta.stage_started_at || null,
          stage_ends_at: parsedMeta.stage_ends_at || null,
          started_at: parsedMeta.started_at || null,
          ended_at: parsedMeta.ended_at || null,
          is_lobby_open: Boolean(parsedMeta.is_lobby_open),
        };
      }
    } catch (e) {}
    return DEFAULT_IELTS_EXAM;
  });

  const [students, setStudents] = useState(() => {
    const saved = localStorage.getItem('ielts_students_list');
    return saved ? JSON.parse(saved) : INITIAL_MOCK_STUDENTS;
  });

  const studentsRef = useRef(students);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  const [currentStudent, setCurrentStudent] = useState(() => {
    const saved = localStorage.getItem('ielts_current_student');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeAdminTab, setActiveAdminTab] = useState(() => {
    return localStorage.getItem('ielts_admin_tab') || 'lobby';
  });

  const [soundEnabled, setSoundEnabled] = useState(true);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] = useState(null);
  const [passwordModalMeta, setPasswordModalMeta] = useState({
    title: 'Teacher & Proctor Authentication',
    description: 'Please enter the access password to proceed.',
  });

  const requestAdminAccess = (actionCallback, meta = {}) => {
    if (isAdminAuthenticated()) {
      if (typeof actionCallback === 'function') actionCallback();
    } else {
      setPasswordModalMeta({
        title: meta.title || 'Teacher & Proctor Authentication',
        description: meta.description || 'Please enter the proctor password (1234) to proceed.',
      });
      setPendingAdminAction(() => actionCallback);
      setPasswordModalOpen(true);
    }
  };

  const handleRoleChange = (newRole) => {
    if (newRole === 'admin') {
      requestAdminAccess(() => {
        setCurrentRole('admin');
        localStorage.setItem('ielts_active_role', 'admin');
      }, {
        title: 'Switch to Teacher View',
        description: 'Teacher console access requires the proctor password.',
      });
    } else {
      setCurrentRole('student');
      localStorage.setItem('ielts_active_role', 'student');
    }
  };

  const handleOpenSuperAdmin = () => {
    requestAdminAccess(() => {
      navigateTo('/super-admin');
    }, {
      title: 'Super-Admin Hub Authentication',
      description: 'Super-Admin command center requires administrative verification.',
    });
  };

  // Student Route Guard: Prevent enrolled external students from accessing '/', '/admin', '/super-admin'
  useEffect(() => {
    if (isAdminAuthenticated()) return;

    if (currentStudent && currentStudent.status !== 'completed' && currentStudent.status !== 'disqualified') {
      if (route.path === '/admin' || route.path === '/super-admin' || (route.path === '/' && currentRole === 'admin')) {
        const pin = route.pin || currentStudent.exam_pin || exam.pin_code;
        navigateTo('/join', pin ? { pin } : {});
      }
    }
  }, [route.path, currentStudent, currentRole, exam.pin_code]);

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
          const { stage, stage_started_at, stage_ends_at, status } = payload;
          setExam(prev => {
            const isFinished = stage === 'exam_completed' || stage === 'writing_finished';
            const isActive = stage.endsWith('_active');
            return {
              ...prev,
              current_stage: stage,
              status: isFinished ? 'finished' : (status || (isActive ? 'in_progress' : 'lobby')),
              stage_started_at: stage_started_at || (isActive ? new Date().toISOString() : prev.stage_started_at),
              stage_ends_at: stage_ends_at !== undefined ? stage_ends_at : (isActive ? prev.stage_ends_at : null),
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
              const wBand = (s.writing_task1_band !== null && s.writing_task1_band !== undefined && s.writing_task2_band !== null && s.writing_task2_band !== undefined)
                ? calculateWritingBand(s.writing_task1_band, s.writing_task2_band)
                : (s.writing_band ?? null);
              const oBand = wBand !== null ? calculateOverallIeltsBand(rRes.bandScore, lRes.bandScore, wBand) : null;

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
              const wBand = (prev.writing_task1_band !== null && prev.writing_task1_band !== undefined && prev.writing_task2_band !== null && prev.writing_task2_band !== undefined)
                ? calculateWritingBand(prev.writing_task1_band, prev.writing_task2_band)
                : (prev.writing_band ?? null);
              const oBand = wBand !== null ? calculateOverallIeltsBand(rRes.bandScore, lRes.bandScore, wBand) : null;

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
          const resetPin = payload.pin_code || generateCryptoPin();
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
          if (payload.student) {
            setStudents(prev => mergeStudentsById(prev, [payload.student]));
          }
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
    // Initial fetch of existing registered candidates for current exam session
    const supabase = getSupabaseClient();
    if (supabase && (exam?.id || exam?.pin_code)) {
      if (exam?.pin_code) {
        resolveExamIdByPin(exam.pin_code).then((resolvedId) => {
          if (resolvedId && resolvedId !== exam.id) {
            setExam(prev => ({ ...prev, id: resolvedId }));
          }
        });
      }

      fetchStudentsForExam({ examId: exam.id, pinCode: exam.pin_code }).then(({ data, examId: targetId }) => {
        if (targetId && targetId !== exam.id) {
          setExam(prev => ({ ...prev, id: targetId }));
        }
        if (Array.isArray(data) && data.length > 0) {
          setStudents(prev => mergeStudentsById(prev, data));
        }
      });

      // Synchronize latest exam state from Supabase on mount / reconnect (Server-Anchored Sync)
      supabase.from('exams').select('*').eq('id', exam.id).maybeSingle().then(({ data: remoteExam, error: examErr }) => {
        if (!examErr && remoteExam) {
          setExam(prev => ({
            ...prev,
            status: remoteExam.status || prev.status,
            current_stage: remoteExam.current_stage || prev.current_stage,
            stage_started_at: remoteExam.stage_started_at || prev.stage_started_at,
            stage_ends_at: remoteExam.stage_ends_at !== undefined ? remoteExam.stage_ends_at : prev.stage_ends_at,
            started_at: remoteExam.started_at || prev.started_at,
            ended_at: remoteExam.ended_at || prev.ended_at,
          }));

          // Align current candidate with active room stage on reconnection
          if (remoteExam.current_stage?.endsWith('_active')) {
            setCurrentStudent(prev => {
              if (!prev || prev.status === 'completed' || prev.status === 'disqualified') return prev;
              const activeStage = remoteExam.current_stage;
              const updates = {
                status: 'in_progress',
                current_stage: activeStage,
              };
              if (activeStage === 'listening_active') {
                updates.listening_status = 'in_progress';
                updates.reading_status = prev.reading_status === 'lobby' ? 'waiting' : prev.reading_status;
              } else if (activeStage === 'reading_active') {
                updates.reading_status = 'in_progress';
                updates.writing_status = prev.writing_status === 'lobby' ? 'waiting' : prev.writing_status;
              } else if (activeStage === 'writing_active') {
                updates.writing_status = 'in_progress';
              }
              return { ...prev, ...updates };
            });
          }
        }
      });
    }

    if (!exam?.pin_code) return;

    const channel = subscribeToExamRealtime(exam.pin_code, {
      onExamChange: (payload) => {
        if (payload.new && (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')) {
          const newExam = payload.new;
          setExam(prev => ({
            ...prev,
            title: newExam.title || prev.title,
            status: newExam.status || prev.status,
            current_stage: newExam.current_stage || prev.current_stage,
            stage_started_at: newExam.stage_started_at || prev.stage_started_at,
            stage_ends_at: newExam.stage_ends_at !== undefined ? newExam.stage_ends_at : prev.stage_ends_at,
            started_at: newExam.started_at || prev.started_at,
            ended_at: newExam.ended_at || prev.ended_at,
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
          if (updatedStudent.exam_id && exam?.id && updatedStudent.exam_id !== exam.id) {
            if (exam?.pin_code) {
              resolveExamIdByPin(exam.pin_code).then((realPinId) => {
                if (realPinId === updatedStudent.exam_id) {
                  setExam(prev => ({ ...prev, id: realPinId }));
                  setStudents(prev => mergeStudentsById(prev, [updatedStudent]));
                }
              });
            }
            return;
          }

          setStudents(prev => mergeStudentsById(prev, [updatedStudent]));
          if (currentStudent?.id === updatedStudent.id) {
            setCurrentStudent(prev => prev ? { ...prev, ...updatedStudent } : null);
          }
        }
      },
      onAdminAction: ({ payload }) => {
        if (!payload) return;
        const { action, studentId, warning_count } = payload;
        if (action === 'KICK') {
          setStudents(prev => prev.map(s => {
            if (s.id === studentId) {
              return { ...s, status: 'kicked', is_disqualified: true, disqualification_reason: 'Kicked by instructor' };
            }
            return s;
          }));
          if (currentStudent?.id === studentId) {
            setCurrentStudent(prev => prev ? { 
              ...prev, 
              status: 'kicked', 
              is_disqualified: true, 
              disqualification_reason: 'Kicked by instructor' 
            } : null);
          }
        } else if (action === 'WARN') {
          const warnVal = warning_count || 1;
          setStudents(prev => prev.map(s => {
            if (s.id === studentId) {
              return { ...s, warning_count: Math.max(s.warning_count || 0, warnVal) };
            }
            return s;
          }));
          if (currentStudent?.id === studentId) {
            setCurrentStudent(prev => prev ? { 
              ...prev, 
              warning_count: Math.max(prev.warning_count || 0, warnVal) 
            } : null);
            if (soundEnabled) playExamTone('warning');
          }
        } else if (action === 'UNBAN') {
          const unbanStatus = exam.status === 'active' || exam.status === 'in_progress' ? 'in_progress' : 'waiting';
          setStudents(prev => prev.map(s => {
            if (s.id === studentId) {
              return { ...s, status: unbanStatus, is_disqualified: false, disqualification_reason: null, warning_count: 0 };
            }
            return s;
          }));
          if (currentStudent?.id === studentId) {
            setCurrentStudent(prev => prev ? { 
              ...prev, 
              status: unbanStatus, 
              is_disqualified: false, 
              disqualification_reason: null, 
              warning_count: 0 
            } : null);
          }
        }
      }
    });

    return () => {
      if (channel) removeExamRealtimeChannel(channel);
    };
  }, [exam?.pin_code, exam?.id, currentStudent?.id]);

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



  // Stage Controller Action with Server-Anchored Sync and Adaptive Listening Duration
  const handleSetStage = (stage) => {
    const stageStartedAt = new Date().toISOString();
    const isFinished = stage === 'exam_completed' || stage === 'writing_finished';
    const isActive = stage.endsWith('_active');

    let stageEndsAt = null;
    let durationSeconds = 0;
    if (isActive) {
      durationSeconds = calculateStageDurationSeconds(stage, exam);
      stageEndsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    } else if (stage === 'reading_lobby' || stage === 'writing_lobby' || stage === 'listening_finished' || stage === 'reading_finished') {
      durationSeconds = 60;
      stageEndsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    }

    if (stage === 'listening_active') {
      setActiveAdminTab('monitor');
    } else if (isFinished) {
      setActiveAdminTab('master');
      // Live server sync: fetch all registered candidates from Supabase before final archiving
      fetchStudentsForExam({ examId: exam.id, pinCode: exam.pin_code }).then(({ data, examId: targetId }) => {
        if (targetId && targetId !== exam.id) {
          setExam(prev => ({ ...prev, id: targetId }));
        }
        const merged = mergeStudentsById(studentsRef.current, data);
        setStudents(merged);
        if (merged.length > 0) {
          archiveCurrentSession({
            ...exam,
            id: targetId || exam.id,
            current_stage: stage,
            status: 'finished',
            ended_at: stageStartedAt
          }, merged);
        }
      });
    }

    setExam(prev => {
      const updated = {
        ...prev,
        current_stage: stage,
        status: isFinished ? 'finished' : (isActive ? 'in_progress' : 'lobby'),
        stage_started_at: isActive ? stageStartedAt : prev.stage_started_at,
        stage_ends_at: stageEndsAt !== undefined ? stageEndsAt : (isActive ? prev.stage_ends_at : null),
        started_at: (stage === 'listening_active' && !prev.started_at) ? stageStartedAt : prev.started_at,
        ended_at: isFinished ? stageStartedAt : prev.ended_at
      };

      if (isFinished && studentsRef.current.length > 0) {
        archiveCurrentSession(updated, studentsRef.current);
      }

      return updated;
    });

    realtimeBus.broadcast('ADMIN_SET_STAGE', {
      stage,
      stage_started_at: stageStartedAt,
      stage_ends_at: stageEndsAt,
      duration_seconds: durationSeconds,
      status: isFinished ? 'finished' : (isActive ? 'in_progress' : 'lobby')
    });

    updateExamStage(exam.id, stage, { 
      stage_started_at: stageStartedAt,
      stage_ends_at: stageEndsAt,
      pin_code: exam.pin_code,
      status: isFinished ? 'finished' : (isActive ? 'in_progress' : 'lobby')
    }).then(({ data: updatedExamRow }) => {
      if (updatedExamRow?.id && updatedExamRow.id !== exam.id) {
        setExam(prev => ({ ...prev, id: updatedExamRow.id }));
      }
    });

    // Unified Server-Anchored Sync: Save deadline to Supabase
    const supabase = getSupabaseClient();
    if (supabase && exam?.id) {
      supabase.from('exams').update({
        current_stage: stage,
        stage_started_at: stageStartedAt,
        stage_ends_at: stageEndsAt,
        status: isFinished ? 'finished' : (isActive ? 'in_progress' : 'lobby')
      }).eq('id', exam.id).then(({ error }) => {
        if (error) console.warn('Supabase stage update warning:', error);
      });
    }
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
      const updated = { ...prev, is_lobby_open: true, status: 'lobby' };
      realtimeBus.broadcast('ADMIN_OPEN_LOBBY', { exam: updated });
      return updated;
    });
    updateExamStage(exam.id, exam.current_stage || 'listening_lobby', { 
      status: 'lobby', 
      is_lobby_open: true,
      pin_code: exam.pin_code 
    });
  };

  const handleResetSession = async () => {
    const prevExamId = exam?.id;
    const supabase = getSupabaseClient();

    // 1. Mark previous active exam in Supabase as 'finished'
    if (prevExamId) {
      try {
        await updateExamStatus(prevExamId, 'finished');
      } catch (err) {
        console.warn('Could not mark previous exam as finished in Supabase:', err);
      }
    }

    try {
      const { data } = await fetchStudentsForExam({ examId: prevExamId, pinCode: exam?.pin_code });
      const finalStudents = mergeStudentsById(studentsRef.current, data);
      if (finalStudents.length > 0) {
        await archiveCurrentSession(exam, finalStudents);
      }
    } catch (archErr) {
      if (studentsRef.current.length > 0) {
        archiveCurrentSession(exam, studentsRef.current);
      }
    }

    // 2. Generate new RFC-4122 UUID v4 and new cryptographically secure PIN
    const newExamId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : generateUUID();
    const randomPin = generateCryptoPin();

    // 3. Create fresh exam session preserving all teacher-loaded materials
    const resetExam = {
      ...exam, // Keep all teacher-configured materials (PDFs, Audio tracks, questions, duration, passages, etc.)
      id: newExamId,
      pin_code: randomPin,
      status: 'lobby',
      is_lobby_open: true,
      current_stage: 'listening_lobby',
      started_at: null,
      stage_started_at: null,
      stage_ends_at: null,
      ended_at: null,
    };

    // 4. Reset local student state and storage
    setExam(resetExam);
    setStudents([]);
    setCurrentStudent(null);
    setActiveAdminTab('lobby');
    localStorage.removeItem('ielts_current_student');
    localStorage.removeItem('ielts_students_list');

    // 5. Broadcast reset session
    realtimeBus.broadcast('ADMIN_RESET_SESSION', { pin_code: randomPin, exam: resetExam });

    // 6. Persist new exam to IndexedDB and Supabase
    savePersistentExam(resetExam).catch(err => console.warn('Could not save reset exam to IndexedDB:', err));

    if (supabase) {
      try {
        await updateExamAssets(newExamId, {
          title: resetExam.title || 'IELTS Academic Master Assessment 2026',
          pin_code: randomPin,
          status: 'lobby',
          is_lobby_open: true,
          current_stage: 'listening_lobby',
          duration_mins: resetExam.duration_mins || 180,
          anti_cheat_strictness: resetExam.anti_cheat_strictness || 'standard',
          reading_pdf_url: resetExam.reading_pdf_url || resetExam.reading?.pdf_url || null,
          reading_pdf_name: resetExam.reading_pdf_name || resetExam.reading?.pdf_name || null,
          reading_passages: resetExam.reading_passages || resetExam.reading?.passages || resetExam.passages || [],
          reading_questions: resetExam.reading_questions || resetExam.reading?.questions || resetExam.questions || [],
          writing_pdf_url: resetExam.writing_pdf_url || resetExam.writing?.pdf_url || null,
          writing_pdf_name: resetExam.writing_pdf_name || resetExam.writing?.pdf_name || null,
          writing_task1: resetExam.writing_task1 || resetExam.writing?.task1 || null,
          writing_task2: resetExam.writing_task2 || resetExam.writing?.task2 || null,
          listening_audio_parts: resetExam.listening_audio_parts || resetExam.listening?.audio_parts || {},
          listening_pdf_url: resetExam.listening_pdf_url || resetExam.listening?.pdf_url || null,
          listening_pdf_name: resetExam.listening_pdf_name || resetExam.listening?.pdf_name || null,
          listening_parts: resetExam.listening_parts || resetExam.listening?.parts || [],
          listening_parts_data: resetExam.listening_parts_data || resetExam.listening?.parts_data || null,
          listening_questions: resetExam.listening_questions || resetExam.listening?.questions || [],
          started_at: null,
          stage_started_at: null,
          ended_at: null,
        });
      } catch (err) {
        console.warn('Could not persist new exam session to Supabase:', err);
      }
    }
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



  const handleKickStudent = (studentId) => {
    // 1. Immediately update local state in teacher console
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return { 
          ...s, 
          status: 'kicked', 
          is_disqualified: true, 
          disqualification_reason: 'Kicked by instructor' 
        };
      }
      return s;
    }));
    if (currentStudent?.id === studentId) {
      setCurrentStudent(prev => prev ? { 
        ...prev, 
        status: 'kicked', 
        is_disqualified: true, 
        disqualification_reason: 'Kicked by instructor' 
      } : null);
    }

    // 2. Persist to Supabase database so status is preserved across stage transitions & refreshes
    updateStudentStatus(studentId, 'kicked', { 
      is_disqualified: true, 
      disqualification_reason: 'Kicked by instructor' 
    });

    // 3. Network Broadcast to candidate device across the internet
    if (exam?.pin_code) {
      broadcastAdminAction(exam.pin_code, 'KICK', { studentId });
    }

    // 4. Same-machine cross-tab broadcast
    realtimeBus.broadcast('ADMIN_KICK_STUDENT', { studentId });
  };

  const handleUnbanStudent = (studentId) => {
    const unbanStatus = exam.status === 'active' || exam.status === 'in_progress' ? 'in_progress' : 'waiting';
    // 1. Immediately update local state
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return { 
          ...s, 
          status: unbanStatus, 
          is_disqualified: false, 
          disqualification_reason: null, 
          warning_count: 0 
        };
      }
      return s;
    }));
    if (currentStudent?.id === studentId) {
      setCurrentStudent(prev => prev ? { 
        ...prev, 
        status: unbanStatus, 
        is_disqualified: false, 
        disqualification_reason: null, 
        warning_count: 0 
      } : null);
    }

    // 2. Persist to Supabase database
    updateStudentStatus(studentId, unbanStatus, { 
      is_disqualified: false, 
      disqualification_reason: null, 
      warning_count: 0 
    });

    // 3. Network Broadcast
    if (exam?.pin_code) {
      broadcastAdminAction(exam.pin_code, 'UNBAN', { studentId });
    }

    // 4. Local cross-tab broadcast
    realtimeBus.broadcast('ADMIN_UNBAN_STUDENT', { studentId });
  };

  const handleWarnStudent = (studentId) => {
    const target = studentsRef.current.find(s => s.id === studentId);
    const newWarnCount = ((target?.warning_count || 0) + 1);

    // 1. Immediately update local state
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return { ...s, warning_count: newWarnCount };
      }
      return s;
    }));
    if (currentStudent?.id === studentId) {
      setCurrentStudent(prev => prev ? { ...prev, warning_count: newWarnCount } : null);
    }

    // 2. Persist to Supabase database
    updateStudentStatus(studentId, target?.status || 'in_progress', { 
      warning_count: newWarnCount 
    });

    // 3. Network Broadcast to candidate device across the internet
    if (exam?.pin_code) {
      broadcastAdminAction(exam.pin_code, 'WARN', { studentId, warning_count: newWarnCount });
    }

    // 4. Local cross-tab broadcast
    realtimeBus.broadcast('ADMIN_WARN_STUDENT', { studentId, warning_count: newWarnCount });
  };

  // Student Actions
  const handleStudentJoin = (candidateInfo) => {
    if (candidateInfo.dbExam) {
      const dbExam = candidateInfo.dbExam;
      setExam(prev => ({
        ...prev,
        ...dbExam,
        stage_started_at: dbExam.stage_started_at || prev.stage_started_at,
        stage_ends_at: dbExam.stage_ends_at !== undefined ? dbExam.stage_ends_at : prev.stage_ends_at,
        status: dbExam.status || prev.status,
        current_stage: dbExam.current_stage || prev.current_stage,
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

    const activeStage = candidateInfo.dbExam?.current_stage || exam.current_stage || 'listening_lobby';
    const isStageActive = Boolean(activeStage?.endsWith('_active'));
    const newStudent = {
      id: candidateInfo.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : generateUUID()),
      exam_id: candidateInfo.dbExam?.id || exam.id,
      name: candidateInfo.name,
      student_name: candidateInfo.name,
      phone: candidateInfo.phone || candidateInfo.phone_number || '',
      phone_number: candidateInfo.phone || candidateInfo.phone_number || '',
      candidate_no: candidateInfo.candidate_no,
      status: isStageActive ? 'in_progress' : 'waiting',
      current_stage: activeStage,
      listening_status: activeStage === 'listening_active' ? 'in_progress' : (activeStage.startsWith('reading') || activeStage.startsWith('writing') ? 'completed' : 'waiting'),
      reading_status: activeStage === 'reading_active' ? 'in_progress' : (activeStage.startsWith('writing') ? 'completed' : 'waiting'),
      writing_status: activeStage === 'writing_active' ? 'in_progress' : 'waiting',
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
      ping_ms: null,
      warning_count: 0,
    };

    setCurrentStudent(newStudent);
    setStudents(prev => mergeStudentsById(prev, [newStudent]));
    realtimeBus.broadcast('STUDENT_JOIN', { student: newStudent });

    // Robust persistence with retry
    const persistWithRetry = async (studentData, maxAttempts = 3) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await upsertStudent(studentData);
          if (!res?.error) return true;
          console.warn(`[handleStudentJoin] Upsert attempt ${attempt} warning:`, res.error);
          await new Promise(r => setTimeout(r, 600 * attempt));
        } catch (err) {
          console.warn(`[handleStudentJoin] Upsert attempt ${attempt} exception:`, err);
        }
      }
      return false;
    };
    persistWithRetry(newStudent);
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
    let t1Band = currentStudent?.writing_task1_band ?? null;
    let t2Band = currentStudent?.writing_task2_band ?? null;
    let wBand = (t1Band !== null && t2Band !== null) ? calculateWritingBand(t1Band, t2Band) : null;
    let oBand = calculateOverallIeltsBand(readingBand, listeningBand, wBand);

    // Phase A: Complete initial submission record
    const initialUpdates = {
      status: 'completed',
      current_stage: 'exam_completed',
      reading_status: 'completed',
      listening_status: 'completed',
      writing_status: 'evaluating', // Status is evaluating while AI is running
      answers,
      reading_score: readingScore,
      reading_band: readingBand,
      listening_score: listeningScore,
      listening_band: listeningBand,
      writing_task1_essay: task1Essay || '',
      writing_task2_essay: task2Essay || '',
      writing_task1_band: t1Band,
      writing_task2_band: t2Band,
      writing_band: wBand,
      overall_band: oBand,
      score: readingScore,
      band_score: readingBand,
    };

    // 1. Immediately reflect submitted state so candidate screen locks to Results confirmation
    setCurrentStudent(prev => prev ? { ...prev, ...initialUpdates } : null);
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...initialUpdates } : s));
    realtimeBus.broadcast('STUDENT_STATUS_UPDATE', {
      studentId,
      updates: initialUpdates
    });
    if (soundEnabled) playExamTone('finish');

    // 2. CRITICAL PERSISTENCE (Step 1): Commit student submission to Supabase IMMEDIATELY before AI call!
    const candidatePhone = currentStudent?.phone || currentStudent?.phone_number || '';
    try {
      const studentPayload = {
        id: studentId,
        exam_id: currentStudent?.exam_id || exam?.id,
        name: currentStudent?.name,
        phone: candidatePhone,
        phone_number: candidatePhone,
        candidate_no: currentStudent?.candidate_no,
        ...initialUpdates,
      };
      await upsertStudent(studentPayload);
      console.info(`[handleStudentSubmit] Phase A persisted for student ${studentId} prior to AI grading.`);
    } catch (saveErr) {
      console.error("[handleStudentSubmit] Phase A submission persistence failed:", saveErr);
    }

    // 3. Phase B: Trigger Gemini AI Writing Evaluation asynchronously without blocking
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
          writing_status: 'completed',
          writing_task1_band: t1Band,
          writing_task2_band: t2Band,
          writing_band: wBand,
          overall_band: oBand,
          writing_ai_evaluation: evalResult,
        };

        // Update local React state and broadcast
        setCurrentStudent(prev => prev ? { ...prev, ...aiUpdates } : null);
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...aiUpdates } : s));
        realtimeBus.broadcast('STUDENT_STATUS_UPDATE', {
          studentId,
          updates: aiUpdates
        });

        // Step 2 targeted update: Save AI results
        try {
          await upsertStudent({
            id: studentId,
            exam_id: currentStudent?.exam_id || exam?.id,
            name: currentStudent?.name,
            phone: candidatePhone,
            phone_number: candidatePhone,
            candidate_no: currentStudent?.candidate_no,
            ...initialUpdates,
            ...aiUpdates,
          });
          console.info(`[handleStudentSubmit] Phase B AI updates persisted for student ${studentId}.`);
        } catch (sbErr) {
          console.warn("[handleStudentSubmit] Phase B Supabase writing AI evaluation sync failed:", sbErr);
        }
      } else {
        // AI returned null/falsy -> mark writing_status as 'completed'
        const fallbackUpdates = { writing_status: 'completed' };
        setCurrentStudent(prev => prev ? { ...prev, ...fallbackUpdates } : null);
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...fallbackUpdates } : s));
        try {
          await upsertStudent({
            id: studentId,
            exam_id: currentStudent?.exam_id || exam?.id,
            name: currentStudent?.name,
            phone: candidatePhone,
            phone_number: candidatePhone,
            candidate_no: currentStudent?.candidate_no,
            ...initialUpdates,
            ...fallbackUpdates,
          });
        } catch (e) {}
      }
    } catch (aiErr) {
      console.warn("[handleStudentSubmit] AI grading failed/timed out, exam safely preserved for teacher manual grading:", aiErr);
      const fallbackUpdates = { writing_status: 'completed' };
      setCurrentStudent(prev => prev ? { ...prev, ...fallbackUpdates } : null);
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...fallbackUpdates } : s));
      try {
        await upsertStudent({
          id: studentId,
          exam_id: currentStudent?.exam_id || exam?.id,
          name: currentStudent?.name,
          phone: candidatePhone,
          phone_number: candidatePhone,
          candidate_no: currentStudent?.candidate_no,
          ...initialUpdates,
          ...fallbackUpdates,
        });
      } catch (sbFallbackErr) {
        console.warn("[handleStudentSubmit] Fallback status update failed:", sbFallbackErr);
      }
    }
  };

  const handleStudentDisqualify = (studentId, reason) => {
    // If admin is testing/proctoring, never disqualify!
    if (isAdminAuthenticated()) return;

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
    // If admin is testing/proctoring, never trigger warning!
    if (isAdminAuthenticated()) return;

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

  // 0. ROUTE: /admin (Protected by Admin Password)
  if (route.path === '/admin') {
    if (!isAdminAuthenticated()) {
      return (
        <AdminPasswordModal
          isOpen={true}
          onSuccess={() => {
            setAdminAuthenticated(true);
            setCurrentRole('admin');
            localStorage.setItem('ielts_active_role', 'admin');
            navigateTo('/');
          }}
          onCancel={() => navigateTo('/')}
          title="Teacher Proctor Access"
          description="Please enter the proctor password to open the Teacher Console."
        />
      );
    } else {
      if (currentRole !== 'admin') {
        setCurrentRole('admin');
        localStorage.setItem('ielts_active_role', 'admin');
      }
      navigateTo('/');
      return null;
    }
  }

  // 1. ROUTE: /super-admin (Protected by Password & Supabase Auth)
  if (route.path === '/super-admin') {
    if (!isAdminAuthenticated()) {
      return (
        <AdminPasswordModal
          isOpen={true}
          onSuccess={() => {
            setAdminAuthenticated(true);
            setRoute(parseCurrentRoute());
          }}
          onCancel={() => navigateTo('/')}
          title="Super-Admin Access"
          description="Enter administrative access password to proceed to Super-Admin Hub."
        />
      );
    }

    const effectiveAdminUser = superAdminUser || {
      id: 'super-admin-master',
      email: 'admin@ielts-master.org',
      user_metadata: { role: 'super_admin' },
      app_metadata: { role: 'super_admin' },
    };

    return (
      <SuperAdminHub
        user={effectiveAdminUser}
        onLogout={async () => {
          await signOutSuperAdmin();
          setSuperAdminUser(null);
          setCurrentRole('admin');
          localStorage.setItem('ielts_active_role', 'admin');
          navigateTo('/');
        }}
        onReturnToTeacher={() => {
          setCurrentRole('admin');
          localStorage.setItem('ielts_active_role', 'admin');
          navigateTo('/');
        }}
        onLaunchTeacherConsole={(session) => {
          if (session.raw) {
            setExam(session.raw);
          } else {
            setExam(prev => ({
              ...prev,
              id: session.id,
              pin_code: session.pin_code,
              title: session.title,
              status: session.status,
              current_stage: session.current_stage,
            }));
          }
          setCurrentRole('admin');
          localStorage.setItem('ielts_active_role', 'admin');
          setActiveAdminTab('live');
          navigateTo('/');
        }}
        onNavigateStudentView={() => {
          setCurrentRole('student');
          localStorage.setItem('ielts_active_role', 'student');
          navigateTo('/');
        }}
      />
    );
  }

  // 2. ROUTE: /super-admin/login
  if (route.path === '/super-admin/login') {
    if (isAdminAuthenticated()) {
      navigateTo('/super-admin');
      return null;
    }
    return (
      <SuperAdminLogin
        onLoginSuccess={(user) => {
          setAdminAuthenticated(true);
          setSuperAdminUser(user);
          navigateTo('/super-admin');
        }}
        onNavigateHome={() => navigateTo('/')}
      />
    );
  }

  // 3. STUDENT SHORT-CIRCUIT ROUTE (/join or ?pin=...)
  const isAuthedAdmin = isAdminAuthenticated();
  const isStudentOnlyRoute = !isAuthedAdmin && (route.path === '/join' || Boolean(route.pin) || Boolean(currentStudent));
  const activeRoleToRender = isStudentOnlyRoute ? 'student' : (route.path === '/admin' ? 'admin' : currentRole);

  const isStudentInExam = 
    activeRoleToRender === 'student' && 
    Boolean(currentStudent) && 
    (exam.status === 'active' || exam.status === 'in_progress' || Boolean(exam.current_stage?.endsWith('_active')));

  return (
    <div className={`${isStudentInExam ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-[#f8fafc] flex flex-col font-sans selection:bg-slate-200 selection:text-slate-900`}>
      
      {/* Top Navigation */}
      <Navbar
        currentRole={activeRoleToRender}
        onRoleChange={handleRoleChange}
        exam={exam}
        student={currentStudent}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(prev => !prev)}
        onUpdatePinCode={handleUpdatePinCode}
        isStudentOnly={isStudentOnlyRoute}
        isAdminAuthed={isAuthedAdmin}
        onOpenSuperAdmin={handleOpenSuperAdmin}
      />

      {/* Main Container */}
      <main className={`flex-1 ${isStudentInExam ? 'min-h-0 overflow-hidden flex flex-col' : ''}`}>
        {activeRoleToRender === 'admin' ? (
          <AdminDashboard
            exam={exam}
            students={students.filter(s => !s.exam_id || !exam?.id || s.exam_id === exam.id || s.exam_id === exam.pin_code)}
            activeTab={activeAdminTab}
            onTabChange={setActiveAdminTab}
            onUpdateExam={handleUpdateExam}
            onSetStage={handleSetStage}
            onStartExam={handleStartExam}
            onForceEndExam={handleForceEndExam}
            onResetSession={handleResetSession}
            onOpenLobby={handleOpenLobby}
            onKickStudent={handleKickStudent}
            onUnbanStudent={handleUnbanStudent}
            onWarnStudent={handleWarnStudent}
            onSaveGrades={handleSaveGrades}
          />
        ) : (
          <div className={isStudentInExam ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : ''}>
            {!currentStudent ? (
              <StudentJoin
                onJoin={handleStudentJoin}
                defaultPin={route.pin || exam.pin_code}
                shortCircuitPin={route.pin}
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

      {/* Admin Password Modal */}
      <AdminPasswordModal
        isOpen={passwordModalOpen}
        onSuccess={() => {
          setPasswordModalOpen(false);
          if (pendingAdminAction) {
            pendingAdminAction();
            setPendingAdminAction(null);
          }
        }}
        onCancel={() => {
          setPasswordModalOpen(false);
          setPendingAdminAction(null);
        }}
        title={passwordModalMeta.title}
        description={passwordModalMeta.description}
      />
    </div>
  );
}
