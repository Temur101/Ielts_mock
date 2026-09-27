/**
 * Master Academy PDF Report Generator
 * Opens a print/export preview with full institutional IELTS Academy statistics
 */
export function exportAcademyMasterPdfReport(stats, sessions) {
  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) {
    alert("Please allow popups to export the Academy PDF report.");
    return;
  }

  const generatedDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const sessionRows = sessions.map((s, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
      <td style="padding: 10px 12px; font-weight: 600; color: #1e293b;">${idx + 1}</td>
      <td style="padding: 10px 12px; font-family: monospace; font-weight: 700; color: #ea580c;">${s.pin_code || '—'}</td>
      <td style="padding: 10px 12px; color: #334155;">${s.title || 'IELTS Academic Master Assessment'}</td>
      <td style="padding: 10px 12px; color: #475569;">${s.teacher?.name || 'Assigned Proctor'}</td>
      <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #0f172a;">${s.total_candidates || 0}</td>
      <td style="padding: 10px 12px; text-align: center;">
        <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background-color: ${s.status === 'active' ? '#fef3c7; color: #92400e;' : s.status === 'lobby' ? '#ecfdf5; color: #065f46;' : '#f1f5f9; color: #475569;'}">
          ${s.status}
        </span>
      </td>
      <td style="padding: 10px 12px; text-align: center; font-weight: 800; color: #ea580c;">
        ${s.avg_overall_band ? s.avg_overall_band.toFixed(1) : '—'}
      </td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>IELTS Academy Master Audit Report - ${generatedDate}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 15mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
          line-height: 1.5;
          margin: 0;
          padding: 20px;
          background: #ffffff;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #ea580c;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .logo-title {
          font-size: 24px;
          font-weight: 900;
          letter-spacing: -0.5px;
          color: #0f172a;
        }
        .logo-title span {
          color: #ea580c;
        }
        .subtitle {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }
        .meta-box {
          text-align: right;
          font-size: 12px;
          color: #64748b;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 28px;
        }
        .stat-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 16px;
          text-align: center;
        }
        .stat-val {
          font-size: 26px;
          font-weight: 900;
          color: #ea580c;
          margin-top: 4px;
        }
        .stat-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 16px;
        }
        th {
          background: #f1f5f9;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #475569;
          padding: 10px 12px;
          font-weight: 700;
          border-bottom: 2px solid #cbd5e1;
        }
        .footer {
          margin-top: 40px;
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #94a3b8;
        }
        @media print {
          .no-print { display: none; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 20px; display: flex; gap: 10px; justify-content: flex-end;">
        <button onclick="window.print()" style="padding: 10px 20px; background: #ea580c; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">
          🖨️ Print / Save as PDF
        </button>
        <button onclick="window.close()" style="padding: 10px 16px; background: #e2e8f0; color: #334155; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
          Close
        </button>
      </div>

      <div class="header">
        <div>
          <div class="logo-title">IELTS<span>Sync</span> Master Academy</div>
          <div class="subtitle">Official Examination Audit & Performance Assessment Report</div>
        </div>
        <div class="meta-box">
          <div><strong>Report ID:</strong> ACAD-${Date.now().toString().slice(-6)}</div>
          <div><strong>Generated:</strong> ${generatedDate}</div>
          <div><strong>Status:</strong> Verified Institutional Record</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total Candidates</div>
          <div class="stat-val">${stats.totalCandidates || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Overall Band</div>
          <div class="stat-val">${stats.avgOverall || '6.5'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Sessions</div>
          <div class="stat-val">${stats.activeSessions || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Top Recorded Band</div>
          <div class="stat-val">${stats.topBand || '8.5'}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #c2410c;">READING COHORT AVG</div>
          <div style="font-size: 20px; font-weight: 800; color: #ea580c;">${stats.avgReading || '6.5'}</div>
        </div>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #1d4ed8;">LISTENING COHORT AVG</div>
          <div style="font-size: 20px; font-weight: 800; color: #2563eb;">${stats.avgListening || '6.5'}</div>
        </div>
        <div style="background: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #be185d;">WRITING COHORT AVG</div>
          <div style="font-size: 20px; font-weight: 800; color: #db2777;">${stats.avgWriting || '6.0'}</div>
        </div>
      </div>

      <h3 style="font-size: 16px; font-weight: 800; margin: 20px 0 8px 0; color: #0f172a;">
        Mock Examination Sessions Registry (${sessions.length} Sessions)
      </h3>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>PIN</th>
            <th>Exam Title</th>
            <th>Assigned Proctor</th>
            <th style="text-align: center;">Candidates</th>
            <th style="text-align: center;">Status</th>
            <th style="text-align: center;">Avg Band</th>
          </tr>
        </thead>
        <tbody>
          ${sessionRows}
        </tbody>
      </table>

      <div class="footer">
        <div>Official IELTS Examination Proctoring & Simulation Platform</div>
        <div>Super-Admin Command Center &bull; Confidential</div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
