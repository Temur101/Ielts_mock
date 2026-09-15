import React from 'react';
import { 
  Award, 
  BarChart3, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Users, 
  TrendingUp,
  FileText,
  Headphones,
  PenTool
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

export function AnalyticsModal({ isOpen, onClose, exam, students }) {
  if (!isOpen) return null;

  const finishedStudents = students.filter(s => s.status === 'submitted' || s.overall_band !== null || s.reading_band !== null || s.score !== null);
  const totalFinished = finishedStudents.length;

  const averageOverallBand = totalFinished > 0 
    ? (finishedStudents.reduce((acc, s) => acc + (s.overall_band || s.reading_band || s.band_score || 0), 0) / totalFinished).toFixed(1)
    : 0;

  const averageReading = totalFinished > 0
    ? (finishedStudents.reduce((acc, s) => acc + (s.reading_score || s.score || 0), 0) / totalFinished).toFixed(1)
    : 0;

  const averageListening = totalFinished > 0
    ? (finishedStudents.reduce((acc, s) => acc + (s.listening_score || 0), 0) / totalFinished).toFixed(1)
    : 0;

  // Band Score breakdown buckets
  const bandBuckets = [
    { label: 'Band 8.0 - 9.0 (Expert)', min: 8.0, max: 9.0, color: 'bg-emerald-500' },
    { label: 'Band 7.0 - 7.5 (Good)', min: 7.0, max: 7.5, color: 'bg-sky-500' },
    { label: 'Band 6.0 - 6.5 (Competent)', min: 6.0, max: 6.5, color: 'bg-brand-500' },
    { label: 'Band 5.0 - 5.5 (Modest)', min: 5.0, max: 5.5, color: 'bg-amber-500' },
    { label: 'Band ≤ 4.5 (Limited)', min: 0.0, max: 4.5, color: 'bg-rose-500' },
  ].map(b => {
    const count = finishedStudents.filter(s => {
      const bScore = s.overall_band || s.reading_band || s.band_score || 0;
      return bScore >= b.min && bScore <= b.max;
    }).length;
    const percentage = totalFinished > 0 ? Math.round((count / totalFinished) * 100) : 0;
    return { ...b, count, percentage };
  });

  const handleExportCSV = () => {
    let csv = 'Candidate Name,Candidate ID,Status,Reading Score (40),Reading Band,Listening Score (40),Listening Band,Writing Task 1 Band,Writing Task 2 Band,Writing Band,Overall IELTS Band,Focus Warnings\n';
    students.forEach(s => {
      csv += `"${s.name}","${s.candidate_no || ''}","${s.status}",${s.reading_score || s.score || 0},${s.reading_band || s.band_score || 0},${s.listening_score || 0},${s.listening_band || 0},${s.writing_task1_band || 0},${s.writing_task2_band || 0},${s.writing_band || 0},${s.overall_band || 0},${s.warning_count || 0}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `IELTS_Mock_Results_PIN_${exam.pin_code}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const readingTotalQs = exam?.reading?.questions?.length || exam?.questions?.length || 40;
  const listeningTotalQs = exam?.listening?.questions?.length || 40;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cohort Analytics & Score Breakdown"
      subtitle="Real-time performance metrics and statistical distribution"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-orange-50 border border-brand-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Cohort Average Band</div>
            <div className="text-2xl sm:text-3xl font-mono font-extrabold text-brand-800 mt-1">Band {averageOverallBand}</div>
            <div className="text-[11px] text-brand-600 mt-0.5">Official 3-Section Avg</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Reading Avg Raw</div>
            <div className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-800 mt-1">{averageReading}<span className="text-xs text-slate-400 font-normal">/{readingTotalQs}</span></div>
            <div className="text-[11px] text-slate-500 mt-0.5">Passage Questions</div>
          </div>

          <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Listening Avg Raw</div>
            <div className="text-2xl sm:text-3xl font-mono font-extrabold text-sky-800 mt-1">{averageListening}<span className="text-xs text-sky-400 font-normal">/{listeningTotalQs}</span></div>
            <div className="text-[11px] text-sky-600 mt-0.5">Audio Parts</div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Band 6.5+ Success</div>
            <div className="text-2xl sm:text-3xl font-mono font-extrabold text-emerald-800 mt-1">
              {totalFinished > 0 
                ? Math.round((finishedStudents.filter(s => (s.overall_band || s.reading_band || 0) >= 6.5).length / totalFinished) * 100) 
                : 0}%
            </div>
            <div className="text-[11px] text-emerald-600 mt-0.5">Target standard met</div>
          </div>
        </div>

        {/* Band Histogram */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-500" />
            Overall IELTS Band Score Distribution
          </h4>

          <div className="space-y-2.5">
            {bandBuckets.map((bucket, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-slate-700">
                  <span>{bucket.label}</span>
                  <span className="font-bold text-slate-900">{bucket.count} candidates ({bucket.percentage}%)</span>
                </div>
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className={`${bucket.color} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${bucket.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            icon={Download}
            onClick={handleExportCSV}
            className="font-bold shadow-glow"
          >
            Export Full Gradebook (CSV)
          </Button>
        </div>

      </div>
    </Modal>
  );
}
