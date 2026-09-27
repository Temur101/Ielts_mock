import React from 'react';
import { StudentExamRoom } from './StudentExamRoom';
import { generateUUID } from '../../lib/supabase';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Universal StudentExam container component.
 * Completely free of mock data dependencies, mockData.js imports, or DEFAULT_IELTS_EXAM.
 * Auto-normalizes student.id to a valid UUID v4 and synchronizes localStorage.
 */
export function StudentExam({
  exam = null,
  student = null,
  ...props
}) {
  const safeExam = exam || null;

  // UUID v4 verification & auto-normalization for student.id
  let normalizedStudent = student;
  if (student && typeof student === 'object') {
    const currentId = String(student.id || '').trim();
    if (!UUID_V4_REGEX.test(currentId)) {
      const newUuid = generateUUID();
      normalizedStudent = {
        ...student,
        id: newUuid,
      };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('ielts_student', JSON.stringify(normalizedStudent));
          localStorage.setItem('current_student', JSON.stringify(normalizedStudent));
        }
      } catch (err) {
        console.warn('[StudentExam] Failed to update normalized student in localStorage:', err);
      }
    }
  }

  return (
    <StudentExamRoom
      exam={safeExam}
      student={normalizedStudent}
      {...props}
    />
  );
}

export { StudentExamRoom };
export default StudentExam;
