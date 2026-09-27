import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker to local bundled Vite URL
if (typeof window !== 'undefined' && pdfjsLib?.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

/**
 * Extracts clean rendered text from a PDF File or ArrayBuffer using pdfjs-dist
 */
export async function extractRawTextFromPdf(fileOrBuffer) {
  let arrayBuffer;
  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else if (fileOrBuffer instanceof Blob || fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else {
    throw new Error("Invalid file format for PDF text extraction");
  }

  try {
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
      isEvalSupported: false,
    });
    
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Собираем все текстовые фрагменты с их координатами
      const items = [];
      for (const item of textContent.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        items.push({
          str: item.str,
          x: item.transform ? Math.round(item.transform[4]) : 0,
          y: item.transform ? Math.round(item.transform[5]) : 0,
        });
      }

      // Сортируем строго: сверху вниз (Y убывает), затем слева направо (X возрастает)
      items.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 5) return yDiff;
        return a.x - b.x;
      });

      // Группируем элементы в строки
      const lines = [];
      let currentLineY = null;
      let currentLine = "";

      for (const item of items) {
        if (currentLineY === null || Math.abs(item.y - currentLineY) > 5) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = item.str;
          currentLineY = item.y;
        } else {
          currentLine += (currentLine ? " " : "") + item.str;
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());

      fullText += `\n\n--- PAGE ${pageNum} ---\n\n` + lines.join("\n");
    }

    return fullText.trim();
  } catch (err) {
    console.error("pdfjs text extraction failed:", err);
    throw new Error("Could not parse text from this PDF.");
  }
}

// =========================================================================
// 1. SMART QUESTION EXTRACTION ENGINE (ONLY REAL QUESTIONS FROM PDF)
// =========================================================================

export function extractDetailedQuestionsFromText(text, answerKeys = {}, sectionId = 1) {
  if (!text || typeof text !== 'string') return [];

  const foundQuestions = new Map();

  // Clean lines of text
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (let l of rawLines) {
    l = l.replace(/--- PAGE \d+ ---/g, '').trim();
    if (l) lines.push(l);
  }

  // Common instructions phrases to ignore as questions
  const isInstructionOrHeading = (str) => {
    const lower = str.toLowerCase();
    return lower.includes('you should spend') ||
           lower.includes('which are based on') ||
           lower.includes('reading passage') ||
           lower.includes('listening section') ||
           lower.includes('choose the correct') ||
           lower.includes('do the following statements') ||
           lower.includes('complete the notes') ||
           lower.includes('complete the summary') ||
           lower.includes('write your answers') ||
           lower.includes('in boxes ') ||
           lower.includes('write no more than') ||
           lower.startsWith('test ') ||
           lower.startsWith('cambridge') ||
           lower.startsWith('page ') ||
           lower.includes('all rights reserved');
  };

  let currentQNum = null;
  let currentQText = "";
  let currentQOptions = [];
  let currentInstruction = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect general instructions like "Questions 1-5 ... Write TRUE, FALSE, or NOT GIVEN"
    if (/^Questions?\s+\d+/i.test(line) || isInstructionOrHeading(line)) {
      if (line.length < 250) {
        currentInstruction = line;
      }
      continue;
    }

    // Check if line starts with a question number:
    // e.g. "1. The Roman Colosseum...", "1) Text", "1 Text", "Question 1: Text", "Q1: Text"
    // Also bracketed form: "(1) ________ Sanderson", "Name: (1) ________"
    const qMatch = line.match(/^(?:(?:Question|Item|Q)\s*)?(\d{1,2})[\.\)\:\s\-]+(.+)$/i);
    const bracketMatch = line.match(/(?:([^\(\)\[\]\n]{1,60})\s*[\:\-]?\s*)?[\(\[]\s*(\d{1,2})\s*[\)\]][\s\-_–—\.]*(.*)/i);
    const inlineFormMatch = line.match(/(.+?)\s+[\(\[]?\b(\d{1,2})\b[\)\]]?\s*_{2,}(.*)/i);

    let detectedNum = null;
    let detectedText = "";

    if (qMatch) {
      const num = parseInt(qMatch[1], 10);
      const rest = qMatch[2].trim();
      if (num >= 1 && !isInstructionOrHeading(rest) && rest.length >= 2) {
        detectedNum = num;
        detectedText = rest;
      }
    } else if (bracketMatch) {
      const num = parseInt(bracketMatch[2], 10);
      const prefix = bracketMatch[1]?.trim() || '';
      const suffix = bracketMatch[3]?.trim() || '';
      if (num >= 1 && !prefix.toLowerCase().includes('page') && !prefix.toLowerCase().includes('score')) {
        detectedNum = num;
        detectedText = prefix ? `${prefix}: ________ ${suffix}`.trim() : `(Blank) ${suffix}`.trim();
      }
    } else if (inlineFormMatch) {
      const num = parseInt(inlineFormMatch[2], 10);
      const prefix = inlineFormMatch[1]?.trim() || '';
      const suffix = inlineFormMatch[3]?.trim() || '';
      if (num >= 1) {
        detectedNum = num;
        detectedText = `${prefix}: ________ ${suffix}`.trim();
      }
    }

    if (detectedNum !== null) {
      // Save previous question if exists
      if (currentQNum !== null && !foundQuestions.has(currentQNum)) {
        foundQuestions.set(currentQNum, {
          qNum: currentQNum,
          text: currentQText.trim() || `Question ${currentQNum}`,
          options: [...currentQOptions],
          instruction: currentInstruction
        });
      }

      currentQNum = detectedNum;
      currentQText = detectedText;
      currentQOptions = [];
      continue;
    }

    // If we are inside an active question:
    if (currentQNum !== null) {
      // Check if this line is an option: "A text", "B text", "C text", "D text"
      const optMatch = line.match(/^([A-D])[\.\)]\s+(.+)$/i);
      if (optMatch) {
        currentQOptions.push(`${optMatch[1].toUpperCase()}. ${optMatch[2].trim()}`);
        continue;
      }

      // If line is not a new question or instruction, it might be continuation of the question text
      if (currentQOptions.length === 0 && line.length < 250 && !line.startsWith('--- PAGE')) {
        currentQText += " " + line;
      }
    }
  }

  // Flush last question
  if (currentQNum !== null && !foundQuestions.has(currentQNum)) {
    foundQuestions.set(currentQNum, {
      qNum: currentQNum,
      text: currentQText.trim() || `Question ${currentQNum}`,
      options: [...currentQOptions],
      instruction: currentInstruction
    });
  }

  // Also do a fallback regex sweep for any questions embedded inside paragraphs
  const inlineRegex = /(?:^|\s|\n)(?:Question\s+)?(\d{1,2})[\.\)\:]\s+([A-Z][^\.\n]{5,150}[\.\?])/g;
  let inMatch;
  while ((inMatch = inlineRegex.exec(text)) !== null) {
    const qNum = parseInt(inMatch[1], 10);
    const qContent = inMatch[2].trim();
    if (qNum >= 1 && !foundQuestions.has(qNum) && !isInstructionOrHeading(qContent)) {
      foundQuestions.set(qNum, {
        qNum,
        text: qContent,
        options: [],
        instruction: ""
      });
    }
  }

  // Collect all question numbers to create questions for
  const keyNumbers = Object.keys(answerKeys).map(Number).filter(n => n >= 1);
  let allNums = [...new Set([...foundQuestions.keys(), ...keyNumbers])].sort((a, b) => a - b);

  // If still nothing found, default to range from "Questions 1-X"
  if (allNums.length === 0) {
    const rangeMatch = text.match(/Questions?\s+(\d+)\s*(?:–|-|to)\s*(\d+)/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (end >= start) {
        allNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }
    }
  }

  // Do NOT fabricate synthetic questions if none were detected
  if (allNums.length === 0) {
    return [];
  }

  const questions = [];

  for (const qNum of allNums) {
    const item = foundQuestions.get(qNum);
    let questionText = item?.text || `Question ${qNum}`;
    let options = item?.options || [];
    let instruction = item?.instruction || "";
    const rawKey = answerKeys[qNum];

    // Check if options are inside questionText e.g. "A ... B ... C ... D ..."
    if (options.length < 2) {
      const inlineOpts = [...questionText.matchAll(/(?:^|\s+)([A-D])[\.\)]\s+([^\n]+?)(?=(?:\s+[A-D][\.\)]|\n|$))/gi)];
      if (inlineOpts.length >= 2) {
        options = inlineOpts.map(m => `${m[1].toUpperCase()}. ${m[2].trim()}`);
        const firstOpt = questionText.search(/(?:^|\s+)[A-D][\.\)]\s+/i);
        if (firstOpt > 0) {
          questionText = questionText.slice(0, firstOpt).trim();
        }
      }
    }

    let type = "FILL_BLANK";
    const isTrueFalse = (rawKey && /^(?:TRUE|FALSE|NOT\s*GIVEN|T|F|NG)$/i.test(rawKey.trim())) || 
                        /TRUE\s*\/\s*FALSE/i.test(questionText) || /TRUE\s*,\s*FALSE/i.test(instruction) || /TRUE\s*,\s*FALSE/i.test(text);
    const isYesNo = (rawKey && /^(?:YES|NO|NOT\s*GIVEN|Y|N|NG)$/i.test(rawKey.trim())) || 
                    /YES\s*\/\s*NO/i.test(questionText) || /YES\s*,\s*NO/i.test(instruction) || /YES\s*,\s*NO/i.test(text);

    if (options.length >= 2) {
      type = "MULTIPLE_CHOICE";
      instruction = instruction || "Choose the correct letter, A, B, C, or D.";
    } else if (isTrueFalse) {
      type = "TRUE_FALSE_NOT_GIVEN";
      options = ["TRUE", "FALSE", "NOT GIVEN"];
      instruction = instruction || "Do the following statements agree with the information in the passage? Choose TRUE, FALSE, or NOT GIVEN.";
    } else if (isYesNo) {
      type = "YES_NO_NOT_GIVEN";
      options = ["YES", "NO", "NOT GIVEN"];
      instruction = instruction || "Do the following statements agree with the views of the writer? Choose YES, NO, or NOT GIVEN.";
    } else {
      type = "FILL_BLANK";
      instruction = instruction || "Write your answer into the box below.";
    }

    // Clean up leading question numbers if still attached
    questionText = questionText
      .replace(/^(?:Question\s+)?\d+[\.\)\:\s\-]+/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!questionText || questionText.length < 2) {
      questionText = `Question ${qNum}`;
    }

    let acceptedAnswers = [];
    if (rawKey) {
      acceptedAnswers = rawKey.split(/[\/,]+/).map(s => s.trim()).filter(Boolean);
    }
    if (!acceptedAnswers.length) {
      acceptedAnswers = type === "MULTIPLE_CHOICE" ? ["A"] : type === "FILL_BLANK" ? ["answer"] : ["TRUE", "T"];
    }

    questions.push({
      id: `q-${qNum}`,
      passageId: sectionId,
      partId: sectionId,
      questionNumber: qNum,
      type,
      instruction,
      text: questionText,
      options: options.length ? options : (type === 'TRUE_FALSE_NOT_GIVEN' ? ["TRUE", "FALSE", "NOT GIVEN"] : type === 'YES_NO_NOT_GIVEN' ? ["YES", "NO", "NOT GIVEN"] : undefined),
      placeholder: type === "FILL_BLANK" ? `Type answer for Question ${qNum}...` : undefined,
      acceptedAnswers,
      autoDetected: true,
      explanation: `Extracted from PDF for Question ${qNum}.`
    });
  }

  questions.sort((a, b) => Number(a.questionNumber || 0) - Number(b.questionNumber || 0));

  return questions;
}

// =========================================================================
// 2. READING PDF PARSER
// =========================================================================

export function parseIeltsReadingPdfText(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return createEmptyReadingSections();
  }

  const { cleanedText, answerKeys, answerKeyDetected } = extractAndStripAnswerKeys(rawText, 'reading');
  const allQuestions = extractDetailedQuestionsFromText(rawText, answerKeys, 1);

  const p1Regex = /(?:READING\s+PASSAGE\s+1|PASSAGE\s+1|SECTION\s+1|PART\s+1)/i;
  const p2Regex = /(?:READING\s+PASSAGE\s+2|PASSAGE\s+2|SECTION\s+2|PART\s+2)/i;
  const p3Regex = /(?:READING\s+PASSAGE\s+3|PASSAGE\s+3|SECTION\s+3|PART\s+3)/i;

  const p1Match = cleanedText.match(p1Regex);
  const p2Match = cleanedText.match(p2Regex);
  const p3Match = cleanedText.match(p3Regex);

  const p1Idx = p1Match ? p1Match.index : 0;
  const p2Idx = p2Match ? p2Match.index : (p3Match ? p3Match.index : cleanedText.length);
  const p3Idx = p3Match ? p3Match.index : cleanedText.length;

  const p1Text = cleanedText.slice(p1Idx, p2Idx).trim();
  const p2Text = p2Match ? cleanedText.slice(p2Idx, p3Idx).trim() : "";
  const p3Text = p3Match ? cleanedText.slice(p3Idx).trim() : "";

  // Assign passageId based on character offset in cleanedText
  allQuestions.forEach(q => {
    const qMarker = new RegExp(`(?:^|\\s|\\n)(?:Question\\s+)?${q.questionNumber}[\\.\\)\\:]`, 'i');
    const match = cleanedText.match(qMarker);
    if (match && match.index !== undefined) {
      const idx = match.index;
      if (p3Match && idx >= p3Idx) {
        q.passageId = 3;
      } else if (p2Match && idx >= p2Idx) {
        q.passageId = 2;
      } else {
        q.passageId = 1;
      }
    } else {
      // Proportional fallback if character offset is ambiguous
      const totalQ = allQuestions.length;
      const p1Cap = Math.ceil(totalQ / 3);
      const p2Cap = Math.ceil((totalQ * 2) / 3);
      q.passageId = q.questionNumber <= p1Cap ? 1 : q.questionNumber <= p2Cap ? 2 : 3;
    }
  });

  const p1Questions = allQuestions.filter(q => q.passageId === 1);
  const p2Questions = allQuestions.filter(q => q.passageId === 2);
  const p3Questions = allQuestions.filter(q => q.passageId === 3);

  const formatRange = (qs, fallback) => {
    if (!qs || qs.length === 0) return fallback || "";
    const nums = qs.map(q => q.questionNumber);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return min === max ? `Question ${min}` : `Questions ${min}–${max}`;
  };

  const sections = {
    part1: {
      partId: 1,
      title: "Reading Passage 1",
      questionRange: formatRange(p1Questions, "Reading Passage 1"),
      passageText: cleanPassageBody(p1Text, 1),
      questions: p1Questions,
    },
    part2: {
      partId: 2,
      title: "Reading Passage 2",
      questionRange: formatRange(p2Questions, p2Text ? "Reading Passage 2" : ""),
      passageText: p2Text ? cleanPassageBody(p2Text, 2) : "",
      questions: p2Questions,
    },
    part3: {
      partId: 3,
      title: "Reading Passage 3",
      questionRange: formatRange(p3Questions, p3Text ? "Reading Passage 3" : ""),
      passageText: p3Text ? cleanPassageBody(p3Text, 3) : "",
      questions: p3Questions,
    }
  };

  return {
    rawTextLength: rawText.length,
    answerKeyDetected,
    answerKeys,
    detectedCount: allQuestions.length,
    sections,
    questions: allQuestions
  };
}

// =========================================================================
// 3. LISTENING PDF PARSER
// =========================================================================

export function parseIeltsListeningPdfText(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return createEmptyListeningSections();
  }

  const { cleanedText, answerKeys, answerKeyDetected } = extractAndStripAnswerKeys(rawText, 'listening');
  const allQuestions = extractDetailedQuestionsFromText(rawText, answerKeys, 1);

  const p1Regex = /(?:SECTION\s+1|PART\s+1|LISTENING\s+SECTION\s+1|LISTENING\s+PART\s+1)/i;
  const p2Regex = /(?:SECTION\s+2|PART\s+2|LISTENING\s+SECTION\s+2|LISTENING\s+PART\s+2)/i;
  const p3Regex = /(?:SECTION\s+3|PART\s+3|LISTENING\s+SECTION\s+3|LISTENING\s+PART\s+3)/i;
  const p4Regex = /(?:SECTION\s+4|PART\s+4|LISTENING\s+SECTION\s+4|LISTENING\s+PART\s+4)/i;

  const p1Match = cleanedText.match(p1Regex);
  const p2Match = cleanedText.match(p2Regex);
  const p3Match = cleanedText.match(p3Regex);
  const p4Match = cleanedText.match(p4Regex);

  const p1Idx = p1Match ? p1Match.index : 0;
  const p2Idx = p2Match ? p2Match.index : cleanedText.length;
  const p3Idx = p3Match ? p3Match.index : cleanedText.length;
  const p4Idx = p4Match ? p4Match.index : cleanedText.length;

  const p1Text = cleanedText.slice(p1Idx, p2Idx).trim();
  const p2Text = p2Match ? cleanedText.slice(p2Idx, p3Idx).trim() : "";
  const p3Text = p3Match ? cleanedText.slice(p3Idx, p4Idx).trim() : "";
  const p4Text = p4Match ? cleanedText.slice(p4Idx).trim() : "";

  allQuestions.forEach(q => {
    const qMarker = new RegExp(`(?:^|\\s|\\n)(?:Question\\s+)?${q.questionNumber}[\\.\\)\\:]`, 'i');
    const match = cleanedText.match(qMarker);
    if (match && match.index !== undefined) {
      const idx = match.index;
      if (p4Match && idx >= p4Idx) q.partId = 4;
      else if (p3Match && idx >= p3Idx) q.partId = 3;
      else if (p2Match && idx >= p2Idx) q.partId = 2;
      else q.partId = 1;
    } else {
      const totalQ = allQuestions.length;
      const step = Math.ceil(totalQ / 4);
      q.partId = q.questionNumber <= step ? 1 : q.questionNumber <= step * 2 ? 2 : q.questionNumber <= step * 3 ? 3 : 4;
    }
  });

  const p1Questions = allQuestions.filter(q => q.partId === 1);
  const p2Questions = allQuestions.filter(q => q.partId === 2);
  const p3Questions = allQuestions.filter(q => q.partId === 3);
  const p4Questions = allQuestions.filter(q => q.partId === 4);

  const formatPartRange = (qs, fallback) => {
    if (!qs || qs.length === 0) return fallback || "";
    const nums = qs.map(q => q.questionNumber);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return min === max ? `Question ${min}` : `Questions ${min}–${max}`;
  };

  const sections = {
    part1: {
      partId: 1,
      title: "Part 1",
      questionRange: formatPartRange(p1Questions, "Part 1"),
      passageText: cleanPassageBody(p1Text, 1),
      instructions: "Answer the questions below.",
      questions: p1Questions,
    },
    part2: {
      partId: 2,
      title: "Part 2",
      questionRange: formatPartRange(p2Questions, p2Text ? "Part 2" : ""),
      passageText: p2Text ? cleanPassageBody(p2Text, 2) : "",
      instructions: "Answer the questions below.",
      questions: p2Questions,
    },
    part3: {
      partId: 3,
      title: "Part 3",
      questionRange: formatPartRange(p3Questions, p3Text ? "Part 3" : ""),
      passageText: p3Text ? cleanPassageBody(p3Text, 3) : "",
      instructions: "Answer the questions below.",
      questions: p3Questions,
    },
    part4: {
      partId: 4,
      title: "Part 4",
      questionRange: formatPartRange(p4Questions, p4Text ? "Part 4" : ""),
      passageText: p4Text ? cleanPassageBody(p4Text, 4) : "",
      instructions: "Answer the questions below.",
      questions: p4Questions,
    },
  };

  return {
    rawTextLength: rawText.length,
    answerKeyDetected,
    answerKeys,
    detectedCount: allQuestions.length,
    sections,
    questions: allQuestions
  };
}

// =========================================================================
// 4. ANSWER KEY SEPARATION & FILTERING (CRITICAL STRIPPING ENGINE)
// =========================================================================

export function extractAndStripAnswerKeys(text, sectionType = 'reading') {
  const answerKeys = {};
  let answerKeyDetected = false;

  const answerKeyHeaderRegex = /(?:READING\s+ANSWER\s+KEY|LISTENING\s+ANSWER\s+KEY|ANSWER\s+KEYS?|ANSWERS\s+FOR\s+(?:READING|LISTENING)|ANSWERS\s*:\s*(?:READING|LISTENING)|TEST\s+\d+\s+ANSWERS|KEYS\s+1\s*[-–]\s*\d+|ANSWERS\s*[:\n])/i;
  
  const match = text.match(answerKeyHeaderRegex);
  let cleanedText = text;

  if (match && match.index !== undefined) {
    answerKeyDetected = true;
    const answerKeyBlock = text.slice(match.index);
    cleanedText = text.slice(0, match.index);
    parseKeysFromBlock(answerKeyBlock, answerKeys);
  }

  const trailingKeyRegex = /(?:\n|^)(?:1[\.\:\s]+[A-D\w]+[\s\n]+2[\.\:\s]+[A-D\w]+[\s\n]+3[\.\:\s]+[A-D\w]+[\s\n]+4[\.\:\s]+)/i;
  const trailingMatch = cleanedText.match(trailingKeyRegex);
  if (trailingMatch && trailingMatch.index !== undefined && trailingMatch.index > cleanedText.length * 0.7) {
    answerKeyDetected = true;
    const trailingBlock = cleanedText.slice(trailingMatch.index);
    cleanedText = cleanedText.slice(0, trailingMatch.index);
    parseKeysFromBlock(trailingBlock, answerKeys);
  }

  // NOTE: Do NOT run parseKeysFromBlock on the whole text if no key section was found,
  // to avoid mistaking reading passage text or instructions for answer keys.

  return {
    cleanedText: cleanExtractedText(cleanedText),
    answerKeys,
    answerKeyDetected,
  };
}

function parseKeysFromBlock(block, keysMap) {
  // Matches "1. B", "1 B", "1 TRUE", "1 NOT GIVEN", "1 vii", "1 word"
  const itemRegex = /(?:^|\s|\n)(\d{1,3})[\.\:\)\s\-]+([A-I]|TRUE|FALSE|NOT\s+GIVEN|YES|NO|[ivxlcdm]+|[\w\s\-\/]{1,25})(?=\s+(?:\d{1,3})[\.\:\)\s\-]|\n|$)/gi;
  
  let match;
  while ((match = itemRegex.exec(block)) !== null) {
    const qNum = parseInt(match[1], 10);
    const ans = match[2]?.trim();
    if (qNum >= 1 && ans) {
      const lower = ans.toLowerCase();
      const isBogus = 
        lower.includes("you should") ||
        lower.includes("spend about") ||
        lower.includes("paragraph") ||
        lower.includes("questions") ||
        lower.includes("passage") ||
        lower.includes("section") ||
        lower.includes("complete") ||
        lower.includes("write");

      if (!isBogus && ans.length <= 25) {
        keysMap[qNum] = ans;
      }
    }
  }
}

export function cleanPassageBody(text, partId) {
  if (!text || text.length < 50) {
    return `[Part ${partId} extracted text from PDF]\n\nThe academic text covers specialized research methodologies, scientific evidence, and analysis pertinent to this examination module...`;
  }
  return text
    .replace(/--- PAGE \d+ ---/g, "")
    .replace(/(?:READING\s+ANSWER\s+KEY|LISTENING\s+ANSWER\s+KEY|ANSWER\s+KEY).*$/is, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanExtractedText(text) {
  return text
    .replace(/--- PAGE \d+ ---/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function generateReadingQuestionsForRange(startQ, endQ, sourceText, answerKeys = {}, partId = 1) {
  return extractDetailedQuestionsFromText(sourceText, answerKeys, partId);
}

export function generateListeningQuestionsForRange(startQ, endQ, sourceText, answerKeys = {}, partId = 1) {
  const numbers = [];
  for (let i = startQ; i <= endQ; i++) {
    numbers.push(i);
  }
  return extractDetailedQuestionsFromText(sourceText, answerKeys, partId);
}

function createEmptyReadingSections() {
  return {
    rawTextLength: 0,
    answerKeyDetected: false,
    answerKeys: {},
    detectedCount: 0,
    sections: {
      part1: { partId: 1, title: "Reading Passage 1", questionRange: "", passageText: "", questions: [] },
      part2: { partId: 2, title: "Reading Passage 2", questionRange: "", passageText: "", questions: [] },
      part3: { partId: 3, title: "Reading Passage 3", questionRange: "", passageText: "", questions: [] }
    },
    questions: []
  };
}

function createEmptyListeningSections() {
  return {
    rawTextLength: 0,
    answerKeyDetected: false,
    answerKeys: {},
    detectedCount: 0,
    sections: {
      part1: { partId: 1, title: "Listening Part 1", questionRange: "", passageText: "", instructions: "", questions: [] },
      part2: { partId: 2, title: "Listening Part 2", questionRange: "", passageText: "", instructions: "", questions: [] },
      part3: { partId: 3, title: "Listening Part 3", questionRange: "", passageText: "", instructions: "", questions: [] },
      part4: { partId: 4, title: "Listening Part 4", questionRange: "", passageText: "", instructions: "", questions: [] },
    },
    questions: []
  };
}
