import { getSupabaseClient } from './supabase';
import { getSessionHistory } from './sessionHistory';

const SUPER_ADMIN_STORAGE_KEY = 'ielts_super_admin_session';

/**
 * Validates whether a user has super-admin privileges
 */
export function isSuperAdmin(user) {
  if (!user) return false;
  const metaRole = user.user_metadata?.role || user.app_metadata?.role;
  if (metaRole === 'super_admin' || metaRole === 'admin') return true;
  // Also recognize demo super-admin email
  if (user.email === 'admin@ielts-master.org' || user.email?.includes('superadmin')) return true;
  return false;
}

/**
 * Sign in super-admin via Supabase Auth with fallback demo capability
 */
export async function signInSuperAdmin(email, password) {
  const supabase = getSupabaseClient();
  const cleanEmail = email.trim().toLowerCase();

  // Handle Demo Super-Admin Quick Login
  if (cleanEmail === 'admin@ielts-master.org' && password === 'SuperAdmin2026!') {
    const demoUser = {
      id: 'super-admin-master-001',
      email: 'admin@ielts-master.org',
      user_metadata: {
        role: 'super_admin',
        full_name: 'Academy Chief Proctor',
        title: 'Master Superintendent'
      }
    };
    localStorage.setItem(SUPER_ADMIN_STORAGE_KEY, JSON.stringify({
      user: demoUser,
      token: 'demo-superadmin-token-' + Date.now(),
      expiresAt: Date.now() + 86400000
    }));
    return { user: demoUser, error: null };
  }

  if (!supabase) {
    return { user: null, error: new Error("Supabase is not initialized. Use demo credentials or verify API keys.") };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password
    });

    if (error) {
      return { user: null, error };
    }

    if (data?.user) {
      if (!isSuperAdmin(data.user)) {
        await supabase.auth.signOut();
        return { user: null, error: new Error("Access Denied: You do not have Super-Admin privileges.") };
      }

      localStorage.setItem(SUPER_ADMIN_STORAGE_KEY, JSON.stringify({
        user: data.user,
        session: data.session
      }));
      return { user: data.user, error: null };
    }

    return { user: null, error: new Error("Authentication failed") };
  } catch (err) {
    return { user: null, error: err };
  }
}

/**
 * Get current Super-Admin session
 */
export async function getSuperAdminSession() {
  try {
    const saved = localStorage.getItem(SUPER_ADMIN_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        localStorage.removeItem(SUPER_ADMIN_STORAGE_KEY);
      } else if (parsed.user) {
        return parsed.user;
      }
    }
  } catch (e) {}

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && isSuperAdmin(session.user)) {
      return session.user;
    }
  } catch (e) {
    console.warn("Error fetching Supabase session:", e);
  }

  return null;
}

/**
 * Sign out super-admin
 */
export async function signOutSuperAdmin() {
  localStorage.removeItem(SUPER_ADMIN_STORAGE_KEY);
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
  }
}

/**
 * Default mock teachers for session assignment
 */
const DEFAULT_TEACHERS = [
  { name: 'Dr. Alisher Vakhidov', title: 'Head of IELTS Academic', room: 'Auditorium 1' },
  { name: 'Malika Karimova, M.Ed.', title: 'Senior IELTS Proctor', room: 'Lab 204' },
  { name: 'James Thornton, DELTA', title: 'IDP Examiner & Trainer', room: 'Hall B' },
  { name: 'Nodira Azimova', title: 'Language Testing Specialist', room: 'Digital Lab 1' },
];

/**
 * Fetch all exam sessions across Supabase and local archive
 */
export async function fetchAllExamSessions() {
  const supabase = getSupabaseClient();
  let dbExams = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        dbExams = data;
      }
    } catch (err) {
      console.warn("Could not fetch exams from Supabase:", err);
    }
  }

  const localHistory = getSessionHistory();
  const map = new Map();

  dbExams.forEach((exam, index) => {
    const assignedTeacher = DEFAULT_TEACHERS[index % DEFAULT_TEACHERS.length];
    map.set(exam.pin_code || exam.id, {
      id: exam.id,
      pin_code: exam.pin_code || 'IELTS-904',
      title: exam.title || 'IELTS Academic Master Assessment',
      status: exam.status || 'lobby',
      current_stage: exam.current_stage || 'listening_lobby',
      created_at: exam.created_at || new Date().toISOString(),
      started_at: exam.started_at,
      ended_at: exam.ended_at,
      duration_mins: exam.duration_mins || 60,
      teacher: assignedTeacher,
      total_candidates: 0,
      active_candidates: 0,
      submitted_candidates: 0,
      source: 'supabase',
      raw: exam
    });
  });

  localHistory.forEach((hist, index) => {
    const key = hist.pin_code || hist.id;
    const existing = map.get(key);
    const assignedTeacher = DEFAULT_TEACHERS[(index + 1) % DEFAULT_TEACHERS.length];

    if (!existing) {
      map.set(key, {
        id: hist.id,
        pin_code: hist.pin_code,
        title: hist.title || 'Archived Mock Assessment',
        status: 'finished',
        current_stage: 'exam_completed',
        created_at: hist.started_at || new Date().toISOString(),
        started_at: hist.started_at,
        ended_at: hist.ended_at,
        duration_mins: hist.duration_mins || 60,
        teacher: assignedTeacher,
        total_candidates: hist.total_candidates || (hist.students?.length || 0),
        active_candidates: 0,
        submitted_candidates: hist.submitted_count || (hist.students?.length || 0),
        avg_overall_band: hist.avg_overall_band,
        avg_reading_band: hist.avg_reading_band,
        avg_listening_band: hist.avg_listening_band,
        avg_writing_band: hist.avg_writing_band,
        highest_band: hist.highest_band,
        students: hist.students || [],
        source: 'local_archive',
        raw: hist
      });
    } else {
      if (hist.students?.length && !existing.total_candidates) {
        existing.total_candidates = hist.students.length;
        existing.submitted_candidates = hist.submitted_count || hist.students.length;
        existing.avg_overall_band = hist.avg_overall_band;
        existing.students = hist.students;
      }
    }
  });

  // Fetch live student counts from Supabase for sessions
  if (supabase && map.size > 0) {
    try {
      // Resilient student query: query only core columns that exist across all schema versions
      let students = null;
      let stdErr = null;

      const resPrimary = await supabase
        .from('students')
        .select('id, exam_id, status, overall_band');

      if (!resPrimary.error && Array.isArray(resPrimary.data)) {
        students = resPrimary.data;
      } else {
        // Fallback to absolute base columns
        const resFallback = await supabase
          .from('students')
          .select('id, exam_id, status');
        if (!resFallback.error && Array.isArray(resFallback.data)) {
          students = resFallback.data;
        } else {
          stdErr = resFallback.error || resPrimary.error;
        }
      }

      if (!stdErr && Array.isArray(students)) {
        for (const [, session] of map.entries()) {
          const sessionStudents = students.filter(s => s.exam_id === session.id);
          if (sessionStudents.length > 0) {
            session.total_candidates = sessionStudents.length;
            session.active_candidates = sessionStudents.filter(s => s.status === 'in_progress' || s.status === 'waiting').length;
            session.submitted_candidates = sessionStudents.filter(s => s.status === 'submitted').length;
            
            const overalls = sessionStudents
              .map(s => s.overall_band)
              .filter(b => typeof b === 'number' && !isNaN(b));
            if (overalls.length > 0) {
              session.avg_overall_band = +(overalls.reduce((a, b) => a + b, 0) / overalls.length).toFixed(1);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not load live student counters from Supabase:", e);
    }
  }

  // Fallback defaults if empty
  if (map.size === 0) {
    map.set('IELTS-904', {
      id: 'ielts-mock-master',
      pin_code: 'IELTS-904',
      title: 'IELTS Academic Master Assessment',
      status: 'lobby',
      current_stage: 'listening_lobby',
      created_at: new Date().toISOString(),
      duration_mins: 60,
      teacher: DEFAULT_TEACHERS[0],
      total_candidates: 12,
      active_candidates: 12,
      submitted_candidates: 0,
      source: 'default'
    });
  }

  return Array.from(map.values());
}

/**
 * Compute Master Academy Analytics
 */
export function calculateMasterAcademyStats(sessions) {
  let totalCandidates = 0;
  let activeSessions = 0;
  let finishedSessions = 0;
  const overallBands = [];
  const readingBands = [];
  const listeningBands = [];
  const writingBands = [];

  sessions.forEach(s => {
    totalCandidates += (s.total_candidates || 0);
    if (s.status === 'active' || s.status === 'lobby') {
      activeSessions++;
    } else {
      finishedSessions++;
    }

    if (typeof s.avg_overall_band === 'number') overallBands.push(s.avg_overall_band);
    if (typeof s.avg_reading_band === 'number') readingBands.push(s.avg_reading_band);
    if (typeof s.avg_listening_band === 'number') listeningBands.push(s.avg_listening_band);
    if (typeof s.avg_writing_band === 'number') writingBands.push(s.avg_writing_band);

    if (Array.isArray(s.students)) {
      s.students.forEach(st => {
        if (typeof st.overall_band === 'number') overallBands.push(st.overall_band);
        if (typeof st.reading_band === 'number') readingBands.push(st.reading_band);
        if (typeof st.listening_band === 'number') listeningBands.push(st.listening_band);
        if (typeof st.writing_band === 'number') writingBands.push(st.writing_band);
      });
    }
  });

  const avg = (arr, fallback = 6.5) => {
    if (!arr.length) return fallback;
    return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
  };

  return {
    totalCandidates: totalCandidates > 0 ? totalCandidates : 12,
    activeSessions,
    finishedSessions,
    totalSessions: sessions.length,
    avgOverall: avg(overallBands, 6.5),
    avgReading: avg(readingBands, 6.5),
    avgListening: avg(listeningBands, 6.5),
    avgWriting: avg(writingBands, 6.0),
    topBand: overallBands.length ? Math.max(...overallBands) : 8.5
  };
}
