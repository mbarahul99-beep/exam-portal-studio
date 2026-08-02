import React from 'react';
import { type Exam, type Student } from '../db';

interface StudentReportPrintProps {
  exam: Exam;
  student: Student;
  submission: {
    score: number;
    answers: Record<number, string>;
    scannedAt: Date;
  };
}

export const StudentReportPrint: React.FC<StudentReportPrintProps> = ({ exam: rawExam, student, submission }) => {
  const exam = { ...rawExam };
  const totalQsFromSections = exam.sections && Array.isArray(exam.sections)
    ? exam.sections.reduce((acc: number, sec: any) => acc + (Number(sec.qCount) || 0), 0)
    : 0;

  let localHealed = false;
  if (totalQsFromSections > 0 && (exam.numQuestions || 0) < totalQsFromSections) {
    exam.numQuestions = totalQsFromSections;
    localHealed = true;
  }

  if (exam.answerKey && typeof exam.answerKey === 'object') {
    const keyCount = Object.keys(exam.answerKey).length;
    if (keyCount > (exam.numQuestions || 0)) {
      exam.numQuestions = keyCount;
      localHealed = true;
    }
  }

  if (localHealed) {
    exam.answerKey = exam.answerKey ? { ...exam.answerKey } : {};
    for (let q = 1; q <= exam.numQuestions; q++) {
      if (!exam.answerKey[q]) {
        exam.answerKey[q] = 'A';
      }
    }
  }

  const cMarks = typeof exam.correctMarks === 'number' ? exam.correctMarks : 4;
  const iMarks = typeof exam.incorrectMarks === 'number' ? exam.incorrectMarks : -1;
  const uMarks = typeof exam.unansweredMarks === 'number' ? exam.unansweredMarks : 0;

  // Helper to determine section name
  const getQuestionSection = (qIndex: number, exam: Exam): string => {
    if (exam.sections && exam.sections.length > 0) {
      const match = exam.sections.find(s => qIndex >= s.qStart && qIndex < s.qStart + s.qCount);
      if (match) return match.subjectName || match.sectionName || 'General';
    }

    const numQuestions = exam.numQuestions;
    if (numQuestions === 200) {
      if (qIndex <= 50) return 'Physics';
      if (qIndex <= 100) return 'Chemistry';
      if (qIndex <= 150) return 'Botany';
      return 'Zoology';
    } else if (numQuestions === 180) {
      if (qIndex <= 45) return 'Physics';
      if (qIndex <= 90) return 'Chemistry';
      return 'Biology';
    } else {
      const perSec = Math.floor(numQuestions / 3);
      if (perSec === 0) return 'General';
      if (qIndex <= perSec) return 'Physics';
      if (qIndex <= perSec * 2) return 'Chemistry';
      return 'Biology';
    }
  };

  // Compute breakdown stats per section
  const sectionStatsMap: Record<string, {
    name: string;
    correct: number;
    wrong: number;
    left: number;
    score: number;
    totalPossible: number;
  }> = {};

  let totalPossible = 0;
  let correct = 0;
  let wrong = 0;
  let left = 0;

  for (let q = 1; q <= exam.numQuestions; q++) {
    const secName = getQuestionSection(q, exam);
    const sAns = submission.answers[q];
    const cAns = exam.answerKey[q];

    const marking = exam.sectionsMarking?.[secName] || {
      correctMarks: cMarks,
      incorrectMarks: iMarks,
      unansweredMarks: uMarks
    };

    totalPossible += marking.correctMarks;

    if (!sectionStatsMap[secName]) {
      sectionStatsMap[secName] = {
        name: secName,
        correct: 0,
        wrong: 0,
        left: 0,
        score: 0,
        totalPossible: 0
      };
    }

    const stat = sectionStatsMap[secName];
    stat.totalPossible += marking.correctMarks;

    if (!sAns) {
      left++;
      stat.left++;
      stat.score += marking.unansweredMarks;
    } else if (sAns === cAns) {
      correct++;
      stat.correct++;
      stat.score += marking.correctMarks;
    } else {
      wrong++;
      stat.wrong++;
      stat.score += marking.incorrectMarks;
    }
  }

  const sectionStats = Object.values(sectionStatsMap);
  const percentage = totalPossible > 0 ? Math.max(0, Math.round((submission.score / totalPossible) * 100)) : 0;

  // Decide if we need exactly 2 pages
  const isTwoPages = exam.numQuestions > 60;

  // Dynamically calculate and balance columns to fit questions cleanly on page
  const totalQuestions = exam.numQuestions;
  const maxPerCol = isTwoPages ? 45 : 30;
  const numCols = Math.min(5, Math.ceil(totalQuestions / maxPerCol));
  const qPerCol = Math.ceil(totalQuestions / numCols);

  const cols: number[][] = [];
  for (let c = 0; c < numCols; c++) {
    const colQuestions: number[] = [];
    const startQ = c * qPerCol + 1;
    const endQ = Math.min(totalQuestions, (c + 1) * qPerCol);
    for (let q = startQ; q <= endQ; q++) {
      colQuestions.push(q);
    }
    if (colQuestions.length > 0) {
      cols.push(colQuestions);
    }
  }

  // Load custom logo settings
  const storedJson = localStorage.getItem('omr_custom_settings');
  let printLogoHeight = 42;
  let printLogoNameHeight = 26;
  if (storedJson) {
    try {
      const parsed = JSON.parse(storedJson);
      if (parsed.logoHeight) printLogoHeight = parsed.logoHeight;
      if (parsed.logoNameHeight) printLogoNameHeight = parsed.logoNameHeight;
    } catch (e) {}
  }

  const renderHeader = () => (
    <header className="report-header">
      <div className="logo-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img src="/logo.png" alt="Logo" className="print-logo-img" style={{ height: `${printLogoHeight}px`, width: 'auto', objectFit: 'contain' }} />
        <img src="/logo_name.png" alt="Institute APEX" className="print-logo-name-img" style={{ height: `${printLogoNameHeight}px`, width: 'auto', objectFit: 'contain' }} />
      </div>
      <div className="header-titles">
        <h1>EXAM PERFORMANCE REPORT</h1>
        <div className="subtitle">Official Graded Student Response Card</div>
      </div>
    </header>
  );

  const renderMetaGrid = () => (
    <section className="report-section meta-grid">
      <div className="meta-item">
        <span className="label">Student Name</span>
        <span className="val">{student.name}</span>
      </div>
      {student.fatherName && (
        <div className="meta-item">
          <span className="label">Father's Name</span>
          <span className="val">{student.fatherName}</span>
        </div>
      )}
      <div className="meta-item">
        <span className="label">Roll ID / Number</span>
        <span className="val font-mono">{student.studentNum}</span>
      </div>
      <div className="meta-item">
        <span className="label">Class Group</span>
        <span className="val">{student.className}</span>
      </div>
      <div className="meta-item">
        <span className="label">Exam Title</span>
        <span className="val">{exam.title}</span>
      </div>
      <div className="meta-item">
        <span className="label">Exam Date</span>
        <span className="val">{new Date(exam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
      </div>
      <div className="meta-item" style={{ gridColumn: student.fatherName ? 'span 1' : 'span 2' }}>
        <span className="label">Scanned Timestamp</span>
        <span className="val font-mono">{new Date(submission.scannedAt).toLocaleString()}</span>
      </div>
    </section>
  );

  const renderScoreSummary = () => (
    <section className="report-section score-grid">
      <div className="score-card final-score">
        <div className="lbl">Earned Score</div>
        <div className="big-val">{submission.score} <span className="denom">/ {totalPossible}</span></div>
        <div className="pct-bar-wrapper">
          <div className="pct-bar" style={{ width: `${percentage}%` }}></div>
        </div>
        <div className="pct-label">{percentage}% Accuracy Index</div>
      </div>

      <div className="score-card-group">
        <div className="sub-score-card correct">
          <span className="lbl">Correct Answers</span>
          <span className="val">{correct}</span>
          <span className="pts">+{correct * cMarks} Points</span>
        </div>
        <div className="sub-score-card wrong">
          <span className="lbl">Incorrect Answers</span>
          <span className="val">{wrong}</span>
          <span className="pts">{wrong * iMarks} Points</span>
        </div>
        <div className="sub-score-card left">
          <span className="lbl">Left / Unanswered</span>
          <span className="val">{left}</span>
          <span className="pts">+{left * uMarks} Points</span>
        </div>
      </div>
    </section>
  );

  const renderSectionStats = () => (
    <section className="report-section section-stats-section">
      <h2>Subject / Section Performance Breakdown</h2>
      <table className="section-stats-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Subject / Section</th>
            <th>Correct</th>
            <th>Incorrect</th>
            <th>Left</th>
            <th>Marks Obtained</th>
            <th>Section Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {sectionStats.map((sec, idx) => {
            const secAccuracy = sec.totalPossible > 0 ? Math.max(0, Math.round((sec.score / sec.totalPossible) * 100)) : 0;
            return (
              <tr key={idx}>
                <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{sec.name}</td>
                <td style={{ color: '#15803d', fontWeight: 'bold' }}>{sec.correct}</td>
                <td style={{ color: '#b91c1c', fontWeight: 'bold' }}>{sec.wrong}</td>
                <td style={{ color: '#475569' }}>{sec.left}</td>
                <td><strong>{sec.score}</strong> / {sec.totalPossible}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <span style={{ minWidth: '32px', fontWeight: 'bold', textAlign: 'right' }}>{secAccuracy}%</span>
                    <div style={{ width: '60px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${secAccuracy}%`, height: '100%', background: '#2b6cb0', borderRadius: '3px' }} />
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );

  const renderResponsesGridRange = (startQNum: number, endQNum: number, title?: string) => {
    const rangeTotal = endQNum - startQNum + 1;
    const columnsCount = 4;
    const questionsPerCol = Math.ceil(rangeTotal / columnsCount);
    
    const rangeCols: number[][] = [];
    for (let c = 0; c < columnsCount; c++) {
      const colQuestions: number[] = [];
      const start = startQNum + c * questionsPerCol;
      const end = Math.min(endQNum, startQNum + (c + 1) * questionsPerCol - 1);
      for (let q = start; q <= end; q++) {
        colQuestions.push(q);
      }
      if (colQuestions.length > 0) {
        rangeCols.push(colQuestions);
      }
    }

    return (
      <section className="report-section responses-section" style={{ marginTop: '4px' }}>
        <h2>{title || "Question Response Details"}</h2>
        <div className="responses-grid" style={{
          gridTemplateColumns: `repeat(${rangeCols.length}, 1fr)`,
          gap: '6px'
        }}>
          {rangeCols.map((colGroup, colIdx) => (
            <div key={`rep-col-${colIdx}`} className="resp-col">
              <div className="col-header-row">
                <span>Q.No</span>
                <span>Key</span>
                <span>Resp</span>
              </div>
              {colGroup.map((qNum) => {
                if (qNum > exam.numQuestions) return null;
                const correctKey = exam.answerKey[qNum];
                const studentAns = submission.answers[qNum];
                const isCorrect = studentAns === correctKey;
                const isUnanswered = !studentAns;

                return (
                  <div key={`rep-q-${qNum}`} className={`resp-row ${isUnanswered ? 'unanswered' : isCorrect ? 'correct' : 'incorrect'}`}>
                    <span className="q-lbl font-mono">Q{String(qNum).padStart(2, '0')}</span>
                    <span className="key-lbl font-mono">{correctKey}</span>
                    <span className="stud-lbl font-mono">{studentAns || '-'}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderFooter = () => (
    <footer className="report-footer">
      <div className="sig-box">
        <div className="line"></div>
        <span>Student Signature</span>
      </div>
      <div className="sig-box">
        <div className="line"></div>
        <span>Parent / Guardian</span>
      </div>
      <div className="sig-box">
        <div className="line"></div>
        <span>Evaluator / Authority</span>
      </div>
    </footer>
  );

  return (
    <div className={`report-print-page ${isTwoPages ? 'two-pages' : 'one-page'}`}>
      {isTwoPages ? (
        <>
          {/* PAGE 1 */}
          <div className="page-container page-one">
            {renderHeader()}
            {renderMetaGrid()}
            {renderScoreSummary()}
            <div style={{ marginTop: '10px' }} />
            {renderSectionStats()}
            <div style={{ marginTop: '10px' }} />
            {renderResponsesGridRange(1, 50, "Question Response Details (Part 1: Q01 - Q50)")}
          </div>

          {/* PAGE 2 */}
          <div className="page-container page-two">
            <header className="report-header-minimized">
              <div className="logo-brand-min">
                <img src="/logo.png" alt="Logo" className="min-logo" />
                <span>Institute APEX — NEET Graded Analysis</span>
              </div>
              <div className="candidate-min font-mono">
                {student.name} | Roll: {student.studentNum}
              </div>
            </header>
            {renderResponsesGridRange(51, totalQuestions, `Question Response Details (Part 2: Q51 - Q${totalQuestions})`)}
            <div style={{ flex: 1 }} /> {/* Push footer to bottom */}
            {renderFooter()}
          </div>
        </>
      ) : (
        /* SINGLE PAGE */
        <div className="page-container">
          {renderHeader()}
          {renderMetaGrid()}
          {renderScoreSummary()}
          {renderSectionStats()}
          {renderResponsesGridRange(1, totalQuestions, "Question Response Details")}
          {renderFooter()}
        </div>
      )}

      <style>{`
        body {
          background: #f1f5f9 !important;
          color: #1a202c !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          margin: 0;
          padding: 0;
        }

        .report-print-page {
          width: 210mm;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .page-container {
          width: 210mm;
          height: 297mm;
          padding: 8mm 12mm;
          box-sizing: border-box;
          background: #ffffff;
          position: relative;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
          margin-bottom: 24px;
          display: flex;
          flex-direction: column;
        }

        .report-header-minimized {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #2b6cb0;
          padding-bottom: 4px;
          margin-bottom: 12px;
          font-size: 8.5px;
          color: #475569;
          font-weight: bold;
        }

        .logo-brand-min {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .min-logo {
          height: 18px;
          width: auto;
          object-fit: contain;
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #2b6cb0;
          padding-bottom: 6px;
          margin-bottom: 10px;
        }

        .logo-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .print-logo-img {
          height: 42px;
          width: auto;
          object-fit: contain;
        }

        .print-logo-name-img {
          height: 26px;
          width: auto;
          object-fit: contain;
        }

        .header-titles {
          text-align: right;
        }

        .header-titles h1 {
          font-size: 16px;
          margin: 0;
          font-weight: 800;
          color: #1a202c;
          letter-spacing: 0.5px;
          line-height: 1.2;
        }

        .header-titles .subtitle {
          font-size: 9px;
          color: #718096;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-top: 1px;
        }

        .report-section {
          margin-bottom: 10px;
        }

        .meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 12px;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .meta-item .label {
          font-size: 8px;
          font-weight: bold;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .meta-item .val {
          font-size: 11px;
          font-weight: 700;
          color: #1e293b;
          word-break: break-word;
        }

        .score-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 14px;
        }

        .score-card {
          border: 1.5px solid #2b6cb0;
          border-radius: 8px;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #ebf8ff;
        }

        .score-card .lbl {
          font-size: 8.5px;
          font-weight: bold;
          color: #2b6cb0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .score-card .big-val {
          font-size: 24px;
          font-weight: 800;
          color: #2b6cb0;
          margin: 2px 0;
        }

        .score-card .big-val .denom {
          font-size: 13px;
          font-weight: 500;
          opacity: 0.8;
        }

        .pct-bar-wrapper {
          width: 100%;
          height: 6px;
          background: #e2e8f0;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 4px;
          margin-top: 4px;
        }

        .pct-bar {
          height: 100%;
          background: #2b6cb0;
          border-radius: 3px;
        }

        .pct-label {
          font-size: 10px;
          font-weight: 700;
          color: #1e293b;
        }

        .score-card-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .sub-score-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
        }

        .sub-score-card.correct {
          border-left: 4px solid #16a34a;
          background: #f0fff4;
        }

        .sub-score-card.wrong {
          border-left: 4px solid #dc2626;
          background: #fff5f5;
        }

        .sub-score-card.left {
          border-left: 4px solid #64748b;
          background: #f8fafc;
        }

        .sub-score-card .lbl {
          font-size: 9px;
          font-weight: 700;
          color: #475569;
        }

        .sub-score-card .val {
          font-size: 12px;
          font-weight: 800;
          color: #1e293b;
        }

        .sub-score-card .pts {
          font-size: 9.5px;
          font-weight: bold;
          opacity: 0.9;
        }

        .sub-score-card.correct .pts { color: #15803d; }
        .sub-score-card.wrong .pts { color: #b91c1c; }
        .sub-score-card.left .pts { color: #475569; }

        .section-stats-section h2, .responses-section h2 {
          font-size: 10px;
          margin: 0 0 6px 0;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1.5px solid #e2e8f0;
          padding-bottom: 2px;
          font-weight: 800;
        }

        .section-stats-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4px;
          font-size: 9px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
        }

        .section-stats-table th {
          background: #f8fafc;
          color: #475569;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 6px 10px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 8.5px;
          text-align: center;
        }

        .section-stats-table td {
          padding: 6px 10px;
          border-bottom: 1px solid #edf2f7;
          text-align: center;
          color: #334155;
        }

        .section-stats-table tr:last-child td {
          border-bottom: none;
        }

        .responses-grid {
          display: grid;
          gap: 6px;
        }

        .resp-col {
          border: 1px solid #edf2f7;
          border-radius: 4px;
          overflow: hidden;
        }

        .col-header-row {
          background: #2b6cb0;
          color: #ffffff;
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          padding: 3px 4px;
          font-size: 8px;
          font-weight: bold;
          text-align: center;
        }

        .resp-row {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          padding: 2px 4px;
          font-size: 8.5px;
          text-align: center;
          border-bottom: 0.5px solid #f1f5f9;
        }

        .resp-row.correct {
          background: #f0fff4;
          color: #166534;
        }

        .resp-row.incorrect {
          background: #fff5f5;
          color: #991b1b;
          font-weight: bold;
        }

        .resp-row.unanswered {
          background: #ffffff;
          color: #94a3b8;
        }

        .resp-row .q-lbl {
          color: #64748b;
          text-align: left;
        }

        .resp-row .stud-lbl {
          font-weight: bold;
        }

        .resp-row.correct .stud-lbl {
          color: #16a34a;
        }

        .resp-row.incorrect .stud-lbl {
          color: #dc2626;
          text-decoration: line-through;
        }

        .report-footer {
          margin-top: auto;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          text-align: center;
          padding-top: 14px;
        }

        .sig-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .sig-box .line {
          border-bottom: 1.2px dashed #cbd5e1;
          height: 12px;
        }

        .sig-box span {
          font-size: 8.5px;
          color: #64748b;
          font-weight: 700;
          text-transform: uppercase;
        }

        @media print {
          @page {
            size: A4;
            margin: 0 !important;
          }
          #root,
          .admin-report-portal-modal,
          .no-print {
            display: none !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .report-print-page {
            width: 100% !important;
            margin: 0 !important;
            background: none !important;
          }
          .page-container {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 8mm 12mm !important;
            width: 210mm !important;
            height: 297mm !important;
            page-break-after: always;
            break-after: page;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .page-container:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
        }
      `}</style>
    </div>
  );
};
