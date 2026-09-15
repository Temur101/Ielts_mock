/**
 * Vite Server Plugin providing backend API routes for Google Gemini AI:
 * - POST /api/exams/parse-pdf  (Streamlined 3-PDF parser + Supabase persistence)
 * - POST /api/exams/grade-writing (Strict IELTS Examiner)
 */

import fs from 'fs';
import path from 'path';
import { parseExamPdf, parseThreePartExamPdf, gradeWritingSubmission } from './gemini-service.js';
import { persistExamAndSections } from '../supabase.js';

// Auto-load .env into process.env if not already present
function ensureEnvLoaded() {
  if (process.env.GEMINI_API_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const envPaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '.env.local'),
    ];
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[api-plugin] Failed to auto-load .env file:', e.message);
  }
}

ensureEnvLoaded();

function parseMultipartFormData(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let startIndex = buffer.indexOf(boundaryBuffer);

  while (startIndex !== -1) {
    const nextIndex = buffer.indexOf(boundaryBuffer, startIndex + boundaryBuffer.length);
    if (nextIndex === -1) break;

    const partBuffer = buffer.slice(startIndex + boundaryBuffer.length, nextIndex);
    const headerEndIndex = partBuffer.indexOf(Buffer.from('\r\n\r\n'));

    if (headerEndIndex !== -1) {
      const headerText = partBuffer.slice(0, headerEndIndex).toString('utf-8');
      // Strip preceding \r\n from boundary in multipart data
      let bodyEnd = partBuffer.length;
      if (bodyEnd >= 2 && partBuffer[bodyEnd - 2] === 13 && partBuffer[bodyEnd - 1] === 10) {
        bodyEnd -= 2;
      }
      const bodyBuffer = partBuffer.slice(headerEndIndex + 4, bodyEnd);

      const nameMatch = headerText.match(/name="([^"]+)"/i) || headerText.match(/name=([^\r\n;]+)/i);
      const filenameMatch = headerText.match(/filename="([^"]+)"/i) || headerText.match(/filename=([^\r\n;]+)/i);

      if (nameMatch) {
        parts.push({
          name: nameMatch[1].trim(),
          filename: filenameMatch ? filenameMatch[1].trim() : null,
          data: bodyBuffer,
        });
      }
    }

    startIndex = nextIndex;
  }

  return parts;
}

export function ieltsGeminiApiPlugin() {
  return {
    name: 'ielts-gemini-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];

        // -------------------------------------------------------------------
        // 1. POST /api/exams/parse-pdf
        // -------------------------------------------------------------------
        if (req.method === 'POST' && url === '/api/exams/parse-pdf') {
          try {
            ensureEnvLoaded();
            const chunks = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || '';

            // Multi-part file containers
            let listeningPdfBuffer = null;
            let listeningFileName = 'Listening.pdf';
            let readingPdfBuffer = null;
            let readingFileName = 'Reading.pdf';
            let writingPdfBuffer = null;
            let writingFileName = 'Writing.pdf';

            // Audio track URLs or files
            const audioTracks = {
              part1: '',
              part2: '',
              part3: '',
              part4: '',
            };

            // Meta
            let examId = null;
            let pinCode = null;
            let title = 'IELTS Academic Master Assessment';
            let durationMins = 60;
            let sectionType = null;
            let legacyBuffer = null;
            let legacyFileName = 'Exam.pdf';

            if (contentType.includes('multipart/form-data')) {
              const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
              const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;

              if (boundary) {
                const parts = parseMultipartFormData(buffer, boundary);
                for (const p of parts) {
                  const name = p.name;
                  if (name === 'listeningPdf' || name === 'listening_pdf') {
                    listeningPdfBuffer = p.data;
                    if (p.filename) listeningFileName = p.filename;
                  } else if (name === 'readingPdf' || name === 'reading_pdf') {
                    readingPdfBuffer = p.data;
                    if (p.filename) readingFileName = p.filename;
                  } else if (name === 'writingPdf' || name === 'writing_pdf') {
                    writingPdfBuffer = p.data;
                    if (p.filename) writingFileName = p.filename;
                  } else if (name === 'pdf' || (p.filename && !readingPdfBuffer && !listeningPdfBuffer && !writingPdfBuffer)) {
                    legacyBuffer = p.data;
                    if (p.filename) legacyFileName = p.filename;
                  } else if (name === 'audio1' || name === 'audioTrack1' || name === 'part1_audio') {
                    audioTracks.part1 = p.data.toString('utf-8').trim();
                  } else if (name === 'audio2' || name === 'audioTrack2' || name === 'part2_audio') {
                    audioTracks.part2 = p.data.toString('utf-8').trim();
                  } else if (name === 'audio3' || name === 'audioTrack3' || name === 'part3_audio') {
                    audioTracks.part3 = p.data.toString('utf-8').trim();
                  } else if (name === 'audio4' || name === 'audioTrack4' || name === 'part4_audio') {
                    audioTracks.part4 = p.data.toString('utf-8').trim();
                  } else if (name === 'audioTracks' || name === 'audio_parts') {
                    try {
                      Object.assign(audioTracks, JSON.parse(p.data.toString('utf-8')));
                    } catch {}
                  } else if (name === 'examId' || name === 'exam_id') {
                    examId = p.data.toString('utf-8').trim();
                  } else if (name === 'pinCode' || name === 'pin_code') {
                    pinCode = p.data.toString('utf-8').trim();
                  } else if (name === 'title') {
                    title = p.data.toString('utf-8').trim();
                  } else if (name === 'duration' || name === 'durationMins' || name === 'duration_mins') {
                    durationMins = Number(p.data.toString('utf-8').trim()) || 60;
                  } else if (name === 'sectionType' || name === 'section_type') {
                    sectionType = p.data.toString('utf-8').trim().toLowerCase();
                  }
                }
              }
            } else if (contentType.includes('application/json')) {
              const jsonBody = JSON.parse(buffer.toString('utf-8') || '{}');
              sectionType = jsonBody.sectionType || jsonBody.section_type || null;
              examId = jsonBody.examId || jsonBody.exam_id || null;
              pinCode = jsonBody.pinCode || jsonBody.pin_code || null;
              title = jsonBody.title || title;
              durationMins = Number(jsonBody.durationMins || jsonBody.duration_mins) || 60;
              if (jsonBody.audioTracks) Object.assign(audioTracks, jsonBody.audioTracks);

              if (jsonBody.readingPdfBase64) {
                readingPdfBuffer = Buffer.from(jsonBody.readingPdfBase64, 'base64');
                if (jsonBody.readingFileName) readingFileName = jsonBody.readingFileName;
              }
              if (jsonBody.listeningPdfBase64) {
                listeningPdfBuffer = Buffer.from(jsonBody.listeningPdfBase64, 'base64');
                if (jsonBody.listeningFileName) listeningFileName = jsonBody.listeningFileName;
              }
              if (jsonBody.writingPdfBase64) {
                writingPdfBuffer = Buffer.from(jsonBody.writingPdfBase64, 'base64');
                if (jsonBody.writingFileName) writingFileName = jsonBody.writingFileName;
              }
              if (jsonBody.fileBase64) {
                legacyBuffer = Buffer.from(jsonBody.fileBase64, 'base64');
                if (jsonBody.fileName) legacyFileName = jsonBody.fileName;
              }
            }

            let parsedResult = null;

            // Check if any of the 3 stream PDFs were provided
            const hasThreePdfInput = Boolean(listeningPdfBuffer || readingPdfBuffer || writingPdfBuffer);

            if (hasThreePdfInput) {
              parsedResult = await parseThreePartExamPdf({
                listeningPdfBuffer,
                listeningFileName,
                readingPdfBuffer,
                readingFileName,
                writingPdfBuffer,
                writingFileName,
                audioTracks,
                examId,
                pinCode,
                title,
                durationMins,
              });
            } else if (legacyBuffer) {
              // Backward compatibility for single section parsing
              if (sectionType === 'listening') {
                listeningPdfBuffer = legacyBuffer;
                listeningFileName = legacyFileName;
              } else if (sectionType === 'writing') {
                writingPdfBuffer = legacyBuffer;
                writingFileName = legacyFileName;
              } else {
                readingPdfBuffer = legacyBuffer;
                readingFileName = legacyFileName;
              }

              parsedResult = await parseThreePartExamPdf({
                listeningPdfBuffer,
                listeningFileName,
                readingPdfBuffer,
                readingFileName,
                writingPdfBuffer,
                writingFileName,
                audioTracks,
                examId,
                pinCode,
                title,
                durationMins,
              });
            } else {
              throw new Error('No PDF files found in request. Please upload listeningPdf, readingPdf, or writingPdf.');
            }

            // Persist the real extracted JSON payload directly into Supabase (exams / exam_sections tables)
            if (examId) {
              try {
                console.log(`[API /api/exams/parse-pdf] Persisting extracted exam payload to Supabase for exam ${examId}...`);
                await persistExamAndSections(examId, parsedResult);
              } catch (dbErr) {
                console.warn('[API /api/exams/parse-pdf] Supabase persistence error (non-fatal):', dbErr.message);
              }
            }

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(parsedResult));
            return;
          } catch (err) {
            console.error('[API /api/exams/parse-pdf error]:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Failed to parse PDF' }));
            return;
          }
        }

        // -------------------------------------------------------------------
        // 2. POST /api/exams/grade-writing
        // -------------------------------------------------------------------
        if (req.method === 'POST' && url === '/api/exams/grade-writing') {
          try {
            ensureEnvLoaded();
            const chunks = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const data = JSON.parse(bodyStr || '{}');

            const result = await gradeWritingSubmission({
              task_1_submission: data.task_1_submission || data.task1Text || data.writing_task1_essay || '',
              task_2_submission: data.task_2_submission || data.task2Text || data.writing_task2_essay || '',
              task_1_prompt: data.task_1_prompt || data.task1Prompt || '',
              task_2_prompt: data.task_2_prompt || data.task2Prompt || '',
              studentId: data.studentId || null,
            });

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(result));
            return;
          } catch (err) {
            console.error('[API /api/exams/grade-writing error]:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Failed to grade writing' }));
            return;
          }
        }

        next();
      });
    },
  };
}

