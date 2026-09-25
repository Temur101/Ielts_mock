/**
 * IELTS Question Normalization, Instruction Grouping, and Prompt Cleaning Utilities
 *
 * Enforces official Cambridge IELTS examination standards:
 * 1. Unified group instructions rendered ONCE per question block (no repeating above items).
 * 2. Static reference boxes (words / actions / researchers / options) displayed in 2/3-column grids.
 * 3. Manual single-letter inputs (Form A: w-12 h-10 right-aligned; Form B: w-11 h-8 inline in summary flow).
 * 4. Strips duplicated instruction headers and question number prefixes from item prompts.
 */

export const isRoman = (str) => {
  const s = String(str || '').trim().toLowerCase();
  return /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/.test(s);
};

export const isValidOptionKey = (str) => {
  if (!str) return false;
  const s = String(str).trim();
  // a) Single latin letter: ^[A-Za-z]$
  if (/^[A-Za-z]$/.test(s)) return true;
  // b) Number from 1 to 99: ^(?:[1-9]|[1-9][0-9])$
  if (/^(?:[1-9]|[1-9][0-9])$/.test(s)) return true;
  // c) Short roman numeral i-xii: ^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$
  if (isRoman(s)) return true;
  return false;
};

/**
 * Extracts a valid IELTS option key prefix from a string if present.
 * Valid keys: single letter (A-Z), number 1-99, or roman numeral (i-xii).
 * Requires explicit delimiters: brackets [A], (A) or punctuation A., A), A:, A -
 * or single letter / roman numeral / number followed by whitespace.
 * Words of 3+ letters without delimiters are strictly NOT treated as keys.
 */
export const extractKeyPrefix = (str) => {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  if (!s) return null;

  // 1. Bracketed or parenthesized key: [A], (A), [1], (i), [iv]
  const bracketMatch = s.match(/^\[\s*([A-Za-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|v|x|i))\s*\][\.\:\)\-\–\—\s]*(.*)$/i);
  if (bracketMatch) {
    return { key: bracketMatch[1].trim(), label: bracketMatch[2].trim() };
  }
  const parenMatch = s.match(/^\(\s*([A-Za-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|v|x|i))\s*\)[\.\:\-\–\—\s]*(.*)$/i);
  if (parenMatch) {
    return { key: parenMatch[1].trim(), label: parenMatch[2].trim() };
  }

  // 2. Unbracketed with explicit punctuation delimiter (., :, ), -, –)
  const punctMatch = s.match(/^([A-Za-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|v|x|i))[\.\:\)\-\–\—]+[\s]*(.*)$/i);
  if (punctMatch) {
    return { key: punctMatch[1].trim(), label: punctMatch[2].trim() };
  }

  // 3. Single letter, number 1-99, or roman numeral followed by whitespace: e.g. "A accommodation", "B transport"
  // Words with 3+ letters are strictly disallowed unless recognized roman numerals
  const spaceMatch = s.match(/^([A-Za-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|v|x|i))\s+(.*)$/i);
  if (spaceMatch) {
    const candidate = spaceMatch[1].trim();
    if (isValidOptionKey(candidate)) {
      return { key: candidate, label: spaceMatch[2].trim() };
    }
  }

  return null;
};

export const hasExplicitKeyPrefix = (str) => {
  if (!str) return false;
  const s = String(str).trim();
  if (isValidOptionKey(s)) return true;
  if (/^\[?option\s+([A-Za-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|v|x|i))\]?$/i.test(s)) return true;
  if (/^[\[\(]\s*([A-Za-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|v|x|i))\s*[\]\)][\.\:\)\-\–\—\s]*/i.test(s)) return true;
  if (/^([A-Za-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|v|x|i))[\.\:\)\-\–\—]+[\s]*/i.test(s)) return true;
  if (/^([B-Zb-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii))\s+/i.test(s)) return true;
  return false;
};

/**
 * Normalizes any reference box format into an array of { key: string, label: string }
 */
export function normalizeReferenceBox(rawRefBox, fallbackOptions = [], instruction = '') {
  const result = [];
  const seenKeys = new Set();

  const isPlaceholderLabel = (label, key) => {
    if (!label) return true;
    const l = String(label).trim().toLowerCase();
    const k = String(key || '').trim().toLowerCase();
    return l === k || l === `option ${k}` || l === `option ${k}.` || /^option\s+[a-z0-9]+$/i.test(l) || /^heading\s+[ivxlcdm]+$/i.test(l);
  };

  const addEntry = (key, label, shouldStripPrefix = true) => {
    let rawK = String(key || '').trim();
    let l = String(label || '').trim();

    if (shouldStripPrefix) {
      const prefixMatch = extractKeyPrefix(l);
      if (prefixMatch) {
        const pref = prefixMatch.key;
        if (!rawK && isValidOptionKey(pref)) {
          rawK = pref;
        }
        if (rawK && pref.toLowerCase() === rawK.toLowerCase()) {
          l = prefixMatch.label;
        }
      }
    }

    if (!isValidOptionKey(rawK)) return;

    // If key is a roman numeral (i, ii, iii, iv, v...), save it in lowercase as-is; otherwise uppercase
    const k = isRoman(rawK) ? rawK.toLowerCase() : rawK.toUpperCase();

    if (isPlaceholderLabel(l, k)) {
      l = '';
    }

    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      result.push({ key: k, label: l });
    } else if (l) {
      const existing = result.find(r => r.key === k);
      if (existing && (!existing.label || isPlaceholderLabel(existing.label, k))) {
        existing.label = l;
      }
    }
  };

  const processList = (list) => {
    if (!Array.isArray(list) || list.length === 0) return;

    // Check if any item in the list has an explicit valid key
    const hasExplicitKeys = list.some(item => {
      if (!item) return false;
      if (typeof item === 'object') {
        const k = item.key || item.letter || item.code;
        if (isValidOptionKey(k)) return true;
        const text = item.label || item.text || item.value || item.name || '';
        return hasExplicitKeyPrefix(text);
      }
      if (typeof item === 'string') {
        return hasExplicitKeyPrefix(item);
      }
      return false;
    });

    list.forEach((item, idx) => {
      if (!item) return;

      if (typeof item === 'object') {
        let k = item.key || item.letter || item.code || '';
        let l = item.label || item.text || item.value || item.name || item.word || item.phrase || item.description || '';

        // If k is not a valid key, it belongs to the label
        if (k && !isValidOptionKey(k)) {
          l = l ? `${k} ${l}` : String(k);
          k = '';
        }

        if (hasExplicitKeys) {
          const prefMatch = extractKeyPrefix(l);
          if (prefMatch) {
            if (!k) k = prefMatch.key;
            if (k && k.toLowerCase() === prefMatch.key.toLowerCase()) {
              l = prefMatch.label;
            }
          }
        }

        if (!k || !isValidOptionKey(k)) {
          k = isRoman(item.key) ? String(item.key).toLowerCase() : String.fromCharCode(65 + idx);
        }

        addEntry(k, l, hasExplicitKeys);
      } else if (typeof item === 'string') {
        const str = item.trim();
        if (!str) return;

        if (hasExplicitKeys) {
          const prefMatch = extractKeyPrefix(str);
          if (prefMatch) {
            addEntry(prefMatch.key, prefMatch.label, true);
            return;
          }
          if (isValidOptionKey(str)) {
            addEntry(str, '', false);
            return;
          }
          const optMatch = str.match(/^\[?option\s+([A-Za-z]|\d{1,2}|(?:xii|viii|vii|iii|xi|ix|vi|iv|ii|v|x|i))\]?$/i);
          if (optMatch) {
            addEntry(optMatch[1], '', false);
            return;
          }
        }

        // When list has no explicit keys or item is a sentence without key:
        // Automatically assign sequential letter key A, B, C... and keep the entire sentence as label
        addEntry(String.fromCharCode(65 + idx), str, false);
      }
    });
  };

  if (Array.isArray(rawRefBox) && rawRefBox.length > 0) {
    processList(rawRefBox);
  }

  // If no reference box or some items lack labels, inspect fallbackOptions
  if (Array.isArray(fallbackOptions) && fallbackOptions.length > 0) {
    processList(fallbackOptions);
  }

  // If result is empty, check instruction for letter ranges (e.g. "A-K", "A–G", "A to F")
  let instText = typeof instruction === 'string' ? instruction : '';
  if (!instText && typeof fallbackOptions === 'string') {
    instText = fallbackOptions;
  }
  if (result.length === 0 && instText) {
    const rangeMatch = instText.match(/\b([A-Z])\s*(?:[-–—]|to)\s*([A-Z])\b/i);
    if (rangeMatch) {
      const startCode = rangeMatch[1].toUpperCase().charCodeAt(0);
      const endCode = rangeMatch[2].toUpperCase().charCodeAt(0);
      if (endCode >= startCode && endCode - startCode <= 20) {
        for (let code = startCode; code <= endCode; code++) {
          addEntry(String.fromCharCode(code), '', false);
        }
      }
    }
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

  // 1. Очищаем текст group instruction от склеенных инструкций нескольких диапазонов
  if (instruction && instruction.includes('Questions')) {
    const cleanInstSections = instruction.split(/(?=Questions?\s+\d+\s*[\-–—]\s*\d+)/i).filter(s => s.trim());
    if (cleanInstSections.length > 1 && qNum !== null) {
      const matchingInst = cleanInstSections.find(s => {
        const m = s.match(/Questions?\s+(\d+)\s*[\-–—]\s*(\d+)/i);
        if (!m) return false;
        const start = parseInt(m[1], 10);
        const end = parseInt(m[2], 10);
        return qNum >= start && qNum <= end;
      });
      if (matchingInst) {
        instruction = matchingInst.trim();
      }
    }
  }

  // 2. Очищаем текст prompt от склеенных инструкций чужих диапазонов
  if (prompt.includes('Questions') || prompt.includes('Choose the correct')) {
    const cleanSections = prompt.split(/(?=Questions?\s+\d+\s*[\-–—]\s*\d+)/i).filter(s => s.trim());
    if (cleanSections.length > 1 && qNum !== null) {
      const matchingSection = cleanSections.find(s => {
        const m = s.match(/Questions?\s+(\d+)\s*[\-–—]\s*(\d+)/i);
        if (!m) return false;
        const start = parseInt(m[1], 10);
        const end = parseInt(m[2], 10);
        return qNum >= start && qNum <= end;
      });
      if (matchingSection) {
        prompt = matchingSection.trim();
      }
    }
  }

  // 3. Отделяем заголовок инструкции от самого вопроса
  const headerMatch = prompt.match(/^(Questions?\s+\d+\s*[\-–—]\s*\d+[\s\S]*?(?:below|box|passage|each|statements?|following|information|letter|summary)[\.\:\n]*)\s*(.*)$/i);
  if (headerMatch) {
    if (!instruction) {
      instruction = headerMatch[1].trim();
    }
    prompt = headerMatch[2].trim();
  }

  // 4. Удаляем дублирующиеся номера вопросов в начале строки (например, "11.", "11)", "11 -")
  prompt = prompt.replace(/^\(?\d+\)?[\.\:\)\s\-]+/, '').trim();

  // 5. Если текст вопроса полностью совпадает с инструкцией, очищаем его
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
    // Purge any gap tokens ({{N}}, [q_num], @[q_num], [#q_num], [blank], etc.)
    .replace(/(?:\{\{|\@?\[)(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\])|\((?:(?:\#|\@)?(?:q_num|blank)|(?:[1-3]?\d|40))\)/gi, '')
    // Purge disconnected empty bracket spans [ ] or ( )
    .replace(/\[\s*\]|\(\s*\)/g, '')
    // Purge option range brackets e.g. [A-J]
    .replace(/(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?/gi, '')
    // Purge multiple underscores or ellipses (e.g. ____, ..., .......)
    .replace(/(?:_{2,}|\.{2,})+/g, '')
    // Purge single underscores that were artifacts of blanks
    .replace(/(?:^|\s)_{1,}(?:\s|$)/g, ' ')
    // Purge lingering empty brackets
    .replace(/\[\s*\]/g, '')
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
  const gapMatch = str.match(/(?:\{\{|\@?\[)(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\])|\((?:(?:\#|\@)?(?:q_num|blank)|(?:[1-3]?\d|40))\)|\[\s*\]|\(\s*\)|_{2,}|\.{2,}/i);
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
  if (!q) return 'FILL_BLANK';

  const rawType = String(q.type || '').toUpperCase();

  // 1. Strict dispatch by normalized q.type (Single Source of Truth from AI parser)
  if (rawType === 'MATCHING_HEADINGS') return 'MATCHING_HEADINGS';
  if (rawType === 'MATCHING_FEATURES') return 'MATCHING_FEATURES';
  if (rawType === 'MATCHING_INFORMATION' || rawType === 'MATCHING_INFO') return 'MATCHING_INFORMATION';
  if (rawType === 'MATCHING' || rawType === 'MATCHING_SENTENCE_ENDINGS') return 'MATCHING';
  if (rawType === 'TABLE_COMPLETION') return 'TABLE_COMPLETION';
  if (rawType === 'FORM_COMPLETION') return 'FORM_COMPLETION';
  if (rawType === 'SUMMARY_COMPLETION') return 'SUMMARY_COMPLETION';
  if (rawType === 'SUMMARY_MATCHING') return 'SUMMARY_MATCHING';
  if (rawType === 'TRUE_FALSE_NOT_GIVEN') return 'TFNG';
  if (rawType === 'YES_NO_NOT_GIVEN') return 'YNNG';
  if (rawType === 'MAP_LABELLING' || rawType === 'MAP_LABELING' || rawType === 'DIAGRAM_LABEL') return 'MAP_DIAGRAM_LABELING';

  const fullText = `${q.instruction || ''} ${q.prompt || ''} ${q.text || ''}`.toLowerCase();
  const cleanPromptOnly = `${q.prompt || ''} ${q.text || ''}`.toLowerCase();

  const isExplicitMatching =
    rawType === 'MATCHING' ||
    rawType.startsWith('MATCHING_') ||
    rawType === 'RESEARCHER_MATCH' ||
    rawType === 'PARA_MATCH';

  const hasArrowsInPrompt = /[\u2190-\u2199\u21D0-\u21D9]|(?:->|-->|=>|→|↓)/.test(cleanPromptOnly);
  const hasFlowInPrompt = /\b(?:flow[\s\-]?chart|flowchart)\b/i.test(cleanPromptOnly);
  const isStrictFlowType =
    rawType === 'FLOW_CHART' ||
    rawType === 'FLOW_CHART_COMPLETION' ||
    rawType === 'FLOW_CHART_MATCHING' ||
    rawType.includes('FLOW_CHART') ||
    rawType.includes('FLOWCHART');

  // PRIORITY CHECK: FLOW_CHART
  // Must execute BEFORE matching checks ("from the box", etc.) so that flow charts
  // with "Choose answers from the box" are strictly categorized as FLOW_CHART!
  // CRITICAL: If the question has an explicit MATCHING type, do NOT assign FLOW_CHART
  // merely due to "flow-chart" in shared instruction! FLOW_CHART should be assigned
  // strictly when graphic arrows are present in prompt, or if type is strictly FLOW_CHART,
  // or if "flow-chart" is present in the individual question prompt.
  const isFlowChart =
    isStrictFlowType ||
    hasArrowsInPrompt ||
    hasFlowInPrompt ||
    (!isExplicitMatching && (
      /\b(?:flow[\s\-]?chart|flowchart|cycle)\b/i.test(fullText) &&
      (hasArrowsInPrompt || /(?:^|\b)(?:stage|step|phase)\s*\d+/i.test(cleanPromptOnly) || /[\u2190-\u2199\u21D0-\u21D9]|(?:->|-->|=>|→|↓)/.test(fullText))
    ));

  if (isFlowChart) {
    return 'FLOW_CHART';
  }

  const rawRef = q.reference_box || q.referenceBox || [];
  const hasExplicitRef = Array.isArray(rawRef) && rawRef.length > 0;
  const hasManyOptions = Array.isArray(q.options) && q.options.length >= 3;

  const isDualOrMulti = Boolean(
    q.multiSelect ||
    q.isDual ||
    rawType === 'MULTIPLE_CHOICE_MULTI' ||
    /choose\s+(?:two|three|2|3)|which\s+(?:two|three|2|3)|select\s+(?:two|three|2|3)/i.test(q.instruction || '')
  );

  // 1. Explicit MULTIPLE_CHOICE check (MUST execute BEFORE hasMatchingKeywords)
  if (rawType === 'MULTIPLE_CHOICE' || rawType === 'MULTIPLE_CHOICE_MULTI') {
    return isDualOrMulti ? 'MULTIPLE_CHOICE_MULTI' : 'MULTIPLE_CHOICE';
  }

  // If question has standard 2-4 options and lacks attached reference box or "from the box",
  // it is strictly multiple choice and must NEVER be converted to MATCHING
  const hasStandardMCOptions = Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4;
  const hasFromBox = /from the box/i.test(fullText);
  if (hasStandardMCOptions && !hasExplicitRef && !hasRefBox && !hasFromBox) {
    return isDualOrMulti ? 'MULTIPLE_CHOICE_MULTI' : 'MULTIPLE_CHOICE';
  }

  // Check matching keywords in instruction or prompt (e.g. Listening "Choose FOUR answers from the box")
  // Cleaned regex: removed broad phrase "write the correct letter"
  const hasMatchingKeywords = /from the box|match each|which activity will people do|what problem do the speakers identify|choose\s+(?:four|five|six|seven|\d+)\s+answers\s+from/i.test(fullText);

  // If instruction contains matching keywords ("from the box", "match each", etc.) and not a dual/multi-select,
  // force MATCHING category so options are rendered once in referenceBox + compact matching row,
  // preventing duplicate sheets of buttons under every question.
  if (!isDualOrMulti && hasMatchingKeywords && (hasManyOptions || hasExplicitRef || hasRefBox)) {
    return 'MATCHING';
  }

  if (rawType === 'NOTES_COMPLETION') return 'NOTES';
  if (rawType === 'MATCHING' || rawType === 'MATCHING_SENTENCE_ENDINGS') return 'MATCHING';

  // 2. Reserve fallback ONLY if rawType did not match any canonical type above (e.g. empty, undefined, or generic 'FILL_BLANK')
  const refHasRoman = Array.isArray(rawRef) && rawRef.some(item => {
    const key = typeof item === 'object' && item !== null ? (item.key || item.letter || '') : String(item);
    return isRoman(key);
  });

  const optsHaveRoman = Array.isArray(q.options) && q.options.some(item => {
    const str = typeof item === 'object' && item !== null ? (item.key || item.letter || item.value || item.label || '') : String(item);
    const m = str.match(/^\[?([a-z0-9]+)\]?/i);
    const token = m ? m[1] : str;
    return isRoman(token);
  });

  const hasRomanInRefOrOpts = refHasRoman || optsHaveRoman;
  if (hasRomanInRefOrOpts) {
    return 'MATCHING_HEADINGS';
  }

  const hasLettersInRefOrOpts = (Array.isArray(rawRef) && rawRef.some(item => {
    const key = typeof item === 'object' && item !== null ? (item.key || item.letter || '') : String(item);
    return /^[A-Z]$/i.test(String(key).trim()) && !/^(i|v|x)$/i.test(String(key).trim());
  })) || (Array.isArray(q.options) && q.options.some(item => {
    const key = typeof item === 'object' && item !== null ? (item.key || item.letter || item.value || '') : String(item);
    const m = String(key).match(/^\[?([A-Za-z0-9ivxlcdm]+)\]?/i);
    const token = m ? m[1] : key;
    return /^[A-Z]$/i.test(String(token).trim()) && !/^(i|v|x)$/i.test(String(token).trim());
  }));

  const isPeopleOrExperts = /researcher|scientist|expert|person|people|theory|theorist|author|finding|invention|investigator/i.test(fullText);

  // Question cannot be MATCHING_HEADINGS ONLY if it explicitly has letter options (A, B, C...) or matches statements with people/experts
  const cannotBeHeadings = hasLettersInRefOrOpts || isPeopleOrExperts;

  // Check heading instruction: /heading/i in q.instruction or /list of headings/i in fullText
  const isHeadingInstruction = /heading/i.test(q.instruction || '') || /list of headings/i.test(fullText);

  if (!cannotBeHeadings && isHeadingInstruction) {
    return 'MATCHING_HEADINGS';
  }

  if (isPeopleOrExperts && (hasLettersInRefOrOpts || hasExplicitRef || hasRefBox)) {
    return 'MATCHING_FEATURES';
  }

  const promptOnly = `${q.prompt || ''} ${q.text || ''}`.toLowerCase();
  const hasFlowArrowOrStep = /[\u2190-\u2199\u21D0-\u21D9]|(?:->|-->|=>)|(?:^|\b)(?:stage|step|phase)\s*\d+/i.test(promptOnly);
  if (hasFlowArrowOrStep) {
    return 'FLOW_CHART';
  }

  const textStr = `${q.instruction || ''} ${q.prompt || ''} ${q.text || ''}`.toLowerCase();
  if (/yes[\s\/]+no/i.test(textStr) || /claims of the writer/i.test(textStr)) {
    return 'YNNG';
  }
  if (/true[\s\/]+false/i.test(textStr)) {
    return 'TFNG';
  }

  if (hasExplicitRef || hasRefBox || /choose.*from the box/i.test(textStr)) {
    return 'MATCHING';
  }

  const hasOptions = Array.isArray(q.options) && q.options.length >= 2;
  if (hasOptions) {
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
    const existing = template.match(/\{\{\s*(\d+)\s*\}\}|\[\s*(\d+)(?:[^\d\]]*\d*)*\s*\]/g);
    if (existing && existing.length > 0) {
      existing.forEach(t => {
        const n = Number(t.replace(/[^\d]/g, ''));
        if (!isNaN(n) && n > 0 && !qNums.includes(n)) {
          qNums.push(n);
        }
      });
      qNums.sort((a, b) => a - b);
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
  normalized = normalized.replace(/\[\s*(\d+)\s*\.{2,}\s*\]/g, '[$1]');
  normalized = normalized.replace(/\[\s*\.{2,}\s*(\d+)\s*\]/g, '[$1]');

  // 2. Sequentially replace any prefixed token (@[q_num], [#q_num], {{@q_num}}, [q_num], [blank], [1], [31], etc.)
  // with sequential {{N}} placeholders from questions array
  normalized = normalized.replace(
    /(?:\{\{|\@?\[|\()(?:\#|\@)?\s*(?:q_num|blank|\d+)\s*(?:\}\}|\]|\))/gi,
    (m) => {
      const explicitNum = parseInt(m.replace(/[^\d]/g, ''), 10);
      if (!isNaN(explicitNum) && qNums.includes(explicitNum)) {
        return `{{${explicitNum}}}`;
      }
      return `{{${nextQNum()}}}`;
    }
  );

  // 3. For any questions in qNums that do not have a {{N}} placeholder yet,
  // replace standalone numbers matching qNums (e.g. "...necessary 27 for tourism... or 28 from...")
  // with {{N}} placeholders using \b word boundaries, avoiding range definitions and headers
  qNums.forEach(num => {
    const hasPlaceholder = new RegExp(`\\{\\{${num}\\}\\}`, 'i').test(normalized);
    if (!hasPlaceholder) {
      const standaloneRegex = new RegExp(
        `(?<!\\{\\{|@?\\[|\\(|Questions?\\s*|Part\\s*|Section\\s*|Passage\\s*|than\\s*|[-–—]\\s*)\\b${num}\\b(?!\\}\\}|\\]|\\)|\\s*[-–—]|\\s*words?)`,
        'gi'
      );
      if (standaloneRegex.test(normalized)) {
        normalized = normalized.replace(standaloneRegex, `{{${num}}}`);
      }
    }
  });

  // 4. If there are still unassigned questions in qNums, replace standalone blank lines (_{2,} or .{4,})
  normalized = normalized.replace(/(_{2,}|\.{4,})(?!\s*\{\{\d+\}\})(?<!\{\{\d+\}\}\s*)/g, (match) => {
    if (assignIdx < qNums.length) {
      while (assignIdx < qNums.length && new RegExp(`\\{\\{${qNums[assignIdx]}\\}\\}`, 'i').test(normalized)) {
        assignIdx++;
      }
      if (assignIdx < qNums.length) {
        return `{{${nextQNum()}}}`;
      }
    }
    return match;
  });

  // 5. Purge any trailing or leading underscores _{2,}, ellipses \.{2,}, disconnected empty brackets [ ],
  // and option brackets (e.g. [A-J]) immediately preceding or succeeding a gap token ({{N}})
  let prev;
  do {
    prev = normalized;
    normalized = normalized
      .replace(/(?:_{1,}|\.{2,}|\[\s*\]|\(\s*\)|\[\s*(?:blank|_{1,}|\.{2,})\s*\]|\(\s*(?:blank|_{1,}|\.{2,})\s*\))\s*(\{\{\d+\}\})/gi, '$1')
      .replace(/(\{\{\d+\}\})\s*(?:_{1,}|\.{2,}|\[\s*\]|\(\s*\)|\[\s*(?:blank|_{1,}|\.{2,})\s*\]|\(\s*(?:blank|_{1,}|\.{2,})\s*\))/gi, '$1')
      .replace(/(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?\s*(\{\{\d+\}\})/gi, '$1')
      .replace(/(\{\{\d+\}\})\s*(?:\[|\()?\s*\b[A-Ia-i]\s*[-–—]\s*[A-Ja-j]\b\s*(?:\]|\))?/gi, '$1');
  } while (normalized !== prev);

  // 6. Ensure any lingering disconnected empty brackets [ ] or ( ) are purged
  normalized = normalized.replace(/\[\s*\]|\(\s*\)/g, '');

  // 7. Guarantee that for EVERY question number from qNums, a placeholder {{N}} exists in the template.
  // First attempt to match any standalone occurrence with word boundaries
  qNums.forEach(num => {
    let hasPlaceholder = new RegExp(`\\{\\{${num}\\}\\}`, 'i').test(normalized);
    if (!hasPlaceholder) {
      const fallbackRegex = new RegExp(`\\b${num}\\b`, 'g');
      if (fallbackRegex.test(normalized)) {
        normalized = normalized.replace(fallbackRegex, `{{${num}}}`);
        hasPlaceholder = true;
      }
    }
    // If still missing, append as a separate line at the end so the student is guaranteed an input field
    if (!hasPlaceholder) {
      normalized = normalized ? `${normalized.trimEnd()}\n{{${num}}}` : `{{${num}}}`;
    }
  });

  // 8. Deduplicate open question numbers immediately adjacent to {{N}}
  // E.g. "include 25 {{25}}" -> "include {{25}}", "25. {{25}}" -> "{{25}}", "{{25}} 25" -> "{{25}}"
  qNums.forEach(num => {
    const preRegex = new RegExp(`(^|\\s)\\b${num}\\b[\\.\\:\\-\\–\\s]*(\\{\\{${num}\\}\\})`, 'gi');
    normalized = normalized.replace(preRegex, '$1$2');
    const postRegex = new RegExp(`(\\{\\{${num}\\}\\})[\\.\\:\\-\\–\\s]*\\b${num}\\b(?=\\s|\\b|$)`, 'gi');
    normalized = normalized.replace(postRegex, '$1');
  });

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

    const typeStr = String(q.type || '').toUpperCase();

    // Question-level reference box
    const rawQRef = (Array.isArray(q.reference_box) && q.reference_box.length > 0)
      ? q.reference_box
      : (Array.isArray(q.referenceBox) && q.referenceBox.length > 0 ? q.referenceBox : null);

    // For SUMMARY_MATCHING or MATCHING, if question has options with words, pass them as fallback to normalizeReferenceBox
    const fullQText = `${q.instruction || ''} ${q.prompt || ''} ${q.text || ''}`.toLowerCase();
    const hasMatchingKeywords = /from the box|match each|which activity will people do|what problem do the speakers identify|choose\s+(?:four|five|six|seven|\d+)\s+answers\s+from/i.test(fullQText);
    const hasManyOpts = Array.isArray(q.options) && q.options.length >= 3;
    const isMatchingType = typeStr !== 'MULTIPLE_CHOICE' && typeStr !== 'MULTIPLE_CHOICE_MULTI' && (typeStr === 'MATCHING' || typeStr === 'SUMMARY_MATCHING' || typeStr.includes('MATCHING') || typeStr.includes('FLOW_CHART') || hasMatchingKeywords);

    const fallbackOpts = (isMatchingType && hasManyOpts) ? q.options : (
      isMatchingType && Array.isArray(q.options) && q.options.some(o => (typeof o === 'string' && o.trim().length > 2) || (typeof o === 'object' && o !== null))
        ? q.options
        : []
    );

    const normQRefBox = rawQRef 
      ? normalizeReferenceBox(rawQRef, fallbackOpts, extractedInst || q.instruction || '') 
      : (fallbackOpts.length > 0 ? normalizeReferenceBox([], fallbackOpts, extractedInst || q.instruction || '') : []);
    const hasExplicitRef = normQRefBox.length > 0;

    // Only questions that EXPLICITLY possess an attached reference box on their own object (q.reference_box / q.referenceBox),
    // or where the question type is explicitly MATCHING, should use hasRefBox = true.
    const isExplicitMatching = isMatchingType;
    const hasRefBoxForCategory = hasExplicitRef || (isExplicitMatching && defaultRefBox.length > 0);

    const category = determineQuestionCategory(q, hasRefBoxForCategory);

    // Effective reference box ONLY attaches if:
    // a) The question explicitly contains its own reference_box / referenceBox array, OR
    // b) The question category is explicitly MATCHING, MATCHING_HEADINGS, or SUMMARY_MATCHING.
    let effectiveRefBox = [];
    const defaultHasRoman = defaultRefBox.some(r => /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(r.key));

    if (hasExplicitRef) {
      effectiveRefBox = normQRefBox;
    } else if (category === 'SUMMARY_MATCHING') {
      effectiveRefBox = defaultRefBox.length > 0 ? defaultRefBox : normQRefBox;
    } else if (category === 'MATCHING_HEADINGS') {
      effectiveRefBox = defaultHasRoman ? defaultRefBox : normQRefBox;
    } else if (
      category === 'MATCHING' ||
      category === 'MATCHING_FEATURES' ||
      category === 'MATCHING_INFORMATION' ||
      category === 'MAP_DIAGRAM_LABELING' ||
      category === 'FLOW_CHART'
    ) {
      // General matching (researchers, statements, features) shouldn't inherit Roman numerals meant for headings
      if (!defaultHasRoman && defaultRefBox.length > 0) {
        effectiveRefBox = defaultRefBox;
      } else if (normQRefBox.length > 0) {
        effectiveRefBox = normQRefBox;
      } else if (Array.isArray(q.options) && q.options.length >= 2) {
        effectiveRefBox = normalizeReferenceBox([], q.options, extractedInst || q.instruction || '');
      } else if (category === 'MAP_DIAGRAM_LABELING') {
        effectiveRefBox = normalizeReferenceBox([], [], extractedInst || q.instruction || '');
      } else {
        effectiveRefBox = [];
      }
    }

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
      // 1. Category changed (e.g. was MATCHING_HEADINGS, became MATCHING)
      const categoryChanged = currentGroup.category !== category;

      // 2. Full-text reference box signature comparison (Key AND Label)
      const getRefSignature = (list) => (Array.isArray(list) ? list : [])
        .map(r => `${String(r.key || '').trim().toUpperCase()}:${String(r.label || r.text || r.value || '').trim().toLowerCase()}`)
        .filter(s => s.length > 2)
        .join('|');

      const currentRefSig = getRefSignature(currentGroup.referenceBox);
      const thisRefSig = getRefSignature(effectiveRefBox);

      // If both reference boxes have non-empty signatures and differ, the option pool has changed!
      const refBoxSigChanged = Boolean(currentRefSig && thisRefSig && currentRefSig !== thisRefSig);

      // If one had referenceBox items and the other is empty (or vice-versa), force split
      const refBoxPresenceChanged = Boolean(
        (currentGroup.referenceBox.length > 0 && effectiveRefBox.length === 0) ||
        (currentGroup.referenceBox.length === 0 && effectiveRefBox.length > 0)
      );

      const currentRefKeys = currentGroup.referenceBox.map(r => r.key).join(',');
      const thisRefKeys = effectiveRefBox.map(r => r.key).join(',');
      const refBoxKeysChanged = currentRefKeys !== thisRefKeys && (effectiveRefBox.length > 0 || currentGroup.referenceBox.length > 0);

      const currentHasRoman = currentGroup.referenceBox.some(r => /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(r.key));
      const thisHasRoman = effectiveRefBox.some(r => /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(r.key));
      const romanCompositionChanged = (currentHasRoman !== thisHasRoman) && (currentGroup.referenceBox.length > 0 || effectiveRefBox.length > 0);

      const refBoxChanged = refBoxSigChanged || refBoxPresenceChanged || refBoxKeysChanged || romanCompositionChanged;

      // 3. Dynamic sub-range detector in instructions
      // Look for ranges in instruction: /Questions?\s+(\d+)\s*[\-–—]\s*(\d+)/gi
      const combinedInstructions = `${currentGroup.instruction || ''} ${q.instruction || ''} ${extractedInst || ''}`;
      const rangeMatches = [...combinedInstructions.matchAll(/Questions?\s+(\d+)\s*[\-–—]\s*(\d+)/gi)];
      let startsNewSubRange = false;
      if (rangeMatches.length > 0) {
        for (const m of rangeMatches) {
          const startNum = parseInt(m[1], 10);
          if (!isNaN(startNum) && startNum === qNum && qNum !== currentGroup.startQ) {
            startsNewSubRange = true;
            break;
          }
        }
      }

      const getInstStartQ = (inst) => {
        if (!inst) return null;
        const m = String(inst).match(/Questions?\s+(\d+)/i);
        return m ? parseInt(m[1], 10) : null;
      };
      const currentStartNum = getInstStartQ(currentGroup.instruction);
      const thisStartNum = getInstStartQ(extractedInst || q.instruction);
      const instructionRangeChanged = 
        startsNewSubRange ||
        (currentStartNum !== null && thisStartNum !== null && currentStartNum !== thisStartNum) ||
        (thisStartNum !== null && thisStartNum !== currentGroup.startQ && thisStartNum === qNum);

      // 4. Strict category and type transitions
      const currentIsMC = currentGroup.category === 'MULTIPLE_CHOICE' || currentGroup.category === 'MULTIPLE_CHOICE_MULTI';
      const thisIsMC = category === 'MULTIPLE_CHOICE' || category === 'MULTIPLE_CHOICE_MULTI';
      const currentIsMatchingOrFlow = currentGroup.category === 'MATCHING' || currentGroup.category.startsWith('MATCHING_') || currentGroup.category === 'FLOW_CHART';
      const thisIsMatchingOrFlow = category === 'MATCHING' || category.startsWith('MATCHING_') || category === 'FLOW_CHART';
      const mcToMatchingOrFlowTransition = (currentIsMC && thisIsMatchingOrFlow) || (currentIsMatchingOrFlow && thisIsMC);

      const prevQ = currentGroup.questions[currentGroup.questions.length - 1];
      const prevType = String(prevQ?.type || '').toUpperCase();
      const currentIsFlow = currentGroup.category === 'FLOW_CHART' || prevType.includes('FLOW_CHART');
      const thisIsFlow = category === 'FLOW_CHART' || typeStr.includes('FLOW_CHART');
      const currentIsAnyMatching = currentGroup.category === 'MATCHING' || currentGroup.category.startsWith('MATCHING_') || prevType.includes('MATCH');
      const thisIsAnyMatching = category === 'MATCHING' || category.startsWith('MATCHING_') || typeStr.includes('MATCH');
      const flowAndMatchingConflict = (currentIsFlow && thisIsAnyMatching) || (currentIsAnyMatching && thisIsFlow);

      const isExplicitPair = /choose.*two|which two|two options|two letters|select two/i.test(`${currentGroup.instruction} ${questionItem.cleanPrompt}`) ||
        Boolean(q.multiSelect || q.isDual || String(q.type).includes('MULTI'));

      const isDualContinuation = 
        currentIsMC &&
        thisIsMC &&
        (qNum === currentGroup.endQ + 1) &&
        isExplicitPair;

      const instructionChanged = !isDualContinuation && extractedInst && currentGroup.instruction && extractedInst !== currentGroup.instruction;
      
      const hasRomanOpts = (opts) => Array.isArray(opts) && opts.some(o => {
        const str = typeof o === 'object' && o !== null ? (o.key || o.letter || o.value || o.label || '') : String(o);
        const m = str.match(/^\[?([a-z0-9]+)\]?/i);
        const token = m ? m[1] : str;
        return /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(token.trim());
      });

      const hasLetterOpts = (opts) => Array.isArray(opts) && opts.some(o => {
        const str = typeof o === 'object' && o !== null ? (o.key || o.letter || o.value || o.label || '') : String(o);
        const m = str.match(/^\[?([a-z0-9]+)\]?/i);
        const token = m ? m[1] : str;
        return /^[A-Z]$/i.test(token.trim()) && !/^(i|v|x)$/i.test(token.trim());
      });

      const currentGroupIsRoman = currentGroup.category === 'MATCHING_HEADINGS' || currentHasRoman || hasRomanOpts(currentGroup.questions[0]?.options);
      const thisQuestionIsLettersOrFeatures = 
        category === 'MATCHING_FEATURES' ||
        category === 'MATCHING_INFORMATION' ||
        typeStr === 'MATCHING_FEATURES' ||
        typeStr === 'MATCHING_INFORMATION' ||
        (!thisHasRoman && (hasLetterOpts(q.options) || hasLetterOpts(effectiveRefBox)));

      const headingsToFeaturesTransition = currentGroupIsRoman && thisQuestionIsLettersOrFeatures;
      const featuresToHeadingsTransition = 
        (currentGroup.category === 'MATCHING_FEATURES' || currentGroup.category === 'MATCHING_INFORMATION') &&
        (category === 'MATCHING_HEADINGS' || thisHasRoman || hasRomanOpts(q.options));

      const currentOptRoman = currentHasRoman || hasRomanOpts(currentGroup.questions[0]?.options);
      const thisOptRoman = thisHasRoman || hasRomanOpts(q.options);
      const optionTypeChanged = (currentOptRoman !== thisOptRoman) && 
        ((currentGroup.questions[0]?.options?.length > 0 || currentGroup.referenceBox.length > 0) &&
         (q.options?.length > 0 || effectiveRefBox.length > 0));

      const flowChartTransition = 
        (currentGroup.category === 'FLOW_CHART' && category !== 'FLOW_CHART') ||
        (currentGroup.category !== 'FLOW_CHART' && category === 'FLOW_CHART');

      const typeFormatChanged = Boolean(prevType && typeStr && prevType !== typeStr && !isDualContinuation);

      if (
        categoryChanged ||
        refBoxChanged ||
        mcToMatchingOrFlowTransition ||
        flowAndMatchingConflict ||
        startsNewSubRange ||
        instructionRangeChanged ||
        optionTypeChanged ||
        headingsToFeaturesTransition ||
        featuresToHeadingsTransition ||
        instructionChanged ||
        flowChartTransition ||
        typeFormatChanged
      ) {
        if (!isDualContinuation || categoryChanged || refBoxChanged || mcToMatchingOrFlowTransition || flowAndMatchingConflict || startsNewSubRange || optionTypeChanged || headingsToFeaturesTransition || featuresToHeadingsTransition || instructionRangeChanged) {
          isNewGroup = true;
        }
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
        } else if (category === 'YNNG') {
          groupInstruction = 'Do the following statements agree with the claims of the writer? Choose YES, NO, or NOT GIVEN.';
        } else if (category === 'MATCHING_HEADINGS') {
          groupInstruction = 'Choose the correct heading for each section from the list of headings below.';
        } else if (category === 'MATCHING_FEATURES') {
          groupInstruction = 'Look at the following statements and the list of options below. Match each statement with the correct option.';
        } else if (category === 'MATCHING_INFORMATION') {
          groupInstruction = 'Which paragraph contains the following information? Write the correct letter, A-H, in boxes on your answer sheet.';
        } else if (category === 'SUMMARY_MATCHING') {
          groupInstruction = 'Complete the summary using the list of words below. Write the correct letter, A–J, in the spaces provided.';
        } else if (category === 'SUMMARY_COMPLETION') {
          groupInstruction = 'Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer.';
        } else if (category === 'TABLE_COMPLETION') {
          groupInstruction = 'Complete the table below. Write your answers in the spaces provided.';
        } else if (category === 'FORM_COMPLETION') {
          groupInstruction = 'Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer.';
        } else if (category === 'MAP_DIAGRAM_LABELING') {
          groupInstruction = 'Label the map or diagram below. Choose the correct letter for each location.';
        } else if (category === 'FLOW_CHART') {
          groupInstruction = 'Complete the flow-chart below. Write the correct letter or words in the spaces provided.';
        } else if (category === 'MATCHING') {
          if (effectiveRefBox.length > 0) {
            groupInstruction = 'Look at the following items and the list of options below. Match each item with the correct option.';
          } else {
            groupInstruction = 'Match each item with the correct letter from the options.';
          }
        } else if (category === 'MULTIPLE_CHOICE' || category === 'MULTIPLE_CHOICE_MULTI') {
          groupInstruction = category === 'MULTIPLE_CHOICE_MULTI'
            ? 'Choose the correct letters.'
            : 'Choose the correct letter, A, B, C, or D.';
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
        notes_template: q.notes_template || q.summary_template || null,
        category,
        referenceBox: effectiveRefBox,
        refBox: effectiveRefBox,
        questions: [questionItem],
      };
    } else {
      if (!currentGroup.title && q.title) {
        currentGroup.title = q.title;
      }
      if (!currentGroup.summaryTemplate && (q.summary_template || q.notes_template)) {
        currentGroup.summaryTemplate = q.summary_template || q.notes_template;
        currentGroup.notes_template = q.notes_template || q.summary_template;
      }
      if ((!currentGroup.referenceBox || currentGroup.referenceBox.length === 0) && effectiveRefBox.length > 0) {
        currentGroup.referenceBox = effectiveRefBox;
        currentGroup.refBox = effectiveRefBox;
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

  groups.forEach(g => {
    if (Array.isArray(g.questions)) {
      g.questions.sort((a, b) => Number(a.questionNumber || a.q_num || 0) - Number(b.questionNumber || b.q_num || 0));
    }
  });
  groups.sort((a, b) => Number(a.startQ || 0) - Number(b.startQ || 0));

  return groups;
}
