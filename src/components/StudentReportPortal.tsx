import React, { useState } from 'react';
import { LogOut, Award, BookOpen, TrendingUp, Activity, Calendar, ChevronLeft, Download, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { db, type Exam, type ExamSubmission } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { StudentReportPrint } from './StudentReportPrint';

interface StudentReportPortalProps {
  studentId: number;
  onLogout: () => void;
}

export const StudentReportPortal: React.FC<StudentReportPortalProps> = ({ studentId, onLogout }) => {
  const [activeAnalysisSub, setActiveAnalysisSub] = useState<(ExamSubmission & { exam: Exam; studentRank: number; totalStudents: number; classAvg: number }) | null>(null);

  // Live queries
  const student = useLiveQuery(() => db.students.get(studentId), [studentId]);
  const submissions = useLiveQuery(() => db.submissions.where('studentId').equals(studentId).toArray(), [studentId]) || [];
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const allSubmissions = useLiveQuery(() => db.submissions.toArray()) || [];

  // Match exam, calculate rank, and class average for each submission
  const examMap = new Map(exams.map(e => [e.id, e]));
  const studentHistory = submissions.map(sub => {
    const exam = examMap.get(sub.examId);
    if (!exam) return null;

    // Filter submissions for this exam to calculate rank & class average
    const examSubs = allSubmissions.filter(s => s.examId === sub.examId);
    const sortedSubs = [...examSubs].sort((a, b) => b.score - a.score);

    // Compute dense rank
    let rank = 1;
    let lastScore = -1;
    let countInTie = 0;
    let studentRank = 1;

    sortedSubs.forEach((s) => {
      if (s.score !== lastScore) {
        rank = rank + countInTie;
        countInTie = 1;
        lastScore = s.score;
      } else {
        countInTie++;
      }
      if (s.studentId === studentId) {
        studentRank = rank;
      }
    });

    const totalStudents = examSubs.length;

    // Calculate Class Average
    const sumScores = examSubs.reduce((acc, curr) => acc + curr.score, 0);
    const classAvg = totalStudents > 0 ? Math.round((sumScores / totalStudents) * 10) / 10 : 0;

    return {
      ...sub,
      exam,
      studentRank,
      totalStudents,
      classAvg
    };
  }).filter(item => item !== null) as Array<ExamSubmission & { exam: Exam; studentRank: number; totalStudents: number; classAvg: number }>;

  // Calculate Overall KPIs
  let totalPctSum = 0;
  let totalScoreSum = 0;
  let totalPossibleSum = 0;
  let rankSum = 0;

  studentHistory.forEach(item => {
    const maxScore = item.exam.numQuestions * (item.exam.correctMarks || 4);
    const pct = maxScore > 0 ? (item.score / maxScore) * 100 : 0;
    totalPctSum += pct;
    totalScoreSum += item.score;
    totalPossibleSum += maxScore;
    rankSum += item.studentRank;
  });

  const avgAccuracy = studentHistory.length > 0 ? Math.round(totalPctSum / studentHistory.length) : 0;
  const avgRank = studentHistory.length > 0 ? (rankSum / studentHistory.length).toFixed(1) : '0';

  // Section-wise strength aggregation across all exams (excluding performance recommendations)
  const sectionCorrect: Record<string, number> = {};
  const sectionTotal: Record<string, number> = {};

  studentHistory.forEach(item => {
    const exam = item.exam;
    for (let q = 1; q <= exam.numQuestions; q++) {
      const secName = getQuestionSection(q, exam);
      const sAns = item.answers[q];
      const cAns = exam.answerKey[q];
      
      sectionTotal[secName] = (sectionTotal[secName] || 0) + 1;
      if (sAns === cAns) {
        sectionCorrect[secName] = (sectionCorrect[secName] || 0) + 1;
      }
    }
  });

  const sectionStats = Object.keys(sectionTotal).map(name => {
    const tot = sectionTotal[name];
    const corr = sectionCorrect[name] || 0;
    const pct = tot > 0 ? Math.round((corr / tot) * 100) : 0;
    return {
      name,
      correct: corr,
      total: tot,
      percentage: pct
    };
  }).sort((a, b) => b.percentage - a.percentage);

  if (!student) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f7fafc' }}>
        <p style={{ fontSize: '0.9rem', color: '#718096' }}>Loading candidate profile data...</p>
      </div>
    );
  }

  // Calculate stats for the selected exam analysis modal
  let analysisDetails = null;
  if (activeAnalysisSub) {
    const maxScore = activeAnalysisSub.exam.numQuestions * (activeAnalysisSub.exam.correctMarks || 4);
    const accuracy = maxScore > 0 ? Math.round((activeAnalysisSub.score / maxScore) * 100) : 0;

    // Calculate section-wise breakdown for THIS specific exam
    const secTotals: Record<string, number> = {};
    const secCorrects: Record<string, number> = {};
    const secIncorrects: Record<string, number> = {};
    const secUnanswereds: Record<string, number> = {};

    for (let q = 1; q <= activeAnalysisSub.exam.numQuestions; q++) {
      const secName = getQuestionSection(q, activeAnalysisSub.exam);
      const sAns = activeAnalysisSub.answers[q];
      const cAns = activeAnalysisSub.exam.answerKey[q];
      
      secTotals[secName] = (secTotals[secName] || 0) + 1;
      
      if (!sAns) {
        secUnanswereds[secName] = (secUnanswereds[secName] || 0) + 1;
      } else if (sAns === cAns) {
        secCorrects[secName] = (secCorrects[secName] || 0) + 1;
      } else {
        secIncorrects[secName] = (secIncorrects[secName] || 0) + 1;
      }
    }

    const uniqueSections = Array.from(new Set(Object.keys(secTotals)));
    const sectionAnalysisRows = uniqueSections.map(secName => {
      const tot = secTotals[secName];
      const corr = secCorrects[secName] || 0;
      const incorr = secIncorrects[secName] || 0;
      const unans = secUnanswereds[secName] || 0;
      
      const secRules = activeAnalysisSub.exam.sectionsMarking?.[secName] || {
        correctMarks: activeAnalysisSub.exam.correctMarks || 4,
        incorrectMarks: activeAnalysisSub.exam.incorrectMarks || -1
      };
      
      const secScore = (corr * secRules.correctMarks) + (incorr * secRules.incorrectMarks);
      const maxSecScore = tot * secRules.correctMarks;

      return {
        name: secName,
        total: tot,
        correct: corr,
        incorrect: incorr,
        unanswered: unans,
        score: secScore,
        maxScore: maxSecScore
      };
    });

    analysisDetails = {
      maxScore,
      accuracy,
      sectionRows: sectionAnalysisRows
    };
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#f8fafc', padding: '24px 16px', boxSizing: 'border-box', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Print-only scorecard document */}
      {activeAnalysisSub && (
        <div className="print-only">
          <StudentReportPrint 
            exam={activeAnalysisSub.exam}
            student={student}
            submission={activeAnalysisSub}
          />
        </div>
      )}

      {/* Main Dashboard Screen (hidden on print) */}
      <div className="no-print" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Active Detailed Exam Analysis View */}
        {activeAnalysisSub && analysisDetails ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            
            {/* Analysis Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <button 
                onClick={() => setActiveAnalysisSub(null)}
                style={{ background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 16px', fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ChevronLeft size={16} /> Back to Dashboard
              </button>

              <button 
                onClick={() => window.print()}
                style={{ background: '#2563eb', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '0.8rem', fontWeight: 'bold', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(37,99,235,0.2)' }}
              >
                <Download size={16} /> Download PDF Report
              </button>
            </div>

            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
                {activeAnalysisSub.exam.title}
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                Detailed Performance Diagnostic & Section-wise Evaluation
              </p>
            </div>

            {/* Sub KPI Row for this specific exam */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Your Score</span>
                <h3 style={{ margin: '6px 0 0 0', fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>
                  {activeAnalysisSub.score} <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'normal' }}>/ {analysisDetails.maxScore}</span>
                </h3>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Class Standing</span>
                <h3 style={{ margin: '6px 0 0 0', fontSize: '1.5rem', fontWeight: 900, color: '#16a34a' }}>
                  Rank #{activeAnalysisSub.studentRank} <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'normal' }}>/ {activeAnalysisSub.totalStudents}</span>
                </h3>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Class Average</span>
                <h3 style={{ margin: '6px 0 0 0', fontSize: '1.5rem', fontWeight: 900, color: '#475569' }}>
                  {activeAnalysisSub.classAvg} <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'normal' }}>/ {analysisDetails.maxScore}</span>
                </h3>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Accuracy Rate</span>
                <h3 style={{ margin: '6px 0 0 0', fontSize: '1.5rem', fontWeight: 900, color: '#2563eb' }}>
                  {analysisDetails.accuracy}%
                </h3>
              </div>

            </div>

            {/* Split layout: Section-wise table (left) & Question grid (right) */}
            <div className="student-analysis-split">
              
              {/* Left Column: Section Analysis Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Section-wise Performance Breakdown</h3>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 800 }}>
                          <th style={{ padding: '12px 16px' }}>Section / Subject</th>
                          <th style={{ padding: '12px 16px' }}>Correct</th>
                          <th style={{ padding: '12px 16px' }}>Incorrect</th>
                          <th style={{ padding: '12px 16px' }}>Left</th>
                          <th style={{ padding: '12px 16px' }}>Marks Scored</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Accuracy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisDetails.sectionRows.map((row, idx) => {
                          const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #edf2f7' }}>
                              <td style={{ padding: '14px 16px', fontWeight: 'bold' }}>{row.name}</td>
                              <td style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 'bold' }}>{row.correct}</td>
                              <td style={{ padding: '14px 16px', color: '#ef4444', fontWeight: 'bold' }}>{row.incorrect}</td>
                              <td style={{ padding: '14px 16px', color: '#64748b' }}>{row.unanswered}</td>
                              <td style={{ padding: '14px 16px', fontWeight: 'bold' }}>
                                {row.score} <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 'normal' }}>/ {row.maxScore}</span>
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold', color: pct >= 75 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#ea580c' }}>
                                {pct}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Response Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Question Response Map</h3>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                  
                  {/* Color Key */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', fontSize: '0.7rem', color: '#64748b' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={14} style={{ color: '#16a34a' }} /> Correct
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <XCircle size={14} style={{ color: '#ef4444' }} /> Wrong
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <MinusCircle size={14} style={{ color: '#64748b' }} /> Skipped
                    </span>
                  </div>

                  {/* Bubble grid list */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
                    {Array.from({ length: activeAnalysisSub.exam.numQuestions }, (_, i) => {
                      const qNum = i + 1;
                      const sAns = activeAnalysisSub.answers[qNum];
                      const cAns = activeAnalysisSub.exam.answerKey[qNum];
                      
                      const isCorrect = sAns === cAns;
                      const isLeft = !sAns;

                      let bg = '#f1f5f9';
                      let color = '#475569';
                      let border = '1px solid #cbd5e1';

                      if (isLeft) {
                        bg = '#f8fafc';
                        color = '#64748b';
                        border = '1px solid #e2e8f0';
                      } else if (isCorrect) {
                        bg = '#f0fdf4';
                        color = '#15803d';
                        border = '1px solid #bcf0da';
                      } else {
                        bg = '#fdf2f2';
                        color = '#b91c1c';
                        border = '1px solid #fbd5d5';
                      }

                      return (
                        <div 
                          key={qNum}
                          title={`Q.${qNum} | Correct: ${cAns} | Your Answer: ${sAns || 'Left'}`}
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '8px',
                            background: bg,
                            color: color,
                            border: border,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            boxSizing: 'border-box'
                          }}
                        >
                          <span style={{ fontSize: '0.65rem' }}>Q{qNum}</span>
                          <span style={{ fontSize: '0.55rem', fontWeight: 'normal', opacity: 0.8 }}>
                            {sAns || '-'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                </div>
              </div>

            </div>

          </div>
        ) : (
          /* Landing Dashboard Overview screen */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* Top Welcome Header */}
            <header style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.03)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.6rem' }}>⚡</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.05em' }}>Appex</span>
                  <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', fontWeight: 800, padding: '4px 12px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Candidate Hub</span>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Welcome back, <strong style={{ color: '#0f172a' }}>{student.name}</strong> | Roll ID: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{student.studentNum}</code> | Target Stream: <strong style={{ color: '#0f172a' }}>{student.className}</strong>
                </p>
              </div>

              <button 
                onClick={onLogout}
                style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 20px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', transition: 'all 0.2s ease', outline: 'none' }}
              >
                <LogOut size={16} /> Log Out
              </button>
            </header>

            {/* KPI Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overall Accuracy</span>
                  <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.8rem', fontWeight: 900, color: '#2563eb' }}>{avgAccuracy}%</h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mean correctness score</span>
                </div>
                <div style={{ background: '#dbeafe', color: '#2563eb', padding: '12px', borderRadius: '12px' }}>
                  <Award size={24} />
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Average Standing</span>
                  <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.8rem', fontWeight: 900, color: '#16a34a' }}>#{avgRank}</h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dense class rank avg</span>
                </div>
                <div style={{ background: '#dcfce7', color: '#16a34a', padding: '12px', borderRadius: '12px' }}>
                  <TrendingUp size={24} />
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tests Attempted</span>
                  <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.8rem', fontWeight: 900, color: '#7c3aed' }}>{studentHistory.length}</h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>OMR Sheets + CBT exams</span>
                </div>
                <div style={{ background: '#f3e8ff', color: '#7c3aed', padding: '12px', borderRadius: '12px' }}>
                  <BookOpen size={24} />
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cumulative Score</span>
                  <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.6rem', fontWeight: 900, color: '#475569' }}>{totalScoreSum} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 'normal' }}>/ {totalPossibleSum}</span></h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total points achieved</span>
                </div>
                <div style={{ background: '#f1f5f9', color: '#475569', padding: '12px', borderRadius: '12px' }}>
                  <Activity size={24} />
                </div>
              </div>

            </div>

            {/* Split layout: Table roster & Subject aggregation */}
            <div className="student-dashboard-split">
              
              {/* Left Column: Detailed logs list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Detailed Performance Roster</h3>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 800 }}>
                          <th style={{ padding: '18px 24px' }}>Exam details</th>
                          <th style={{ padding: '18px 20px' }}>Your Score vs Avg</th>
                          <th style={{ padding: '18px 20px' }}>Class standing</th>
                          <th style={{ padding: '18px 20px' }}>Accuracy</th>
                          <th style={{ padding: '18px 24px', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentHistory.map((sub, idx) => {
                          const maxScore = sub.exam.numQuestions * (sub.exam.correctMarks || 4);
                          const pct = maxScore > 0 ? Math.round((sub.score / maxScore) * 100) : 0;
                          
                          const diffFromAvg = Math.round((sub.score - sub.classAvg) * 10) / 10;
                          const aboveAvg = diffFromAvg >= 0;

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #edf2f7', transition: 'background 0.2s ease' }}>
                              <td style={{ padding: '18px 24px' }}>
                                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px', fontSize: '0.9rem' }}>{sub.exam.title}</div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Calendar size={12} /> {new Date(sub.exam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                  </span>
                                  <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    background: sub.attemptType === 'Online' ? '#e0f2fe' : '#f0fdf4',
                                    color: sub.attemptType === 'Online' ? '#0369a1' : '#15803d'
                                  }}>
                                    {sub.attemptType || 'OMR'}
                                  </span>
                                </div>
                              </td>

                              <td style={{ padding: '18px 20px' }}>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                                  {sub.score} <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 'normal' }}>/ {maxScore}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Avg: {sub.classAvg}</span>
                                  <span style={{ 
                                    fontSize: '0.7rem', 
                                    fontWeight: 'bold', 
                                    color: aboveAvg ? '#16a34a' : '#ea580c' 
                                  }}>
                                    ({aboveAvg ? '+' : ''}{diffFromAvg})
                                  </span>
                                </div>
                              </td>

                              <td style={{ padding: '18px 20px' }}>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                                  Rank #{sub.studentRank}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                  Out of {sub.totalStudents} students
                                </div>
                              </td>

                              <td style={{ padding: '18px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '50px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#ea580c' }} />
                                  </div>
                                  <span style={{ fontWeight: 800, color: '#0f172a' }}>{pct}%</span>
                                </div>
                              </td>

                              <td style={{ padding: '18px 24px', textAlign: 'right' }}>
                                <button
                                  onClick={() => setActiveAnalysisSub(sub)}
                                  style={{
                                    background: '#2563eb',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '8px 14px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(37,99,235,0.15)',
                                    outline: 'none',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  View Analysis
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Column: Subject Stats Overview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Subject Strength Overview</h3>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 10px rgba(0,0,0,0.01)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {sectionStats.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>No question-level answers recorded to break down subjects.</p>
                    ) : (
                      sectionStats.map((sec, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 'bold' }}>
                            <span style={{ color: '#0f172a' }}>{sec.name}</span>
                            <span style={{ color: '#64748b' }}>{sec.correct} / {sec.total} Qs ({sec.percentage}%)</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div 
                              style={{ 
                                height: '100%', 
                                width: `${sec.percentage}%`, 
                                background: sec.percentage >= 80 ? '#16a34a' : sec.percentage >= 50 ? '#2563eb' : '#ea580c',
                                borderRadius: '4px' 
                              }} 
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* Responsive mobile stylesheet overrides */}
      <style>{`
        .print-only {
          display: none !important;
        }
        .student-dashboard-split {
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          gap: 32px;
          align-items: start;
        }
        .student-analysis-split {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 28px;
          align-items: start;
        }
        @media (max-width: 992px) {
          .student-dashboard-split,
          .student-analysis-split {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
};

/**
 * Helper to determine section name from question number indices.
 * Aligns perfectly with OMR seeder/test specifications.
 */
function getQuestionSection(qIndex: number, exam: Exam): string {
  const numQuestions = exam.numQuestions;
  if (numQuestions === 200) {
    if (qIndex <= 50) return 'Physics';
    if (qIndex <= 100) return 'Chemistry';
    if (qIndex <= 150) return 'Botany';
    return 'Zoology';
  } else {
    const perSec = Math.floor(numQuestions / 3);
    if (perSec === 0) return 'General';
    if (qIndex <= perSec) return 'Physics';
    if (qIndex <= perSec * 2) return 'Chemistry';
    return 'Biology';
  }
}
