/**
 * IELTS Question Normalization, Instruction Grouping, and Prompt Cleaning Utilities
 *
 * Enforces official Cambridge IELTS examination standards:
 * 1. Unified group instructions rendered ONCE per question block (no repeating above items).
 * 2. Static reference boxes (words / actions / researchers / options) displayed in 2/3-column grids.
 * 3. Manual single-letter inputs (Form A: w-12 h-10 right-aligned; Form B: w-11 h-8 inline in summary flow).
 * 4. Strips duplicated instruction headers and question number prefixes from item prompts.
 */

/**
 * Normalizes any reference box format into an array of { key: string, label: string }
 */
export function normalizeReferenceBox(rawRefBox, fallbackOptions = []) {
  const result = [];
  const seenKeys = new Set();

  const addEntry = (key, label) => {
    const k = String(key || '').trim().toUpperCase();
    const l = String(label || '').trim();
    if (!k) return;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      result.push({ key: k, label: l });
    }
  };

  if (Array.isArray(rawRefBox) && rawRefBox.length > 0) {
    rawRefBox.forEach((item, idx) => {
      if (typeof item === 'object' && item !== null) {
        const k = item.key || item.letter || item.code || String.fromCharCode(65 + idx);
        const l = item.label || item.text || item.value || item.name || '';
        addEntry(k, l);
      } else if (typeof item === 'string') {
        const m = item.match(/^\[?([A-Z0-9ivxlcdm]+)\]?[\.\:\s\-]\s*(.*)$/i);
        if (m) {
          addEntry(m[1], m[2]);
        } else {
          addEntry(String.fromCharCode(65 + idx), item);
        }
      }
    });
  }

  // If no reference box but fallback options exist with labels (e.g. ["A accommodation", "B investment", ...])
  if (result.length === 0 && Array.isArray(fallbackOptions) && fallbackOptions.length > 0) {
    fallbackOptions.forEach((opt, idx) => {
      if (typeof opt === 'string') {
        const m = opt.match(/^\[?([A-Z0-9ivxlcdm]+)\]?[\.\:\s\-]\s*(.*)$/i);
        if (m && m[2].trim()) {
          addEntry(m[1], m[2]);
        }
      }
    });
  }

  return result;
}

/**
 * Strips group instructions from individual question prompts.
 * Returns { instruction: string, cleanPrompt: string }
 */
export function extractInstructionAndPrompt(rawPrompt = '', rawInstruction = '', qNum = null) {
  let instruction = (rawInstruction || '').trim();
  let prompt = (rawPrompt || '').trim();

  // 1. Detect if prompt starts with an instruction header
  const headerMatch = prompt.match(/^(Questions?\s+\d+\s*[\-–]\s*\d+[\s\S]*?(?:below|box|passage|each|statements?|following|information|letter|summary)[\.\:\n]*)\s*(.*)$/i);

  if (headerMatch) {
    if (!instruction) {
      instruction = headerMatch[1].trim();
    }
    prompt = headerMatch[2].trim();
  }

  // 2. Strip leading question number like "15." or "15)" or "15 -"
  prompt = prompt.replace(/^\(?\d+\)?[\.\:\)\s\-]+/, '').trim();

  // 3. If prompt is identical to instruction, clear prompt
  if (prompt && instruction && prompt.toLowerCase() === instruction.toLowerCase()) {
    prompt = '';
  }

  if (!prompt && qNum) {
    prompt = `Question ${qNum}`;
  }

  return { instruction, cleanPrompt: prompt };
}

/**
 * Strips gap placeholders (underscores, dots, [blank], {{N}}, {{q_num}}, [q_num], @[q_num], [#q_num], [ ])
 * from text so they don't appear adjacent to input fields.
 */
export function cleanGapArtifacts(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\]|\))|\[\s*\]|\(\s*\)|_{2,}|\.{2,}/gi, '')
    .replace(/(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?/gi, '')
    .trim();
}

/**
 * Splits a sentence with a gap into { before, after, hasGap }.
 * Supports underscores, dots, bracketed tokens, prefixed tokens (@[q_num], [#q_num], {{@q_num}}),
 * empty brackets ([ ]), and {{q_num}} / {{N}} placeholders.
 */
export function splitSentenceAtGap(text) {
  if (!text || typeof text !== 'string') return { before: '', after: '', hasGap: false };
  const str = text.trim();
  const gapMatch = str.match(/(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\]|\))|\[\s*\]|\(\s*\)|_{2,}|\.{2,}/i);
  if (gapMatch && gapMatch.index !== undefined) {
    const before = cleanGapArtifacts(str.slice(0, gapMatch.index));
    const after = cleanGapArtifacts(str.slice(gapMatch.index + gapMatch[0].length));
    return { before, after, hasGap: true };
  }
  return { before: cleanGapArtifacts(str), after: '', hasGap: false };
}

/**
 * Determines the specific question block category
 */
export function determineQuestionCategory(q, hasRefBox = false) {
  const type = String(q.type || '').toUpperCase();
  const textStr = `${q.instruction || ''} ${q.prompt || ''} ${q.text || ''} ${q.title || ''}`.toLowerCase();

  if (type === 'TRUE_FALSE_NOT_GIVEN' || type === 'YES_NO_NOT_GIVEN' || /true[\s\/]+false/i.test(textStr) || /yes[\s\/]+no/i.test(textStr)) {
    return 'TFNG';
  }

  // Flow chart completion
  if (
    type === 'FLOW_CHART' ||
    type === 'FLOW_CHART_MATCHING' ||
    type === 'FLOW_CHART_COMPLETION' ||
    type.includes('FLOW') ||
    /flow[\s\-]*chart/i.test(textStr)
  ) {
    return 'FLOW_CHART';
  }

  if (type === 'SUMMARY_MATCHING' || /complete the summary/i.test(textStr) || /list of words/i.test(textStr)) {
    return 'SUMMARY_MATCHING';
  }

  if (type === 'NOTES_COMPLETION' || type === 'TABLE_COMPLETION' || type === 'DIAGRAM_LABEL' || /complete the notes/i.test(textStr) || /complete the table/i.test(textStr) || q.notes_template) {
    return 'NOTES';
  }

  if (
    type === 'MATCHING' ||
    type === 'MATCHING_HEADINGS' ||
    type === 'MATCHING_FEATURES' ||
    type === 'MATCHING_INFO' ||
    hasRefBox ||
    /choose.*from the box/i.test(textStr) ||
    /which paragraph contains/i.test(textStr) ||
    /choose the correct paragraph/i.test(textStr)
  ) {
    return 'MATCHING';
  }

  if (type === 'MULTIPLE_CHOICE' || (Array.isArray(q.options) && q.options.length >= 2)) {
    return 'MULTIPLE_CHOICE';
  }

  return 'FILL_BLANK';
}

/**
 * Normalizes template strings for gap-fill / notes / summaries:
 * 1. Sequentially replaces any prefixed tokens ({{q_num}}, @[q_num], [#q_num], {{@q_num}}, [q_num], [blank], [1], [31])
 *    or empty brackets ([ ]) with actual question numbers from questions array.
 * 2. Normalizes [1], [2] to {{1}}, {{2}}.
 * 3. Replaces standalone blank lines (_{2,} or .{3,}) with sequential {{N}} for remaining unassigned questions.
 * 4. Cleans up duplicate underline/dots artifacts adjacent to {{N}}.
 */
export function normalizeTemplateGaps(template, questions = []) {
  if (!template || typeof template !== 'string') return '';

  const qList = Array.isArray(questions) ? questions : [];
  const qNums = qList
    .map(q => Number(q.questionNumber || q.q_num))
    .filter(n => !isNaN(n) && n > 0);

  // If no questions list provided, detect explicit numbers from the template
  if (qNums.length === 0) {
    const existing = template.match(/\{\{(\d+)\}\}|\[(\d+)\]/g);
    if (existing && existing.length > 0) {
      existing.forEach(t => {
        const n = Number(t.replace(/[^\d]/g, ''));
        if (!isNaN(n) && n > 0 && !qNums.includes(n)) {
          qNums.push(n);
        }
      });
    }
  }

  let assignIdx = 0;
  const nextQNum = () => {
    if (assignIdx < qNums.length) {
      return qNums[assignIdx++];
    }
    const lastNum = qNums[qNums.length - 1] || 0;
    return lastNum + (++assignIdx - qNums.length);
  };

  // 1. Pre-normalize empty brackets [ ] or ( ) into [q_num]
  let normalized = template.replace(/\[\s*\]|\(\s*\)/g, '[q_num]');

  // 2. Sequentially replace any prefixed token (@[q_num], [#q_num], {{@q_num}}, [q_num], [blank], [1], [31], etc.)
  // with sequential {{N}} placeholders from questions array
  normalized = normalized.replace(
    /(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\]|\))/gi,
    () => `{{${nextQNum()}}}`
  );

  // 3. If there are still unassigned questions in qNums, replace standalone blank lines (_{2,} or .{3,})
  normalized = normalized.replace(/(_{2,}|\.{3,})(?!\s*\{\{\d+\}\})(?<!\{\{\d+\}\}\s*)/g, (match) => {
    if (assignIdx < qNums.length) {
      return `{{${nextQNum()}}}`;
    }
    return match;
  });

  // 4. Purge static placeholder underlines, dots, and option brackets (e.g. [A-J]) adjacent to {{N}}
  normalized = normalized
    .replace(/(?:_{2,}|\.{2,}|\[\s*(?:blank|_{1,}|\.{2,})\s*\]|\(\s*(?:blank|_{1,}|\.{2,})\s*\))\s*(\{\{\d+\}\})/gi, '$1')
    .replace(/(\{\{\d+\}\})\s*(?:_{2,}|\.{2,}|\[\s*(?:blank|_{1,}|\.{2,})\s*\]|\(\s*(?:blank|_{1,}|\.{2,})\s*\))/gi, '$1')
    .replace(/(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?\s*(\{\{\d+\}\})/gi, '$1')
    .replace(/(\{\{\d+\}\})\s*(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?/gi, '$1');

  return normalized;
}

/**
 * Groups consecutive questions into unified instruction blocks:
 * - Extracts and deduplicates group instruction (rendered once at top of container)
 * - Associates static reference box (rendered once below instruction, above questions)
 * - Categorizes block into 'MATCHING', 'SUMMARY_MATCHING', 'MULTIPLE_CHOICE', 'TFNG', 'NOTES', 'FLOW_CHART', 'FILL_BLANK'
 */
export function groupQuestionsIntoSets(questions = [], partOrPassageRefBox = null) {
  if (!questions || questions.length === 0) return [];

  // Strictly sort questions ascending by questionNumber to guarantee chronological sequence
  const sortedQuestions = [...questions].sort(
    (a, b) => Number(a.questionNumber || a.q_num || 0) - Number(b.questionNumber || b.q_num || 0)
  );

  const defaultRefBox = normalizeReferenceBox(partOrPassageRefBox);
  const groups = [];
  let currentGroup = null;

  sortedQuestions.forEach((q, idx) => {
    const qNum = Number(q.questionNumber || q.q_num || idx + 1);
    const { instruction: extractedInst, cleanPrompt } = extractInstructionAndPrompt(
      q.prompt || q.text || '', 
      q.instruction || '', 
      qNum
    );

    // Question-level or shared reference box
    const qRefBoxRaw = q.reference_box || q.referenceBox || null;
    const normQRefBox = normalizeReferenceBox(qRefBoxRaw, q.options);
    const hasQRef = normQRefBox.length > 0;
    const effectiveRefBox = hasQRef ? normQRefBox : defaultRefBox;

    const category = determineQuestionCategory(q, effectiveRefBox.length > 0);

    const questionItem = {
      ...q,
      questionNumber: qNum,
      cleanPrompt: cleanPrompt || `Question ${qNum}`,
      category,
      effectiveRefBox,
    };

    let isNewGroup = false;

    if (!currentGroup) {
      isNewGroup = true;
    } else {
      const categoryChanged = currentGroup.category !== category;

      const isDualContinuation = 
        currentGroup.category === 'MULTIPLE_CHOICE' &&
        category === 'MULTIPLE_CHOICE' &&
        (qNum === currentGroup.endQ + 1) &&
        (currentGroup.questions.length % 2 === 1 || 
         /choose.*two|which two|two options|two letters|select two/i.test(`${currentGroup.instruction} ${questionItem.cleanPrompt}`));

      const instructionChanged = !isDualContinuation && extractedInst && extractedInst !== currentGroup.instruction;
      
      const currentRefKeys = currentGroup.referenceBox.map(r => r.key).join(',');
      const thisRefKeys = effectiveRefBox.map(r => r.key).join(',');
      const refBoxChanged = currentRefKeys !== thisRefKeys && (effectiveRefBox.length > 0 || currentGroup.referenceBox.length > 0);

      if ((categoryChanged || instructionChanged || refBoxChanged) && !isDualContinuation) {
        isNewGroup = true;
      }
    }

    if (isNewGroup) {
      if (currentGroup) {
        currentGroup.endQ = currentGroup.questions[currentGroup.questions.length - 1].questionNumber;
        currentGroup.qRange = currentGroup.startQ === currentGroup.endQ
          ? `Question ${currentGroup.startQ}`
          : `Questions ${currentGroup.startQ}–${currentGroup.endQ}`;
        groups.push(currentGroup);
      }

      let groupInstruction = extractedInst;
      if (!groupInstruction) {
        if (category === 'TFNG') {
          groupInstruction = 'Do the following statements agree with the information given in the text? Choose TRUE, FALSE, or NOT GIVEN.';
        } else if (category === 'SUMMARY_MATCHING') {
          groupInstruction = 'Complete the summary using the list of words below. Write the correct letter, A–J, in the spaces provided.';
        } else if (category === 'FLOW_CHART') {
          groupInstruction = 'Complete the flow-chart below. Write the correct letter or words in the spaces provided.';
        } else if (category === 'MATCHING') {
          if (effectiveRefBox.length > 0) {
            groupInstruction = 'Look at the following items and the list of options below. Match each item with the correct option.';
          } else {
            groupInstruction = 'Match each item with the correct letter from the options.';
          }
        } else if (category === 'MULTIPLE_CHOICE') {
          groupInstruction = 'Choose the correct letter, A, B, C, or D.';
        } else if (category === 'NOTES') {
          groupInstruction = 'Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer.';
        } else {
          groupInstruction = 'Answer the questions below. Write your answers in the spaces provided.';
        }
      }

      currentGroup = {
        id: `group-${qNum}`,
        startQ: qNum,
        endQ: qNum,
        qRange: `Question ${qNum}`,
        instruction: groupInstruction,
        title: q.title || '',
        subheading: q.subheading || '',
        summaryTemplate: q.summary_template || q.notes_template || null,
        category,
        referenceBox: effectiveRefBox,
        questions: [questionItem],
      };
    } else {
      if (!currentGroup.title && q.title) {
        currentGroup.title = q.title;
      }
      if (!currentGroup.summaryTemplate && (q.summary_template || q.notes_template)) {
        currentGroup.summaryTemplate = q.summary_template || q.notes_template;
      }
      currentGroup.questions.push(questionItem);
    }
  });

  if (currentGroup) {
    currentGroup.endQ = currentGroup.questions[currentGroup.questions.length - 1].questionNumber;
    currentGroup.qRange = currentGroup.startQ === currentGroup.endQ
      ? `Question ${currentGroup.startQ}`
      : `Questions ${currentGroup.startQ}–${currentGroup.endQ}`;
    
    if (currentGroup.instruction && !currentGroup.instruction.startsWith('Questions') && !currentGroup.instruction.startsWith('Question')) {
      currentGroup.instruction = `${currentGroup.qRange}: ${currentGroup.instruction}`;
    }
    groups.push(currentGroup);
  }

  return groups;
}
