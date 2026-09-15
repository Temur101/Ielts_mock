// Official IELTS Band Score Conversion Tables (Listening & Academic Reading)
export const IELTS_LISTENING_BAND_SCALE = [
  { min: 39, max: 40, band: 9.0, label: "Expert User", desc: "Has fully operational command of spoken English." },
  { min: 37, max: 38, band: 8.5, label: "Very Good User (High)", desc: "Has operational command with occasional inaccuracies." },
  { min: 35, max: 36, band: 8.0, label: "Very Good User", desc: "Has operational command with occasional inaccuracies." },
  { min: 32, max: 34, band: 7.5, label: "Good User (High)", desc: "Understands detailed reasoning and complex spoken discourse." },
  { min: 30, max: 31, band: 7.0, label: "Good User", desc: "Handles complex language and detailed explanations well." },
  { min: 26, max: 29, band: 6.5, label: "Competent User (High)", desc: "Understands complex arguments and conversations." },
  { min: 23, max: 25, band: 6.0, label: "Competent User", desc: "Generally understands spoken English despite some inaccuracies." },
  { min: 18, max: 22, band: 5.5, label: "Modest User (High)", desc: "Understands main points in familiar contexts." },
  { min: 16, max: 17, band: 5.0, label: "Modest User", desc: "Understands main points in familiar contexts." },
  { min: 13, max: 15, band: 4.5, label: "Limited User (High)", desc: "Basic understanding in familiar situations." },
  { min: 10, max: 12, band: 4.0, label: "Limited User", desc: "Frequent misunderstandings in spoken conversations." },
  { min: 0,  max: 9,  band: 0.0, label: "Under 10 (Below Band 4.0)", desc: "Essentially no comprehension or scored below Band 4.0 threshold." }
];

export const IELTS_ACADEMIC_READING_BAND_SCALE = [
  { min: 39, max: 40, band: 9.0, label: "Expert User", desc: "Has fully operational command of the language." },
  { min: 37, max: 38, band: 8.5, label: "Very Good User (High)", desc: "Has operational command with only occasional unsystematic inaccuracies." },
  { min: 35, max: 36, band: 8.0, label: "Very Good User", desc: "Has operational command with occasional inaccuracies." },
  { min: 33, max: 34, band: 7.5, label: "Good User (High)", desc: "Has operational command, though with occasional inaccuracies in some situations." },
  { min: 30, max: 32, band: 7.0, label: "Good User", desc: "Has operational command, generally handles complex language well." },
  { min: 27, max: 29, band: 6.5, label: "Competent User (High)", desc: "Generally has effective command of the language despite some inaccuracies." },
  { min: 23, max: 26, band: 6.0, label: "Competent User", desc: "Has generally effective command despite inaccuracies and misunderstandings." },
  { min: 19, max: 22, band: 5.5, label: "Modest User (High)", desc: "Has partial command of the language, coping with overall meaning." },
  { min: 15, max: 18, band: 5.0, label: "Modest User", desc: "Has partial command, conveys and understands meaning in familiar situations." },
  { min: 13, max: 14, band: 4.5, label: "Limited User (High)", desc: "Basic competence is limited to familiar situations." },
  { min: 10, max: 12, band: 4.0, label: "Limited User", desc: "Basic competence is limited to familiar situations, frequent problems in understanding." },
  { min: 0,  max: 9,  band: 0.0, label: "Under 10 (Below Band 4.0)", desc: "Essentially no operational command or scored below Band 4.0 threshold." }
];

/**
 * Official IELTS Listening Band Score conversion with dynamic test normalization
 */
export function getListeningBand(rawScore, totalQuestions = 40) {
  const safeTotal = totalQuestions > 0 ? totalQuestions : 40;
  const score = safeTotal === 40 ? Math.round(rawScore || 0) : Math.round(((rawScore || 0) / safeTotal) * 40);
  if (score >= 39) return 9.0;
  if (score >= 37) return 8.5;
  if (score >= 35) return 8.0;
  if (score >= 32) return 7.5;
  if (score >= 30) return 7.0;
  if (score >= 26) return 6.5;
  if (score >= 23) return 6.0;
  if (score >= 18) return 5.5;
  if (score >= 16) return 5.0;
  if (score >= 13) return 4.5;
  if (score >= 10) return 4.0;
  return 0.0;
}

/**
 * Official IELTS Academic Reading Band Score conversion with dynamic test normalization
 */
export function getReadingBand(rawScore, totalQuestions = 40) {
  const safeTotal = totalQuestions > 0 ? totalQuestions : 40;
  const score = safeTotal === 40 ? Math.round(rawScore || 0) : Math.round(((rawScore || 0) / safeTotal) * 40);
  if (score >= 39) return 9.0;
  if (score >= 37) return 8.5;
  if (score >= 35) return 8.0;
  if (score >= 33) return 7.5;
  if (score >= 30) return 7.0;
  if (score >= 27) return 6.5;
  if (score >= 23) return 6.0;
  if (score >= 19) return 5.5;
  if (score >= 15) return 5.0;
  if (score >= 13) return 4.5;
  if (score >= 10) return 4.0;
  return 0.0;
}

// Backward-compatible wrapper aliases
export const calculateIeltsListeningBand = (rawScore, totalQuestions = 40) => getListeningBand(rawScore, totalQuestions);
export const calculateIeltsReadingBand = (rawScore, totalQuestions = 40) => getReadingBand(rawScore, totalQuestions);
export const calculateIeltsBand = calculateIeltsReadingBand;

export function getBandDetails(bandScore) {
  const match = IELTS_ACADEMIC_READING_BAND_SCALE.find(s => s.band === bandScore);
  return match || { band: bandScore, label: "Candidate", desc: "Completed IELTS Mock Exam." };
}

/**
 * Calculates IELTS Writing Band Score from Task 1 (weight 1/3) & Task 2 (weight 2/3)
 */
export function calculateWritingBand(task1Score, task2Score) {
  if (task1Score === null || task1Score === undefined || task2Score === null || task2Score === undefined) {
    return null;
  }
  const t1 = Math.max(0, Math.min(9, Number(task1Score)));
  const t2 = Math.max(0, Math.min(9, Number(task2Score)));
  const weighted = (t1 + 2 * t2) / 3;
  return roundIeltsBand(weighted);
}

/**
 * Calculates Overall IELTS Band Score: Average of (Reading + Listening + Writing)
 * Follows official IELTS rounding rules:
 * - Average ends in .25 -> rounds up to .5
 * - Average ends in .75 -> rounds up to next whole band
 * - Average ends in .125 -> rounds down to whole band, .375 -> .5, .625 -> .5, .875 -> next whole
 */
export function calculateOverallIeltsBand(readingBand, listeningBand, writingBand) {
  const bands = [readingBand, listeningBand, writingBand].filter(b => b !== null && b !== undefined && !isNaN(b));
  if (bands.length === 0) return null;
  const avg = bands.reduce((sum, b) => sum + Number(b), 0) / bands.length;
  return roundIeltsBand(avg);
}

export function roundIeltsBand(score) {
  if (score === null || score === undefined || isNaN(score)) return 0;
  const integerPart = Math.floor(score);
  const decimal = score - integerPart;

  if (decimal < 0.25) {
    return integerPart;
  } else if (decimal < 0.75) {
    return integerPart + 0.5;
  } else {
    return integerPart + 1.0;
  }
}

/**
 * Normalizes an answer string for strict and flexible matching
 */
export function normalizeAnswer(str) {
  if (str === undefined || str === null) return "";
  let clean = String(str).toLowerCase().trim();
  
  // Strip trailing periods, extra internal spaces, quotes
  clean = clean.replace(/^[.\s,"']+|[.\s,"']+$/g, '');
  clean = clean.replace(/\s+/g, ' ');

  // Standardize true/false/not given & yes/no/not given abbreviations
  if (clean === "t" || clean === "true") return "true";
  if (clean === "f" || clean === "false") return "false";
  if (clean === "ng" || clean === "not given" || clean === "notgiven") return "not given";
  if (clean === "y" || clean === "yes") return "yes";
  if (clean === "n" || clean === "no") return "no";

  return clean;
}

/**
 * Check if student answer matches any accepted variant
 */
export function isAnswerCorrect(studentAnswer, acceptedAnswers) {
  if (!studentAnswer || !acceptedAnswers) return false;
  
  const studentNorm = normalizeAnswer(studentAnswer);
  if (!studentNorm) return false;

  const variants = Array.isArray(acceptedAnswers) 
    ? acceptedAnswers 
    : String(acceptedAnswers).split(/[\/|;,]+/);

  return variants.some(variant => {
    const varNorm = normalizeAnswer(variant);
    if (studentNorm === varNorm) return true;

    // Check hyphen vs space matching (e.g., "hydro-static" vs "hydrostatic" or "black box" vs "black-box")
    const dehyphenStudent = studentNorm.replace(/[-_]/g, ' ');
    const dehyphenVar = varNorm.replace(/[-_]/g, ' ');
    if (dehyphenStudent === dehyphenVar) return true;

    const noSpaceStudent = studentNorm.replace(/[\s-_]/g, '');
    const noSpaceVar = varNorm.replace(/[\s-_]/g, '');
    return noSpaceStudent === noSpaceVar;
  });
}

/**
 * Grades a section (Reading or Listening) with 40 questions
 */
export function gradeSectionExam(questions = [], studentAnswers = {}, sectionType = 'reading') {
  let rawScore = 0;
  const breakdown = [];

  questions.forEach(q => {
    const qNum = q.questionNumber;
    const studentAns = studentAnswers[qNum] || "";
    const correct = isAnswerCorrect(studentAns, q.acceptedAnswers);

    if (correct) {
      rawScore += 1;
    }

    breakdown.push({
      questionNumber: qNum,
      passageId: q.passageId || q.partId || 1,
      type: q.type,
      text: q.text,
      studentAnswer: studentAns,
      acceptedAnswers: q.acceptedAnswers,
      isCorrect: correct,
      explanation: q.explanation || "No explanation provided."
    });
  });

  const totalQuestions = questions.length || 40;
  const bandScore = sectionType === 'listening' 
    ? getListeningBand(rawScore, totalQuestions)
    : getReadingBand(rawScore, totalQuestions);

  const percentage = Math.round((rawScore / (totalQuestions || 1)) * 100);

  return {
    rawScore,
    totalQuestions,
    bandScore,
    percentage,
    breakdown,
    completedAt: new Date().toISOString(),
  };
}

export const gradeStudentExam = (questions, studentAnswers = {}) => {
  return gradeSectionExam(questions, studentAnswers, 'reading');
};
