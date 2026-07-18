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
  Edit2,
  Send,
  X,
  Search
} from 'lucide-react';
import { db, type Exam, type ExamSubmission, type Student } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScanImagesView } from './ScanImagesView';
import { MathRenderer } from './MathRenderer';
import { getWhatsAppConfig, sendWhatsAppTemplateMessage } from '../utils/whatsappService';

interface ExamDetailsViewProps {
  exam: Exam;
  submissions: ExamSubmission[];
  students: Student[];
  onClose: () => void;
  onEdit: (examId: number) => void;
  onPrintRedirect: (exam: Exam) => void;
  onDownloadJPG: (exam: Exam) => void;
  onViewAnalysis: (submission: any) => void;
}

export const ExamDetailsView: React.FC<ExamDetailsViewProps> = ({ 
  exam, 
  submissions, 
  students, 
  onClose,
  onEdit,
  onPrintRedirect,
  onDownloadJPG,
  onViewAnalysis
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'result' | 'analysis' | 'questions'>('result');
  const [isScanningMode, setIsScanningMode] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  const [bankSectionSelection, setBankSectionSelection] = useState('');
  const centralBank = useLiveQuery(() => db.questionBank.toArray()) || [];

  // WhatsApp Broadcast States
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [broadcastTotal, setBroadcastTotal] = useState(0);
  const [broadcastLog, setBroadcastLog] = useState<{ name: string; status: 'success' | 'warning' | 'error'; details: string }[]>([]);
  const [isCancelRequested, setIsCancelRequested] = useState(false);

  const startWhatsAppBroadcast = async () => {
    // 1. Fetch credentials
    const config = await getWhatsAppConfig();
    if (!config.metaAccessToken || !config.phoneNumberId) {
      alert("WhatsApp API credentials are not configured. Go to the 'WhatsApp API' settings tab first.");
      return;
    }

    // 2. Filter students that actually have submissions for this exam
    const submissionsToSend = submissions.filter(s => s.examId === exam.id);
    if (submissionsToSend.length === 0) {
      alert("No student submissions found for this exam to broadcast.");
      return;
    }

    if (!confirm(`Are you sure you want to broadcast private report card links to ${submissionsToSend.length} parents via WhatsApp?`)) {
      return;
    }

    setIsBroadcasting(true);
    setBroadcastProgress(0);
    setBroadcastTotal(submissionsToSend.length);
    setBroadcastLog([]);
    setIsCancelRequested(false);

    let progressCount = 0;
    const logAccumulator: typeof broadcastLog = [];

    for (const sub of submissionsToSend) {
      // Check if user requested to cancel
      if (isCancelRequested) {
        logAccumulator.push({ name: 'System', status: 'warning', details: 'Broadcast canceled by user.' });
        setBroadcastLog([...logAccumulator]);
        break;
      }

      const student = students.find(s => s.id === sub.studentId);
      if (!student) {
        logAccumulator.push({ name: `Submission ID: ${sub.id}`, status: 'error', details: 'Student not found in database.' });
        setBroadcastLog([...logAccumulator]);
        progressCount++;
        setBroadcastProgress(progressCount);
        continue;
      }

      if (!student.whatsappNumber) {
        logAccumulator.push({ name: student.name, status: 'warning', details: 'WhatsApp number is missing in roster profile.' });
        setBroadcastLog([...logAccumulator]);
        progressCount++;
        setBroadcastProgress(progressCount);
        continue;
      }

      if (!sub.accessToken) {
        logAccumulator.push({ name: student.name, status: 'error', details: 'Submission accessToken is missing. Cannot send link.' });
        setBroadcastLog([...logAccumulator]);
        progressCount++;
        setBroadcastProgress(progressCount);
        continue;
      }

      // Generate the private URL
      const reportUrl = `${window.location.origin}/#/report-view/${sub.accessToken}`;

      // Call API
      const result = await sendWhatsAppTemplateMessage({
        recipientPhone: student.whatsappNumber,
        studentName: student.name,
        examTitle: exam.title,
        reportUrl,
        accessToken: sub.accessToken
      }, config);

      if (result.success) {
        logAccumulator.push({ name: student.name, status: 'success', details: `Sent successfully! (ID: ${result.messageId})` });
      } else {
        logAccumulator.push({ name: student.name, status: 'error', details: result.error || 'Failed to send template.' });
      }

      setBroadcastLog([...logAccumulator]);
      progressCount++;
      setBroadcastProgress(progressCount);

      // Wait 100ms between calls to avoid hitting rate limits too harshly in developer accounts
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsBroadcasting(false);
  };



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

  const handleAddQFromBank = async (bankQ: any) => {
    try {
      const optionLetters = ['A', 'B', 'C', 'D', 'E'];
      const newQNum = exam.numQuestions + 1;

      // Determine section name
      const sectionName = bankSectionSelection || bankQ.subject || 'General';

      // 1. Add question record
      await db.questions.add({
        examId: exam.id!,
        sectionName,
        questionText: bankQ.questionText,
        options: [...bankQ.options],
        correctOptionIdx: bankQ.correctOptionIdx,
        explanation: bankQ.explanation || ''
      });

      // 2. Update Exam parameters (correct option mapping in answerKey)
      const updatedKey = { ...exam.answerKey };
      updatedKey[newQNum] = optionLetters[bankQ.correctOptionIdx] || 'A';

      const updatedKeys = exam.answerKeys ? { ...exam.answerKeys } : {};
      if (exam.answerKeys) {
        Object.keys(updatedKeys).forEach(set => {
          updatedKeys[set][newQNum] = set === 'A' ? (optionLetters[bankQ.correctOptionIdx] || 'A') : 'A';
        });
      }

      await db.exams.update(exam.id!, {
        numQuestions: newQNum,
        answerKey: updatedKey,
        answerKeys: Object.keys(updatedKeys).length > 0 ? updatedKeys : undefined
      });

      alert(`Successfully added "${bankQ.questionText.substring(0, 25)}..." as Q${newQNum}!`);
    } catch (err: any) {
      alert(`Failed to add question: ${err.message}`);
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
              onClick={startWhatsAppBroadcast}
              title="Broadcast Private Report Links to Parents via WhatsApp"
              style={{ color: '#16a34a' }}
            >
              <Send size={18} />
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
                              onClick={() => onViewAnalysis({
                                score: sub.score,
                                answers: sub.answers,
                                scannedAt: sub.scannedAt,
                                studentId: sub.studentId
                              })}
                              title="View Detailed Student Report & Section Analysis"
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

              {/* Central Question Bank search & import */}
              <div className="glass-card" style={{ padding: '20px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '1rem', fontWeight: 'bold' }}>Add from Central Question Bank</h3>
                <p className="subtitle" style={{ marginBottom: '8px' }}>Search and add reusable questions directly to this exam.</p>

                {/* Section Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>TARGET EXAM SECTION</label>
                  {exam.sections && exam.sections.length > 0 ? (
                    <select 
                      value={bankSectionSelection} 
                      onChange={e => setBankSectionSelection(e.target.value)} 
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.75rem', background: '#fff', color: '#1e293b' }}
                    >
                      <option value="">-- Choose Section --</option>
                      {exam.sections.map((sec, idx) => (
                        <option key={idx} value={sec.sectionName}>{sec.subjectName} - {sec.sectionName}</option>
                      ))}
                    </select>
                  ) : (
                    <input 
                      type="text" 
                      value={bankSectionSelection} 
                      onChange={e => setBankSectionSelection(e.target.value)} 
                      placeholder="e.g. Section A" 
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)', color: 'inherit' }} 
                    />
                  )}
                </div>

                {/* Search input */}
                <div style={{ position: 'relative' }}>
                  <Search size={12} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Search central bank..." 
                    value={bankSearch}
                    onChange={e => setBankSearch(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px 6px 26px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)', color: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Results List */}
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', textAlign: 'left' }}>
                  {centralBank.length === 0 ? (
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', margin: '10px 0' }}>Central Bank is empty.</p>
                  ) : (() => {
                    const filtered = centralBank.filter(q => {
                      if (!bankSearch.trim()) return true;
                      const lower = bankSearch.toLowerCase();
                      return q.questionText.toLowerCase().includes(lower) || q.subject.toLowerCase().includes(lower) || q.chapter.toLowerCase().includes(lower);
                    });

                    if (filtered.length === 0) {
                      return <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', margin: '10px 0' }}>No matching questions.</p>;
                    }

                    return filtered.map(q => {
                      const isAlreadyAdded = dbQuestions.some(dbQ => dbQ.questionText === q.questionText);
                      return (
                        <div key={q.id} style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'rgba(255,255,255,0.01)', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                          <div style={{ flex: 1, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 'bold', color: 'var(--primary)', marginRight: '6px' }}>[{q.subject}]</span>
                            <MathRenderer text={q.questionText} />
                          </div>
                          <button 
                            disabled={isAlreadyAdded}
                            onClick={() => handleAddQFromBank(q)}
                            className={isAlreadyAdded ? "btn-outlined" : "btn-filled"}
                            style={{ padding: '4px 8px', fontSize: '0.65rem', borderRadius: '4px', cursor: isAlreadyAdded ? 'default' : 'pointer' }}
                          >
                            {isAlreadyAdded ? 'Added' : 'Add'}
                          </button>
                        </div>
                      );
                    });
                  })()}
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

     {/* WhatsApp Broadcast Progress Modal */}
      {(isBroadcasting || (broadcastTotal > 0 && broadcastProgress === broadcastTotal)) && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="glass-card animate-scale-up" style={{ background: '#ffffff', width: '90%', maxWidth: '500px', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>WhatsApp Broadcast Status</h3>
              {broadcastProgress === broadcastTotal && (
                <button onClick={() => { setIsBroadcasting(false); setBroadcastTotal(0); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}>
                  <X size={18} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold' }}>
                <span style={{ color: 'var(--text-primary)' }}>{broadcastProgress === broadcastTotal ? 'Broadcast Completed!' : 'Sending report cards...'}</span>
                <span style={{ color: 'var(--text-primary)' }}>{broadcastProgress} / {broadcastTotal}</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(broadcastProgress / broadcastTotal) * 100}%`, background: '#16a34a', transition: 'width 0.2s ease', borderRadius: '4px' }} />
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#f8fafc', maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {broadcastLog.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 0' }}>Initializing broadcast queue...</p>
              ) : (
                [...broadcastLog].reverse().map((log, logIdx) => (
                  <div key={`log-${logIdx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', borderBottom: '0.5px solid #edf2f7', paddingBottom: '4px' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{log.name}</span>
                    <span style={{ 
                      color: log.status === 'success' ? '#16a34a' : log.status === 'warning' ? '#d97706' : '#ef4444', 
                      fontWeight: 'bold', 
                      textAlign: 'right' 
                    }}>
                      {log.details}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '4px' }}>
              {broadcastProgress < broadcastTotal && !isCancelRequested && (
                <button 
                  onClick={() => setIsCancelRequested(true)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', borderRadius: '8px', color: '#ef4444', border: '1px solid #ef4444', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                >
                  Cancel Sending
                </button>
              )}
              {broadcastProgress === broadcastTotal && (
                <button 
                  onClick={() => { setIsBroadcasting(false); setBroadcastTotal(0); }}
                  className="btn-primary"
                  style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
