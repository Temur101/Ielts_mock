import { createClient } from "@supabase/supabase-js";

// Production Supabase Configuration
export const SUPABASE_URL = "https://wfszoivlllwccerhawxd.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_u95OLOvnmXKxPJsWc3g-8A_dQ1Qt5EJ";

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
// REALTIME & DATABASE QUERIES
// =========================================================================

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

    const { data, error } = await supabase
      .from("exams")
      .update(payload)
      .eq("id", examId);

    return { data, error };
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

    const { data, error } = await supabase
      .from("exams")
      .update(payload)
      .eq("id", examId);

    return { data, error };
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

  try {
    const payload = {
      updated_at: new Date().toISOString(),
      ...assetUpdates
    };

    const { data, error } = await supabase
      .from("exams")
      .update(payload)
      .eq("id", examId)
      .select()
      .maybeSingle();

    return { data, error };
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
    const { data, error } = await supabase
      .from("exams")
      .update({ pin_code: newPin.trim().toUpperCase(), updated_at: new Date().toISOString() })
      .eq("id", examId);

    return { data, error };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Upserts a student participant in the exam room
 */
export async function upsertStudent(student) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: student, error: null };

  try {
    const { data, error } = await supabase
      .from("students")
      .upsert({
        id: student.id,
        exam_id: student.exam_id,
        name: student.name,
        candidate_no: student.candidate_no,
        status: student.status || "waiting",
        answers: student.answers || {},
        answered_count: student.answered_count || 0,
        warning_count: student.warning_count || 0,
        last_seen: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    return { data: data || student, error };
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
    const { data, error } = await supabase
      .from("students")
      .update({
        status,
        ...extra,
        last_seen: new Date().toISOString()
      })
      .eq("id", studentId);

    return { data, error };
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
    const { data, error } = await supabase
      .from("students")
      .update({
        ...stageUpdates,
        last_seen: new Date().toISOString()
      })
      .eq("id", studentId);

    return { data, error };
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
 */
export async function persistExamAndSections(examId, parsedPayload = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: new Error("No Supabase client available") };

  const results = { exam: null, sections: [] };

  // 1. Prepare Exams table update payload
  const examPayload = {
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

  // Update exams table
  try {
    const { data: examData, error: examErr } = await supabase
      .from("exams")
      .update(examPayload)
      .eq("id", examId)
      .select()
      .maybeSingle();

    if (examErr) {
      console.warn("[persistExamAndSections] Error updating exams table:", examErr.message);
    } else {
      results.exam = examData;
    }
  } catch (err) {
    console.warn("[persistExamAndSections] Exception updating exams table:", err.message);
  }

  // 2. Persist to exam_sections table
  const sectionsToUpsert = [];
  if (parsedPayload.reading) {
    sectionsToUpsert.push({
      exam_id: examId,
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
      exam_id: examId,
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
      exam_id: examId,
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
    try {
      const { data: secData, error: secErr } = await supabase
        .from("exam_sections")
        .upsert(sec, { onConflict: 'exam_id,section_type' })
        .select()
        .maybeSingle();

      if (!secErr && secData) {
        results.sections.push(secData);
      }
    } catch (secErr) {
      // Soft fail if exam_sections table does not exist in user's Supabase yet
      console.warn(`[persistExamAndSections] exam_sections upsert (${sec.section_type}) skipped:`, secErr.message);
    }
  }

  return { data: results, error: null };
}

