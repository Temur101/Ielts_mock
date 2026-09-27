/**
 * IELTS Stage Duration Calculation and Server-Anchored Countdown Synchronizer
 * 
 * Strict Cambridge IELTS Rules:
 * 1. READING: strictly 60 minutes (3600 seconds)
 * 2. WRITING: strictly 60 minutes (3600 seconds)
 * 3. LISTENING:
 *    - Adaptive duration: audioDuration + 120s (2 minutes review)
 *    - Default (external speaker/offline): 35 minutes (2100 seconds)
 * 4. Intermissions (break lobbies): 60 seconds
 */

/**
 * Parses time strings like "MM:SS" or "HH:MM:SS" into total seconds.
 */
export function parseDurationToSeconds(duration) {
  if (!duration) return 0;
  if (typeof duration === 'number') return Math.max(0, duration);
  if (typeof duration === 'string') {
    const parts = duration.trim().split(':');
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      return Math.max(0, m * 60 + s);
    }
    if (parts.length === 3) {
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      const s = parseInt(parts[2], 10) || 0;
      return Math.max(0, h * 3600 + m * 60 + s);
    }
    const parsed = parseFloat(duration);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }
  return 0;
}

/**
 * Calculates stage duration in seconds according to official exam rules
 */
export function calculateStageDurationSeconds(stage, exam = {}) {
  if (stage === 'reading_active') {
    return 60 * 60; // 3600 seconds (60 mins)
  }

  if (stage === 'writing_active') {
    return 60 * 60; // 3600 seconds (60 mins)
  }

  if (stage === 'listening_active') {
    // 1. Check direct audio duration fields if explicitly present
    let detectedAudioDuration = 0;
    if (typeof exam.audioDuration === 'number' && exam.audioDuration > 0) {
      detectedAudioDuration = exam.audioDuration;
    } else if (typeof exam.audio_duration === 'number' && exam.audio_duration > 0) {
      detectedAudioDuration = exam.audio_duration;
    } else if (typeof exam.listening_audio_duration_seconds === 'number' && exam.listening_audio_duration_seconds > 0) {
      detectedAudioDuration = exam.listening_audio_duration_seconds;
    }

    // 2. Check multi-part audio configurations
    const audioParts = exam.listening_audio_parts || exam.listening?.audio_parts || {};
    const audioDurations = exam.listening_audio_durations || exam.listening?.audio_durations || {};
    const rawParts = exam.listening_parts || exam.listening?.parts || [];

    let hasLoadedAudio = Boolean(
      exam.audio_url || 
      exam.listening_audio_url || 
      exam.listening?.audio_url ||
      (Array.isArray(exam.sections) && exam.sections.find(s => s.type === 'listening')?.audio_url)
    );

    let partsTotalDuration = 0;
    let loadedPartsCount = 0;

    Object.keys(audioParts).forEach(key => {
      const url = audioParts[key];
      if (url && typeof url === 'string' && url.trim().length > 0) {
        hasLoadedAudio = true;
        loadedPartsCount++;
        const sec = parseDurationToSeconds(audioDurations[key]);
        partsTotalDuration += sec;
      }
    });

    if (Array.isArray(rawParts) && rawParts.length > 0) {
      rawParts.forEach((p, idx) => {
        if (p?.audio_url && typeof p.audio_url === 'string' && p.audio_url.trim().length > 0) {
          hasLoadedAudio = true;
          const slotKey = `part${idx + 1}`;
          if (!audioParts[slotKey]) {
            loadedPartsCount++;
            const sec = parseDurationToSeconds(p.duration || audioDurations[slotKey]);
            partsTotalDuration += sec;
          }
        }
      });
    }

    const sectionListening = Array.isArray(exam.sections) ? exam.sections.find(s => s.type === 'listening') : null;
    if (sectionListening?.audio_url) {
      hasLoadedAudio = true;
      const sec = parseDurationToSeconds(sectionListening.audioDuration || sectionListening.duration);
      if (sec > 0) detectedAudioDuration = Math.max(detectedAudioDuration, sec);
    }

    const finalAudioSec = detectedAudioDuration > 0 ? detectedAudioDuration : partsTotalDuration;

    if (hasLoadedAudio && finalAudioSec > 0) {
      return Math.ceil(finalAudioSec) + 120; // Audio duration + 2 minutes
    }

    // Default 35 minutes (2100 seconds) if no audio loaded
    return 35 * 60;
  }

  // Intermission break lobbies (e.g. 60 seconds)
  if (stage === 'reading_lobby' || stage === 'writing_lobby' || stage === 'listening_finished' || stage === 'reading_finished') {
    return 60;
  }

  return 60;
}

/**
 * Calculates remaining seconds strictly from stage_ends_at.
 * Fallback to (stage_started_at + duration) if stage_ends_at is temporarily not received.
 */
export function getRemainingSeconds(exam, currentStage = '') {
  if (!exam) return 0;
  if (exam.stage_ends_at) {
    const diff = Math.floor((new Date(exam.stage_ends_at).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  }

  const effectiveStage = currentStage || exam.current_stage || '';
  if (effectiveStage.endsWith('_active') && exam.stage_started_at) {
    const durationSec = calculateStageDurationSeconds(effectiveStage, exam);
    const startedTime = new Date(exam.stage_started_at).getTime();
    const diff = Math.floor((startedTime + durationSec * 1000 - Date.now()) / 1000);
    return Math.max(0, diff);
  }

  return 0;
}

/**
 * Formats seconds into MM:SS (or HH:MM:SS if >= 3600)
 */
export function formatExamTimer(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
