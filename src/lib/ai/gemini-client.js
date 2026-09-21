/**
 * Client-side interface to the IELTS Gemini AI Backend API & Service
 * Communicates exclusively with secure server routes (/api/exams/parse-pdf, /api/exams/grade-writing).
 * No direct Google Generative Language API calls, SDK bundling, or client keys.
 */

export const PRIMARY_GEMINI_MODEL = 'gemini-3.6-flash';
export const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/**
 * Official IDP IELTS Skill Level Mapping:
 */
export function getIdpSkillLevel(score) {
  const band = Number(score);
  if (isNaN(band) || band <= 0.0) return 'Did not attempt the test';
  if (band < 2.0) return 'Non-user';
  if (band <= 2.5) return 'Intermittent user';
  if (band <= 3.5) return 'Extremely limited user';
  if (band <= 4.5) return 'Limited user';
  if (band <= 5.5) return 'Modest user';
  if (band <= 6.5) return 'Competent user';
  if (band <= 7.5) return 'Good user';
  if (band <= 8.5) return 'Very good user';
  return 'Expert user';
}

/**
 * Official IELTS Band rounding helper:
 */
export function roundToIeltsBand(score) {
  if (score === null || score === undefined || isNaN(score)) return 0.0;
  const num = Math.max(0, Math.min(9, Number(score)));
  const floor = Math.floor(num);
  const frac = Math.round((num - floor) * 1000) / 1000;
  if (frac < 0.25) {
    return floor;
  } else if (frac < 0.75) {
    return floor + 0.5;
  } else {
    return Math.min(9.0, floor + 1.0);
  }
}

export const roundToIeltsHalfBand = roundToIeltsBand;

export function isLiveGeminiConfigured() {
  return true;
}

export function getGeminiApiKey() {
  return '';
}

/**
 * Validates candidate text submission before evaluation
 */
export function validateWritingInput(text) {
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      isAbusiveOrUnderThreshold: true,
      assignedBand: 0.0,
      skillLevel: 'Did not attempt the test',
      reason: 'No text provided. Candidate did not attempt the test.',
      wordCount: 0,
    };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return {
      isValid: false,
      isAbusiveOrUnderThreshold: true,
      assignedBand: 0.0,
      skillLevel: 'Did not attempt the test',
      reason: 'Empty input. Candidate did not attempt the test.',
      wordCount: 0,
    };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  return {
    isValid: words.length >= 20,
    isAbusiveOrUnderThreshold: words.length < 20,
    assignedBand: words.length < 20 ? 1.0 : null,
    skillLevel: words.length < 20 ? 'Non-user' : null,
    reason: words.length < 20 ? 'Submission is under minimum required length (< 20 words).' : null,
    wordCount: words.length,
  };
}

/**
 * Calls POST /api/exams/parse-pdf on the secure server
 */
export async function apiParseExamPdf({
  listeningPdf = null,
  readingPdf = null,
  writingPdf = null,
  audioTracks = {},
  examId = null,
  pinCode = null,
  title = null,
  durationMins = 60,
  file = null,
  fileName = null,
  sectionType = 'reading',
}) {
  const formData = new FormData();

  if (listeningPdf) {
    const f = listeningPdf.file || listeningPdf;
    if (f instanceof Blob || f instanceof File) {
      formData.append('listeningPdf', f, listeningPdf.name || f.name || 'Listening.pdf');
    }
  }

  if (readingPdf) {
    const f = readingPdf.file || readingPdf;
    if (f instanceof Blob || f instanceof File) {
      formData.append('readingPdf', f, readingPdf.name || f.name || 'Reading.pdf');
    }
  }

  if (writingPdf) {
    const f = writingPdf.file || writingPdf;
    if (f instanceof Blob || f instanceof File) {
      formData.append('writingPdf', f, writingPdf.name || f.name || 'Writing.pdf');
    }
  }

  if (audioTracks) {
    if (audioTracks.part1) formData.append('audio1', typeof audioTracks.part1 === 'string' ? audioTracks.part1 : audioTracks.part1?.url || '');
    if (audioTracks.part2) formData.append('audio2', typeof audioTracks.part2 === 'string' ? audioTracks.part2 : audioTracks.part2?.url || '');
    if (audioTracks.part3) formData.append('audio3', typeof audioTracks.part3 === 'string' ? audioTracks.part3 : audioTracks.part3?.url || '');
    if (audioTracks.part4) formData.append('audio4', typeof audioTracks.part4 === 'string' ? audioTracks.part4 : audioTracks.part4?.url || '');
    formData.append('audio_parts', JSON.stringify(audioTracks));
  }

  if (examId) formData.append('examId', examId);
  if (pinCode) formData.append('pinCode', pinCode);
  if (title) formData.append('title', title);
  if (durationMins) formData.append('durationMins', String(durationMins));

  if (file && !readingPdf && !listeningPdf && !writingPdf) {
    formData.append('pdf', file, fileName || file.name || 'exam.pdf');
    formData.append('sectionType', sectionType);
  }

  const response = await fetch('/api/exams/parse-pdf', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Failed to parse PDF (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.error) errorDetail = errJson.error;
    } catch {}
    throw new Error(errorDetail);
  }

  return await response.json();
}

/**
 * Calls POST /api/exams/grade-writing with strict IELTS criteria
 */
export async function apiGradeWritingSubmission({
  task_1_submission = '',
  task_2_submission = '',
  task_1_prompt = '',
  task_2_prompt = '',
  task1Text = '',
  task2Text = '',
  task1Prompt = '',
  task2Prompt = '',
  studentId = null,
}) {
  const payload = {
    task_1_submission: task_1_submission || task1Text || '',
    task_2_submission: task_2_submission || task2Text || '',
    task_1_prompt: task_1_prompt || task1Prompt || '',
    task_2_prompt: task_2_prompt || task2Prompt || '',
    task1Text: task_1_submission || task1Text || '',
    task2Text: task_2_submission || task2Text || '',
    task1Prompt: task_1_prompt || task1Prompt || '',
    task2Prompt: task_2_prompt || task2Prompt || '',
    studentId,
  };

  const response = await fetch('/api/exams/grade-writing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetail = `Writing grading failed (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.error) errorDetail = errJson.error;
    } catch {}
    throw new Error(errorDetail);
  }

  return await response.json();
}

/**
 * Calls POST /api/exams/parse-section on the server for a single section
 */
export async function apiParseExamSection({ sectionType, file, fileName }) {
  const formData = new FormData();
  formData.append('sectionType', sectionType);
  const f = file?.file || file;
  if (!f) {
    throw new Error(`No file provided for ${sectionType} section parsing.`);
  }
  formData.append('file', f, fileName || file?.name || `${sectionType}.pdf`);

  const response = await fetch('/api/exams/parse-section', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Failed to parse ${sectionType} section (${response.status})`;
    let isRateLimit = response.status === 429;
    try {
      const errJson = await response.json();
      if (errJson?.error) errorDetail = errJson.error;
      if (errJson?.isRateLimit) isRateLimit = true;
    } catch {}
    const err = new Error(errorDetail);
    err.status = response.status;
    err.isRateLimit = isRateLimit;
    throw err;
  }

  const result = await response.json();
  return result.data;
}



