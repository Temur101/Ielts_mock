/**
 * Robust student merging utility.
 * Merges existing local student state with incoming updates from Supabase or Realtime events.
 * Prevents accidental erasure of student roster when incoming datasets are empty or partial.
 */

export function mergeStudentsById(prev = [], incoming = []) {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Array.isArray(prev) ? prev : [];
  }
  if (!Array.isArray(prev) || prev.length === 0) {
    return incoming.filter(Boolean);
  }

  const map = new Map(prev.map(s => [s.id, { ...s }]));

  for (const inc of incoming) {
    if (!inc || !inc.id) continue;
    const existing = map.get(inc.id);

    if (!existing) {
      map.set(inc.id, { ...inc });
    } else {
      // Deep merge answers so partial section updates do not wipe other sections
      const mergedAnswers = {
        ...(existing.answers || {}),
        ...(inc.answers || {}),
        reading: {
          ...((existing.answers && existing.answers.reading) || {}),
          ...((inc.answers && inc.answers.reading) || {})
        },
        listening: {
          ...((existing.answers && existing.answers.listening) || {}),
          ...((inc.answers && inc.answers.listening) || {})
        },
        writing: {
          ...((existing.answers && existing.answers.writing) || {}),
          ...((inc.answers && inc.answers.writing) || {})
        }
      };

      const resolvedName = inc.name || existing.name || inc.student_name || existing.student_name || 'Candidate';
      const resolvedPhone = inc.phone || existing.phone || inc.phone_number || existing.phone_number || '';

      map.set(inc.id, {
        ...existing,
        ...inc,
        name: resolvedName,
        student_name: resolvedName,
        phone: resolvedPhone,
        phone_number: resolvedPhone,
        candidate_no: inc.candidate_no || existing.candidate_no || 'CAND-001',
        answers: mergedAnswers,
        // Preserve computed scores if incoming has null/undefined
        reading_score: inc.reading_score ?? existing.reading_score ?? null,
        reading_band: inc.reading_band ?? existing.reading_band ?? null,
        listening_score: inc.listening_score ?? existing.listening_score ?? null,
        listening_band: inc.listening_band ?? existing.listening_band ?? null,
        writing_task1_essay: inc.writing_task1_essay || existing.writing_task1_essay || '',
        writing_task2_essay: inc.writing_task2_essay || existing.writing_task2_essay || '',
        writing_task1_band: inc.writing_task1_band ?? existing.writing_task1_band ?? null,
        writing_task2_band: inc.writing_task2_band ?? existing.writing_task2_band ?? null,
        writing_band: inc.writing_band ?? existing.writing_band ?? null,
        overall_band: inc.overall_band ?? existing.overall_band ?? null,
        score: inc.score ?? existing.score ?? null,
        band_score: inc.band_score ?? existing.band_score ?? null,
        writing_ai_evaluation: inc.writing_ai_evaluation || existing.writing_ai_evaluation || null,
        // Status resolution: if existing was submitted/completed, don't revert to waiting
        status: (inc.status && inc.status !== 'waiting') 
          ? inc.status 
          : (existing.status && existing.status !== 'waiting' ? existing.status : (inc.status || 'waiting')),
        current_stage: inc.current_stage || existing.current_stage || 'listening_lobby',
        last_seen: inc.last_seen || existing.last_seen || new Date().toISOString()
      });
    }
  }

  return Array.from(map.values());
}
