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
import { renderPdfPagesToDataUrls } from '../../lib/pdfRenderer';

export function WritingSection({
  exam,
  writingData,
  task1Essay = '',
  task2Essay = '',
  onTask1Change,
  onTask2Change,
  isTimeUp = false,
  timeRemaining = 0,
}) {
  const [activeTask, setActiveTask] = useState(1); // 1 | 2
  const [pageImages, setPageImages] = useState({ 1: null, 2: null });
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);

  const DEFAULT_TASK1_PROMPT = "Please refer to the attached Task 1 PDF booklet for the prompt instructions and data visualization.";
  const DEFAULT_TASK2_PROMPT = "Please refer to the attached Task 2 PDF booklet for the prompt instructions and essay topic.";

  // Dynamic Prompt extraction from Supabase exam and parsed payload
  const task_1_prompt = exam?.task_1_prompt || 
                        writingData?.task_1_prompt || 
                        writingData?.task1_prompt || 
                        writingData?.task1?.prompt || 
                        exam?.writing_tasks?.task1?.prompt || 
                        DEFAULT_TASK1_PROMPT;

  const task_2_prompt = exam?.task_2_prompt || 
                        writingData?.task_2_prompt || 
                        writingData?.task2_prompt || 
                        writingData?.task2?.prompt || 
                        exam?.writing_tasks?.task2?.prompt || 
                        DEFAULT_TASK2_PROMPT;

  const task1 = {
    title: writingData?.task1?.title || "Task 1: Academic Report",
    recommended_mins: writingData?.task1?.recommended_mins || 20,
    min_words: writingData?.task1?.min_words || 150,
    prompt: task_1_prompt,
    page_index: typeof writingData?.task1?.page_index === 'number'
      ? writingData.task1.page_index
      : typeof exam?.writing_tasks?.task1?.page_index === 'number'
      ? exam.writing_tasks.task1.page_index
      : (typeof exam?.writing?.task1?.page_index === 'number' ? exam.writing.task1.page_index : 0),
    visual_description: writingData?.task1?.visual_description || exam?.writing_tasks?.task1?.visual_description || '',
    pdf_url: writingData?.task1?.pdf_url || exam?.writing_pdf_url || writingData?.pdf_url || '',
    image_url: writingData?.task1?.image_url || 
               exam?.writing_tasks?.task1?.image_url || 
               exam?.writing?.tasks?.task1?.image_url ||
               exam?.writing_image_url || 
               writingData?.image_url || 
               exam?.task_1_image_url || 
               exam?.task1_image_url || 
               '',
  };

  const task2 = {
    title: writingData?.task2?.title || "Task 2: Discursive Essay",
    recommended_mins: writingData?.task2?.recommended_mins || 40,
    min_words: writingData?.task2?.min_words || 250,
    prompt: task_2_prompt,
    page_index: typeof writingData?.task2?.page_index === 'number'
      ? writingData.task2.page_index
      : typeof exam?.writing_tasks?.task2?.page_index === 'number'
      ? exam.writing_tasks.task2.page_index
      : (typeof exam?.writing?.task2?.page_index === 'number' ? exam.writing.task2.page_index : 1),
    pdf_url: writingData?.task2?.pdf_url || exam?.writing_pdf_url || writingData?.pdf_url || '',
  };

  const pdfSource = exam?.writing_pdf_url || 
                    exam?.writing_pdf_blob || 
                    exam?.writingPdf || 
                    writingData?.task1?.pdf_url || 
                    writingData?.pdf_url || 
                    exam?.writing?.pdf_url || 
                    task1.pdf_url || 
                    '';

  useEffect(() => {
    let isMounted = true;
    if (!pdfSource) return;

    // Convert zero-based page_index to 1-based page numbers for PDF rendering
    const task1PageNum = (typeof task1.page_index === 'number' ? task1.page_index : 0) + 1;
    const task2PageNum = (typeof task2.page_index === 'number' ? task2.page_index : 1) + 1;
    const targetPages = Array.from(new Set([task1PageNum, task2PageNum])).filter(p => p > 0);

    setIsRenderingPdf(true);
    renderPdfPagesToDataUrls(pdfSource, targetPages, 2.0)
      .then((urls) => {
        if (isMounted && urls) {
          setPageImages({
            1: urls[task1PageNum] || null,
            2: urls[task2PageNum] || null,
          });
        }
      })
      .catch((err) => {
        console.warn('[WritingSection] PDF rendering failed:', err);
      })
      .finally(() => {
        if (isMounted) setIsRenderingPdf(false);
      });

    return () => {
      isMounted = false;
    };
  }, [pdfSource, task1.page_index, task2.page_index]);

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

  const rawPdfUrl = currentTaskData.pdf_url || '';
  const page1DataUrl = pageImages[1] || task1.image_url;
  const page2DataUrl = pageImages[2];

  return (
    <div className="h-full flex flex-col bg-white">
      
      {/* Top Header & Task Switcher (Compact ~44px) */}
      <div className="h-11 px-3 sm:px-4 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shadow-xs z-10 shrink-0">
        
        {/* Task Tabs */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTask(1)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTask === 1
                ? 'bg-brand-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="w-4 h-4 rounded bg-black/20 text-white font-mono text-[9px] flex items-center justify-center">T1</span>
            <span>Task 1 ({task1Words}/150 w)</span>
            {task1Words >= 150 && <CheckCircle2 className="w-3 h-3 text-emerald-300" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTask(2)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTask === 2
                ? 'bg-brand-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="w-4 h-4 rounded bg-black/20 text-white font-mono text-[9px] flex items-center justify-center">T2</span>
            <span>Task 2 ({task2Words}/250 w)</span>
            {task2Words >= 250 && <CheckCircle2 className="w-3 h-3 text-emerald-300" />}
          </button>
        </div>

        {/* Live Word Count Pill */}
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-0.5 rounded-lg border flex items-center gap-1.5 text-xs font-mono font-bold transition ${
            isWordCountMet
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-amber-50 border-amber-300 text-amber-700'
          }`}>
            <span>Words:</span>
            <span className="font-extrabold">{currentWords}</span>
            <span className="text-[10px] text-slate-400 font-sans">/ {minRequired}</span>
          </div>

          <div className="text-[11px] text-slate-400 font-medium hidden sm:block">
            {activeTask === 1 ? '20 mins (33%)' : '40 mins (67%)'}
          </div>
        </div>

      </div>

      {/* Main Split Layout: Prompt (Left 45%) vs Editor (Right 55%) - Independent Scroll Containers */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* Left Column (Prompt & Visual/PDF Description): 5 Cols */}
        <div className="lg:col-span-5 border-r border-slate-200 p-4 sm:p-5 overflow-y-auto space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-brand-600">
              {currentTaskData.title}
            </span>
            <Badge variant="slate" size="sm">
              <Clock className="w-3 h-3" /> {currentTaskData.recommended_mins || (activeTask === 1 ? 20 : 40)} Mins
            </Badge>
          </div>

          {/* Task 1 Left Pane: Static Page 1 PDF Image & Prompt (Zero leakage into Task 2) */}
          {activeTask === 1 && (
            <div className="space-y-3">
              {isRenderingPdf && !page1DataUrl ? (
                <div className="p-8 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading Task 1 exam paper...</span>
                </div>
              ) : page1DataUrl ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm p-1">
                  <img
                    src={page1DataUrl}
                    className="w-full h-auto max-h-[calc(100vh-140px)] object-contain rounded-lg border border-slate-200 shadow-sm select-none"
                    alt="Task 1 Prompt and Chart"
                  />
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between border-b pb-2 border-slate-100">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-brand-500" />
                      Task 1 Report Instructions
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Min. 150 Words
                    </span>
                  </div>

                  <div className="text-xs text-slate-800 font-medium leading-relaxed whitespace-pre-line">
                    {task_1_prompt}
                  </div>
                </div>
              )}

              {/* Task 1 Visual Diagram Guide if present */}
              {currentTaskData.visual_description && (
                <div className="p-3.5 rounded-xl bg-orange-50/70 border border-brand-200 space-y-1.5">
                  <div className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                    Visual Data Guide:
                  </div>
                  <p className="text-xs text-brand-900/80 leading-relaxed">
                    {currentTaskData.visual_description}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Task 2 Left Pane: Completely Detached View (Page 2 Image or Formatted Card, Zero Task 1 Assets) */}
          {activeTask === 2 && (
            <div className="space-y-3">
              {page2DataUrl ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm p-1">
                  <img
                    src={page2DataUrl}
                    className="w-full h-auto max-h-[calc(100vh-140px)] object-contain rounded-lg border border-slate-200 shadow-sm select-none"
                    alt="Task 2 Prompt"
                  />
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-brand-500" />
                      IELTS Writing Task 2 Essay Topic
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      Minimum 250 Words
                    </span>
                  </div>

                  <div className="text-sm text-slate-900 font-medium leading-relaxed whitespace-pre-line p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                    {task_2_prompt}
                  </div>

                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-xs text-amber-950 font-medium leading-relaxed">
                    Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Assessment Criteria Note */}
          <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] space-y-1">
            <span className="font-bold text-slate-700">Scoring Criteria:</span> Task Achievement / Response, Coherence & Cohesion, Lexical Resource, Grammatical Range and Accuracy.
          </div>
        </div>

        {/* Right Column (Full-Height Essay Input): 7 Cols */}
        <div className="lg:col-span-7 flex flex-col h-full bg-white">
          <div className="h-9 px-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <span className="font-medium text-slate-600">
              Task {activeTask} Response Area
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {currentEssay.length} Chars • {currentWords} Words
            </span>
          </div>

          {/* Full-Height Textarea container (No duplicate prompt card!) */}
          <div className="flex-1 p-3 sm:p-4 flex flex-col overflow-hidden">
            <textarea
              value={currentEssay}
              disabled={isTimeUp}
              onChange={(e) => {
                if (isTimeUp) return;
                if (activeTask === 1) {
                  onTask1Change(e.target.value);
                } else {
                  onTask2Change(e.target.value);
                }
              }}
              placeholder={
                isTimeUp
                  ? "Time is up. This section is locked."
                  : activeTask === 1
                  ? "Type your Task 1 response here (minimum 150 words)..."
                  : "Type your Task 2 essay here (minimum 250 words)..."
              }
              className={`flex-1 w-full h-full p-4 text-sm rounded-xl border font-sans leading-relaxed resize-none focus:outline-none shadow-xs ${
                isTimeUp 
                  ? 'bg-slate-100 border-slate-300 text-slate-500 cursor-not-allowed' 
                  : 'bg-white border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-slate-900'
              }`}
            />
          </div>

          {/* Bottom Word Requirement Status (Compact 38px) */}
          <div className="h-10 px-4 border-t border-slate-200 bg-white flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isWordCountMet ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="font-medium text-slate-700 text-xs">
                {isWordCountMet 
                  ? `Minimum satisfied (${currentWords}/${minRequired} words)` 
                  : `Need ${minRequired - currentWords} more words to reach minimum (${currentWords}/${minRequired})`}
              </span>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              Auto-saved
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
