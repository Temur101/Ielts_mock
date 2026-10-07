import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  calculateIeltsReadingBand, 
  calculateIeltsListeningBand, 
  calculateWritingBand, 
  calculateOverallIeltsBand,
  isAnswerCorrect
} from './ieltsGrading.js';

/**
 * Computes graded candidate details (Reading, Listening, Writing, Overall bands)
 * based on questions, accepted answers, and student answers.
 */
export function computeGradedStudents(exam, students = []) {
  if (!Array.isArray(students)) return [];

  const rQuestions = exam?.reading?.questions || exam?.reading_questions || exam?.questions || [];
  const lQuestions = exam?.listening?.questions || exam?.listening_questions || [];

  return students.map(s => {
    const rAns = s.answers?.reading || s.answers || {};
    const lAns = s.answers?.listening || {};
    
    // Reading
    let rScore = s.reading_score;
    let rBand = s.reading_band;
    if (rScore === null || rScore === undefined) {
      if (rQuestions.length > 0) {
        rScore = rQuestions.filter(q => isAnswerCorrect(rAns[q.questionNumber], q.acceptedAnswers)).length;
        rBand = calculateIeltsReadingBand(rScore, rQuestions.length || 40);
      } else {
        rScore = s.score ?? null;
        rBand = s.band_score ?? null;
      }
    } else if (rBand === null || rBand === undefined) {
      rBand = calculateIeltsReadingBand(rScore, rQuestions.length || 40);
    }

    // Listening
    let lScore = s.listening_score;
    let lBand = s.listening_band;
    if (lScore === null || lScore === undefined) {
      if (lQuestions.length > 0) {
        lScore = lQuestions.filter(q => isAnswerCorrect(lAns[q.questionNumber], q.acceptedAnswers)).length;
        lBand = calculateIeltsListeningBand(lScore, lQuestions.length || 40);
      } else {
        lScore = null;
        lBand = null;
      }
    } else if (lBand === null || lBand === undefined) {
      lBand = calculateIeltsListeningBand(lScore, lQuestions.length || 40);
    }

    // Writing
    const t1Band = s.writing_task1_band ?? null;
    const t2Band = s.writing_task2_band ?? null;
    const wBand = s.writing_band ?? (t1Band !== null && t2Band !== null ? calculateWritingBand(t1Band, t2Band) : null);

    // Overall
    const oBand = s.overall_band ?? (wBand !== null && rBand !== null && lBand !== null ? calculateOverallIeltsBand(rBand, lBand, wBand) : null);

    return {
      ...s,
      computed_reading_score: rScore,
      computed_reading_band: rBand,
      computed_listening_score: lScore,
      computed_listening_band: lBand,
      computed_writing_band: wBand,
      computed_overall_band: oBand,
    };
  });
}

/**
 * Calculates aggregated cohort statistics from graded students
 */
export function calculateCohortSummary(gradedStudents = []) {
  const readingScores = gradedStudents.map(s => s.computed_reading_score).filter(v => v !== null && v !== undefined);
  const readingBands = gradedStudents.map(s => s.computed_reading_band).filter(v => v !== null && v !== undefined);
  const listeningScores = gradedStudents.map(s => s.computed_listening_score).filter(v => v !== null && v !== undefined);
  const listeningBands = gradedStudents.map(s => s.computed_listening_band).filter(v => v !== null && v !== undefined);
  const writingBands = gradedStudents.map(s => s.computed_writing_band).filter(v => v !== null && v !== undefined);
  const overallBands = gradedStudents.map(s => s.computed_overall_band).filter(v => v !== null && v !== undefined);

  const avg = (arr) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;

  return {
    avgReadingScore: avg(readingScores),
    avgReadingBand: avg(readingBands),
    avgListeningScore: avg(listeningScores),
    avgListeningBand: avg(listeningBands),
    avgWritingBand: avg(writingBands),
    avgOverallBand: avg(overallBands),
    highestOverallBand: overallBands.length ? Math.max(...overallBands) : null,
  };
}

/**
 * Generates and downloads the Official IELTS Mock Results PDF report.
 * Works seamlessly for both current live session and archived past sessions.
 */
export function exportSessionPdf({ exam, students = [], examDate = null }) {
  try {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4',
    });

    const pin = exam?.pin_code || 'SESSION';
    const examTitle = exam?.title || 'IELTS Academic Master Mock Assessment';
    
    // Format date from passed date or session timestamps
    const rawDate = examDate || exam?.ended_at || exam?.started_at || new Date().toISOString();
    const formattedDate = new Date(rawDate).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const readingTotalQs = exam?.reading?.questions?.length || exam?.reading_questions?.length || exam?.questions?.length || 40;
    const listeningTotalQs = exam?.listening?.questions?.length || exam?.listening_questions?.length || 40;

    const gradedStudents = computeGradedStudents(exam, students);
    const summary = calculateCohortSummary(gradedStudents);
    const avgOverallText = summary.avgOverallBand !== null ? `Band ${summary.avgOverallBand}` : '—';

    // 1. Header Banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, doc.internal.pageSize.width, 60, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('IELTS MOCK EXAMINATION — OFFICIAL ROSTER & RESULTS', 36, 32);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(
      `EXAM: ${examTitle.slice(0, 45)}  |  SESSION PIN: ${pin}  |  DATE: ${formattedDate}  |  CANDIDATES: ${students.length}  |  AVERAGE BAND: ${avgOverallText}`,
      36,
      48
    );

    // 2. Prepare Data Rows
    const tableData = gradedStudents.map((s, idx) => {
      const phone = s.phone || s.phone_number || s.answers?.candidate_phone || '—';
      const lScore = `${s.computed_listening_score ?? '—'}/${listeningTotalQs} (Band ${s.computed_listening_band ?? '—'})`;
      const rScore = `${s.computed_reading_score ?? '—'}/${readingTotalQs} (Band ${s.computed_reading_band ?? '—'})`;
      const t1 = s.writing_task1_band !== null && s.writing_task1_band !== undefined ? s.writing_task1_band : '—';
      const t2 = s.writing_task2_band !== null && s.writing_task2_band !== undefined ? s.writing_task2_band : '—';
      const wScore = s.computed_writing_band !== null && s.computed_writing_band !== undefined 
        ? `Band ${s.computed_writing_band} (T1: ${t1} | T2: ${t2})` 
        : 'Pending';
      const overall = s.computed_overall_band !== null && s.computed_overall_band !== undefined ? `Band ${s.computed_overall_band}` : 'Pending';
      const status = (s.status || 'waiting').toUpperCase();

      return [
        idx + 1,
        s.name || s.student_name || 'Candidate',
        s.candidate_no || '—',
        phone,
        lScore,
        rScore,
        wScore,
        overall,
        status,
      ];
    });

    // 3. AutoTable
    autoTable(doc, {
      startY: 75,
      head: [['#', 'Candidate Name', 'Candidate ID', 'Phone Number', 'Listening', 'Reading', 'Writing (T1 & T2)', 'Overall Band', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 41, 59], // slate-800
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
        cellPadding: 7,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 26 },
        1: { fontStyle: 'bold', halign: 'left', cellWidth: 120 },
        2: { halign: 'center', cellWidth: 70 },
        3: { halign: 'center', cellWidth: 95 },
        4: { halign: 'center', cellWidth: 105 },
        5: { halign: 'center', cellWidth: 105 },
        6: { halign: 'center', cellWidth: 125 },
        7: { halign: 'center', fontStyle: 'bold', fontSize: 10.5, cellWidth: 70 },
        8: { halign: 'center', cellWidth: 60 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 5.5,
        overflow: 'linebreak',
        valign: 'middle',
      },
      didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
          `Generated by IELTS Sync Assessment Platform  •  Official Confidential Record  •  Page ${data.pageNumber}`,
          36,
          doc.internal.pageSize.height - 18
        );
      },
    });

    doc.save(`IELTS_Mock_Results_${pin}.pdf`);
    return { success: true };
  } catch (err) {
    console.error('Failed to generate results PDF:', err);
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
    return { success: false, error: err };
  }
}
