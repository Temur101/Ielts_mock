/**
 * Vite Server Plugin providing backend API routes for Google Gemini AI:
 * - POST /api/exams/parse-pdf  (Streamlined 3-PDF parser + Supabase persistence)
 * - POST /api/exams/grade-writing (Strict IELTS Examiner)
 */

import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  parseExamPdf,
  parseThreePartExamPdf,
  gradeWritingSubmission,
  parseReadingPdf,
  parseListeningPdf,
  parseWritingPdf,
  parseReadingPdfs,
  parseListeningPdfs,
  getGeminiApiKeys,
  rotateGeminiApiKey,
  getErrorStatusCode,
  robustJsonRepair,
  READING_PARSER_CONFIG,
  LISTENING_PARSER_CONFIG,
  WRITING_PARSER_CONFIG,
  READING_EXAM_SCHEMA,
  LISTENING_EXAM_SCHEMA,
  WRITING_EXAM_SCHEMA,
} from './gemini-service.js';
import { persistExamAndSections } from '../supabase.js';

// Fallback Model Pool: gemini-3.6-flash -> gemini-3.7-flash -> gemini-3.5-flash-lite
const FALLBACK_MODEL_POOL = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function is503OrUnavailable(err) {
  if (!err) return false;
  const msg = String(err.message || err.error || '').toLowerCase();
  const status = err.status || err.statusCode || (typeof getErrorStatusCode === 'function' ? getErrorStatusCode(err) : null);
  return (
    status === 503 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    String(err.code || '').toUpperCase() === 'UNAVAILABLE'
  );
}

async function extractRawTextFromPdfBuffer(buffer) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter(item => 'str' in item)
        .map(item => item.str)
        .join(' ');
      fullText += `\n\n--- PAGE ${pageNum} ---\n` + pageText;
    }
    return fullText.trim();
  } catch (err) {
    console.warn('[api-plugin] extractRawTextFromPdfBuffer failed:', err.message);
    return '';
  }
}

async function executeGeminiWithModelPool({
  contents,
  config = {},
  systemInstruction = null,
  modelPool = FALLBACK_MODEL_POOL,
}) {
  ensureEnvLoaded();
  const allKeys = getGeminiApiKeys();
  if (allKeys.length === 0) {
    throw new Error('GEMINI_API_KEY is required. Please set GEMINI_API_KEY in your environment.');
  }

  let lastError = null;

  for (let mIdx = 0; mIdx < modelPool.length; mIdx++) {
    const currentModel = modelPool[mIdx];

    for (let kIdx = 0; kIdx < allKeys.length; kIdx++) {
      const currentKey = allKeys[kIdx];
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const hasAlternativeKey = kIdx < allKeys.length - 1;

      const unifiedConfig = {
        temperature: 0.1,
        responseMimeType: 'application/json',
        maxOutputTokens: 32768,
        ...config,
        ...(systemInstruction ? { systemInstruction } : {}),
      };

      try {
        console.log(`[api-plugin] Calling Gemini model '${currentModel}' (Model ${mIdx + 1}/${modelPool.length}, Key #${kIdx + 1}/${allKeys.length})...`);
        const response = await ai.models.generateContent({
          model: currentModel,
          contents,
          config: unifiedConfig,
        });

        return { response, modelUsed: currentModel, apiKeyUsed: currentKey };
      } catch (err) {
        lastError = err;
        const statusCode = err.status || err.statusCode || (typeof getErrorStatusCode === 'function' ? getErrorStatusCode(err) : null);
        const is503 = is503OrUnavailable(err);
        const isRateLimit = statusCode === 429 || (err.message || '').includes('429') || (err.message || '').includes('RESOURCE_EXHAUSTED');

        console.warn(`[api-plugin] Model '${currentModel}' failed on key #${kIdx + 1} (Status: ${statusCode || 'N/A'}: ${err.message})`);

        if (is503) {
          console.warn(`[api-plugin] HTTP 503 / UNAVAILABLE / High demand on model '${currentModel}'. Adding 2.5s delay before attempting next fallback...`);
          await sleep(2500);
          if (hasAlternativeKey) {
            continue;
          } else {
            break;
          }
        }

        if (isRateLimit && hasAlternativeKey) {
          console.warn(`[api-plugin] HTTP 429 Rate limit on key #${kIdx + 1}. Rotating key immediately...`);
          rotateGeminiApiKey();
          continue;
        }

        if (!hasAlternativeKey) {
          break;
        }
      }
    }

    if (mIdx < modelPool.length - 1 && is503OrUnavailable(lastError)) {
      console.warn(`[api-plugin] Model '${currentModel}' exhausted with 503. Pausing 2.5s before fallback model '${modelPool[mIdx + 1]}'...`);
      await sleep(2500);
    }
  }

  throw lastError || new Error(`All models in pool [${modelPool.join(' -> ')}] failed.`);
}

/**
 * Dynamic Parity Validation for Exam Sections (Reading / Listening).
 * Compares question numbers found in questions array against expected keys in answer_keys.
 * Eliminates duplicate question numbers, enforces strictly ascending sort order,
 * and reports any missing numbers (gaps).
 * 
 * @param {Object} parsedData - The parsed section data
 * @returns {Object} parityReport - Parity report containing expected, found, missing, and completion status
 */
export function validateSectionParity(parsedData) {
  if (!parsedData || typeof parsedData !== 'object') {
    return {
      expectedCount: 0,
      foundCount: 0,
      expectedNumbers: [],
      foundNumbers: [],
      missingNumbers: [],
      isComplete: true,
    };
  }

  // 1. Dynamic extraction of expected numbers from answer_keys / answers
  const rawKeys = parsedData.answer_keys || parsedData.answerKeys || parsedData.answers || {};
  let expectedNums = [];

  if (Array.isArray(rawKeys)) {
    expectedNums = rawKeys
      .map((k) => parseInt(k?.questionNumber ?? k?.q_num ?? k?.id ?? k, 10))
      .filter((n) => !isNaN(n) && n > 0);
  } else if (rawKeys && typeof rawKeys === 'object') {
    expectedNums = Object.keys(rawKeys)
      .map((k) => parseInt(k, 10))
      .filter((n) => !isNaN(n) && n > 0);
  }

  // If answer_keys is empty at root, inspect nested sections if available
  if (expectedNums.length === 0 && Array.isArray(parsedData.sections)) {
    const secNums = [];
    for (const sec of parsedData.sections) {
      if (Array.isArray(sec?.answer_keys)) {
        for (const ak of sec.answer_keys) {
          const n = parseInt(ak?.questionNumber ?? ak?.q_num ?? ak, 10);
          if (!isNaN(n) && n > 0) secNums.push(n);
        }
      } else if (sec?.answer_keys && typeof sec.answer_keys === 'object') {
        for (const k of Object.keys(sec.answer_keys)) {
          const n = parseInt(k, 10);
          if (!isNaN(n) && n > 0) secNums.push(n);
        }
      }
    }
    if (secNums.length > 0) {
      expectedNums = secNums;
    }
  }

  expectedNums = Array.from(new Set(expectedNums)).sort((a, b) => a - b);

  // 2. Gather all questions (root and nested passages/parts/sections)
  const allQuestionCandidates = [];
  if (Array.isArray(parsedData.questions)) {
    allQuestionCandidates.push(...parsedData.questions);
  }
  if (Array.isArray(parsedData.passages)) {
    for (const p of parsedData.passages) {
      if (Array.isArray(p?.questions)) allQuestionCandidates.push(...p.questions);
    }
  }
  if (Array.isArray(parsedData.parts)) {
    for (const p of parsedData.parts) {
      if (Array.isArray(p?.questions)) allQuestionCandidates.push(...p.questions);
    }
  } else if (parsedData.parts && typeof parsedData.parts === 'object') {
    for (const p of Object.values(parsedData.parts)) {
      if (Array.isArray(p?.questions)) allQuestionCandidates.push(...p.questions);
    }
  }
  if (Array.isArray(parsedData.sections)) {
    for (const s of parsedData.sections) {
      if (Array.isArray(s?.questions)) allQuestionCandidates.push(...s.questions);
    }
  }

  // Deduplicate and strictly sort questions by questionNumber
  const questionMap = new Map();
  for (const q of allQuestionCandidates) {
    const num = parseInt(q?.questionNumber ?? q?.q_num ?? q?.id, 10);
    if (!isNaN(num) && num > 0) {
      if (!questionMap.has(num)) {
        questionMap.set(num, {
          ...q,
          questionNumber: num,
        });
      } else {
        const existing = questionMap.get(num);
        questionMap.set(num, {
          ...existing,
          ...q,
          questionNumber: num,
          instruction: q.instruction || existing.instruction || '',
          prompt: q.prompt || existing.prompt || `Question ${num}`,
          options: (Array.isArray(q.options) && q.options.length > 0) ? q.options : existing.options,
          reference_box: q.reference_box || existing.reference_box || null,
        });
      }
    }
  }

  const dedupedQuestions = Array.from(questionMap.values()).sort(
    (a, b) => a.questionNumber - b.questionNumber
  );

  // Update parsedData.questions with deduplicated, strictly sorted questions
  if (Array.isArray(parsedData.questions) || dedupedQuestions.length > 0) {
    parsedData.questions = dedupedQuestions;
  }

  // 3. Find missing numbers
  const foundNums = new Set(dedupedQuestions.map((q) => q.questionNumber));
  const missingNumbers = expectedNums.filter((num) => !foundNums.has(num));

  const parityReport = {
    expectedCount: expectedNums.length,
    foundCount: foundNums.size,
    expectedNumbers: expectedNums,
    foundNumbers: Array.from(foundNums).sort((a, b) => a - b),
    missingNumbers,
    isComplete: missingNumbers.length === 0,
  };

  return parityReport;
}

/**
 * Targeted gap-fill query to Gemini for specific missing question numbers.
 * Dynamically queries the model with PDF context and reference answers from answer_keys.
 * Strictly limited to 1 attempt to avoid loops or quota exhaustion.
 * 
 * @param {Object} options
 * @param {Array|Object} options.files - Collected PDF file(s) [{ buffer, fileName }] or buffer
 * @param {string} options.sectionType - 'reading' or 'listening'
 * @param {number[]} options.missingNumbers - Array of missing question numbers (e.g. [15, 16, 17])
 * @param {Object} options.answerKeys - Object or map of answer keys
 * @param {Array} options.existingQuestions - Already parsed questions to infer context / section
 * @returns {Promise<Array>} Array of recovered question objects
 */
export async function recoverMissingQuestions({
  files,
  sectionType = 'reading',
  missingNumbers = [],
  answerKeys = {},
  existingQuestions = [],
}) {
  if (!Array.isArray(missingNumbers) || missingNumbers.length === 0) {
    return [];
  }

  // 1. Prepare PDF inline data parts
  const fileList = Array.isArray(files) ? files : (files ? [files] : []);
  const pdfParts = [];
  for (let i = 0; i < fileList.length; i++) {
    const item = fileList[i];
    const buf = Buffer.isBuffer(item) ? item : (item?.buffer || item?.fileBuffer);
    if (buf && Buffer.isBuffer(buf)) {
      pdfParts.push({
        inlineData: {
          data: buf.toString('base64'),
          mimeType: 'application/pdf',
        },
      });
    }
  }

  if (pdfParts.length === 0) {
    console.warn('[recoverMissingQuestions] No valid PDF buffers provided for targeted gap-fill.');
    return [];
  }

  // 2. Build dynamic reference context mapping for the missing numbers
  const missingNumsFormatted = missingNumbers.join(', ');
  const answerContextLines = missingNumbers
    .map((num) => {
      const ans = answerKeys[String(num)] ?? answerKeys[num] ?? 'N/A';
      return `- Question ${num}: Official Answer Key = "${ans}"`;
    })
    .join('\n');

  const sectionLabel = String(sectionType).toLowerCase() === 'listening' ? 'Listening' : 'Reading';

  const systemInstruction = `You are a specialist IELTS Exam Extractor.
Your specific task is targeted gap recovery: extracting ONLY the specific missing questions that were omitted during initial document parsing.
Return valid JSON with a single top-level key "recovered_questions", containing an array of question objects.
Each question object MUST include:
- "questionNumber" (integer, exact question number)
- "partId" (integer, 1, 2, 3, or 4 for Listening) or "passageId" (integer, 1, 2, or 3 for Reading)
- "type" (string, e.g. "MULTIPLE_CHOICE", "FILL_BLANK", "MATCHING", "MAP_LABELING", "FLOW_CHART", "TABLE_COMPLETION", "SUMMARY_COMPLETION", "TRUE_FALSE_NOT_GIVEN")
- "instruction" (string, instructions for this question or group)
- "prompt" (string, full question text/prompt)
- "title" (string, title or heading if part of a set)
- "subheading" (string, optional)
- "options" (array of strings, e.g. ["A", "B", "C"] or full option strings)
- "reference_box" (array of strings or null, if question uses a list of options/features/researchers/map labels)
- "summary_template" (string or null, if question is part of notes/summary/flow-chart/table template)`;

  const promptText = `URGENT TARGETED GAP-FILL REQUEST for IELTS ${sectionLabel} Section.

The previous extraction missed the following question number(s): [${missingNumsFormatted}].

Here are the official Answer Key entries for these missing question(s) to locate them in the PDF:
${answerContextLines}

Please examine the attached PDF document(s) carefully, locate the exact text, instructions, prompts, options, and reference boxes for questions [${missingNumsFormatted}], and extract them.

Return ONLY a JSON object with this exact structure:
{
  "recovered_questions": [
    {
      "questionNumber": ${missingNumbers[0]},
      "partId": 1,
      "passageId": 1,
      "type": "MATCHING",
      "instruction": "...",
      "prompt": "...",
      "title": "...",
      "subheading": "...",
      "options": ["A ...", "B ..."],
      "reference_box": ["A ...", "B ..."],
      "summary_template": "..."
    }
  ]
}`;

  console.log(`[recoverMissingQuestions] Requesting targeted gap-fill (attempt 1/1) for ${missingNumbers.length} missing question(s): [${missingNumsFormatted}] from ${pdfParts.length} PDF(s)...`);

  const RECOVER_SCHEMA = {
    type: 'OBJECT',
    properties: {
      recovered_questions: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            questionNumber: { type: 'INTEGER' },
            partId: { type: 'INTEGER' },
            passageId: { type: 'INTEGER' },
            type: { type: 'STRING' },
            instruction: { type: 'STRING' },
            prompt: { type: 'STRING' },
            title: { type: 'STRING' },
            subheading: { type: 'STRING' },
            options: { type: 'ARRAY', items: { type: 'STRING' } },
            reference_box: { type: 'ARRAY', items: { type: 'STRING' } },
            summary_template: { type: 'STRING' },
          },
          required: ['questionNumber'],
        },
      },
    },
    required: ['recovered_questions'],
  };

  const { response, modelUsed } = await executeGeminiWithModelPool({
    contents: [
      {
        role: 'user',
        parts: [...pdfParts, { text: promptText }],
      },
    ],
    config: {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseSchema: RECOVER_SCHEMA,
    },
    systemInstruction,
    modelPool: ['gemini-3.7-flash', 'gemini-3.5-flash-lite'],
  });

  const parsedJson = robustJsonRepair(response?.text || '{}');
  const rawRecovered = Array.isArray(parsedJson?.recovered_questions)
    ? parsedJson.recovered_questions
    : (Array.isArray(parsedJson?.questions) ? parsedJson.questions : (Array.isArray(parsedJson) ? parsedJson : []));

  // Normalize recovered questions
  const normalizedRecovered = rawRecovered
    .map((q) => {
      const qNum = parseInt(q?.questionNumber ?? q?.q_num ?? q?.id, 10);
      if (isNaN(qNum) || qNum <= 0) return null;

      let assignedPart = q.partId || q.passageId;
      if (!assignedPart && Array.isArray(existingQuestions) && existingQuestions.length > 0) {
        const sorted = [...existingQuestions].sort(
          (a, b) => Math.abs(a.questionNumber - qNum) - Math.abs(b.questionNumber - qNum)
        );
        if (sorted[0]) {
          assignedPart = sorted[0].partId || sorted[0].passageId || 1;
        }
      }
      assignedPart = assignedPart || 1;

      const ansKey = answerKeys[String(qNum)] ?? answerKeys[qNum] ?? '';

      return {
        id: sectionLabel === 'Listening' ? `lq-${qNum}` : `q-${qNum}`,
        questionNumber: qNum,
        partId: assignedPart,
        passageId: assignedPart,
        type: q.type || 'FILL_BLANK',
        instruction: q.instruction || '',
        title: q.title || '',
        subheading: q.subheading || '',
        context_bullets: Array.isArray(q.context_bullets) ? q.context_bullets : [],
        prompt: q.prompt || `Question ${qNum}`,
        text: q.prompt || `Question ${qNum}`,
        options: Array.isArray(q.options) ? q.options : [],
        reference_box: q.reference_box || null,
        referenceBox: q.reference_box || null,
        summary_template: q.summary_template || '',
        acceptedAnswers: ansKey ? [ansKey] : [],
        _recovered: true,
        _model: modelUsed,
      };
    })
    .filter(Boolean);

  console.log(`[recoverMissingQuestions] Successfully recovered ${normalizedRecovered.length}/${missingNumbers.length} question(s) using model '${modelUsed}'.`);
  return normalizedRecovered;
}

function normalizeReadingParsed(parsed, fileName = 'Reading.pdf') {
  const unifiedKeys = {};
  const flattenedQuestions = [];
  const formattedPassages = [];
  const partsMap = {};

  const rawPassages = Array.isArray(parsed?.passages) ? parsed.passages : [];
  for (let partIdx = 1; partIdx <= 3; partIdx++) {
    if (!rawPassages.some(p => Number(p.part || p.id) === partIdx)) {
      rawPassages.push({
        part: partIdx,
        title: `Reading Passage ${partIdx}`,
        text: `Passage ${partIdx} content from ${fileName}`,
        paragraphs: [],
        questions: [],
      });
    }
  }
  rawPassages.sort((a, b) => Number(a.part || a.id) - Number(b.part || b.id));

  rawPassages.forEach((p, idx) => {
    const partNum = Number(p.part || idx + 1);
    const pQNums = (Array.isArray(p.questions) ? p.questions : [])
      .map(q => Number(q.q_num || q.questionNumber))
      .filter(n => !isNaN(n) && n > 0);
    const minQ = pQNums.length > 0 ? Math.min(...pQNums) : null;
    const maxQ = pQNums.length > 0 ? Math.max(...pQNums) : null;
    const qRange = (minQ !== null && maxQ !== null)
      ? (minQ === maxQ ? `Question ${minQ}` : `Questions ${minQ}–${maxQ}`)
      : (p.question_range || '');
    const passageRefBox = p?.reference_box || p?.referenceBox || parsed?.reference_box || null;
    const rawContent = (p.content || p.passage_text || p.passageText || p.text || '').trim();

    const paragraphs = Array.isArray(p.paragraphs) && p.paragraphs.length > 0
      ? p.paragraphs.map(pr => ({
          label: pr.label ? String(pr.label).trim().toUpperCase() : '',
          text: (pr.text || pr.content || '').trim(),
          content: (pr.text || pr.content || '').trim(),
        }))
      : (rawContent ? rawContent.split(/\n\s*\n/).map((s) => ({ label: '', text: s.trim(), content: s.trim() })) : []);

    const pItem = {
      id: partNum,
      part: partNum,
      title: p.title || `Passage ${partNum}`,
      subtitle: p.subtitle || '',
      content: rawContent,
      passage_text: rawContent,
      passageText: rawContent,
      text: rawContent,
      paragraphs,
      page_content_html: p.page_content_html || '',
      notes_template: p.notes_template || '',
      pdf_name: fileName,
      question_range: qRange,
      reference_box: passageRefBox,
      referenceBox: passageRefBox,
      questions: p.questions || [],
    };
    formattedPassages.push(pItem);
    partsMap[`part${partNum}`] = pItem;

    if (Array.isArray(p.questions)) {
      p.questions.forEach((q) => {
        const qNum = Number(q.q_num || q.questionNumber);
        if (qNum) {
          const ansStr = String(q.correct_answer ?? q.answer ?? '').trim();
          if (ansStr) unifiedKeys[String(qNum)] = ansStr;

          flattenedQuestions.push({
            id: `q-${qNum}`,
            questionNumber: qNum,
            passageId: partNum,
            type: q.type || 'FILL_BLANK',
            instruction: q.instruction || '',
            title: q.title || '',
            subheading: q.subheading || '',
            context_bullets: Array.isArray(q.context_bullets) ? q.context_bullets : [],
            prompt: q.prompt || `Question ${qNum}`,
            text: q.prompt || `Question ${qNum}`,
            options: Array.isArray(q.options) ? q.options : [],
            reference_box: q.reference_box || passageRefBox,
            referenceBox: q.reference_box || passageRefBox,
            summary_template: q.summary_template || p.summary_template || '',
            acceptedAnswers: ansStr ? [ansStr] : [],
          });
        }
      });
    }
  });

  flattenedQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

  return {
    ...parsed,
    passages: formattedPassages,
    parts: partsMap,
    questions: flattenedQuestions,
    answer_keys: unifiedKeys,
    answerKeys: unifiedKeys,
    sections: formattedPassages.map(p => {
      const passageQNumSet = new Set(
        (Array.isArray(p.questions) && p.questions.length > 0 ? p.questions : flattenedQuestions.filter(q => q.passageId === p.id))
          .map(q => Number(q.q_num || q.questionNumber))
      );
      return {
        part: p.id,
        id: p.id,
        title: p.title,
        content: p.content,
        passage_text: p.content,
        passageText: p.content,
        paragraphs: p.paragraphs,
        question_range: p.question_range,
        answer_keys: Object.entries(unifiedKeys)
          .filter(([k]) => passageQNumSet.has(Number(k)))
          .map(([k, v]) => ({ questionNumber: Number(k), answer: v })),
      };
    }),
  };
}

function normalizeListeningParsed(parsed, fileName = 'Listening.pdf') {
  const unifiedKeys = {};
  const flattenedQuestions = [];
  const formattedParts = [];

  const rawParts = Array.isArray(parsed?.parts) ? parsed.parts : [];
  for (let partIdx = 1; partIdx <= 4; partIdx++) {
    if (!rawParts.some(p => Number(p.part || p.partId || p.id) === partIdx)) {
      rawParts.push({
        part: partIdx,
        partId: partIdx,
        title: `Part ${partIdx}`,
        instruction: '',
        questions: [],
      });
    }
  }
  rawParts.sort((a, b) => Number(a.part || a.partId || a.id) - Number(b.part || b.partId || b.id));

  rawParts.forEach((p, idx) => {
    const partNum = Number(p.part || p.partId || idx + 1);
    const pQNums = (Array.isArray(p.questions) ? p.questions : [])
      .map(q => Number(q.q_num || q.questionNumber))
      .filter(n => !isNaN(n) && n > 0);
    const minQ = pQNums.length > 0 ? Math.min(...pQNums) : null;
    const maxQ = pQNums.length > 0 ? Math.max(...pQNums) : null;
    const qRange = (minQ !== null && maxQ !== null)
      ? (minQ === maxQ ? `Question ${minQ}` : `Questions ${minQ}–${maxQ}`)
      : (p.question_range || p.questionRange || '');
    const partRefBox = Array.isArray(p.reference_box) ? p.reference_box : null;

    formattedParts.push({
      partId: partNum,
      part: partNum,
      title: p.title || `Part ${partNum}`,
      audio_track_index: Number(p.audio_track_index || partNum),
      instruction: p.instruction || '',
      notes_template: p.notes_template || '',
      question_range: qRange,
      reference_box: partRefBox,
      referenceBox: partRefBox,
      questions: p.questions || [],
    });

    if (Array.isArray(p.questions)) {
      p.questions.forEach((q) => {
        const qNum = Number(q.q_num || q.questionNumber);
        if (qNum) {
          const ansStr = String(q.correct_answer ?? q.answer ?? '').trim();
          if (ansStr) unifiedKeys[String(qNum)] = ansStr;

          flattenedQuestions.push({
            id: `lq-${qNum}`,
            questionNumber: qNum,
            partId: partNum,
            type: q.type || (partRefBox ? 'MATCHING' : 'FILL_BLANK'),
            instruction: q.instruction || p.instruction || '',
            title: q.title || '',
            subheading: q.subheading || '',
            context_bullets: Array.isArray(q.context_bullets) ? q.context_bullets : [],
            prompt: q.prompt || `Question ${qNum}`,
            text: q.prompt || `Question ${qNum}`,
            options: Array.isArray(q.options) ? q.options : [],
            reference_box: q.reference_box || partRefBox,
            referenceBox: q.reference_box || partRefBox,
            summary_template: q.summary_template || q.notes_template || p.notes_template || '',
            notes_template: q.notes_template || q.summary_template || p.notes_template || '',
            acceptedAnswers: ansStr ? [ansStr] : [],
          });
        }
      });
    }
  });

  flattenedQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

  return {
    ...parsed,
    parts: formattedParts,
    questions: flattenedQuestions,
    answer_keys: unifiedKeys,
    answerKeys: unifiedKeys,
    sections: formattedParts.map(p => {
      const partQNumSet = new Set(
        (Array.isArray(p.questions) && p.questions.length > 0 ? p.questions : flattenedQuestions.filter(q => q.partId === p.partId))
          .map(q => Number(q.q_num || q.questionNumber))
      );
      return {
        part: p.partId,
        id: p.partId,
        title: p.title,
        notes_template: p.notes_template || '',
        page_content_html: p.page_content_html || '',
        question_range: p.question_range,
        answer_keys: Object.entries(unifiedKeys)
          .filter(([k]) => partQNumSet.has(Number(k)))
          .map(([k, v]) => ({ questionNumber: Number(k), answer: v })),
      };
    }),
  };
}

async function resilientParseReading(collectedFiles) {
  try {
    return await parseReadingPdfs({ files: collectedFiles });
  } catch (visionErr) {
    if (!is503OrUnavailable(visionErr)) {
      throw visionErr;
    }

    console.warn('[api-plugin] Reading PDF vision/base64 failed with 503 (High demand). Falling back to passing raw extracted text directly to Gemini...');
    await sleep(2500);

    const textBlocks = [];
    for (let i = 0; i < collectedFiles.length; i++) {
      const f = collectedFiles[i];
      const text = await extractRawTextFromPdfBuffer(f.buffer);
      if (text) {
        textBlocks.push(`=== READING BOOKLET ${i + 1}: ${f.fileName} ===\n${text}`);
      }
    }

    const rawTextCombined = textBlocks.join('\n\n');
    if (!rawTextCombined.trim()) {
      throw visionErr;
    }

    const textPrompt = `Extract the full Cambridge IELTS Reading exam from the text below.
Follow all rules defined in systemInstruction:
1. Extract all 3 reading passages with independent texts and titles into "passages".
2. Group all questions under their respective passages exactly as structured in the booklet.
3. Extract all 40 answers from the official Answer Key.

--- EXTRACTED RAW READING TEXT ---
${rawTextCombined}`;

    const { response, modelUsed } = await executeGeminiWithModelPool({
      contents: [
        {
          role: 'user',
          parts: [{ text: textPrompt }],
        },
      ],
      config: {
        ...READING_PARSER_CONFIG.config,
        maxOutputTokens: 32768,
        responseSchema: READING_EXAM_SCHEMA,
      },
      systemInstruction: READING_PARSER_CONFIG.systemInstruction,
      modelPool: FALLBACK_MODEL_POOL,
    });

    const parsed = robustJsonRepair(response.text || '{}');
    parsed.model_used = `${modelUsed} (raw-text-fallback)`;
    parsed.file_name = collectedFiles.map(f => f.fileName).join(', ');
    return normalizeReadingParsed(parsed, parsed.file_name);
  }
}

async function resilientParseListening(collectedFiles) {
  try {
    return await parseListeningPdfs({ files: collectedFiles });
  } catch (err) {
    if (!is503OrUnavailable(err)) throw err;
    console.warn('[api-plugin] Listening PDF parsing hit 503 / High Demand. Pausing 2.5s before retrying with fallback model pool...');
    await sleep(2500);

    const fileList = collectedFiles.map((f, i) => ({
      buffer: f.buffer || f.fileBuffer,
      fileName: f.fileName || `Listening_${i + 1}.pdf`,
    }));
    const fileDataParts = fileList.map((f) => ({
      inlineData: {
        data: f.buffer.toString('base64'),
        mimeType: 'application/pdf',
      },
    }));

    const prompt = `Extract the full Cambridge IELTS Listening exam from the attached PDF document(s).
Follow all rules defined in systemInstruction:
1. Extract exactly 4 parts corresponding strictly to Parts 1, 2, 3, and 4 in the booklet.
2. Group all 40 questions with full instructions, types, options, and reference boxes.
3. Extract all 40 answers from the official Answer Key.`;

    const { response, modelUsed } = await executeGeminiWithModelPool({
      contents: [{ role: 'user', parts: [...fileDataParts, { text: prompt }] }],
      config: {
        ...LISTENING_PARSER_CONFIG.config,
        maxOutputTokens: 32768,
        responseSchema: LISTENING_EXAM_SCHEMA,
      },
      systemInstruction: LISTENING_PARSER_CONFIG.systemInstruction,
      modelPool: ['gemini-3.7-flash', 'gemini-3.5-flash-lite'],
    });

    const parsed = robustJsonRepair(response.text || '{}');
    parsed.model_used = modelUsed;
    parsed.file_name = fileList.map(f => f.fileName).join(', ');
    return normalizeListeningParsed(parsed, parsed.file_name);
  }
}

async function resilientParseWriting(fileBuffer, fileName) {
  try {
    return await parseWritingPdf({ fileBuffer, fileName });
  } catch (err) {
    if (!is503OrUnavailable(err)) throw err;
    console.warn('[api-plugin] Writing PDF parsing hit 503 / High Demand. Pausing 2.5s before retrying with fallback model pool...');
    await sleep(2500);

    const { response, modelUsed } = await executeGeminiWithModelPool({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: fileBuffer.toString('base64'), mimeType: 'application/pdf' } },
          { text: 'Extract IELTS Writing Task 1 and Task 2 prompts from the attached PDF.' }
        ]
      }],
      config: {
        ...WRITING_PARSER_CONFIG.config,
        maxOutputTokens: 16000,
        responseSchema: WRITING_EXAM_SCHEMA,
      },
      systemInstruction: WRITING_PARSER_CONFIG.systemInstruction,
      modelPool: ['gemini-3.7-flash', 'gemini-3.5-flash-lite'],
    });

    const parsed = robustJsonRepair(response.text || '{}');
    parsed.model_used = modelUsed;
    parsed.file_name = fileName;
    parsed.sections = [
      { id: 'task1', task: 1, title: 'Task 1', prompt: parsed.task_1?.prompt || '' },
      { id: 'task2', task: 2, title: 'Task 2', prompt: parsed.task_2?.prompt || '' },
    ];
    return parsed;
  }
}

// Auto-load .env into process.env if not already present
function ensureEnvLoaded() {
  try {
    const envPaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '.env.local'),
    ];
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[api-plugin] Failed to auto-load .env file:', e.message);
  }
}

ensureEnvLoaded();

function parseMultipartFormData(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let startIndex = buffer.indexOf(boundaryBuffer);

  while (startIndex !== -1) {
    const nextIndex = buffer.indexOf(boundaryBuffer, startIndex + boundaryBuffer.length);
    if (nextIndex === -1) break;

    const partBuffer = buffer.slice(startIndex + boundaryBuffer.length, nextIndex);
    const headerEndIndex = partBuffer.indexOf(Buffer.from('\r\n\r\n'));

    if (headerEndIndex !== -1) {
      const headerText = partBuffer.slice(0, headerEndIndex).toString('utf-8');
      // Strip preceding \r\n from boundary in multipart data
      let bodyEnd = partBuffer.length;
      if (bodyEnd >= 2 && partBuffer[bodyEnd - 2] === 13 && partBuffer[bodyEnd - 1] === 10) {
        bodyEnd -= 2;
      }
      const bodyBuffer = partBuffer.slice(headerEndIndex + 4, bodyEnd);

      const nameMatch = headerText.match(/name="([^"]+)"/i) || headerText.match(/name=([^\r\n;]+)/i);
      const filenameMatch = headerText.match(/filename="([^"]+)"/i) || headerText.match(/filename=([^\r\n;]+)/i);

      if (nameMatch) {
        parts.push({
          name: nameMatch[1].trim(),
          filename: filenameMatch ? filenameMatch[1].trim() : null,
          data: bodyBuffer,
        });
      }
    }

    startIndex = nextIndex;
  }

  return parts;
}

export function ieltsGeminiApiPlugin() {
  return {
    name: 'ielts-gemini-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];

        // -------------------------------------------------------------------
        // 1. POST /api/exams/parse-pdf
        // -------------------------------------------------------------------
        if (req.method === 'POST' && url === '/api/exams/parse-pdf') {
          try {
            ensureEnvLoaded();
            const chunks = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || '';

            // Multi-part file containers
            let listeningPdfBuffer = null;
            let listeningFileName = 'Listening.pdf';
            let readingPdfBuffer = null;
            let readingFileName = 'Reading.pdf';
            let writingPdfBuffer = null;
            let writingFileName = 'Writing.pdf';

            // Audio track URLs or files
            const audioTracks = {
              part1: '',
              part2: '',
              part3: '',
              part4: '',
            };

            // Meta
            let examId = null;
            let pinCode = null;
            let title = 'IELTS Academic Master Assessment';
            let durationMins = 60;
            let sectionType = null;
            let legacyBuffer = null;
            let legacyFileName = 'Exam.pdf';

            if (contentType.includes('multipart/form-data')) {
              const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
              const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;

              if (boundary) {
                const parts = parseMultipartFormData(buffer, boundary);
                for (const p of parts) {
                  const name = p.name;
                  if (name === 'listeningPdf' || name === 'listening_pdf') {
                    listeningPdfBuffer = p.data;
                    if (p.filename) listeningFileName = p.filename;
                  } else if (name === 'readingPdf' || name === 'reading_pdf') {
                    readingPdfBuffer = p.data;
                    if (p.filename) readingFileName = p.filename;
                  } else if (name === 'writingPdf' || name === 'writing_pdf') {
                    writingPdfBuffer = p.data;
                    if (p.filename) writingFileName = p.filename;
                  } else if (name === 'pdf' || (p.filename && !readingPdfBuffer && !listeningPdfBuffer && !writingPdfBuffer)) {
                    legacyBuffer = p.data;
                    if (p.filename) legacyFileName = p.filename;
                  } else if (name === 'audio1' || name === 'audioTrack1' || name === 'part1_audio') {
                    audioTracks.part1 = p.data.toString('utf-8').trim();
                  } else if (name === 'audio2' || name === 'audioTrack2' || name === 'part2_audio') {
                    audioTracks.part2 = p.data.toString('utf-8').trim();
                  } else if (name === 'audio3' || name === 'audioTrack3' || name === 'part3_audio') {
                    audioTracks.part3 = p.data.toString('utf-8').trim();
                  } else if (name === 'audio4' || name === 'audioTrack4' || name === 'part4_audio') {
                    audioTracks.part4 = p.data.toString('utf-8').trim();
                  } else if (name === 'audioTracks' || name === 'audio_parts') {
                    try {
                      Object.assign(audioTracks, JSON.parse(p.data.toString('utf-8')));
                    } catch {}
                  } else if (name === 'examId' || name === 'exam_id') {
                    examId = p.data.toString('utf-8').trim();
                  } else if (name === 'pinCode' || name === 'pin_code') {
                    pinCode = p.data.toString('utf-8').trim();
                  } else if (name === 'title') {
                    title = p.data.toString('utf-8').trim();
                  } else if (name === 'duration' || name === 'durationMins' || name === 'duration_mins') {
                    durationMins = Number(p.data.toString('utf-8').trim()) || 60;
                  } else if (name === 'sectionType' || name === 'section_type') {
                    sectionType = p.data.toString('utf-8').trim().toLowerCase();
                  }
                }
              }
            } else if (contentType.includes('application/json')) {
              const jsonBody = JSON.parse(buffer.toString('utf-8') || '{}');
              sectionType = jsonBody.sectionType || jsonBody.section_type || null;
              examId = jsonBody.examId || jsonBody.exam_id || null;
              pinCode = jsonBody.pinCode || jsonBody.pin_code || null;
              title = jsonBody.title || title;
              durationMins = Number(jsonBody.durationMins || jsonBody.duration_mins) || 60;
              if (jsonBody.audioTracks) Object.assign(audioTracks, jsonBody.audioTracks);

              if (jsonBody.readingPdfBase64) {
                readingPdfBuffer = Buffer.from(jsonBody.readingPdfBase64, 'base64');
                if (jsonBody.readingFileName) readingFileName = jsonBody.readingFileName;
              }
              if (jsonBody.listeningPdfBase64) {
                listeningPdfBuffer = Buffer.from(jsonBody.listeningPdfBase64, 'base64');
                if (jsonBody.listeningFileName) listeningFileName = jsonBody.listeningFileName;
              }
              if (jsonBody.writingPdfBase64) {
                writingPdfBuffer = Buffer.from(jsonBody.writingPdfBase64, 'base64');
                if (jsonBody.writingFileName) writingFileName = jsonBody.writingFileName;
              }
              if (jsonBody.fileBase64) {
                legacyBuffer = Buffer.from(jsonBody.fileBase64, 'base64');
                if (jsonBody.fileName) legacyFileName = jsonBody.fileName;
              }
            }

            let parsedResult = null;

            // Check if any of the 3 stream PDFs were provided
            const hasThreePdfInput = Boolean(listeningPdfBuffer || readingPdfBuffer || writingPdfBuffer);

            if (hasThreePdfInput) {
              try {
                parsedResult = await parseThreePartExamPdf({
                  listeningPdfBuffer,
                  listeningFileName,
                  readingPdfBuffer,
                  readingFileName,
                  writingPdfBuffer,
                  writingFileName,
                  audioTracks,
                  examId,
                  pinCode,
                  title,
                  durationMins,
                });
              } catch (pdfErr) {
                if (is503OrUnavailable(pdfErr)) {
                  console.warn('[API /api/exams/parse-pdf] parseThreePartExamPdf hit 503. Running resilient sequential parsing with model pool...');
                  await sleep(2500);
                  const reading = readingPdfBuffer ? await resilientParseReading([{ buffer: readingPdfBuffer, fileName: readingFileName }]) : null;
                  const listening = listeningPdfBuffer ? await resilientParseListening([{ buffer: listeningPdfBuffer, fileName: listeningFileName }]) : null;
                  const writing = writingPdfBuffer ? await resilientParseWriting(writingPdfBuffer, writingFileName) : null;
                  parsedResult = {
                    examId,
                    pinCode,
                    title,
                    durationMins,
                    reading,
                    listening,
                    writing,
                  };
                } else {
                  throw pdfErr;
                }
              }
            } else if (legacyBuffer) {
              // Backward compatibility for single section parsing
              if (sectionType === 'listening') {
                listeningPdfBuffer = legacyBuffer;
                listeningFileName = legacyFileName;
              } else if (sectionType === 'writing') {
                writingPdfBuffer = legacyBuffer;
                writingFileName = legacyFileName;
              } else {
                readingPdfBuffer = legacyBuffer;
                readingFileName = legacyFileName;
              }

              parsedResult = await parseThreePartExamPdf({
                listeningPdfBuffer,
                listeningFileName,
                readingPdfBuffer,
                readingFileName,
                writingPdfBuffer,
                writingFileName,
                audioTracks,
                examId,
                pinCode,
                title,
                durationMins,
              });
            } else {
              throw new Error('No PDF files found in request. Please upload listeningPdf, readingPdf, or writingPdf.');
            }

            // Validate section parity & run targeted gap-fill for reading and listening if present
            if (parsedResult?.reading) {
              let readingParity = validateSectionParity(parsedResult.reading);
              console.log(`[Parser Parity] [Reading] Expected from Answer Key: ${readingParity.expectedCount}, Found in Questions: ${readingParity.foundCount}`);
              if (readingParity.missingNumbers.length > 0) {
                console.warn(`[Parser Parity] [Reading] Gaps detected! Missing questions:`, readingParity.missingNumbers);
                console.log(`[Parser Parity] [Reading] Section requires targeted gap-fill for questions:`, readingParity.missingNumbers);
                try {
                  const recovered = await recoverMissingQuestions({
                    files: readingPdfBuffer ? [{ buffer: readingPdfBuffer, fileName: readingFileName }] : [],
                    sectionType: 'reading',
                    missingNumbers: readingParity.missingNumbers,
                    answerKeys: parsedResult.reading.answer_keys || parsedResult.reading.answerKeys || {},
                    existingQuestions: parsedResult.reading.questions || [],
                  });
                  if (recovered && recovered.length > 0) {
                    if (!Array.isArray(parsedResult.reading.questions)) parsedResult.reading.questions = [];
                    parsedResult.reading.questions.push(...recovered);
                    readingParity = validateSectionParity(parsedResult.reading);
                    console.log(`[Parser Parity Post-Recovery] [Reading] Expected: ${readingParity.expectedCount}, Found: ${readingParity.foundCount}, Missing: ${readingParity.missingNumbers.length}`);
                  }
                } catch (gapErr) {
                  console.warn(`[Parser Parity] [Reading] Targeted gap-fill failed (non-fatal):`, gapErr.message);
                }
              }
              parsedResult.reading._parity = readingParity;
            }

            if (parsedResult?.listening) {
              let listeningParity = validateSectionParity(parsedResult.listening);
              console.log(`[Parser Parity] [Listening] Expected from Answer Key: ${listeningParity.expectedCount}, Found in Questions: ${listeningParity.foundCount}`);
              if (listeningParity.missingNumbers.length > 0) {
                console.warn(`[Parser Parity] [Listening] Gaps detected! Missing questions:`, listeningParity.missingNumbers);
                console.log(`[Parser Parity] [Listening] Section requires targeted gap-fill for questions:`, listeningParity.missingNumbers);
                try {
                  const recovered = await recoverMissingQuestions({
                    files: listeningPdfBuffer ? [{ buffer: listeningPdfBuffer, fileName: listeningFileName }] : [],
                    sectionType: 'listening',
                    missingNumbers: listeningParity.missingNumbers,
                    answerKeys: parsedResult.listening.answer_keys || parsedResult.listening.answerKeys || {},
                    existingQuestions: parsedResult.listening.questions || [],
                  });
                  if (recovered && recovered.length > 0) {
                    if (!Array.isArray(parsedResult.listening.questions)) parsedResult.listening.questions = [];
                    parsedResult.listening.questions.push(...recovered);
                    listeningParity = validateSectionParity(parsedResult.listening);
                    console.log(`[Parser Parity Post-Recovery] [Listening] Expected: ${listeningParity.expectedCount}, Found: ${listeningParity.foundCount}, Missing: ${listeningParity.missingNumbers.length}`);
                  }
                } catch (gapErr) {
                  console.warn(`[Parser Parity] [Listening] Targeted gap-fill failed (non-fatal):`, gapErr.message);
                }
              }
              parsedResult.listening._parity = listeningParity;
            }

            // Persist the real extracted JSON payload directly into Supabase (exams / exam_sections tables)
            if (examId) {
              try {
                console.log(`[API /api/exams/parse-pdf] Persisting extracted exam payload to Supabase for exam ${examId}...`);
                await persistExamAndSections(examId, parsedResult);
              } catch (dbErr) {
                console.warn('[API /api/exams/parse-pdf] Supabase persistence error (non-fatal):', dbErr.message);
              }
            }

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(parsedResult));
            return;
          } catch (err) {
            console.error('[API /api/exams/parse-pdf error]:', err);
            const is503 = is503OrUnavailable(err);
            const bothFailed = (err.message || '').includes('[Gemini Resiliency]') || (err.message || '').includes('Both primary');
            const isRateLimit = !is503 && !bothFailed && ((err.message || '').includes('429') || (err.message || '').includes('quota') || (err.message || '').includes('RESOURCE_EXHAUSTED'));
            res.writeHead(is503 ? 503 : isRateLimit ? 429 : 500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message || 'Failed to parse PDF', isRateLimit, is503 }));
            return;
          }
        }

        // -------------------------------------------------------------------
        // 1.5. POST /api/exams/parse-section (Single Section Sequential Pipeline)
        // -------------------------------------------------------------------
        if (req.method === 'POST' && url === '/api/exams/parse-section') {
          try {
            ensureEnvLoaded();
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || '';

            let sectionType = 'reading';
            const collectedFiles = [];

            if (contentType.includes('multipart/form-data')) {
              const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
              const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;
              if (boundary) {
                const parts = parseMultipartFormData(buffer, boundary);
                for (const p of parts) {
                  if (p.name === 'sectionType' || p.name === 'section_type') {
                    sectionType = p.data.toString('utf-8').trim().toLowerCase();
                  } else if (p.filename) {
                    collectedFiles.push({ buffer: p.data, fileName: p.filename });
                  }
                }
              }
            } else if (contentType.includes('application/json')) {
              const jsonBody = JSON.parse(buffer.toString('utf-8') || '{}');
              sectionType = (jsonBody.sectionType || jsonBody.section_type || 'reading').toLowerCase();
              const filesJson = jsonBody.files || (jsonBody.fileBase64 ? [{ base64: jsonBody.fileBase64, fileName: jsonBody.fileName }] : []);
              for (const f of filesJson) {
                collectedFiles.push({ buffer: Buffer.from(f.base64, 'base64'), fileName: f.fileName });
              }
            }

            if (collectedFiles.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'No PDF files found in request' }));
              return;
            }

            console.log(`[API /api/exams/parse-section] Parsing '${sectionType}' from ${collectedFiles.length} file(s): ${collectedFiles.map(f => f.fileName).join(', ')}`);

            let parsedResult = null;
            if (sectionType === 'listening') {
              parsedResult = await resilientParseListening(collectedFiles);
            } else if (sectionType === 'writing') {
              parsedResult = await resilientParseWriting(collectedFiles[0].buffer, collectedFiles[0].fileName);
            } else {
              parsedResult = await resilientParseReading(collectedFiles);
            }

            if (parsedResult && sectionType !== 'writing') {
              let parityReport = validateSectionParity(parsedResult);
              console.log(`[Parser Parity] Expected from Answer Key: ${parityReport.expectedCount}, Found in Questions: ${parityReport.foundCount}`);
              if (parityReport.missingNumbers.length > 0) {
                console.warn(`[Parser Parity] Gaps detected! Missing questions:`, parityReport.missingNumbers);
                console.log(`[Parser Parity] Section requires targeted gap-fill for questions:`, parityReport.missingNumbers);

                try {
                  const recoveredQuestions = await recoverMissingQuestions({
                    files: collectedFiles,
                    sectionType,
                    missingNumbers: parityReport.missingNumbers,
                    answerKeys: parsedResult.answer_keys || parsedResult.answerKeys || {},
                    existingQuestions: parsedResult.questions || [],
                  });

                  if (recoveredQuestions && recoveredQuestions.length > 0) {
                    if (!Array.isArray(parsedResult.questions)) {
                      parsedResult.questions = [];
                    }
                    parsedResult.questions.push(...recoveredQuestions);

                    // Re-run parity validation: deduplicates, sorts ascending, and updates completeness
                    parityReport = validateSectionParity(parsedResult);
                    console.log(`[Parser Parity Post-Recovery] Expected: ${parityReport.expectedCount}, Found: ${parityReport.foundCount}, Missing: ${parityReport.missingNumbers.length}`);
                  }
                } catch (gapErr) {
                  console.warn(`[Parser Parity] Targeted gap-fill failed (non-fatal, proceeding with existing questions):`, gapErr.message);
                }
              }
              parsedResult._parity = parityReport;
            }

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ sectionType, data: parsedResult }));
            return;
          } catch (err) {
            console.error('[API /api/exams/parse-section error]:', err);
            const is503 = is503OrUnavailable(err);
            const isRateLimit = !is503 && ((err.message || '').includes('429') || (err.message || '').includes('quota') || (err.message || '').includes('RESOURCE_EXHAUSTED'));
            res.writeHead(is503 ? 503 : isRateLimit ? 429 : 500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message || 'Failed to parse section', isRateLimit, is503 }));
            return;
          }
        }

        // -------------------------------------------------------------------
        // 2. POST /api/exams/grade-writing
        // -------------------------------------------------------------------
        if (req.method === 'POST' && url === '/api/exams/grade-writing') {
          try {
            ensureEnvLoaded();
            const chunks = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const data = JSON.parse(bodyStr || '{}');

            const result = await gradeWritingSubmission({
              task_1_submission: data.task_1_submission || data.task1Text || data.writing_task1_essay || '',
              task_2_submission: data.task_2_submission || data.task2Text || data.writing_task2_essay || '',
              task_1_prompt: data.task_1_prompt || data.task1Prompt || '',
              task_2_prompt: data.task_2_prompt || data.task2Prompt || '',
              studentId: data.studentId || null,
            });

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(result));
            return;
          } catch (err) {
            console.error('[API /api/exams/grade-writing error]:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Failed to grade writing' }));
            return;
          }
        }

        next();
      });
    },
  };
}

export {
  resilientParseReading,
  resilientParseListening,
  resilientParseWriting,
  parseMultipartFormData,
  is503OrUnavailable,
  ensureEnvLoaded,
};

