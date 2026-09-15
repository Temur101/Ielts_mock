import React, { useState } from 'react';
import { Database, CheckCircle2, Copy, Check, ExternalLink, ShieldAlert, Zap } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { saveSupabaseConfig, getSupabaseStatus } from '../../lib/supabase';

export function SupabaseModal({ isOpen, onClose }) {
  const status = getSupabaseStatus();
  const [url, setUrl] = useState(localStorage.getItem('supabase_url') || '');
  const [key, setKey] = useState(localStorage.getItem('supabase_anon_key') || '');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'schema'

  const handleSave = (e) => {
    e.preventDefault();
    saveSupabaseConfig(url, key);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
      window.location.reload();
    }, 1000);
  };

  const handleCopySchema = () => {
    const schemaSql = `-- IELTS Classroom Mock System Schema
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    pin_code VARCHAR(16) UNIQUE NOT NULL,
    duration_mins INTEGER NOT NULL DEFAULT 60,
    status VARCHAR(32) NOT NULL DEFAULT 'lobby',
    started_at TIMESTAMP WITH TIME ZONE NULL,
    ended_at TIMESTAMP WITH TIME ZONE NULL,
    passages JSONB NOT NULL DEFAULT '[]'::jsonb,
    answer_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    candidate_no VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'waiting',
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    answered_count INTEGER NOT NULL DEFAULT 0,
    score INTEGER NULL,
    band_score NUMERIC(3,1) NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;`;

    navigator.clipboard.writeText(schemaSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Supabase Database & Realtime Sync Engine"
      subtitle="Connect live Supabase Postgres or inspect PostgreSQL Schema DDL"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-4 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-2 transition ${activeTab === 'config' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Connection Settings
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`pb-2 transition ${activeTab === 'schema' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            SQL Schema & DDL
          </button>
        </div>

        {activeTab === 'config' ? (
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl text-xs text-brand-900 flex items-start gap-2.5">
              <Zap className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Zero-Config Mode Active:</span> Multi-tab BroadcastChannel real-time sync is working automatically! Adding your live Supabase credentials enables remote multi-device classroom synchronization.
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Supabase Project URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Supabase Anon Public API Key
              </label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-slate-800"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500">
                Current Status: <span className="font-semibold text-slate-800">{status.isConfigured ? '🟢 Connected to Remote Supabase' : '⚡ Local Broadcast Engine (Active)'}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" icon={saved ? Check : Database}>
                  {saved ? 'Saved & Reloading...' : 'Save & Connect'}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center">
              <p className="text-xs text-slate-600 font-medium">Run this script in Supabase SQL Editor:</p>
              <Button variant="outline" size="sm" icon={copied ? Check : Copy} onClick={handleCopySchema}>
                {copied ? 'Copied to Clipboard' : 'Copy SQL Schema'}
              </Button>
            </div>
            <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-xs overflow-x-auto max-h-60 border border-slate-800">
              <pre>
{`-- 1. EXAMS TABLE
CREATE TABLE public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    pin_code VARCHAR(16) UNIQUE NOT NULL,
    duration_mins INTEGER NOT NULL DEFAULT 60,
    status VARCHAR(32) NOT NULL DEFAULT 'lobby',
    started_at TIMESTAMP WITH TIME ZONE NULL,
    passages JSONB NOT NULL DEFAULT '[]'::jsonb,
    answer_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. STUDENTS TABLE
CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    candidate_no VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'waiting',
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    score INTEGER NULL,
    band_score NUMERIC(3,1) NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. ENABLE REALTIME BROADCAST
ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
