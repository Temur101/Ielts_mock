import { gradeWritingSubmission } from '../../src/lib/ai/gemini-service.js';
import { ensureEnvLoaded } from '../../src/lib/ai/api-plugin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    if (typeof res.status === 'function') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    ensureEnvLoaded();
    const data = req.body || {};
    const result = await gradeWritingSubmission({
      task_1_submission: data.task_1_submission || data.task1Text || data.writing_task1_essay || '',
      task_2_submission: data.task_2_submission || data.task2Text || data.writing_task2_essay || '',
      task_1_prompt: data.task_1_prompt || data.task1Prompt || '',
      task_2_prompt: data.task_2_prompt || data.task2Prompt || '',
      studentId: data.studentId || null,
    });

    if (typeof res.status === 'function') {
      return res.status(200).json(result);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[API grade-writing error]:', err);
    if (typeof res.status === 'function') {
      return res.status(500).json({ error: err.message || 'Failed to grade writing' });
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Failed to grade writing' }));
  }
}
