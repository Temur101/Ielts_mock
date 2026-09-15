import React, { useRef, useState } from 'react';
import { 
  CheckCircle2, 
  HelpCircle, 
  Flag, 
  ArrowUp, 
  ChevronRight, 
  ListChecks,
  Check
} from 'lucide-react';
import { IeltsBookletRenderer } from './IeltsBookletRenderer';

export function AnswerSheet({
  questions = [],
  answers = {},
  flagged = {},
  activePassageId,
  onAnswerChange,
  onToggleFlag,
  onJumpToPassage,
  bookletHtml = '',
}) {
  const [viewMode, setViewMode] = useState('booklet'); // 'booklet' | 'cards'
  const questionRefs = useRef({});

  const filteredQuestions = questions.filter(q => q.passageId === activePassageId);
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).filter(k => answers[k] && answers[k].trim()).length;

  const scrollToQuestion = (qNum, passageId) => {
    if (passageId !== activePassageId) {
      onJumpToPassage(passageId);
      setTimeout(() => {
        const el = questionRefs.current[qNum];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      const el = questionRefs.current[qNum];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50/50">
      
      {/* Top Header Progress */}
      <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-brand-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            IELTS Answer Sheet (Passage {activePassageId})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {bookletHtml && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setViewMode('booklet')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  viewMode === 'booklet'
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-600'
                }`}
              >
                Exact Booklet
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  viewMode === 'cards'
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-600'
                }`}
              >
                Cards
              </button>
            </div>
          )}
          <div className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
            {answeredCount} / {totalQuestions} Answered
          </div>
        </div>
      </div>

      {/* Questions Scrollable Body */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
        {bookletHtml && viewMode === 'booklet' ? (
          <div className="bg-white rounded-2xl border border-slate-300 p-5 sm:p-6 shadow-sm">
            <div className="border-b pb-2.5 mb-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
              <span>Authentic Booklet • Passage {activePassageId} Questions</span>
              <span className="text-brand-600">Type directly into blanks</span>
            </div>
            <IeltsBookletRenderer
              htmlContent={bookletHtml}
              answers={answers}
              onAnswerChange={onAnswerChange}
              flagged={flagged}
            />
          </div>
        ) : (
          filteredQuestions.map((q) => {
          const qNum = q.questionNumber;
          const currentVal = answers[qNum] || '';
          const isFlagged = flagged[qNum] || false;
          const isAnswered = Boolean(currentVal && currentVal.trim());

          return (
            <div
              key={q.id}
              ref={el => questionRefs.current[qNum] = el}
              className={`p-4 sm:p-5 rounded-2xl bg-white border transition-all duration-200 ${
                isFlagged 
                  ? 'border-amber-400 ring-2 ring-amber-100 shadow-sm' 
                  : isAnswered 
                    ? 'border-brand-300 shadow-sm' 
                    : 'border-slate-200 shadow-card'
              }`}
            >
              {/* Question Instruction header if present */}
              {q.instruction && (
                <div className="text-xs font-semibold text-brand-800 bg-brand-50/80 p-2.5 rounded-xl mb-3 border border-brand-100 whitespace-pre-line">
                  {q.instruction}
                </div>
              )}

              {/* Question Number & Flag Toggle */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className={`w-7 h-7 rounded-xl font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                    isAnswered 
                      ? 'bg-brand-500 text-white' 
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {qNum}
                  </span>
                  <div className="text-sm font-semibold text-slate-900 leading-snug">
                    {q.text}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleFlag(qNum)}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    isFlagged 
                      ? 'bg-amber-100 text-amber-700' 
                      : 'text-slate-300 hover:text-amber-500 hover:bg-slate-100'
                  }`}
                  title={isFlagged ? 'Remove flag' : 'Flag for review'}
                >
                  <Flag className="w-4 h-4" />
                </button>
              </div>

              {/* Interactive Input Types */}
              <div className="mt-4 pl-9">
                {/* 1. TRUE/FALSE/NOT GIVEN or YES/NO/NOT GIVEN */}
                {(q.type === 'TRUE_FALSE_NOT_GIVEN' || q.type === 'YES_NO_NOT_GIVEN') && (
                  <div className="grid grid-cols-3 gap-2">
                    {q.options?.map((option) => {
                      const isSelected = currentVal.toUpperCase() === option.toUpperCase();
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => onAnswerChange(qNum, option)}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                            isSelected
                              ? 'bg-brand-500 text-white border-brand-500 shadow-sm shadow-brand-500/20 ring-2 ring-brand-200'
                              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 2. MULTIPLE CHOICE */}
                {q.type === 'MULTIPLE_CHOICE' && (
                  <div className="space-y-2">
                    {q.options?.map((option) => {
                      const letter = option.charAt(0);
                      const isSelected = currentVal.toUpperCase() === letter.toUpperCase();
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => onAnswerChange(qNum, letter)}
                          className={`w-full text-left p-3 rounded-xl text-xs font-medium border flex items-center justify-between transition-all ${
                            isSelected
                              ? 'bg-brand-50/80 border-brand-500 text-brand-900 ring-1 ring-brand-500'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <span>{option}</span>
                          {isSelected && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 3. FILL_BLANK / Sentence completion */}
                {q.type === 'FILL_BLANK' && (
                  <div>
                    <input
                      type="text"
                      value={currentVal}
                      onChange={(e) => onAnswerChange(qNum, e.target.value)}
                      placeholder={q.placeholder || "Type your answer here..."}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium text-slate-900 bg-white"
                    />
                  </div>
                )}
              </div>

            </div>
          );
        }))}
      </div>

      {/* Bottom Question Navigation Palette (1–40) */}
      <div className="p-3 border-t border-slate-200 bg-white shadow-md">
        <div className="flex items-center justify-between mb-2 text-[11px] font-semibold text-slate-500">
          <span>Question Palette (1–{questions.length})</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-500" /> Answered
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Flagged
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-300" /> Unanswered
            </span>
          </div>
        </div>

        <div className="grid grid-cols-10 sm:grid-cols-20 gap-1 max-h-20 overflow-y-auto p-0.5">
          {questions.map((q) => {
            const qNum = q.questionNumber;
            const isAns = Boolean(answers[qNum] && answers[qNum].trim());
            const isFlg = flagged[qNum];

            return (
              <button
                key={qNum}
                type="button"
                onClick={() => scrollToQuestion(qNum, q.passageId)}
                className={`h-7 rounded-lg font-mono text-[10px] font-bold transition flex items-center justify-center relative ${
                  isFlg 
                    ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-200' 
                    : isAns 
                      ? 'bg-brand-500 text-white shadow-sm' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {qNum}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
