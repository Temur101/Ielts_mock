/**
 * Google Gemini AI Integration Service
 * Model: gemini-3.6-flash (fallback: gemini-3.5-flash-lite)
 * Real multi-part PDF parsing via Files API & Strict Official IELTS Writing Examiner.
 * Structured Outputs (responseSchema) & Resilient Exponential Backoff for Rate Limits.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { GoogleGenAI } from '@google/genai';

function loadEnvFiles() {
  if (typeof process === 'undefined' || !process.cwd) return;
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
  } catch {}
}
loadEnvFiles();

let activeKeyIndex = 0;

/**
 * Retrieves all valid Google Gemini API keys from server environment with multi-key support
 * (GEMINI_API_KEYS comma-separated, GEMINI_API_KEY, and fallback environment variables)
 */
export function getGeminiApiKeys() {
  loadEnvFiles();
  const keys = [];

  const addKey = (k) => {
    if (!k || typeof k !== 'string') return;
    const clean = k.trim().replace(/^["']|["']$/g, '');
    const lower = clean.toLowerCase();
    if (clean.length > 10 && !lower.startsWith('placeholder') && lower !== 'your_api_key_here' && lower !== 'todo') {
      if (!keys.includes(clean)) {
        keys.push(clean);
      }
    }
  };

  if (typeof process !== 'undefined' && process.env) {
    // 1. GEMINI_API_KEYS (comma, semicolon, or newline separated list)
    if (process.env.GEMINI_API_KEYS) {
      process.env.GEMINI_API_KEYS.split(/[,;\n]/).forEach(addKey);
    }
    // 2. Primary GEMINI_API_KEY
    if (process.env.GEMINI_API_KEY) {
      process.env.GEMINI_API_KEY.split(/[,;\n]/).forEach(addKey);
    }
    // 3. Fallback and alternative server-side keys
    addKey(process.env.GEMINI_API_KEY_FALLBACK);
    addKey(process.env.GEMINI_BACKUP_API_KEY);
  }

  return keys;
}

/**
 * Returns currently active Gemini API Key
 */
export function getGeminiApiKey() {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) return '';
  return keys[activeKeyIndex % keys.length];
}

/**
 * Rotates to the next available API key in the pool upon rate limiting (429)
 */
export function rotateGeminiApiKey() {
  const keys = getGeminiApiKeys();
  if (keys.length <= 1) return getGeminiApiKey();
  activeKeyIndex = (activeKeyIndex + 1) % keys.length;
  const nextKey = keys[activeKeyIndex];
  console.warn(
    `[Gemini Key Rotation] Rotated active API key to slot #${activeKeyIndex + 1}/${keys.length} (${nextKey.substring(0, 8)}...${nextKey.substring(nextKey.length - 4)})`
  );
  return nextKey;
}

/**
 * Resets active key index to primary slot (slot #1)
 */
export function resetGeminiKeyIndex() {
  activeKeyIndex = 0;
}

/**
 * Checks whether the active environment has at least one valid API key
 */
export function isLiveGeminiConfigured() {
  return getGeminiApiKeys().length > 0;
}

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

// =========================================================================
// STRUCTURED OUTPUT SCHEMAS (OpenAPI 3.0 / JSON Schema)
// =========================================================================

export const READING_EXAM_SCHEMA = {
  type: 'object',
  properties: {
    passages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          part: { type: 'integer' },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          text: { type: 'string' },
          // Discrete paragraph array: each lettered paragraph preserved as {label, text}
          paragraphs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },   // "A", "B", "C"... or ""
                text: { type: 'string' },
              },
              required: ['label', 'text'],
            },
          },
          notes_template: { type: 'string' },
          reference_box: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['key', 'label'],
            },
          },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                q_num: { type: 'integer' },
                questionNumber: { type: 'integer' },
                type: { 
                  type: 'string', 
                  enum: [
                    'TRUE_FALSE_NOT_GIVEN',
                    'YES_NO_NOT_GIVEN',
                    'MULTIPLE_CHOICE',
                    'MATCHING_HEADINGS',
                    'MATCHING_INFORMATION',
                    'MATCHING_FEATURES',
                    'MATCHING_SENTENCE_ENDINGS',
                    'NOTES_COMPLETION',
                    'TABLE_COMPLETION',
                    'SUMMARY_COMPLETION',
                    'SUMMARY_MATCHING',
                    'FLOW_CHART',
                    'FLOW_CHART_COMPLETION',
                    'DIAGRAM_LABEL',
                    'SHORT_ANSWER',
                  ],
                },
                prompt: { type: 'string' },
                instruction: { type: 'string' },
                title: { type: 'string' },
                subheading: { type: 'string' },
                // Intermediate non-question contextual bullet points
                context_bullets: {
                  type: 'array',
                  items: { type: 'string' },
                },
                notes_template: { type: 'string' },
                // For narrative tasks: full narrative with {{q_num}} placeholders at gap positions
                summary_template: { type: 'string' },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                },
                reference_box: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      label: { type: 'string' },
                    },
                    required: ['key', 'label'],
                  },
                },
                correct_answer: { type: 'string' },
              },
              required: ['q_num', 'type', 'prompt', 'options', 'correct_answer'],
            },
          },
        },
        required: ['part', 'title', 'text', 'questions'],
      },
    },
  },
  required: ['passages'],
};

export const LISTENING_EXAM_SCHEMA = {
  type: 'object',
  properties: {
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          part: { type: 'integer' },
          title: { type: 'string' },
          audio_track_index: { type: 'integer' },
          instruction: { type: 'string' },
          notes_template: { type: 'string' },
          table_template: { type: 'string' },
          reference_box: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['key', 'label'],
            },
          },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                q_num: { type: 'integer' },
                questionNumber: { type: 'integer' },
                type: { 
                  type: 'string', 
                  enum: [
                    'FORM_COMPLETION',
                    'NOTES_COMPLETION',
                    'TABLE_COMPLETION',
                    'FLOW_CHART',
                    'FLOW_CHART_MATCHING',
                    'FLOW_CHART_COMPLETION',
                    'SUMMARY_COMPLETION',
                    'MULTIPLE_CHOICE',
                    'MATCHING',
                    'MATCHING_FEATURES',
                    'MATCHING_HEADINGS',
                    'TRUE_FALSE_NOT_GIVEN',
                    'YES_NO_NOT_GIVEN',
                    'MAP_LABELLING',
                    'DIAGRAM_LABEL',
                    'SHORT_ANSWER',
                  ],
                },
                prompt: { type: 'string' },
                instruction: { type: 'string' },
                title: { type: 'string' },
                subheading: { type: 'string' },
                context_bullets: {
                  type: 'array',
                  items: { type: 'string' },
                },
                notes_template: { type: 'string' },
                table_template: { type: 'string' },
                flow_step: { type: 'string' },
                summary_template: { type: 'string' },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                },
                reference_box: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      label: { type: 'string' },
                    },
                    required: ['key', 'label'],
                  },
                },
                correct_answer: { type: 'string' },
              },
              required: ['q_num', 'type', 'prompt', 'options', 'correct_answer'],
            },
          },
        },
        required: ['part', 'title', 'audio_track_index', 'questions'],
      },
    },
  },
  required: ['parts'],
};

export const WRITING_EXAM_SCHEMA = {
  type: 'object',
  properties: {
    task_1: {
      type: 'object',
      properties: {
        page_index: { type: 'integer' },
        title: { type: 'string' },
        prompt: { type: 'string' },
        min_words: { type: 'integer' },
        suggested_time: { type: 'integer' },
      },
      required: ['page_index', 'title', 'prompt', 'min_words', 'suggested_time'],
    },
    task_2: {
      type: 'object',
      properties: {
        page_index: { type: 'integer' },
        title: { type: 'string' },
        prompt: { type: 'string' },
        min_words: { type: 'integer' },
        suggested_time: { type: 'integer' },
      },
      required: ['page_index', 'title', 'prompt', 'min_words', 'suggested_time'],
    },
  },
  required: ['task_1', 'task_2'],
};

export const WRITING_EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    task_1: {
      type: 'object',
      properties: {
        word_count: { type: 'number' },
        scores: {
          type: 'object',
          properties: {
            ta: { type: 'number' },
            cc: { type: 'number' },
            lr: { type: 'number' },
            gra: { type: 'number' },
            band: { type: 'number' },
          },
          required: ['ta', 'cc', 'lr', 'gra', 'band'],
        },
        skill_level: { type: 'string' },
        feedback: { type: 'string' },
        mistakes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              original: { type: 'string' },
              correction: { type: 'string' },
              explanation: { type: 'string' },
            },
            required: ['original', 'correction', 'explanation'],
          },
        },
      },
      required: ['scores', 'skill_level', 'feedback', 'mistakes'],
    },
    task_2: {
      type: 'object',
      properties: {
        word_count: { type: 'number' },
        scores: {
          type: 'object',
          properties: {
            tr: { type: 'number' },
            cc: { type: 'number' },
            lr: { type: 'number' },
            gra: { type: 'number' },
            band: { type: 'number' },
          },
          required: ['tr', 'cc', 'lr', 'gra', 'band'],
        },
        skill_level: { type: 'string' },
        feedback: { type: 'string' },
        mistakes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              original: { type: 'string' },
              correction: { type: 'string' },
              explanation: { type: 'string' },
            },
            required: ['original', 'correction', 'explanation'],
          },
        },
      },
      required: ['scores', 'skill_level', 'feedback', 'mistakes'],
    },
    overall_writing_band: { type: 'number' },
    overall_skill_level: { type: 'string' },
  },
  required: ['task_1', 'task_2', 'overall_writing_band', 'overall_skill_level'],
};

// =========================================================================
// RESILIENT MODEL ORCHESTRATION & CONFIGURATION
// =========================================================================

export const PRIMARY_GEMINI_MODEL = 'gemini-3.6-flash';
export const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/**
 * Shared baseline generation config ensuring deterministic JSON output across models
 */
export const SHARED_GENERATION_CONFIG = Object.freeze({
  temperature: 0.1,
  responseMimeType: 'application/json',
  maxOutputTokens: 16000,
});

/**
 * Creates a unified generation config object combining shared defaults,
 * schemas, and request-specific overrides.
 */
export function buildUnifiedConfig(schema, overrides = {}) {
  return {
    ...SHARED_GENERATION_CONFIG,
    ...(schema ? { responseSchema: schema } : {}),
    maxOutputTokens: 16000,
    ...overrides,
  };
}

/**
 * Shared, reusable parser configurations guaranteeing that both primary ('gemini-3.6-flash')
 * and fallback ('gemini-3.5-flash-lite') models use the exact same schema and parsing instructions.
 */
export const READING_PARSER_CONFIG = Object.freeze({
  name: 'Reading Examination Parser',
  systemInstruction: `You are a certified Cambridge IELTS Academic Reading parser.
Your duty is to transcribe authentic IELTS Reading exam booklets into strict JSON matching the schema with 100% fidelity.

CRITICAL LAWS:
1. GROUND TRUTH (ANSWER KEY):
   First locate the official 'ANSWER KEY' table at the end of the PDF. The total count of answers in the Answer Key defines the exact question checklist. If the Answer Key contains 40 answers (1 to 40), you MUST output exactly 40 question objects (q_num 1 to 40). NO QUESTIONS MAY BE SKIPPED.

2. PASSAGE EXTRACTION:
   - Extract all reading passages present in the booklet (typically 3 passages) into the "passages" array.
   - For each passage, preserve its authentic title, subtitle, and complete uninterrupted body text.
   - If paragraphs are lettered (A, B, C...), populate the "paragraphs" array with { "label": "A", "text": "..." }. If unlettered, split into natural paragraphs with label: "".

3. AUTONOMOUS TASK CLASSIFICATION (100% CAMBRIDGE COVERAGE):
   Carefully inspect the instruction text and visual layout of each question group. Assign the EXACT specific type to the "type" field of each question:
   - "MATCHING_HEADINGS": Matching sections/paragraphs to a List of Headings. The options MUST be Roman numerals (i, ii, iii...). Populate "reference_box" with the complete list of headings [{ "key": "i", "label": "Heading text" }, ...].
   - "MATCHING_FEATURES": Matching statements to a box of people, researchers, dates, countries, or categories. Populate "reference_box" with the letter-label pairs [{ "key": "A", "label": "Person Name" }, ...].
   - "MATCHING_INFORMATION": "Which paragraph contains the following information?". Answers are paragraph letters (A, B, C...).
   - "MATCHING_SENTENCE_ENDINGS": Matching sentence beginnings with endings from a box.
   - "TRUE_FALSE_NOT_GIVEN": Verifying statements against factual information.
   - "YES_NO_NOT_GIVEN": Verifying statements against the writer's opinions or claims.
   - "SUMMARY_COMPLETION": Summary paragraph with gaps. In "summary_template", provide the complete narrative with sequential {{q_num}} placeholders at gap positions.
   - "SUMMARY_MATCHING": Summary completion with a box of words/phrases. Populate "reference_box" with [{ "key": "A", "label": "word" }, ...] and provide "summary_template" with {{q_num}} gaps.
   - "TABLE_COMPLETION": Structured table with columns and rows. In "notes_template", preserve the table structure with {{q_num}} placeholders.
   - "FLOW_CHART": Step-by-step sequential process with arrows or stages.
   - "DIAGRAM_LABEL": Labelling a diagram.
   - "MULTIPLE_CHOICE": Standard choice. Each option in "options" MUST contain the letter AND the full descriptive text (e.g. "A Full sentence text"), NEVER single letters alone!
   - "SHORT_ANSWER": Answering open questions with words from the text.

4. CONTEXT & PROMPT PRESERVATION:
   - The "prompt" field of each question MUST contain the actual sentence or context line containing the gap (e.g. 'Works were full of {{10}}'). NEVER set "prompt" to generic instructions like 'Complete the table' or 'Complete the notes'!
   - In "reference_box", always extract both the key (e.g. "A" or "i") and the verbatim label/word from the booklet. Never output placeholder labels like "Option A".

5. ANSWER KEYS:
   Extract exact answers for every question strictly from the official 'ANSWER KEY' table at the end of the booklet.`,
  schema: READING_EXAM_SCHEMA,
  config: buildUnifiedConfig(READING_EXAM_SCHEMA, { maxOutputTokens: 32768 }),
});

export const LISTENING_PARSER_CONFIG = Object.freeze({
  name: 'Listening Examination Parser',
  systemInstruction: `You are a certified Cambridge IELTS Listening parser.
Your duty is to transcribe authentic IELTS Listening exam booklets and answer keys into strict JSON matching the schema with 100% fidelity.

CRITICAL LAWS:
1. GROUND TRUTH (ANSWER KEY):
   First locate the official 'ANSWER KEY' table at the end of the booklet. Every question number present in the Answer Key (1 to 40) MUST have a corresponding question object in the JSON with q_num 1 to 40.

2. PART STRUCTURE:
   Extract exactly 4 parts corresponding to Parts 1, 2, 3, and 4 in the booklet. Preserve authentic part titles and instructions.

3. AUTONOMOUS TASK CLASSIFICATION:
   Inspect the instructions and formatting of each group to assign the exact "type":
   - "TABLE_COMPLETION": Multi-column tables with headers, rows, and gaps. In "notes_template" (on both the part and question items), you MUST generate a valid Markdown table (| Header 1 | Header 2 | ... | \n | --- | --- | ... | \n | Cell 1 | Cell 2 | ... |) containing ALL columns and ALL static non-gap rows verbatim (e.g. 'recording them', 'talking to tutor'). If multiple questions share the same row across different columns (e.g. Q25 in Col 1, Q26 in Col 3), they MUST remain together in the same row with their {{25}} and {{26}} placeholders.
   - "FORM_COMPLETION": Application, rental, booking, or registration forms. In "notes_template" (on both the part and question items), generate the complete form text verbatim, including all section dividers/subheadings (e.g. 'Personal details'), all static informational non-gap rows (e.g. 'Name: Kevin Walker', 'Maximum rent: £650 a month'), alongside the gap lines with {{q_num}} placeholders.
   - "NOTES_COMPLETION": Lecture/discussion notes, subheadings, and bullet points with gaps. In "notes_template", preserve all section subheadings and non-gap informational bullet points with {{q_num}} placeholders.
   - "FLOW_CHART": Step-by-step sequential processes, cycles, or flow diagrams with arrows.
   - "MATCHING": Matching items to a box of options/categories.
   - "MULTIPLE_CHOICE": Standard single questions with options A, B, C. If the instruction states "Choose TWO letters" or "Choose THREE letters", mark each question in that set as multi-select.
   - "MAP_LABELLING" / "DIAGRAM_LABEL": Labelling plans, maps, or technical diagrams.

4. COMPLETE PROMPT & CONTEXT PRESERVATION:
   - For form, note, and table completion, each question's "prompt" MUST retain the field label or sentence line with the gap (e.g. 'Address: {{1}} Road' or 'Date started: {{22}}'). DO NOT skip Question 1 if it appears on the very first line of a form!
   - In "notes_template" on the part and each question, transcribe the full page structure with all section subheadings, lecture notes, bullet points, Markdown tables, and {{q_num}} placeholders so the UI can reconstruct the complete original layout verbatim.
   - For option boxes, extract all letter-label pairs into "reference_box".

5. ANSWER KEYS:
   Extract exact answers strictly from the official 'ANSWER KEY' table at the end of the booklet.

6. UNIVERSAL PLACEHOLDER INTEGRITY & MIXED CONTENT (ZERO HARDCODE):
   - Every gap placeholder in "notes_template", "table_template", or "form_template" MUST strictly match the global question number in the booklet: {{q_num}} (e.g. {{25}}, {{26}}, {{31}}).
   - NEVER use 0-based offsets ({{0}}, {{1}}), relative offsets, or reset numbering to 1 at the beginning of a section. The placeholder number must match question.q_num identically.
   - If a section contains mixed content (such as narrative text or bullet points, followed by a table, followed by further notes or questions), unify them into a single continuous "notes_template" embedding the Markdown table in place (| Header | ... |) within the text instead of fragmenting into separate disconnected pieces.`,
  schema: LISTENING_EXAM_SCHEMA,
  config: buildUnifiedConfig(LISTENING_EXAM_SCHEMA, { maxOutputTokens: 32768 }),
});

export const WRITING_PARSER_CONFIG = Object.freeze({
  name: 'Writing Examination Parser',
  systemInstruction: `You are an elite Cambridge IELTS Writing parser.
Your task is to index Writing Task 1 and Task 2 from the attached PDF with minimal token footprint.
CRITICAL RULES:
1. PAGE INDEXING:
   - Identify the zero-based page index: Task 1 MUST have page_index: 0, Task 2 MUST have page_index: 1.
2. CONCISE PROMPTS:
   - Extract only the core concise assignment statement and prompt instructions (e.g. "The chart below shows... Summarise the information by selecting and reporting the main features...").
   - NEVER transcribe chart data, graph axes, tables, headers, URLs, or browser footers. The graphics will be rendered directly from the PDF pages. Keep prompts concise and focused.
3. STRICT JSON:
   - Output valid, complete JSON strictly adhering to WRITING_EXAM_SCHEMA.`,
  schema: WRITING_EXAM_SCHEMA,
  config: buildUnifiedConfig(WRITING_EXAM_SCHEMA, { maxOutputTokens: 16000 }),
});

export const WRITING_EVALUATION_CONFIG = Object.freeze({
  name: 'Writing Strict Examiner',
  systemInstruction: 'You are a Senior Cambridge-Certified IELTS Writing Examiner. You grade essays with strict, uncompromising adherence to the official IDP/British Council assessment criteria.',
  schema: WRITING_EVALUATION_SCHEMA,
  config: buildUnifiedConfig(WRITING_EVALUATION_SCHEMA, { temperature: 0.15, maxOutputTokens: 16000 }),
});

/**
 * Extracts numeric HTTP status code or gRPC code representation from a Google API error.
 */
export function getErrorStatusCode(err) {
  if (!err) return null;
  if (typeof err.status === 'number') return err.status;
  if (typeof err.statusCode === 'number') return err.statusCode;
  if (typeof err.code === 'number') return err.code;
  if (typeof err.status === 'string' && /^\d+$/.test(err.status)) return Number(err.status);

  const msg = String(err.message || '');
  const match = msg.match(/\b(429|500|502|503|504)\b/);
  if (match) return Number(match[1]);

  if (err.code === 'RESOURCE_EXHAUSTED' || msg.includes('RESOURCE_EXHAUSTED')) return 429;
  if (err.code === 'UNAVAILABLE' || msg.includes('UNAVAILABLE')) return 503;

  return null;
}

/**
 * Detects whether an error from Google GenAI is transient:
 * HTTP 503 ("model is currently experiencing high demand" / overloaded / unavailable)
 * or HTTP 429 ("rate limit exceeded" / quota / RESOURCE_EXHAUSTED).
 */
export function isTransientGoogleError(err) {
  if (!err) return false;
  const status = getErrorStatusCode(err);
  if (status === 429 || status === 503) return true;

  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('rate limit') ||
    msg.includes('ratelimit') ||
    msg.includes('too many requests') ||
    msg.includes('please try again')
  );
}

export const isResiliencyFallbackError = isTransientGoogleError;

/**
 * Detects whether an error from Google GenAI is a rate limit / quota exhaustion (HTTP 429).
 */
export function isRateLimitError(err) {
  if (!err) return false;
  const status = getErrorStatusCode(err);
  if (status === 429) return true;
  const msg = String(err.message || err.error || '').toLowerCase();
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('ratelimit') ||
    msg.includes('too many requests')
  );
}

/**
 * Cleans dangling tokens, trailing commas, or half-emitted keys at the end of JSON strings.
 */
function cleanDanglingTokensAtEof(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str.trim();
  // Strip trailing markdown fence or backticks if any
  s = s.replace(/```\s*$/, '').trim();
  // Strip trailing commas, colons, or whitespace
  s = s.replace(/[,\s:]+$/, '');
  // Strip dangling unclosed keys or key-colon at EOF, e.g. , "some_key": or , "some_key"
  s = s.replace(/,\s*"[^"]*"\s*:\s*$/, '');
  s = s.replace(/,\s*"[^"]*"\s*$/, '');
  return s;
}

/**
 * Resilient JSON cleaner and repair mechanism.
 * 1. Strips markdown code fences (```json ... ``` or ``` ... ```)
 * 2. Removes accidental trailing commas before } and ] and at EOF
 * 3. Repairs unescaped quotes inside string values via contextual lookahead
 * 4. Normalizes unescaped control characters (\n, \t, etc.)
 * 5. Uses a stack-based bracket balancer to close unclosed objects/arrays
 * 6. Resiliently handles dangling tokens and truncated EOF
 */
export function robustJsonRepair(rawText) {
  if (!rawText || typeof rawText !== 'string') return {};

  let text = rawText.trim();
  // Strip markdown code fences (```json ... ``` or ``` ... ``` or embedded fences)
  text = text.replace(/^```(?:json)?\s*[\r\n]*/i, '')
             .replace(/[\r\n]*```\s*$/i, '')
             .replace(/^```|```$/g, '')
             .trim();

  // Strip any leading non-JSON text before the first { or [
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) startIdx = Math.min(firstBrace, firstBracket);
  else if (firstBrace !== -1) startIdx = firstBrace;
  else if (firstBracket !== -1) startIdx = firstBracket;
  if (startIdx > 0) text = text.slice(startIdx);

  // Fast path 1: direct parse
  try {
    return JSON.parse(text);
  } catch (e) {}

  // Fast path 2: simple trailing comma removal and clean EOF
  try {
    const cleanedSimple = cleanDanglingTokensAtEof(text).replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleanedSimple);
  } catch (e) {}

  // Deep repair pass: escape unescaped inner quotes and control characters
  let inString = false;
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
      } else if (char === '\\') {
        result += char;
        isEscaped = true;
      } else if (char === '"') {
        // Lookahead to check if this quote is closing a string
        const lookahead = text.slice(i + 1, i + 80).trimStart();
        let isClosing = false;
        if (lookahead.length === 0) {
          isClosing = true;
        } else if (lookahead[0] === ':') {
          isClosing = true;
        } else if (lookahead[0] === '}' || lookahead[0] === ']') {
          isClosing = true;
        } else if (lookahead[0] === ',') {
          const afterComma = lookahead.slice(1).trimStart();
          if (afterComma.length === 0 || /^["{\[\d\-tfn}\]]/.test(afterComma)) {
            isClosing = true;
          }
        }

        if (isClosing) {
          inString = false;
          result += char;
        } else {
          // Unescaped quote inside string value -> escape it
          result += '\\"';
        }
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        // drop carriage return
      } else if (char === '\t') {
        result += '\\t';
      } else if (char.charCodeAt(0) < 32) {
        result += ' ';
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
        result += char;
      } else {
        result += char;
      }
    }
  }

  // Remove any trailing commas before } or ]
  result = result.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(result);
  } catch (e) {}

  // Stack-based bracket balance repair for truncated or cut-off output
  const balanceAndParse = (candidateText, candidateInStr) => {
    let cleanCand = cleanDanglingTokensAtEof(candidateText);
    if (candidateInStr) cleanCand += '"';
    cleanCand = cleanCand.replace(/,\s*([}\]])/g, '$1');

    const stack = [];
    let insideStr = false;
    let isEsc = false;
    for (let i = 0; i < cleanCand.length; i++) {
      const c = cleanCand[i];
      if (insideStr) {
        if (isEsc) isEsc = false;
        else if (c === '\\') isEsc = true;
        else if (c === '"') insideStr = false;
      } else {
        if (c === '"') insideStr = true;
        else if (c === '{') stack.push('}');
        else if (c === '[') stack.push(']');
        else if (c === '}') {
          if (stack.length > 0 && stack[stack.length - 1] === '}') stack.pop();
        } else if (c === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === ']') stack.pop();
        }
      }
    }

    if (insideStr) cleanCand += '"';
    cleanCand = cleanDanglingTokensAtEof(cleanCand);
    while (stack.length > 0) {
      cleanCand += stack.pop();
    }
    cleanCand = cleanCand.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleanCand);
  };

  try {
    return balanceAndParse(result, inString);
  } catch (e) {}

  // Secondary repair attempt: strip cut-off tail further and balance
  try {
    let truncated = cleanDanglingTokensAtEof(result);
    const lastValidDelim = Math.max(truncated.lastIndexOf(','), truncated.lastIndexOf('{'), truncated.lastIndexOf('['));
    if (lastValidDelim > 0) {
      const trimmedCandidate = truncated.slice(0, lastValidDelim);
      return balanceAndParse(trimmedCandidate, false);
    }
  } catch (e2) {}

  throw new Error(`JSON parse and repair failed on input: ${text.slice(0, 100)}...`);
}

/**
 * Safely parses raw JSON output from Gemini models, utilizing robustJsonRepair.
 */
export function safeJsonParse(text) {
  try {
    return robustJsonRepair(text);
  } catch (err) {
    console.warn("[safeJsonParse] Fallback to empty object after repair error:", err?.message || err);
    return {};
  }
}

/**
 * Executes generateContent for a given model with exponential backoff retries on transient errors (503/429).
 *
 * @param {Object} params
 * @param {GoogleGenAI} params.ai - GoogleGenAI client instance
 * @param {string} params.model - Model identifier (e.g. 'gemini-3.6-flash', 'gemini-3.5-flash-lite')
 * @param {*} params.contents - Request contents
 * @param {Object} params.config - Unified generation config
 * @param {number} [params.maxRetries=2] - Number of retries on transient errors
 * @param {number} [params.initialDelayMs=2500] - Initial delay in milliseconds (2-3 seconds)
 * @param {Function} [params.onProgress] - Optional status progress notification
 * @returns {Promise<any>}
 */
export async function executeModelWithRetry({
  ai,
  model,
  contents,
  config,
  maxRetries = 2,
  initialDelayMs = 2500,
  onProgress = null,
  hasAlternativeKey = false,
}) {
  let attempt = 0;
  let delay = initialDelayMs;
  const finalConfig = {
    ...config,
    maxOutputTokens: config?.maxOutputTokens || 32768,
  };

  while (true) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: finalConfig,
      });
      return response;
    } catch (err) {
      attempt++;
      const statusCode = getErrorStatusCode(err);
      const isTransient = isTransientGoogleError(err);
      const isRateLimit = statusCode === 429 || isRateLimitError(err);

      // Fast failover on HTTP 429 if an alternative key is available:
      // Do NOT wait for backoff cooldown; immediately throw so caller rotates keys!
      if (isRateLimit && hasAlternativeKey) {
        console.warn(
          `[Gemini Retry] Model '${model}' hit HTTP 429 Rate Limit. Fast failover to alternative API key without cooldown delay.`
        );
        throw err;
      }

      if ((isTransient || isRateLimit) && attempt <= maxRetries) {
        const jitter = Math.floor(Math.random() * 1000);
        const waitMs = delay + jitter;
        console.warn(
          `[Gemini Retry] Transient error (${statusCode || err.message}). Retrying attempt ${attempt}/${maxRetries} in ${(waitMs / 1000).toFixed(1)}s...`
        );
        if (typeof onProgress === 'function') {
          onProgress(`Transient network/rate issue. Retrying in ${(waitMs / 1000).toFixed(1)}s...`);
        }
        await new Promise((r) => setTimeout(r, waitMs));
        delay *= 2; // Exponential backoff
        continue;
      }

      console.error(`[Gemini Execution Error] Final failure on model ${model}:`, err.message);
      throw err;
    }
  }
}

/**
 * Calls Gemini API with Multi-Key Rotation and Model Fallback:
 * - Primary Model: 'gemini-3.6-flash'
 * - Fallback Model: 'gemini-3.5-flash-lite'
 * 
 * Rate Limit (429) & Multi-Key Flow:
 * 1. If HTTP 429 ("RESOURCE_EXHAUSTED") is encountered on the active key, automatically
 *    rotates to the secondary key in the pool immediately without waiting for a 60-second cooldown.
 * 2. If primary model fails across keys, automatically falls back to 'gemini-3.5-flash-lite'.
 */
export async function callGeminiGenerate({ apiKey, contents, config = {}, systemInstruction = null, onProgress = null }) {
  const allKeys = apiKey ? [apiKey] : getGeminiApiKeys();
  if (allKeys.length === 0) {
    throw new Error('GEMINI_API_KEY is required. Please set GEMINI_API_KEY in your environment.');
  }

  // Start with currently active key index
  const startIdx = apiKey ? 0 : (activeKeyIndex % allKeys.length);
  const orderedKeys = [
    ...allKeys.slice(startIdx),
    ...allKeys.slice(0, startIdx),
  ];

  const models = [PRIMARY_GEMINI_MODEL, FALLBACK_GEMINI_MODEL];
  let primaryErr = null;
  let fallbackErr = null;

  for (let mIdx = 0; mIdx < models.length; mIdx++) {
    const currentModel = models[mIdx];
    const isFallback = mIdx > 0;

    for (let kIdx = 0; kIdx < orderedKeys.length; kIdx++) {
      const currentKey = orderedKeys[kIdx];
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const hasAlternativeKey = kIdx < orderedKeys.length - 1;

      const unifiedConfig = {
        ...SHARED_GENERATION_CONFIG,
        maxOutputTokens: 32768,
        ...config,
        ...(systemInstruction ? { systemInstruction } : {}),
      };

      try {
        if (isFallback || kIdx > 0) {
          console.log(
            `[Gemini Call] Executing ${currentModel} (Key slot #${kIdx + 1}/${orderedKeys.length}: ${currentKey.substring(0, 8)}...)...`
          );
        }

        const response = await executeModelWithRetry({
          ai,
          model: currentModel,
          contents,
          config: unifiedConfig,
          maxRetries: isFallback ? 1 : 2,
          initialDelayMs: 2500,
          onProgress,
          hasAlternativeKey,
        });

        // Remember working key
        if (!apiKey) {
          activeKeyIndex = allKeys.indexOf(currentKey);
        }

        return { response, modelUsed: currentModel, apiKeyUsed: currentKey };
      } catch (err) {
        if (isFallback) {
          fallbackErr = err;
        } else {
          primaryErr = err;
        }

        const statusCode = getErrorStatusCode(err);
        const isRateLimit = statusCode === 429 || isRateLimitError(err);

        // If HTTP 429 on this key and we have another key, rotate immediately without cooldown!
        if (isRateLimit && hasAlternativeKey) {
          console.warn(
            `[Gemini Key Rotation] Model '${currentModel}' encountered HTTP 429 Rate Limit on key slot #${kIdx + 1}. ` +
            `Rotating immediately to key slot #${kIdx + 2} without cooldown...`
          );
          if (typeof onProgress === 'function') {
            try {
              onProgress({
                status: 'rotating_key',
                model: currentModel,
                message: `Hit rate limit on API key. Rotating to secondary API key instantly...`,
              });
            } catch {}
          }
          rotateGeminiApiKey();
          continue; // Instantly retry with the next key!
        }

        // If not 429 or no more keys for this model, break to fallback model
        console.warn(
          `[Gemini Diagnostic] Model '${currentModel}' exhausted keys (Status: ${statusCode || 'N/A'}: ${err.message}).`
        );
        break;
      }
    }

    // If primary model failed across all keys, log fallback to secondary model
    if (!isFallback) {
      const pStatus = getErrorStatusCode(primaryErr);
      console.warn(
        `[Gemini Resiliency] Primary model '${PRIMARY_GEMINI_MODEL}' failed across keys (Status: ${pStatus || '503/429'}: ${primaryErr?.message}). ` +
        `Switching to fallback model: '${FALLBACK_GEMINI_MODEL}'...`
      );
      if (typeof onProgress === 'function') {
        try {
          onProgress({
            status: 'fallback',
            model: FALLBACK_GEMINI_MODEL,
            message: `Primary model ${PRIMARY_GEMINI_MODEL} failed. Switching to fallback: ${FALLBACK_GEMINI_MODEL}...`,
          });
        } catch {}
      }
    }
  }

  // Both primary and fallback models (across all keys) failed
  const primaryStatus = getErrorStatusCode(primaryErr);
  const fallbackStatus = getErrorStatusCode(fallbackErr);

  console.error(`[Gemini Resiliency Failed] Both primary and fallback models failed.`);
  console.error(`  - Primary Model:  ${PRIMARY_GEMINI_MODEL} | Status: ${primaryStatus || 'N/A'} | Error: ${primaryErr?.message}`);
  console.error(`  - Fallback Model: ${FALLBACK_GEMINI_MODEL} | Status: ${fallbackStatus || 'N/A'} | Error: ${fallbackErr?.message}`);

  const combinedError = new Error(
    `[Gemini Resiliency Failed] Both primary (${PRIMARY_GEMINI_MODEL} [HTTP ${primaryStatus || 'N/A'}]) ` +
    `and fallback (${FALLBACK_GEMINI_MODEL} [HTTP ${fallbackStatus || 'N/A'}]) failed across ${orderedKeys.length} key(s): ` +
    `Primary: ${primaryErr?.message} | Fallback: ${fallbackErr?.message}`
  );
  combinedError.status = 500;
  combinedError.statusCode = 500;
  combinedError.primaryModel = PRIMARY_GEMINI_MODEL;
  combinedError.primaryStatusCode = primaryStatus;
  combinedError.primaryError = primaryErr;
  combinedError.fallbackModel = FALLBACK_GEMINI_MODEL;
  combinedError.fallbackStatusCode = fallbackStatus;
  combinedError.fallbackError = fallbackErr;
  throw combinedError;
}

/**
 * Uploads a PDF buffer via Google GenAI Files API, executes the given callback,
 * and ensures both the local temp file and remote Gemini file are cleanly deleted in finally.
 * Automatically rotates API keys on HTTP 429 without waiting for a cooldown.
 */
export async function withUploadedGeminiPdf({ apiKey, fileBuffer, fileName = 'document.pdf', fn }) {
  const allKeys = apiKey ? [apiKey] : getGeminiApiKeys();
  if (allKeys.length === 0) {
    throw new Error('GEMINI_API_KEY is required. Please set GEMINI_API_KEY in your environment.');
  }

  // Ensure fileBuffer is standard Buffer
  let buffer;
  if (Buffer.isBuffer(fileBuffer)) {
    buffer = fileBuffer;
  } else if (typeof fileBuffer === 'string') {
    const cleanBase64 = fileBuffer.includes('base64,') ? fileBuffer.split('base64,')[1] : fileBuffer;
    buffer = Buffer.from(cleanBase64, 'base64');
  } else if (fileBuffer instanceof Uint8Array || fileBuffer instanceof ArrayBuffer) {
    buffer = Buffer.from(fileBuffer);
  } else {
    throw new Error('Invalid file buffer provided for PDF upload.');
  }

  const startIdx = apiKey ? 0 : (activeKeyIndex % allKeys.length);
  const orderedKeys = [
    ...allKeys.slice(startIdx),
    ...allKeys.slice(0, startIdx),
  ];

  let lastErr = null;

  for (let kIdx = 0; kIdx < orderedKeys.length; kIdx++) {
    const activeKey = orderedKeys[kIdx];
    const ai = new GoogleGenAI({ apiKey: activeKey });
    const hasAlternativeKey = kIdx < orderedKeys.length - 1;

    // Write temporary local file for Files API uploader
    const tempDir = os.tmpdir();
    const safeName = `gemini_upload_${Date.now()}_${kIdx}_${path.basename(fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const tempFilePath = path.join(tempDir, safeName);

    fs.writeFileSync(tempFilePath, buffer);

    let uploadedFile = null;
    try {
      if (kIdx > 0) {
        console.log(`[Files API] Uploading ${fileName} with key slot #${kIdx + 1} (${activeKey.substring(0, 8)}...)...`);
      } else {
        console.log(`[Files API] Uploading ${fileName} (${buffer.length} bytes) to Google Gemini Files API...`);
      }

      uploadedFile = await ai.files.upload({
        file: tempFilePath,
        config: {
          mimeType: 'application/pdf',
        },
      });
      console.log(`[Files API] File uploaded successfully. Name: ${uploadedFile.name}, URI: ${uploadedFile.uri}`);

      const fileDataPart = {
        fileData: {
          fileUri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType || 'application/pdf',
        },
      };

      const result = await fn({ ai, uploadedFile, fileDataPart, apiKey: activeKey });
      if (!apiKey) {
        activeKeyIndex = allKeys.indexOf(activeKey);
      }
      return result;
    } catch (err) {
      lastErr = err;
      const statusCode = getErrorStatusCode(err);
      const isRateLimit = statusCode === 429 || isRateLimitError(err);

      if (isRateLimit && hasAlternativeKey) {
        console.warn(
          `[Files API] Hit HTTP 429 Rate Limit on key slot #${kIdx + 1}. Rotating to secondary key slot #${kIdx + 2} immediately...`
        );
        rotateGeminiApiKey();
        continue;
      }
      throw err;
    } finally {
      // 1. Clean up local temp file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanErr) {
        console.warn('[Files API] Failed to unlink local temp file:', cleanErr.message);
      }

      // 2. Clean up remote Gemini file to save storage quota
      if (uploadedFile?.name) {
        try {
          console.log(`[Files API] Deleting remote Gemini file ${uploadedFile.name}...`);
          await ai.files.delete({ name: uploadedFile.name });
        } catch (cleanErr) {
          console.warn('[Files API] Failed to delete remote Gemini file:', cleanErr.message);
        }
      }
    }
  }

  throw lastErr;
}

export async function withUploadedGeminiPdfs({ apiKey, files, fn }) {
  const allKeys = apiKey ? [apiKey] : getGeminiApiKeys();
  if (allKeys.length === 0) {
    throw new Error('GEMINI_API_KEY is required. Please set GEMINI_API_KEY in your environment.');
  }

  const normalizeBuffer = (fileBuffer) => {
    if (Buffer.isBuffer(fileBuffer)) return fileBuffer;
    if (typeof fileBuffer === 'string') {
      const cleanBase64 = fileBuffer.includes('base64,') ? fileBuffer.split('base64,')[1] : fileBuffer;
      return Buffer.from(cleanBase64, 'base64');
    }
    if (fileBuffer instanceof Uint8Array || fileBuffer instanceof ArrayBuffer) {
      return Buffer.from(fileBuffer);
    }
    throw new Error('Invalid file buffer provided for PDF upload.');
  };

  const startIdx = apiKey ? 0 : (activeKeyIndex % allKeys.length);
  const orderedKeys = [...allKeys.slice(startIdx), ...allKeys.slice(0, startIdx)];

  let lastErr = null;

  for (let kIdx = 0; kIdx < orderedKeys.length; kIdx++) {
    const activeKey = orderedKeys[kIdx];
    const ai = new GoogleGenAI({ apiKey: activeKey });
    const hasAlternativeKey = kIdx < orderedKeys.length - 1;

    const uploadedFiles = [];
    const tempFilePaths = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const { buffer: rawBuffer, fileName } = files[i];
        const buffer = normalizeBuffer(rawBuffer);

        const tempDir = os.tmpdir();
        const safeName = `gemini_upload_${Date.now()}_${kIdx}_${i}_${path.basename(fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const tempFilePath = path.join(tempDir, safeName);
        fs.writeFileSync(tempFilePath, buffer);
        tempFilePaths.push(tempFilePath);

        console.log(`[Files API] Uploading (${i + 1}/${files.length}) ${fileName} (${buffer.length} bytes)...`);
        const uploadedFile = await ai.files.upload({
          file: tempFilePath,
          config: { mimeType: 'application/pdf' },
        });
        uploadedFiles.push(uploadedFile);
      }

      const fileDataParts = uploadedFiles.map((uf) => ({
        fileData: {
          fileUri: uf.uri,
          mimeType: uf.mimeType || 'application/pdf',
        },
      }));

      const result = await fn({ ai, uploadedFiles, fileDataParts, apiKey: activeKey });
      if (!apiKey) activeKeyIndex = allKeys.indexOf(activeKey);
      return result;
    } catch (err) {
      lastErr = err;
      const statusCode = getErrorStatusCode(err);
      const isRateLimit = statusCode === 429 || isRateLimitError(err);
      if (isRateLimit && hasAlternativeKey) {
        console.warn(`[Files API] Rate limit on key slot #${kIdx + 1}. Rotating...`);
        rotateGeminiApiKey();
        continue;
      }
      throw err;
    } finally {
      for (const p of tempFilePaths) {
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
      }
      for (const uf of uploadedFiles) {
        try { await ai.files.delete({ name: uf.name }); } catch {}
      }
    }
  }

  throw lastErr;
}

// =========================================================================
// 1. STREAMLINED 3-PDF PARSER PIPELINE (BACKEND)
// =========================================================================

/**
 * Parse Reading PDF into structured JSON (Passages 1–3, Questions 1–40, Answer Keys)
 * using Google Files API and strict responseSchema.
 */
export async function parseReadingPdf({ fileBuffer, fileName = 'Reading_Booklet.pdf', apiKey = null, onProgress = null }) {
  if (!fileBuffer) {
    throw new Error('Missing Reading PDF binary buffer.');
  }

  const prompt = `Extract the complete Cambridge IELTS Reading exam from the attached PDF document.
Follow all rules defined in systemInstruction:
1. Extract all reading passages present in the booklet with their authentic titles and uninterrupted texts into "passages". Decompose lettered paragraphs into the "paragraphs" array.
2. Group all questions under their respective passages exactly as structured in the booklet, assigning the exact Cambridge question types, options, and reference boxes.
3. For notes and summary tasks, provide a single "summary_template" or "notes_template" at the group/section level containing sequential gap markers ({{q_num}}). Individual question prompts must contain the concise sentence line with the gap.
4. Extract all answers strictly from the official 'ANSWER KEY' table at the end of the booklet.`;

  return await withUploadedGeminiPdf({
    apiKey,
    fileBuffer,
    fileName,
    fn: async ({ fileDataPart, apiKey: resolvedApiKey }) => {
      const executeReadingCall = async (extraPrompt = '', temperature = 0.1) => {
        const fullPrompt = extraPrompt ? `${prompt}\n\n${extraPrompt}` : prompt;
        return await callGeminiGenerate({
          apiKey: resolvedApiKey || apiKey,
          contents: [
            {
              role: 'user',
              parts: [fileDataPart, { text: fullPrompt }],
            },
          ],
          config: {
            ...READING_PARSER_CONFIG.config,
            maxOutputTokens: 32768,
            temperature,
            systemInstruction: READING_PARSER_CONFIG.systemInstruction,
          },
          onProgress,
        });
      };

      let { response, modelUsed } = await executeReadingCall();
      let parsed = null;
      let parseError = null;

      try {
        parsed = robustJsonRepair(response.text || '{}');
      } catch (err) {
        parseError = err;
      }

      // Check if questions are missing (e.g. Passage 3 missing 32-40)
      const totalParsedQuestions = Array.isArray(parsed?.passages)
        ? parsed.passages.reduce((acc, p) => acc + (Array.isArray(p.questions) ? p.questions.length : 0), 0)
        : 0;
      const isMissingQuestions = totalParsedQuestions < 40;

      // If parsing threw an error, passages array is missing/empty, or questions are incomplete, retry generation once
      if (!parsed || parseError || !Array.isArray(parsed.passages) || parsed.passages.length === 0 || isMissingQuestions) {
        console.warn(
          `[Reading Parser] Parsing incomplete (found ${totalParsedQuestions}/40 questions, ${parseError?.message || 'missing questions'}). Retrying generation once with reinforced prompt...`
        );
        try {
          const retryResult = await executeReadingCall(
            'CRITICAL: Ensure all passages and all 40 questions are fully extracted with valid RFC 8259 JSON output matching READING_EXAM_SCHEMA without skipping questions or omitting options.',
            0.05
          );
          response = retryResult.response;
          modelUsed = retryResult.modelUsed;
          parsed = robustJsonRepair(response.text || '{}');
          parseError = null;
          console.log('[Reading Parser] Retry generation and JSON repair succeeded.');
        } catch (retryErr) {
          console.error('[Reading Parser] Retry also failed to produce valid JSON:', retryErr.message);
          if (!parsed) throw (parseError || retryErr);
        }
      }

      parsed.file_name = fileName;
      parsed.model_used = modelUsed;

      // Extract unified answer keys and flattened questions from structured passages
      const unifiedKeys = {};
      const flattenedQuestions = [];
      const formattedPassages = [];
      const partsMap = {};

      const rawPassages = Array.isArray(parsed.passages) ? parsed.passages : [];
      // Guarantee all 3 passages exist
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
        const passageQNums = (p.questions || []).map(q => Number(q.q_num || q.questionNumber)).filter(n => !isNaN(n) && n > 0);
        const qRange = passageQNums.length > 0
          ? 'Questions ' + Math.min(...passageQNums) + '–' + Math.max(...passageQNums)
          : (p.question_range || p.questionRange || '');
        const qWithRef = Array.isArray(p.questions)
          ? p.questions.find(q => Array.isArray(q.reference_box) && q.reference_box.some(r => r && r.label && !/^option\s+[A-Z]$/i.test(r.label)))
          : null;
        const passageRefBox = qWithRef?.reference_box || p?.reference_box || p?.referenceBox || parsed?.reference_box || null;
        
        // Propagate summary_template across questions if present on passage or any question
        const sharedSummaryTemplate = p.summary_template || (p.questions || []).find(q => q.summary_template)?.summary_template || '';
        if (sharedSummaryTemplate) {
          p.summary_template = sharedSummaryTemplate;
          (p.questions || []).forEach(q => {
            if (/SUMMARY/i.test(q.type || '')) {
              q.summary_template = sharedSummaryTemplate;
            }
          });
        }
        const rawContent = (
          p.content ||
          p.passage_text ||
          p.passageText ||
          p.text ||
          (Array.isArray(p.paragraphs) && p.paragraphs.length > 0 
            ? p.paragraphs.map(pr => (pr.label ? `${pr.label}. ` : '') + (pr.text || pr.content || '')).join('\n\n') 
            : '')
        ).trim();

        const paragraphs = Array.isArray(p.paragraphs) && p.paragraphs.length > 0
          ? p.paragraphs.map(pr => ({
              label: pr.label && String(pr.label).trim() ? String(pr.label).trim().toUpperCase() : '',
              text: (pr.text || pr.content || '').trim(),
              content: (pr.text || pr.content || '').trim(),
            }))
          : (rawContent
              ? rawContent.split(/\n\s*\n/).map(s => {
                  const m = s.match(/^(?:Paragraph\s+)?([A-Z])[\.\:\s\-]+([\s\S]*)$/i);
                  return {
                    label: m ? m[1].toUpperCase() : '',
                    text: m ? m[2].trim() : s.trim(),
                    content: m ? m[2].trim() : s.trim(),
                  };
                }).filter(pr => pr.text)
              : []);

        const pageContentHtml = p.page_content_html || p.pageContentHtml || '';

        const pItem = {
          id: partNum,
          part: partNum,
          title: p.title || `Passage ${partNum}`,
          subtitle: p.subtitle || '',
          content: rawContent,
          passage_text: rawContent,
          passageText: rawContent,
          text: rawContent,
          paragraphs: paragraphs,
          page_content_html: pageContentHtml,
          notes_template: p.notes_template || '',
          pdf_name: fileName,
          question_range: qRange,
          reference_box: passageRefBox,
          referenceBox: passageRefBox,
          questions: Array.isArray(p.questions) ? p.questions : [],
        };
        formattedPassages.push(pItem);

        partsMap[`part${partNum}`] = {
          title: p.title || `Passage ${partNum}`,
          subtitle: p.subtitle || '',
          content: rawContent,
          passageText: rawContent,
          passage_text: rawContent,
          text: rawContent,
          paragraphs: paragraphs,
          page_content_html: pageContentHtml,
          notes_template: p.notes_template || '',
          questionRange: qRange,
          reference_box: passageRefBox,
          referenceBox: passageRefBox,
        };

        if (Array.isArray(p.questions)) {
          p.questions.sort((a, b) => Number(a.q_num || a.questionNumber || 0) - Number(b.q_num || b.questionNumber || 0));
          p.questions.forEach((q) => {
            const qNum = Number(q.q_num || q.questionNumber);
            if (qNum) {
              const ansStr = String(q.correct_answer ?? '').trim();
              if (ansStr) {
                unifiedKeys[String(qNum)] = ansStr;
              }

              const isMatchingOrSummaryMatching = q.type === 'MATCHING' || q.type === 'SUMMARY_MATCHING' || String(q.type || '').includes('MATCHING');
              const qRefBox = (Array.isArray(q.reference_box) && q.reference_box.length > 0)
                ? q.reference_box
                : (isMatchingOrSummaryMatching ? passageRefBox : null);

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
                reference_box: qRefBox,
                referenceBox: qRefBox,
                summary_template: q.summary_template || q.notes_template || '',
                notes_template: q.notes_template || q.summary_template || '',
                acceptedAnswers: ansStr ? [ansStr] : [],
              });
            }
          });
        }
      });

      flattenedQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

      parsed.passages = formattedPassages;
      parsed.parts = partsMap;
      parsed.questions = flattenedQuestions;
      parsed.answer_keys = unifiedKeys;
      parsed.answerKeys = unifiedKeys;
      parsed.sections = formattedPassages.map((p) => ({
        part: p.id,
        id: p.id,
        title: p.title,
        content: p.content,
        passage_text: p.content,
        passageText: p.content,
        text: p.content,
        page_content_html: p.page_content_html,
        paragraphs: p.paragraphs,
        question_range: p.question_range,
        answer_keys: (() => {
          const passageQNums = new Set((p.questions || []).map(q => Number(q.q_num || q.questionNumber)));
          return Object.entries(unifiedKeys)
            .filter(([k]) => passageQNums.has(Number(k)))
            .map(([k, v]) => ({ questionNumber: Number(k), answer: v }));
        })(),
      }));

      return parsed;
    },
  });
}

export async function parseReadingPdfs({ files, apiKey = null, onProgress = null }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Missing Reading PDF file(s).');
  }

  const fileList = files.map((f, i) => ({
    buffer: f.buffer || f.fileBuffer,
    fileName: f.fileName || `Reading_${i + 1}.pdf`,
  }));

  const multiSourceInstruction = fileList.length > 1
    ? `\n\nYou have been given ${fileList.length} REFERENCE IELTS Reading booklets, attached as separate PDF files, each with its own official answer key. Their filenames are: ${fileList.map(f => f.fileName).join(', ')}.\nUse ALL of them together as your source material, following the MULTI-DOCUMENT INPUT HANDLING rules in your system instructions: select 3 whole passages from across these files (prefer different files per passage), covering the widest possible variety of Cambridge question types across the 40 questions, and pull every answer strictly from the correct source file's own answer key.`
    : '';

  const prompt = `Extract the complete Cambridge IELTS Reading exam from the attached PDF document(s).${multiSourceInstruction}
Follow all rules defined in systemInstruction:
1. Extract all reading passages present in the document(s) with their authentic titles and uninterrupted texts into "passages", preserving paragraph structures.
2. Group all questions under their respective passages exactly as structured in the source document(s), assigning exact Cambridge question types, options, and reference boxes.
3. For notes and summary tasks, provide a single "summary_template" or "notes_template" with sequential gap markers ({{q_num}}).
4. Extract all answers strictly from the official 'ANSWER KEY' table of the respective source file.`;

  return await withUploadedGeminiPdfs({
    apiKey,
    files: fileList,
    fn: async ({ fileDataParts, apiKey: resolvedApiKey }) => {
      const executeReadingCall = async (extraPrompt = '', temperature = 0.1) => {
        const fullPrompt = extraPrompt ? `${prompt}\n\n${extraPrompt}` : prompt;
        return await callGeminiGenerate({
          apiKey: resolvedApiKey || apiKey,
          contents: [
            {
              role: 'user',
              parts: [...fileDataParts, { text: fullPrompt }],
            },
          ],
          config: {
            ...READING_PARSER_CONFIG.config,
            maxOutputTokens: 32768,
            temperature,
            systemInstruction: READING_PARSER_CONFIG.systemInstruction,
          },
          onProgress,
        });
      };

      let { response, modelUsed } = await executeReadingCall();
      let parsed = null;
      let parseError = null;
      try {
        parsed = robustJsonRepair(response.text || '{}');
      } catch (err) {
        parseError = err;
      }

      const totalParsedQuestions = Array.isArray(parsed?.passages)
        ? parsed.passages.reduce((acc, p) => acc + (Array.isArray(p.questions) ? p.questions.length : 0), 0)
        : 0;
      const isMissingQuestions = totalParsedQuestions < 40;

      if (!parsed || parseError || !Array.isArray(parsed.passages) || parsed.passages.length === 0 || isMissingQuestions) {
        console.warn(`[Reading Parser Multi] Incomplete (${totalParsedQuestions}/40). Retrying once with reinforced prompt...`);
        try {
          const retryResult = await executeReadingCall(
            'CRITICAL: Ensure all passages and all 40 questions are fully extracted with valid RFC 8259 JSON output matching READING_EXAM_SCHEMA without skipping questions or omitting options.',
            0.05
          );
          response = retryResult.response;
          modelUsed = retryResult.modelUsed;
          parsed = robustJsonRepair(response.text || '{}');
          parseError = null;
          console.log('[Reading Parser Multi] Retry succeeded.');
        } catch (retryErr) {
          console.error('[Reading Parser Multi] Retry also failed:', retryErr.message);
          if (!parsed) throw (parseError || retryErr);
        }
      }

      parsed.file_name = fileList.map((f) => f.fileName).join(', ');
      parsed.model_used = modelUsed;
      const fileName = parsed.file_name;

      // Extract unified answer keys and flattened questions from structured passages
      const unifiedKeys = {};
      const flattenedQuestions = [];
      const formattedPassages = [];
      const partsMap = {};

      const rawPassages = Array.isArray(parsed.passages) ? parsed.passages : [];
      // Guarantee all 3 passages exist
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
        const passageQNums = (p.questions || []).map(q => Number(q.q_num || q.questionNumber)).filter(n => !isNaN(n) && n > 0);
        const qRange = passageQNums.length > 0
          ? 'Questions ' + Math.min(...passageQNums) + '–' + Math.max(...passageQNums)
          : (p.question_range || p.questionRange || '');
        const qWithRef = Array.isArray(p.questions)
          ? p.questions.find(q => Array.isArray(q.reference_box) && q.reference_box.some(r => r && r.label && !/^option\s+[A-Z]$/i.test(r.label)))
          : null;
        const passageRefBox = qWithRef?.reference_box || p?.reference_box || p?.referenceBox || parsed?.reference_box || null;
        
        // Propagate summary_template across questions if present on passage or any question
        const sharedSummaryTemplate = p.summary_template || (p.questions || []).find(q => q.summary_template)?.summary_template || '';
        if (sharedSummaryTemplate) {
          p.summary_template = sharedSummaryTemplate;
          (p.questions || []).forEach(q => {
            if (/SUMMARY/i.test(q.type || '')) {
              q.summary_template = sharedSummaryTemplate;
            }
          });
        }
        const rawContent = (
          p.content ||
          p.passage_text ||
          p.passageText ||
          p.text ||
          (Array.isArray(p.paragraphs) && p.paragraphs.length > 0 
            ? p.paragraphs.map(pr => (pr.label ? `${pr.label}. ` : '') + (pr.text || pr.content || '')).join('\n\n') 
            : '')
        ).trim();

        const paragraphs = Array.isArray(p.paragraphs) && p.paragraphs.length > 0
          ? p.paragraphs.map(pr => ({
              label: pr.label && String(pr.label).trim() ? String(pr.label).trim().toUpperCase() : '',
              text: (pr.text || pr.content || '').trim(),
              content: (pr.text || pr.content || '').trim(),
            }))
          : (rawContent
              ? rawContent.split(/\n\s*\n/).map(s => {
                  const m = s.match(/^(?:Paragraph\s+)?([A-Z])[\.\:\s\-]+([\s\S]*)$/i);
                  return {
                    label: m ? m[1].toUpperCase() : '',
                    text: m ? m[2].trim() : s.trim(),
                    content: m ? m[2].trim() : s.trim(),
                  };
                }).filter(pr => pr.text)
              : []);

        const pageContentHtml = p.page_content_html || p.pageContentHtml || '';

        const pItem = {
          id: partNum,
          part: partNum,
          title: p.title || `Passage ${partNum}`,
          subtitle: p.subtitle || '',
          content: rawContent,
          passage_text: rawContent,
          passageText: rawContent,
          text: rawContent,
          paragraphs: paragraphs,
          page_content_html: pageContentHtml,
          notes_template: p.notes_template || '',
          pdf_name: fileName,
          question_range: qRange,
          reference_box: passageRefBox,
          referenceBox: passageRefBox,
          questions: Array.isArray(p.questions) ? p.questions : [],
        };
        formattedPassages.push(pItem);

        partsMap[`part${partNum}`] = {
          title: p.title || `Passage ${partNum}`,
          subtitle: p.subtitle || '',
          content: rawContent,
          passageText: rawContent,
          passage_text: rawContent,
          text: rawContent,
          paragraphs: paragraphs,
          page_content_html: pageContentHtml,
          notes_template: p.notes_template || '',
          questionRange: qRange,
          reference_box: passageRefBox,
          referenceBox: passageRefBox,
        };

        if (Array.isArray(p.questions)) {
          p.questions.sort((a, b) => Number(a.q_num || a.questionNumber || 0) - Number(b.q_num || b.questionNumber || 0));
          p.questions.forEach((q) => {
            const qNum = Number(q.q_num || q.questionNumber);
            if (qNum) {
              const ansStr = String(q.correct_answer ?? '').trim();
              if (ansStr) {
                unifiedKeys[String(qNum)] = ansStr;
              }

              const isMatchingOrSummaryMatching = q.type === 'MATCHING' || q.type === 'SUMMARY_MATCHING' || String(q.type || '').includes('MATCHING');
              const qRefBox = (Array.isArray(q.reference_box) && q.reference_box.length > 0)
                ? q.reference_box
                : (isMatchingOrSummaryMatching ? passageRefBox : null);

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
                reference_box: qRefBox,
                referenceBox: qRefBox,
                summary_template: q.summary_template || q.notes_template || '',
                notes_template: q.notes_template || q.summary_template || '',
                acceptedAnswers: ansStr ? [ansStr] : [],
              });
            }
          });
        }
      });

      flattenedQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

      parsed.passages = formattedPassages;
      parsed.parts = partsMap;
      parsed.questions = flattenedQuestions;
      parsed.answer_keys = unifiedKeys;
      parsed.answerKeys = unifiedKeys;
      parsed.sections = formattedPassages.map((p) => ({
        part: p.id,
        id: p.id,
        title: p.title,
        content: p.content,
        passage_text: p.content,
        passageText: p.content,
        text: p.content,
        page_content_html: p.page_content_html,
        paragraphs: p.paragraphs,
        question_range: p.question_range,
        answer_keys: (() => {
          const passageQNums = new Set((p.questions || []).map(q => Number(q.q_num || q.questionNumber)));
          return Object.entries(unifiedKeys)
            .filter(([k]) => passageQNums.has(Number(k)))
            .map(([k, v]) => ({ questionNumber: Number(k), answer: v }));
        })(),
      }));

      return parsed;
    },
  });
}

/**
 * Parse Listening PDF into structured JSON (Parts 1–4, Questions 1–40, Answer Keys)
 * using Google Files API and strict responseSchema.
 */
export async function parseListeningPdf({ fileBuffer, fileName = 'Listening_Booklet.pdf', apiKey = null, onProgress = null }) {
  if (!fileBuffer) {
    throw new Error('Missing Listening PDF binary buffer.');
  }

  const prompt = `Extract the complete Cambridge IELTS Listening exam from the attached PDF document.
Follow all rules defined in systemInstruction:
1. Extract all 4 parts with their titles, instructions, and questions into "parts".
2. For notes, forms, and table completion tasks (especially Parts 1, 3, and 4):
   - Placeholders in notes_template, table_template, or form_template MUST strictly use the global question number: {{q_num}} (e.g. {{25}}, {{26}}). NEVER use 0-based offsets or reset numbering.
   - If a section contains mixed content (text -> table -> text), unify into a single continuous "notes_template" embedding the Markdown table in place.
   - For "TABLE_COMPLETION": Generate a valid Markdown table in "notes_template" retaining ALL columns, headers, and static context rows verbatim (e.g. 'recording them', 'talking to tutor'). If questions share the same row (e.g. Q25 in Col 1, Q26 in Col 3), keep them in the same row with {{25}} and {{26}} placeholders.
   - For "FORM_COMPLETION": Generate the full form in "notes_template" with all section headers (e.g. 'Personal details') and non-gap lines (e.g. 'Name: Kevin Walker', 'Maximum rent: £650 a month').
   - For "NOTES_COMPLETION": Build a comprehensive "notes_template" retaining all section subheadings, non-question sentences, and bullet points with {{q_num}} gap markers.
   - On every individual question item, assign its "subheading" and populate "context_bullets" with any surrounding informative bullet points.
3. Classify all questions accurately according to Cambridge types, with options and reference_box.
4. Extract all 40 answers from the official Answer Key.`;

  return await withUploadedGeminiPdf({
    apiKey,
    fileBuffer,
    fileName,
    fn: async ({ fileDataPart, apiKey: resolvedApiKey }) => {
      const executeListeningCall = async (extraPrompt = '', temperature = 0.1) => {
        const fullPrompt = extraPrompt ? `${prompt}\n\n${extraPrompt}` : prompt;
        return await callGeminiGenerate({
          apiKey: resolvedApiKey || apiKey,
          contents: [
            {
              role: 'user',
              parts: [fileDataPart, { text: fullPrompt }],
            },
          ],
          config: {
            ...LISTENING_PARSER_CONFIG.config,
            maxOutputTokens: 32768,
            temperature,
            systemInstruction: LISTENING_PARSER_CONFIG.systemInstruction,
          },
          onProgress,
        });
      };

      let { response, modelUsed } = await executeListeningCall();
      let parsed = null;
      let parseError = null;

      try {
        parsed = robustJsonRepair(response.text || '{}');
      } catch (err) {
        parseError = err;
      }

      // If parsing threw an error or parts array is missing/empty, retry generation once
      if (!parsed || parseError || !Array.isArray(parsed.parts) || parsed.parts.length === 0) {
        console.warn(
          `[Listening Parser] Parsing failed or returned invalid parts (${parseError?.message || 'empty parts'}). Retrying generation once with lower temperature and RFC 8259 instruction...`
        );
        try {
          const retryResult = await executeListeningCall(
            'CRITICAL: Ensure valid RFC 8259 JSON output without syntax errors or unescaped quotes.',
            0.05
          );
          response = retryResult.response;
          modelUsed = retryResult.modelUsed;
          parsed = robustJsonRepair(response.text || '{}');
          parseError = null;
          console.log('[Listening Parser] Retry generation and JSON repair succeeded.');
        } catch (retryErr) {
          console.error('[Listening Parser] Retry also failed to produce valid JSON:', retryErr.message);
          if (!parsed) throw (parseError || retryErr);
        }
      }

      parsed.file_name = fileName;
      parsed.model_used = modelUsed;

      const unifiedKeys = {};
      const flattenedQuestions = [];
      const formattedParts = [];

      const rawParts = Array.isArray(parsed.parts) ? parsed.parts : [];
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
        const partQNums = (p.questions || []).map(q => Number(q.q_num || q.questionNumber)).filter(n => !isNaN(n) && n > 0);
        const qRange = partQNums.length > 0
          ? 'Questions ' + Math.min(...partQNums) + '–' + Math.max(...partQNums)
          : (p.question_range || p.questionRange || '');
        const partRefBox = Array.isArray(p.reference_box) ? p.reference_box : null;

        if (Array.isArray(p.questions)) {
          p.questions.sort((a, b) => Number(a.q_num || a.questionNumber || 0) - Number(b.q_num || b.questionNumber || 0));
        }

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
          questions: Array.isArray(p.questions) ? p.questions : [],
        });

        if (Array.isArray(p.questions)) {
          p.questions.forEach((q) => {
            const qNum = Number(q.q_num || q.questionNumber);
            if (qNum) {
              const ansStr = String(q.correct_answer ?? '').trim();
              if (ansStr) {
                unifiedKeys[String(qNum)] = ansStr;
              }

              const qRefBox = (Array.isArray(q.reference_box) && q.reference_box.length > 0)
                ? q.reference_box
                : partRefBox;

              flattenedQuestions.push({
                id: `lq-${qNum}`,
                questionNumber: qNum,
                partId: partNum,
                type: q.type || (qRefBox ? 'MATCHING' : 'FILL_BLANK'),
                instruction: q.instruction || p.instruction || '',
                title: q.title || '',
                subheading: q.subheading || '',
                context_bullets: Array.isArray(q.context_bullets) ? q.context_bullets : [],
                flow_step: q.flow_step || '',
                summary_template: q.summary_template || q.notes_template || p.notes_template || '',
                notes_template: q.notes_template || q.summary_template || p.notes_template || '',
                prompt: q.prompt || `Question ${qNum}`,
                text: q.prompt || `Question ${qNum}`,
                options: Array.isArray(q.options) ? q.options : [],
                reference_box: qRefBox,
                referenceBox: qRefBox,
                acceptedAnswers: ansStr ? [ansStr] : [],
              });
            }
          });
        }
      });

      flattenedQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

      parsed.parts = formattedParts;
      parsed.questions = flattenedQuestions;
      parsed.answer_keys = unifiedKeys;
      parsed.answerKeys = unifiedKeys;
      parsed.sections = formattedParts.map((p) => ({
        part: p.partId,
        id: p.partId,
        title: p.title,
        notes_template: p.notes_template || '',
        page_content_html: p.page_content_html || '',
        question_range: p.question_range,
        answer_keys: (() => {
          const partQNums = new Set((p.questions || []).map(q => Number(q.q_num || q.questionNumber)));
          return Object.entries(unifiedKeys)
            .filter(([k]) => partQNums.has(Number(k)))
            .map(([k, v]) => ({ questionNumber: Number(k), answer: v }));
        })(),
      }));

      return parsed;
    },
  });
}

export async function parseListeningPdfs({ files, apiKey = null, onProgress = null }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Missing Listening PDF file(s).');
  }

  const fileList = files.map((f, i) => ({
    buffer: f.buffer || f.fileBuffer,
    fileName: f.fileName || `Listening_${i + 1}.pdf`,
  }));

  const multiSourceInstruction = fileList.length > 1
    ? `\n\nYou have been given ${fileList.length} REFERENCE IELTS Listening booklets, attached as separate PDF files, each with its own official answer key. Their filenames are: ${fileList.map(f => f.fileName).join(', ')}.\nUse ALL of them together as your source material, following the MULTI-DOCUMENT INPUT HANDLING rules in your system instructions: select 4 whole parts from across these files (prefer different files per part), covering the widest possible variety of Cambridge question types across the 40 questions, and pull every answer strictly from the correct source file's own answer key.`
    : '';

  const prompt = `Extract the complete Cambridge IELTS Listening exam from the attached PDF document(s).${multiSourceInstruction}
Follow all rules defined in systemInstruction:
1. Extract all 4 parts with their titles, instructions, and questions into "parts".
2. For notes, forms, and table completion tasks (especially Parts 1, 3, and 4):
   - For "TABLE_COMPLETION": Generate a valid Markdown table in "notes_template" retaining ALL columns, headers, and static context rows verbatim (e.g. 'recording them', 'talking to tutor'). If questions share the same row (e.g. Q25 in Col 1, Q26 in Col 3), keep them in the same row with {{25}} and {{26}} placeholders.
   - For "FORM_COMPLETION": Generate the full form in "notes_template" with all section headers (e.g. 'Personal details') and non-gap lines (e.g. 'Name: Kevin Walker', 'Maximum rent: £650 a month').
   - For "NOTES_COMPLETION": Build a comprehensive "notes_template" retaining all section subheadings, non-question sentences, and bullet points with {{q_num}} gap markers.
   - On every individual question item, assign its "subheading" and populate "context_bullets" with any surrounding informative bullet points.
3. Classify all questions accurately according to Cambridge types, with options and reference_box.
4. Extract all 40 answers from the official Answer Key of the specific source file each part came from.`;

  return await withUploadedGeminiPdfs({
    apiKey,
    files: fileList,
    fn: async ({ fileDataParts, apiKey: resolvedApiKey }) => {
      const executeListeningCall = async (extraPrompt = '', temperature = 0.1) => {
        const fullPrompt = extraPrompt ? `${prompt}\n\n${extraPrompt}` : prompt;
        return await callGeminiGenerate({
          apiKey: resolvedApiKey || apiKey,
          contents: [{ role: 'user', parts: [...fileDataParts, { text: fullPrompt }] }],
          config: {
            ...LISTENING_PARSER_CONFIG.config,
            maxOutputTokens: 32768,
            temperature,
            systemInstruction: LISTENING_PARSER_CONFIG.systemInstruction,
          },
          onProgress,
        });
      };

      let { response, modelUsed } = await executeListeningCall();
      let parsed = null;
      let parseError = null;
      try {
        parsed = robustJsonRepair(response.text || '{}');
      } catch (err) {
        parseError = err;
      }

      if (!parsed || parseError || !Array.isArray(parsed.parts) || parsed.parts.length === 0) {
        console.warn('[Listening Parser Multi] Invalid parts. Retrying once...');
        try {
          const retryResult = await executeListeningCall(
            'CRITICAL: Ensure valid RFC 8259 JSON output without syntax errors or unescaped quotes.',
            0.05
          );
          response = retryResult.response;
          modelUsed = retryResult.modelUsed;
          parsed = robustJsonRepair(response.text || '{}');
          parseError = null;
        } catch (retryErr) {
          if (!parsed) throw (parseError || retryErr);
        }
      }

      parsed.file_name = fileList.map((f) => f.fileName).join(', ');
      parsed.model_used = modelUsed;

      const unifiedKeys = {};
      const flattenedQuestions = [];
      const formattedParts = [];

      const rawParts = Array.isArray(parsed.parts) ? parsed.parts : [];
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
        const partQNums = (p.questions || []).map(q => Number(q.q_num || q.questionNumber)).filter(n => !isNaN(n) && n > 0);
        const qRange = partQNums.length > 0
          ? 'Questions ' + Math.min(...partQNums) + '–' + Math.max(...partQNums)
          : (p.question_range || p.questionRange || '');
        const partRefBox = Array.isArray(p.reference_box) ? p.reference_box : null;

        if (Array.isArray(p.questions)) {
          p.questions.sort((a, b) => Number(a.q_num || a.questionNumber || 0) - Number(b.q_num || b.questionNumber || 0));
        }

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
          questions: Array.isArray(p.questions) ? p.questions : [],
        });

        if (Array.isArray(p.questions)) {
          p.questions.forEach((q) => {
            const qNum = Number(q.q_num || q.questionNumber);
            if (qNum) {
              const ansStr = String(q.correct_answer ?? '').trim();
              if (ansStr) {
                unifiedKeys[String(qNum)] = ansStr;
              }

              const qRefBox = (Array.isArray(q.reference_box) && q.reference_box.length > 0)
                ? q.reference_box
                : partRefBox;

              flattenedQuestions.push({
                id: `lq-${qNum}`,
                questionNumber: qNum,
                partId: partNum,
                type: q.type || (qRefBox ? 'MATCHING' : 'FILL_BLANK'),
                instruction: q.instruction || p.instruction || '',
                title: q.title || '',
                subheading: q.subheading || '',
                context_bullets: Array.isArray(q.context_bullets) ? q.context_bullets : [],
                flow_step: q.flow_step || '',
                summary_template: q.summary_template || q.notes_template || p.notes_template || '',
                notes_template: q.notes_template || q.summary_template || p.notes_template || '',
                prompt: q.prompt || `Question ${qNum}`,
                text: q.prompt || `Question ${qNum}`,
                options: Array.isArray(q.options) ? q.options : [],
                reference_box: qRefBox,
                referenceBox: qRefBox,
                acceptedAnswers: ansStr ? [ansStr] : [],
              });
            }
          });
        }
      });

      flattenedQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

      parsed.parts = formattedParts;
      parsed.questions = flattenedQuestions;
      parsed.answer_keys = unifiedKeys;
      parsed.answerKeys = unifiedKeys;
      parsed.sections = formattedParts.map((p) => ({
        part: p.partId,
        id: p.partId,
        title: p.title,
        notes_template: p.notes_template || '',
        page_content_html: p.page_content_html || '',
        question_range: p.question_range,
        answer_keys: (() => {
          const partQNums = new Set((p.questions || []).map(q => Number(q.q_num || q.questionNumber)));
          return Object.entries(unifiedKeys)
            .filter(([k]) => partQNums.has(Number(k)))
            .map(([k, v]) => ({ questionNumber: Number(k), answer: v }));
        })(),
      }));

      return parsed;
    },
  });
}

/**
 * Parse Writing PDF into structured JSON (Task 1 & Task 2)
 * using Google Files API, minimal token footprint, and strict responseSchema.
 */
export async function parseWritingPdf({ fileBuffer, fileName = 'Writing_Booklet.pdf', apiKey = null, onProgress = null }) {
  if (!fileBuffer) {
    throw new Error('Missing Writing PDF binary buffer.');
  }

  const prompt = `Index Writing Task 1 and Writing Task 2 from the attached PDF booklet.
Assign page_index: 0 for Task 1 and page_index: 1 for Task 2.
Extract only concise assignment prompts without transcribing charts, tables, numbers, or long OCR blocks. Strictly adhere to WRITING_EXAM_SCHEMA.`;

  return await withUploadedGeminiPdf({
    apiKey,
    fileBuffer,
    fileName,
    fn: async ({ fileDataPart, apiKey: resolvedApiKey }) => {
      const callParser = async (promptText, temperature = 0.1) => {
        return await callGeminiGenerate({
          apiKey: resolvedApiKey || apiKey,
          contents: [
            {
              role: 'user',
              parts: [fileDataPart, { text: promptText }],
            },
          ],
          config: {
            ...WRITING_PARSER_CONFIG.config,
            maxOutputTokens: 16000,
            temperature,
            systemInstruction: WRITING_PARSER_CONFIG.systemInstruction,
          },
          onProgress,
        });
      };

      let { response, modelUsed } = await callParser(prompt);
      let parsed = null;
      let parseError = null;

      try {
        parsed = robustJsonRepair(response.text || '{}');
      } catch (err) {
        parseError = err;
      }

      // If JSON parse error occurs or tasks are missing, perform 1 automatic retry
      if (!parsed || parseError || (!parsed.task_1 && !parsed.task_2)) {
        console.warn(`[Writing Parser] JSON parsing incomplete or failed (${parseError?.message}). Executing 1 automatic retry with temperature 0.05...`);
        try {
          const retryCall = await callParser(
            `${prompt}\nCRITICAL: Ensure valid RFC 8259 JSON output with page_index: 0 for Task 1, page_index: 1 for Task 2, and concise prompts without syntax errors or trailing commas. Strictly adhere to WRITING_EXAM_SCHEMA.`,
            0.05
          );
          response = retryCall.response;
          modelUsed = retryCall.modelUsed;
          parsed = robustJsonRepair(response.text || '{}');
          parseError = null;
          console.log('[Writing Parser] Automatic retry succeeded with valid JSON.');
        } catch (retryErr) {
          console.error('[Writing Parser] Automatic retry failed after JSON error:', retryErr.message);
          throw new Error(`Writing PDF parser failed to produce valid JSON: ${parseError?.message || retryErr.message}`);
        }
      }

      parsed.file_name = fileName;
      parsed.model_used = modelUsed;

      const t1 = parsed.task_1 || {};
      const t2 = parsed.task_2 || {};

      const t1Title = t1.title || 'Task 1: Academic Report';
      const t2Title = t2.title || 'Task 2: Discursive Essay';
      const t1PageIndex = typeof t1.page_index === 'number' ? t1.page_index : 0;
      const t2PageIndex = typeof t2.page_index === 'number' ? t2.page_index : 1;
      const t1MinWords = Number(t1.min_words || 150);
      const t2MinWords = Number(t2.min_words || 250);
      const t1Time = Number(t1.suggested_time || 20);
      const t2Time = Number(t2.suggested_time || 40);
      const t1Prompt = t1.prompt || '';
      const t2Prompt = t2.prompt || '';

      parsed.task_1_prompt = t1Prompt;
      parsed.task_2_prompt = t2Prompt;

      parsed.tasks = {
        task1: {
          title: t1Title,
          recommended_mins: t1Time,
          min_words: t1MinWords,
          prompt: t1Prompt,
          instructions: `You should spend about ${t1Time} minutes on this task. Write at least ${t1MinWords} words.`,
          page_index: t1PageIndex,
        },
        task2: {
          title: t2Title,
          recommended_mins: t2Time,
          min_words: t2MinWords,
          prompt: t2Prompt,
          instructions: `You should spend about ${t2Time} minutes on this task. Write at least ${t2MinWords} words.`,
          page_index: t2PageIndex,
        },
      };

      parsed.sections = [
        {
          part: 1,
          title: t1Title,
          prompt: t1Prompt,
          min_words: t1MinWords,
          recommended_mins: t1Time,
          page_index: t1PageIndex,
        },
        {
          part: 2,
          title: t2Title,
          prompt: t2Prompt,
          min_words: t2MinWords,
          recommended_mins: t2Time,
          page_index: t2PageIndex,
        },
      ];

      return parsed;
    },
  });
}

/**
 * Consolidated 3-PDF parser pipeline:
 * Executes strictly sequentially with 4-second delay between sections to respect free-tier quotas:
 * 1. Parse Reading -> enforce 4s delay
 * 2. Parse Listening -> enforce 4s delay
 * 3. Parse Writing -> build consolidated exam payload
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
  onProgress = null,
}) {
  console.log('[3-PDF Parser Pipeline] Starting sequential Gemini parsing pipeline...');

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const results = {};

  // Step 1: Reading PDF
  if (readingPdfBuffer) {
    console.log('[3-PDF Parser Pipeline] [Step 1/3] Parsing Reading PDF...');
    if (typeof onProgress === 'function') {
      onProgress({ step: 'reading', message: 'Parsing Reading PDF booklet...' });
    }
    results.reading = await parseReadingPdf({
      fileBuffer: readingPdfBuffer,
      fileName: readingFileName,
      onProgress,
    });
  }

  // Mandatory 4-second delay between sections if more sections follow
  if (readingPdfBuffer && (listeningPdfBuffer || writingPdfBuffer)) {
    console.log('[3-PDF Parser Pipeline] Rate-limit guard: 4-second delay before Listening...');
    if (typeof onProgress === 'function') {
      onProgress({ step: 'delay', message: 'Quota protection: Pausing 4s before Listening section...' });
    }
    await sleep(4000);
  }

  // Step 2: Listening PDF
  if (listeningPdfBuffer) {
    console.log('[3-PDF Parser Pipeline] [Step 2/3] Parsing Listening PDF...');
    if (typeof onProgress === 'function') {
      onProgress({ step: 'listening', message: 'Parsing Listening PDF booklet...' });
    }
    results.listening = await parseListeningPdf({
      fileBuffer: listeningPdfBuffer,
      fileName: listeningFileName,
      onProgress,
    });
  }

  // Mandatory 4-second delay between sections if Writing follows
  if (listeningPdfBuffer && writingPdfBuffer) {
    console.log('[3-PDF Parser Pipeline] Rate-limit guard: 4-second delay before Writing...');
    if (typeof onProgress === 'function') {
      onProgress({ step: 'delay', message: 'Quota protection: Pausing 4s before Writing section...' });
    }
    await sleep(4000);
  }

  // Step 3: Writing PDF
  if (writingPdfBuffer) {
    console.log('[3-PDF Parser Pipeline] [Step 3/3] Parsing Writing PDF...');
    if (typeof onProgress === 'function') {
      onProgress({ step: 'writing', message: 'Parsing Writing PDF booklet...' });
    }
    results.writing = await parseWritingPdf({
      fileBuffer: writingPdfBuffer,
      fileName: writingFileName,
      onProgress,
    });
  }

  if (!results.reading && !results.listening && !results.writing) {
    throw new Error('No PDF files provided to parse. Please upload readingPdf, listeningPdf, or writingPdf.');
  }

  // Build structured Reading parts
  let readingPayload = null;
  if (results.reading) {
    const r = results.reading;
    const passages = r.passages || [1, 2, 3].map((pId) => {
      const qNums = (r.questions || []).filter(q => Number(q.passageId || q.part) === pId).map(q => Number(q.questionNumber || q.q_num)).filter(n => !isNaN(n) && n > 0);
      const qRange = qNums.length > 0 ? 'Questions ' + Math.min(...qNums) + '–' + Math.max(...qNums) : '';
      return {
        id: pId,
        part: pId,
        title: `Passage ${pId}`,
        content: '',
        passage_text: '',
        pdf_name: readingFileName,
        question_range: qRange,
      };
    });

    readingPayload = {
      ...r,
      passages,
      sections: r.sections || passages.map((p) => ({
        part: p.id,
        title: p.title,
        passage_text: p.content,
        question_range: p.question_range,
      })),
      parts: r.parts || {},
      questions: r.questions || [],
      answer_keys: r.answer_keys || r.answerKeys || {},
    };
  }

  // Build structured Listening parts with audio tracks
  let listeningPayload = null;
  if (results.listening) {
    const l = results.listening;
    const rawParts = Array.isArray(l.parts) ? l.parts : [];
    const parts = [1, 2, 3, 4].map((pId) => {
      const pKey = `part${pId}`;
      const found = rawParts.find((p) => (p.partId || p.part) === pId) || {};
      const audio = audioTracks?.[pKey] || audioTracks?.[`audio${pId}`] || audioTracks?.[`audioTrack${pId}`] || {};
      const audioUrl = typeof audio === 'string' ? audio : audio?.url || '';
      const audioName = typeof audio === 'string' ? '' : audio?.name || '';
      const qNums = (l.questions || []).filter(q => Number(q.partId || q.part) === pId).map(q => Number(q.questionNumber || q.q_num)).filter(n => !isNaN(n) && n > 0);
      const dynRange = qNums.length > 0 ? 'Questions ' + Math.min(...qNums) + '–' + Math.max(...qNums) : '';
      return {
        partId: pId,
        title: found.title || `Part ${pId}`,
        question_range: found.question_range || dynRange,
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
          prompt: w.task_1_prompt,
          page_index: typeof w.tasks?.task1?.page_index === 'number' ? w.tasks.task1.page_index : 0,
        },
        {
          part: 2,
          title: 'Task 2: Discursive Essay',
          prompt: w.task_2_prompt,
          page_index: typeof w.tasks?.task2?.page_index === 'number' ? w.tasks.task2.page_index : 1,
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
  apiKey = null,
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

  let { response, modelUsed } = await callGeminiGenerate({
    apiKey,
    contents: [{ text: prompt }],
    config: {
      ...WRITING_EVALUATION_CONFIG.config,
      maxOutputTokens: 16000,
    },
  });

  let parsed = null;
  let parseErr = null;
  try {
    parsed = robustJsonRepair(response.text || '{}');
  } catch (err) {
    parseErr = err;
  }

  // If JSON parsing incomplete or failed, execute 1 automatic retry with temperature 0.05
  if (!parsed || parseErr || (!parsed.task_1 && !parsed.task_2)) {
    console.warn(`[Strict AI Examiner] JSON evaluation incomplete or failed (${parseErr?.message || 'missing tasks'}). Executing 1 automatic retry with temperature 0.05...`);
    try {
      const retryResult = await callGeminiGenerate({
        apiKey,
        contents: [{ text: `${prompt}\nCRITICAL: Ensure valid RFC 8259 JSON output without syntax errors, trailing commas, or unescaped quotes. Strictly adhere to schema.` }],
        config: {
          ...WRITING_EVALUATION_CONFIG.config,
          temperature: 0.05,
          maxOutputTokens: 16000,
        },
      });
      response = retryResult.response;
      modelUsed = retryResult.modelUsed;
      parsed = robustJsonRepair(response.text || '{}');
      console.log('[Strict AI Examiner] Automatic retry succeeded with valid JSON evaluation.');
    } catch (retryErr) {
      console.error('[Strict AI Examiner] Automatic retry failed:', retryErr.message);
      if (!parsed) parsed = safeJsonParse(response.text || '{}');
    }
  }

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
