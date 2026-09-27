/**
 * Session History Store for IELTS Sync
 * Automatically archives completed test runs, timestamps, candidates, and band scores.
 */

const STORAGE_KEY = 'ielts_exam_history';

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

export function archiveCurrentSession(exam, students) {
  if (!exam || !Array.isArray(students) || students.length === 0) {
    return null;
  }

  try {
    const history = getSessionHistory();
    const now = new Date();

    // Calculate aggregated cohort statistics
    const validScores = students.filter(s => typeof s.overall_band === 'number' || typeof s.reading_band === 'number' || s.status === 'submitted');
    
    const avg = (nums) => {
      const valid = nums.filter(n => typeof n === 'number' && !isNaN(n));
      if (valid.length === 0) return null;
      return +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
    };

    const avgReadingBand = avg(students.map(s => s.reading_band));
    const avgListeningBand = avg(students.map(s => s.listening_band));
    const avgWritingBand = avg(students.map(s => s.writing_band));
    const avgOverallBand = avg(students.map(s => s.overall_band));
    
    const allOveralls = students.map(s => s.overall_band).filter(n => typeof n === 'number' && !isNaN(n));
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

    const sessionRecord = {
      id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? `session-${crypto.randomUUID()}` : `session-${Date.now()}`,
      exam_id: exam.id || ((typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : 'ielts-exam-session'),
      title: exam.title || 'IELTS Academic Master Assessment',
      pin_code: exam.pin_code || '',
      date: dateStr,
      started_at: startedAt,
      ended_at: endedAt,
      time_range: `${startTimeStr} – ${endTimeStr}`,
      duration_mins: Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000)),
      total_candidates: students.length,
      submitted_count: validScores.length,
      avg_reading_band: avgReadingBand,
      avg_listening_band: avgListeningBand,
      avg_writing_band: avgWritingBand,
      avg_overall_band: avgOverallBand,
      highest_band: highestBand,
      students: JSON.parse(JSON.stringify(students)), // deep snapshot
      exam_meta: {
        title: exam.title,
        pin_code: exam.pin_code,
        reading_pdf_name: exam.reading_pdf_name || exam.reading?.pdf_name,
        listening_pdf_name: exam.listening_pdf_name || exam.listening?.pdf_name,
        writing_pdf_name: exam.writing_pdf_name
      }
    };

    // Check if session with same PIN code and started_at date exists (within last 30 mins)
    const existingIndex = history.findIndex(h => 
      h.pin_code === sessionRecord.pin_code && 
      Math.abs(new Date(h.started_at).getTime() - new Date(sessionRecord.started_at).getTime()) < 1800000
    );

    let updatedHistory;
    if (existingIndex >= 0) {
      // Update existing record with final results
      history[existingIndex] = {
        ...history[existingIndex],
        ...sessionRecord,
        id: history[existingIndex].id // keep original id
      };
      updatedHistory = history;
    } else {
      updatedHistory = [sessionRecord, ...history];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    return sessionRecord;
  } catch (err) {
    console.error("Error archiving session:", err);
    return null;
  }
}

export function deleteSessionFromHistory(sessionId) {
  try {
    const history = getSessionHistory();
    const filtered = history.filter(s => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (err) {
    console.error("Error deleting session:", err);
    return getSessionHistory();
  }
}

export function clearAllSessionHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  } catch (err) {
    console.error("Error clearing session history:", err);
    return [];
  }
}
