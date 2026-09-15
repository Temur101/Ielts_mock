// IELTS Academic Mock Exam Shell — NO hardcoded questions
// All questions are dynamically extracted from uploaded PDFs via pdfParser.js

export const DEFAULT_IELTS_EXAM = {
  id: "ielts-mock-01",
  pin_code: "IELTS-904",
  title: "IELTS Academic Master Assessment 2026",
  duration_mins: 60,
  reading_duration_mins: 60,
  writing_duration_mins: 60,
  listening_duration_mins: 35,
  status: "lobby",
  is_lobby_open: false,
  current_stage: "listening_lobby",
  stage_started_at: null,
  started_at: null,
  created_at: new Date().toISOString(),
  anti_cheat_strictness: "strict",

  reading_pdf_name: "",
  reading_pdf_url: "",
  writing_pdf_name: "",
  writing_pdf_url: "",
  listening_pdf_name: "",
  listening_pdf_url: "",
  listening_audio_parts: {
    part1: "",
    part2: "",
    part3: "",
    part4: "",
  },

  // ==========================================
  // 1. READING SECTION (3 PARTS MULTI-SLOT ASSETS)
  // ==========================================
  reading_parts: {
    part1: {
      partId: 1,
      title: "Reading Passage 1",
      pdf_url: "",
      pdf_name: "",
      passage_text: "The Flavian Amphitheatre, universally known today as the Colosseum, represents one of the pinnacle architectural achievements of the ancient Roman Empire...",
      questions: [],
      answer_keys: {},
    },
    part2: {
      partId: 2,
      title: "Reading Passage 2",
      pdf_url: "",
      pdf_name: "",
      passage_text: "The integration of Artificial Intelligence (AI) into clinical diagnostics has revolutionized modern medical pathology and healthcare delivery systems...",
      questions: [],
      answer_keys: {},
    },
    part3: {
      partId: 3,
      title: "Reading Passage 3",
      pdf_url: "",
      pdf_name: "",
      passage_text: "Over 3.8 billion years of evolutionary refinement, biological organisms have engineered resilient structures, energy-efficient locomotions, and self-healing materials...",
      questions: [],
      answer_keys: {},
    },
  },

  reading: {
    pdf_name: "",
    pdf_url: "",
    duration_mins: 60,
    passages: [],
    questions: [],
  },

  // ==========================================
  // 2. LISTENING SECTION — populated from PDF + Audio upload
  // ==========================================
  listening: {
    audio_settings: {
      lock_scrubbing: true,
      lock_rewind: true,
      single_play_enforcement: true,
      auto_play_next_part: false,
    },
    parts: [
      {
        partId: 1,
        title: "Part 1",
        audio_url: "",
        audio_name: "",
        duration: "06:45",
        instructions: "",
      },
      {
        partId: 2,
        title: "Part 2",
        audio_url: "",
        audio_name: "",
        duration: "07:15",
        instructions: "",
      },
      {
        partId: 3,
        title: "Part 3",
        audio_url: "",
        audio_name: "",
        duration: "07:50",
        instructions: "",
      },
      {
        partId: 4,
        title: "Part 4",
        audio_url: "",
        audio_name: "",
        duration: "08:30",
        instructions: "",
      },
    ],
    questions: [],
  },

  // ==========================================
  // 3. WRITING SECTION (MULTI-TASK SLOTS)
  // ==========================================
  writing_tasks: {
    task1: {
      title: "Task 1: Academic Report (Visual Data Analysis)",
      recommended_mins: 20,
      min_words: 150,
      prompt: `The chart below shows the percentage of electricity generated from renewable energy sources (Solar, Wind, Hydro, and Geothermal) across four European countries between 2010 and 2025.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words.`,
      visual_description: "Bar chart & Line graph comparison showing Renewable Energy Share in UK, Germany, Spain, and Norway from 2010 to 2025.",
      pdf_name: "",
      pdf_url: "",
      image_url: "",
    },
    task2: {
      title: "Task 2: Discursive Essay (Contemporary Global Issue)",
      recommended_mins: 40,
      min_words: 250,
      prompt: `Some people argue that technological advances in artificial intelligence and automation will lead to mass unemployment and economic inequality, while others believe AI will create more rewarding and innovative job opportunities.

Discuss both views and give your own opinion.
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,
      pdf_name: "",
      pdf_url: "",
      image_url: "",
    },
  },

  writing: {
    duration_mins: 60,
    pdf_name: "",
    pdf_url: "",
    task1: {
      title: "Task 1: Academic Report (Visual Data Analysis)",
      recommended_mins: 20,
      min_words: 150,
      prompt: `The chart below shows the percentage of electricity generated from renewable energy sources (Solar, Wind, Hydro, and Geothermal) across four European countries between 2010 and 2025.

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
Write at least 150 words.`,
      visual_description: "Bar chart & Line graph comparison showing Renewable Energy Share in UK, Germany, Spain, and Norway from 2010 to 2025.",
    },
    task2: {
      title: "Task 2: Discursive Essay (Contemporary Global Issue)",
      recommended_mins: 40,
      min_words: 250,
      prompt: `Some people argue that technological advances in artificial intelligence and automation will lead to mass unemployment and economic inequality, while others believe AI will create more rewarding and innovative job opportunities.

Discuss both views and give your own opinion.
Give reasons for your answer and include any relevant examples from your own knowledge or experience.
Write at least 250 words.`,
    },
  },

  // Dynamic accessors for backward compatibility
  get questions() {
    return this.reading.questions;
  },
  get passages() {
    return this.reading.passages;
  },
};

// Initial Mock Students — answers are empty, scores come from real exam data
export const INITIAL_MOCK_STUDENTS = [];
