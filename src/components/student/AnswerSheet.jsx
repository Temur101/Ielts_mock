import React, { useRef, useState, useEffect } from 'react';
import {
  Flag,
  ListChecks,
  Check,
  Layers,
  Highlighter,
  Trash2,
} from 'lucide-react';
import { SelectionHighlightPopover } from './SelectionHighlightPopover';
import { applyHighlightToSelection, clearAllHighlights } from '../../lib/highlighterService';
import { IeltsBookletRenderer, FlowChartGapItem, MarkdownTable, MatchingHeadingsSelect } from './IeltsBookletRenderer';
import { 
  normalizeTemplateGaps,
  cleanGapArtifacts,
  splitSentenceAtGap,
  determineQuestionCategory,
  groupQuestionsIntoSets,
  extractKeyPrefix,
  extractQuestionNumbersFromTemplate,
} from '../../lib/questionUtils';

// ---------------------------------------------------------------------------
// GENERIC CAMBRIDGE IELTS QUESTION PROCESSORS
// ---------------------------------------------------------------------------

/**
 * Dynamically resolves reading passage ID for a question based on explicit metadata or test array
 */
export const resolveReadingPassage = (q, allQuestions = [], fallbackPassageId = 1) => {
  if (!q) return Number(fallbackPassageId || 1);
  const p = q.passageId ?? q.passage_id ?? q.partId ?? q.part;
  if (p !== undefined && p !== null && !isNaN(Number(p))) return Number(p);
  const qNum = Number(q.questionNumber || q.q_num || 0);
  if (Array.isArray(allQuestions) && allQuestions.length > 0 && qNum > 0) {
    const match = allQuestions.find(item => {
      const n = Number(item.questionNumber || item.q_num || 0);
      const mp = item.passageId ?? item.passage_id ?? item.partId ?? item.part;
      return n === qNum && mp !== undefined && mp !== null && !isNaN(Number(mp));
    });
    if (match) {
      const mp = match.passageId ?? match.passage_id ?? match.partId ?? match.part;
      return Number(mp);
    }
  }
  return Number(fallbackPassageId || 1);
};

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export function AnswerSheet({
  questions = [],
  answers = {},
  flagged = {},
  activePassageId,
  onAnswerChange: rawOnAnswerChange,
  onToggleFlag,
  onJumpToPassage,
  bookletHtml = '',
  passageContainerRef: externalPassageRef,
  passage = null,
  currentPassage = null,
  passages = [],
  exam = null,
  isTimeUp = false,
  timeRemaining = 0,
  ...props
}) {
  const onAnswerChange = (qNum, val) => {
    if (isTimeUp) return;
    if (rawOnAnswerChange) rawOnAnswerChange(qNum, val);
  };
  const [viewMode, setViewMode] = useState('sheet');
  const questionRefs = useRef({});
  const questionsContainerRef = useRef(null);
  const internalPassageRef = useRef(null);
  const passageContainerRef = externalPassageRef || internalPassageRef;
  const scrollTimerRef = useRef(null);

  // R4.7: Clear pending scroll timers on unmount to prevent memory leaks and unmounted DOM retention
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, []);

  // Auto-reset vertical scroll to top when changing reading passage tabs
  useEffect(() => {
    if (passageContainerRef.current) {
      passageContainerRef.current.scrollTop = 0;
    } else {
      const passageEls = document.querySelectorAll('.overflow-y-auto.select-text, [data-passage-container]');
      passageEls.forEach(el => { el.scrollTop = 0; });
    }
    if (questionsContainerRef.current) {
      questionsContainerRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activePassageId]);

  // Dynamic Cambridge IELTS passage question filtering strictly sorted by questionNumber
  let filteredQuestions = questions
    .filter(q => resolveReadingPassage(q, questions, activePassageId) === Number(activePassageId))
    .map(q => ({
      ...q,
      passageId: q.passageId ? Number(q.passageId) : resolveReadingPassage(q, questions, activePassageId),
    }))
    .sort((a, b) => Number(a.questionNumber || a.q_num || 0) - Number(b.questionNumber || b.q_num || 0));

  // Resolve passage reference box for active passage
  const activePassageRefBox = (() => {
    if (passage?.reference_box || passage?.referenceBox) return passage.reference_box || passage.referenceBox;
    if (currentPassage?.reference_box || currentPassage?.referenceBox) return currentPassage.reference_box || currentPassage.referenceBox;
    if (Array.isArray(passages) && passages.length > 0) {
      const found = passages.find(p => Number(p.id || p.passageId) === Number(activePassageId));
      if (found?.reference_box || found?.referenceBox) return found.reference_box || found.referenceBox;
    }
    const examParts = exam?.reading_parts?.[`part${activePassageId}`];
    if (examParts?.reference_box || examParts?.referenceBox) return examParts.reference_box || examParts.referenceBox;
    const examSections = exam?.reading?.sections?.find(s => Number(s.part || s.id) === Number(activePassageId));
    if (examSections?.reference_box || examSections?.referenceBox) return examSections.reference_box || examSections.referenceBox;
    const examPassages = exam?.reading_passages || exam?.reading?.passages;
    if (Array.isArray(examPassages) && examPassages.length > 0) {
      const found = examPassages.find(p => Number(p.id || p.passageId) === Number(activePassageId));
      if (found?.reference_box || found?.referenceBox) return found.reference_box || found.referenceBox;
    }
    // Фоллбек: ищем справочник внутри отфильтрованных вопросов пассажа
    const qWithRef = filteredQuestions.find(q =>
      (Array.isArray(q.reference_box) && q.reference_box.length > 0) ||
      (Array.isArray(q.referenceBox) && q.referenceBox.length > 0)
    );
    return qWithRef ? (qWithRef.reference_box || qWithRef.referenceBox) : null;
  })();

  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).filter(k => answers[k] && answers[k].trim()).length;

  const scrollToQuestion = (qNum, passageId) => {
    let targetPassage = passageId;
    if (!targetPassage) {
      const qObj = questions.find(q => Number(q.questionNumber || q.q_num) === Number(qNum));
      targetPassage = qObj ? resolveReadingPassage(qObj, questions, activePassageId) : (activePassageId || 1);
    }
    targetPassage = targetPassage || activePassageId || 1;
    if (targetPassage !== activePassageId && onJumpToPassage) {
      onJumpToPassage(targetPassage);
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
      scrollTimerRef.current = setTimeout(() => {
        const el = questionRefs.current[qNum];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        scrollTimerRef.current = null;
      }, 120);
    } else {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
      const el = questionRefs.current[qNum];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // ---------------------------------------------------------------------------
  // GROUP HEADER RENDERER
  // ---------------------------------------------------------------------------

  function renderGroupHeader(group) {
    const { category, instruction, questions: gqs } = group;
    const first = gqs[0];
    const last = gqs[gqs.length - 1];
    const firstQNum = group.startQ || first?.questionNumber || first?.q_num;
    const lastQNum = group.endQ || last?.questionNumber || last?.q_num;
    const rangeLabel =
      gqs.length > 1 || (firstQNum && lastQNum && firstQNum !== lastQNum)
        ? `Questions ${firstQNum}–${lastQNum}`
        : `Question ${firstQNum || ''}`;

    let defaultInstruction = instruction;
    if (!defaultInstruction) {
      if (category === 'YNNG') {
        defaultInstruction = `Do the following statements agree with the claims of the writer in Reading Passage ${activePassageId}?\nIn boxes ${firstQNum}–${lastQNum} on your answer sheet, choose YES, NO, or NOT GIVEN.`;
      } else if (category === 'TFNG') {
        const isYNNG = first?.type === 'YES_NO_NOT_GIVEN' || /yes[\s\/]+no/i.test(instruction || '') || /claims of the writer/i.test(instruction || '');
        defaultInstruction = isYNNG
          ? `Do the following statements agree with the claims of the writer in Reading Passage ${activePassageId}?\nIn boxes ${firstQNum}–${lastQNum} on your answer sheet, choose YES, NO, or NOT GIVEN.`
          : `Do the following statements agree with the information given in Reading Passage ${activePassageId}?\nIn boxes ${firstQNum}–${lastQNum} on your answer sheet, choose TRUE, FALSE, or NOT GIVEN.`;
      } else if (category === 'NOTES' || category === 'TABLE_COMPLETION' || category === 'FORM_COMPLETION') {
        defaultInstruction = 'Complete the notes below.\nChoose ONE WORD ONLY from the passage for each answer.';
      } else if (category === 'PARA_MATCH' || category === 'MATCHING_INFORMATION') {
        defaultInstruction = `Reading Passage ${activePassageId} has lettered paragraphs.\nWhich paragraph contains the following information?\nWrite the correct letter in boxes ${firstQNum}–${lastQNum} on your answer sheet.`;
      } else if (category === 'MATCHING_HEADINGS') {
        defaultInstruction = `Reading Passage ${activePassageId} has several paragraphs/sections.\nChoose the correct heading for each paragraph/section from the list of headings below.\nWrite the correct number, i–x, in boxes ${firstQNum}–${lastQNum} on your answer sheet.`;
      } else if (category === 'RESEARCHER_MATCH' || category === 'MATCHING_FEATURES' || category === 'MATCHING') {
        defaultInstruction = `Look at the following statements (Questions ${firstQNum}–${lastQNum}) and the list of options below.\nMatch each statement with the correct letter.`;
      } else if (category === 'SUMMARY_TEXT' || category === 'SUMMARY_COMPLETION') {
        defaultInstruction = 'Complete the summary below.\nChoose ONE WORD ONLY from the passage for each answer.';
      } else if (category === 'SUMMARY_WORDS' || category === 'SUMMARY_MATCHING') {
        defaultInstruction = `Complete the summary using the list of words below.\nWrite the correct letter in boxes ${firstQNum}–${lastQNum} on your answer sheet.`;
      } else if (category === 'MC' || category === 'MULTIPLE_CHOICE' || category === 'MULTIPLE_CHOICE_MULTI') {
        defaultInstruction = `Choose the correct letter, A, B, C or D.\nWrite the correct letter in boxes ${firstQNum}–${lastQNum} on your answer sheet.`;
      } else if (category === 'FLOW_CHART') {
        defaultInstruction = 'Complete the flow-chart below.\nWrite the correct letter or words in the spaces provided.';
      }
    }

    return (
      <div className="mb-4 pb-2 border-b border-slate-200">
        <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">
          {rangeLabel}
        </div>
        {defaultInstruction && (
          <p className="text-[13px] font-semibold text-slate-800 leading-snug mt-1 whitespace-pre-line">
            {defaultInstruction}
          </p>
        )}
        {(category === 'PARA_MATCH' || category === 'MATCHING_INFORMATION') && (
          <p className="text-[12px] text-slate-500 italic mt-1 font-medium">
            NB You may use any letter more than once.
          </p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 1. TRUE / FALSE / NOT GIVEN & YES / NO / NOT GIVEN
  // ---------------------------------------------------------------------------

  function renderTFNGGroup(gqs, category, renderedQuestionNumbers) {
    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }

    return (
      <div className="space-y-1">
        {remainingGqs.map(q => {
          const qNum = q.questionNumber;
          const val = answers[qNum] || '';
          const isFlagged = flagged[qNum] || false;
          const isYNNG = category === 'YNNG' || q.category === 'YNNG' || q.type === 'YES_NO_NOT_GIVEN' || /yes[\s\/]+no/i.test(q.instruction || '') || /claims of the writer/i.test(q.instruction || '');
          const opts = isYNNG ? ['YES', 'NO', 'NOT GIVEN'] : ['TRUE', 'FALSE', 'NOT GIVEN'];

          return (
            <div
              key={qNum}
              ref={el => (questionRefs.current[qNum] = el)}
              className={`flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${
                isFlagged ? 'bg-amber-50/50 px-2 rounded' : ''
              }`}
            >
              <span className="text-[13px] font-bold text-slate-400 shrink-0 w-6 text-right pt-0.5 select-none font-mono">
                {qNum}
              </span>
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <span className="text-[13.5px] text-slate-800 leading-relaxed font-normal">
                  {q.text || q.prompt}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 select-none">
                  {opts.map(opt => {
                    const isSelected = val?.trim().toUpperCase() === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => onAnswerChange(qNum, opt)}
                        className={`h-7 px-3 text-[11px] font-bold rounded transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-brand-600 text-white shadow-xs font-black'
                            : 'bg-white hover:bg-slate-50 border border-slate-300 text-slate-700'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => onToggleFlag(qNum)}
                    className={`p-1 rounded cursor-pointer transition ml-1 ${
                      isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                    }`}
                    title={isFlagged ? 'Remove flag' : 'Flag for review'}
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. STRUCTURED NOTES COMPLETION
  // ---------------------------------------------------------------------------

  function renderNotesGroup(gqs, group, renderedTemplateSignatures, renderedQuestionNumbers) {
    const mainTitle = group.title || gqs[0]?.title || 'Notes Completion';

    // Check for inline template (notes_template or summary_template with {{N}})
    const tplKey = (
      group.summaryTemplate ||
      group.notes_template ||
      gqs.find(q => q.summary_template || q.notes_template)?.summary_template ||
      gqs.find(q => q.notes_template)?.notes_template ||
      ''
    ).trim();

    const isFirstTime = Boolean(tplKey && (!renderedTemplateSignatures || !renderedTemplateSignatures.has(tplKey)));

    if (isFirstTime) {
      if (renderedTemplateSignatures) renderedTemplateSignatures.add(tplKey);
      const cleanTemplate = normalizeTemplateGaps(tplKey, gqs);
      if (renderedQuestionNumbers) {
        extractQuestionNumbersFromTemplate(cleanTemplate).forEach(num => renderedQuestionNumbers.add(num));
        gqs.filter(q => cleanTemplate.includes(`{{${q.questionNumber || q.q_num}}}`)).forEach(q => {
          renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num));
        });
      }
      const lines = cleanTemplate.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      return (
        <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
          <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-4">
            {mainTitle}
          </div>
          <div className="space-y-3 font-sans">
            {(() => {
              const blocks = [];
              let currentTableLines = [];

              for (const line of lines) {
                if (line.includes('|')) {
                  currentTableLines.push(line);
                } else {
                  if (currentTableLines.length > 0) {
                    blocks.push({ type: 'table', content: currentTableLines.join('\n') });
                    currentTableLines = [];
                  }
                  blocks.push({ type: 'line', content: line });
                }
              }
              if (currentTableLines.length > 0) {
                blocks.push({ type: 'table', content: currentTableLines.join('\n') });
              }

              return blocks.map((block, bIdx) => {
                if (block.type === 'table') {
                  return (
                    <MarkdownTable
                      key={`tbl-${bIdx}`}
                      tableContent={block.content}
                      answers={answers}
                      onAnswerChange={onAnswerChange}
                      onToggleFlag={onToggleFlag}
                      flagged={flagged}
                      questionRefs={questionRefs}
                      questions={gqs}
                    />
                  );
                }

                const line = block.content;
                const isHeading = /^(?:#{1,4}\s+|\*\*(?:[^*]+)\*\*|[A-Z\s]{4,}:?$)/.test(line) && !line.includes('{{');
                if (isHeading) {
                  const cleanH = line.replace(/^[#*\s]+|[#*\s]+$/g, '').replace(/:$/, '');
                  return (
                    <div key={bIdx} className="text-[13.5px] font-bold text-slate-900 border-b border-slate-300/70 pb-1 mt-4 mb-2">
                      {cleanH}
                    </div>
                  );
                }

                const isBullet = /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line);
                const textContent = line.replace(/^[-*•]\s+/, '');
                const tokens = textContent.split(/(\{\{\d+\}\})/g);

                const content = tokens.map((token, tIdx) => {
                  const m = token.match(/^\{\{(\d+)\}\}$/);
                  if (m) {
                    const qNum = Number(m[1]);
                    const val = answers[qNum] || '';
                    const isFlagged = flagged[qNum] || false;
                    return (
                      <span key={tIdx} className="inline-flex items-center align-baseline mx-1">
                        <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono">
                          {qNum}
                        </span>
                        <input
                          type="text"
                          ref={el => { if (el) questionRefs.current[qNum] = el; }}
                          value={val}
                          onChange={e => onAnswerChange(qNum, e.target.value)}
                          placeholder="answer..."
                          className="w-32 h-8 border-b-2 border-slate-400 bg-transparent text-center font-semibold text-sm outline-none focus:border-brand-500 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => onToggleFlag(qNum)}
                          className={`p-1 rounded cursor-pointer transition ml-0.5 ${
                            isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                          }`}
                          title={isFlagged ? 'Remove flag' : 'Flag'}
                        >
                          <Flag className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  }
                  return <span key={tIdx}>{cleanGapArtifacts(token)}</span>;
                });

                if (isBullet) {
                  return (
                    <li key={bIdx} className="text-[13.5px] text-slate-800 list-disc ml-4 leading-loose">
                      {content}
                    </li>
                  );
                }

                return (
                  <p key={bIdx} className="text-[13.5px] text-slate-800 leading-loose mb-2">
                    {content}
                  </p>
                );
              });
            })()}
          </div>
        </div>
      );
    }

    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }

    // Check if we have subheadings from parsed items
    const hasParsedSubheadings = remainingGqs.some(q => Boolean(q.subheading && String(q.subheading).trim()));
    const sections = [];

    if (remainingGqs.length > 0) {
      if (hasParsedSubheadings) {
        remainingGqs.forEach(q => {
          const sub = (q.subheading && String(q.subheading).trim()) || 'Notes';
          let sec = sections.find(s => s.subheading.toLowerCase() === sub.toLowerCase());
          if (!sec) {
            sec = { subheading: sub, questions: [] };
            sections.push(sec);
          }
          sec.questions.push(q);
        });
      } else {
        sections.push({ subheading: '', questions: remainingGqs });
      }
    }

    return (
      <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
        {/* Main Notes Title in bold uppercase */}
        <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-4">
          {mainTitle}
        </div>

        {remainingGqs.length > 0 ? (
          // Dynamic rendering grouped by parsed subheadings or natural sequence
          <div className="space-y-4">
            {sections.map((sec, sIdx) => (
              <div key={sIdx} className="space-y-2">
                {sec.subheading && (
                  <div className="text-[13px] font-bold text-slate-900 border-b border-slate-300/70 pb-1">
                    {sec.subheading}
                  </div>
                )}
                <ul className="space-y-2 pl-2">
                  {sec.questions.map((q, qIdx) => {
                    const qNum = q.questionNumber || q.q_num;
                    const isQuestion = Boolean(
                      qNum &&
                      (typeof qNum === 'number' || !isNaN(Number(qNum))) &&
                      String(q.type || '').toLowerCase() !== 'context'
                    );
                    const val = isQuestion ? (answers[qNum] || '') : '';
                    const isFlagged = isQuestion ? (flagged[qNum] || false) : false;
                    const bullets = q.context_bullets || q.bullets || [];

                    return (
                      <React.Fragment key={q.id || qNum || qIdx}>
                        {Array.isArray(bullets) && bullets.map((cb, cIdx) => {
                          const bulletText = typeof cb === 'object' ? (cb.text || cb.prompt || '') : cb;
                          return (
                            <li key={cIdx} className="text-[13px] text-slate-600 list-disc ml-4 leading-relaxed">
                              {cleanGapArtifacts(bulletText)}
                            </li>
                          );
                        })}
                        {!isQuestion ? (
                          // Plain text informative context line without question input
                          <li className="text-[13px] text-slate-700 list-disc ml-4 leading-relaxed">
                            {cleanGapArtifacts(q.text || q.prompt || '')}
                          </li>
                        ) : (
                          <li
                            ref={el => (questionRefs.current[qNum] = el)}
                            className="text-[13.5px] text-slate-800 list-disc ml-4 leading-loose"
                          >
                            {(() => {
                              const rawItemText = q.text || q.prompt || '';
                              if (rawItemText.includes('{{') || (/\[(?:\#|\@)?(?:q_num|blank|\d+)\]|\@\[q_num\]|\[\s*\]/i.test(rawItemText))) {
                                const normLine = normalizeTemplateGaps(rawItemText, [q]);
                                const tokens = normLine.split(/(\{\{\d+\}\})/g);
                                return (
                                  <span className="inline-flex items-baseline gap-1.5 flex-wrap leading-relaxed">
                                    {tokens.map((tok, tIdx) => {
                                      const m = tok.match(/^\{\{(\d+)\}\}$/);
                                      if (m) {
                                        const targetQNum = Number(m[1]) || qNum;
                                        const slotVal = answers[targetQNum] || '';
                                        return (
                                          <span key={tIdx} className="inline-flex items-baseline mx-1">
                                            <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono">
                                              {targetQNum}
                                            </span>
                                            <input
                                              type="text"
                                              ref={el => { if (el) questionRefs.current[targetQNum] = el; }}
                                              value={slotVal}
                                              onChange={e => onAnswerChange(targetQNum, e.target.value)}
                                              placeholder="answer..."
                                              className="w-32 h-8 border-b-2 border-slate-400 bg-transparent text-center font-semibold text-sm outline-none focus:border-brand-500 transition-colors"
                                            />
                                          </span>
                                        );
                                      }
                                      return <span key={tIdx}>{cleanGapArtifacts(tok)}</span>;
                                    })}
                                    <button
                                      type="button"
                                      onClick={() => onToggleFlag(qNum)}
                                      className={`p-1 rounded cursor-pointer transition ml-1 ${
                                        isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                      }`}
                                      title={isFlagged ? 'Remove flag' : 'Flag'}
                                    >
                                      <Flag className="w-3 h-3" />
                                    </button>
                                  </span>
                                );
                              }

                              const { before, after } = splitSentenceAtGap(rawItemText);
                              return (
                                <span className="inline items-baseline leading-loose">
                                  {before && <span>{before} </span>}
                                  <span className="inline-flex items-baseline mx-1 align-baseline">
                                    <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono">
                                      {qNum}
                                    </span>
                                    <input
                                      type="text"
                                      ref={el => { if (el) questionRefs.current[qNum] = el; }}
                                      value={val}
                                      onChange={e => onAnswerChange(qNum, e.target.value)}
                                      placeholder="answer..."
                                      className="w-32 h-8 border-b-2 border-slate-400 bg-transparent text-center font-semibold text-sm outline-none focus:border-brand-500 transition-colors inline-block"
                                    />
                                  </span>
                                  {after && <span> {after}</span>}
                                  <button
                                    type="button"
                                    onClick={() => onToggleFlag(qNum)}
                                    className={`p-1 rounded cursor-pointer transition ml-1 inline-flex align-middle ${
                                      isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                    }`}
                                    title={isFlagged ? 'Remove flag' : 'Flag'}
                                  >
                                    <Flag className="w-3 h-3" />
                                  </button>
                                </span>
                              );
                            })()}
                          </li>
                        )}
                      </React.Fragment>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-sm italic">
            Questions for this notes section will appear here once the exam is loaded.
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. MATCHING PARAGRAPHS (Q14–18)
  // ---------------------------------------------------------------------------

  function renderParaMatchGroup(gqs, renderedQuestionNumbers) {
    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }

    return (
      <div className="space-y-2">
        {remainingGqs.map(q => {
          const qNum = q.questionNumber;
          const val = (answers[qNum] || '').trim().toUpperCase();
          const isFlagged = flagged[qNum] || false;

          return (
            <div
              key={qNum}
              ref={el => (questionRefs.current[qNum] = el)}
              className={`flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${
                isFlagged ? 'bg-amber-50/50 px-2 rounded' : ''
              }`}
            >
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                <span className="text-[13px] font-bold text-slate-400 shrink-0 w-6 text-right pt-0.5 select-none font-mono">
                  {qNum}
                </span>
                <span className="text-[13.5px] text-slate-800 leading-relaxed font-normal">
                  {q.text || q.prompt}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  maxLength={1}
                  value={val}
                  onChange={e => onAnswerChange(qNum, e.target.value.toUpperCase())}
                  placeholder="A–H"
                  className={`w-12 h-10 border-2 text-center uppercase font-bold text-base rounded outline-none transition-colors ${
                    val
                      ? 'border-brand-500 bg-brand-50/50 text-brand-800'
                      : isFlagged
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-slate-300 focus:border-brand-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => onToggleFlag(qNum)}
                  className={`p-1 rounded cursor-pointer transition ${
                    isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                  }`}
                  title={isFlagged ? 'Remove flag' : 'Flag'}
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3.5. MATCHING HEADINGS (List of Headings with Roman numerals i, ii, iii...)
  // ---------------------------------------------------------------------------

  function renderMatchingHeadingsGroup(gqs, group, renderedQuestionNumbers) {
    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }

    let rawRef = group.refBox || group.referenceBox || activePassageRefBox;
    if (!rawRef || (Array.isArray(rawRef) && rawRef.length === 0)) {
      const qWithOptions = remainingGqs.find(q => Array.isArray(q.options) && q.options.length >= 2);
      if (qWithOptions) rawRef = qWithOptions.options;
    }

    const headings = (Array.isArray(rawRef) ? rawRef : []).map((item, idx) => {
      if (typeof item === 'object' && item !== null) {
        let k = String(item.key || item.letter || item.code || '').trim().toLowerCase();
        let l = String(item.label || item.text || item.value || '').trim();
        const pref = extractKeyPrefix(l);
        if (pref) {
          if (!k) k = pref.key.toLowerCase();
          if (k === pref.key.toLowerCase()) l = pref.label;
        }
        return { key: k || String(idx + 1), label: l };
      }
      if (typeof item === 'string') {
        const pref = extractKeyPrefix(item.trim());
        if (pref) {
          return { key: pref.key.toLowerCase(), label: pref.label };
        }
        const m = item.match(/^\s*([ivxlcdm]+)[\.\:\)\s\-]+(.*)$/i);
        if (m) {
          return { key: m[1].toLowerCase(), label: m[2].trim() };
        }
        return { key: String(idx + 1), label: item.trim() };
      }
      return { key: String(idx + 1), label: String(item || '') };
    });

    return (
      <div className="space-y-4">
        {/* List of Headings Frame */}
        <div className="border-2 border-slate-300 bg-slate-50 p-4 rounded-xl space-y-2.5">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>List of Headings</span>
          </div>
          <div className="grid grid-cols-1 gap-y-1.5 pt-1">
            {headings.map(h => (
              <div key={h.key} className="flex items-baseline gap-2.5 text-[13px] text-slate-800">
                <span className="font-mono font-bold text-slate-900 w-7 shrink-0 text-right">{h.key}</span>
                <span className="font-medium text-slate-700">{h.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Questions with MatchingHeadingsSelect */}
        <div className="space-y-2 pt-1">
          {remainingGqs.map(q => {
            const qNum = q.questionNumber;
            const currentAnswer = answers[qNum] || '';
            const isFlagged = flagged[qNum] || false;

            return (
              <div
                key={qNum}
                ref={el => (questionRefs.current[qNum] = el)}
                className={`flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${
                  isFlagged ? 'bg-amber-50/50 px-2 rounded' : ''
                }`}
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span className="text-[13px] font-bold text-slate-400 shrink-0 w-6 text-right pt-0.5 select-none font-mono">
                    {qNum}
                  </span>
                  <span className="text-[13.5px] text-slate-800 leading-relaxed font-normal">
                    {q.text || q.prompt}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <MatchingHeadingsSelect
                    q={q}
                    category="MATCHING_HEADINGS"
                    currentAnswer={currentAnswer}
                    onAnswerChange={onAnswerChange}
                    optionsList={headings}
                    placeholder="Choose Heading..."
                  />
                  <button
                    type="button"
                    onClick={() => onToggleFlag(qNum)}
                    className={`p-1 rounded cursor-pointer transition ${
                      isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                    }`}
                    title={isFlagged ? 'Remove flag' : 'Flag'}
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 4. MATCHING RESEARCHERS / NAMES
  // ---------------------------------------------------------------------------

  function renderResearcherMatchGroup(gqs, group, renderedQuestionNumbers) {
    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }

    // 1. Resolve reference box from group, questions, options, or instructions
    let researchers = [];

    let rawRef =
      group.refBox ||
      group.referenceBox ||
      activePassageRefBox ||
      remainingGqs.find(q => (Array.isArray(q.reference_box) && q.reference_box.length > 0) || (Array.isArray(q.referenceBox) && q.referenceBox.length > 0))?.reference_box ||
      remainingGqs.find(q => (Array.isArray(q.reference_box) && q.reference_box.length > 0) || (Array.isArray(q.referenceBox) && q.referenceBox.length > 0))?.referenceBox ||
      null;

    if (Array.isArray(rawRef) && rawRef.length > 0) {
      researchers = rawRef.map((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          let k = (item.key || item.letter || item.code || String.fromCharCode(65 + idx)).trim().toUpperCase();
          let l = (item.label || item.text || item.value || item.name || item.word || '').trim();
          const m = l.match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
          if (m) {
            if (!k) k = m[1].toUpperCase();
            if (m[1].toUpperCase() === k) l = m[2].trim();
          }
          const isPlaceholder = !l || l.toLowerCase() === k.toLowerCase() || l.toLowerCase() === `option ${k.toLowerCase()}`;
          return { key: k, label: isPlaceholder ? '' : l };
        }
        if (typeof item === 'string') {
          const m = item.match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
          if (m) return { key: m[1].toUpperCase(), label: m[2].trim() };
          const cleaned = item.trim();
          if (/^[A-Z]$/i.test(cleaned)) return { key: cleaned.toUpperCase(), label: '' };
          return { key: String.fromCharCode(65 + idx), label: cleaned };
        }
        return { key: String.fromCharCode(65 + idx), label: String(item || '').trim() };
      });
    }

    // If researchers have no descriptive labels or is empty, try activePassageRefBox
    if ((researchers.length === 0 || !researchers.some(r => r.label && r.label.trim().length > 0)) && Array.isArray(activePassageRefBox) && activePassageRefBox.length > 0) {
      const activeNormalized = activePassageRefBox.map((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          let k = (item.key || item.letter || item.code || String.fromCharCode(65 + idx)).trim().toUpperCase();
          let l = (item.label || item.text || item.value || item.name || item.word || '').trim();
          const m = l.match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
          if (m) {
            if (!k) k = m[1].toUpperCase();
            if (m[1].toUpperCase() === k) l = m[2].trim();
          }
          const isPlaceholder = !l || l.toLowerCase() === k.toLowerCase() || l.toLowerCase() === `option ${k.toLowerCase()}`;
          return { key: k, label: isPlaceholder ? '' : l };
        }
        if (typeof item === 'string') {
          const m = item.match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
          if (m) return { key: m[1].toUpperCase(), label: m[2].trim() };
          const cleaned = item.trim();
          if (/^[A-Z]$/i.test(cleaned)) return { key: cleaned.toUpperCase(), label: '' };
          return { key: String.fromCharCode(65 + idx), label: cleaned };
        }
        return { key: String.fromCharCode(65 + idx), label: String(item || '').trim() };
      });
      if (activeNormalized.some(r => r.label && r.label.trim().length > 0) || activeNormalized.length > researchers.length) {
        researchers = activeNormalized;
      }
    }

    // 2. If refBox is empty or only has empty labels, check gqs[0]?.options or any question's options
    const qWithOptions = gqs.find(q => Array.isArray(q.options) && q.options.length > 0);
    if (researchers.length === 0 && qWithOptions && qWithOptions.options.length > 0) {
      researchers = qWithOptions.options.map((opt, idx) => {
        if (typeof opt === 'object' && opt !== null) {
          let k = (opt.key || opt.letter || String.fromCharCode(65 + idx)).trim().toUpperCase();
          let l = (opt.label || opt.text || opt.name || opt.value || '').trim();
          const m = l.match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
          if (m) {
            if (!k) k = m[1].toUpperCase();
            if (m[1].toUpperCase() === k) l = m[2].trim();
          }
          const isPlaceholder = !l || l.toLowerCase() === k.toLowerCase() || l.toLowerCase() === `option ${k.toLowerCase()}`;
          return { key: k, label: isPlaceholder ? '' : l };
        }
        if (typeof opt === 'string') {
          const m = opt.match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
          if (m) return { key: m[1].toUpperCase(), label: m[2].trim() };
          const cleaned = opt.trim();
          if (/^[A-Z]$/i.test(cleaned)) return { key: cleaned.toUpperCase(), label: '' };
          return { key: String.fromCharCode(65 + idx), label: cleaned };
        }
        return { key: String.fromCharCode(65 + idx), label: String(opt || '').trim() };
      });
    } else if (researchers.length > 0 && qWithOptions && qWithOptions.options.length > 0) {
      // If researchers exist but lack labels, try enriching labels from options
      qWithOptions.options.forEach((opt, idx) => {
        let k = '';
        let l = '';
        if (typeof opt === 'object' && opt !== null) {
          k = (opt.key || opt.letter || String.fromCharCode(65 + idx)).trim().toUpperCase();
          l = (opt.label || opt.text || opt.name || opt.value || '').trim();
        } else if (typeof opt === 'string') {
          const m = opt.match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
          if (m) {
            k = m[1].toUpperCase();
            l = m[2].trim();
          }
        }
        if (k && l) {
          const existing = researchers.find(r => r.key === k);
          if (existing && !existing.label) {
            existing.label = l;
          }
        }
      });
    }

    // 3. If still empty, derive fallback letter options from the question's instruction (e.g. A, B, C, D)
    if (researchers.length === 0) {
      const combinedInst = `${group.instruction || ''} ${gqs[0]?.instruction || ''} ${gqs[0]?.prompt || ''} ${gqs[0]?.text || ''}`;
      
      const rangeMatch = combinedInst.match(/\b([A-Z])\s*(?:[-–—]|to)\s*([A-Z])\b/i);
      if (rangeMatch) {
        const startCode = rangeMatch[1].toUpperCase().charCodeAt(0);
        const endCode = rangeMatch[2].toUpperCase().charCodeAt(0);
        if (endCode >= startCode && endCode - startCode <= 10) {
          for (let code = startCode; code <= endCode; code++) {
            researchers.push({ key: String.fromCharCode(code), label: '' });
          }
        }
      }

      if (researchers.length === 0) {
        const lettersMatch = combinedInst.match(/\b[A-Z]\b/g);
        if (lettersMatch && lettersMatch.length >= 2) {
          // Filter to single uppercase alphabetical characters excluding Roman numerals
          const filtered = lettersMatch
            .map(l => l.toUpperCase())
            .filter(l => !/^[IVXLCDM]$/i.test(l) || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(l));
          const unique = Array.from(new Set(filtered));
          unique.sort();
          if (unique.length >= 2) {
            researchers = unique.map(k => ({ key: k, label: '' }));
          }
        }
      }

      if (researchers.length === 0 && group.referenceBox?.length > 0) {
        researchers = group.referenceBox;
      }
    }

    const hasLabels = researchers.some(r => r.label && r.label.trim().length > 0);
    const placeholder = researchers.length > 0 
      ? `${researchers[0]?.key || 'A'}-${researchers[researchers.length - 1]?.key || 'H'}`
      : 'A-H';

    return (
      <div className="space-y-4">
        {/* List of Options / Researchers Reference Box */}
        {hasLabels ? (
          <div className="border border-slate-300 p-4 bg-slate-50/60 rounded">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600 mb-2.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>{group.subheading || 'List of Options'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              {researchers.map(item => (
                <div key={item.key} className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-mono font-bold text-slate-800 shrink-0">[{item.key}]</span>
                  <span className="text-slate-700 font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="border border-slate-200 p-3 bg-slate-50/60 rounded">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>{group.subheading || 'Available Options'}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {researchers.map(item => (
                <span
                  key={item.key}
                  className="inline-flex items-center px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 shadow-2xs"
                >
                  [{item.key}]
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Statements */}
        <div className="space-y-2">
          {remainingGqs.map(q => {
            const qNum = q.questionNumber;
            const val = (answers[qNum] || '').trim().toUpperCase();
            const isFlagged = flagged[qNum] || false;
            const currentAnswer = answers[q.questionNumber] || answers[qNum] || val || '';

            const optionsList = researchers;

            return (
              <div
                key={qNum}
                ref={el => (questionRefs.current[qNum] = el)}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0 transition-colors ${
                  isFlagged ? 'bg-amber-50/50 px-2 rounded' : ''
                }`}
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span className="text-[13px] font-bold text-slate-400 shrink-0 w-6 text-right pt-0.5 select-none font-mono">
                    {qNum}
                  </span>
                  <span className="text-[13.5px] text-slate-800 leading-relaxed font-normal">
                    {q.text || q.prompt}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0 pl-8 sm:pl-0">
                  <input
                    type="text"
                    maxLength={2}
                    value={val}
                    onChange={e => onAnswerChange(qNum, e.target.value.toUpperCase().trim())}
                    placeholder={placeholder}
                    className={`w-12 h-10 text-center font-mono font-bold text-sm uppercase rounded-xl border-2 outline-none transition-colors shrink-0 ${
                      val
                        ? 'border-brand-500 bg-brand-50/50 text-brand-900'
                        : isFlagged
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-300 focus:border-brand-500 bg-white'
                    }`}
                  />

                  <button
                    type="button"
                    onClick={() => onToggleFlag(qNum)}
                    className={`p-1 rounded cursor-pointer transition ${
                      isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                    }`}
                    title={isFlagged ? 'Remove flag' : 'Flag'}
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // HELPER: SANITIZE SUMMARY TEMPLATE
  // ---------------------------------------------------------------------------

  function sanitizeSummaryTemplate(templateStr, gqs = []) {
    if (!templateStr || typeof templateStr !== 'string') return '';
    let cleaned = templateStr.trim();
    if (!cleaned) return '';

    const qNums = (gqs || [])
      .map(q => Number(q.questionNumber || q.q_num))
      .filter(n => !isNaN(n) && n > 0);
    const minQ = qNums.length > 0 ? Math.min(...qNums) : 1;
    const maxQ = qNums.length > 0 ? Math.max(...qNums) : 999;

    // 1. Raw JSON opening: [{ or {"
    const jsonIdx = cleaned.search(/(?:\[\s*\{|\{\s*")/);
    if (jsonIdx !== -1) {
      cleaned = cleaned.slice(0, jsonIdx).trim();
    }

    // 2. Answer key / Answers:
    const ansKeyIdx = cleaned.search(/\b(?:ANSWER\s*KEY|Answers\s*:)/i);
    if (ansKeyIdx !== -1) {
      cleaned = cleaned.slice(0, ansKeyIdx).trim();
    }

    // 3. Band score
    const bandIdx = cleaned.search(/\bBand\s*scores?\b/i);
    if (bandIdx !== -1) {
      cleaned = cleaned.slice(0, bandIdx).trim();
    }

    // 4. Reading Passage / Part / Section tails:
    const passageIdx = cleaned.search(/\b(?:READING\s+PASSAGE\s+\d+|Passage\s+\d+)\b/i);
    if (passageIdx !== -1 && passageIdx > 30) {
      cleaned = cleaned.slice(0, passageIdx).trim();
    }

    // 5. Subsequent question blocks: "Questions \d+"
    const questionsRegex = /\bQuestions?\s+(\d+)(?:\s*[\-–—]\s*(\d+))?/gi;
    let match;
    while ((match = questionsRegex.exec(cleaned)) !== null) {
      const startNum = Number(match[1]);
      const endNum = match[2] ? Number(match[2]) : startNum;

      const isCurrentGroupHeader = match.index < 30 && ((startNum <= maxQ && endNum >= minQ) || (startNum === minQ));
      if (!isCurrentGroupHeader) {
        cleaned = cleaned.slice(0, match.index).trim();
        break;
      }
    }

    return cleaned;
  }

  // ---------------------------------------------------------------------------
  // HELPER: UNIFIED SUMMARY TEMPLATE RESOLUTION & DEDUPLICATION
  // ---------------------------------------------------------------------------

  function resolveSummaryTemplate(rawTemplate, gqs) {
    const sanitizedRaw = sanitizeSummaryTemplate(rawTemplate, gqs);
    if (sanitizedRaw) {
      return sanitizedRaw;
    }

    const prompts = gqs.map(q => sanitizeSummaryTemplate(q.text || q.prompt || '', gqs)).filter(Boolean);
    if (prompts.length === 0) return '';

    // Check if questions in the group share a long common text prompt (length > 80 chars)
    const hasLongPrompt = prompts.some(p => p.length > 80);
    const sharesCommonText = gqs.length > 1 && prompts.length > 1 && (() => {
      const first = prompts[0];
      if (first.length > 80) return true;
      const minLen = Math.min(first.length, prompts[1].length);
      return minLen >= 40 && first.slice(0, 30).toLowerCase() === prompts[1].slice(0, 30).toLowerCase();
    })();

    if (!hasLongPrompt && !sharesCommonText && gqs.length === 1 && prompts[0].length <= 80) {
      return '';
    }

    // Treat the longest/most complete prompt as the master template
    let masterText = prompts.reduce((best, curr) => {
      const bestGaps = (best.match(/(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\]|\))|\[\s*\]|\(\s*\)|_{2,}|\.{2,}/g) || []).length;
      const currGaps = (curr.match(/(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\]|\))|\[\s*\]|\(\s*\)|_{2,}|\.{2,}/g) || []).length;
      if (currGaps > bestGaps) return curr;
      if (currGaps === bestGaps && curr.length > best.length) return curr;
      return best;
    }, prompts[0]);

    if (!masterText) return '';

    // Extract all question numbers from the group in ascending order
    const qNums = gqs
      .map(q => Number(q.questionNumber || q.q_num))
      .filter(n => !isNaN(n) && n > 0);

    let templateWithGaps = masterText;

    // Replace explicit mentions of each question number with {{qNum}}
    qNums.forEach(qn => {
      // 1. [27], (27), {{27}}, @[27], [#27], [blank 27]
      const bracketRegex = new RegExp(`(?:\\{\\{|\\@?\\[|\\()\\s*(?:\\#|\\@)?(?:q_num|blank)?\\s*${qn}\\s*(?:\\}\\}|\\]|\\))`, 'gi');
      if (bracketRegex.test(templateWithGaps)) {
        templateWithGaps = templateWithGaps.replace(bracketRegex, `{{${qn}}}`);
        return;
      }
      // 2. ____ 27 ____ or .... 27 .... or _____ 27 or 27 _____
      const underlineRegex = new RegExp(`(?:_{2,}|\\.{2,})\\s*\\b${qn}\\b\\s*(?:_{2,}|\\.{2,})?`, 'gi');
      if (underlineRegex.test(templateWithGaps)) {
        templateWithGaps = templateWithGaps.replace(underlineRegex, `{{${qn}}}`);
        return;
      }
      // 3. 27. ____ or 27) _____ or 27: _____ or 27 [ ]
      const prefixRegex = new RegExp(`\\b${qn}\\b[\\.\\:\\)\\s\\-]+(?:_{2,}|\\.{2,}|\\[\\s*\\]|\\(\\s*\\))`, 'gi');
      if (prefixRegex.test(templateWithGaps)) {
        templateWithGaps = templateWithGaps.replace(prefixRegex, `{{${qn}}}`);
        return;
      }
      // 4. Standalone question number \b${qn}\b if isolated by non-word characters
      const standaloneRegex = new RegExp(`(?<![a-zA-Z0-9])\\b${qn}\\b(?![a-zA-Z0-9])`, 'g');
      if (standaloneRegex.test(templateWithGaps)) {
        templateWithGaps = templateWithGaps.replace(standaloneRegex, `{{${qn}}}`);
        return;
      }
    });

    // For any unassigned question numbers, replace remaining generic blanks (____, [ ], [q_num], etc.)
    const assignedNums = new Set(
      (templateWithGaps.match(/\{\{(\d+)\}\}/g) || []).map(m => Number(m.replace(/\D/g, '')))
    );
    const unassignedNums = qNums.filter(qn => !assignedNums.has(qn));
    let unassignIdx = 0;

    templateWithGaps = templateWithGaps.replace(
      /(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank)(?:\}\}|\]|\))|\[\s*\]|\(\s*\)|_{2,}|\.{3,}/gi,
      (match) => {
        if (unassignIdx < unassignedNums.length) {
          return `{{${unassignedNums[unassignIdx++]}}}`;
        }
        return match;
      }
    );

    return sanitizeSummaryTemplate(templateWithGaps, gqs);
  }

  // ---------------------------------------------------------------------------
  // HELPER: RENDER STRUCTURED NOTES FALLBACK
  // ---------------------------------------------------------------------------

  function renderStructuredNotes(gqs, group, renderedQuestionNumbers) {
    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }
    const summaryTitle = group.title || remainingGqs[0]?.title || group.subheading || '';

    return (
      <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
        {summaryTitle && (
          <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 tracking-wide border-b border-slate-200 pb-3 mb-4">
            {summaryTitle}
          </div>
        )}
        <div className="space-y-3">
          {remainingGqs.map((q, idx) => {
            const qNum = Number(q.questionNumber || q.q_num);
            const val = answers[qNum] || '';
            const isFlagged = flagged[qNum] || false;
            let rawText = (q.text || q.prompt || '').trim();

            if (qNum) {
              rawText = rawText.replace(new RegExp(`^\\s*(?:question\\s*)?\\b${qNum}\\b[\\.\\:\\)\\s\\-]+`, 'i'), '').trim();
            }

            const gapRegex = new RegExp(`(?:\\{\\{|\\@?\\[|\\()\\s*(?:\\#|\\@)?(?:q_num|blank)?\\s*${qNum}?\\s*(?:\\}\\}|\\]|\\))|\[\\s*\]|\\(\\s*\\)|_{2,}|\\.{3,}`, 'i');
            let beforeText = rawText;
            let afterText = '';

            const gapMatch = rawText.match(gapRegex);
            if (gapMatch && gapMatch.index !== undefined) {
              beforeText = rawText.slice(0, gapMatch.index).trim();
              afterText = rawText.slice(gapMatch.index + gapMatch[0].length).trim();
            } else {
              const punctMatch = rawText.match(/([\.!\?;,]+)$/);
              if (punctMatch) {
                beforeText = rawText.slice(0, -punctMatch[0].length).trim();
                afterText = punctMatch[0];
              }
            }

            return (
              <div
                key={q.id || qNum || idx}
                ref={el => { if (qNum && el) questionRefs.current[qNum] = el; }}
                className={`flex items-start gap-2.5 text-[14px] leading-relaxed text-slate-800 ${
                  isFlagged ? 'bg-amber-50/60 p-2 rounded' : 'py-1'
                }`}
              >
                <span className="text-slate-400 select-none mt-1 shrink-0">•</span>
                <div className="flex-1">
                  {beforeText && <span className="mr-1">{beforeText}</span>}
                  {qNum ? (
                    <span className="inline-flex items-center align-baseline mx-1">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold mr-1 select-none font-mono ${
                          val ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {qNum}
                      </span>
                      <input
                        type="text"
                        value={val}
                        onChange={e => onAnswerChange(qNum, e.target.value)}
                        placeholder="..."
                        className={`w-32 h-7 px-1.5 text-center font-semibold text-sm border-b-2 outline-none bg-amber-50/20 transition-colors ${
                          val
                            ? 'border-brand-500 text-brand-900 font-bold'
                            : isFlagged
                            ? 'border-amber-400'
                            : 'border-slate-400 focus:border-brand-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => onToggleFlag(qNum)}
                        className={`p-0.5 rounded cursor-pointer transition ml-0.5 ${
                          isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                        }`}
                        title={isFlagged ? 'Remove flag' : 'Flag'}
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null}
                  {afterText && <span className="ml-1">{afterText}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 5. SUMMARY COMPLETION WITH INLINE GAPS
  // ---------------------------------------------------------------------------

  function renderSummaryTextGroup(gqs, group, renderedTemplateSignatures, renderedQuestionNumbers) {
    if (!gqs || gqs.length === 0) return null;

    const summaryTitle = group.title || gqs[0]?.title || '';
    const qNums = gqs
      .map(q => Number(q.questionNumber || q.q_num))
      .filter(n => !isNaN(n) && n > 0);

    // -------------------------------------------------------------------------
    // 1. RESOLVE UNIFIED TEMPLATE OR ASSEMBLE FROM QUESTION SENTENCES
    // -------------------------------------------------------------------------
    let tplKey = (
      group.summaryTemplate ||
      group.notes_template ||
      gqs.find(q => q.summary_template)?.summary_template ||
      gqs.find(q => q.notes_template)?.notes_template ||
      ''
    ).trim();
    tplKey = sanitizeSummaryTemplate(tplKey, gqs);

    const isFirstTime = Boolean(tplKey && (!renderedTemplateSignatures || !renderedTemplateSignatures.has(tplKey)));
    if (isFirstTime && renderedTemplateSignatures) {
      renderedTemplateSignatures.add(tplKey);
    }

    const rawTemplate = isFirstTime ? tplKey : '';

    // Helper: clean redundant instruction prefixes that might have leaked into prompt text
    const cleanInstructionPrefix = (str) => {
      if (!str) return '';
      return str
        .replace(/^(?:questions?\s+\d+[\s–\-\d]*[\.\:\s]+)?(?:complete the summary[^\.\n]*[\.\n]+)?(?:choose\s+(?:no more than|one word|two words)[^\.\n]*[\.\n]+)?/i, '')
        .trim();
    };

    // Helper: convert a single question prompt into sentence with {{qNum}} placeholder
    const formatQuestionSentence = (q) => {
      const qn = Number(q.questionNumber || q.q_num);
      let text = cleanInstructionPrefix(q.text || q.prompt || '');
      if (!text) return `{{${qn}}}`;

      // Strip leading question number e.g. "20. ", "20) ", "Question 20: "
      text = text.replace(new RegExp(`^\\s*(?:question\\s*)?\\b${qn}\\b[\\.\\:\\)\\s\\-]+`, 'i'), '').trim();

      // Explicit bracket gap mentioning this qn: {{20}}, [20], (20), [blank 20], [#20], @[20]
      const explicitBracketRegex = new RegExp(`(?:\\{\\{|\\@?\\[|\\()\\s*(?:\\#|\\@)?(?:q_num|blank)?\\s*${qn}\\s*(?:\\}\\}|\\]|\\))`, 'gi');
      if (explicitBracketRegex.test(text)) {
        return text.replace(explicitBracketRegex, `{{${qn}}}`);
      }

      // Generic bracket gap: [blank], [q_num], [ ], ( )
      const genericBracketRegex = /(?:\{\{|\@?\[|\()\s*(?:\#|\@)?(?:q_num|blank)\s*(?:\}\}|\]|\))|\[\s*\]|\(\s*\)/gi;
      if (genericBracketRegex.test(text)) {
        return text.replace(genericBracketRegex, `{{${qn}}}`);
      }

      // Underscores or dots: _____ or ..... or _____ 20 _____
      const underlineGapRegex = new RegExp(`(?:_{2,}|\\.{3,})(?:\\s*\\b${qn}\\b)?(?:\\s*_{2,}|\\.{3,})?`, 'gi');
      if (underlineGapRegex.test(text)) {
        return text.replace(underlineGapRegex, `{{${qn}}}`);
      }

      // Standalone question number placeholder
      const standaloneNumRegex = new RegExp(`(?<![a-zA-Z0-9])\\b${qn}\\b(?![a-zA-Z0-9])`, 'g');
      if (standaloneNumRegex.test(text)) {
        return text.replace(standaloneNumRegex, `{{${qn}}}`);
      }

      // Fallback: if no gap indicator was found, insert {{qn}} before trailing punctuation if present
      const trailingPunctMatch = text.match(/([\.!\?;,]+)$/);
      if (trailingPunctMatch) {
        const base = text.slice(0, -trailingPunctMatch[0].length).trim();
        return `${base} {{${qn}}}${trailingPunctMatch[0]}`;
      }
      return `${text} {{${qn}}}`;
    };

    // Determine if rawTemplate contains multiple gap placeholders or question numbers
    let masterTemplate = '';
    if (rawTemplate) {
      const explicitMatches = qNums.filter(qn => {
        const rx = new RegExp(`(?:\\{\\{|\\@?\\[|\\()\\s*(?:\\#|\\@)?(?:q_num|blank)?\\s*${qn}\\s*(?:\\}\\}|\\]|\\))|\\b${qn}\\b`, 'i');
        return rx.test(rawTemplate);
      });
      const genericGaps = (rawTemplate.match(/_{2,}|\.{3,}|\[\s*\]|\(\s*\)|\[blank\]|\[q_num\]/gi) || []).length;

      if (explicitMatches.length >= 2 || genericGaps >= 2 || explicitMatches.length + genericGaps >= gqs.length) {
        masterTemplate = rawTemplate;
      }
    }

    // Check if any single prompt in gqs contains the full template (length > 100 with multiple gaps)
    if (!masterTemplate) {
      const longPromptWithGaps = gqs.find(q => {
        const p = q.text || q.prompt || '';
        if (p.length < 100) return false;
        const gaps = (p.match(/(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\]|\))|\[\s*\]|\(\s*\)|_{2,}|\.{3,}/g) || []).length;
        return gaps >= 2;
      });
      if (longPromptWithGaps) {
        masterTemplate = cleanInstructionPrefix(longPromptWithGaps.text || longPromptWithGaps.prompt || '');
      }
    }

    // If still no master template, assemble seamlessly from individual question sentences
    if (!masterTemplate) {
      masterTemplate = gqs.map(formatQuestionSentence).join(' ');
    }

    // -------------------------------------------------------------------------
    // 2. NORMALIZE TEMPLATE GAPS: ENSURE ALL QUESTIONS ARE IN THE TEMPLATE
    // -------------------------------------------------------------------------
    let normalized = masterTemplate;

    // First replace explicit mentions of question numbers with {{qn}}
    qNums.forEach(qn => {
      const bracketRegex = new RegExp(`(?:\\{\\{|\\@?\\[|\\()\\s*(?:\\#|\\@)?(?:q_num|blank)?\\s*${qn}\\s*(?:\\}\\}|\\]|\\))`, 'gi');
      if (bracketRegex.test(normalized)) {
        normalized = normalized.replace(bracketRegex, `{{${qn}}}`);
        return;
      }
      const underlineRegex = new RegExp(`(?:_{2,}|\\.{3,})\\s*\\b${qn}\\b\\s*(?:_{2,}|\\.{3,})?`, 'gi');
      if (underlineRegex.test(normalized)) {
        normalized = normalized.replace(underlineRegex, `{{${qn}}}`);
        return;
      }
      const prefixRegex = new RegExp(`\\b${qn}\\b[\\.\\:\\)\\s\\-]+(?:_{2,}|\\.{3,}|\\[\\s*\\]|\\(\\s*\\))`, 'gi');
      if (prefixRegex.test(normalized)) {
        normalized = normalized.replace(prefixRegex, `{{${qn}}}`);
        return;
      }
      const standaloneRegex = new RegExp(`(?<![a-zA-Z0-9])\\b${qn}\\b(?![a-zA-Z0-9])`, 'g');
      if (standaloneRegex.test(normalized)) {
        normalized = normalized.replace(standaloneRegex, `{{${qn}}}`);
      }
    });

    // Replace generic gap markers (____, [ ], [q_num], etc.) with remaining unassigned qNums
    let assigned = new Set((normalized.match(/\{\{(\d+)\}\}/g) || []).map(m => Number(m.replace(/\D/g, ''))));
    const unassigned = qNums.filter(qn => !assigned.has(qn));
    let unassignIdx = 0;

    normalized = normalized.replace(
      /(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank)(?:\}\}|\]|\))|\[\s*\]|\(\s*\)|_{2,}|\.{3,}/gi,
      (match) => {
        if (unassignIdx < unassigned.length) {
          return `{{${unassigned[unassignIdx++]}}}`;
        }
        return match;
      }
    );

    // Refresh assigned list
    assigned = new Set((normalized.match(/\{\{(\d+)\}\}/g) || []).map(m => Number(m.replace(/\D/g, ''))));

    // CRITICAL: Ensure NO questions or trailing sentences are cut off at the end!
    // If any question from gqs is still missing in the template, append its sentence narrative
    const stillMissing = gqs.filter(q => !assigned.has(Number(q.questionNumber || q.q_num)));
    if (stillMissing.length > 0) {
      const missingNarrative = stillMissing.map(formatQuestionSentence).join(' ');
      normalized = `${normalized.trim()} ${missingNarrative}`.trim();
    }

    // Clean extraneous underscores or brackets right next to {{qn}} without destroying sentence punctuation
    normalized = normalized
      .replace(/_{2,}\s*(\{\{\d+\}\})/g, '$1')
      .replace(/(\{\{\d+\}\})\s*_{2,}/g, '$1')
      .replace(/\[\s*\]|\(\s*\)/g, '');

    // If summaryTitle is repeated verbatim at the beginning of the normalized template, remove it
    if (summaryTitle && normalized.toLowerCase().startsWith(summaryTitle.toLowerCase())) {
      normalized = normalized.slice(summaryTitle.length).replace(/^[\s\:\-\–\#\*\=]+/, '');
    }

    normalized = sanitizeSummaryTemplate(normalized, gqs);

    // If after sanitization template lacks sufficient narrative context or doesn't cover most questions, fallback to structured notes
    const textWithoutGaps = normalized.replace(/\{\{\d+\}\}/g, '').replace(/[^a-zA-Z0-9]/g, '');
    const assignedGaps = (normalized.match(/\{\{(\d+)\}\}/g) || []).map(m => Number(m.replace(/\D/g, '')));
    const assignedSet = new Set(assignedGaps);
    const coversMostQuestions = gqs.length === 0 || (assignedSet.size >= Math.ceil(gqs.length / 2));

    if (textWithoutGaps.length < 30 || !coversMostQuestions) {
      return renderStructuredNotes(gqs, group, renderedQuestionNumbers);
    }

    // -------------------------------------------------------------------------
    // 3. RENDER SUMMARY BLOCK PRESERVING FULL NARRATIVE & NATURAL FLOW
    // -------------------------------------------------------------------------
    // Strip newlines directly adjacent to gap markers {{N}} and normalize spaces
    const cleanSummaryTemplate = normalized
      .replace(/\r?\n\s*(\{\{\d+\}\})/g, ' $1')
      .replace(/(\{\{\d+\}\})\s*\r?\n/g, '$1 ')
      .replace(/[ \t]+/g, ' ')
      .trim();

    if (renderedQuestionNumbers) {
      extractQuestionNumbersFromTemplate(cleanSummaryTemplate).forEach(num => renderedQuestionNumbers.add(num));
    }

    // Split template into natural paragraphs by double newlines
    const paragraphs = cleanSummaryTemplate.split(/\n\s*\n+/);

    return (
      <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
        {summaryTitle && (
          <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 tracking-wide border-b border-slate-200 pb-3 mb-4">
            {summaryTitle}
          </div>
        )}
        <div className="space-y-4">
          {paragraphs.map((paraText, pIdx) => {
            const singleLinePara = paraText.replace(/\r?\n+/g, ' ').trim();
            const parts = singleLinePara.split(/(\{\{\d+\}\})/g);

            return (
              <p key={pIdx} className="text-[14.5px] leading-loose font-serif text-slate-800 mb-4 last:mb-0">
                {parts.map((part, idx) => {
                  const match = part.match(/^\{\{(\d+)\}\}$/);
                  if (match) {
                    const qNum = Number(match[1]);
                    const val = answers[qNum] || '';
                    const isFlagged = flagged[qNum] || false;

                    return (
                      <span
                        key={`gap-${qNum}-${pIdx}-${idx}`}
                        ref={el => (questionRefs.current[qNum] = el)}
                        className="inline-flex items-center align-baseline mx-1"
                      >
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold mr-1 select-none font-mono shrink-0 ${
                            val ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {qNum}
                        </span>
                        <input
                          type="text"
                          value={val}
                          onChange={e => onAnswerChange(qNum, e.target.value)}
                          placeholder="..."
                          className={`w-28 sm:w-32 h-7 px-1.5 text-center font-semibold text-sm border-b-2 outline-none bg-amber-50/20 transition-colors inline-block ${
                            val
                              ? 'border-brand-500 text-brand-900 font-bold'
                              : isFlagged
                              ? 'border-amber-400'
                              : 'border-slate-400 focus:border-brand-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => onToggleFlag(qNum)}
                          className={`p-0.5 rounded cursor-pointer transition ml-0.5 ${
                            isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                          }`}
                          title={isFlagged ? 'Remove flag' : 'Flag'}
                        >
                          <Flag className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  }

                  const cleanText = part.replace(/_{2,}/g, '');
                  return (
                    <span key={`text-${pIdx}-${idx}`}>
                      {cleanText}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 6. SUMMARY COMPLETION WITH LIST OF WORDS
  // ---------------------------------------------------------------------------

  function renderSummaryWordsGroup(gqs, group, renderedTemplateSignatures, renderedQuestionNumbers) {
    const summaryTitle = group.title || gqs[0]?.title || 'Summary';
    const refBox = group.referenceBox || group.refBox || gqs[0]?.reference_box || [];
    const tplKey = (
      group.summaryTemplate ||
      group.notes_template ||
      gqs.find(q => q.summary_template)?.summary_template ||
      ''
    ).trim();

    const isFirstTime = Boolean(tplKey && (!renderedTemplateSignatures || !renderedTemplateSignatures.has(tplKey)));
    if (isFirstTime && renderedTemplateSignatures) {
      renderedTemplateSignatures.add(tplKey);
    }

    const rawTemplate = isFirstTime ? tplKey : '';
    const effectiveTemplate = resolveSummaryTemplate(rawTemplate, gqs);

    if (!effectiveTemplate) {
      const remainingGqs = renderedQuestionNumbers
        ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
        : gqs;
      if (remainingGqs.length === 0) return null;
      if (renderedQuestionNumbers) {
        remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
      }

      return (
        <div className="space-y-4">
          {refBox.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600 px-0.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>List of Words</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 p-4 bg-slate-50 border border-slate-300 rounded-xl">
                {refBox.map(item => (
                  <div key={item.key} className="min-w-0 flex items-center space-x-2 text-sm">
                    <span className="font-mono font-bold text-slate-800 shrink-0">[{item.key}]</span>
                    <span className="text-slate-700 font-medium whitespace-normal break-words leading-tight">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
            {summaryTitle && (
              <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 tracking-wide border-b border-slate-200 pb-3 mb-4">
                {summaryTitle}
              </div>
            )}
            <div className="space-y-3">
              {remainingGqs.map(q => {
                const qNum = q.questionNumber || q.q_num;
                const val = answers[qNum] || '';
                const isFlagged = flagged[qNum] || false;
                const promptText = q.text || q.prompt || `Question ${qNum}`;
                const { before, after } = splitSentenceAtGap(promptText);

                return (
                  <div
                    key={qNum}
                    ref={el => (questionRefs.current[qNum] = el)}
                    className="inline-flex items-baseline gap-1.5 text-sm text-slate-800 flex-wrap py-1 leading-relaxed"
                  >
                    <span className="font-mono font-bold text-slate-900">{qNum}.</span>
                    {before && <span>{before}</span>}
                    <input
                      type="text"
                      maxLength={2}
                      value={val}
                      onChange={e => onAnswerChange(qNum, e.target.value.toUpperCase())}
                      placeholder="Letter"
                      className={`w-24 sm:w-28 h-8 px-3 text-center font-bold uppercase text-sm border-2 rounded outline-none transition-colors ${
                        val ? 'border-brand-500 bg-brand-50/50 text-brand-800' : isFlagged ? 'border-amber-400 bg-amber-50' : 'border-slate-300 focus:border-brand-500'
                      }`}
                    />
                    {after && <span>{after}</span>}
                    <button
                      type="button"
                      onClick={() => onToggleFlag(qNum)}
                      className={`p-1 rounded cursor-pointer transition ml-1 ${
                        isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                      }`}
                      title={isFlagged ? 'Remove flag' : 'Flag'}
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    const template = normalizeTemplateGaps(effectiveTemplate, gqs);
    if (renderedQuestionNumbers) {
      extractQuestionNumbersFromTemplate(template).forEach(num => renderedQuestionNumbers.add(num));
    }
    const cleanWordsTemplate = template
      .replace(/\r?\n\s*(\{\{\d+\}\})/g, ' $1')
      .replace(/(\{\{\d+\}\})\s*\r?\n/g, '$1 ')
      .replace(/[ \t]+/g, ' ')
      .trim();

    const wordParagraphs = cleanWordsTemplate.split(/\n\s*\n+/);

    return (
      <div className="space-y-4">
        {/* Reference Box (List of Words / Phrases) with CSS Grid */}
        {refBox.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600 px-0.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>List of Words</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 p-4 bg-slate-50 border border-slate-300 rounded-xl">
              {refBox.map(item => (
                <div key={item.key} className="min-w-0 flex items-center space-x-2 text-sm">
                  <span className="font-mono font-bold text-slate-800 shrink-0">[{item.key}]</span>
                  <span className="text-slate-700 font-medium whitespace-normal break-words leading-tight">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Narrative Summary with inline single-letter inputs */}
        <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6">
          {summaryTitle && (
            <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 tracking-wide border-b border-slate-200 pb-3 mb-4">
              {summaryTitle}
            </div>
          )}
          <div className="space-y-4">
            {wordParagraphs.map((paraText, pIdx) => {
              const singleLinePara = paraText.replace(/\r?\n+/g, ' ').trim();
              const parts = singleLinePara.split(/(\{\{\d+\}\})/g);

              return (
                <p key={pIdx} className="text-[14.5px] leading-loose font-serif text-slate-800 mb-4 last:mb-0">
                  {parts.map((part, idx) => {
                    const match = part.match(/^\{\{(\d+)\}\}$/);
                    if (match) {
                      const qNum = Number(match[1]);
                      const val = answers[qNum] || '';
                      const isFlagged = flagged[qNum] || false;

                      return (
                        <span
                          key={`gap-${qNum}-${pIdx}-${idx}`}
                          ref={el => (questionRefs.current[qNum] = el)}
                          className="inline-flex items-center align-baseline mx-1"
                        >
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold mr-1 select-none font-mono shrink-0 ${
                              val ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {qNum}
                          </span>
                          <input
                            type="text"
                            maxLength={1}
                            value={val}
                            onChange={e => onAnswerChange(qNum, e.target.value.toUpperCase())}
                            placeholder="A–J"
                            className={`w-10 h-7 text-center font-bold uppercase text-sm border-b-2 outline-none bg-amber-50/20 transition-colors inline-block ${
                              val
                                ? 'border-brand-500 text-brand-900 font-bold'
                                : isFlagged
                                ? 'border-amber-400'
                                : 'border-slate-400 focus:border-brand-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => onToggleFlag(qNum)}
                            className={`p-0.5 rounded cursor-pointer transition ml-0.5 ${
                              isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                            }`}
                            title={isFlagged ? 'Remove flag' : 'Flag'}
                          >
                            <Flag className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    }
                    return (
                      <span key={`text-${pIdx}-${idx}`}>
                        {part
                          .replace(/(?:_{2,}|\.{2,})/g, '')
                          .replace(/\[\s*\]|\(\s*\)/g, '')
                          .replace(/(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?/gi, '')}
                      </span>
                    );
                  })}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 7. MULTIPLE CHOICE (Q32–35)
  // ---------------------------------------------------------------------------

  function renderMCGroup(gqs, group, renderedQuestionNumbers) {
    const groupInstruction = group?.instruction || '';

    // Generic dual-select detection:
    const isDualQuestion = (q, idx, arr) => {
      const opts = Array.isArray(q?.options) ? q.options : [];

      // 1. IELTS Standard Guard: Dual-select questions in Cambridge IELTS
      // ALWAYS provide at least 5 options (A, B, C, D, E).
      // If a question has fewer than 4 options (e.g. standard 3 options A, B, C),
      // it CANNOT under any circumstances be a dual selection.
      if (opts.length > 0 && opts.length < 4) {
        return false;
      }

      // 2. Check for explicit two-choice phrases with strict word boundaries
      const dualRegexes = [
        /\b(?:choose|select)\s+(?:any\s+)?(?:two|2)\b/i,
        /\bwhich\s+(?:two|2)\b/i,
        /\b(?:two|2)\s+(?:options|letters|reasons|statements|answers)\b/i,
      ];

      const text = `${q.instruction || ''} ${q.cleanPrompt || ''} ${q.prompt || ''} ${q.text || ''} ${groupInstruction}`.toLowerCase();
      const hasDualPhrase = dualRegexes.some(rx => rx.test(text));

      if (hasDualPhrase && (opts.length >= 4 || opts.length === 0)) {
        return true;
      }

      // 3. Neighbor pairing logic: check for identical prompt on adjacent questions with >= 4 options
      const prev = arr[idx - 1];
      const next = arr[idx + 1];
      const sameAsPrev = prev && (prev.prompt === q.prompt || prev.text === q.text) && (Array.isArray(q.options) && q.options.length >= 4);
      const sameAsNext = next && (next.prompt === q.prompt || next.text === q.text) && (Array.isArray(q.options) && q.options.length >= 4);
      return Boolean(sameAsPrev || sameAsNext);
    };

    // Deduplicate by questionNumber to ensure each question appears strictly once
    const seenInGroup = new Set();
    const uniqueGqs = gqs.filter(q => {
      const num = Number(q.questionNumber || q.q_num);
      if (!num || seenInGroup.has(num) || (renderedQuestionNumbers && renderedQuestionNumbers.has(num))) return false;
      seenInGroup.add(num);
      return true;
    });

    if (uniqueGqs.length === 0) return null;

    const dualQuestions = [];
    const singleQuestions = [];

    uniqueGqs.forEach((q, idx) => {
      if (isDualQuestion(q, idx, uniqueGqs)) {
        dualQuestions.push(q);
      } else {
        singleQuestions.push(q);
      }
    });

    // Group dual-select questions into pairs of 2 dynamically without hardcoded indices
    const dualPairs = [];
    const sortedDual = [...dualQuestions].sort(
      (a, b) => Number(a.questionNumber || a.q_num || 0) - Number(b.questionNumber || b.q_num || 0)
    );
    for (let i = 0; i < sortedDual.length; i += 2) {
      dualPairs.push([sortedDual[i], sortedDual[i + 1] || null]);
    }

    // Strictly eliminate any duplicate single-choice MCQ renderings beneath them
    const dualNumSet = new Set();
    dualPairs.forEach(([qA, qB]) => {
      if (qA?.questionNumber) dualNumSet.add(Number(qA.questionNumber));
      if (qB?.questionNumber) dualNumSet.add(Number(qB.questionNumber));
    });
    const filteredSingleQuestions = singleQuestions.filter(
      q => !dualNumSet.has(Number(q.questionNumber || q.q_num))
    );

    const renderDualCard = ([qA, qB], pIdx) => {
      if (!qA) return null;
      const qNumA = Number(qA.questionNumber || qA.q_num);
      const qNumB = qB ? Number(qB.questionNumber || qB.q_num) : qNumA + 1;
      const pairRange = qB ? `Questions ${qNumA} and ${qNumB}` : `Question ${qNumA}`;
      const rawPrompt = qA.cleanPrompt || qA.prompt || qA.text || qB?.cleanPrompt || '';
      const cleanPrompt = rawPrompt.replace(/^(?:Questions?\s*)?(?:\d+\s*[-–&and\s]*\d+|\d+)[\.\:\s\-]+/i, '').trim();
      const groupRefOpts = Array.isArray(group.referenceBox) && group.referenceBox.length >= 2
        ? group.referenceBox
        : (Array.isArray(group.refBox) && group.refBox.length >= 2 ? group.refBox : []);

      const rawOptions = (qA.options && qA.options.length >= 2) 
        ? qA.options 
        : (qB?.options && qB.options.length >= 2) 
          ? qB.options 
          : groupRefOpts;
      
      const valA = (answers[qNumA] || '').trim().toUpperCase();
      const valB = (answers[qNumB] || '').trim().toUpperCase();

      const handleDualSelect = (letter) => {
        const L = letter.toUpperCase();
        if (valA === L) {
          onAnswerChange(qNumA, '');
        } else if (valB === L) {
          onAnswerChange(qNumB, '');
        } else if (!valA) {
          onAnswerChange(qNumA, L);
        } else if (!valB) {
          onAnswerChange(qNumB, L);
        } else {
          onAnswerChange(qNumB, L);
        }
      };

      const isFlaggedA = flagged[qNumA] || false;
      const isFlaggedB = flagged[qNumB] || false;

      return (
        <div key={`dual-${pIdx}-${qNumA}`} className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-brand-700 font-mono">
              {pairRange}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Select TWO options
            </span>
          </div>
          <p className="text-sm font-bold text-slate-800 leading-snug">
            {cleanPrompt}
          </p>
          {rawOptions.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 pt-1">
              {rawOptions.map((opt, oIdx) => {
                let letter = '';
                let optText = '';
                if (typeof opt === 'object' && opt !== null) {
                  letter = (opt.key || opt.letter || String.fromCharCode(65 + oIdx)).toUpperCase();
                  optText = (opt.text || opt.label || opt.value || '').trim();
                } else {
                  const match = String(opt).match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
                  letter = match ? match[1].toUpperCase() : String.fromCharCode(65 + oIdx);
                  optText = match ? match[2].trim() : String(opt).trim();
                }
                const isSelected = valA === letter || valB === letter;

                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => handleDualSelect(letter)}
                    className={`flex items-center gap-3 p-2.5 rounded text-left text-sm transition-colors border cursor-pointer ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/70 text-slate-900 font-semibold shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs shrink-0 font-mono transition-colors ${
                      isSelected
                        ? 'bg-brand-500 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 border border-slate-300'
                    }`}>
                      {letter}
                    </span>
                    <span className="flex-1 leading-snug">{optText}</span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-brand-600 ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-3 bg-amber-50/60 border border-amber-200 rounded text-xs text-amber-800 italic">
              Please refer to the reading passage for the available options.
            </div>
          )}

          {/* Dual Answer Slots */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-200 text-xs">
            <span className="font-bold text-slate-600 uppercase tracking-wider font-mono">
              Your Answers:
            </span>
            <div ref={el => (questionRefs.current[qNumA] = el)} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center font-mono select-none">
                {qNumA}
              </span>
              <input
                type="text"
                maxLength={1}
                value={valA}
                onChange={e => onAnswerChange(qNumA, e.target.value.toUpperCase())}
                placeholder="Letter"
                className={`w-24 sm:w-28 h-9 px-3 border-2 text-center font-bold uppercase text-sm rounded outline-none transition-colors ${
                  valA ? 'border-brand-500 bg-brand-50/50 text-slate-900' : isFlaggedA ? 'border-amber-400 bg-amber-50' : 'border-slate-300 focus:border-brand-500'
                }`}
              />
              <button
                type="button"
                onClick={() => onToggleFlag(qNumA)}
                className={`p-1 rounded cursor-pointer transition ${isFlaggedA ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                title={isFlaggedA ? `Remove flag ${qNumA}` : `Flag ${qNumA}`}
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            </div>
            {qB && (
              <div ref={el => (questionRefs.current[qNumB] = el)} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center font-mono select-none">
                  {qNumB}
                </span>
                <input
                  type="text"
                  maxLength={1}
                  value={valB}
                  onChange={e => onAnswerChange(qNumB, e.target.value.toUpperCase())}
                  placeholder="Letter"
                  className={`w-24 sm:w-28 h-9 px-3 border-2 text-center font-bold uppercase text-sm rounded outline-none transition-colors ${
                    valB ? 'border-brand-500 bg-brand-50/50 text-slate-900' : isFlaggedB ? 'border-amber-400 bg-amber-50' : 'border-slate-300 focus:border-brand-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => onToggleFlag(qNumB)}
                  className={`p-1 rounded cursor-pointer transition ${isFlaggedB ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                  title={isFlaggedB ? `Remove flag ${qNumB}` : `Flag ${qNumB}`}
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      );
    };

    if (dualPairs.length === 0 && filteredSingleQuestions.length === 0) return null;

    if (renderedQuestionNumbers) {
      dualPairs.forEach(([qA, qB]) => {
        if (qA?.questionNumber) renderedQuestionNumbers.add(Number(qA.questionNumber));
        if (qB?.questionNumber) renderedQuestionNumbers.add(Number(qB.questionNumber));
      });
      filteredSingleQuestions.forEach(q => {
        renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num));
      });
    }

    return (
      <div className="space-y-6">
        {dualPairs.map(([qA, qB], pIdx) => renderDualCard([qA, qB], pIdx))}
        {filteredSingleQuestions.map(q => {
          const qNum = q.questionNumber;
          const val = answers[qNum] || '';
          const isFlagged = flagged[qNum] || false;
          const promptText = q.text || q.prompt;

          // Check if question is paragraph matching or letter-selection with > 4 options
          const isParagraphOrLetterMatch =
            Array.isArray(q.options) &&
            q.options.length > 4 &&
            (q.options.every(o => typeof o === 'string' && o.trim().length <= 15) ||
              /which paragraph|which section|paragraph contains/i.test(`${promptText || ''} ${q.instruction || ''}`));

          if (isParagraphOrLetterMatch) {
            const maxLetter = String.fromCharCode(64 + q.options.length);
            const placeholder = `A–${maxLetter}`;
            return (
              <div
                key={qNum}
                ref={el => (questionRefs.current[qNum] = el)}
                className={`flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${
                  isFlagged ? 'bg-amber-50/50 px-2 rounded' : ''
                }`}
              >
                <div className="flex items-start gap-2.5 flex-1">
                  <span className="text-[13px] font-bold text-slate-400 shrink-0 w-6 text-right pt-0.5 select-none font-mono">
                    {qNum}
                  </span>
                  <span className="text-[13.5px] text-slate-800 leading-relaxed font-normal">
                    {promptText}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    maxLength={1}
                    value={val}
                    onChange={e => onAnswerChange(qNum, e.target.value.toUpperCase())}
                    placeholder={placeholder}
                    className={`w-12 h-10 border-2 text-center uppercase font-bold text-base rounded outline-none transition-colors ${
                      val
                        ? 'border-brand-500 bg-brand-50/50 text-brand-800'
                        : isFlagged
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-300 focus:border-brand-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => onToggleFlag(qNum)}
                    className={`p-1 rounded cursor-pointer transition ${
                      isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                    }`}
                    title={isFlagged ? 'Remove flag' : 'Flag'}
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          }

          const rawPrompt = q.text || q.prompt || `Question ${qNum}`;

          // Clean prompt from trailing options if they were included in question text
          let promptDisplay = rawPrompt;
          const firstOptIndex = promptDisplay.search(/(?:^|\n|\r)\s*\[?[A-D]\]?[\.\:\)\s\-]/i);
          if (firstOptIndex > 0) {
            promptDisplay = promptDisplay.slice(0, firstOptIndex).trim();
          }

          return (
            <div
              key={qNum}
              ref={el => (questionRefs.current[qNum] = el)}
              className={`space-y-2 py-1 ${isFlagged ? 'bg-amber-50/40 p-2 rounded' : ''}`}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-[13px] font-bold text-slate-400 shrink-0 w-6 text-right pt-0.5 select-none font-mono">
                  {qNum}
                </span>
                <div className="flex-1 flex items-start justify-between gap-2">
                  <p className="text-[13.5px] font-bold text-slate-900 leading-snug">
                    {promptDisplay}
                  </p>
                  <button
                    type="button"
                    onClick={() => onToggleFlag(qNum)}
                    className={`p-1 rounded cursor-pointer transition shrink-0 ${
                      isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                    }`}
                    title={isFlagged ? 'Remove flag' : 'Flag'}
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="pl-8 space-y-1.5">
                {q.options?.map((option, optIdx) => {
                  let letter = '';
                  let displayText = '';
                  if (typeof option === 'object' && option !== null) {
                    letter = (option.key || option.letter || String.fromCharCode(65 + optIdx)).toUpperCase();
                    displayText = (option.text || option.label || option.value || '').trim();
                  } else {
                    const match = String(option).match(/^\[?([A-Za-z0-9]+)\]?[\.\:\)\s\-]+(.*)$/);
                    letter = match ? match[1].toUpperCase() : String.fromCharCode(65 + optIdx);
                    displayText = match ? match[2].trim() : String(option).trim();
                  }

                  // If option string is only a single letter or displayText is empty/equal to letter,
                  // fallback to searching any description text in q.options_text or q.text or q.prompt
                  if (!displayText || displayText.toUpperCase() === letter) {
                    const searchSources = [q.options_text, q.optionsText, q.text, q.prompt, q.instruction].filter(Boolean);
                    for (const src of searchSources) {
                      const regex = new RegExp(`(?:^|\\n|\\r)\\s*\\[?${letter}\\]?[\\.\\:\\)\\s\\-]+([^\\n\\r]+)`, 'i');
                      const m = String(src).match(regex);
                      if (m && m[1].trim()) {
                        let candidate = m[1].trim();
                        // Truncate if subsequent option is on the same line
                        const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);
                        const nextRegex = new RegExp(`\\s+\\[?${nextLetter}\\]?[\\.\\:\\)\\s\\-]`, 'i');
                        const nIdx = candidate.search(nextRegex);
                        if (nIdx > 0) {
                          candidate = candidate.slice(0, nIdx).trim();
                        }
                        if (candidate && candidate.toUpperCase() !== letter) {
                          displayText = candidate;
                          break;
                        }
                      }
                    }
                  }

                  const isSelected = (val || '').trim().toUpperCase() === letter;

                  return (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => onAnswerChange(qNum, letter)}
                      className={`w-full flex items-start gap-2.5 px-2.5 py-1.5 rounded cursor-pointer text-left transition-colors text-[13px] border ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 text-brand-900 font-semibold'
                          : 'border-transparent hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${
                          isSelected
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-slate-300 text-slate-600 bg-white'
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="leading-snug pt-0.5 flex-1">{displayText}</span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-brand-600 ml-auto shrink-0 mt-1" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 8. GENERAL FILL_BLANK (FALLBACK)
  // ---------------------------------------------------------------------------

  function renderFillBlankGroup(gqs, renderedQuestionNumbers) {
    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }

    return (
      <div className="space-y-1">
        {remainingGqs.map(q => {
          const qNum = q.questionNumber;
          const val = answers[qNum] || '';
          const isFlagged = flagged[qNum] || false;
          const fullText = q.text || q.prompt || `Question ${qNum}`;
          const { before, after } = splitSentenceAtGap(fullText);

          return (
            <div
              key={qNum}
              ref={el => (questionRefs.current[qNum] = el)}
              className={`flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-0 ${
                isFlagged ? 'bg-amber-50/50 px-2 rounded' : ''
              }`}
            >
              <span className="text-[13px] font-bold text-slate-400 shrink-0 w-6 text-right pt-1 select-none font-mono">
                {qNum}
              </span>
              <div className="flex-1 text-[13.5px] leading-loose text-slate-800">
                <span className="inline items-baseline leading-loose">
                  {before && <span>{before} </span>}
                  <span className="inline-flex items-baseline mx-1 align-baseline">
                    <input
                      type="text"
                      value={val}
                      onChange={e => onAnswerChange(qNum, e.target.value)}
                      className={`h-7 px-2 min-w-[120px] max-w-[200px] border-b-2 text-sm font-semibold outline-none bg-transparent transition-colors align-baseline inline-block ${
                        val
                          ? 'border-brand-500 text-brand-900 font-bold'
                          : isFlagged
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-slate-400 focus:border-brand-500'
                      }`}
                      placeholder="..."
                    />
                  </span>
                  {after && <span> {after}</span>}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onToggleFlag(qNum)}
                className={`p-1 rounded cursor-pointer transition shrink-0 mt-1 ${
                  isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                }`}
                title={isFlagged ? 'Remove flag' : 'Flag'}
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 9. FLOW CHART COMPLETION
  // ---------------------------------------------------------------------------

  function renderFlowChartGroup(gqs, group, renderedQuestionNumbers) {
    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }

    const mainTitle = group.title || remainingGqs[0]?.title || 'Flow-chart Completion';
    return (
      <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
        <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-6">
          {mainTitle}
        </div>
        <div className="flex flex-col items-center space-y-3 max-w-xl mx-auto">
          {remainingGqs.map((q, idx) => {
            const isLast = idx === remainingGqs.length - 1;
            const qNum = q.questionNumber;
            const currentAnswer = answers[qNum] || '';
            const isFlagged = flagged[qNum] || false;
            const rawText = q.prompt || q.text || `Question ${qNum}`;
            const { before, after, hasGap } = splitSentenceAtGap(rawText);

            return (
              <React.Fragment key={qNum || idx}>
                <div
                  ref={el => { if (qNum) questionRefs.current[qNum] = el; }}
                  className={`w-full bg-white border-2 p-3 text-xs font-semibold text-slate-900 shadow-2xs transition-colors rounded-xl ${
                    currentAnswer ? 'border-brand-400 bg-orange-50/20' : 'border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 text-xs leading-loose">
                      <FlowChartGapItem
                        q={q}
                        currentAnswer={currentAnswer}
                        onAnswerChange={onAnswerChange}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleFlag(qNum)}
                      className={`p-1 rounded cursor-pointer transition shrink-0 ${
                        isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                      }`}
                      title={isFlagged ? 'Remove flag' : 'Flag'}
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {!isLast && (
                  <div className="text-slate-400 font-bold text-lg select-none py-0.5">
                    ↓
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 10. TABLE COMPLETION (MARKDOWN TABLE OR HTML ZEBRA TABLE)
  // ---------------------------------------------------------------------------

  function renderTableCompletionGroup(gqs, group, renderedTemplateSignatures, renderedQuestionNumbers) {
    const mainTitle = group.title || gqs[0]?.title || '';
    const tplKey = (
      group.table_template ||
      group.tableTemplate ||
      group.summaryTemplate ||
      group.notes_template ||
      gqs.find(q => q.table_template || q.tableTemplate || q.notes_template || q.summary_template)?.table_template ||
      gqs.find(q => q.tableTemplate)?.tableTemplate ||
      gqs.find(q => q.notes_template)?.notes_template ||
      gqs.find(q => q.summary_template)?.summary_template ||
      ''
    ).trim();

    const hasTableMarkdown = tplKey && tplKey.includes('|');
    const isFirstTime = Boolean(tplKey && (!renderedTemplateSignatures || !renderedTemplateSignatures.has(tplKey)));

    if (hasTableMarkdown && isFirstTime) {
      if (renderedTemplateSignatures) {
        renderedTemplateSignatures.add(tplKey);
      }
      const cleanTpl = normalizeTemplateGaps(tplKey, gqs);
      if (renderedQuestionNumbers) {
        extractQuestionNumbersFromTemplate(cleanTpl).forEach(num => renderedQuestionNumbers.add(num));
        gqs.filter(q => cleanTpl.includes(`{{${q.questionNumber || q.q_num}}}`)).forEach(q => {
          renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num));
        });
      }

      return (
        <div className="bg-white border-2 border-slate-300 rounded-lg p-5 sm:p-6 shadow-2xs space-y-4 mb-2">
          {mainTitle && (
            <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-2">
              {mainTitle}
            </div>
          )}
          <div className="overflow-x-auto">
            <MarkdownTable
              tableContent={cleanTpl}
              answers={answers}
              onAnswerChange={onAnswerChange}
              onToggleFlag={onToggleFlag}
              flagged={flagged}
              questionRefs={questionRefs}
              questions={gqs}
            />
          </div>
        </div>
      );
    }

    const remainingGqs = renderedQuestionNumbers
      ? gqs.filter(q => !renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)))
      : gqs;
    if (remainingGqs.length === 0) return null;
    if (renderedQuestionNumbers) {
      remainingGqs.forEach(q => renderedQuestionNumbers.add(Number(q.questionNumber || q.q_num)));
    }

    // Dynamic non-markdown table parsing
    const explicitHeaders = 
      group.table_headers || 
      group.headers || 
      group.tableColumns || 
      group.columns || 
      remainingGqs.find(q => Array.isArray(q.table_headers) || Array.isArray(q.headers))?.table_headers || 
      remainingGqs.find(q => Array.isArray(q.table_headers) || Array.isArray(q.headers))?.headers || 
      null;

    const parsedRows = remainingGqs.map((q, qIdx) => {
      const qNum = Number(q.questionNumber || q.q_num);
      const val = answers[qNum] || '';
      const isFlagged = flagged[qNum] || false;
      const rawText = q.cleanPrompt || q.text || q.prompt || '';

      let rawCells = null;
      if (Array.isArray(q.columns) && q.columns.length > 0) {
        rawCells = [...q.columns];
      } else if (Array.isArray(q.cells) && q.cells.length > 0) {
        rawCells = [...q.cells];
      } else if (Array.isArray(q.row) && q.row.length > 0) {
        rawCells = [...q.row];
      } else if (q.row && typeof q.row === 'object') {
        rawCells = Object.values(q.row);
      } else if (rawText.includes('\t')) {
        rawCells = rawText.split('\t').map(s => s.trim());
      } else if (rawText.includes(' | ')) {
        rawCells = rawText.split(' | ').map(s => s.trim());
      } else {
        const meta = q.subheading || q.category_label || q.category || q.date || q.year || q.location || '';
        if (meta && meta.toLowerCase() !== 'table' && meta.toLowerCase() !== 'table_completion') {
          rawCells = [meta, rawText];
        } else {
          rawCells = [rawText];
        }
      }

      // Identify which cell contains the input gap
      let gapCellIndex = -1;
      for (let c = 0; c < rawCells.length; c++) {
        const cStr = String(rawCells[c] || '');
        if (splitSentenceAtGap(cStr).hasGap || cStr.includes(`{{${qNum}}}`) || cStr.includes(`{{q_num}}`) || new RegExp(`\\b${qNum}\\b`).test(cStr)) {
          gapCellIndex = c;
          break;
        }
      }
      if (gapCellIndex === -1) {
        gapCellIndex = rawCells.length - 1;
      }

      return {
        q,
        qNum,
        val,
        isFlagged,
        rawCells,
        gapCellIndex,
      };
    });

    const maxCols = Math.max(
      ...parsedRows.map(r => r.rawCells.length),
      Array.isArray(explicitHeaders) ? explicitHeaders.length : 1
    );

    let finalHeaders = [];
    if (Array.isArray(explicitHeaders) && explicitHeaders.length > 0) {
      finalHeaders = explicitHeaders.map(h => typeof h === 'object' ? h.label || h.title || h.name || String(h) : String(h));
    } else if (maxCols >= 3) {
      finalHeaders = Array.from({ length: maxCols }, (_, idx) => {
        if (idx === 0) return group.subheading || 'Category / Feature';
        if (idx === maxCols - 1) return 'Details / Assessment';
        return `Column ${idx + 1}`;
      });
    } else if (maxCols === 2) {
      finalHeaders = [group.subheading || 'Feature / Topic', 'Description / Details'];
    } else {
      finalHeaders = [group.subheading || 'Information'];
    }

    return (
      <div className="bg-white border-2 border-slate-300 rounded-lg p-5 sm:p-6 shadow-2xs space-y-4 mb-2">
        {mainTitle && (
          <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-2">
            {mainTitle}
          </div>
        )}

        {/* Alternating-row table grid with dynamic columns and inline sentence gaps */}
        <div className="border border-slate-300 rounded-md overflow-x-auto bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-12 text-center font-mono">#</th>
                {finalHeaders.map((headerText, hIdx) => (
                  <th key={hIdx} className="py-2.5 px-4 border-l border-slate-200 first:border-l-0">
                    {headerText}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedRows.map((row, rIdx) => {
                const { q, qNum, val, isFlagged, rawCells, gapCellIndex } = row;

                return (
                  <tr
                    key={qNum || rIdx}
                    ref={el => { if (qNum) questionRefs.current[qNum] = el; }}
                    className={`border-b border-slate-200 last:border-0 transition-colors ${
                      isFlagged ? 'bg-amber-50/50' : rIdx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                    }`}
                  >
                    <td className="py-3 px-2 text-center font-mono font-bold text-brand-600 text-xs align-middle">
                      {qNum || ''}
                    </td>
                    {Array.from({ length: maxCols }, (_, cIdx) => {
                      const cellContent = rawCells[cIdx] !== undefined ? String(rawCells[cIdx]) : '';
                      const isGapCell = cIdx === gapCellIndex;

                      if (isGapCell) {
                        const { before, after, hasGap } = splitSentenceAtGap(cellContent);
                        return (
                          <td key={cIdx} className="py-3 px-4 border-l border-slate-200 text-[13.5px] text-slate-800 leading-snug align-middle">
                            <span className="inline-flex items-baseline flex-wrap gap-1">
                              {before && <span>{before}</span>}
                              <span className="inline-flex items-center align-baseline mx-1">
                                <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono shrink-0">
                                  {qNum}
                                </span>
                                <input
                                  type="text"
                                  value={val}
                                  onChange={e => onAnswerChange(qNum, e.target.value)}
                                  placeholder="..."
                                  className={`w-28 sm:w-36 h-7 px-2 border-b-2 text-center font-semibold text-xs outline-none bg-amber-50/20 transition-colors inline-block ${
                                    val
                                      ? 'border-brand-500 text-brand-900 font-bold'
                                      : isFlagged
                                      ? 'border-amber-400 bg-amber-50'
                                      : 'border-slate-400 focus:border-brand-500'
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => onToggleFlag(qNum)}
                                  className={`p-0.5 rounded cursor-pointer transition ml-0.5 ${
                                    isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                  }`}
                                  title={isFlagged ? 'Remove flag' : 'Flag'}
                                >
                                  <Flag className="w-3 h-3" />
                                </button>
                              </span>
                              {after && <span className="ml-1">{after}</span>}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={cIdx} className="py-3 px-4 border-l border-slate-200 text-[13.5px] text-slate-800 leading-snug align-middle">
                          {cellContent || '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // GROUP DISPATCHER
  // ---------------------------------------------------------------------------

  function renderGroup(group, groupIdx, renderedTemplateSignatures, renderedQuestionNumbers) {
    const { category, questions: gqs } = group;

    // Check if all questions in this group are already rendered AND there's no unrendered template
    const templateText = group.notes_template || group.table_template || group.summaryTemplate || group.notesTemplate || group.tableTemplate || '';
    const hasTemplate = Boolean(templateText && (templateText.includes('{{') || templateText.includes('[[')));
    const allQuestionsAlreadyRendered = Array.isArray(gqs) && gqs.length > 0 && gqs.every(q => renderedQuestionNumbers && renderedQuestionNumbers.has(Number(q.questionNumber || q.q_num)));

    if (allQuestionsAlreadyRendered && !hasTemplate) {
      return null;
    }

    const hasTableMarkdown = Boolean(
      (group.table_template && group.table_template.includes('|')) ||
      (group.tableTemplate && group.tableTemplate.includes('|')) ||
      (group.notes_template && group.notes_template.includes('|')) ||
      (group.summaryTemplate && group.summaryTemplate.includes('|')) ||
      gqs?.some(q => (q.table_template && q.table_template.includes('|')) || (q.tableTemplate && q.tableTemplate.includes('|')) || (q.notes_template && q.notes_template.includes('|')) || (q.summary_template && q.summary_template.includes('|')))
    );
    const isTableGroup = category === 'TABLE_COMPLETION' || hasTableMarkdown;
    const hasRefBoxItems = (Array.isArray(group.refBox) && group.refBox.length > 0) || (Array.isArray(group.referenceBox) && group.referenceBox.length > 0);

    const renderedContent = (() => {
      if ((category === 'TFNG' || category === 'YNNG')) return renderTFNGGroup(gqs, category, renderedQuestionNumbers);
      if ((category === 'NOTES' || category === 'FORM_COMPLETION') && !isTableGroup) return renderNotesGroup(gqs, group, renderedTemplateSignatures, renderedQuestionNumbers);
      if (isTableGroup) return renderTableCompletionGroup(gqs, group, renderedTemplateSignatures, renderedQuestionNumbers);
      if ((category === 'MATCHING_INFORMATION' || category === 'PARA_MATCH')) return renderParaMatchGroup(gqs, renderedQuestionNumbers);
      if (category === 'MATCHING_HEADINGS') return renderMatchingHeadingsGroup(gqs, group, renderedQuestionNumbers);
      if ((category === 'MATCHING_FEATURES' || category === 'RESEARCHER_MATCH' || category === 'MATCHING' || category === 'MAP_DIAGRAM_LABELING')) return renderResearcherMatchGroup(gqs, group, renderedQuestionNumbers);
      if (((category === 'SUMMARY_TEXT' || category === 'SUMMARY_COMPLETION') && !isTableGroup && !hasRefBoxItems)) return renderSummaryTextGroup(gqs, group, renderedTemplateSignatures, renderedQuestionNumbers);
      if ((category === 'SUMMARY_WORDS' || category === 'SUMMARY_MATCHING' || (((category === 'SUMMARY_COMPLETION' || category === 'SUMMARY_TEXT') && !isTableGroup) && hasRefBoxItems))) return renderSummaryWordsGroup(gqs, group, renderedTemplateSignatures, renderedQuestionNumbers);
      if ((category === 'MC' || category === 'MULTIPLE_CHOICE' || category === 'MULTIPLE_CHOICE_MULTI')) return renderMCGroup(gqs, group, renderedQuestionNumbers);
      if (category === 'FILL_BLANK' && !isTableGroup) return renderFillBlankGroup(gqs, renderedQuestionNumbers);
      if (category === 'FLOW_CHART') return renderFlowChartGroup(gqs, group, renderedQuestionNumbers);
      return null;
    })();

    if (!renderedContent) {
      return null;
    }

    return (
      <div key={groupIdx} className="mb-10 last:mb-2">
        {renderGroupHeader(group)}
        {renderedContent}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  const groups = groupQuestionsIntoSets(filteredQuestions, activePassageRefBox).map(g => ({
    ...g,
    refBox: g.refBox || g.referenceBox,
  }));

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-100 overflow-hidden">
      {/* Compact Top Header (~44px) */}
      <div className="h-11 px-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <ListChecks className="w-4 h-4 text-brand-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Passage {activePassageId} Questions
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Highlighter Color Buttons */}
          <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => applyHighlightToSelection('yellow', questionsContainerRef.current)}
              className="w-5 h-5 rounded bg-yellow-200 hover:bg-yellow-300 border border-yellow-400/50 flex items-center justify-center transition cursor-pointer"
              title="Highlight Yellow"
            >
              <Highlighter className="w-3 h-3 text-yellow-800" />
            </button>
            <button
              type="button"
              onClick={() => applyHighlightToSelection('green', questionsContainerRef.current)}
              className="w-5 h-5 rounded bg-green-200 hover:bg-green-300 border border-green-400/50 flex items-center justify-center transition cursor-pointer"
              title="Highlight Mint Green"
            >
              <Highlighter className="w-3 h-3 text-green-800" />
            </button>
            <button
              type="button"
              onClick={() => applyHighlightToSelection('pink', questionsContainerRef.current)}
              className="w-5 h-5 rounded bg-pink-200 hover:bg-pink-300 border border-pink-400/50 flex items-center justify-center transition cursor-pointer"
              title="Highlight Pink"
            >
              <Highlighter className="w-3 h-3 text-pink-800" />
            </button>
            <button
              type="button"
              onClick={() => clearAllHighlights(questionsContainerRef.current)}
              className="p-0.5 text-slate-400 hover:text-rose-500 rounded transition cursor-pointer"
              title="Clear Highlights"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          {bookletHtml && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setViewMode('sheet')}
                className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'sheet'
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-600'
                }`}
              >
                Sheet
              </button>
              <button
                type="button"
                onClick={() => setViewMode('booklet')}
                className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'booklet'
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-brand-600'
                }`}
              >
                Exact Booklet
              </button>
            </div>
          )}
          <div className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
            {answeredCount}/{totalQuestions}
          </div>
        </div>
      </div>

      {/* Continuous Examination Paper Sheet */}
      <div ref={questionsContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 select-text [&_*]:select-text">
        {bookletHtml && viewMode === 'booklet' ? (
          <div className="bg-white border border-slate-200 shadow-sm rounded p-4">
            <div className="border-b pb-2 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
              <span>Authentic Booklet • Passage {activePassageId}</span>
              <span className="text-brand-600">Type directly into blanks</span>
            </div>
            <IeltsBookletRenderer
              htmlContent={bookletHtml}
              answers={answers}
              onAnswerChange={onAnswerChange}
              flagged={flagged}
              questions={questions}
            />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto bg-white border border-slate-200 shadow-sm px-6 py-8 sm:px-10 sm:py-10 font-sans min-h-full text-slate-900">
            {groups.length === 0 && (
              <p className="text-[13px] text-slate-400 italic text-center py-8">
                Questions for Passage {activePassageId} will appear here once the exam is loaded.
              </p>
            )}
            {(() => {
              const renderedTemplateSignatures = new Set();
              const renderedQuestionNumbers = new Set();
              return groups.map((group, gIdx) => renderGroup(group, gIdx, renderedTemplateSignatures, renderedQuestionNumbers));
            })()}
          </div>
        )}
      </div>

      {/* Docked Question Palette — strictly centered */}
      <div className="w-full flex items-center justify-center py-2.5 bg-white border-t border-slate-200 shrink-0 select-none">
        <div className="flex flex-wrap items-center justify-center gap-1.5 px-3">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mr-1 shrink-0">
            P{activePassageId}:
          </span>
          {filteredQuestions.map(q => {
            const qNum = q.questionNumber;
            const isAns = Boolean(answers[qNum] && answers[qNum].trim());
            const isFlg = flagged[qNum];
            return (
              <button
                key={qNum}
                type="button"
                onClick={() => scrollToQuestion(qNum, activePassageId)}
                className={`w-7 h-7 rounded text-xs font-semibold transition flex items-center justify-center cursor-pointer shrink-0 ${
                  isFlg
                    ? 'bg-amber-400 text-slate-900 ring-1 ring-amber-300 font-bold'
                    : isAns
                    ? 'bg-brand-500 text-white shadow-xs font-bold'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium border border-slate-200'
                }`}
                title={`Question ${qNum}`}
              >
                {qNum}
              </button>
            );
          })}
        </div>
      </div>

      {/* Floating Selection Highlighter Popover for Questions */}
      <SelectionHighlightPopover containerRef={questionsContainerRef} />
    </div>
  );
}
