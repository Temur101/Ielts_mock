/**
 * Session History Store for IELTS Sync
 * Automatically archives completed test runs, timestamps, candidates, and band scores.
 * Syncs seamlessly across Supabase cloud archive and localStorage client cache.
 */

import { 
  archiveExamSessionToSupabase, 
  fetchArchivedSessionsFromSupabase, 
  deleteArchivedSessionFromSupabase 
} from './supabase.js';

const STORAGE_KEY = 'ielts_exam_history';

/**
 * Returns cached sessions from local storage synchronously
 */
export function getSessionHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Error reading session history:", err);
    return [];
  }
}

/**
 * Asynchronously fetches sessions from Supabase cloud archive.
 * Updates local cache and falls back to local storage if offline.
 */
export async function fetchSessionHistoryAsync() {
  try {
    const { data, error } = await fetchArchivedSessionsFromSupabase();
    if (!error && Array.isArray(data) && data.length > 0) {
      // Format cloud records for UI consumption
      const formatted = data.map(record => {
        const startedAt = record.started_at || record.ended_at;
        const endedAt = record.ended_at || new Date().toISOString();

        const dateStr = startedAt ? new Date(startedAt).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }) : '';

        const startTimeStr = startedAt ? new Date(startedAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }) : '';

        const endTimeStr = endedAt ? new Date(endedAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }) : '';

        return {
          id: record.id,
          exam_id: record.exam_id,
          title: record.title,
          pin_code: record.pin_code,
          date: dateStr,
          started_at: startedAt,
          ended_at: endedAt,
          time_range: startTimeStr && endTimeStr ? `${startTimeStr} – ${endTimeStr}` : 'Completed',
          duration_mins: record.duration_mins || 60,
          total_candidates: record.total_candidates || (record.students?.length || 0),
          submitted_count: record.submitted_count || 0,
          avg_reading_band: record.avg_reading_band,
          avg_listening_band: record.avg_listening_band,
          avg_writing_band: record.avg_writing_band,
          avg_overall_band: record.avg_overall_band,
          highest_band: record.highest_band,
          students: Array.isArray(record.students) ? record.students : [],
          exam_meta: record.exam_snapshot || {},
          exam_snapshot: record.exam_snapshot || {},
          source: 'cloud',
        };
      });

      // Update local storage cache
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formatted));
      } catch (cacheErr) {
        console.warn("Could not cache sessions to localStorage:", cacheErr);
      }

      return formatted;
    }
  } catch (err) {
    console.warn("Could not load sessions from Supabase, using local cache:", err);
  }

  return getSessionHistory();
}

/**
 * Creates a complete archive record from exam and student roster
 */
export function buildSessionRecord(exam, students = []) {
  if (!exam) return null;
  const now = new Date();
  const safeStudents = Array.isArray(students) ? students : [];

  const validScores = safeStudents.filter(s => 
    typeof s.overall_band === 'number' || 
    typeof s.reading_band === 'number' || 
    s.status === 'submitted' || 
    s.status === 'completed'
  );

  const avg = (nums) => {
    const valid = nums.filter(n => typeof n === 'number' && !isNaN(n));
    if (valid.length === 0) return null;
    return +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
  };

  const avgReadingBand = avg(safeStudents.map(s => s.reading_band));
  const avgListeningBand = avg(safeStudents.map(s => s.listening_band));
  const avgWritingBand = avg(safeStudents.map(s => s.writing_band));
  const avgOverallBand = avg(safeStudents.map(s => s.overall_band));

  const allOveralls = safeStudents.map(s => s.overall_band).filter(n => typeof n === 'number' && !isNaN(n));
  const highestBand = allOveralls.length > 0 ? Math.max(...allOveralls) : null;

  const startedAt = exam.started_at || exam.stage_started_at || now.toISOString();
  const endedAt = exam.ended_at || now.toISOString();

  const dateStr = new Date(startedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const startTimeStr = new Date(startedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const endTimeStr = new Date(endedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const durationMins = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));

  return {
    id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? `session-${crypto.randomUUID()}` : `session-${Date.now()}`,
    exam_id: exam.id || ((typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : 'ielts-exam-session'),
    title: exam.title || 'IELTS Academic Master Assessment',
    pin_code: exam.pin_code || '',
    date: dateStr,
    started_at: startedAt,
    ended_at: endedAt,
    time_range: `${startTimeStr} – ${endTimeStr}`,
    duration_mins: durationMins,
    total_candidates: safeStudents.length,
    submitted_count: validScores.length,
    avg_reading_band: avgReadingBand,
    avg_listening_band: avgListeningBand,
    avg_writing_band: avgWritingBand,
    avg_overall_band: avgOverallBand,
    highest_band: highestBand,
    students: JSON.parse(JSON.stringify(safeStudents)), // deep copy
    exam_meta: {
      title: exam.title,
      pin_code: exam.pin_code,
      reading_pdf_name: exam.reading_pdf_name || exam.reading?.pdf_name,
      listening_pdf_name: exam.listening_pdf_name || exam.listening?.pdf_name,
      writing_pdf_name: exam.writing_pdf_name,
      reading_questions: exam.reading?.questions || exam.reading_questions || exam.questions || [],
      listening_questions: exam.listening?.questions || exam.listening_questions || [],
      writing_tasks: exam.writing_tasks || {},
      task_1_prompt: exam.task_1_prompt || exam.writing_task1 || '',
      task_2_prompt: exam.task_2_prompt || exam.writing_task2 || ''
    },
    exam_snapshot: {
      title: exam.title,
      pin_code: exam.pin_code,
      reading_pdf_name: exam.reading_pdf_name || exam.reading?.pdf_name,
      listening_pdf_name: exam.listening_pdf_name || exam.listening?.pdf_name,
      writing_pdf_name: exam.writing_pdf_name,
      reading_questions: exam.reading?.questions || exam.reading_questions || exam.questions || [],
      listening_questions: exam.listening?.questions || exam.listening_questions || [],
      writing_tasks: exam.writing_tasks || {},
      task_1_prompt: exam.task_1_prompt || exam.writing_task1 || '',
      task_2_prompt: exam.task_2_prompt || exam.writing_task2 || ''
    }
  };
}

/**
 * Archives completed test run into both localStorage and Supabase cloud archive.
 */
export async function archiveCurrentSession(exam, students) {
  if (!exam || !Array.isArray(students) || students.length === 0) {
    return null;
  }

  try {
    const sessionRecord = buildSessionRecord(exam, students);
    if (!sessionRecord) return null;

    // 1. Update localStorage cache
    const history = getSessionHistory();
    const existingIndex = history.findIndex(h => 
      (h.exam_id && h.exam_id === sessionRecord.exam_id) ||
      (h.pin_code && h.pin_code === sessionRecord.pin_code && Math.abs(new Date(h.started_at).getTime() - new Date(sessionRecord.started_at).getTime()) < 1800000)
    );

    let updatedHistory;
    if (existingIndex >= 0) {
      history[existingIndex] = {
        ...history[existingIndex],
        ...sessionRecord,
        id: history[existingIndex].id
      };
      updatedHistory = history;
    } else {
      updatedHistory = [sessionRecord, ...history];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));

    // 2. Persist to Supabase cloud archive asynchronously
    archiveExamSessionToSupabase(sessionRecord).catch(cloudErr => {
      console.warn("Could not archive session to Supabase:", cloudErr);
    });

    return sessionRecord;
  } catch (err) {
    console.error("Error archiving session:", err);
    return null;
  }
}

/**
 * Deletes session from both local cache and Supabase
 */
export async function deleteSessionFromHistory(sessionId) {
  try {
    const history = getSessionHistory();
    const sessionToDelete = history.find(s => s.id === sessionId || s.exam_id === sessionId);
    const filtered = history.filter(s => s.id !== sessionId && s.exam_id !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

    const cloudTargetId = sessionToDelete?.exam_id || sessionToDelete?.id || sessionId;
    deleteArchivedSessionFromSupabase(cloudTargetId).catch(err => {
      console.warn("Could not delete session from Supabase:", err);
    });

    return filtered;
  } catch (err) {
    console.error("Error deleting session:", err);
    return getSessionHistory();
  }
}

/**
 * Clears all local history records
 */
export function clearAllSessionHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  } catch (err) {
    console.error("Error clearing session history:", err);
    return [];
  }
}

/**
 * Migrates existing localStorage sessions into Supabase cloud archive
 */
export async function migrateLocalHistoryToCloud() {
  try {
    const local = getSessionHistory();
    if (!Array.isArray(local) || local.length === 0) return { migrated: 0 };

    let count = 0;
    for (const item of local) {
      if (item && item.students && item.students.length > 0) {
        await archiveExamSessionToSupabase(item);
        count++;
      }
    }
    return { migrated: count };
  } catch (err) {
    console.warn("migrateLocalHistoryToCloud error:", err);
    return { migrated: 0, error: err };
  }
}
