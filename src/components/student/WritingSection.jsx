import React, { useState, useEffect } from 'react';
import { 
  PenTool, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Sparkles,
  Layers,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { IeltsBookletRenderer } from './IeltsBookletRenderer';

export function WritingSection({
  exam,
  writingData,
  task1Essay = '',
  task2Essay = '',
  onTask1Change,
  onTask2Change,
}) {
  const [activeTask, setActiveTask] = useState(1); // 1 | 2

  // Dynamic Prompt extraction from Supabase exam and parsed payload
  const task_1_prompt = exam?.task_1_prompt || 
                        writingData?.task_1_prompt || 
                        writingData?.task1_prompt || 
                        writingData?.task1?.prompt || 
                        exam?.writing_tasks?.task1?.prompt || 
                        "The chart below shows the percentage of electricity generated from renewable energy sources across four European countries between 2010 and 2025.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\nWrite at least 150 words.";

  const task_2_prompt = exam?.task_2_prompt || 
                        writingData?.task_2_prompt || 
                        writingData?.task2_prompt || 
                        writingData?.task2?.prompt || 
                        exam?.writing_tasks?.task2?.prompt || 
                        "Some people argue that technological advances in artificial intelligence and automation will lead to mass unemployment and economic inequality, while others believe AI will create more rewarding and innovative job opportunities.\n\nDiscuss both views and give your own opinion.\nWrite at least 250 words.";

  const task1 = {
    title: "Task 1: Academic Report",
    recommended_mins: writingData?.task1?.recommended_mins || 20,
    min_words: writingData?.task1?.min_words || 150,
    prompt: task_1_prompt,
    visual_description: writingData?.task1?.visual_description || exam?.writing_tasks?.task1?.visual_description || '',
    pdf_url: writingData?.task1?.pdf_url || exam?.writing_pdf_url || writingData?.pdf_url || '',
  };

  const task2 = {
    title: "Task 2: Discursive Essay",
    recommended_mins: writingData?.task2?.recommended_mins || 40,
    min_words: writingData?.task2?.min_words || 250,
    prompt: task_2_prompt,
    pdf_url: writingData?.task2?.pdf_url || exam?.writing_pdf_url || writingData?.pdf_url || '',
  };

  const countWords = (text) => {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const task1Words = countWords(task1Essay);
  const task2Words = countWords(task2Essay);

  const currentTaskData = activeTask === 1 ? task1 : task2;
  const currentPrompt = activeTask === 1 ? task_1_prompt : task_2_prompt;
  const currentEssay = activeTask === 1 ? task1Essay : task2Essay;
  const currentWords = activeTask === 1 ? task1Words : task2Words;
  const minRequired = currentTaskData.min_words || (activeTask === 1 ? 150 : 250);
  const isWordCountMet = currentWords >= minRequired;

  return (
    <div className="h-full flex flex-col bg-white">
      
      {/* Top Header & Task Switcher */}
      <div className="p-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-sm z-10 shrink-0">
        
        {/* Task Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTask(1)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTask === 1
                ? 'bg-brand-500 text-white shadow-glow shadow-brand-500/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="w-5 h-5 rounded-md bg-black/20 text-white font-mono text-[10px] flex items-center justify-center">T1</span>
            Task 1: Report ({task1Words}/150 w)
            {task1Words >= 150 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTask(2)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTask === 2
                ? 'bg-brand-500 text-white shadow-glow shadow-brand-500/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="w-5 h-5 rounded-md bg-black/20 text-white font-mono text-[10px] flex items-center justify-center">T2</span>
            Task 2: Essay ({task2Words}/250 w)
            {task2Words >= 250 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />}
          </button>
        </div>

        {/* Live Word Count Pill */}
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-mono font-bold transition ${
            isWordCountMet
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-amber-50 border-amber-300 text-amber-700'
          }`}>
            <span>Word Count:</span>
            <span className="text-sm">{currentWords}</span>
            <span className="text-[10px] text-slate-400 font-sans">/ min {minRequired}</span>
          </div>

          <div className="text-xs text-slate-400 font-medium hidden sm:block">
            {activeTask === 1 ? 'Rec. 20 Mins (Weight 33%)' : 'Rec. 40 Mins (Weight 67%)'}
          </div>
        </div>

      </div>

      {/* Main Split Layout: Prompt (Left 45%) vs Editor (Right 55%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* Left Column (Prompt & Visual Description): 5 Cols */}
        <div className="lg:col-span-5 border-r border-slate-200 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-brand-600">
              {currentTaskData.title}
            </span>
            <Badge variant="slate" size="sm">
              <Clock className="w-3 h-3" /> {currentTaskData.recommended_mins || (activeTask === 1 ? 20 : 40)} Mins
            </Badge>
          </div>

          {(() => {
            const currentTaskHtml = activeTask === 1
              ? (exam?.writing?.sections?.find((s) => s.part === 1)?.page_content_html ||
                 exam?.writing_tasks?.task1?.page_content_html ||
                 exam?.writing?.tasks?.task1?.page_content_html)
              : (exam?.writing?.sections?.find((s) => s.part === 2)?.page_content_html ||
                 exam?.writing_tasks?.task2?.page_content_html ||
                 exam?.writing?.tasks?.task2?.page_content_html);

            if (currentTaskHtml) {
              return (
                <div className="p-5 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b pb-2 border-slate-200">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-brand-500" />
                      Authentic Cambridge Exam Booklet:
                    </div>
                    {currentTaskData.pdf_url && (
                      <a
                        href={currentTaskData.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand-600 hover:text-brand-700 font-bold underline flex items-center gap-1"
                      >
                        Open PDF ↗
                      </a>
                    )}
                  </div>
                  <IeltsBookletRenderer htmlContent={currentTaskHtml} />
                </div>
              );
            }

            return (
              /* Task Prompt Card Fallback */
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand-500" />
                    Prompt Instructions:
                  </div>
                  {currentTaskData.pdf_url && (
                    <a
                      href={currentTaskData.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-brand-600 hover:text-brand-700 font-bold underline flex items-center gap-1"
                    >
                      Open PDF in Tab ↗
                    </a>
                  )}
                </div>

                <div className="text-xs text-slate-800 font-medium leading-relaxed whitespace-pre-line">
                  {currentTaskData.prompt}
                </div>

                {/* Embedded PDF if attached */}
                {currentTaskData.pdf_url && (
                  <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden bg-white h-[480px] shadow-sm">
                    <iframe
                      src={currentTaskData.pdf_url}
                      title={`Writing Task ${activeTask} Prompt Booklet`}
                      className="w-full h-full border-0"
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Task 1 Chart Image if present */}
          {activeTask === 1 && currentTaskData.image_url && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand-600" />
                Task 1 Visual Chart:
              </div>
              <img
                src={currentTaskData.image_url}
                alt={currentTaskData.visual_description || "Task 1 Chart Data"}
                className="w-full max-h-64 object-contain rounded-xl border border-slate-100 bg-white"
              />
            </div>
          )}

          {/* Task 1 Visual diagram aid text */}
          {activeTask === 1 && currentTaskData.visual_description && (
            <div className="p-4 rounded-2xl bg-orange-50/80 border border-brand-200 space-y-2">
              <div className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand-600" />
                Visual Data Guide:
              </div>
              <p className="text-xs text-brand-900/80 leading-relaxed">
                {currentTaskData.visual_description}
              </p>
            </div>
          )}

          {/* IELTS Writing Criteria Reminder */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2 text-xs">
            <div className="font-bold text-slate-800">Examiner Assessment Criteria:</div>
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
              <li>Task Achievement / Response</li>
              <li>Coherence and Cohesion</li>
              <li>Lexical Resource (Vocabulary)</li>
              <li>Grammatical Range and Accuracy</li>
            </ul>
          </div>
        </div>

        {/* Right Column (Essay Input & Live Metrics): 7 Cols */}
        <div className="lg:col-span-7 flex flex-col h-full bg-white">
          <div className="p-3 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between text-xs text-slate-500">
            <span>Type your response below. Word count updates automatically.</span>
            <span className="font-mono text-[11px]">
              {currentEssay.length} Characters • {currentWords} Words
            </span>
          </div>

          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 flex flex-col">
            {/* Dynamic Prompt Card directly above the student's essay input */}
            <div className="p-4 rounded-2xl bg-orange-50/70 border border-brand-200 shadow-xs shrink-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700 flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-brand-600" />
                  {activeTask === 1 ? 'Task 1 Prompt' : 'Task 2 Prompt'}
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Minimum {minRequired} Words
                </span>
              </div>
              <p className="text-xs text-slate-800 font-medium leading-relaxed whitespace-pre-line">
                {currentPrompt}
              </p>
              {activeTask === 1 && currentTaskData.visual_description && (
                <div className="mt-2.5 pt-2 border-t border-brand-200/60 text-[11px] text-brand-900/80 italic flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-brand-500 shrink-0" />
                  <span>Visual Context: {currentTaskData.visual_description}</span>
                </div>
              )}
            </div>

            <textarea
              value={currentEssay}
              onChange={(e) => {
                if (activeTask === 1) {
                  onTask1Change(e.target.value);
                } else {
                  onTask2Change(e.target.value);
                }
              }}
              placeholder={
                activeTask === 1
                  ? "Write your Task 1 summary here (at least 150 words)..."
                  : "Write your Task 2 essay here (at least 250 words)..."
              }
              className="flex-1 w-full min-h-[360px] p-4 text-sm rounded-2xl border border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 font-sans text-slate-900 leading-relaxed resize-none focus:outline-none bg-white shadow-xs"
            />
          </div>

          {/* Bottom Word Requirement Status */}
          <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isWordCountMet ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="font-medium text-slate-700">
                {isWordCountMet 
                  ? `Minimum requirement satisfied (${currentWords}/${minRequired} words)` 
                  : `Need ${minRequired - currentWords} more words to reach minimum`}
              </span>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              Auto-saved in memory & synced
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
