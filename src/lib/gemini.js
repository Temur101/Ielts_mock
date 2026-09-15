/**
 * Google Gemini AI Evaluation Service for IELTS Writing
 * Evaluates Task 1 (Report) and Task 2 (Essay) according to official IELTS assessment criteria:
 * 1. Task Achievement / Task Response (0.0 - 9.0)
 * 2. Coherence and Cohesion (0.0 - 9.0)
 * 3. Lexical Resource (0.0 - 9.0)
 * 4. Grammatical Range and Accuracy (0.0 - 9.0)
 */

export function getGeminiApiKey() {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem('gemini_api_key');
  if (stored && stored.trim()) return stored.trim();
  
  const envKey = import.meta.env?.VITE_GEMINI_API_KEY;
  if (envKey && envKey.trim()) return envKey.trim();

  return '';
}

export function setGeminiApiKey(key) {
  if (typeof window !== 'undefined') {
    if (!key || !key.trim()) {
      localStorage.removeItem('gemini_api_key');
    } else {
      localStorage.setItem('gemini_api_key', key.trim());
    }
  }
}

/**
 * Official IELTS Band rounding helper: rounds to nearest 0.5
 */
export function roundToIeltsHalfBand(score) {
  if (score === null || score === undefined || isNaN(score)) return 6.0;
  const clamped = Math.max(0, Math.min(9, Number(score)));
  return Math.round(clamped * 2) / 2;
}

/**
 * Calls Gemini 1.5 API to grade Writing Task 1 and Task 2
 */
export async function evaluateWritingWithGemini({
  task1Prompt = "",
  task1Essay = "",
  task2Prompt = "",
  task2Essay = "",
  apiKey = null,
}) {
  const activeKey = (apiKey && apiKey.trim()) || getGeminiApiKey();

  if (!activeKey) {
    throw new Error(
      "GEMINI_API_KEY_REQUIRED: Please enter your Google Gemini API key to enable AI evaluation."
    );
  }

  const prompt = `You are a certified, senior IELTS Academic Examiner. Evaluate the following candidate's IELTS Writing submissions strictly according to the official IELTS Public Band Descriptors.

### TASK 1 (Report/Chart, Minimum 150 words):
- Prompt Instructions:
${task1Prompt || "No prompt provided. Assume standard IELTS Academic Task 1 data report."}

- Candidate Submission:
${task1Essay ? task1Essay.trim() : "[Candidate left Task 1 blank]"}

---

### TASK 2 (Discursive Essay, Minimum 250 words):
- Prompt Instructions:
${task2Prompt || "No prompt provided. Assume standard IELTS Academic Task 2 essay."}

- Candidate Submission:
${task2Essay ? task2Essay.trim() : "[Candidate left Task 2 blank]"}

---

### EVALUATION CRITERIA (Score each on a 0.0 - 9.0 scale, increments of 0.5):
1. Task Achievement (for Task 1) / Task Response (for Task 2)
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

Overall Task Band = Average of the 4 criteria rounded to the nearest 0.5.
Overall Writing Band = (Task 1 Band + 2 * Task 2 Band) / 3, rounded to nearest 0.5.

Return a valid, strict JSON object with EXACTLY this structure:
{
  "task1_evaluation": {
    "task_achievement": 6.5,
    "coherence_cohesion": 6.0,
    "lexical_resource": 6.5,
    "grammatical_accuracy": 6.0,
    "band": 6.5,
    "comments": "Concise 1-2 sentence examiner summary of Task 1 performance"
  },
  "task2_evaluation": {
    "task_response": 7.0,
    "coherence_cohesion": 7.0,
    "lexical_resource": 7.0,
    "grammatical_accuracy": 6.5,
    "band": 7.0,
    "comments": "Concise 1-2 sentence examiner summary of Task 2 performance"
  },
  "overall_writing_band": 7.0,
  "feedback": "Comprehensive constructive feedback explaining why this score was awarded and what is needed to reach the next band.",
  "highlighted_errors": [
    {
      "task": 1,
      "original": "error snippet from text",
      "correction": "corrected academic phrasing",
      "explanation": "why this correction improves lexical resource or grammatical accuracy"
    },
    {
      "task": 2,
      "original": "error snippet from text",
      "correction": "corrected phrasing",
      "explanation": "grammatical or lexical explanation"
    }
  ]
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || response.statusText;
    } catch {
      errorDetail = response.statusText;
    }
    throw new Error(`Gemini API Error (${response.status}): ${errorDetail}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  try {
    const parsed = JSON.parse(rawText);
    
    // Validate and clean scores
    const t1Band = roundToIeltsHalfBand(parsed.task1_evaluation?.band ?? 6.0);
    const t2Band = roundToIeltsHalfBand(parsed.task2_evaluation?.band ?? 6.0);
    const calculatedOverall = roundToIeltsHalfBand((t1Band + 2 * t2Band) / 3);

    return {
      task1_evaluation: {
        task_achievement: Number(parsed.task1_evaluation?.task_achievement || t1Band),
        coherence_cohesion: Number(parsed.task1_evaluation?.coherence_cohesion || t1Band),
        lexical_resource: Number(parsed.task1_evaluation?.lexical_resource || t1Band),
        grammatical_accuracy: Number(parsed.task1_evaluation?.grammatical_accuracy || t1Band),
        band: t1Band,
        comments: parsed.task1_evaluation?.comments || "Evaluated according to IELTS Band Descriptors."
      },
      task2_evaluation: {
        task_response: Number(parsed.task2_evaluation?.task_response || t2Band),
        coherence_cohesion: Number(parsed.task2_evaluation?.coherence_cohesion || t2Band),
        lexical_resource: Number(parsed.task2_evaluation?.lexical_resource || t2Band),
        grammatical_accuracy: Number(parsed.task2_evaluation?.grammatical_accuracy || t2Band),
        band: t2Band,
        comments: parsed.task2_evaluation?.comments || "Evaluated according to IELTS Band Descriptors."
      },
      task1_band: t1Band,
      task2_band: t2Band,
      overall_writing_band: roundToIeltsHalfBand(parsed.overall_writing_band ?? calculatedOverall),
      feedback: parsed.feedback || "Detailed examiner feedback generated by Gemini 1.5 Flash.",
      highlighted_errors: Array.isArray(parsed.highlighted_errors) ? parsed.highlighted_errors : [],
      evaluated_at: new Date().toISOString(),
      model: "gemini-1.5-flash"
    };
  } catch (err) {
    console.error("Failed to parse Gemini JSON output:", rawText, err);
    throw new Error("Could not parse structured evaluation from Gemini output.");
  }
}
