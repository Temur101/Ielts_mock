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
    if (typeof exam.listening_audio_duration_seconds === 'number' && exam.listening_audio_duration_seconds > 0) {
      detectedAudioDuration = exam.listening_audio_duration_seconds;
    } else if (typeof exam.audioDuration === 'number' && exam.audioDuration > 0) {
      detectedAudioDuration = exam.audioDuration;
    } else if (typeof exam.audio_duration === 'number' && exam.audio_duration > 0) {
      detectedAudioDuration = exam.audio_duration;
    }

    // 2. Check multi-part audio configurations
    const audioParts = exam.listening_audio_parts || exam.listening?.audio_parts || {};
    const audioDurations = exam.listening_audio_durations || exam.listening?.audio_durations || {};
    const rawParts = exam.listening_parts || exam.listening?.parts || [];

    // Collect all valid URLs from audioParts
    const populatedPartUrls = Object.values(audioParts).filter(
      (url) => typeof url === 'string' && url.trim().length > 0
    );
    const uniquePartUrls = new Set(populatedPartUrls);

    // Single audio mode detection (synchronized with student ListeningSection)
    const isSingleAudioMode =
      exam.listening_audio_mode === 'single' ||
      exam.listening?.audio_mode === 'single' ||
      (populatedPartUrls.length > 0 && uniquePartUrls.size === 1) ||
      Boolean(
        audioParts.part1 &&
        audioParts.part1 === audioParts.part2 &&
        audioParts.part1 === audioParts.part3 &&
        audioParts.part1 === audioParts.part4
      );

    let hasLoadedAudio = Boolean(
      exam.audio_url || 
      exam.listening_audio_url || 
      exam.listening?.audio_url ||
      populatedPartUrls.length > 0 ||
      (Array.isArray(exam.sections) && exam.sections.find(s => s.type === 'listening')?.audio_url)
    );

    // Check rawParts for audio if audioParts was empty
    if (!hasLoadedAudio && Array.isArray(rawParts) && rawParts.length > 0) {
      hasLoadedAudio = rawParts.some(p => p?.audio_url && typeof p.audio_url === 'string' && p.audio_url.trim().length > 0);
    }

    if (isSingleAudioMode) {
      // In single audio mode: 1 audio track runs continuously across all parts.
      // DURATION MUST NEVER BE MULTIPLIED OR SUMMED ACROSS PARTS!
      let singleTrackDuration = detectedAudioDuration;

      if (singleTrackDuration <= 0) {
        // Extract the duration of the single track from the first available slot
        const durCandidates = [
          audioDurations.part1,
          audioDurations.part2,
          audioDurations.part3,
          audioDurations.part4,
          rawParts[0]?.duration,
          rawParts[1]?.duration,
          rawParts[2]?.duration,
          rawParts[3]?.duration
        ];
        for (const dur of durCandidates) {
          const sec = parseDurationToSeconds(dur);
          if (sec > 0) {
            singleTrackDuration = sec;
            break;
          }
        }
      }

      const sectionListening = Array.isArray(exam.sections) ? exam.sections.find(s => s.type === 'listening') : null;
      if (sectionListening?.audio_url) {
        hasLoadedAudio = true;
        const sec = parseDurationToSeconds(sectionListening.audioDuration || sectionListening.duration);
        if (sec > 0 && singleTrackDuration <= 0) {
          singleTrackDuration = sec;
        }
      }

      if (hasLoadedAudio && singleTrackDuration > 0) {
        // Strict Cambridge IELTS Adaptive Rule: audio duration + 120s (2 min review buffer)
        return Math.ceil(singleTrackDuration) + 120;
      }

      // Default fallback if audio loaded but 0s or missing audio
      return 35 * 60;
    }

    // Split audio mode: Separate audio files per part (sum individual distinct parts)
    let partsTotalDuration = 0;
    const seenUrls = new Set();

    Object.keys(audioParts).forEach((key) => {
      const url = audioParts[key];
      if (url && typeof url === 'string' && url.trim().length > 0) {
        hasLoadedAudio = true;
        const sec = parseDurationToSeconds(audioDurations[key]);
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          partsTotalDuration += sec;
        }
      }
    });

    if (Array.isArray(rawParts) && rawParts.length > 0) {
      rawParts.forEach((p, idx) => {
        if (p?.audio_url && typeof p.audio_url === 'string' && p.audio_url.trim().length > 0) {
          hasLoadedAudio = true;
          const slotKey = `part${idx + 1}`;
          if (!audioParts[slotKey] && !seenUrls.has(p.audio_url)) {
            seenUrls.add(p.audio_url);
            const sec = parseDurationToSeconds(p.duration || audioDurations[slotKey]);
            partsTotalDuration += sec;
          }
        }
      });
    }

    const sectionListening = Array.isArray(exam.sections) ? exam.sections.find(s => s.type === 'listening') : null;
    if (sectionListening?.audio_url && !seenUrls.has(sectionListening.audio_url)) {
      hasLoadedAudio = true;
      const sec = parseDurationToSeconds(sectionListening.audioDuration || sectionListening.duration);
      if (sec > 0) partsTotalDuration += sec;
    }

    const finalAudioSec = partsTotalDuration > 0 ? partsTotalDuration : detectedAudioDuration;

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

  // Graceful buffer during initial mount/reconnect before server timestamps arrive:
  // If stage is active, return standard duration instead of 0 to prevent premature section auto-lock
  if (effectiveStage.endsWith('_active')) {
    return calculateStageDurationSeconds(effectiveStage, exam);
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
