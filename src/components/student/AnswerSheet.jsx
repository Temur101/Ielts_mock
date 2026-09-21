import React, { useRef, useState } from 'react';
import {
  Flag,
  ListChecks,
  Check,
  Layers,
} from 'lucide-react';
import { IeltsBookletRenderer } from './IeltsBookletRenderer';
import { 
  normalizeTemplateGaps,
  cleanGapArtifacts,
  splitSentenceAtGap,
} from '../../lib/questionUtils';

// ---------------------------------------------------------------------------
// GENERIC CAMBRIDGE IELTS QUESTION PROCESSORS
// ---------------------------------------------------------------------------

/** 
 * Dynamically detects question task category based on schema type, templates, and instruction hints.
 * Purely generic: completely independent of passage ID or static question numbering.
 */
function detectCategory(q) {
  if (!q) return 'FILL_BLANK';
  const qNum = q.questionNumber || q.q_num;
  const t = (q.type || '').toUpperCase();
  const textStr = `${q.instruction || ''} ${q.prompt || ''} ${q.text || ''}`.toLowerCase();

  // Informative context lines without question numbers in notes
  if (t === 'CONTEXT' || !qNum) return 'NOTES';

  // Explicit schema type checks
  if (t === 'TRUE_FALSE_NOT_GIVEN' || t === 'YES_NO_NOT_GIVEN') return 'TFNG';
  if (t === 'NOTES_COMPLETION' || t === 'TABLE_COMPLETION' || t === 'DIAGRAM_LABEL') return 'NOTES';
  if (t === 'SUMMARY_MATCHING') return 'SUMMARY_WORDS';
  if (t === 'SUMMARY_COMPLETION' || t === 'SUMMARY') {
    const hasRef = Boolean(q.reference_box || q.referenceBox || (Array.isArray(q.options) && q.options.length > 4));
    return hasRef ? 'SUMMARY_WORDS' : 'SUMMARY_TEXT';
  }
  if (t === 'MULTIPLE_CHOICE') return 'MC';
  if (
    t === 'MATCHING_HEADINGS' ||
    t === 'MATCHING_INFO' ||
    /which paragraph contains|choose the correct paragraph|which section contains/i.test(textStr) ||
    (t === 'MATCHING' && (q.options || []).some(o => /^[A-I]$/i.test(String(o).trim())))
  ) {
    return 'PARA_MATCH';
  }

  if (t === 'MATCHING' || t === 'MATCHING_FEATURES') {
    return 'RESEARCHER_MATCH';
  }

  // Text/instruction heuristic detection
  if (/true[\s\/]+false/i.test(textStr) || /yes[\s\/]+no/i.test(textStr)) return 'TFNG';
  if (/complete the summary/i.test(textStr)) {
    if (q.reference_box || q.referenceBox || /list of (?:words|options|names)/i.test(textStr)) {
      return 'SUMMARY_WORDS';
    }
    return 'SUMMARY_TEXT';
  }
  if (/complete the notes/i.test(textStr) || /complete the table/i.test(textStr) || q.notes_template) {
    return 'NOTES';
  }
  if (/look at the following|match each|choose.*from the box/i.test(textStr) || q.reference_box || q.referenceBox) {
    return 'RESEARCHER_MATCH';
  }
  if (Array.isArray(q.options) && q.options.length >= 2) {
    return 'MC';
  }

  return 'FILL_BLANK';
}

/** Group consecutive questions into authentic exam task blocks */
function groupQuestions(questions) {
  if (!questions || questions.length === 0) return [];

  // Strictly sort questions ascending by questionNumber to guarantee chronological sequence
  const sorted = [...questions].sort(
    (a, b) => Number(a.questionNumber || a.q_num || 0) - Number(b.questionNumber || b.q_num || 0)
  );

  const groups = [];
  for (const q of sorted) {
    const cat = detectCategory(q);
    const inst = q.instruction || '';
    const last = groups[groups.length - 1];
    const sameGroup = last && last.category === cat;

    if (sameGroup) {
      last.questions.push(q);
      if (!last.refBox) {
        const rb = q.reference_box || q.referenceBox;
        if (Array.isArray(rb) && rb.length > 0) last.refBox = rb;
      }
      if (!last.summaryTemplate && (q.summary_template || q.notes_template)) {
        last.summaryTemplate = q.summary_template || q.notes_template;
      }
      if (!last.title && q.title) {
        last.title = q.title;
      }
    } else {
      const rb = q.reference_box || q.referenceBox || null;
      groups.push({
        category: cat,
        instruction: inst,
        title: q.title || '',
        subheading: q.subheading || '',
        refBox: Array.isArray(rb) && rb.length > 0 ? rb : null,
        summaryTemplate: q.summary_template || q.notes_template || null,
        questions: [q],
      });
    }
  }
  return groups;
}

/**
 * Official Cambridge IELTS Reading Numbering Partition Logic (40 Qs across 3 Passages)
 */
export const resolveReadingPassage = (q) => {
  if (q.passageId) return Number(q.passageId);
  if (q.partId) return Number(q.partId);
  const qNum = Number(q.questionNumber || q.q_num || 0);
  if (qNum >= 1 && qNum <= 13) return 1;
  if (qNum >= 14 && qNum <= 26) return 2;
  if (qNum >= 27 && qNum <= 40) return 3;
  return 1;
};

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

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
  const [viewMode, setViewMode] = useState('sheet');
  const questionRefs = useRef({});

  // Dynamic Cambridge IELTS passage question filtering strictly sorted by questionNumber
  let filteredQuestions = questions
    .filter(q => resolveReadingPassage(q) === Number(activePassageId))
    .sort((a, b) => Number(a.questionNumber || a.q_num || 0) - Number(b.questionNumber || b.q_num || 0));

  // Fallback questions so student never sees an empty screen
  if (filteredQuestions.length === 0) {
    const activeId = Number(activePassageId);
    const startQ = activeId === 1 ? 1 : activeId === 2 ? 14 : 27;
    const count = activeId === 3 ? 14 : 13;
    filteredQuestions = Array.from({ length: count }, (_, i) => ({
      id: `q-${startQ + i}`,
      questionNumber: startQ + i,
      passageId: activeId,
      type: 'FILL_BLANK',
      instruction: 'Answer the question based on the reading passage.',
      text: `Question ${startQ + i}: Complete the answer from the text`,
      placeholder: `Type answer for Question ${startQ + i}...`
    }));
  }

  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).filter(k => answers[k] && answers[k].trim()).length;

  const scrollToQuestion = (qNum, passageId) => {
    let targetPassage = passageId;
    if (!targetPassage) {
      const qObj = questions.find(q => (q.questionNumber || q.q_num) === qNum);
      targetPassage = qObj ? resolveReadingPassage(qObj) : (
        qNum <= 13 ? 1 : qNum <= 26 ? 2 : 3
      );
    }
    targetPassage = targetPassage || 1;
    if (targetPassage !== activePassageId && onJumpToPassage) {
      onJumpToPassage(targetPassage);
      setTimeout(() => {
        const el = questionRefs.current[qNum];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    } else {
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
    const rangeLabel =
      gqs.length > 1
        ? `Questions ${first.questionNumber}–${last.questionNumber}`
        : `Question ${first.questionNumber}`;

    let defaultInstruction = instruction;
    if (!defaultInstruction) {
      if (category === 'TFNG') {
        const isYNNG = first.type === 'YES_NO_NOT_GIVEN' || /yes[\s\/]+no/i.test(instruction || '') || /claims of the writer/i.test(instruction || '');
        defaultInstruction = isYNNG
          ? `Do the following statements agree with the claims of the writer in Reading Passage ${activePassageId}?\nIn boxes ${first.questionNumber}–${last.questionNumber} on your answer sheet, choose YES, NO, or NOT GIVEN.`
          : `Do the following statements agree with the information given in Reading Passage ${activePassageId}?\nIn boxes ${first.questionNumber}–${last.questionNumber} on your answer sheet, choose TRUE, FALSE, or NOT GIVEN.`;
      } else if (category === 'NOTES') {
        defaultInstruction = 'Complete the notes below.\nChoose ONE WORD ONLY from the passage for each answer.';
      } else if (category === 'PARA_MATCH') {
        defaultInstruction = `Reading Passage ${activePassageId} has lettered paragraphs.\nWhich paragraph contains the following information?\nWrite the correct letter in boxes ${first.questionNumber}–${last.questionNumber} on your answer sheet.`;
      } else if (category === 'RESEARCHER_MATCH') {
        defaultInstruction = `Look at the following statements (Questions ${first.questionNumber}–${last.questionNumber}) and the list of options below.\nMatch each statement with the correct letter.`;
      } else if (category === 'SUMMARY_TEXT') {
        defaultInstruction = 'Complete the summary below.\nChoose ONE WORD ONLY from the passage for each answer.';
      } else if (category === 'SUMMARY_WORDS') {
        defaultInstruction = `Complete the summary using the list of words below.\nWrite the correct letter in boxes ${first.questionNumber}–${last.questionNumber} on your answer sheet.`;
      } else if (category === 'MC') {
        defaultInstruction = `Choose the correct letter, A, B, C or D.\nWrite the correct letter in boxes ${first.questionNumber}–${last.questionNumber} on your answer sheet.`;
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
        {category === 'PARA_MATCH' && (
          <p className="text-[12px] text-slate-500 italic mt-1 font-medium">
            NB You may use any letter more than once.
          </p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 1. TRUE / FALSE / NOT GIVEN
  // ---------------------------------------------------------------------------

  function renderTFNGGroup(gqs) {
    return (
      <div className="space-y-1">
        {gqs.map(q => {
          const qNum = q.questionNumber;
          const val = answers[qNum] || '';
          const isFlagged = flagged[qNum] || false;
          const isYNNG = q.type === 'YES_NO_NOT_GIVEN' || /yes[\s\/]+no/i.test(q.instruction || '') || /claims of the writer/i.test(q.instruction || '');
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

  function renderNotesGroup(gqs, group) {
    const mainTitle = group.title || gqs[0]?.title || 'Notes Completion';

    // Check for inline template (notes_template or summary_template with {{N}})
    const template =
      group.summaryTemplate ||
      gqs.find(q => q.summary_template || q.notes_template)?.summary_template ||
      gqs.find(q => q.notes_template)?.notes_template;

    if (template) {
      const cleanTemplate = normalizeTemplateGaps(template, gqs);
      const lines = cleanTemplate.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      return (
        <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
          <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-4">
            {mainTitle}
          </div>
          <div className="space-y-3 font-sans">
            {lines.map((line, lIdx) => {
              const isHeading = /^(?:#{1,4}\s+|\*\*(?:[^*]+)\*\*|[A-Z\s]{4,}:?$)/.test(line) && !line.includes('{{');
              if (isHeading) {
                const cleanH = line.replace(/^[#*\s]+|[#*\s]+$/g, '').replace(/:$/, '');
                return (
                  <div key={lIdx} className="text-[13.5px] font-bold text-slate-900 border-b border-slate-300/70 pb-1 mt-4 mb-2">
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
                  <li key={lIdx} className="text-[13.5px] text-slate-800 list-disc ml-4 leading-loose">
                    {content}
                  </li>
                );
              }

              return (
                <p key={lIdx} className="text-[13.5px] text-slate-800 leading-loose mb-2">
                  {content}
                </p>
              );
            })}
          </div>
        </div>
      );
    }

    // Check if we have subheadings from parsed items
    const hasParsedSubheadings = gqs.some(q => Boolean(q.subheading && String(q.subheading).trim()));
    const sections = [];

    if (gqs.length > 0) {
      if (hasParsedSubheadings) {
        gqs.forEach(q => {
          const sub = (q.subheading && String(q.subheading).trim()) || 'Notes';
          let sec = sections.find(s => s.subheading.toLowerCase() === sub.toLowerCase());
          if (!sec) {
            sec = { subheading: sub, questions: [] };
            sections.push(sec);
          }
          sec.questions.push(q);
        });
      } else {
        sections.push({ subheading: '', questions: gqs });
      }
    }

    return (
      <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
        {/* Main Notes Title in bold uppercase */}
        <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-4">
          {mainTitle}
        </div>

        {gqs.length > 0 ? (
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
                                <span className="inline-flex items-baseline gap-1.5 flex-wrap leading-relaxed">
                                  {before && <span>{before}</span>}
                                  <span className="inline-flex items-baseline mx-1">
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
                                  </span>
                                  {after && <span>{after}</span>}
                                  <button
                                    type="button"
                                    onClick={() => onToggleFlag(qNum)}
                                    className={`p-1 rounded cursor-pointer transition ${
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

  function renderParaMatchGroup(gqs) {
    return (
      <div className="space-y-2">
        {gqs.map(q => {
          const qNum = q.questionNumber;
          const val = answers[qNum] || '';
          const isFlagged = flagged[qNum] || false;

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
  // 4. MATCHING RESEARCHERS / NAMES
  // ---------------------------------------------------------------------------

  function renderResearcherMatchGroup(gqs, group) {
    const researchers = group.refBox || gqs[0]?.reference_box || [];

    return (
      <div className="space-y-4">
        {/* List of Options / Researchers Reference Box */}
        {researchers.length > 0 && (
          <div className="border border-slate-300 p-4 bg-slate-50/60">
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
        )}

        {/* Statements */}
        <div className="space-y-2">
          {gqs.map(q => {
            const qNum = q.questionNumber;
            const val = answers[qNum] || '';
            const isFlagged = flagged[qNum] || false;
            const placeholder = researchers.length > 0 
              ? `${researchers[0]?.key || 'A'}–${researchers[researchers.length - 1]?.key || 'D'}`
              : 'A–D';

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
                    {q.text || q.prompt}
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
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 5. SUMMARY COMPLETION WITH INLINE GAPS
  // ---------------------------------------------------------------------------

  function renderSummaryTextGroup(gqs, group) {
    const summaryTitle = group.title || gqs[0]?.title || 'Summary';
    const rawTemplate =
      group.summaryTemplate || gqs.find(q => q.summary_template)?.summary_template || '';

    if (!rawTemplate) {
      return (
        <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
          {summaryTitle && (
            <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 tracking-wide border-b border-slate-200 pb-3 mb-4">
              {summaryTitle}
            </div>
          )}
          <div className="space-y-4">
            {gqs.map(q => {
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
                    value={val}
                    onChange={e => onAnswerChange(qNum, e.target.value)}
                    placeholder="..."
                    className={`w-32 h-7 text-center font-semibold text-sm border-b-2 outline-none bg-amber-50/20 transition-colors ${
                      val ? 'border-brand-500 text-brand-900' : isFlagged ? 'border-amber-400' : 'border-slate-400 focus:border-brand-500'
                    }`}
                  />
                  {after && <span>{after}</span>}
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
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    const template = normalizeTemplateGaps(rawTemplate, gqs);
    const parts = template.split(/(\{\{\d+\}\})/g);

    return (
      <div className="bg-slate-50/60 border border-slate-200 p-5 sm:p-6 mb-2">
        <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 tracking-wide border-b border-slate-200 pb-3 mb-4">
          {summaryTitle}
        </div>
        <p className="text-[14px] leading-[2.3] text-slate-800 font-serif">
          {parts.map((part, idx) => {
            const match = part.match(/^\{\{(\d+)\}\}$/);
            if (match) {
              const qNum = Number(match[1]);
              const val = answers[qNum] || '';
              const isFlagged = flagged[qNum] || false;

              return (
                <span
                  key={idx}
                  ref={el => (questionRefs.current[qNum] = el)}
                  className="inline-flex items-center align-baseline mx-1"
                >
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
                    className={`w-28 h-7 text-center font-semibold text-sm border-b-2 outline-none bg-amber-50/20 transition-colors ${
                      val
                        ? 'border-brand-500 text-brand-900'
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
              <span key={idx}>
                {part
                  .replace(/(?:_{2,}|\.{3,})/g, '')
                  .replace(/(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?/gi, '')}
              </span>
            );
          })}
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 6. SUMMARY COMPLETION WITH LIST OF WORDS
  // ---------------------------------------------------------------------------

  function renderSummaryWordsGroup(gqs, group) {
    const summaryTitle = group.title || gqs[0]?.title || 'Summary';
    const refBox = group.refBox || gqs[0]?.reference_box || [];
    const rawTemplate =
      group.summaryTemplate || gqs.find(q => q.summary_template)?.summary_template || '';

    if (!rawTemplate) {
      return (
        <div className="space-y-4">
          {refBox.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600 px-0.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>List of Words / Phrases</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 p-4 bg-slate-50 border border-slate-300 rounded">
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
              {gqs.map(q => {
                const qNum = q.questionNumber || q.q_num;
                const val = answers[qNum] || '';
                const isFlagged = flagged[qNum] || false;
                const promptText = q.text || q.prompt || `Question ${qNum}`;
                const { before, after } = splitSentenceAtGap(promptText);

                return (
                  <div
                    key={qNum}
                    ref={el => (questionRefs.current[qNum] = el)}
                    className="flex items-center gap-2 text-sm text-slate-800 flex-wrap py-1"
                  >
                    <span className="font-mono font-bold text-slate-900">{qNum}.</span>
                    {before && <span>{before}</span>}
                    <input
                      type="text"
                      maxLength={2}
                      value={val}
                      onChange={e => onAnswerChange(qNum, e.target.value.toUpperCase())}
                      placeholder="Letter"
                      className={`w-12 h-8 text-center font-bold uppercase text-sm border-2 rounded outline-none transition-colors ${
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

    const template = normalizeTemplateGaps(rawTemplate, gqs);
    const parts = template.split(/(\{\{\d+\}\})/g);

    return (
      <div className="space-y-4">
        {/* Reference Box (List of Words / Phrases) with CSS Grid */}
        {refBox.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600 px-0.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>List of Words / Phrases</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 p-4 bg-slate-50 border border-slate-300 rounded">
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
          <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 tracking-wide border-b border-slate-200 pb-3 mb-4">
            {summaryTitle}
          </div>
          <p className="text-[14px] leading-[2.3] text-slate-800 font-serif">
            {parts.map((part, idx) => {
              const match = part.match(/^\{\{(\d+)\}\}$/);
              if (match) {
                const qNum = Number(match[1]);
                const val = answers[qNum] || '';
                const isFlagged = flagged[qNum] || false;

                return (
                  <span
                    key={idx}
                    ref={el => (questionRefs.current[qNum] = el)}
                    className="inline-flex items-center align-baseline mx-1"
                  >
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold mr-1 select-none font-mono ${
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
                      className={`w-10 h-7 text-center font-bold uppercase text-sm border-b-2 outline-none bg-amber-50/20 transition-colors ${
                        val
                          ? 'border-brand-500 text-brand-900'
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
                <span key={idx}>
                  {part
                    .replace(/(?:_{2,}|\.{3,})/g, '')
                    .replace(/(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?/gi, '')}
                </span>
              );
            })}
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 7. MULTIPLE CHOICE (Q32–35)
  // ---------------------------------------------------------------------------

  function renderMCGroup(gqs) {
    return (
      <div className="space-y-5">
        {gqs.map(q => {
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
                    {q.text || q.prompt}
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
                {q.options?.map(option => {
                  const letter = option.charAt(0);
                  const isSelected =
                    val.toUpperCase() === letter.toUpperCase() ||
                    val.toUpperCase() === option.toUpperCase();
                  const displayText = option.replace(/^[A-Z][\.\)]\s*/, '').trim() || option;

                  return (
                    <label
                      key={option}
                      onClick={() => onAnswerChange(qNum, letter)}
                      className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors text-[13px] ${
                        isSelected
                          ? 'bg-brand-50 text-brand-900 font-semibold'
                          : 'hover:bg-slate-50 text-slate-700'
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
                      <span className="leading-snug pt-0.5">{displayText}</span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-brand-600 ml-auto shrink-0 mt-1" />
                      )}
                    </label>
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

  function renderFillBlankGroup(gqs) {
    return (
      <div className="space-y-1">
        {gqs.map(q => {
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
              <div className="flex-1 text-[13.5px] leading-relaxed text-slate-800">
                <span className="inline-flex items-baseline gap-1.5 flex-wrap leading-relaxed">
                  {before && <span>{before}</span>}
                  <span className="inline-flex items-baseline mx-1">
                    <input
                      type="text"
                      value={val}
                      onChange={e => onAnswerChange(qNum, e.target.value)}
                      className={`h-7 px-2 min-w-[120px] max-w-[200px] border-b-2 text-sm font-semibold outline-none bg-transparent transition-colors align-baseline ${
                        val
                          ? 'border-brand-500'
                          : isFlagged
                          ? 'border-amber-400'
                          : 'border-slate-400 focus:border-brand-500'
                      }`}
                      placeholder="..."
                    />
                  </span>
                  {after && <span>{after}</span>}
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
  // GROUP DISPATCHER
  // ---------------------------------------------------------------------------

  function renderGroup(group, groupIdx) {
    const { category, questions: gqs } = group;

    return (
      <div key={groupIdx} className="mb-10 last:mb-2">
        {renderGroupHeader(group)}
        {category === 'TFNG' && renderTFNGGroup(gqs)}
        {category === 'NOTES' && renderNotesGroup(gqs, group)}
        {category === 'PARA_MATCH' && renderParaMatchGroup(gqs)}
        {category === 'RESEARCHER_MATCH' && renderResearcherMatchGroup(gqs, group)}
        {category === 'SUMMARY_TEXT' && renderSummaryTextGroup(gqs, group)}
        {category === 'SUMMARY_WORDS' && renderSummaryWordsGroup(gqs, group)}
        {category === 'MC' && renderMCGroup(gqs)}
        {category === 'FILL_BLANK' && renderFillBlankGroup(gqs)}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  const groups = groupQuestions(filteredQuestions, activePassageId);

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* Compact Top Header (~44px) */}
      <div className="h-11 px-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <ListChecks className="w-4 h-4 text-brand-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Passage {activePassageId} Questions
          </span>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
            />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto bg-white border border-slate-200 shadow-sm px-6 py-8 sm:px-10 sm:py-10 font-sans min-h-full text-slate-900">
            {groups.length === 0 && (
              <p className="text-[13px] text-slate-400 italic text-center py-8">
                Questions for Passage {activePassageId} will appear here once the exam is loaded.
              </p>
            )}
            {groups.map((group, gIdx) => renderGroup(group, gIdx))}
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
    </div>
  );
}
