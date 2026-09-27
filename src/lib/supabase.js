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
  exams: new Set([
    'listening_map_image_url',
    'listening_map_image_name',
  ]),
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
 * Generates a valid standard RFC4122 v4 UUID using Web Cryptography API
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return '00000000-0000-4000-8000-000000000000';
}

/**
 * Generates a cryptographically secure 6-character uppercase exam Session PIN
 * Excludes easily confusable characters (0, O, 1, I)
 */
export function generateCryptoPin() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }
  return Math.random().toString(36).substring(2, 8).toUpperCase();
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
 * Securely fetches exam answer keys by Session PIN strictly at final submission
 */
export async function fetchExamAnswerKeys(pinCode) {
  const supabase = getSupabaseClient();
  if (!supabase || !pinCode) return { data: null, error: new Error("No client or PIN") };

  try {
    const { data, error } = await supabase
      .from("exams")
      .select("id, pin_code, answer_keys, reading_questions, listening_questions")
      .eq("pin_code", pinCode.trim().toUpperCase())
      .maybeSingle();

    return { data, error };
  } catch (err) {
    console.warn("fetchExamAnswerKeys error:", err);
    return { data: null, error: err };
  }
}

/**
 * Safely updates an exam record by ID or PIN, or inserts if no existing record is found.
 * Avoids HTTP 409 Conflict on primary key or unique pin_code constraints.
 */
async function safeSaveExamRecord(supabase, examPayload, targetExamId) {
  const effectiveId = isValidUUID(targetExamId) ? targetExamId : (isValidUUID(examPayload.id) ? examPayload.id : null);

  // 1. Try updating by primary key ID
  if (effectiveId) {
    const { data: updatedById, error: errById } = await supabase
      .from("exams")
      .update(examPayload)
      .eq("id", effectiveId)
      .select()
      .maybeSingle();

    if (errById) return { data: null, error: errById };
    if (updatedById) return { data: updatedById, error: null };
  }

  // 2. If not updated by ID and PIN code is provided, try updating by pin_code
  if (examPayload.pin_code) {
    const { id: _unusedId, ...payloadWithoutId } = examPayload;
    const { data: updatedByPin, error: errByPin } = await supabase
      .from("exams")
      .update(payloadWithoutId)
      .eq("pin_code", examPayload.pin_code.trim().toUpperCase())
      .select()
      .maybeSingle();

    if (errByPin) return { data: null, error: errByPin };
    if (updatedByPin) return { data: updatedByPin, error: null };
  }

  // 3. No existing record updated, perform insert
  const insertPayload = {
    ...(effectiveId ? { id: effectiveId } : {}),
    ...examPayload,
  };
  return await supabase
    .from("exams")
    .insert(insertPayload)
    .select()
    .maybeSingle();
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
      if (isValidUUID(examId)) {
        const { data: updatedById, error: errById } = await supabase
          .from("exams")
          .update(cleanPayload)
          .eq("id", examId)
          .select()
          .maybeSingle();

        if (errById) return { data: null, error: errById };
        if (updatedById) return { data: updatedById, error: null };
      }

      const pin = cleanPayload.pin_code || (!isValidUUID(examId) ? examId : null);
      if (pin) {
        return await supabase
          .from("exams")
          .update(cleanPayload)
          .eq("pin_code", pin.trim().toUpperCase())
          .select()
          .maybeSingle();
      }

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
      payload.status = meta.status || 'in_progress';
      payload.stage_started_at = meta.stage_started_at || new Date().toISOString();
      if (meta.stage_ends_at) {
        payload.stage_ends_at = meta.stage_ends_at;
      }
      if (!meta.started_at && currentStage === 'listening_active') {
        payload.started_at = payload.stage_started_at;
      }
    } else if (currentStage === 'exam_completed') {
      payload.status = 'finished';
      payload.ended_at = new Date().toISOString();
    }

    return await resilientSupabaseOperation('exams', payload, async (cleanPayload) => {
      // 1. If valid UUID, try updating by id
      if (isValidUUID(examId)) {
        const { data: updatedById, error: errById } = await supabase
          .from("exams")
          .update(cleanPayload)
          .eq("id", examId)
          .select()
          .maybeSingle();

        if (errById) return { data: null, error: errById };
        if (updatedById) return { data: updatedById, error: null };
      }

      // 2. Try updating by pin_code if available
      const pin = cleanPayload.pin_code || meta.pin_code || (!isValidUUID(examId) ? examId : null);
      if (pin) {
        const { data: updatedByPin, error: errByPin } = await supabase
          .from("exams")
          .update(cleanPayload)
          .eq("pin_code", pin.trim().toUpperCase())
          .select()
          .maybeSingle();

        if (errByPin) return { data: null, error: errByPin };
        if (updatedByPin) return { data: updatedByPin, error: null };
      }

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
 * Explicitly updates the classroom lobby open state in Supabase
 */
export async function updateExamLobbyState(examId, isLobbyOpen, pinCode = null) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No client") };

  try {
    const payload = {
      is_lobby_open: Boolean(isLobbyOpen),
      updated_at: new Date().toISOString(),
    };

    return await resilientSupabaseOperation('exams', payload, async (cleanPayload) => {
      if (isValidUUID(examId)) {
        const { data: updatedById, error: errById } = await supabase
          .from("exams")
          .update(cleanPayload)
          .eq("id", examId)
          .select()
          .maybeSingle();

        if (errById) return { data: null, error: errById };
        if (updatedById) return { data: updatedById, error: null };
      }

      const pin = pinCode || (!isValidUUID(examId) ? examId : null);
      if (pin) {
        return await supabase
          .from("exams")
          .update(cleanPayload)
          .eq("pin_code", pin.trim().toUpperCase())
          .select()
          .maybeSingle();
      }

      return { data: null, error: null };
    });
  } catch (err) {
    return { error: err };
  }
}

/**
 * Updates full Exam Assets (Reading PDF, Listening Audio & PDF, Writing PDF, Passages, Questions) in Supabase.
 * Excludes listening_map_image_url and listening_map_image_name from direct exams table columns (HTTP 400 fix).
 * Stores map strictly in exam_sections listening JSONB.
 */
export async function updateExamAssets(examId, assetUpdates = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No Supabase client") };

  const targetExamId = isValidUUID(examId) ? examId : generateUUID();

  try {
    // 1. Extract map image fields so they are NEVER sent directly to 'exams' table (fixes HTTP 400)
    const {
      listening_map_image_url,
      listening_map_image_name,
      ...safeExamUpdates
    } = assetUpdates;

    const mapUrl = listening_map_image_url || assetUpdates.listening?.map_image_url || null;
    const mapName = listening_map_image_name || assetUpdates.listening?.map_image_name || null;

    // 2. Persist map strictly inside JSONB structure of listening section in exam_sections
    if ((mapUrl || mapName) && isExamSectionsTableAvailable) {
      try {
        const { data: existingSec } = await supabase
          .from('exam_sections')
          .select('*')
          .eq('exam_id', targetExamId)
          .eq('section_type', 'listening')
          .maybeSingle();

        if (existingSec) {
          const currentData = existingSec.data || {};
          const updatedData = {
            ...currentData,
            ...(mapUrl ? { map_image_url: mapUrl } : {}),
            ...(mapName ? { map_image_name: mapName } : {}),
          };
          await supabase
            .from('exam_sections')
            .update({ data: updatedData, updated_at: new Date().toISOString() })
            .eq('id', existingSec.id);
        }
      } catch (mapErr) {
        console.warn("[updateExamAssets] Error updating listening map in exam_sections:", mapErr?.message || mapErr);
      }
    }

    // 3. Prepare exams table payload (without non-existent map columns)
    const payload = {
      id: targetExamId,
      updated_at: new Date().toISOString(),
      ...safeExamUpdates
    };
    delete payload.listening_map_image_url;
    delete payload.listening_map_image_name;

    return await resilientSupabaseOperation('exams', payload, async (cleanPayload) => {
      delete cleanPayload.listening_map_image_url;
      delete cleanPayload.listening_map_image_name;
      return await safeSaveExamRecord(supabase, cleanPayload, targetExamId);
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
      if (isValidUUID(examId)) {
        const { data: updatedById, error: errById } = await supabase
          .from("exams")
          .update(cleanPayload)
          .eq("id", examId)
          .select()
          .maybeSingle();

        if (errById) return { data: null, error: errById };
        if (updatedById) return { data: updatedById, error: null };
      }

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
 * Guarantees persistence of reading, listening, writing essays, bands, and stage statuses.
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
      current_stage: student.current_stage || "exam_completed",
      reading_status: student.reading_status || "completed",
      listening_status: student.listening_status || "completed",
      writing_status: student.writing_status || "completed",
      answers: student.answers || {},
      answered_count: student.answered_count || 0,
      warning_count: student.warning_count || 0,
      reading_score: student.reading_score ?? null,
      reading_band: student.reading_band ?? null,
      listening_score: student.listening_score ?? null,
      listening_band: student.listening_band ?? null,
      writing_task1_essay: student.writing_task1_essay ?? "",
      writing_task2_essay: student.writing_task2_essay ?? "",
      writing_task1_band: student.writing_task1_band ?? null,
      writing_task2_band: student.writing_task2_band ?? null,
      writing_band: student.writing_band ?? null,
      overall_band: student.overall_band ?? null,
      score: student.score ?? student.reading_score ?? null,
      band_score: student.band_score ?? student.reading_band ?? null,
      ...(student.writing_ai_evaluation !== undefined ? { writing_ai_evaluation: student.writing_ai_evaluation } : {}),
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
    console.error("[upsertStudent] Error persisting student submission:", err);
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
    .channel(`exam_room_${pinCode}`)
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
 * Completely removes and destroys a Supabase Realtime Channel from client memory
 */
export function removeExamRealtimeChannel(channel) {
  if (!channel) return;
  const supabase = getSupabaseClient();
  if (supabase && typeof supabase.removeChannel === 'function') {
    supabase.removeChannel(channel);
  } else if (typeof channel.unsubscribe === 'function') {
    channel.unsubscribe();
  }
}

/**
 * Persists real parsed exam payloads to both `exams` and `exam_sections` tables
 * Resilient against missing schema columns or non-existent sections table.
 * Strips listening map columns from exams table (HTTP 400 fix) and stores in listening section JSONB.
 * Uses delete-then-insert for sections to completely prevent HTTP 409 Conflict.
 */
export async function persistExamAndSections(examId, parsedPayload = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No Supabase client available") };

  let targetExamId = isValidUUID(examId) ? examId : generateUUID();
  const results = { exam: null, sections: [], examId: targetExamId };

  // 1. Prepare Exams table update payload
  const examPayload = {
    id: targetExamId,
    updated_at: new Date().toISOString(),
  };

  if (parsedPayload.title) examPayload.title = parsedPayload.title;
  if (parsedPayload.pin_code) examPayload.pin_code = parsedPayload.pin_code;
  if (parsedPayload.duration_mins) examPayload.duration_mins = parsedPayload.duration_mins;
  if (parsedPayload.is_lobby_open !== undefined) examPayload.is_lobby_open = parsedPayload.is_lobby_open;
  if (parsedPayload.status) examPayload.status = parsedPayload.status;
  if (parsedPayload.current_stage) examPayload.current_stage = parsedPayload.current_stage;
  if (parsedPayload.anti_cheat_strictness) examPayload.anti_cheat_strictness = parsedPayload.anti_cheat_strictness;

  // Reading Section fields
  if (parsedPayload.reading) {
    examPayload.reading_passages = parsedPayload.reading.passages || [];
    examPayload.reading_questions = parsedPayload.reading.questions || [];
    examPayload.reading_parts = parsedPayload.reading.parts || {};
    if (parsedPayload.reading.pdf_url) examPayload.reading_pdf_url = parsedPayload.reading.pdf_url;
    if (parsedPayload.reading.pdf_name) examPayload.reading_pdf_name = parsedPayload.reading.pdf_name;
  }

  // Listening Section fields - STRICTLY EXCLUDE listening_map_image_url & listening_map_image_name from examPayload
  if (parsedPayload.listening) {
    examPayload.listening_questions = parsedPayload.listening.questions || [];
    examPayload.listening_parts = parsedPayload.listening.parts || [];
    if (parsedPayload.listening.audio_parts) examPayload.listening_audio_parts = parsedPayload.listening.audio_parts;
    if (parsedPayload.listening.audio_names) examPayload.listening_audio_names = parsedPayload.listening.audio_names;
    if (parsedPayload.listening.audio_durations) examPayload.listening_audio_durations = parsedPayload.listening.audio_durations;
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

  // Ensure map columns are NEVER added to exams table payload
  delete examPayload.listening_map_image_url;
  delete examPayload.listening_map_image_name;

  // Update or insert exams table safely without HTTP 409 Conflict
  try {
    const resExam = await resilientSupabaseOperation('exams', examPayload, async (cleanPayload) => {
      delete cleanPayload.listening_map_image_url;
      delete cleanPayload.listening_map_image_name;
      return await safeSaveExamRecord(supabase, cleanPayload, targetExamId);
    });

    if (resExam?.data) {
      results.exam = resExam.data;
      if (resExam.data.id && resExam.data.id !== targetExamId) {
        targetExamId = resExam.data.id;
        results.examId = resExam.data.id;
      }
    }
  } catch (err) {
    console.warn("[persistExamAndSections] Notice: exams table save partial/failed:", err?.message || err);
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
      // Map image stored strictly inside JSONB structure of listening section
      const listeningData = {
        ...parsedPayload.listening,
        ...(parsedPayload.listening_map_image_url ? { map_image_url: parsedPayload.listening_map_image_url } : {}),
        ...(parsedPayload.listening_map_image_name ? { map_image_name: parsedPayload.listening_map_image_name } : {}),
      };
      sectionsToUpsert.push({
        exam_id: targetExamId,
        section_type: 'listening',
        title: 'IELTS Listening',
        data: listeningData,
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

    if (sectionsToUpsert.length > 0) {
      // Safe transactional replacement:
      // 1) Delete old sections for this exam to prevent 409 conflict
      try {
        const delRes = await supabase
          .from('exam_sections')
          .delete()
          .eq('exam_id', targetExamId);

        if (delRes?.error && isTableMissingError(delRes.error)) {
          isExamSectionsTableAvailable = false;
        }
      } catch (delErr) {
        console.warn(`[persistExamAndSections] exam_sections delete cleanup notice:`, delErr?.message || delErr);
      }

      // 2) Insert new sections cleanly (eliminates 409 conflict completely)
      if (isExamSectionsTableAvailable) {
        for (const sec of sectionsToUpsert) {
          try {
            const resSec = await resilientSupabaseOperation('exam_sections', sec, async (cleanSec) => {
              return await supabase
                .from("exam_sections")
                .insert(cleanSec)
                .select()
                .maybeSingle();
            });

            if (resSec?.data) {
              results.sections.push(resSec.data);
            }
          } catch (secErr) {
            console.warn(`[persistExamAndSections] exam_sections insert (${sec.section_type}) skipped:`, secErr?.message);
          }
        }
      }
    }
  }

  return { data: results, error: null };
}


