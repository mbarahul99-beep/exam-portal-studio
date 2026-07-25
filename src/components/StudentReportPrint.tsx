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

export const StudentReportPrint: React.FC<StudentReportPrintProps> = ({ exam, student, submission }) => {
  const cMarks = typeof exam.correctMarks === 'number' ? exam.correctMarks : 4;
  const iMarks = typeof exam.incorrectMarks === 'number' ? exam.incorrectMarks : -1;
  const uMarks = typeof exam.unansweredMarks === 'number' ? exam.unansweredMarks : 0;
  
  const totalPossible = exam.numQuestions * cMarks;
  const percentage = totalPossible > 0 ? Math.max(0, Math.round((submission.score / totalPossible) * 100)) : 0;

  // Compute breakdown stats
  let correct = 0;
  let wrong = 0;
  let left = 0;
  for (let q = 1; q <= exam.numQuestions; q++) {
    const sAns = submission.answers[q];
    const cAns = exam.answerKey[q];
    if (!sAns) left++;
    else if (sAns === cAns) correct++;
    else wrong++;
  }

  // Dynamically calculate and balance columns to fit questions cleanly on A4
  const totalQuestions = exam.numQuestions;
  const maxPerCol = 40;
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

  return (
    <div className="report-print-page">
      <header className="report-header">
        <div className="logo-brand">
          <span className="logo-icon">⚡</span>
          <span className="logo-name">Appex</span>
        </div>
        <div className="header-titles">
          <h1>EXAM PERFORMANCE REPORT</h1>
          <div className="subtitle">Official Graded Student Response Card</div>
        </div>
      </header>

      {/* Student Meta Details */}
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
        <div className="meta-item">
          <span className="label">Scanned Timestamp</span>
          <span className="val font-mono">{new Date(submission.scannedAt).toLocaleString()}</span>
        </div>
      </section>

      {/* Score Summary Grid Cards */}
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

      {/* Answer Key Grid Responses */}
      <section className="report-section responses-section">
        <h2>Question Response Details</h2>
        <div className="responses-grid" style={{ 
          gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
          maxWidth: cols.length === 1 ? '220px' : cols.length === 2 ? '440px' : '100%',
          margin: cols.length < 5 ? '0 auto' : '0'
        }}>
          {cols.map((colGroup, colIdx) => (
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

      {/* Signatures footer box */}
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
          <span>Evaluator / School Authority</span>
        </div>
      </footer>

      <style>{`
        body {
          background: #ffffff !important;
          color: #1a202c !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        }

        .report-print-page {
          width: 210mm;
          height: 297mm;
          padding: 8mm 12mm;
          margin: 10px auto;
          box-sizing: border-box;
          background: #ffffff;
          position: relative;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #2b6cb0;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }

        .logo-brand {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .logo-icon {
          font-size: 24px;
          color: #ecc94b;
        }

        .logo-name {
          font-size: 22px;
          font-weight: 800;
          color: #2b6cb0;
          letter-spacing: -0.5px;
        }

        .header-titles {
          text-align: right;
        }

        .header-titles h1 {
          font-size: 20px;
          margin: 0;
          font-weight: 800;
          color: #1a202c;
          letter-spacing: 0.5px;
          word-break: break-word;
          line-height: 1.25;
        }

        .header-titles .subtitle {
          font-size: 10px;
          color: #718096;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 2px;
        }

        .report-section {
          margin-bottom: 12px;
        }

        .meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px 12px;
          background: #f7fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px 12px;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .meta-item .label {
          font-size: 9px;
          font-weight: bold;
          color: #718096;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .meta-item .val {
          font-size: 13px;
          font-weight: 600;
          color: #2d3748;
          word-break: break-word;
          white-space: normal;
        }

        .score-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 16px;
        }

        .score-card {
          border: 1.5px solid #2b6cb0;
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #ebf8ff;
        }

        .score-card .lbl {
          font-size: 9px;
          font-weight: bold;
          color: #2b6cb0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .score-card .big-val {
          font-size: 26px;
          font-weight: 800;
          color: #2b6cb0;
          margin: 4px 0;
        }

        .score-card .big-val .denom {
          font-size: 14px;
          font-weight: 500;
          opacity: 0.7;
        }

        .pct-bar-wrapper {
          width: 100%;
          height: 6px;
          background: #e2e8f0;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 6px;
        }

        .pct-bar {
          height: 100%;
          background: #2b6cb0;
          border-radius: 3px;
        }

        .pct-label {
          font-size: 11px;
          font-weight: 700;
          color: #2d3748;
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
          border-left: 3px solid #38a169;
          background: #f0fff4;
        }

        .sub-score-card.wrong {
          border-left: 3px solid #e53e3e;
          background: #fff5f5;
        }

        .sub-score-card.left {
          border-left: 3px solid #718096;
          background: #f7fafc;
        }

        .sub-score-card .lbl {
          font-size: 10px;
          font-weight: 700;
          color: #4a5568;
        }

        .sub-score-card .val {
          font-size: 14px;
          font-weight: 800;
          color: #2d3748;
        }

        .sub-score-card .pts {
          font-size: 10px;
          font-weight: bold;
          opacity: 0.8;
        }

        .sub-score-card.correct .pts { color: #276749; }
        .sub-score-card.wrong .pts { color: #9b2c2c; }
        .sub-score-card.left .pts { color: #4a5568; }

        .responses-section h2 {
          font-size: 11px;
          margin: 0 0 6px 0;
          color: #1a202c;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #edf2f7;
          padding-bottom: 3px;
        }

        .responses-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
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
          padding: 2.5px 4px;
          font-size: 8px;
          font-weight: bold;
          text-align: center;
        }

        .resp-row {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          padding: 1.5px 4px;
          font-size: 9px;
          text-align: center;
          border-bottom: 0.5px solid #f7fafc;
        }

        .resp-row.correct {
          background: #f0fff4;
          color: #22543d;
        }

        .resp-row.incorrect {
          background: #fff5f5;
          color: #742a2a;
          font-weight: bold;
        }

        .resp-row.unanswered {
          background: #ffffff;
          color: #a0aec0;
        }

        .resp-row .q-lbl {
          color: #718096;
          text-align: left;
        }

        .resp-row .stud-lbl {
          font-weight: bold;
        }

        .resp-row.correct .stud-lbl {
          color: #38a169;
        }

        .resp-row.incorrect .stud-lbl {
          color: #e53e3e;
          text-decoration: line-through;
        }

        .report-footer {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          text-align: center;
        }

        .sig-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .sig-box .line {
          border-bottom: 1.2px dashed #cbd5e0;
          height: 12px;
        }

        .sig-box span {
          font-size: 10px;
          color: #718096;
          font-weight: 600;
          text-transform: uppercase;
        }

        @media print {
          @page {
            size: A4;
            margin: 0 !important;
          }
          #root,
          .admin-report-portal-modal {
            display: none !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .report-print-page {
            border: 1.5px solid #2b6cb0 !important;
            border-radius: 4px !important;
            margin: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            position: relative !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
};
