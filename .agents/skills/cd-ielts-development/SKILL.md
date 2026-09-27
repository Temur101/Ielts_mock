---
name: cd-ielts-development
description: >-
  Architectural patterns, data passing, grouping logic, and rendering standards for
  Cambridge Computer-Based IELTS (CD IELTS) reading and listening engines. Use when
  implementing, modifying, or debugging exam booklets, question grouping, option resolution,
  summary completions, flow charts, matching tables, or dual question cards.
---

# Cambridge Computer-Based IELTS (CD IELTS) Development Skill

This skill provides the official engineering patterns for developing and maintaining
the Cambridge Computer-Based IELTS testing platform.

---

## 1. Core Architectural Patterns

### Pattern A: Passage Data & Reference Box Propagation (Reading)
- **Problem:** `AnswerSheet` needs passage reference boxes (`List of Headings`, researcher lists) but parent components might fail to pass them.
- **Rule:** Always forward `passage={currentPassage}`, `passages={compiledPassages}`, and `exam={exam}` to `<AnswerSheet />`.
- **Resolution:** In `AnswerSheet`, compute `activePassageRefBox` by searching across `passage`, `currentPassage`, `passages`, and `exam.reading_parts`.
- **Reference Box Rendering:** Both the alphanumeric/Roman key and the full label text must be rendered. Never truncate options to empty letter buttons like `[A] [B] [C] [D]`.

### Pattern B: Dual-Question Pairing ("Choose TWO letters")
- **Problem:** Questions requiring candidates to select two options from five (A–E) must not be rendered as two independent 5-button cards.
- **Rule:** Group consecutive questions with dual-select instructions (`/choose.*two|select.*two|two options|two letters/i`) into a single unified card.
- **Rendering:**
  - Single card with "Select TWO options" heading and option list A–E.
  - Two input/letter badges corresponding to `qNum1` and `qNum2`.
  - Selecting an option fills slot 1; selecting a second fills slot 2. Deselecting clears the slot.
  - In `groupQuestionsIntoSets`, detect `isDualContinuation` to prevent splitting the pair across separate instruction groups.

### Pattern C: Seamless Inline Summary Completion (Booklet Typography)
- **Problem:** Template gap markers `{{N}}` accompanied by newline characters cause ugly multi-line breaks and disconnected input slots.
- **Rule:**
  1. Strip newline characters adjacent to gap markers: `template.replace(/(\r?\n)+\s*(\{\{\d+\}\})/g, ' $2').replace(/(\{\{\d+\}\})\s*(\r?\n)+/g, '$1 ')`.
  2. Split text only on natural paragraph boundaries: `template.split(/\n\s*\n+/)`.
  3. Render each paragraph with `<p className="text-[14.5px] leading-loose font-serif text-slate-800 mb-4 last:mb-0">`.
  4. Ensure inputs and question number badges flow strictly inline with the text.

### Pattern D: Monolithic Flow-Chart Grouping (Listening / Reading)
- **Problem:** Flow-chart steps often have different intermediate instructions or step texts, causing `groupQuestionsIntoSets` to fragment them into multiple cards with duplicate `Options Box` frames.
- **Rule:**
  - For consecutive questions with category `FLOW_CHART`, explicitly block group splitting by `instructionChanged`, `typeFormatChanged`, or `refBoxChanged`.
  - The entire flow-chart chain must form a single group with one `Options Box` at the top and sequential steps with arrows below.
  - Maintain transitions at the boundary to different categories (e.g. `flowAndMatchingConflict`).

### Pattern E: Strict Scoping Priority for Options
- **Rule:** Local question options have strict precedence over section/passage defaults:
  ```javascript
  if (localQuestionOptions.length > 0) {
    effectiveRefBox = localQuestionOptions;
  } else if (defaultRefBox.length > 0 && !defaultHasRoman) {
    effectiveRefBox = defaultRefBox;
  } else {
    effectiveRefBox = [];
  }
  ```
  Default section options must never overwrite unique question-level options.

### Pattern F: Letter-Range Auto-Generation for Options Box
- **Problem:** When options arrays are empty, matching instructions often contain letter ranges like `A-F`, `A-H`, `A-K`, or `letters A to G`.
- **Rule:**
  - Inspect all instruction sources: `group.instruction`, `currentPart.instruction`, `currentPart.raw_instruction`, `q.instruction`, and prompts.
  - Match ranges with `/\bletters?\s+([A-Z])\s*[-–—to]+\s*([A-Z])\b/i` or `/\b([A-Z])\s*[-–—to]\s*([A-Z])\b/i`.
  - Dynamically generate option badges `{ key: String.fromCharCode(code), label: '' }` so the `List of Options` is always rendered.

### Pattern G: Preservation of Contextual & Static Booklet Elements
- **Problem:** Tests contain non-question context: section subheadings, context bullets, prefilled examples, dates, and static informational rows.
- **Rule:**
  - Do NOT filter out items lacking question numbers (`!qNum` or `type: 'context'`).
  - In `renderStructuredNotes`, `FORM_COMPLETION`, and `TABLE_COMPLETION`:
    - Render section subheadings (`q.subheading || q.section_heading`) as prominent dividers.
    - Render `context_bullets` as bullet lists.
    - Render static/prefilled rows without input fields (displaying prefilled text/example badges), restoring the complete authentic Cambridge test booklet.

---

## 2. Validation Checklist
Before concluding any task on the IELTS platform:
1. Syntax validation: Run esbuild check on modified JSX files (`write: false`).
2. Git diff check: Ensure only task-specified files are touched.
3. No hardcoding: Verify that no specific question numbers or test topics were introduced.
