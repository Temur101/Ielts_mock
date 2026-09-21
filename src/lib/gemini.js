/**
 * Secure IELTS Writing Evaluation Client Interface
 * Delegates all AI evaluations to the backend server endpoint /api/exams/grade-writing.
 * Direct frontend calls to Google Generative Language API and client-side key storage are eliminated.
 */

/**
 * Official IELTS Band rounding helper: rounds to nearest 0.5
 */
export function roundToIeltsHalfBand(score) {
  if (score === null || score === undefined || isNaN(score)) return 6.0;
  const clamped = Math.max(0, Math.min(9, Number(score)));
  return Math.round(clamped * 2) / 2;
}

/**
 * Legacy stubs to preserve signature compatibility without exposing or persisting keys.
 */
export function getGeminiApiKey() {
  return '';
}

export function setGeminiApiKey() {
  // No-op: API keys must only reside in secure server environment (.env)
}

/**
 * Securely evaluates IELTS Writing Task 1 and Task 2 via backend endpoint.
 */
export async function evaluateWritingWithGemini({
  task1Prompt = "",
  task1Essay = "",
  task2Prompt = "",
  task2Essay = "",
}) {
  const response = await fetch('/api/exams/grade-writing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task_1_submission: task1Essay,
      task_2_submission: task2Essay,
      task_1_prompt: task1Prompt,
      task_2_prompt: task2Prompt,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Server evaluation failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error) errorMessage = errJson.error;
    } catch {}
    throw new Error(errorMessage);
  }

  const result = await response.json();
  return result;
}

