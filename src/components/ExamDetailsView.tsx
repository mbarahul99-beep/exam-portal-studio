import React, { useState } from 'react';
import { 
  Printer, 
  Trash2, 
  TrendingUp, 
  ChevronRight, 
  Calendar, 
  Users, 
  Camera, 
  BookOpen,
  Download,
  Share2,
  Globe,
  Edit2
} from 'lucide-react';
import { db, type Exam, type ExamSubmission, type Student } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScanImagesView } from './ScanImagesView';
import { MathRenderer } from './MathRenderer';

interface ExamDetailsViewProps {
  exam: Exam;
  submissions: ExamSubmission[];
  students: Student[];
  onClose: () => void;
  onEdit: (examId: number) => void;
  onPrintRedirect: (exam: Exam) => void;
  onDownloadJPG: (exam: Exam) => void;
  onPrintReport: (submission: any) => void;
}

export const ExamDetailsView: React.FC<ExamDetailsViewProps> = ({ 
  exam, 
  submissions, 
  students, 
  onClose,
  onEdit,
  onPrintRedirect,
  onDownloadJPG,
  onPrintReport
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'result' | 'analysis' | 'questions'>('result');
  const [isScanningMode, setIsScanningMode] = useState(false);
  const [csvInput, setCsvInput] = useState('');

  const dbQuestions = useLiveQuery(
    () => db.questions.where('examId').equals(exam.id!).toArray(),
    [exam.id]
  ) || [];

  const sections = Array.from(new Set(dbQuestions.map(q => q.sectionName))).filter(Boolean);

  const OPTIONS = ['A', 'B', 'C', 'D'];

  const examSubs = submissions.filter(s => s.examId === exam.id);

  // Map student name/num to submissions
  const studentMap = new Map(students.map(s => [s.id, s]));
  const rankedLeaderboard = examSubs.map(sub => {
    const student = studentMap.get(sub.studentId);
    return {
      ...sub,
      studentName: student ? student.name : 'Unknown',
      studentNum: student ? student.studentNum : '',
      className: student ? student.className : ''
    };
  }).sort((a, b) => b.score - a.score);

  // Calculate ranks (dense rank)
  let currentRank = 0;
  let lastScore = -9999;
  let countInTie = 0;

  const rankedRows = rankedLeaderboard.map((s) => {
    if (s.score !== lastScore) {
      currentRank = currentRank + countInTie + 1;
      countInTie = 0;
      lastScore = s.score;
    } else {
      countInTie++;
    }
    return { ...s, rank: currentRank };
  });

  const handleTogglePublish = async () => {
    try {
      const newStatus = exam.status === 'public' ? 'private' : 'public';
      await db.exams.update(exam.id!, { status: newStatus });
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleShareLink = () => {
    const shareUrl = `${window.location.origin}/?onlineExamId=${exam.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert(`Copied Online Exam Link to Clipboard:\n\n${shareUrl}`);
    }).catch(err => {
      alert(`Could not copy link: ${err.message}`);
    });
  };

  const handleImportQuestions = async () => {
    if (!csvInput.trim()) {
      alert("Please paste some CSV question content first.");
      return;
    }

    try {
      const rows = csvInput.split('\n').map(r => r.trim()).filter(Boolean);
      const parsedQuestions = [];
      const updatedKey: Record<number, string> = { ...exam.answerKey };

      for (let i = 0; i < rows.length; i++) {
        const parts = rows[i].split(',').map(p => p.trim());
        if (parts.length < 7) {
          throw new Error(`Row ${i + 1} is invalid. Minimum 7 columns expected (Section, Text, OptA, OptB, OptC, OptD, CorrectIndex).`);
        }

        const sectionName = parts[0];
        const questionText = parts[1];
        const options = [parts[2], parts[3], parts[4], parts[5]];
        const correctIndex = Number(parts[6]) - 1; // 1-based in CSV to 0-based in array
        const explanation = parts[7] || '';

        if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) {
          throw new Error(`Row ${i + 1} has an invalid CorrectOptionIndex value: "${parts[6]}". Must be a number between 1 and 4.`);
        }

        parsedQuestions.push({
          examId: exam.id!,
          sectionName,
          questionText,
          options,
          correctOptionIdx: correctIndex,
          explanation
        });

        // Auto-update OMR answerKey dynamically
        const qNum = i + 1;
        updatedKey[qNum] = OPTIONS[correctIndex];
      }

      // Delete old questions for this exam first
      await db.questions.where('examId').equals(exam.id!).delete();
      
      for (const q of parsedQuestions) {
        await db.questions.add(q);
      }

      // Update the exam's numQuestions and answerKey in IndexedDB
      await db.exams.update(exam.id!, {
        numQuestions: parsedQuestions.length,
        answerKey: updatedKey
      });

      alert(`Successfully imported ${parsedQuestions.length} questions and synchronized answer keys!`);
      setCsvInput('');
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const handleDeleteExam = async () => {
    if (confirm(`Are you sure you want to delete "${exam.title}"? This will permanently delete the exam layout, correct answer keys, and all student graded submissions.`)) {
      try {
        await db.exams.delete(exam.id!);
        await db.submissions.where('examId').equals(exam.id!).delete();
        await db.questions.where('examId').equals(exam.id!).delete();
        onClose();
      } catch (err: any) {
        alert(`Failed to delete exam: ${err.message}`);
      }
    }
  };

  // Stats calculation
  const highestScore = examSubs.length > 0 ? Math.max(...examSubs.map(s => s.score)) : 0;
  const averageScore = examSubs.length > 0 
    ? (examSubs.reduce((acc, s) => acc + s.score, 0) / examSubs.length)
    : 0;

  if (isScanningMode) {
    return (
      <ScanImagesView 
        exam={exam}
        students={students}
        onClose={() => setIsScanningMode(false)}
      />
    );
  }

  return (
    <div className="exam-details-panel animate-fade-in">
      
      {/* Breadcrumb Navigation */}
      <div className="pane-breadcrumb-nav mb-3">
        <span className="breadcrumb-link" onClick={onClose}>Exams</span>
        <ChevronRight size={14} className="sep-icon" />
        <span className="breadcrumb-current">{exam.title}</span>
      </div>

      {/* Main Details Card Header */}
      <div className="glass-card exam-details-header-card mb-4">
        <div className="header-meta-row">
          <div>
            <h2 className="detail-exam-title">{exam.title.toUpperCase()}</h2>
            <div className="exam-meta-pills mt-2">
              <span className="meta-pill">
                <Calendar size={14} />
                {new Date(exam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </span>
              <span className="meta-pill">
                <Users size={14} />
                {exam.className}
              </span>
              <span className="meta-pill font-mono">
                {exam.numQuestions} Qs
              </span>
              <span className="meta-pill text-success" style={{ fontWeight: 'bold' }}>
                +{exam.correctMarks} / {exam.incorrectMarks} pts
              </span>
              <span className={`status-badge ${exam.status === 'public' ? 'success' : 'pending'}`} style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px' }}>
                {exam.status === 'public' ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>

          {/* Action icon buttons row */}
          <div className="action-icons-bar">
            <button 
              className="action-icon-btn" 
              onClick={handleTogglePublish}
              title={exam.status === 'public' ? 'Make Draft' : 'Publish / Make Public'}
              style={{ color: exam.status === 'public' ? 'var(--success)' : 'inherit' }}
            >
              <Globe size={18} />
            </button>
            <button 
              className={`action-icon-btn ${exam.status !== 'public' ? 'disabled-btn' : ''}`} 
              disabled={exam.status !== 'public'}
              onClick={handleShareLink}
              title="Share Online Exam Link"
              style={{ opacity: exam.status !== 'public' ? 0.4 : 1, cursor: exam.status !== 'public' ? 'not-allowed' : 'pointer' }}
            >
              <Share2 size={18} />
            </button>
            <button 
              className="action-icon-btn" 
              onClick={() => onPrintRedirect(exam)}
              title="Print OMR Sheet (PDF)"
            >
              <Printer size={18} />
            </button>
            <button 
              className="action-icon-btn" 
              onClick={() => onDownloadJPG(exam)}
              title="Download OMR Sheet (JPG)"
            >
              <Download size={18} />
            </button>
            <button 
              className="action-icon-btn" 
              onClick={() => setIsScanningMode(true)}
              title="Scan Sheets"
            >
              <Camera size={18} />
            </button>
            <button 
              className="action-icon-btn" 
              onClick={() => alert(`Answer Key for ${exam.title}:\n\n${Object.entries(exam.answerKey).map(([q, ans]) => `Q${q}: ${ans}`).join(', ')}`)}
              title="View Answer Key Config"
            >
              <BookOpen size={18} />
            </button>
            <button 
              className="action-icon-btn text-primary" 
              onClick={() => onEdit(exam.id!)}
              title="Edit Exam Layout & Settings"
            >
              <Edit2 size={18} style={{ color: 'var(--primary)' }} />
            </button>
            <button 
              className="action-icon-btn text-error" 
              onClick={handleDeleteExam}
              title="Delete Exam and Submissions"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Sub-tabs switch */}
        <div className="details-subtabs mt-4">
          <button 
            className={`subtab-btn ${activeSubTab === 'result' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('result')}
          >
            Result
          </button>
          <button 
            className={`subtab-btn ${activeSubTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('analysis')}
          >
            Analysis
          </button>
          <button 
            className={`subtab-btn ${activeSubTab === 'questions' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('questions')}
          >
            Questions
          </button>
        </div>
      </div>

      {/* SUBTAB 1: RESULT PANEL */}
      {activeSubTab === 'result' && (
        <div className="subtab-content-pane">
          {examSubs.length === 0 ? (
            /* Premium folder empty state placeholder */
            <div className="glass-card flex-center-state py-5">
              <div className="folder-illustration-container mb-4">
                <div className="folder-back" />
                <div className="folder-paper p1" />
                <div className="folder-paper p2" />
                <div className="folder-front">
                  <div className="folder-cross">×</div>
                </div>
              </div>
              <h3 className="empty-title">Reports not available</h3>
              <p className="empty-subtitle mb-4">Start scanning sheets to generate student rankings.</p>
              <button 
                className="btn-primary" 
                style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}
                onClick={() => setIsScanningMode(true)}
              >
                <Camera size={18} /> Scan sheets
              </button>
            </div>
          ) : (
            /* Results Table Leaderboard */
            <div className="glass-card">
              <div className="leaderboard-header">
                <h3 style={{ margin: 0 }}>Class Leaderboard</h3>
                <span className="status-badge success" style={{ textTransform: 'capitalize' }}>
                  {examSubs.length} Submissions Graded
                </span>
              </div>
              
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Roll ID</th>
                      <th>Student Name</th>
                      <th>Attempt</th>
                      <th>Violations</th>
                      <th>Score</th>
                      <th>Grade %</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedRows.map((sub) => {
                      const pct = Math.round((sub.score / (exam.numQuestions * exam.correctMarks)) * 100);
                      return (
                        <tr key={`rank-row-${sub.id}`} className="hover-row">
                          <td><strong>#{sub.rank}</strong></td>
                          <td><code>{sub.studentNum}</code></td>
                          <td><strong>{sub.studentName}</strong></td>
                          <td>
                            <span className={`status-badge ${sub.attemptType === 'Online' ? 'info' : 'success'}`} style={{ fontSize: '0.7rem' }}>
                              {sub.attemptType || 'OMR'}
                            </span>
                          </td>
                          <td>
                            {sub.cheatingAlertsCount && sub.cheatingAlertsCount > 0 ? (
                              <span className="status-badge fail" style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>
                                ⚠ {sub.cheatingAlertsCount} blurs
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>None</span>
                            )}
                          </td>
                          <td><strong>{sub.score}</strong> <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>/ {exam.numQuestions * exam.correctMarks}</span></td>
                          <td>
                            <span className={`status-badge ${pct >= 75 ? 'success' : pct >= 50 ? 'info' : 'warning'}`}>
                              {pct}%
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button 
                              className="btn-link" 
                              style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', textDecoration: 'underline', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                              onClick={() => onPrintReport({
                                score: sub.score,
                                answers: sub.answers,
                                scannedAt: sub.scannedAt,
                                studentId: sub.studentId
                              })}
                              title="Print/Download Report Card PDF"
                            >
                              Report PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: ANALYSIS PANEL */}
      {activeSubTab === 'analysis' && (
        <div className="subtab-content-pane">
          {examSubs.length === 0 ? (
            <div className="glass-card flex-center-state py-5">
              <TrendingUp size={48} className="text-secondary mb-3" style={{ opacity: 0.3 }} />
              <h3>Analysis not available</h3>
              <p className="empty-subtitle">Scan and submit OMR sheets first to construct class diagnostics.</p>
            </div>
          ) : (
            <div className="analysis-box-container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Class Summary Stats */}
              <div className="stats-box">
                <div className="box-stat">
                  <span className="box-label">Total Student Submissions</span>
                  <span className="box-val text-success">{examSubs.length}</span>
                </div>
                <div className="box-stat">
                  <span className="box-label">Highest Score in Class</span>
                  <span className="box-val text-indigo">{highestScore} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>/ {exam.numQuestions * exam.correctMarks}</span></span>
                </div>
                <div className="box-stat">
                  <span className="box-label">Average Score</span>
                  <span className="box-val text-warning">{averageScore.toFixed(1)} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>/ {exam.numQuestions * exam.correctMarks}</span></span>
                </div>
              </div>

              {/* Class Performance Index Breakdown */}
              <div className="glass-card">
                <h3>Diagnostic Summary</h3>
                <p className="subtitle mb-4">Percentage score spread of students in the class.</p>
                
                <div className="diagnostic-spread" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {rankedRows.map(row => {
                    const pct = Math.round((row.score / (exam.numQuestions * exam.correctMarks)) * 100);
                    return (
                      <div key={`spread-${row.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span>{row.studentName} (Roll: {row.studentNum})</span>
                          <span><strong>{pct}%</strong> ({row.score} pts)</span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div 
                            style={{ 
                              height: '100%', 
                              width: `${Math.max(0, Math.min(100, pct))}%`, 
                              background: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--primary)' : 'var(--warning)',
                              borderRadius: '4px' 
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: QUESTIONS PANEL */}
      {activeSubTab === 'questions' && (
        <div className="subtab-content-pane">
          <div className="exam-questions-layout">
            
            {/* Left Column: CSV Import & Markings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Custom Marking Schemes */}
              <div className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 'bold' }}>Section-wise Marking Scheme</h3>
                <p className="subtitle" style={{ marginBottom: '16px' }}>Configure positive/negative marks for each question section.</p>

                {sections.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No custom sections found. Standard exam marking scheme applies (+{exam.correctMarks} / {exam.incorrectMarks}) uniformly. Import questions with section names to configure.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sections.map(secName => {
                      const markings = exam.sectionsMarking?.[secName] || {
                        correctMarks: exam.correctMarks,
                        incorrectMarks: exam.incorrectMarks,
                        unansweredMarks: exam.unansweredMarks ?? 0
                      };
                      return (
                        <div key={secName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', flex: 1 }}>{secName}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Correct</span>
                              <input 
                                type="number" 
                                value={markings.correctMarks}
                                onChange={async (e) => {
                                  const newMarkings = {
                                    ...(exam.sectionsMarking || {}),
                                    [secName]: { ...markings, correctMarks: Number(e.target.value) }
                                  };
                                  await db.exams.update(exam.id!, { sectionsMarking: newMarkings });
                                }}
                                style={{ width: '55px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)', color: 'inherit' }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Wrong</span>
                              <input 
                                type="number" 
                                value={markings.incorrectMarks}
                                onChange={async (e) => {
                                  const newMarkings = {
                                    ...(exam.sectionsMarking || {}),
                                    [secName]: { ...markings, incorrectMarks: Number(e.target.value) }
                                  };
                                  await db.exams.update(exam.id!, { sectionsMarking: newMarkings });
                                }}
                                style={{ width: '55px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)', color: 'inherit' }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* CSV Importer */}
              <div className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 'bold' }}>Bulk CSV Questions Importer</h3>
                <p className="subtitle" style={{ marginBottom: '16px' }}>Paste CSV rows to populate the online question database.</p>

                <textarea
                  placeholder={`Physics,Mass is defined as...,Option A,Option B,Option C,Option D,1,Explanation\nChemistry,Atomic number of...,Option A,Option B,Option C,Option D,2,Explanation`}
                  value={csvInput}
                  onChange={e => setCsvInput(e.target.value)}
                  style={{ width: '100%', height: '120px', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', resize: 'vertical', marginBottom: '12px', background: 'rgba(255,255,255,0.02)', color: 'inherit' }}
                />

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn-outlined" 
                    style={{ fontSize: '0.7rem', padding: '6px 12px' }}
                    onClick={() => {
                      setCsvInput(
                        `Physics,Which of the following physical quantities has the same dimensional formula as that of impulse?,Force,Linear Momentum,Torque,Pressure,2,Impulse matches momentum dimensions.\nChemistry,Which of the following organic compounds will show optical activity?,2-Chlorobutane,1-Chlorobutane,2-Chloropropane,Butane,1,2-chlorobutane contains a chiral carbon.\nBotany,Which cell organelle is responsible for cellular respiration and ATP generation?,Ribosome,Mitochondria,Chloroplast,Lysosome,2,Mitochondria generate ATP.\nZoology,The process of division of cytoplasm during cell cycle is named as:,Karyokinesis,Cytokinesis,Mitosis,Meiosis,2,Cytokinesis is cytoplasm division.`
                      );
                    }}
                  >
                    Load Sample
                  </button>
                  <button 
                    className="btn-filled" 
                    style={{ fontSize: '0.7rem', padding: '6px 16px', flex: 1 }}
                    onClick={handleImportQuestions}
                  >
                    Import Questions
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Questions List */}
            <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <div className="question-bank-header">
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>Question Bank ({dbQuestions.length})</h3>
                {dbQuestions.length > 0 && (
                  <button 
                    className="btn-link" 
                    style={{ fontSize: '0.75rem', padding: 0, color: 'var(--warning)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={async () => {
                      if (confirm("Are you sure you want to clear all custom questions for this exam?")) {
                        await db.questions.where('examId').equals(exam.id!).delete();
                      }
                    }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div style={{ flex: 1, maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                {dbQuestions.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
                    No custom questions loaded yet.<br/>
                    <span style={{ fontSize: '0.75rem' }}>The online exam player will generate default NEET mock questions automatically.</span>
                  </p>
                ) : (
                  dbQuestions.map((q, idx) => (
                    <div key={q.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 'bold' }}>Q{idx + 1}. <span className="status-badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'inherit', textTransform: 'uppercase', fontSize: '0.65rem' }}>{q.sectionName}</span></span>
                        <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Correct: Option {OPTIONS[q.correctOptionIdx]}</span>
                      </div>
                      <div style={{ margin: '0 0 8px 0', color: 'inherit', textAlign: 'left' }}>
                        <MathRenderer text={q.questionText} />
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '16px', listStyleType: 'lower-alpha', color: 'var(--text-muted)', textAlign: 'left' }}>
                        {q.options.map((o, oIdx) => (
                          <li key={oIdx} style={{ color: oIdx === q.correctOptionIdx ? 'var(--success)' : 'inherit', fontWeight: oIdx === q.correctOptionIdx ? 'bold' : 'normal' }}>
                            <MathRenderer text={o} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
