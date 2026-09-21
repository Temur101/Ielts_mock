import React, { useEffect, useRef } from 'react';

/**
 * IeltsBookletRenderer
 * 
 * Renders authentic Cambridge IELTS booklet HTML (with .pdf-exact-box, tables, instructions)
 * and dynamically converts .answer-slot markers into interactive inputs so candidates
 * can type their answers directly inside the reproduced layout.
 */
export function IeltsBookletRenderer({
  htmlContent = '',
  answers = {},
  onAnswerChange,
  activeQuestionNum = null,
  flagged = {},
  className = '',
}) {
  const containerRef = useRef(null);

  // Mount/Update DOM and bind interactive elements
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. If HTML content is not yet injected or changed, set it
    // Strip any duplicate static underline lines immediately preceding or succeeding answer slots
    const cleanedHtml = (htmlContent || '')
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

  }, [htmlContent, answers, flagged, onAnswerChange]);

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
