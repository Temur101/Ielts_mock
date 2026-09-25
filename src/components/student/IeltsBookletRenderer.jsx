import React, { useEffect, useRef } from 'react';
import { Flag } from 'lucide-react';
import { splitSentenceAtGap } from '../../lib/questionUtils';

/**
 * IeltsBookletRenderer
 * 
 * Renders authentic Cambridge IELTS booklet HTML (with .pdf-exact-box, tables, instructions)
 * and dynamically converts .answer-slot markers into interactive inputs so candidates
 * can type their answers directly inside the reproduced layout.
 */
/**
 * Deduplicate summary / notes templates across question groups within a section
 */
export function isTemplateAlreadyRendered(renderedTemplateSignatures, templateContent) {
  if (!templateContent || !renderedTemplateSignatures) return false;
  const trimmed = typeof templateContent === 'string' ? templateContent.trim() : '';
  if (!trimmed) return false;
  if (renderedTemplateSignatures.has(trimmed)) return true;
  renderedTemplateSignatures.add(trimmed);
  return false;
}

export function FlowChartGapItem({ q, currentAnswer, onAnswerChange }) {
  const qNum = q?.questionNumber || q?.q_num;
  const rawText = q?.cleanPrompt || q?.text || q?.prompt || (qNum ? `Question ${qNum}` : '');
  const { before, after, hasGap } = splitSentenceAtGap(q?.cleanPrompt || q?.text || q?.prompt || '');

  const inputEl = (
    <span className="inline-flex items-center align-baseline mx-1">
      {qNum && (
        <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono">
          {qNum}
        </span>
      )}
      <input
        type="text"
        value={currentAnswer || ''}
        placeholder="..."
        onChange={(e) => onAnswerChange && onAnswerChange(qNum, e.target.value)}
        className="inline-block w-24 sm:w-28 h-7 text-center font-bold text-xs rounded-lg border border-brand-400 bg-orange-50/50 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none align-middle"
      />
    </span>
  );

  if (hasGap) {
    return (
      <span className="inline items-baseline leading-loose text-xs sm:text-sm">
        {before && <span>{before} </span>}
        {inputEl}
        {after && <span> {after}</span>}
      </span>
    );
  }

  return (
    <span className="inline items-baseline leading-loose text-xs sm:text-sm">
      <span>{rawText} </span>
      {inputEl}
    </span>
  );
}

export function renderTableCellContent(
  cellText,
  { answers = {}, onAnswerChange, flagged = {}, onToggleFlag, questionRefs = { current: {} } } = {}
) {
  if (!cellText) return null;

  // Question gap markers: {{21}}, [21], (21)
  const tokenRegex = /(\{\{\d+\}\}|\[\d+\]|\(\d+\))/g;
  const parts = cellText.split(tokenRegex);

  return (
    <span className="inline items-baseline leading-relaxed">
      {parts.map((part, pIdx) => {
        const m = part.match(/^(?:\{\{(\d+)\}\}|\[(\d+)\]|\((\d+)\))$/);
        if (m) {
          const qNum = Number(m[1] || m[2] || m[3]);
          const currentAnswer = answers[qNum] !== undefined && answers[qNum] !== null ? String(answers[qNum]) : '';
          const isFlagged = flagged && flagged[qNum];

          return (
            <span key={pIdx} className="inline-flex items-center align-baseline mx-1">
              <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono">
                {qNum}
              </span>
              <input
                type="text"
                ref={el => { if (el && questionRefs?.current) questionRefs.current[qNum] = el; }}
                value={currentAnswer}
                onChange={e => onAnswerChange && onAnswerChange(qNum, e.target.value)}
                placeholder="..."
                className={`w-24 sm:w-28 h-7 px-2 border-b-2 text-center font-semibold text-xs outline-none bg-transparent transition-colors inline-block ${
                  currentAnswer
                    ? 'border-brand-500 text-brand-900 font-bold'
                    : isFlagged
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-slate-400 focus:border-brand-500'
                }`}
              />
              {onToggleFlag && (
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
              )}
            </span>
          );
        }
        return <span key={pIdx}>{part}</span>;
      })}
    </span>
  );
}

export function MarkdownTable({
  tableContent,
  answers = {},
  onAnswerChange,
  onToggleFlag,
  flagged = {},
  questionRefs = { current: {} },
  questions = [],
}) {
  if (!tableContent || typeof tableContent !== 'string') return null;

  const rawLines = tableContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Filter out table divider rows, e.g. |---|---| or |:---|:---:|---:|
  const isDividerRow = (line) => {
    if (!line.includes('|')) return false;
    const cells = line
      .split('|')
      .map(c => c.trim())
      .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));
    return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));
  };

  const contentLines = rawLines.filter(line => line.includes('|') && !isDividerRow(line));
  if (contentLines.length === 0) return null;

  const parsedRows = contentLines.map(line => {
    let cells = line.split('|').map(c => c.trim());
    if (cells.length > 1 && cells[0] === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  });

  const hasDivider = rawLines.some(isDividerRow);
  const headers = hasDivider || parsedRows.length > 1 ? parsedRows[0] : [];
  const bodyRows = hasDivider || parsedRows.length > 1 ? parsedRows.slice(1) : parsedRows;

  return (
    <div className="w-full overflow-x-auto my-3">
      <table className="w-full border-collapse my-3 border border-slate-200 text-xs">
        {headers.length > 0 && (
          <thead>
            <tr className="bg-slate-100/90 border-b border-slate-300">
              {headers.map((h, hIdx) => (
                <th
                  key={hIdx}
                  className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800 uppercase tracking-wider text-[11px]"
                >
                  {renderTableCellContent(h, {
                    answers,
                    onAnswerChange,
                    flagged,
                    onToggleFlag,
                    questionRefs,
                    questions,
                  })}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, rIdx) => (
            <tr
              key={rIdx}
              className={`border-b border-slate-200 transition-colors ${
                rIdx % 2 === 0 ? 'bg-white hover:bg-slate-50/50' : 'bg-slate-50/40 hover:bg-slate-50'
              }`}
            >
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="border border-slate-200 px-3 py-2 text-slate-700 align-middle"
                >
                  {renderTableCellContent(cell, {
                    answers,
                    onAnswerChange,
                    flagged,
                    onToggleFlag,
                    questionRefs,
                    questions,
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function convertMarkdownTablesToHtml(content) {
  if (!content || typeof content !== 'string' || !content.includes('|')) return content;

  const lines = content.split(/\r?\n/);
  const resultLines = [];
  let inTable = false;
  let tableRows = [];

  const isDividerRow = (line) => {
    if (!line.includes('|')) return false;
    const cells = line
      .split('|')
      .map(c => c.trim())
      .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));
    return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const contentLines = tableRows.filter(line => !isDividerRow(line));
    if (contentLines.length === 0) {
      tableRows = [];
      return;
    }
    const parsedRows = contentLines.map(line => {
      let cells = line.split('|').map(c => c.trim());
      if (cells.length > 1 && cells[0] === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
      return cells;
    });

    const hasDivider = tableRows.some(isDividerRow);
    const headers = hasDivider || parsedRows.length > 1 ? parsedRows[0] : [];
    const bodyRows = hasDivider || parsedRows.length > 1 ? parsedRows.slice(1) : parsedRows;

    let html = '<table class="w-full border-collapse my-3 border border-slate-200 text-xs">';
    if (headers.length > 0) {
      html += '<thead><tr class="bg-slate-100/90 border-b border-slate-300">';
      headers.forEach(h => {
        const slotH = h.replace(/(?:\{\{(\d+)\}\}|\[(\d+)\])/g, '<span class="answer-slot" data-question-num="$1$2"></span>');
        html += `<th class="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">${slotH}</th>`;
      });
      html += '</tr></thead>';
    }
    html += '<tbody>';
    bodyRows.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';
      html += `<tr class="border-b border-slate-200 ${bg}">`;
      row.forEach(cell => {
        const slotCell = cell.replace(/(?:\{\{(\d+)\}\}|\[(\d+)\])/g, '<span class="answer-slot" data-question-num="$1$2"></span>');
        html += `<td class="border border-slate-200 px-3 py-2 text-slate-700 align-middle">${slotCell}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    resultLines.push(html);
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('|')) {
      inTable = true;
      tableRows.push(line.trim());
    } else {
      if (inTable) {
        flushTable();
        inTable = false;
      }
      resultLines.push(line);
    }
  }

  if (inTable) {
    flushTable();
  }

  return resultLines.join('\n');
}

export function MatchingCompactInput({ q, currentAnswer, onAnswerChange, placeholder = 'A-G' }) {
  return (
    <input
      type="text"
      maxLength={2}
      value={currentAnswer || ''}
      placeholder={placeholder}
      onChange={(e) => onAnswerChange(q?.questionNumber || q?.q_num, e.target.value.toUpperCase().trim())}
      className="min-w-[5.5rem] w-24 sm:w-28 h-10 px-3 text-center font-mono font-bold text-sm uppercase rounded-xl border-2 border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white text-brand-700 shrink-0"
    />
  );
}

export function MatchingHeadingsSelect({ q, currentAnswer, onAnswerChange, optionsList = [], placeholder, category }) {
  const effectiveCat = category || q?.category || q?.type;
  const isHeadings = effectiveCat === 'MATCHING_HEADINGS';
  const defaultPlaceholder = isHeadings ? 'Choose Heading...' : 'Choose Option...';
  return (
    <select
      value={currentAnswer || ''}
      onChange={(e) => onAnswerChange(q?.questionNumber || q?.q_num, e.target.value)}
      className="h-10 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-brand-500 max-w-xs"
    >
      <option value="">{placeholder || defaultPlaceholder}</option>
      {optionsList.map(opt => (
        <option key={opt.key} value={opt.key}>{opt.label ? `${opt.key} - ${opt.label}` : opt.key}</option>
      ))}
    </select>
  );
}

export function TfngButtons({ q, currentAnswer, onAnswerChange, category }) {
  const isYNNG = category === 'YNNG' || q?.category === 'YNNG' || q?.type === 'YES_NO_NOT_GIVEN' || /yes[\s\/]+no/i.test(q?.instruction || '') || /claims of the writer/i.test(q?.instruction || '');
  const opts = isYNNG ? ['YES', 'NO', 'NOT GIVEN'] : ['TRUE', 'FALSE', 'NOT GIVEN'];
  const qNum = q?.questionNumber || q?.q_num;
  const val = currentAnswer?.trim().toUpperCase() || '';

  return (
    <div className="flex items-center gap-1.5 shrink-0 select-none">
      {opts.map(opt => {
        const isSelected = val === opt;
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
    </div>
  );
}

export function IeltsBookletRenderer({
  htmlContent = '',
  answers = {},
  onAnswerChange,
  activeQuestionNum = null,
  flagged = {},
  className = '',
  questions = [],
}) {
  const containerRef = useRef(null);

  // Mount/Update DOM and bind interactive elements
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Convert any raw Markdown table syntax to clean HTML tables with answer-slots
    const tableConvertedHtml = convertMarkdownTablesToHtml(htmlContent || '');

    // Strip any duplicate static underline lines immediately preceding or succeeding answer slots
    const cleanedHtml = tableConvertedHtml
      .replace(/(?:_{2,}|\.{3,}|\[\s*(?:blank|_{1,}|\.{2,})\s*\])\s*(<span[^>]*class=["'][^"']*answer-slot[^"']*["'])/gi, '$1')
      .replace(/(<span[^>]*class=["'][^"']*answer-slot[^"']*["'][^>]*>.*?<\/span>)\s*(?:_{2,}|\.{3,}|\[\s*(?:blank|_{1,}|\.{2,})\s*\])/gi, '$1');

    if (container.dataset.renderedHtml !== cleanedHtml) {
      container.innerHTML = cleanedHtml;
      container.dataset.renderedHtml = cleanedHtml;
    }

    // 2. Locate all answer slots: .answer-slot or [data-question-num] or [data-q]
    const slotElements = container.querySelectorAll('.answer-slot, [data-question-num], [data-q]');

    slotElements.forEach((slot) => {
      const qNum = slot.getAttribute('data-question-num') || slot.getAttribute('data-q');
      if (!qNum) return;

      const currentVal = answers[qNum] !== undefined && answers[qNum] !== null ? String(answers[qNum]) : '';

      // Check if question is MATCHING_HEADINGS or options contain Roman numerals
      const q = questions.find(item => Number(item.questionNumber || item.q_num) === Number(qNum));
      const rawOptions = q ? (q.options || q.reference_box || q.referenceBox || []) : [];
      const isRoman = rawOptions.some(opt => /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(typeof opt === 'object' ? opt?.key : opt));
      const isHeadings = q && (q.type === 'MATCHING_HEADINGS' || q.category === 'MATCHING_HEADINGS' || isRoman);
      const isMatching = isHeadings || (q && (
        q.type === 'MATCHING' ||
        q.type === 'MATCHING_FEATURES' ||
        q.type === 'MATCHING_SENTENCE_ENDINGS' ||
        q.category === 'MATCHING' ||
        q.category === 'RESEARCHER_MATCH'
      ));

      if ((isHeadings || isMatching) && rawOptions.length > 0) {
        let select = slot.querySelector('select.ielts-select-slot');
        if (!select) {
          select = document.createElement('select');
          select.className = 'ielts-select-slot h-10 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-brand-500 max-w-xs';
          select.setAttribute('data-q', qNum);

          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = isHeadings ? 'Choose Heading...' : 'Choose Option...';
          select.appendChild(defaultOpt);

          rawOptions.forEach(opt => {
            const k = typeof opt === 'object' && opt !== null ? (opt.key || '') : String(opt);
            const l = typeof opt === 'object' && opt !== null ? (opt.label || opt.text || '') : '';
            const optEl = document.createElement('option');
            optEl.value = k;
            optEl.textContent = l ? `${k} - ${l}` : k;
            select.appendChild(optEl);
          });

          slot.innerHTML = '';
          slot.appendChild(select);
        }

        if (select.value !== currentVal) {
          select.value = currentVal;
        }

        select.onchange = (e) => {
          if (onAnswerChange) {
            onAnswerChange(Number(qNum), e.target.value);
          }
        };
        return;
      }

      // Check if question is YES/NO/NOT GIVEN or TRUE/FALSE/NOT GIVEN
      const isYNNG = q && (q.type === 'YES_NO_NOT_GIVEN' || q.category === 'YNNG' || /yes[\s\/]+no/i.test(q.instruction || '') || /claims of the writer/i.test(q.instruction || ''));
      const isTFNG = q && (q.type === 'TRUE_FALSE_NOT_GIVEN' || q.category === 'TFNG' || /true[\s\/]+false/i.test(q.instruction || ''));

      if (isYNNG || isTFNG) {
        const tfngOptions = isYNNG ? ['YES', 'NO', 'NOT GIVEN'] : ['TRUE', 'FALSE', 'NOT GIVEN'];
        let btnGroup = slot.querySelector('.ielts-tfng-buttons');
        if (!btnGroup) {
          btnGroup = document.createElement('div');
          btnGroup.className = 'ielts-tfng-buttons inline-flex items-center gap-1.5 my-1';

          tfngOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-tfng-val', opt);
            btn.className = `h-7 px-2.5 text-[11px] font-bold rounded transition-all cursor-pointer ${
              currentVal.trim().toUpperCase() === opt
                ? 'bg-brand-600 text-white shadow-xs font-black'
                : 'bg-white hover:bg-slate-50 border border-slate-300 text-slate-700'
            }`;
            btn.textContent = opt;
            btn.onclick = (e) => {
              e.preventDefault();
              if (onAnswerChange) onAnswerChange(Number(qNum), opt);
            };
            btnGroup.appendChild(btn);
          });

          slot.innerHTML = '';
          slot.appendChild(btnGroup);
        } else {
          // Sync button active states
          const btns = btnGroup.querySelectorAll('button[data-tfng-val]');
          btns.forEach(btn => {
            const bVal = btn.getAttribute('data-tfng-val');
            if (currentVal.trim().toUpperCase() === bVal) {
              btn.className = 'h-7 px-2.5 text-[11px] font-bold rounded transition-all cursor-pointer bg-brand-600 text-white shadow-xs font-black';
            } else {
              btn.className = 'h-7 px-2.5 text-[11px] font-bold rounded transition-all cursor-pointer bg-white hover:bg-slate-50 border border-slate-300 text-slate-700';
            }
          });
        }
        return;
      }

      // Check if this slot already has an input element
      let input = slot.querySelector('input.ielts-input-slot');
      if (!input && slot.tagName.toLowerCase() === 'input') {
        input = slot;
        input.classList.add('ielts-input-slot');
      }

      if (!input) {
        // Create an interactive input element
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'ielts-input-slot';
        input.setAttribute('data-q', qNum);
        input.placeholder = `(${qNum})`;
        input.autocomplete = 'off';
        input.spellcheck = false;

        // Replace content of slot
        slot.innerHTML = '';
        slot.appendChild(input);
      }

      // Sync value
      if (input.value !== currentVal) {
        input.value = currentVal;
      }

      // Update styling based on value and flags
      if (currentVal && currentVal.trim()) {
        input.classList.add('has-value');
      } else {
        input.classList.remove('has-value');
      }

      if (flagged && flagged[qNum]) {
        input.classList.add('border-amber-400', 'bg-amber-50');
      } else {
        input.classList.remove('border-amber-400', 'bg-amber-50');
      }

      // Attach event handler
      input.oninput = (e) => {
        const val = e.target.value;
        if (val && val.trim()) {
          input.classList.add('has-value');
        } else {
          input.classList.remove('has-value');
        }
        if (onAnswerChange) {
          onAnswerChange(Number(qNum), val);
        }
      };

      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          // Find next input slot
          const allInputs = Array.from(container.querySelectorAll('input.ielts-input-slot'));
          const curIdx = allInputs.indexOf(input);
          if (curIdx >= 0 && curIdx < allInputs.length - 1) {
            allInputs[curIdx + 1].focus();
          }
        }
      };
    });

    // 3. Locate all MCQ options: .ielts-mcq-option or [data-val]
    const mcqOptions = container.querySelectorAll('.ielts-mcq-option, [data-val]');
    mcqOptions.forEach((opt) => {
      const qNum = opt.getAttribute('data-q') || opt.getAttribute('data-question-num');
      const val = opt.getAttribute('data-val');
      if (!qNum || !val) return;

      const currentVal = answers[qNum] !== undefined && answers[qNum] !== null ? String(answers[qNum]).toUpperCase() : '';
      const isSelected = currentVal === val.toUpperCase();

      if (isSelected) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }

      opt.onclick = () => {
        if (onAnswerChange) {
          onAnswerChange(Number(qNum), val);
        }
      };
    });

  }, [htmlContent, answers, flagged, onAnswerChange, questions]);

  // Handle auto-focus / scrolling to active question
  useEffect(() => {
    if (!activeQuestionNum || !containerRef.current) return;
    const targetInput = containerRef.current.querySelector(
      `input[data-q="${activeQuestionNum}"], .answer-slot[data-question-num="${activeQuestionNum}"] input`
    );
    if (targetInput) {
      targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetInput.focus();
    }
  }, [activeQuestionNum]);

  if (!htmlContent) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Booklet transcription is being prepared...
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`ielts-booklet-content prose prose-slate max-w-none text-slate-900 ${className}`}
    />
  );
}
