/**
 * Robust student merging utility.
 * Merges existing local student state with incoming updates from Supabase or Realtime events.
 * Prevents accidental erasure of student roster when incoming datasets are empty or partial.
 */

/**
 * Normalizes candidate identity for deduplication (same candidate joining twice or refreshing)
 */
function getCandidateIdentityKey(student) {
  if (!student) return null;
  const rawPhone = (student.phone || student.phone_number || (student.answers && student.answers.candidate_phone) || '').toString();
  const phoneDigits = rawPhone.replace(/\D/g, '');
  const nameNorm = (student.name || student.student_name || '').trim().toLowerCase();

  // If phone has at least 6 digits, use phone + name as primary identity key
  if (phoneDigits.length >= 6) {
    return `${phoneDigits}_${nameNorm}`;
  }
  // Fallback to name if phone is missing but name is distinct
  if (nameNorm.length >= 2) {
    return `name_${nameNorm}`;
  }
  return null;
}

export function mergeStudentsById(prev = [], incoming = []) {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Array.isArray(prev) ? prev : [];
  }
  if (!Array.isArray(prev) || prev.length === 0) {
    // Deduplicate incoming array itself
    const initialMap = new Map();
    const identityToId = new Map();

    for (const inc of incoming) {
      if (!inc || !inc.id) continue;
      const idKey = getCandidateIdentityKey(inc);
      if (idKey && identityToId.has(idKey)) {
        const primaryId = identityToId.get(idKey);
        const existing = initialMap.get(primaryId);
        if (existing) {
          initialMap.set(primaryId, { ...existing, ...inc, id: primaryId });
          continue;
        }
      }
      initialMap.set(inc.id, { ...inc });
      if (idKey) identityToId.set(idKey, inc.id);
    }
    return Array.from(initialMap.values());
  }

  const map = new Map(prev.map(s => [s.id, { ...s }]));
  const identityToId = new Map();

  for (const s of prev) {
    if (!s || !s.id) continue;
    const idKey = getCandidateIdentityKey(s);
    if (idKey && !identityToId.has(idKey)) {
      identityToId.set(idKey, s.id);
    }
  }

  for (const inc of incoming) {
    if (!inc || !inc.id) continue;

    // 1. Try finding by direct ID
    let targetId = inc.id;
    let existing = map.get(targetId);

    // 2. If not found by direct ID, check if matching candidate identity already exists
    if (!existing) {
      const incIdentityKey = getCandidateIdentityKey(inc);
      if (incIdentityKey && identityToId.has(incIdentityKey)) {
        targetId = identityToId.get(incIdentityKey);
        existing = map.get(targetId);
      }
    }

    if (!existing) {
      map.set(inc.id, { ...inc });
      const idKey = getCandidateIdentityKey(inc);
      if (idKey) identityToId.set(idKey, inc.id);
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

      // Status resolution with Kick & Disqualification Protection
      const existingIsKicked = existing.status === 'kicked' || existing.status === 'disqualified';
      const incomingIsKicked = inc.status === 'kicked' || inc.status === 'disqualified';
      const incomingIsUnban = inc.status === 'in_progress' && inc.disqualification_reason === null && inc.is_disqualified === false;

      let resolvedStatus = inc.status || existing.status || 'waiting';
      if (incomingIsUnban) {
        resolvedStatus = 'in_progress';
      } else if (existingIsKicked && !incomingIsUnban) {
        resolvedStatus = existing.status;
      } else if (incomingIsKicked) {
        resolvedStatus = inc.status;
      } else if (existing.status === 'submitted' || existing.status === 'completed') {
        resolvedStatus = (inc.status === 'completed' || inc.status === 'submitted') ? inc.status : existing.status;
      } else if (inc.status && inc.status !== 'waiting') {
        resolvedStatus = inc.status;
      } else if (existing.status && existing.status !== 'waiting') {
        resolvedStatus = existing.status;
      }

      // Warning count resolution (never decreases unless unbanned)
      const resolvedWarningCount = incomingIsUnban
        ? 0
        : Math.max(existing.warning_count || 0, inc.warning_count || 0);

      // Disqualification fields
      const resolvedDisqualReason = incomingIsUnban
        ? null
        : (inc.disqualification_reason ?? existing.disqualification_reason ?? (resolvedStatus === 'kicked' ? 'Kicked by instructor' : null));
      const resolvedIsDisqualified = incomingIsUnban
        ? false
        : (resolvedStatus === 'kicked' || resolvedStatus === 'disqualified' || Boolean(inc.is_disqualified ?? existing.is_disqualified));

      map.set(targetId, {
        ...existing,
        ...inc,
        id: targetId,
        name: resolvedName,
        student_name: resolvedName,
        phone: resolvedPhone,
        phone_number: resolvedPhone,
        candidate_no: existing.candidate_no || inc.candidate_no || 'CAND-001',
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
        status: resolvedStatus,
        is_disqualified: resolvedIsDisqualified,
        disqualification_reason: resolvedDisqualReason,
        warning_count: resolvedWarningCount,
        current_stage: inc.current_stage || existing.current_stage || 'listening_lobby',
        last_seen: inc.last_seen || existing.last_seen || new Date().toISOString()
      });
    }
  }

  return Array.from(map.values());
}
