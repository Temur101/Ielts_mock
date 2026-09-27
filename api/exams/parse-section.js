import {
  resilientParseReading,
  resilientParseListening,
  resilientParseWriting,
  recoverMissingQuestions,
  validateSectionParity,
  parseMultipartFormData,
  is503OrUnavailable,
  ensureEnvLoaded,
} from '../../src/lib/ai/api-plugin.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

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
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';

    let sectionType = 'reading';
    const collectedFiles = [];

    if (contentType.includes('multipart/form-data')) {
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;
      if (boundary) {
        const parts = parseMultipartFormData(buffer, boundary);
        for (const p of parts) {
          if (p.name === 'sectionType' || p.name === 'section_type') {
            sectionType = p.data.toString('utf-8').trim().toLowerCase();
          } else if (p.filename) {
            collectedFiles.push({ buffer: p.data, fileName: p.filename });
          }
        }
      }
    } else if (contentType.includes('application/json')) {
      const jsonBody = JSON.parse(buffer.toString('utf-8') || '{}');
      sectionType = (jsonBody.sectionType || jsonBody.section_type || 'reading').toLowerCase();
      const filesJson = jsonBody.files || (jsonBody.fileBase64 ? [{ base64: jsonBody.fileBase64, fileName: jsonBody.fileName }] : []);
      for (const f of filesJson) {
        collectedFiles.push({ buffer: Buffer.from(f.base64, 'base64'), fileName: f.fileName });
      }
    }

    if (collectedFiles.length === 0) {
      if (typeof res.status === 'function') {
        return res.status(400).json({ error: 'No PDF files found in request' });
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No PDF files found in request' }));
    }

    let parsedResult = null;
    if (sectionType === 'listening') {
      parsedResult = await resilientParseListening(collectedFiles);
    } else if (sectionType === 'writing') {
      parsedResult = await resilientParseWriting(collectedFiles[0].buffer, collectedFiles[0].fileName);
    } else {
      parsedResult = await resilientParseReading(collectedFiles);
    }

    if (parsedResult && sectionType !== 'writing') {
      let parityReport = validateSectionParity(parsedResult);
      if (parityReport.missingNumbers.length > 0) {
        try {
          const recoveredQuestions = await recoverMissingQuestions({
            files: collectedFiles,
            sectionType,
            missingNumbers: parityReport.missingNumbers,
            answerKeys: parsedResult.answer_keys || parsedResult.answerKeys || {},
            existingQuestions: parsedResult.questions || [],
          });

          if (recoveredQuestions && recoveredQuestions.length > 0) {
            if (!Array.isArray(parsedResult.questions)) {
              parsedResult.questions = [];
            }
            parsedResult.questions.push(...recoveredQuestions);
            parityReport = validateSectionParity(parsedResult);
          }
        } catch (gapErr) {
          console.warn('[API parse-section] Gap fill error (non-fatal):', gapErr.message);
        }
      }
      parsedResult._parity = parityReport;
    }

    if (typeof res.status === 'function') {
      return res.status(200).json({ sectionType, data: parsedResult });
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ sectionType, data: parsedResult }));
  } catch (err) {
    console.error('[API parse-section error]:', err);
    const is503 = is503OrUnavailable(err);
    const isRateLimit = !is503 && ((err.message || '').includes('429') || (err.message || '').includes('quota') || (err.message || '').includes('RESOURCE_EXHAUSTED'));
    const statusCode = is503 ? 503 : isRateLimit ? 429 : 500;
    if (typeof res.status === 'function') {
      return res.status(statusCode).json({ error: err.message || 'Failed to parse section', isRateLimit, is503 });
    }
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ error: err.message || 'Failed to parse section', isRateLimit, is503 }));
  }
}
