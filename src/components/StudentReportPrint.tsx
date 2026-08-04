import React from 'react';
import { db, type Exam, type Student } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface StudentReportPrintProps {
  exam: Exam;
  student: Student;
  submission: {
    score: number;
    answers: Record<number, string>;
    scannedAt: Date;
    bookletSet?: string;
  };
}

export const StudentReportPrint: React.FC<StudentReportPrintProps> = ({ exam: rawExam, student, submission }) => {
  const examQuestions = useLiveQuery(() => db.questions.where('examId').equals(rawExam.id!).toArray(), [rawExam.id]) || [];
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
      if (match) return match.subjectName && match.sectionName ? `${match.subjectName} - ${match.sectionName}` : (match.subjectName || match.sectionName || 'General');
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

  let totalPossible = 0;
  let correct = 0;
  let wrong = 0;
  let left = 0;

  for (let q = 1; q <= exam.numQuestions; q++) {
    const secName = getQuestionSection(q, exam);
    const sAns = submission.answers[q];
    const subSet = submission.bookletSet || 'A';
    const correctKey = exam.answerKeys?.[subSet] || exam.answerKey || {};
    const cAns = correctKey[q];

    const marking = exam.sectionsMarking?.[secName] || {
      correctMarks: cMarks,
      incorrectMarks: iMarks,
      unansweredMarks: uMarks
    };

    totalPossible += marking.correctMarks;

    if (!sAns) {
      left++;
    } else if (sAns === cAns) {
      correct++;
    } else {
      wrong++;
    }
  }

  const percentage = totalPossible > 0 ? Math.max(0, Math.round((submission.score / totalPossible) * 100)) : 0;

  // Subject-wise and difficulty-wise stats for printed report
  const subjectStats: Record<string, { attempted: number; correct: number; unattempted: number; negativeMarks: number; total: number; score: number; totalPossible: number }> = {};
  const diffStats: Record<'Easy' | 'Moderate' | 'Difficult', { correct: number; wrong: number; skipped: number; total: number; questions: number[] }> = {
    Easy: { correct: 0, wrong: 0, skipped: 0, total: 0, questions: [] },
    Moderate: { correct: 0, wrong: 0, skipped: 0, total: 0, questions: [] },
    Difficult: { correct: 0, wrong: 0, skipped: 0, total: 0, questions: [] }
  };
  let totalNegativeMarks = 0;

  for (let q = 1; q <= exam.numQuestions; q++) {
    const secName = getQuestionSection(q, exam);
    const cleanSubject = secName.split(' - ')[0] || secName;
    const sAns = submission.answers[q];
    const subSet = submission.bookletSet || 'A';
    const correctKey = exam.answerKeys?.[subSet] || exam.answerKey || {};
    const cAns = correctKey[q];
    
    const isCorrect = sAns === cAns;
    const isLeft = !sAns;
    
    const secRules: any = exam.sectionsMarking?.[secName] || {
      correctMarks: cMarks,
      incorrectMarks: iMarks,
      unansweredMarks: uMarks
    };

    if (!subjectStats[cleanSubject]) {
      subjectStats[cleanSubject] = { attempted: 0, correct: 0, unattempted: 0, negativeMarks: 0, total: 0, score: 0, totalPossible: 0 };
    }
    subjectStats[cleanSubject].total += 1;
    subjectStats[cleanSubject].totalPossible += secRules.correctMarks;
    if (isLeft) {
      subjectStats[cleanSubject].unattempted += 1;
      subjectStats[cleanSubject].score += secRules.unansweredMarks || 0;
    } else {
      subjectStats[cleanSubject].attempted += 1;
      if (isCorrect) {
        subjectStats[cleanSubject].correct += 1;
        subjectStats[cleanSubject].score += secRules.correctMarks;
      } else {
        const negVal = Math.abs(secRules.incorrectMarks);
        subjectStats[cleanSubject].negativeMarks += negVal;
        totalNegativeMarks += negVal;
        subjectStats[cleanSubject].score += secRules.incorrectMarks;
      }
    }

    // Difficulty level
    let qDiff: 'Easy' | 'Moderate' | 'Difficult' = 'Easy';
    if (rawExam.startsAt) { // online exam
      const qObj = examQuestions[q - 1];
      if (qObj && qObj.difficulty) {
        qDiff = qObj.difficulty;
      }
    } else {
      if (exam.difficulties && exam.difficulties[q]) {
        qDiff = exam.difficulties[q];
      }
    }

    diffStats[qDiff].total += 1;
    diffStats[qDiff].questions.push(q);
    if (isLeft) {
      diffStats[qDiff].skipped += 1;
    } else if (isCorrect) {
      diffStats[qDiff].correct += 1;
    } else {
      diffStats[qDiff].wrong += 1;
    }
  }

  let easyNegativeMarks = 0;
  diffStats.Easy.questions.forEach(q => {
    const sAns = submission.answers[q];
    const subSet = submission.bookletSet || 'A';
    const setKey = exam.answerKeys?.[subSet] || exam.answerKey || {};
    const cAns = setKey[q];
    if (sAns && sAns !== cAns) {
      const secName = getQuestionSection(q, exam);
      const secRules = exam.sectionsMarking?.[secName] || {
        incorrectMarks: iMarks
      };
      easyNegativeMarks += Math.abs(secRules.incorrectMarks);
    }
  });

  // Decide if we need exactly 2 pages
  const isTwoPages = exam.numQuestions > 35;

  // Dynamically calculate and balance columns to fit questions cleanly on page
  const totalQuestions = exam.numQuestions;
  const pageOneCount = isTwoPages 
    ? Math.min(Math.ceil(totalQuestions * 0.42), 90) 
    : totalQuestions;
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
    <header className="report-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '2px solid #2b6cb0', paddingBottom: '12px', marginBottom: '10px', width: '100%' }}>
      <div className="logo-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '8px' }}>
        <img src="/logo.png" alt="Logo" className="print-logo-img" style={{ height: `${printLogoHeight * 3}px`, width: 'auto', objectFit: 'contain' }} />
        <img src="/logo_name.png" alt="Institute APEX" className="print-logo-name-img" style={{ height: `${printLogoNameHeight * 3}px`, width: 'auto', objectFit: 'contain' }} />
      </div>
      <div style={{ textAlign: 'center', color: '#1e293b', fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
          Institute of Medical Entrance Exams (NEET) & IIT-JEE Coaching
        </div>
        <div style={{ fontSize: '10px', fontWeight: 600, color: '#475569', marginBottom: '2px' }}>
          #1257, Urban State, Near HUDA Ground, Jind- 126102 (Haryana)
        </div>
        <div style={{ fontSize: '10px', fontWeight: 600, color: '#475569' }}>
          Call : 9467752374, Email: instituteapexjind@gmail.com
        </div>
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
      <div className="meta-item" style={{ gridColumn: student.fatherName ? 'span 1' : 'span 2' }}>
        <span className="label">Exam Date</span>
        <span className="val">{new Date(exam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
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
          <span className="pts">+{correct * cMarks} Marks</span>
        </div>
        <div className="sub-score-card wrong">
          <span className="lbl">Incorrect Answers</span>
          <span className="val">{wrong}</span>
          <span className="pts">{wrong * iMarks} Marks</span>
        </div>
        <div className="sub-score-card left">
          <span className="lbl">Left / Unanswered</span>
          <span className="val">{left}</span>
          <span className="pts">+{left * uMarks} Marks</span>
        </div>
      </div>
    </section>
  );



  const renderPrintSubjectBreakdown = () => (
    <section className="report-section print-subject-stats-section" style={{ marginTop: '14px' }}>
      <h2>Subject-wise Performance Breakdown</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '8px' }}>
        {Object.entries(subjectStats).map(([subName, stats]) => {
          const accuracy = stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0;
          return (
            <div key={`print-sub-${subName}`} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', background: '#f8fafc', boxSizing: 'border-box' }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', marginBottom: '8px' }}>{subName}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: '0.72rem' }}>
                <span style={{ color: '#475569' }}>Attempted:</span>
                <strong style={{ textAlign: 'right' }}>{stats.attempted} / {stats.total}</strong>
                <span style={{ color: '#16a34a' }}>Correct:</span>
                <strong style={{ color: '#16a34a', textAlign: 'right' }}>{stats.correct}</strong>
                <span style={{ color: '#ef4444' }}>Negative:</span>
                <strong style={{ color: '#ef4444', textAlign: 'right' }}>-{stats.negativeMarks}</strong>
                <span style={{ color: '#475569' }}>Accuracy:</span>
                <strong style={{ color: '#2563eb', textAlign: 'right' }}>{accuracy}%</strong>
                <span style={{ color: '#475569' }}>Scored Marks:</span>
                <strong style={{ color: '#1e293b', textAlign: 'right' }}>{stats.score} / {stats.totalPossible}</strong>
                <span style={{ color: '#475569' }}>Percentage:</span>
                <strong style={{ color: '#1e293b', textAlign: 'right' }}>{stats.totalPossible > 0 ? Math.round((stats.score / stats.totalPossible) * 100) : 0}%</strong>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ border: '1px solid #fee2e2', background: '#fef2f2', borderRadius: '8px', padding: '10px 14px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#ef4444' }}>Negative Marks Lost:</span>
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', fontWeight: 'bold' }}>
          {Object.entries(subjectStats).map(([subName, stats]) => (
            <span key={`print-neg-sub-${subName}`} style={{ color: '#475569' }}>
              {subName}: <strong style={{ color: '#ef4444' }}>-{stats.negativeMarks}</strong>
            </span>
          ))}
          <span style={{ borderLeft: '1px solid #fca5a5', paddingLeft: '12px', color: '#b91c1c' }}>
            Total: <strong>-{totalNegativeMarks}</strong>
          </span>
        </div>
      </div>
    </section>
  );

  const renderPrintDifficultyDiagnostics = () => (
    <section className="report-section print-difficulty-section" style={{ marginTop: '14px' }}>
      <h2>Difficulty-level Performance & ROI Analysis</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '14px', marginTop: '8px', alignItems: 'stretch' }}>
        
        {/* Left: Mini Stacked Bar Chart */}
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-end', height: '110px', paddingBottom: '4px', boxSizing: 'border-box' }}>
            {(['Easy', 'Moderate', 'Difficult'] as const).map(level => {
              const stats = diffStats[level];
              const tot = stats.total || 1;
              const correctPct = (stats.correct / tot) * 100;
              const wrongPct = (stats.wrong / tot) * 100;
              const skippedPct = (stats.skipped / tot) * 100;
              return (
                <div key={`print-bar-${level}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '22px', height: '90px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse' }}>
                    {stats.correct > 0 && <div style={{ height: `${correctPct}%`, background: '#2563eb' }} />}
                    {stats.wrong > 0 && <div style={{ height: `${wrongPct}%`, background: '#ef4444' }} />}
                    {stats.skipped > 0 && <div style={{ height: `${skippedPct}%`, background: '#cbd5e1' }} />}
                  </div>
                  <span style={{ fontSize: '0.62rem', fontWeight: 'bold', color: '#475569' }}>{level[0]}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '0.58rem', color: '#64748b', marginTop: '6px', justifyContent: 'center' }}>
            <span>🔵 Correct</span>
            <span>🔴 Wrong</span>
            <span>⚪ Skip</span>
          </div>
        </div>

        {/* Right: Summary Metrics Table */}
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '6px', boxSizing: 'border-box' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                <th style={{ padding: '2px 4px', fontWeight: 'bold' }}>Difficulty Level</th>
                <th style={{ padding: '2px 4px', fontWeight: 'bold', textAlign: 'center' }}>Correct</th>
                <th style={{ padding: '2px 4px', fontWeight: 'bold', textAlign: 'center' }}>Wrong</th>
                <th style={{ padding: '2px 4px', fontWeight: 'bold', textAlign: 'center' }}>Skipped</th>
                <th style={{ padding: '2px 4px', fontWeight: 'bold', textAlign: 'center' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(['Easy', 'Moderate', 'Difficult'] as const).map(level => {
                const stats = diffStats[level];
                return (
                  <tr key={`print-row-${level}`} style={{ borderBottom: '1px dashed #edf2f7' }}>
                    <td style={{ padding: '4px 4px', fontWeight: 'bold', color: '#1e293b' }}>{level}</td>
                    <td style={{ padding: '4px 4px', color: '#16a34a', fontWeight: 'bold', textAlign: 'center' }}>{stats.correct}</td>
                    <td style={{ padding: '4px 4px', color: '#ef4444', fontWeight: 'bold', textAlign: 'center' }}>{stats.wrong}</td>
                    <td style={{ padding: '4px 4px', color: '#64748b', textAlign: 'center' }}>{stats.skipped}</td>
                    <td style={{ padding: '4px 4px', color: '#0f172a', fontWeight: 'bold', textAlign: 'center' }}>{stats.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ROI alert notice inside details */}
          {diffStats.Easy.wrong > 0 && (
            <div style={{ border: '1px solid #fef3c7', background: '#fffbeb', borderRadius: '6px', padding: '6px 10px', fontSize: '0.68rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span>⚠️ <strong>ROI Tip:</strong> Avoid calculations mistakes on simple questions. You got <strong>{diffStats.Easy.wrong} Easy questions incorrect</strong> (-{easyNegativeMarks} marks lost).</span>
            </div>
          )}
        </div>

      </div>
    </section>
  );

  const renderResponsesGridRange = (startQNum: number, endQNum: number, title?: string, availableHeight: number = 600) => {
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

    // Dynamic sizing based on available height and row count to fill space fully
    const maxRows = Math.ceil(rangeTotal / columnsCount);
    const rowHeight = availableHeight / (maxRows + 1);
    
    // Calculate padding and font size to fit rowHeight
    const paddingY = Math.max(3, Math.min(16, (rowHeight - 14) / 2));
    const rowPadding = `${paddingY}px 4px`;
    const fontSize = `${Math.max(8.5, Math.min(11, rowHeight * 0.35))}px`;
    const colHeaderPadding = `${Math.max(4, Math.min(16, paddingY * 1.1))}px 4px`;
    const colHeaderFontSize = `${Math.max(8, Math.min(10.5, rowHeight * 0.3))}px`;

    return (
      <section className="report-section responses-section" style={{ marginTop: '4px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '10px', margin: '0 0 4px 0' }}>{title || "Question Response Details"}</h2>
        <div className="responses-grid" style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${rangeCols.length}, 1fr)`,
          gap: '6px',
          flex: 1
        }}>
          {rangeCols.map((colGroup, colIdx) => (
            <div key={`rep-col-${colIdx}`} className="resp-col" style={{ border: '1px solid #edf2f7', borderRadius: '4px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="col-header-row" style={{
                background: '#2b6cb0',
                color: '#ffffff',
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr',
                padding: colHeaderPadding,
                fontSize: colHeaderFontSize,
                fontWeight: 'bold',
                textAlign: 'center'
              }}>
                <span>Q.No</span>
                <span>Key</span>
                <span>Resp</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', flex: 1 }}>
                {colGroup.map((qNum) => {
                  if (qNum > exam.numQuestions) return null;
                  const subSet = submission.bookletSet || 'A';
                  const setKey = exam.answerKeys?.[subSet] || exam.answerKey || {};
                  const correctKey = setKey[qNum];
                  const studentAns = submission.answers[qNum];
                  const isCorrect = studentAns === correctKey;
                  const isUnanswered = !studentAns;

                  return (
                    <div key={`rep-q-${qNum}`} 
                      className={`resp-row ${isUnanswered ? 'unanswered' : isCorrect ? 'correct' : 'incorrect'}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1fr 1fr',
                        padding: rowPadding,
                        fontSize: fontSize,
                        textAlign: 'center',
                        borderBottom: '0.5px solid #f1f5f9',
                        flex: 1,
                        alignItems: 'center'
                      }}
                    >
                      <span className="q-lbl font-mono" style={{ color: '#64748b', textAlign: 'left' }}>Q{String(qNum).padStart(2, '0')}</span>
                      <span className="key-lbl font-mono">{correctKey}</span>
                      <span className="stud-lbl font-mono">{studentAns || '-'}</span>
                    </div>
                  );
                })}
              </div>
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
            <div style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 850, color: '#1e3a8a', textAlign: 'center', margin: '8px 0', letterSpacing: '1px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>EXAM PERFORMANCE REPORT CARD</div>
            {renderMetaGrid()}
            {renderScoreSummary()}
            <div style={{ marginTop: '10px' }} />
            {renderResponsesGridRange(1, pageOneCount, `Question Response Details (Part 1: Q01 - Q${String(pageOneCount).padStart(2, '0')})`, 540)}
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
            {renderResponsesGridRange(pageOneCount + 1, totalQuestions, `Question Response Details (Part 2: Q${String(pageOneCount + 1).padStart(2, '0')} - Q${totalQuestions})`, 840)}
            <div style={{ flex: 1 }} /> {/* Push footer to bottom */}
            {renderFooter()}
          </div>

          {/* PAGE 3 */}
          <div className="page-container page-three">
            <header className="report-header-minimized">
              <div className="logo-brand-min">
                <img src="/logo.png" alt="Logo" className="min-logo" />
                <span>Institute APEX — NEET Graded Analysis</span>
              </div>
              <div className="candidate-min font-mono">
                {student.name} | Roll: {student.studentNum}
              </div>
            </header>
            {renderPrintSubjectBreakdown()}
            {renderPrintDifficultyDiagnostics()}
            <div style={{ flex: 1 }} /> {/* Push footer to bottom */}
            {renderFooter()}
          </div>
        </>
      ) : (
        /* SINGLE PAGE */
        <div className="page-container">
          {renderHeader()}
          <div style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 850, color: '#1e3a8a', textAlign: 'center', margin: '8px 0', letterSpacing: '1px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>EXAM PERFORMANCE REPORT CARD</div>
          {renderMetaGrid()}
          {renderScoreSummary()}
          {renderPrintSubjectBreakdown()}
          {renderPrintDifficultyDiagnostics()}
          {renderResponsesGridRange(1, totalQuestions, "Question Response Details", 520)}
          {renderFooter()}
        </div>
      )}

      <style>{`
        body {
          background: #f1f5f9 !important;
          color: #000000 !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          margin: 0;
          padding: 0;
        }

        .report-print-page {
          width: 210mm;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .report-print-page.is-generating-pdf .page-container {
          border: none !important;
          box-shadow: none !important;
          margin: 0 !important;
          border-radius: 0 !important;
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
          color: #000000;
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
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-bottom: 2px solid #2b6cb0;
          padding-bottom: 12px;
          margin-bottom: 10px;
          width: 100%;
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
          color: #000000;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .meta-item .val {
          font-size: 11px;
          font-weight: 700;
          color: #000000;
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
          color: #000000;
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
          color: #000000;
        }

        .sub-score-card .val {
          font-size: 12px;
          font-weight: 800;
          color: #000000;
        }

        .sub-score-card .pts {
          font-size: 9.5px;
          font-weight: bold;
          opacity: 0.9;
        }

        .sub-score-card.correct .pts { color: #15803d; }
        .sub-score-card.wrong .pts { color: #b91c1c; }
        .sub-score-card.left .pts { color: #000000; }

        .section-stats-section h2, .responses-section h2 {
          font-size: 10px;
          margin: 0 0 6px 0;
          color: #000000;
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
          color: #000000;
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
          color: #000000;
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
          color: #000000;
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
          color: #000000;
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
