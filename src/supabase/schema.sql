-- =========================================================================
-- IELTS CLASSROOM MOCK EXAM SYSTEM - PRODUCTION SUPABASE MIGRATION SCRIPT
-- =========================================================================
-- Compatible with PostgreSQL 13+ / Supabase
-- Includes: Extensions, Tables, Realtime Publication, RLS Policies, Indexes,
-- Auto-Timestamps, and Dual Column Sync Triggers (student_name <-> name)
-- =========================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 2. EXAMS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL DEFAULT 'IELTS Academic Master Assessment',
    pin_code VARCHAR(16) UNIQUE NOT NULL,
    
    -- Status & Sequential Stage Tracking
    status VARCHAR(32) NOT NULL DEFAULT 'lobby',
    current_stage VARCHAR(64) NOT NULL DEFAULT 'listening_lobby',
    
    -- Dynamic Question & Asset Parsing (Supports <40 dynamic questions)
    parsed_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    answer_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_questions INTEGER NOT NULL DEFAULT 40,
    
    -- Reading Section Assets (Multi-Part Slot Support)
    reading_pdf_url TEXT NULL,
    reading_pdf_name VARCHAR(255) NULL,
    reading_parts JSONB NOT NULL DEFAULT '{"part1": {}, "part2": {}, "part3": {}}'::jsonb,
    reading_passages JSONB NOT NULL DEFAULT '[]'::jsonb,
    reading_questions JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Listening Section Assets (Hybrid 4 Audio Slots + PDF Booklet)
    listening_audio_parts JSONB NOT NULL DEFAULT '{"part1": "", "part2": "", "part3": "", "part4": ""}'::jsonb,
    listening_pdf_url TEXT NULL,
    listening_pdf_name VARCHAR(255) NULL,
    listening_audio_settings JSONB NOT NULL DEFAULT '{"lock_scrubbing": true, "lock_rewind": true, "single_play_enforcement": true}'::jsonb,
    listening_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
    listening_parts_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    listening_questions JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Writing Section Assets (Multi-Task Slot Support)
    writing_pdf_url TEXT NULL,
    writing_pdf_name VARCHAR(255) NULL,
    writing_tasks JSONB NOT NULL DEFAULT '{"task1": {}, "task2": {}}'::jsonb,
    writing_task1 JSONB NOT NULL DEFAULT '{"min_words": 150, "recommended_mins": 20, "prompt": ""}'::jsonb,
    writing_task2 JSONB NOT NULL DEFAULT '{"min_words": 250, "recommended_mins": 40, "prompt": ""}'::jsonb,
    task_1_prompt TEXT NULL,
    task_2_prompt TEXT NULL,

    -- Timing & Durations
    duration_mins INTEGER NOT NULL DEFAULT 60,
    reading_duration_mins INTEGER NOT NULL DEFAULT 60,
    writing_duration_mins INTEGER NOT NULL DEFAULT 60,
    listening_duration_mins INTEGER NOT NULL DEFAULT 35,
    stage_started_at TIMESTAMPTZ NULL,
    started_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,

    -- Proctoring
    anti_cheat_strictness VARCHAR(32) NOT NULL DEFAULT 'strict',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- 2B. EXAM SECTIONS TABLE (DYNAMIC REAL PARSED PAYLOADS)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.exam_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    section_type VARCHAR(32) NOT NULL, -- 'listening', 'reading', 'writing'
    title VARCHAR(255) NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    answer_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
    prompts JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_exam_sections_exam_type UNIQUE (exam_id, section_type)
);

-- =========================================================================
-- 3. STUDENTS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    
    -- Student Identification (Both student_name and name supported)
    student_name TEXT NULL,
    name VARCHAR(255) NULL,
    candidate_no VARCHAR(64) NOT NULL DEFAULT 'CAND-001',
    
    -- Participation Status
    status VARCHAR(32) NOT NULL DEFAULT 'waiting',
    is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualification_reason TEXT NULL,
    warning_count INTEGER NOT NULL DEFAULT 0,
    
    -- Stage Progress
    current_stage VARCHAR(64) NOT NULL DEFAULT 'listening_lobby',
    reading_status VARCHAR(32) NOT NULL DEFAULT 'waiting',
    writing_status VARCHAR(32) NOT NULL DEFAULT 'waiting',
    listening_status VARCHAR(32) NOT NULL DEFAULT 'waiting',

    -- Responses
    answers JSONB NOT NULL DEFAULT '{"reading": {}, "listening": {}, "writing": {}}'::jsonb,
    answered_count INTEGER NOT NULL DEFAULT 0,

    -- Scores JSON & Individual Columns
    scores JSONB NOT NULL DEFAULT '{"reading_score": 0, "listening_score": 0, "writing_score": 0, "overall_band": null}'::jsonb,
    reading_score INTEGER NULL,
    reading_band NUMERIC(3,1) NULL,
    listening_score INTEGER NULL,
    listening_band NUMERIC(3,1) NULL,

    -- Writing Submissions & AI Assessment
    writing_task1_essay TEXT NULL,
    writing_task2_essay TEXT NULL,
    writing_task1_band NUMERIC(3,1) NULL,
    writing_task2_band NUMERIC(3,1) NULL,
    writing_band NUMERIC(3,1) NULL,
    overall_band NUMERIC(3,1) NULL,
    writing_ai_evaluation JSONB NULL,

    -- Timestamps
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ NULL,
    submitted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_students_exam_candidate UNIQUE (exam_id, candidate_no)
);

-- =========================================================================
-- 4. REALTIME PROCTORING & AUDIT EVENTS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.exam_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- 5. PERFORMANCE INDEXES
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_exams_pin_code ON public.exams(pin_code);
CREATE INDEX IF NOT EXISTS idx_exams_status ON public.exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_current_stage ON public.exams(current_stage);

CREATE INDEX IF NOT EXISTS idx_students_exam_id ON public.students(exam_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_students_exam_status ON public.students(exam_id, status);

CREATE INDEX IF NOT EXISTS idx_exam_events_exam_id ON public.exam_events(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_events_student_id ON public.exam_events(student_id);

-- =========================================================================
-- 6. AUTOMATIC TIMESTAMP & SYNC TRIGGERS
-- =========================================================================

-- Trigger to automatically maintain updated_at
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_timestamp_exams ON public.exams;
CREATE TRIGGER trg_set_timestamp_exams
    BEFORE UPDATE ON public.exams
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_set_timestamp_students ON public.students;
CREATE TRIGGER trg_set_timestamp_students
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_updated_at();

-- Trigger to keep student_name and name synchronized
CREATE OR REPLACE FUNCTION public.fn_sync_student_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.student_name IS NULL AND NEW.name IS NOT NULL THEN
        NEW.student_name = NEW.name;
    ELSIF NEW.name IS NULL AND NEW.student_name IS NOT NULL THEN
        NEW.name = NEW.student_name;
    END IF;

    -- Sync is_disqualified with status
    IF NEW.status = 'disqualified' THEN
        NEW.is_disqualified = TRUE;
    ELSIF NEW.is_disqualified = TRUE AND NEW.status != 'disqualified' THEN
        NEW.status = 'disqualified';
    END IF;

    -- Ensure joined_at is populated
    IF NEW.joined_at IS NULL THEN
        NEW.joined_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_student_name ON public.students;
CREATE TRIGGER trg_sync_student_name
    BEFORE INSERT OR UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_student_name();

-- =========================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES (PERMISSIVE FOR ANON KEY)
-- =========================================================================
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_events ENABLE ROW LEVEL SECURITY;

-- EXAMS POLICIES
DROP POLICY IF EXISTS "Public Read Exams" ON public.exams;
CREATE POLICY "Public Read Exams" ON public.exams
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Exams" ON public.exams;
CREATE POLICY "Public Insert Exams" ON public.exams
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Update Exams" ON public.exams;
CREATE POLICY "Public Update Exams" ON public.exams
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Delete Exams" ON public.exams;
CREATE POLICY "Public Delete Exams" ON public.exams
    FOR DELETE USING (true);

-- STUDENTS POLICIES
DROP POLICY IF EXISTS "Public Read Students" ON public.students;
CREATE POLICY "Public Read Students" ON public.students
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Students" ON public.students;
CREATE POLICY "Public Insert Students" ON public.students
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Update Students" ON public.students;
CREATE POLICY "Public Update Students" ON public.students
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Delete Students" ON public.students;
CREATE POLICY "Public Delete Students" ON public.students
    FOR DELETE USING (true);

-- EXAM EVENTS POLICIES
DROP POLICY IF EXISTS "Public Read Events" ON public.exam_events;
CREATE POLICY "Public Read Events" ON public.exam_events
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Events" ON public.exam_events;
CREATE POLICY "Public Insert Events" ON public.exam_events
    FOR INSERT WITH CHECK (true);

-- EXAM SECTIONS POLICIES
ALTER TABLE public.exam_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Exam Sections" ON public.exam_sections;
CREATE POLICY "Public Read Exam Sections" ON public.exam_sections
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Exam Sections" ON public.exam_sections;
CREATE POLICY "Public Insert Exam Sections" ON public.exam_sections
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Update Exam Sections" ON public.exam_sections;
CREATE POLICY "Public Update Exam Sections" ON public.exam_sections
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Delete Exam Sections" ON public.exam_sections;
CREATE POLICY "Public Delete Exam Sections" ON public.exam_sections
    FOR DELETE USING (true);

-- =========================================================================
-- 8. REPLICA IDENTITY (FULL ROW REALTIME BROADCAST)
-- =========================================================================
ALTER TABLE public.exams REPLICA IDENTITY FULL;
ALTER TABLE public.students REPLICA IDENTITY FULL;
ALTER TABLE public.exam_events REPLICA IDENTITY FULL;
ALTER TABLE public.exam_sections REPLICA IDENTITY FULL;

-- =========================================================================
-- 9. SUPABASE REALTIME PUBLICATION
-- =========================================================================
DO $$
BEGIN
    -- Add exams table to publication if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'exams'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;
    END IF;

    -- Add students table to publication if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'students'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
    END IF;

    -- Add exam_events table to publication if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'exam_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_events;
    END IF;

    -- Add exam_sections table to publication if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'exam_sections'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_sections;
    END IF;
END $$;
