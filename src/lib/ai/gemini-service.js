/**
 * Google Gemini AI Integration Service
 * Model: gemini-2.5-flash (with automated fallback to gemini-3.6-flash)
 * Real multi-part PDF parsing & Strict Official IELTS Writing Examiner.
 * Fallback mock datasets have been completely eliminated.
 */

import { GoogleGenAI } from '@google/genai';

/**
 * Helper to retrieve Gemini API Key across Node and Browser environments
 */
export function getGeminiApiKey() {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      return process.env.GEMINI_API_KEY.trim();
    }
    if (process.env.VITE_GEMINI_API_KEY && process.env.VITE_GEMINI_API_KEY.trim()) {
      return process.env.VITE_GEMINI_API_KEY.trim();
    }
  }

  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY.trim()) {
      return import.meta.env.VITE_GEMINI_API_KEY.trim();
    }
    if (import.meta.env.GEMINI_API_KEY && import.meta.env.GEMINI_API_KEY.trim()) {
      return import.meta.env.GEMINI_API_KEY.trim();
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    const local = window.localStorage.getItem('gemini_api_key');
    if (local && local.trim()) return local.trim();
  }

  return '';
}

/**
 * Checks whether the active environment has a valid API key
 */
export function isLiveGeminiConfigured() {
  const key = getGeminiApiKey();
  if (!key) return false;
  const lower = key.toLowerCase();
  if (lower.startsWith('placeholder') || lower === 'your_api_key_here' || lower === 'todo') {
    return false;
  }
  return key.length > 10;
}

/**
 * Official IDP IELTS Skill Level Mapping:
 * - 9.0: "Expert user"
 * - 8.0 - 8.5: "Very good user"
 * - 7.0 - 7.5: "Good user"
 * - 6.0 - 6.5: "Competent user"
 * - 5.0 - 5.5: "Modest user"
 * - 4.0 - 4.5: "Limited user"
 * - 3.0 - 3.5: "Extremely limited user"
 * - 2.0 - 2.5: "Intermittent user"
 * - 1.0: "Non-user"
 * - 0.0: "Did not attempt the test"
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
 * - Fractional remainder in [0.25, 0.75) rounds to .5
 * - >= 0.75 rounds up to the next whole band
 * - < 0.25 rounds down to the whole band
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

/**
 * Converts buffer, Uint8Array, or base64 to standard base64 string
 */
export function toBase64String(fileBuffer) {
  if (!fileBuffer) return '';
  if (typeof fileBuffer === 'string') {
    if (fileBuffer.includes('base64,')) {
      return fileBuffer.split('base64,')[1];
    }
    return fileBuffer;
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(fileBuffer)) {
    return fileBuffer.toString('base64');
  }
  if (fileBuffer instanceof Uint8Array || fileBuffer instanceof ArrayBuffer) {
    const bytes = new Uint8Array(fileBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa !== 'undefined') {
      return btoa(binary);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
  }
  return '';
}

/**
 * Calls Gemini models with gemini-2.5-flash as primary,
 * falling back automatically to gemini-3.6-flash if deprecated/404 by Google.
 */
export async function callGeminiGenerate({ apiKey, contents, config = {} }) {
  const activeKey = apiKey || getGeminiApiKey();
  if (!activeKey) {
    throw new Error('GEMINI_API_KEY is required. Please set GEMINI_API_KEY in your environment.');
  }

  const ai = new GoogleGenAI({ apiKey: activeKey });
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.6-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          ...config,
        },
      });
      return { response, modelUsed: model };
    } catch (err) {
      lastError = err;
      const msg = (err.message || '').toLowerCase();
      if (
        msg.includes('high demand') || 
        msg.includes('503') || 
        msg.includes('unavailable') || 
        msg.includes('quota') || 
        msg.includes('429')
      ) {
        console.warn(`[Gemini] Model ${model} experienced temporary spike (${err.message}). Retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const retryResp = await ai.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: 'application/json',
              ...config,
            },
          });
          return { response: retryResp, modelUsed: model };
        } catch (retryErr) {
          console.warn(`[Gemini] Retry for ${model} failed (${retryErr.message}). Trying fallback model...`);
        }
        continue;
      }

      if (msg.includes('not found') || msg.includes('no longer available') || msg.includes('404')) {
        console.warn(`[Gemini] Model ${model} returned 404/deprecated (${err.message}). Trying fallback model...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// =========================================================================
// 1. STREAMLINED 3-PDF PARSER PIPELINE (BACKEND)
// =========================================================================

/**
 * Parse Reading PDF into exact visual transcription HTML (Passages 1–3),
 * Questions (1–40), and Answer Keys.
 */
export async function parseReadingPdf({ fileBuffer, fileName = 'Reading_Booklet.pdf' }) {
  const base64Data = toBase64String(fileBuffer);
  if (!base64Data) {
    throw new Error('Missing Reading PDF binary buffer.');
  }

  const prompt = `You are a pixel-accurate IELTS booklet transcriber and certified Cambridge Academic Reading test parser.
Transcribe the provided Reading PDF directly into structural HTML that exactly mirrors the authentic original PDF pages.
Do not summarize. Do not alter layout geometry.
- For each passage (Passage 1: Questions 1–13, Passage 2: Questions 14–26, Passage 3: Questions 27–40):
  - Transcribe the complete verbatim passage text and all accompanying question sets.
  - If questions, note-completions, classifications, or summary frames are enclosed in a square/rectangle with a border, generate: <div class='pdf-exact-box'>...</div>.
  - If a section or card has a title/heading, generate: <div class='pdf-exact-box-header'>HEADING TEXT</div>.
  - If there are shaded candidate info or example boxes, generate: <div class='pdf-exact-shaded-box'>...</div>.
  - If rubric instructions exist (e.g. "Do the following statements agree..."), generate: <div class='ielts-instruction-banner'>...</div>.
  - If there are tables or grids, generate: <table class='ielts-exact-table'>...</table>.
  - Replace answer blanks with: <span class='answer-slot' data-question-num='X'>____ (X)</span>.
  - For multiple-choice choices, wrap them in: <div class='ielts-mcq-option' data-q='X' data-val='A'><strong>A</strong> Option text</div>.
  - Retain font sizing hierarchy, bold terms, and indentation.
  - Extract and attach the answer keys (1-40) separately in the answer_keys object.

Return a STRICT, valid JSON object with NO markdown ticks, following this exact schema:
{
  "section": "reading",
  "total_questions": 40,
  "sections": [
    {
      "part": 1,
      "title": "Passage 1 Title",
      "question_range": "Questions 1–13",
      "passage_text": "Verbatim text of reading passage 1...",
      "page_content_html": "<exact transcribed HTML retaining all boxes, lines, tables, and answer slots for Passage 1 and Questions 1-13>",
      "answer_keys": { "1": "TRUE", "2": "NOT GIVEN" }
    },
    {
      "part": 2,
      "title": "Passage 2 Title",
      "question_range": "Questions 14–26",
      "passage_text": "Verbatim text of reading passage 2...",
      "page_content_html": "<exact transcribed HTML retaining all boxes, lines, tables, and answer slots for Passage 2 and Questions 14-26>",
      "answer_keys": { "14": "B" }
    },
    {
      "part": 3,
      "title": "Passage 3 Title",
      "question_range": "Questions 27–40",
      "passage_text": "Verbatim text of reading passage 3...",
      "page_content_html": "<exact transcribed HTML retaining all boxes, lines, tables, and answer slots for Passage 3 and Questions 27-40>",
      "answer_keys": { "27": "aqueduct" }
    }
  ],
  "answer_keys": {
    "1": "TRUE"
  },
  "questions": [
    {
      "questionNumber": 1,
      "passageId": 1,
      "type": "TRUE_FALSE",
      "instruction": "Write TRUE, FALSE or NOT GIVEN",
      "text": "Statement for question 1...",
      "options": ["TRUE", "FALSE", "NOT GIVEN"],
      "acceptedAnswers": ["TRUE"]
    }
  ]
}`;

  const { response, modelUsed } = await callGeminiGenerate({
    contents: [
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data,
        },
      },
      { text: prompt },
    ],
    config: {
      temperature: 0.1,
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  parsed.file_name = fileName;
  parsed.model_used = modelUsed;

  // Unify answer_keys
  const unifiedKeys = { ...(parsed.answer_keys || parsed.answerKeys || {}) };
  if (Array.isArray(parsed.sections)) {
    parsed.sections.forEach((sec) => {
      if (sec.answer_keys) Object.assign(unifiedKeys, sec.answer_keys);
      if (sec.answerKeys) Object.assign(unifiedKeys, sec.answerKeys);
    });
  }
  parsed.answer_keys = unifiedKeys;
  parsed.answerKeys = unifiedKeys;

  // Normalize questions array
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    parsed.questions = Object.keys(unifiedKeys).map((k) => {
      const qNum = Number(k);
      return {
        questionNumber: qNum,
        passageId: qNum <= 13 ? 1 : qNum <= 26 ? 2 : 3,
        type: 'FILL_BLANK',
        instruction: 'Complete the statement or answer slot.',
        text: `Question ${qNum}`,
        options: [],
        acceptedAnswers: [String(unifiedKeys[k])],
      };
    }).sort((a, b) => a.questionNumber - b.questionNumber);
  } else {
    parsed.questions.forEach((q) => {
      if (!q.acceptedAnswers || !q.acceptedAnswers.length) {
        const key = unifiedKeys[q.questionNumber];
        if (key) q.acceptedAnswers = [String(key)];
      }
    });
  }

  return parsed;
}

/**
 * Parse Listening PDF into exact visual transcription HTML (Parts 1–4),
 * Questions (1–40), and Answer Keys.
 */
export async function parseListeningPdf({ fileBuffer, fileName = 'Listening_Booklet.pdf' }) {
  const base64Data = toBase64String(fileBuffer);
  if (!base64Data) {
    throw new Error('Missing Listening PDF binary buffer.');
  }

  const prompt = `You are a pixel-accurate IELTS booklet transcriber and certified Cambridge Listening test parser.
Transcribe the provided Listening PDF directly into structural HTML that exactly mirrors the authentic original PDF pages.
Do not summarize. Do not alter layout geometry.
- For each part (Part 1: Questions 1–10, Part 2: Questions 11–20, Part 3: Questions 21–30, Part 4: Questions 31–40):
  - If a section, note-completion form, questionnaire, or information card is enclosed in a square/rectangle with a border, generate: <div class='pdf-exact-box'>...</div>.
  - If a section or card has a title/heading, generate: <div class='pdf-exact-box-header'>HEADING TEXT</div>.
  - If there are candidate instruction boxes or shaded examples, generate: <div class='pdf-exact-shaded-box'>...</div>.
  - If rubric instructions exist (e.g. "Write NO MORE THAN TWO WORDS..."), generate: <div class='ielts-instruction-banner'>...</div>.
  - If there are tables or grids, generate: <table class='ielts-exact-table'>...</table>.
  - Replace answer blanks with: <span class='answer-slot' data-question-num='X'>____ (X)</span>.
  - For multiple-choice choices, wrap them in: <div class='ielts-mcq-option' data-q='X' data-val='A'><strong>A</strong> Option text</div>.
  - Retain font sizing hierarchy, bold terms, and indentation.
  - Extract and attach the answer keys (1-40) separately in the answer_keys object.

Return a STRICT, valid JSON object with NO markdown ticks, following this exact schema:
{
  "section": "listening",
  "total_questions": 40,
  "sections": [
    {
      "part": 1,
      "title": "Part 1: Social Dialogue",
      "question_range": "Questions 1–10",
      "page_content_html": "<exact transcribed HTML retaining all boxes, lines, tables, and answer slots for Part 1 (Questions 1-10)>",
      "answer_keys": { "1": "Smith", "2": "07700900123" }
    },
    {
      "part": 2,
      "title": "Part 2: Community Guide",
      "question_range": "Questions 11–20",
      "page_content_html": "<exact transcribed HTML retaining all boxes, lines, tables, and answer slots for Part 2 (Questions 11-20)>",
      "answer_keys": { "11": "A" }
    },
    {
      "part": 3,
      "title": "Part 3: Academic Tutorial",
      "question_range": "Questions 21–30",
      "page_content_html": "<exact transcribed HTML retaining all boxes, lines, tables, and answer slots for Part 3 (Questions 21-30)>",
      "answer_keys": { "21": "B" }
    },
    {
      "part": 4,
      "title": "Part 4: University Lecture",
      "question_range": "Questions 31–40",
      "page_content_html": "<exact transcribed HTML retaining all boxes, lines, tables, and answer slots for Part 4 (Questions 31-40)>",
      "answer_keys": { "31": "carbon dioxide" }
    }
  ],
  "answer_keys": {
    "1": "Smith"
  },
  "questions": [
    {
      "questionNumber": 1,
      "partId": 1,
      "type": "FILL_BLANK",
      "instruction": "Write NO MORE THAN ONE WORD AND/OR A NUMBER",
      "text": "Name of contact: ____",
      "options": [],
      "acceptedAnswers": ["Smith"]
    }
  ]
}`;

  const { response, modelUsed } = await callGeminiGenerate({
    contents: [
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data,
        },
      },
      { text: prompt },
    ],
    config: {
      temperature: 0.1,
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  parsed.file_name = fileName;
  parsed.model_used = modelUsed;

  // Unify answer_keys
  const unifiedKeys = { ...(parsed.answer_keys || parsed.answerKeys || {}) };
  if (Array.isArray(parsed.sections)) {
    parsed.sections.forEach((sec) => {
      if (sec.answer_keys) Object.assign(unifiedKeys, sec.answer_keys);
      if (sec.answerKeys) Object.assign(unifiedKeys, sec.answerKeys);
    });
  }
  parsed.answer_keys = unifiedKeys;
  parsed.answerKeys = unifiedKeys;

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    parsed.questions = Object.keys(unifiedKeys).map((k) => {
      const qNum = Number(k);
      return {
        questionNumber: qNum,
        partId: qNum <= 10 ? 1 : qNum <= 20 ? 2 : qNum <= 30 ? 3 : 4,
        type: 'FILL_BLANK',
        instruction: 'Listen to the audio recording and complete the answer.',
        text: `Question ${qNum}`,
        options: [],
        acceptedAnswers: [String(unifiedKeys[k])],
      };
    }).sort((a, b) => a.questionNumber - b.questionNumber);
  } else {
    parsed.questions.forEach((q) => {
      if (!q.acceptedAnswers || !q.acceptedAnswers.length) {
        const key = unifiedKeys[q.questionNumber];
        if (key) q.acceptedAnswers = [String(key)];
      }
    });
  }

  return parsed;
}

/**
 * Parse Writing PDF into exact visual transcription HTML (Task 1 & Task 2)
 * and prompt parameters.
 */
export async function parseWritingPdf({ fileBuffer, fileName = 'Writing_Booklet.pdf' }) {
  const base64Data = toBase64String(fileBuffer);
  if (!base64Data) {
    throw new Error('Missing Writing PDF binary buffer.');
  }

  const prompt = `You are a pixel-accurate IELTS booklet transcriber and certified Cambridge Academic Writing test material parser.
Transcribe the provided IELTS Writing booklet PDF directly into structural HTML that exactly mirrors the authentic original PDF pages.
Do not summarize. Do not alter layout geometry.
- Keep all outer bounding boxes, instruction banners, visual descriptions, and prompt cards identical to the authentic Cambridge exam booklet.
- For Task 1 (Academic Report, min 150 words):
  - Generate a <div class='pdf-exact-box'> containing:
    - <div class='pdf-exact-box-header'>WRITING TASK 1</div>
    - <div class='ielts-instruction-banner'>You should spend about 20 minutes on this task. Write at least 150 words.</div>
    - The complete prompt statement.
    - An authentic visual, tabular or ASCII/SVG representation of the graph, chart, table, process, or map.
- For Task 2 (Discursive Essay, min 250 words):
  - Generate a <div class='pdf-exact-box'> containing:
    - <div class='pdf-exact-box-header'>WRITING TASK 2</div>
    - <div class='ielts-instruction-banner'>You should spend about 40 minutes on this task. Write at least 250 words.</div>
    - The complete essay topic statement and discussion requirements.

Return a STRICT, valid JSON object with NO markdown ticks, following this exact schema:
{
  "section": "writing",
  "task_1_prompt": "Prompt text for Task 1...",
  "task_2_prompt": "Prompt text for Task 2...",
  "sections": [
    {
      "part": 1,
      "title": "Task 1: Academic Report",
      "page_content_html": "<exact transcribed HTML in pdf-exact-box with instructions, chart/table, and prompt>",
      "prompt": "Prompt text for Task 1...",
      "min_words": 150,
      "recommended_mins": 20
    },
    {
      "part": 2,
      "title": "Task 2: Discursive Essay",
      "page_content_html": "<exact transcribed HTML in pdf-exact-box with instructions and essay prompt>",
      "prompt": "Prompt text for Task 2...",
      "min_words": 250,
      "recommended_mins": 40
    }
  ],
  "tasks": {
    "task1": {
      "title": "Task 1: Academic Report",
      "recommended_mins": 20,
      "min_words": 150,
      "prompt": "Prompt text for Task 1...",
      "page_content_html": "<exact transcribed HTML in pdf-exact-box>"
    },
    "task2": {
      "title": "Task 2: Discursive Essay",
      "recommended_mins": 40,
      "min_words": 250,
      "prompt": "Prompt text for Task 2...",
      "page_content_html": "<exact transcribed HTML in pdf-exact-box>"
    }
  }
}`;

  const { response, modelUsed } = await callGeminiGenerate({
    contents: [
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data,
        },
      },
      { text: prompt },
    ],
    config: {
      temperature: 0.1,
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  parsed.file_name = fileName;
  parsed.model_used = modelUsed;

  // Ensure top-level prompt fields are set
  if (!parsed.task_1_prompt && parsed.tasks?.task1?.prompt) {
    parsed.task_1_prompt = parsed.tasks.task1.prompt;
  }
  if (!parsed.task_2_prompt && parsed.tasks?.task2?.prompt) {
    parsed.task_2_prompt = parsed.tasks.task2.prompt;
  }
  if (!parsed.task_1_prompt && Array.isArray(parsed.sections) && parsed.sections[0]?.prompt) {
    parsed.task_1_prompt = parsed.sections[0].prompt;
  }
  if (!parsed.task_2_prompt && Array.isArray(parsed.sections) && parsed.sections[1]?.prompt) {
    parsed.task_2_prompt = parsed.sections[1].prompt;
  }

  return parsed;
}

/**
 * Consolidated 3-PDF parser pipeline:
 * Accepts listeningPdf, readingPdf, and writingPdf binary buffers (+ audio tracks)
 * and processes them directly via Gemini.
 */
export async function parseThreePartExamPdf({
  listeningPdfBuffer = null,
  listeningFileName = 'Listening.pdf',
  readingPdfBuffer = null,
  readingFileName = 'Reading.pdf',
  writingPdfBuffer = null,
  writingFileName = 'Writing.pdf',
  audioTracks = {},
  examId = null,
  pinCode = null,
  title = null,
  durationMins = 60,
}) {
  console.log('[3-PDF Parser Pipeline] Starting direct Gemini parsing for provided PDFs...');

  const parsePromises = {};

  if (readingPdfBuffer) {
    parsePromises.reading = parseReadingPdf({ fileBuffer: readingPdfBuffer, fileName: readingFileName });
  }
  if (listeningPdfBuffer) {
    parsePromises.listening = parseListeningPdf({ fileBuffer: listeningPdfBuffer, fileName: listeningFileName });
  }
  if (writingPdfBuffer) {
    parsePromises.writing = parseWritingPdf({ fileBuffer: writingPdfBuffer, fileName: writingFileName });
  }

  const keys = Object.keys(parsePromises);
  if (keys.length === 0) {
    throw new Error('No PDF files provided to parse. Please upload readingPdf, listeningPdf, or writingPdf.');
  }

  const resultsArray = await Promise.all(Object.values(parsePromises));
  const results = {};
  keys.forEach((key, idx) => {
    results[key] = resultsArray[idx];
  });

  // Build structured Reading parts
  let readingPayload = null;
  if (results.reading) {
    const r = results.reading;
    const passages = [1, 2, 3].map((pId) => {
      const sec = Array.isArray(r.sections) ? r.sections.find((s) => s.part === pId) : null;
      const part = r.parts?.[`part${pId}`] || {};
      return {
        id: pId,
        title: sec?.title || part.title || `Passage ${pId}`,
        content: sec?.passage_text || part.passageText || '',
        page_content_html: sec?.page_content_html || part.page_content_html || '',
        pdf_name: readingFileName,
        question_range: sec?.question_range || part.questionRange || '',
      };
    });

    readingPayload = {
      ...r,
      passages,
      sections: r.sections || passages.map((p) => ({
        part: p.id,
        title: p.title,
        page_content_html: p.page_content_html,
        question_range: p.question_range,
      })),
      parts: r.parts || {},
      questions: r.questions || [],
      answer_keys: r.answer_keys || r.answerKeys || {},
    };
  }

  // Build structured Listening parts
  let listeningPayload = null;
  if (results.listening) {
    const l = results.listening;
    const parts = [1, 2, 3, 4].map((pId) => {
      const pKey = `part${pId}`;
      const sec = Array.isArray(l.sections) ? l.sections.find((s) => s.part === pId) : null;
      const audio = audioTracks?.[pKey] || audioTracks?.[`audio${pId}`] || audioTracks?.[`audioTrack${pId}`] || {};
      const audioUrl = typeof audio === 'string' ? audio : audio?.url || '';
      const audioName = typeof audio === 'string' ? '' : audio?.name || '';
      return {
        partId: pId,
        title: sec?.title || l.parts?.[pKey]?.title || `Part ${pId}`,
        question_range: sec?.question_range || l.parts?.[pKey]?.questionRange || '',
        page_content_html: sec?.page_content_html || l.parts?.[pKey]?.page_content_html || '',
        audio_url: audioUrl,
        audio_name: audioName,
      };
    });

    listeningPayload = {
      ...l,
      parts,
      sections: l.sections || parts.map((p) => ({
        part: p.partId,
        title: p.title,
        page_content_html: p.page_content_html,
        question_range: p.question_range,
      })),
      questions: l.questions || [],
      answer_keys: l.answer_keys || l.answerKeys || {},
      audio_parts: audioTracks,
    };
  }

  // Build structured Writing parts
  let writingPayload = null;
  if (results.writing) {
    const w = results.writing;
    writingPayload = {
      ...w,
      task_1_prompt: w.task_1_prompt || w.tasks?.task1?.prompt || '',
      task_2_prompt: w.task_2_prompt || w.tasks?.task2?.prompt || '',
      tasks: w.tasks || {},
      sections: w.sections || [
        {
          part: 1,
          title: 'Task 1: Academic Report',
          page_content_html: w.tasks?.task1?.page_content_html || '',
          prompt: w.task_1_prompt,
        },
        {
          part: 2,
          title: 'Task 2: Discursive Essay',
          page_content_html: w.tasks?.task2?.page_content_html || '',
          prompt: w.task_2_prompt,
        },
      ],
    };
  }

  const fullExamPayload = {
    exam_id: examId,
    pin_code: pinCode,
    title: title || 'IELTS Academic Master Assessment',
    duration_mins: durationMins,
    reading: readingPayload,
    listening: listeningPayload,
    writing: writingPayload,
    task_1_prompt: writingPayload?.task_1_prompt || '',
    task_2_prompt: writingPayload?.task_2_prompt || '',
    parsed_at: new Date().toISOString(),
  };

  return fullExamPayload;
}

/**
 * Backward compatibility parser for single section
 */
export async function parseExamPdf({ fileBuffer, fileName = 'Exam.pdf', sectionType = 'reading' }) {
  const sType = (sectionType || 'reading').toLowerCase();
  if (sType === 'listening') {
    return await parseListeningPdf({ fileBuffer, fileName });
  }
  if (sType === 'writing') {
    return await parseWritingPdf({ fileBuffer, fileName });
  }
  return await parseReadingPdf({ fileBuffer, fileName });
}

// =========================================================================
// 2. REAL STRICT AI WRITING EXAMINER
// =========================================================================

/**
 * Validates text for basic linguistic integrity (anti-abuse check) per official IDP criteria:
 * - Empty text, whitespace, or random key spam -> Band 0.0, skill_level: "Did not attempt the test"
 * - Russian text, non-English language, or isolated words (<20 words) -> Band 1.0, skill_level: "Non-user"
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
  const wordCount = words.length;

  if (wordCount === 0) {
    return {
      isValid: false,
      isAbusiveOrUnderThreshold: true,
      assignedBand: 0.0,
      skillLevel: 'Did not attempt the test',
      reason: 'Empty input. Candidate did not attempt the test.',
      wordCount: 0,
    };
  }

  // 1. Random key spam / keyboard mashing (Band 0.0)
  // E.g.: "aaaaa", "asdfghjk", "qwertyuiop", excessively long strings (>25 chars), or consonant runs
  const keySpamPatterns = [
    /(.)\1{4,}/i, // 5+ same character in a row
    /^[bcdfghjklmnpqrstvwxyz]{6,}$/i, // 6+ consonants without a vowel
    /(?:asdf|qwer|zxcv|hjkl|poiuy|lkjh){2,}/i, // repetitive keyboard runs
  ];

  let spamWordCount = 0;
  for (const w of words) {
    if (w.length > 25 || keySpamPatterns.some((pattern) => pattern.test(w))) {
      spamWordCount++;
    }
  }

  if (spamWordCount >= 2 || (wordCount <= 5 && spamWordCount >= 1)) {
    return {
      isValid: false,
      isAbusiveOrUnderThreshold: true,
      assignedBand: 0.0,
      skillLevel: 'Did not attempt the test',
      reason: 'Random key spam or unintelligible character strings detected. Band 0.0 assigned.',
      wordCount,
    };
  }

  // 2. Russian or another non-English language (Band 1.0)
  const cyrillicMatch = trimmed.match(/[\u0400-\u04FF]/g);
  if (cyrillicMatch && cyrillicMatch.length > 3) {
    return {
      isValid: false,
      isAbusiveOrUnderThreshold: true,
      assignedBand: 1.0,
      skillLevel: 'Non-user',
      reason: 'Submission is written in Russian or another non-English language. Band 1.0 assigned per official IELTS criteria.',
      wordCount,
    };
  }

  const foreignScriptMatch = trimmed.match(/[\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g);
  if (foreignScriptMatch && foreignScriptMatch.length > 3) {
    return {
      isValid: false,
      isAbusiveOrUnderThreshold: true,
      assignedBand: 1.0,
      skillLevel: 'Non-user',
      reason: 'Submission is written in a non-English language. Band 1.0 assigned per official IELTS criteria.',
      wordCount,
    };
  }

  // 3. Isolated words (< 20 words) (Band 1.0)
  if (wordCount < 20) {
    return {
      isValid: false,
      isAbusiveOrUnderThreshold: true,
      assignedBand: 1.0,
      skillLevel: 'Non-user',
      reason: `Submission consists of only a few isolated words (${wordCount} words detected, below 20-word threshold). Band 1.0 assigned.`,
      wordCount,
    };
  }

  // 4. Repetitive single-word spam (Band 1.0)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')));
  if (wordCount >= 20 && uniqueWords.size <= 3) {
    return {
      isValid: false,
      isAbusiveOrUnderThreshold: true,
      assignedBand: 1.0,
      skillLevel: 'Non-user',
      reason: 'Repetitive single-word spam detected. Band 1.0 assigned.',
      wordCount,
    };
  }

  return {
    isValid: true,
    isAbusiveOrUnderThreshold: false,
    assignedBand: null,
    skillLevel: null,
    reason: '',
    wordCount,
  };
}

/**
 * Strict IELTS Writing Examiner according to official IDP IELTS Band Descriptors (Bands 0.0 through 9.0).
 * Evaluates candidate inputs with anti-abuse validation, word count penalties,
 * independent criteria scoring, and real mistake extraction.
 */
export async function gradeWritingSubmission({
  task_1_submission = '',
  task_2_submission = '',
  task_1_prompt = '',
  task_2_prompt = '',
  // Aliases supported
  task1Text = '',
  task2Text = '',
  task1Prompt = '',
  task2Prompt = '',
  studentId = null,
}) {
  const t1Text = (task_1_submission || task1Text || '').trim();
  const t2Text = (task_2_submission || task2Text || '').trim();
  const t1Prompt = (task_1_prompt || task1Prompt || '').trim() || 'Summarise the key trends in the data and make comparisons where relevant.';
  const t2Prompt = (task_2_prompt || task2Prompt || '').trim() || 'Discuss both views and give your opinion.';

  const t1Val = validateWritingInput(t1Text);
  const t2Val = validateWritingInput(t2Text);

  // If BOTH submissions fail basic validation (e.g. empty, spam, Russian, or < 20 words)
  if (!t1Val.isValid && !t2Val.isValid) {
    const t1Band = t1Val.assignedBand;
    const t2Band = t2Val.assignedBand;
    const overallBand = (t1Band === 0.0 && t2Band === 0.0) ? 0.0 : roundToIeltsBand((t1Band + 2 * t2Band) / 3);
    const overallSkillLevel = getIdpSkillLevel(overallBand);

    return {
      task_1: {
        word_count: t1Val.wordCount,
        scores: {
          ta: t1Band,
          cc: t1Band,
          lr: t1Band,
          gra: t1Band,
          band: t1Band,
        },
        skill_level: t1Val.skillLevel,
        feedback: t1Val.reason,
        mistakes: [],
        // Direct compatibility accessors
        ta: t1Band,
        cc: t1Band,
        lr: t1Band,
        gra: t1Band,
        band: t1Band,
      },
      task_2: {
        word_count: t2Val.wordCount,
        scores: {
          tr: t2Band,
          cc: t2Band,
          lr: t2Band,
          gra: t2Band,
          band: t2Band,
        },
        skill_level: t2Val.skillLevel,
        feedback: t2Val.reason,
        mistakes: [],
        // Direct compatibility accessors
        tr: t2Band,
        cc: t2Band,
        lr: t2Band,
        gra: t2Band,
        band: t2Band,
      },
      overall_writing_band: overallBand,
      overall_skill_level: overallSkillLevel,

      // Backwards-compatible mappings for existing UI
      task1_evaluation: {
        task_achievement: t1Band,
        coherence_cohesion: t1Band,
        lexical_resource: t1Band,
        grammatical_accuracy: t1Band,
        band: t1Band,
        skill_level: t1Val.skillLevel,
        comments: t1Val.reason,
      },
      task2_evaluation: {
        task_response: t2Band,
        coherence_cohesion: t2Band,
        lexical_resource: t2Band,
        grammatical_accuracy: t2Band,
        band: t2Band,
        skill_level: t2Val.skillLevel,
        comments: t2Val.reason,
      },
      highlighted_errors: [],
      feedback: `Submissions evaluated per official IDP criteria: Task 1: ${t1Val.reason} | Task 2: ${t2Val.reason}`,
    };
  }

  const prompt = `You are a certified senior British Council / IDP IELTS Academic Writing Examiner.
Evaluate the candidate's IELTS Academic Writing submissions strictly adhering to the official IDP IELTS Band Descriptors (Bands 0.0 to 9.0).

### OFFICIAL IDP IELTS CRITERIA & RULES:
1. BAND 0 & BAND 1 ENFORCEMENT:
   - If a candidate provided no text, empty input, or random key spam: assign Band 0.0, skill level: "Did not attempt the test".
   - If written in Russian, another non-English language, or only a few isolated words (< 20 words): assign Band 1.0, skill level: "Non-user".

2. WORD COUNT MINIMUMS & PENALTIES:
   - Task 1 requires a minimum of 150 words:
     * If word count < 150: Task Achievement (TA) MUST be penalized (capped at max Band 5.0).
     * If word count < 100: TA capped at max Band 4.0.
     * If word count < 50: TA capped at max Band 3.0.
   - Task 2 requires a minimum of 250 words:
     * If word count < 250: Task Response (TR) MUST be penalized (capped at max Band 5.0).
     * If word count < 180: TR capped at max Band 4.0.
     * If word count < 100: TR capped at max Band 3.0.

3. SCORE CALCULATION & ROUNDING:
   - Task 1 Band = roundToIeltsBand((TA + CC + LR + GRA) / 4)
   - Task 2 Band = roundToIeltsBand((TR + CC + LR + GRA) / 4)
   - Overall Writing Band = roundToIeltsBand((Task 1 Band + 2 * Task 2 Band) / 3)
   - All sub-criteria and band scores must be in increments of 0.5 (0.0, 1.0, 1.5, 2.0 ... 9.0).

4. IDP SKILL LEVEL MAPPING:
   - 9.0: "Expert user"
   - 8.0 - 8.5: "Very good user"
   - 7.0 - 7.5: "Good user"
   - 6.0 - 6.5: "Competent user"
   - 5.0 - 5.5: "Modest user"
   - 4.0 - 4.5: "Limited user"
   - 3.0 - 3.5: "Extremely limited user"
   - 2.0 - 2.5: "Intermittent user"
   - 1.0: "Non-user"
   - 0.0: "Did not attempt the test"

5. MISTAKE EXTRACTION:
   - Extract authentic errors from the student's text.
   - Each mistake must include "original", "correction", and "explanation".

---
### CANDIDATE SUBMISSION DETAILS:

#### TASK 1:
- Prompt:
${t1Prompt}
- Validation Status: ${t1Val.isValid ? 'Valid text sample' : `${t1Val.skillLevel} (Band ${t1Val.assignedBand}) - ${t1Val.reason}`}
- Candidate Text (${t1Val.wordCount} words):
"""
${t1Text || '[Candidate left Task 1 blank]'}
"""

#### TASK 2:
- Prompt:
${t2Prompt}
- Validation Status: ${t2Val.isValid ? 'Valid text sample' : `${t2Val.skillLevel} (Band ${t2Val.assignedBand}) - ${t2Val.reason}`}
- Candidate Text (${t2Val.wordCount} words):
"""
${t2Text || '[Candidate left Task 2 blank]'}
"""

---
### REQUIRED OUTPUT SCHEMA:
Return a STRICT, valid JSON object with NO markdown ticks, following this exact schema:
{
  "task_1": {
    "word_count": ${t1Val.wordCount},
    "scores": {
      "ta": 6.0,
      "cc": 6.0,
      "lr": 6.0,
      "gra": 6.0,
      "band": 6.0
    },
    "skill_level": "Competent user",
    "feedback": "Examiner evaluation covering key trends overview, data details, and grammar...",
    "mistakes": [
      {
        "original": "verbatim error snippet from text",
        "correction": "corrected phrasing",
        "explanation": "grammatical or vocabulary rule explanation"
      }
    ]
  },
  "task_2": {
    "word_count": ${t2Val.wordCount},
    "scores": {
      "tr": 6.5,
      "cc": 6.5,
      "lr": 6.5,
      "gra": 6.5,
      "band": 6.5
    },
    "skill_level": "Competent user",
    "feedback": "Examiner evaluation covering position, argument development, structure...",
    "mistakes": [
      {
        "original": "verbatim error snippet from text",
        "correction": "corrected phrasing",
        "explanation": "grammatical or vocabulary rule explanation"
      }
    ]
  },
  "overall_writing_band": 6.5,
  "overall_skill_level": "Competent user"
}`;

  console.log(`[Strict AI Examiner] Evaluating writing submission for student ${studentId || 'Candidate'}...`);

  const { response, modelUsed } = await callGeminiGenerate({
    contents: [{ text: prompt }],
    config: {
      temperature: 0.15,
    },
  });

  const parsed = JSON.parse(response.text || '{}');

  // Task 1 computation
  let t1_ta, t1_cc, t1_lr, t1_gra, t1_band, t1_skill_level, t1_feedback, t1_mistakes;
  if (!t1Val.isValid) {
    t1_ta = t1Val.assignedBand;
    t1_cc = t1Val.assignedBand;
    t1_lr = t1Val.assignedBand;
    t1_gra = t1Val.assignedBand;
    t1_band = t1Val.assignedBand;
    t1_skill_level = t1Val.skillLevel;
    t1_feedback = t1Val.reason;
    t1_mistakes = [];
  } else {
    t1_ta = roundToIeltsBand(parsed.task_1?.scores?.ta ?? parsed.task_1?.ta ?? 5.0);
    t1_cc = roundToIeltsBand(parsed.task_1?.scores?.cc ?? parsed.task_1?.cc ?? 5.0);
    t1_lr = roundToIeltsBand(parsed.task_1?.scores?.lr ?? parsed.task_1?.lr ?? 5.0);
    t1_gra = roundToIeltsBand(parsed.task_1?.scores?.gra ?? parsed.task_1?.gra ?? 5.0);

    // Strict word count penalty enforcement for Task 1 (minimum 150 words)
    if (t1Val.wordCount < 50) {
      t1_ta = Math.min(t1_ta, 3.0);
    } else if (t1Val.wordCount < 100) {
      t1_ta = Math.min(t1_ta, 4.0);
    } else if (t1Val.wordCount < 150) {
      t1_ta = Math.min(t1_ta, 5.0);
    }

    t1_band = roundToIeltsBand((t1_ta + t1_cc + t1_lr + t1_gra) / 4);
    t1_skill_level = getIdpSkillLevel(t1_band);
    t1_feedback = parsed.task_1?.feedback || `Task 1 evaluated at Band ${t1_band} (${t1_skill_level}). Word count: ${t1Val.wordCount} words.`;
    t1_mistakes = (Array.isArray(parsed.task_1?.mistakes) ? parsed.task_1.mistakes : []).map((m) => ({
      original: m.original || '',
      correction: m.correction || '',
      explanation: m.explanation || m.reason || '',
      reason: m.explanation || m.reason || '',
    }));
  }

  // Task 2 computation
  let t2_tr, t2_cc, t2_lr, t2_gra, t2_band, t2_skill_level, t2_feedback, t2_mistakes;
  if (!t2Val.isValid) {
    t2_tr = t2Val.assignedBand;
    t2_cc = t2Val.assignedBand;
    t2_lr = t2Val.assignedBand;
    t2_gra = t2Val.assignedBand;
    t2_band = t2Val.assignedBand;
    t2_skill_level = t2Val.skillLevel;
    t2_feedback = t2Val.reason;
    t2_mistakes = [];
  } else {
    t2_tr = roundToIeltsBand(parsed.task_2?.scores?.tr ?? parsed.task_2?.tr ?? 5.0);
    t2_cc = roundToIeltsBand(parsed.task_2?.scores?.cc ?? parsed.task_2?.cc ?? 5.0);
    t2_lr = roundToIeltsBand(parsed.task_2?.scores?.lr ?? parsed.task_2?.lr ?? 5.0);
    t2_gra = roundToIeltsBand(parsed.task_2?.scores?.gra ?? parsed.task_2?.gra ?? 5.0);

    // Strict word count penalty enforcement for Task 2 (minimum 250 words)
    if (t2Val.wordCount < 100) {
      t2_tr = Math.min(t2_tr, 3.0);
    } else if (t2Val.wordCount < 180) {
      t2_tr = Math.min(t2_tr, 4.0);
    } else if (t2Val.wordCount < 250) {
      t2_tr = Math.min(t2_tr, 5.0);
    }

    t2_band = roundToIeltsBand((t2_tr + t2_cc + t2_lr + t2_gra) / 4);
    t2_skill_level = getIdpSkillLevel(t2_band);
    t2_feedback = parsed.task_2?.feedback || `Task 2 evaluated at Band ${t2_band} (${t2_skill_level}). Word count: ${t2Val.wordCount} words.`;
    t2_mistakes = (Array.isArray(parsed.task_2?.mistakes) ? parsed.task_2.mistakes : []).map((m) => ({
      original: m.original || '',
      correction: m.correction || '',
      explanation: m.explanation || m.reason || '',
      reason: m.explanation || m.reason || '',
    }));
  }

  // Overall band computation
  const overallBand = (t1_band === 0.0 && t2_band === 0.0)
    ? 0.0
    : roundToIeltsBand((t1_band + 2 * t2_band) / 3);
  const overallSkillLevel = getIdpSkillLevel(overallBand);

  const formattedResult = {
    task_1: {
      word_count: t1Val.wordCount,
      scores: {
        ta: t1_ta,
        cc: t1_cc,
        lr: t1_lr,
        gra: t1_gra,
        band: t1_band,
      },
      skill_level: t1_skill_level,
      feedback: t1_feedback,
      mistakes: t1_mistakes,
      // Compatibility fields
      ta: t1_ta,
      cc: t1_cc,
      lr: t1_lr,
      gra: t1_gra,
      band: t1_band,
    },
    task_2: {
      word_count: t2Val.wordCount,
      scores: {
        tr: t2_tr,
        cc: t2_cc,
        lr: t2_lr,
        gra: t2_gra,
        band: t2_band,
      },
      skill_level: t2_skill_level,
      feedback: t2_feedback,
      mistakes: t2_mistakes,
      // Compatibility fields
      tr: t2_tr,
      cc: t2_cc,
      lr: t2_lr,
      gra: t2_gra,
      band: t2_band,
    },
    overall_writing_band: overallBand,
    overall_skill_level: overallSkillLevel,
    model_used: modelUsed,
    evaluated_at: new Date().toISOString(),

    // Backwards-compatible mappings for existing UI
    task1_evaluation: {
      task_achievement: t1_ta,
      coherence_cohesion: t1_cc,
      lexical_resource: t1_lr,
      grammatical_accuracy: t1_gra,
      band: t1_band,
      skill_level: t1_skill_level,
      comments: t1_feedback,
    },
    task2_evaluation: {
      task_response: t2_tr,
      coherence_cohesion: t2_cc,
      lexical_resource: t2_lr,
      grammatical_accuracy: t2_gra,
      band: t2_band,
      skill_level: t2_skill_level,
      comments: t2_feedback,
    },
    highlighted_errors: [
      ...t1_mistakes.map((m) => ({ task: 1, ...m })),
      ...t2_mistakes.map((m) => ({ task: 2, ...m })),
    ],
    feedback: `${t1_feedback}\n\n${t2_feedback}`.trim(),
  };

  return formattedResult;
}
