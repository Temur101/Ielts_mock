/**
 * In-Memory Answer Key Vault & Candidate Exam Sanitizer
 * Protects Cambridge IELTS answer keys from client-side DevTools and localStorage exposure.
 */

// Private module closure — inaccessible to window, localStorage, and React DevTools
const _vault = new Map();

/**
 * Stores exam answer keys in private closure memory
 */
export function sealAnswerKeys(pinCode, examData) {
  if (!pinCode || !examData) return;
  const pin = String(pinCode).trim().toUpperCase();

  const readingQuestions = examData.reading_questions || examData.reading?.questions || examData.questions || [];
  const listeningQuestions = examData.listening_questions || examData.listening?.questions || [];
  const answerKeys = examData.answer_keys || {};

  _vault.set(pin, {
    readingQuestions: JSON.parse(JSON.stringify(readingQuestions)),
    listeningQuestions: JSON.parse(JSON.stringify(listeningQuestions)),
    answerKeys: JSON.parse(JSON.stringify(answerKeys)),
    sealedAt: Date.now()
  });
}

// Alias matching dispatch specification
export const sealExamAnswers = sealAnswerKeys;

/**
 * Retrieves sealed answer keys from private closure memory
 */
export function getSealedAnswerKeys(pinCode) {
  if (!pinCode) return null;
  return _vault.get(String(pinCode).trim().toUpperCase()) || null;
}

// Alias matching dispatch specification
export const retrieveExamAnswers = getSealedAnswerKeys;

/**
 * Clears sealed keys for a specific PIN
 */
export function clearSealedAnswerKeys(pinCode) {
  if (!pinCode) return;
  _vault.delete(String(pinCode).trim().toUpperCase());
}

/**
 * Deep-sanitizes an exam object to remove all acceptedAnswers, explanations, and answer_keys
 * Safe for storing in React state and candidate localStorage.
 */
export function sanitizeExamForCandidate(exam) {
  if (!exam) return exam;
  const clean = JSON.parse(JSON.stringify(exam));

  delete clean.answer_keys;

  const stripFromQuestions = (qs) => {
    if (!Array.isArray(qs)) return [];
    return qs.map(q => {
      const { acceptedAnswers, explanation, ...safeQ } = q;
      return safeQ;
    });
  };

  if (clean.reading_questions) clean.reading_questions = stripFromQuestions(clean.reading_questions);
  if (clean.listening_questions) clean.listening_questions = stripFromQuestions(clean.listening_questions);
  if (clean.questions) clean.questions = stripFromQuestions(clean.questions);
  if (clean.parsed_questions) clean.parsed_questions = stripFromQuestions(clean.parsed_questions);

  if (clean.reading?.questions) clean.reading.questions = stripFromQuestions(clean.reading.questions);
  if (clean.listening?.questions) clean.listening.questions = stripFromQuestions(clean.listening.questions);

  return clean;
}

/**
 * Hydrates stripped candidate questions with acceptedAnswers from the sealed vault for scoring
 */
export function hydrateQuestionsWithAnswers(candidateQuestions = [], sealedQuestions = [], answerKeys = {}) {
  if (!Array.isArray(candidateQuestions)) return [];
  const sealedMap = new Map();

  if (Array.isArray(sealedQuestions)) {
    sealedQuestions.forEach(sq => {
      const num = Number(sq.questionNumber || sq.q_num || sq.question_number);
      if (num && sq.acceptedAnswers !== undefined) {
        sealedMap.set(num, sq.acceptedAnswers);
      }
    });
  }

  return candidateQuestions.map(q => {
    const num = Number(q.questionNumber || q.q_num || q.question_number);
    let accepted = sealedMap.get(num);
    if (accepted === undefined && answerKeys) {
      accepted = answerKeys[num] ?? answerKeys[String(num)];
    }
    if (accepted === undefined) {
      accepted = q.acceptedAnswers ?? [];
    }
    const sealedQ = Array.isArray(sealedQuestions) 
      ? sealedQuestions.find(sq => Number(sq.questionNumber || sq.q_num || sq.question_number) === num) 
      : null;
    return {
      ...q,
      acceptedAnswers: accepted,
      ...(sealedQ?.explanation ? { explanation: sealedQ.explanation } : {})
    };
  });
}
