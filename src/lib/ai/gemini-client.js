/**
 * Client-side interface to the IELTS Gemini AI Backend API & Service
 * Calls /api/exams/parse-pdf and /api/exams/grade-writing,
 * with resilient direct fallback to client-side service.
 */

import { 
  parseExamPdf, 
  parseThreePartExamPdf,
  gradeWritingSubmission, 
  getGeminiApiKey, 
  isLiveGeminiConfigured,
  getIdpSkillLevel,
  roundToIeltsBand,
  validateWritingInput,
} from './gemini-service.js';

export { 
  getGeminiApiKey, 
  isLiveGeminiConfigured,
  getIdpSkillLevel,
  roundToIeltsBand,
  validateWritingInput,
};

/**
 * Calls POST /api/exams/parse-pdf
 * Supports both streamlined 3-PDF pipeline (listeningPdf, readingPdf, writingPdf)
 * and single section file parsing.
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
  // Backward compatibility arguments
  file = null,
  fileName = null,
  sectionType = 'reading',
}) {
  try {
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

    // Audio tracks (URLs or metadata)
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

    // Fallback single file support
    if (file && !readingPdf && !listeningPdf && !writingPdf) {
      formData.append('pdf', file, fileName || file.name || 'exam.pdf');
      formData.append('sectionType', sectionType);
    }

    const response = await fetch('/api/exams/parse-pdf', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    }
    console.warn(`[API /api/exams/parse-pdf returned ${response.status}], falling back to direct service...`);
  } catch (err) {
    console.warn('[API /api/exams/parse-pdf unreachable, falling back to direct service]:', err.message);
  }

  // Client-side direct fallback
  const getFileBuffer = async (target) => {
    const f = target?.file || target;
    if (f && typeof f.arrayBuffer === 'function') {
      return await f.arrayBuffer();
    }
    return null;
  };

  const readingBuffer = await getFileBuffer(readingPdf || (sectionType === 'reading' ? file : null));
  const listeningBuffer = await getFileBuffer(listeningPdf || (sectionType === 'listening' ? file : null));
  const writingBuffer = await getFileBuffer(writingPdf || (sectionType === 'writing' ? file : null));

  if (readingBuffer || listeningBuffer || writingBuffer) {
    return await parseThreePartExamPdf({
      readingPdfBuffer: readingBuffer,
      readingFileName: readingPdf?.name || (sectionType === 'reading' ? fileName || file?.name : 'Reading.pdf'),
      listeningPdfBuffer: listeningBuffer,
      listeningFileName: listeningPdf?.name || (sectionType === 'listening' ? fileName || file?.name : 'Listening.pdf'),
      writingPdfBuffer: writingBuffer,
      writingFileName: writingPdf?.name || (sectionType === 'writing' ? fileName || file?.name : 'Writing.pdf'),
      audioTracks,
      examId,
      pinCode,
      title,
      durationMins,
    });
  }

  const singleBuffer = await getFileBuffer(file);
  return await parseExamPdf({
    fileBuffer: singleBuffer,
    fileName: fileName || file?.name || 'Exam.pdf',
    sectionType,
  });
}

/**
 * Calls POST /api/exams/grade-writing with strict IELTS criteria
 */
export async function apiGradeWritingSubmission({
  task_1_submission = '',
  task_2_submission = '',
  task_1_prompt = '',
  task_2_prompt = '',
  // Aliases
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

  try {
    const response = await fetch('/api/exams/grade-writing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    }
    console.warn(`[API /api/exams/grade-writing returned ${response.status}], using direct service fallback...`);
  } catch (err) {
    console.warn('[API /api/exams/grade-writing unreachable, using direct service fallback]:', err.message);
  }

  return await gradeWritingSubmission(payload);
}

