import { getSupabaseClient } from './supabase';
import { getSessionHistory } from './sessionHistory';
import { TEACHER_ACCESS_PASSWORD } from '../components/admin/AdminPasswordModal';

const SUPER_ADMIN_STORAGE_KEY = 'ielts_super_admin_session';

/**
 * Validates whether a user has super-admin privileges
 */
export function isSuperAdmin(user) {
  if (!user) return false;
  const metaRole = user.user_metadata?.role || user.app_metadata?.role;
  return metaRole === 'super_admin' || metaRole === 'admin';
}

/**
 * Sign in super-admin via master password (1234) or Supabase Auth
 */
export async function signInSuperAdmin(email, password) {
  const cleanEmail = email.trim().toLowerCase();

  // Unified master password access (1234)
  if (password === '1234' || (TEACHER_ACCESS_PASSWORD && password === TEACHER_ACCESS_PASSWORD)) {
    const adminUser = {
      id: 'super-admin-master',
      email: cleanEmail || 'admin@ielts-master.org',
      user_metadata: { role: 'super_admin' },
      app_metadata: { role: 'super_admin' },
    };
    localStorage.setItem(SUPER_ADMIN_STORAGE_KEY, JSON.stringify({
      user: adminUser,
      session: { access_token: 'local-admin-token' }
    }));
    return { user: adminUser, error: null };
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return { user: null, error: new Error("Supabase authentication is not configured. Please configure environment credentials.") };
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

  dbExams.forEach((exam) => {
    const teacher = exam.teacher || (exam.teacher_name ? { name: exam.teacher_name, title: 'Exam Proctor' } : { name: 'Assigned Proctor', title: 'IELTS Proctor' });
    map.set(exam.pin_code || exam.id, {
      id: exam.id,
      pin_code: exam.pin_code || '',
      title: exam.title || 'IELTS Academic Master Assessment',
      status: exam.status || 'lobby',
      current_stage: exam.current_stage || 'listening_lobby',
      created_at: exam.created_at || new Date().toISOString(),
      started_at: exam.started_at,
      ended_at: exam.ended_at,
      duration_mins: exam.duration_mins || 60,
      teacher,
      total_candidates: 0,
      active_candidates: 0,
      submitted_candidates: 0,
      source: 'supabase',
      raw: exam
    });
  });

  localHistory.forEach((hist) => {
    const key = hist.pin_code || hist.id;
    const existing = map.get(key);
    const teacher = hist.teacher || (hist.teacher_name ? { name: hist.teacher_name, title: 'Exam Proctor' } : { name: 'Assigned Proctor', title: 'IELTS Proctor' });

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
        teacher,
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
    return [];
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

  const avg = (arr) => {
    if (!arr.length) return null;
    return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
  };

  return {
    totalCandidates: totalCandidates,
    activeSessions,
    finishedSessions,
    totalSessions: sessions.length,
    avgOverall: avg(overallBands),
    avgReading: avg(readingBands),
    avgListening: avg(listeningBands),
    avgWriting: avg(writingBands),
    topBand: overallBands.length ? Math.max(...overallBands) : null
  };
}
