import { createClient } from "@supabase/supabase-js";

// Production Supabase Configuration
export const SUPABASE_URL = "https://jpnygffcsqyueejtvois.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwbnlnZmZjc3F5dWVlanR2b2lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTA3NDcsImV4cCI6MjEwNTQ2Njc0N30.-l0GZGK4GOHBgG8hlPy1Xy6oBdu5JsQdCsCvZWISJU0";

const getStoredSupabaseConfig = () => {
  if (typeof window === "undefined") return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  const url = localStorage.getItem("supabase_url") || 
              import.meta.env?.NEXT_PUBLIC_SUPABASE_URL || 
              import.meta.env?.VITE_SUPABASE_URL || 
              SUPABASE_URL;
  const key = localStorage.getItem("supabase_anon_key") || 
              import.meta.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
              import.meta.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
              import.meta.env?.VITE_SUPABASE_ANON_KEY || 
              SUPABASE_ANON_KEY;
  return { url: url.trim(), key: key.trim() };
};

let supabaseInstance = null;

export function getSupabaseClient() {
  const { url, key } = getStoredSupabaseConfig();
  if (!url || !key) return null;

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, key, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    } catch (err) {
      console.warn("Failed to initialize Supabase client:", err);
      supabaseInstance = null;
    }
  }
  return supabaseInstance;
}

export function saveSupabaseConfig(url, key) {
  if (typeof window !== "undefined") {
    localStorage.setItem("supabase_url", url.trim());
    localStorage.setItem("supabase_anon_key", key.trim());
    supabaseInstance = null;
  }
}

export function getSupabaseStatus() {
  const { url, key } = getStoredSupabaseConfig();
  return {
    isConfigured: Boolean(url && key),
    url: url || "",
    key: key ? `${key.substring(0, 12)}...${key.substring(key.length - 4)}` : ""
  };
}

// =========================================================================
// REALTIME & DATABASE QUERIES (RESILIENT ADAPTIVE PERSISTENCE)
// =========================================================================

// Runtime cache of columns rejected by the remote database schema
const missingColumnsCache = {
  exams: new Set(),
  students: new Set([
    'current_stage',
    'reading_status',
    'writing_status',
    'listening_status',
    'reading_score',
    'reading_band',
    'listening_score',
    'listening_band',
    'writing_task1_essay',
    'writing_task2_essay',
    'writing_task1_band',
    'writing_task2_band',
    'writing_band',
    'writing_ai_evaluation',
    'is_disqualified',
    'disqualification_reason',
  ]),
  exam_sections: new Set()
};

let isExamSectionsTableAvailable = true;

/**
 * Validates if a string is a standard RFC4122 UUID (v1-v5)
 */
export const isValidUUID = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export function isUuid(val) {
  return isValidUUID(val);
}

/**
 * Generates a valid standard RFC4122 v4 UUID
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Extracts the missing column name from PostgREST or PostgreSQL error messages
 */
export function extractMissingColumn(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') return null;

  // PostgREST schema cache: "Could not find the 'duration_mins' column of 'exams' in the schema cache"
  const m1 = errorMessage.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
  if (m1) return m1[1];

  // PostgreSQL: column "duration_mins" of relation "exams" does not exist
  const m2 = errorMessage.match(/column ['"]?([a-zA-Z0-9_]+)['"]?(?: of relation [a-zA-Z0-9_."]+)? does not exist/i);
  if (m2) return m2[1];

  // Schema cache dot notation: "column exams.duration_mins does not exist"
  const m3 = errorMessage.match(/column [a-zA-Z0-9_]+\.['"]?([a-zA-Z0-9_]+)['"]? does not exist/i);
  if (m3) return m3[1];

  return null;
}

/**
 * Checks if the error is due to a table missing from the remote database schema
 */
export function isTableMissingError(error) {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const msg = (error.message || '').toLowerCase();
  return (msg.includes('in the schema cache') && msg.includes('table')) ||
         (msg.includes('does not exist') && (msg.includes('relation') || msg.includes('table')));
}

/**
 * Strips known missing columns from a payload before sending to Supabase
 */
function sanitizePayload(tableName, payload) {
  const missing = missingColumnsCache[tableName];
  if (!missing || missing.size === 0) return { ...payload };
  const clean = { ...payload };
  for (const col of missing) {
    delete clean[col];
  }
  return clean;
}

/**
 * Resiliently executes a database write (update, upsert, insert).
 * If a column does not exist in the schema cache, strips it and retries.
 */
export async function resilientSupabaseOperation(tableName, initialPayload, opFn, maxRetries = 25) {
  if (tableName === 'exam_sections' && !isExamSectionsTableAvailable) {
    return { data: null, error: null, skipped: true };
  }

  let currentPayload = sanitizePayload(tableName, initialPayload);
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    try {
      const result = await opFn(currentPayload);
      if (!result?.error) {
        return result || { data: null, error: null };
      }

      const err = result.error;

      // Fast abort on UUID type mismatch (e.g. non-UUID client ID sent to UUID column)
      if (err.message && (err.message.includes('invalid input syntax for type uuid') || err.code === '22P02')) {
        console.warn(`[Supabase] Invalid UUID format encountered for table '${tableName}'. Bypassing write.`);
        return { data: null, error: null, skipped: true };
      }

      // 1. Table missing error check (e.g. exam_sections 404 / PGRST205)
      if (isTableMissingError(err)) {
        if (tableName === 'exam_sections') {
          isExamSectionsTableAvailable = false;
          console.info(`[Supabase] Table '${tableName}' does not exist in remote schema. Skipping exam_sections gracefully.`);
          return { data: null, error: null, skipped: true };
        }
        return result;
      }

      // 2. Missing column error check
      const missingCol = extractMissingColumn(err.message);
      if (missingCol && Object.prototype.hasOwnProperty.call(currentPayload, missingCol)) {
        if (!missingColumnsCache[tableName]) {
          missingColumnsCache[tableName] = new Set();
        }
        missingColumnsCache[tableName].add(missingCol);
        console.warn(`[Supabase] Column '${missingCol}' missing in table '${tableName}'. Sanitizing and retrying...`);
        delete currentPayload[missingCol];

        // Check if payload still has non-id fields
        const remainingKeys = Object.keys(currentPayload).filter(k => k !== 'id');
        if (remainingKeys.length === 0) {
          console.warn(`[Supabase] No valid columns remaining for '${tableName}' update after sanitization. Bypassing.`);
          return { data: null, error: null, skipped: true };
        }
        // Retry with sanitized payload
        continue;
      }

      // If another unhandled error occurred, return it
      return result;
    } catch (unexpectedErr) {
      console.warn(`[Supabase] Exception executing operation on '${tableName}':`, unexpectedErr);
      return { data: null, error: unexpectedErr };
    }
  }

  return { data: null, error: new Error(`Exceeded max retries for table ${tableName}`) };
}


/**
 * Validates and fetches active exam by PIN code
 */
export async function fetchExamByPin(pinCode) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: new Error("Supabase client not initialized") };

  try {
    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("pin_code", pinCode.trim().toUpperCase())
      .maybeSingle();

    return { data, error };
  } catch (err) {
    console.warn("fetchExamByPin error:", err);
    return { data: null, error: err };
  }
}

/**
 * Updates exam status in Supabase (e.g. 'active', 'finished')
 */
export async function updateExamStatus(examId, status, startedAt = null) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No client") };

  try {
    const payload = { status };
    if (startedAt) payload.started_at = startedAt;
    if (status === 'finished') payload.ended_at = new Date().toISOString();

    return await resilientSupabaseOperation('exams', payload, async (cleanPayload) => {
      return await supabase
        .from("exams")
        .update(cleanPayload)
        .eq("id", examId);
    });
  } catch (err) {
    return { error: err };
  }
}

/**
 * Updates exam sequential stage (e.g. 'reading_active', 'writing_lobby', etc.)
 */
export async function updateExamStage(examId, currentStage, meta = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No client") };

  try {
    const payload = { 
      current_stage: currentStage,
      updated_at: new Date().toISOString(),
      ...meta 
    };

    if (currentStage.endsWith('_active')) {
      payload.status = 'active';
      payload.stage_started_at = meta.stage_started_at || new Date().toISOString();
      if (!meta.started_at && currentStage === 'listening_active') {
        payload.started_at = payload.stage_started_at;
      }
    } else if (currentStage === 'exam_completed') {
      payload.status = 'finished';
      payload.ended_at = new Date().toISOString();
    }

    return await resilientSupabaseOperation('exams', payload, async (cleanPayload) => {
      return await supabase
        .from("exams")
        .update(cleanPayload)
        .eq("id", examId);
    });
  } catch (err) {
    return { error: err };
  }
}

/**
 * Updates full Exam Assets (Reading PDF, Listening Audio & PDF, Writing PDF, Passages, Questions) in Supabase
 */
export async function updateExamAssets(examId, assetUpdates = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No Supabase client") };

  const targetExamId = isValidUUID(examId) ? examId : generateUUID();

  try {
    const payload = {
      id: targetExamId,
      updated_at: new Date().toISOString(),
      ...assetUpdates
    };

    return await resilientSupabaseOperation('exams', payload, async (cleanPayload) => {
      return await supabase
        .from("exams")
        .upsert(cleanPayload)
        .select()
        .maybeSingle();
    });
  } catch (err) {
    console.warn("updateExamAssets error:", err);
    return { error: err };
  }
}

/**
 * Updates Session PIN in Supabase (invalidating old codes instantly)
 */
export async function updateExamPinCode(examId, newPin) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No client") };

  try {
    const payload = { 
      pin_code: newPin.trim().toUpperCase(), 
      updated_at: new Date().toISOString() 
    };

    return await resilientSupabaseOperation('exams', payload, async (cleanPayload) => {
      return await supabase
        .from("exams")
        .update(cleanPayload)
        .eq("id", examId);
    });
  } catch (err) {
    return { error: err };
  }
}

/**
 * Upserts a student participant in the exam room with resilient schema adaptation
 */
export async function upsertStudent(student) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: student, error: null };

  try {
    const payload = {
      id: student.id,
      exam_id: student.exam_id,
      name: student.name || student.student_name,
      student_name: student.student_name || student.name,
      candidate_no: student.candidate_no,
      status: student.status || "waiting",
      answers: student.answers || {},
      answered_count: student.answered_count || 0,
      warning_count: student.warning_count || 0,
      last_seen: new Date().toISOString(),
    };

    const res = await resilientSupabaseOperation('students', payload, async (cleanPayload) => {
      return await supabase
        .from("students")
        .upsert(cleanPayload)
        .select()
        .maybeSingle();
    });

    return { data: res?.data || student, error: res?.error || null };
  } catch (err) {
    return { data: student, error: err };
  }
}

/**
 * Updates student status (e.g. 'disqualified', 'submitted')
 */
export async function updateStudentStatus(studentId, status, extra = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: null };

  try {
    const payload = {
      status,
      ...extra,
      last_seen: new Date().toISOString()
    };

    return await resilientSupabaseOperation('students', payload, async (cleanPayload) => {
      return await supabase
        .from("students")
        .update(cleanPayload)
        .eq("id", studentId);
    });
  } catch (err) {
    return { error: err };
  }
}

/**
 * Updates individual student stage progress (e.g. reading_status: 'completed', current_stage: 'writing_lobby')
 */
export async function updateStudentStage(studentId, stageUpdates = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: null };

  try {
    const payload = {
      ...stageUpdates,
      last_seen: new Date().toISOString()
    };

    return await resilientSupabaseOperation('students', payload, async (cleanPayload) => {
      return await supabase
        .from("students")
        .update(cleanPayload)
        .eq("id", studentId);
    });
  } catch (err) {
    return { error: err };
  }
}

/**
 * Subscribes to live changes on exams and students tables
 */
export function subscribeToExamRealtime(pinCode, callbacks = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const channel = supabase
    .channel(`exam_room_${pinCode}_${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "exams" },
      (payload) => {
        if (callbacks.onExamChange) callbacks.onExamChange(payload);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "students" },
      (payload) => {
        if (callbacks.onStudentChange) callbacks.onStudentChange(payload);
      }
    )
    .on("broadcast", { event: "admin_action" }, (payload) => {
      if (callbacks.onAdminAction) callbacks.onAdminAction(payload);
    })
    .on("broadcast", { event: "student_action" }, (payload) => {
      if (callbacks.onStudentAction) callbacks.onStudentAction(payload);
    })
    .subscribe((status) => {
      if (callbacks.onStatusChange) callbacks.onStatusChange(status);
    });

  return channel;
}

/**
 * Persists real parsed exam payloads to both `exams` and `exam_sections` tables
 * Resilient against missing schema columns or non-existent sections table
 */
export async function persistExamAndSections(examId, parsedPayload = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No Supabase client available") };

  const targetExamId = isValidUUID(examId) ? examId : generateUUID();
  const results = { exam: null, sections: [], examId: targetExamId };

  // 1. Prepare Exams table update payload
  const examPayload = {
    id: targetExamId,
    updated_at: new Date().toISOString(),
  };

  if (parsedPayload.title) examPayload.title = parsedPayload.title;
  if (parsedPayload.pin_code) examPayload.pin_code = parsedPayload.pin_code;
  if (parsedPayload.duration_mins) examPayload.duration_mins = parsedPayload.duration_mins;

  // Reading Section fields
  if (parsedPayload.reading) {
    examPayload.reading_passages = parsedPayload.reading.passages || [];
    examPayload.reading_questions = parsedPayload.reading.questions || [];
    examPayload.reading_parts = parsedPayload.reading.parts || {};
    if (parsedPayload.reading.pdf_url) examPayload.reading_pdf_url = parsedPayload.reading.pdf_url;
    if (parsedPayload.reading.pdf_name) examPayload.reading_pdf_name = parsedPayload.reading.pdf_name;
  }

  // Listening Section fields
  if (parsedPayload.listening) {
    examPayload.listening_questions = parsedPayload.listening.questions || [];
    examPayload.listening_parts = parsedPayload.listening.parts || [];
    if (parsedPayload.listening.audio_parts) examPayload.listening_audio_parts = parsedPayload.listening.audio_parts;
    if (parsedPayload.listening.pdf_url) examPayload.listening_pdf_url = parsedPayload.listening.pdf_url;
    if (parsedPayload.listening.pdf_name) examPayload.listening_pdf_name = parsedPayload.listening.pdf_name;
  }

  // Writing Section fields
  if (parsedPayload.writing) {
    examPayload.writing_tasks = parsedPayload.writing.tasks || parsedPayload.writing;
    if (parsedPayload.writing.task_1_prompt) examPayload.task_1_prompt = parsedPayload.writing.task_1_prompt;
    if (parsedPayload.writing.task_2_prompt) examPayload.task_2_prompt = parsedPayload.writing.task_2_prompt;
    if (parsedPayload.writing.pdf_url) examPayload.writing_pdf_url = parsedPayload.writing.pdf_url;
    if (parsedPayload.writing.pdf_name) examPayload.writing_pdf_name = parsedPayload.writing.pdf_name;
  }

  // Answer keys & Parsed questions
  if (parsedPayload.answer_keys) examPayload.answer_keys = parsedPayload.answer_keys;
  if (parsedPayload.parsed_questions) examPayload.parsed_questions = parsedPayload.parsed_questions;

  // Direct prompt overrides
  if (parsedPayload.task_1_prompt) examPayload.task_1_prompt = parsedPayload.task_1_prompt;
  if (parsedPayload.task_2_prompt) examPayload.task_2_prompt = parsedPayload.task_2_prompt;

  // Update/Upsert exams table via resilient operation
  try {
    const resExam = await resilientSupabaseOperation('exams', examPayload, async (cleanPayload) => {
      return await supabase
        .from("exams")
        .upsert(cleanPayload)
        .select()
        .maybeSingle();
    });

    if (resExam?.data) {
      results.exam = resExam.data;
    }
  } catch (err) {
    console.warn("[persistExamAndSections] Notice: exams table upsert partial/failed:", err?.message || err);
  }

  // 2. Persist to exam_sections table if available in remote database
  if (isExamSectionsTableAvailable) {
    const sectionsToUpsert = [];
    if (parsedPayload.reading) {
      sectionsToUpsert.push({
        exam_id: targetExamId,
        section_type: 'reading',
        title: 'IELTS Academic Reading',
        data: parsedPayload.reading,
        answer_keys: parsedPayload.reading.answerKeys || parsedPayload.reading.answer_keys || {},
        prompts: { passages: parsedPayload.reading.passages || [] },
        updated_at: new Date().toISOString(),
      });
    }

    if (parsedPayload.listening) {
      sectionsToUpsert.push({
        exam_id: targetExamId,
        section_type: 'listening',
        title: 'IELTS Listening',
        data: parsedPayload.listening,
        answer_keys: parsedPayload.listening.answerKeys || parsedPayload.listening.answer_keys || {},
        prompts: { parts: parsedPayload.listening.parts || [] },
        updated_at: new Date().toISOString(),
      });
    }

    if (parsedPayload.writing) {
      sectionsToUpsert.push({
        exam_id: targetExamId,
        section_type: 'writing',
        title: 'IELTS Academic Writing',
        data: parsedPayload.writing,
        answer_keys: {},
        prompts: {
          task_1_prompt: parsedPayload.writing.task_1_prompt || parsedPayload.task_1_prompt || '',
          task_2_prompt: parsedPayload.writing.task_2_prompt || parsedPayload.task_2_prompt || '',
        },
        updated_at: new Date().toISOString(),
      });
    }

    for (const sec of sectionsToUpsert) {
      if (!isExamSectionsTableAvailable) break;
      try {
        const resSec = await resilientSupabaseOperation('exam_sections', sec, async (cleanSec) => {
          return await supabase
            .from("exam_sections")
            .upsert(cleanSec, { onConflict: 'exam_id,section_type' })
            .select()
            .maybeSingle();
        });

        if (resSec?.data) {
          results.sections.push(resSec.data);
        }
      } catch (secErr) {
        console.warn(`[persistExamAndSections] exam_sections upsert (${sec.section_type}) skipped:`, secErr?.message);
      }
    }
  }

  return { data: results, error: null };
}


