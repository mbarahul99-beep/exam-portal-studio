import React, { useState } from 'react';
import { 
  Trash2, 
  TrendingUp, 
  Users, 
  Camera, 
  Share2, 
  Globe, 
  X, 
  FileSpreadsheet, 
  FileText, 
  ArrowLeft, 
  Key, 
  Award, 
  CheckCircle, 
  Settings, 
  Scan, 
  Lock, 
  Filter, 
  Check,
  Send,
  Printer,
  Download,
  UserX
} from 'lucide-react';
import { db, type Exam, type ExamSubmission, type Student } from '../db';
import { ScanImagesView } from './ScanImagesView';
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
  // Navigation inside Exam Details view: 'hub' (Screenshot 1) | 'reports' (Screenshot 2) | 'absentees' | 'analysis'
  const [activeView, setActiveView] = useState<'hub' | 'reports' | 'absentees' | 'analysis'>('hub');
  const [isScanningMode, setIsScanningMode] = useState(false);
  const [showAnswerKeyModal, setShowAnswerKeyModal] = useState(false);
  const [editableKeys, setEditableKeys] = useState<Record<number, string>>(() => ({ ...(exam.answerKey || {}) }));
  const [isSavingKey, setIsSavingKey] = useState(false);

  // WhatsApp Broadcast States
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [broadcastTotal, setBroadcastTotal] = useState(0);
  const [broadcastLog, setBroadcastLog] = useState<{ name: string; status: 'success' | 'warning' | 'error'; details: string }[]>([]);
  const [isCancelRequested, setIsCancelRequested] = useState(false);

  // Submissions and class statistics
  const examSubs = submissions.filter(s => s.examId === exam.id);
  const classStudents = students.filter(s => s.className === exam.className);
  const totalClassCount = classStudents.length > 0 ? classStudents.length : Math.max(examSubs.length, 1);
  const scannedPercentage = Math.min(100, Math.round((examSubs.length / totalClassCount) * 100));

  // Calculate absent students (enrolled in class but sheet not scanned/submitted)
  const submittedStudentIds = new Set(examSubs.map(s => s.studentId));
  const absentStudents = classStudents
    .filter(st => !submittedStudentIds.has(st.id!))
    .map(st => ({
      ...st,
      cleanName: st.name.split('/')[0].trim()
    }));

  const handleNotifyAbsentee = async (student: Student) => {
    const config = await getWhatsAppConfig();
    if (!config.metaAccessToken || !config.phoneNumberId) {
      alert("WhatsApp API credentials are not configured. Go to the 'WhatsApp API' settings tab first.");
      return;
    }

    if (!student.whatsappNumber) {
      alert(`WhatsApp number is missing in roster profile for ${student.name.split('/')[0].trim()}.`);
      return;
    }

    const cleanName = student.name.split('/')[0].trim();
    try {
      const result = await sendWhatsAppTemplateMessage({
        recipientPhone: student.whatsappNumber,
        studentName: cleanName,
        examTitle: exam.title,
        reportUrl: window.location.origin,
        accessToken: 'ABSENT'
      }, config);

      if (result.success) {
        alert(`Sent absence alert to ${cleanName}'s parent via WhatsApp!`);
      } else {
        alert(`WhatsApp error: ${result.error || 'Failed to send notification.'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleBroadcastAbsentees = async () => {
    if (absentStudents.length === 0) {
      alert("All students in this class have submitted their exam. No absentees!");
      return;
    }

    if (confirm(`Send WhatsApp absence alert to all ${absentStudents.length} absent students' parents?`)) {
      for (const st of absentStudents) {
        await handleNotifyAbsentee(st);
      }
    }
  };

  // Compute student map & dense ranks for reports
  const studentMap = new Map(students.map(s => [s.id, s]));
  const rankedLeaderboard = examSubs.map(sub => {
    const student = studentMap.get(sub.studentId);
    
    // Strip father name if present in "Name / FatherName" format -> Show Student Name ONLY
    const rawName = student ? student.name : 'Unknown Student';
    const cleanName = rawName.split('/')[0].trim();

    // Compute detailed counts
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    for (let q = 1; q <= exam.numQuestions; q++) {
      const ans = sub.answers ? sub.answers[q] : '';
      const key = exam.answerKey ? exam.answerKey[q] : '';
      if (!ans) unansweredCount++;
      else if (ans === key) correctCount++;
      else wrongCount++;
    }

    return {
      ...sub,
      studentName: cleanName,
      fullRawName: rawName,
      studentNum: student ? student.studentNum : '',
      className: student ? student.className : '',
      correctCount,
      wrongCount,
      unansweredCount
    };
  }).sort((a, b) => b.score - a.score);

  // Dense ranking
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

  // Save updated Answer Keys directly to DB & recalculate student scores
  const handleSaveAnswerKeys = async () => {
    setIsSavingKey(true);
    try {
      // 1. Update exam answerKey in DB
      await db.exams.update(exam.id!, { answerKey: editableKeys });

      // 2. Recalculate scores for all submissions of this exam
      const cMarks = exam.correctMarks ?? 4;
      const wMarks = exam.incorrectMarks ?? 0;
      const uMarks = exam.unansweredMarks ?? 0;

      for (const sub of examSubs) {
        let newScore = 0;
        for (let q = 1; q <= exam.numQuestions; q++) {
          const ans = sub.answers ? sub.answers[q] : '';
          const key = editableKeys[q];
          if (!ans) {
            newScore += uMarks;
          } else if (ans === key) {
            newScore += cMarks;
          } else {
            newScore += wMarks;
          }
        }
        await db.submissions.update(sub.id!, { score: newScore });
      }

      alert(`Successfully saved updated Answer Keys for Q1 to Q${exam.numQuestions}!`);
      setShowAnswerKeyModal(false);
    } catch (err: any) {
      alert(`Failed to save answer key: ${err.message}`);
    } finally {
      setIsSavingKey(false);
    }
  };

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

  const handleDownloadExcelReport = () => {
    if (examSubs.length === 0) {
      alert("No student submissions available for this exam yet to export.");
      return;
    }

    const totalPossible = exam.numQuestions * (exam.correctMarks ?? 4);

    // Build CSV export content
    const headers = ["Rank", "Roll Number", "Student Name", "Class", "Score", "Total Marks", "Percentage", "Submission Date"];
    const rows = rankedRows.map(row => {
      const pct = totalPossible > 0 ? Math.max(0, Math.round((row.score / totalPossible) * 100)) : 0;
      const dateStr = new Date(row.scannedAt).toLocaleString().replace(/,/g, '');
      return [
        row.rank,
        `"${row.studentNum || ''}"`,
        `"${row.studentName.replace(/"/g, '""')}"`,
        `"${row.className || ''}"`,
        row.score,
        totalPossible,
        `${pct}%`,
        `"${dateStr}"`
      ].join(",");
    });

    const csvString = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const sanitizedTitle = exam.title.replace(/[^a-zA-Z0-9_-]/g, "_");
    link.download = `${sanitizedTitle}_Report.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const startWhatsAppBroadcast = async () => {
    const config = await getWhatsAppConfig();
    if (!config.metaAccessToken || !config.phoneNumberId) {
      alert("WhatsApp API credentials are not configured. Go to the 'WhatsApp API' settings tab first.");
      return;
    }

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

      const reportUrl = `${window.location.origin}/#/report-view/${sub.accessToken}`;

      const result = await sendWhatsAppTemplateMessage({
        recipientPhone: student.whatsappNumber,
        studentName: student.name.split('/')[0].trim(),
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

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsBroadcasting(false);
  };

  if (isScanningMode) {
    return (
      <ScanImagesView 
        exam={exam}
        students={students}
        onClose={() => setIsScanningMode(false)}
      />
    );
  }

  const dateObj = new Date(exam.date);
  const monthStr = dateObj.toLocaleDateString('en-US', { month: 'short' });
  const dayStr = dateObj.getDate();
  const firstKey = Object.values(exam.answerKey || {})[0] || 'A';

  return (
    <div className="exam-details-panel animate-fade-in" style={{ paddingBottom: '120px' }}>
      
      {/* VIEW 1: EXAM DETAILS HUB (Matching Screenshot 1) */}
      {activeView === 'hub' && (
        <div className="exam-details-hub animate-fade-in">
          
          {/* Top Bar Navigation (Screenshot 1) */}
          <div className="hub-top-bar">
            <div className="hub-left-title">
              <button className="hub-back-btn" onClick={onClose} title="Back to Exams List">
                <ArrowLeft size={20} />
              </button>
              <h2 className="hub-page-title">Exam Details</h2>
            </div>

            <div className="hub-top-actions">
              <button className="hub-action-icon text-error" onClick={handleDeleteExam} title="Delete Exam">
                <Trash2 size={20} />
              </button>
              <button className="hub-action-icon" onClick={handleShareLink} title="Share Link">
                <Share2 size={20} />
              </button>
            </div>
          </div>

          {/* Top Card (Matching Screenshot 1) */}
          <div className="hub-main-card">
            <div className="card-top-row">
              <div className="hub-date-badge-box">
                <span className="month">{monthStr}</span>
                <span className="day">{dayStr}</span>
              </div>

              <div className="card-title-block">
                <div className="title-status-line">
                  <h3 className="exam-title-text">{exam.title}</h3>
                  <span 
                    className={`status-pill ${exam.status === 'public' ? 'public' : 'draft'}`} 
                    onClick={handleTogglePublish}
                    style={{ cursor: 'pointer' }}
                    title="Click to toggle Public / Draft"
                  >
                    {exam.status === 'public' ? <><Globe size={11} /> Public</> : <><Lock size={11} /> Draft</>}
                  </span>
                </div>

                {/* Sub Metadata (No Question Mark ?) */}
                <div className="card-submeta-row">
                  <span>{exam.numQuestions} Qs</span>
                  <span className="sep">|</span>
                  <span><Key size={13} /> {firstKey}...</span>
                  <span className="sep">|</span>
                  <span><Users size={13} /> {exam.className}</span>
                </div>
              </div>
            </div>

            {/* Bottom Progress Row inside Top Card (Screenshot 1) */}
            <div className="card-progress-row">
              <div className="progress-info-side">
                <div className="progress-text-line">
                  <span className="scanned-label">Sheet Scanned</span>
                  <span className="scanned-ratio">{examSubs.length}/{totalClassCount}</span>
                </div>
                <div className="scanned-bar-track">
                  <div className="scanned-bar-fill" style={{ width: `${scannedPercentage}%` }} />
                </div>
              </div>

              <button className="btn-view-reports-primary" onClick={() => setActiveView('reports')}>
                View Reports
              </button>
            </div>

            {isBroadcasting && (
              <div className="broadcast-progress-banner mt-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem', color: '#15803d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Broadcasting WhatsApp report links: <strong>{broadcastProgress}/{broadcastTotal}</strong> sent...</span>
                <button className="btn-secondary-sm" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setIsCancelRequested(true)}>Cancel</button>
              </div>
            )}
          </div>

          {/* SECTION 1: Exam Management (Matching Screenshot 1 Grid) */}
          <div className="hub-section-block mt-4">
            <h4 className="hub-section-heading">Exam Management</h4>

            <div className="circular-buttons-grid">
              <button className="circular-action-card" onClick={() => setShowAnswerKeyModal(true)}>
                <div className="circle-icon-box">
                  <Key size={22} color="#1058ca" />
                </div>
                <span className="action-label">Answer Key</span>
              </button>

              <button className="circular-action-card" onClick={() => setIsScanningMode(true)}>
                <div className="circle-icon-box">
                  <Scan size={22} color="#1058ca" />
                </div>
                <span className="action-label">Scan Sheet</span>
              </button>

              <button className="circular-action-card" onClick={() => onEdit(exam.id!)}>
                <div className="circle-icon-box">
                  <Settings size={22} color="#1058ca" />
                </div>
                <span className="action-label">Exam Settings</span>
              </button>

              <button className="circular-action-card" onClick={() => onPrintRedirect(exam)}>
                <div className="circle-icon-box">
                  <Printer size={22} color="#1058ca" />
                </div>
                <span className="action-label">OMR/Bubble Sheet</span>
              </button>

              <button className="circular-action-card" onClick={() => onDownloadJPG(exam)}>
                <div className="circle-icon-box">
                  <Download size={22} color="#1058ca" />
                </div>
                <span className="action-label">Download OMR JPG</span>
              </button>

              <button className="circular-action-card" onClick={startWhatsAppBroadcast}>
                <div className="circle-icon-box">
                  <Send size={22} color="#16a34a" />
                </div>
                <span className="action-label">WhatsApp Broadcast</span>
              </button>
            </div>
          </div>

          {/* SECTION 2: Reporting (Matching Screenshot 1 Grid) */}
          <div className="hub-section-block mt-4">
            <h4 className="hub-section-heading">Reporting</h4>

            <div className="circular-buttons-grid">
              <button className="circular-action-card" onClick={() => setActiveView('reports')}>
                <div className="circle-icon-box">
                  <FileText size={22} color="#1058ca" />
                </div>
                <span className="action-label">View Reports</span>
              </button>

              <button className="circular-action-card" onClick={() => setActiveView('absentees')}>
                <div className="circle-icon-box" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
                  <UserX size={22} color="#dc2626" />
                </div>
                <span className="action-label" style={{ color: '#dc2626', fontWeight: 700 }}>Absentees</span>
              </button>

              <button className="circular-action-card" onClick={handleDownloadExcelReport}>
                <div className="circle-icon-box">
                  <FileSpreadsheet size={22} color="#1058ca" />
                </div>
                <span className="action-label">Download Excel</span>
              </button>

              <button className="circular-action-card" onClick={() => setActiveView('reports')}>
                <div className="circle-icon-box">
                  <TrendingUp size={22} color="#1058ca" />
                </div>
                <span className="action-label">Analysis</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* VIEW 2: STUDENT REPORTS LIST (Matching Screenshot 2) */}
      {activeView === 'reports' && (
        <div className="exam-reports-page animate-fade-in">
          {/* Top Bar (Screenshot 2) */}
          <div className="reports-top-bar">
            <div className="bar-left">
              <button className="back-btn-circle" onClick={() => setActiveView('hub')} title="Back to Exam Details">
                <ArrowLeft size={20} />
              </button>
              <h2 className="reports-exam-title">{exam.title}</h2>
            </div>

            <button className="scan-sheet-header-btn" onClick={() => setIsScanningMode(true)}>
              <Scan size={16} /> Scan Sheet
            </button>
          </div>

          {/* Top Summary Cards (Screenshot 2) */}
          <div className="reports-summary-cards">
            <div className="summary-card">
              <div className="card-icon-sq blue">
                <span>∑</span>
              </div>
              <div className="card-info">
                <span className="label">Marks</span>
                <span className="val">{(exam.numQuestions * (exam.correctMarks ?? 4)).toFixed(1)}</span>
              </div>
            </div>

            <div className="summary-card">
              <div className="card-icon-sq blue-light">
                <Scan size={18} />
              </div>
              <div className="card-info">
                <span className="label">Reports</span>
                <span className="val">{examSubs.length}</span>
              </div>
            </div>

            <button className="filter-icon-btn" title="Filter Roster">
              <Filter size={20} />
            </button>
          </div>

          {/* Student Roster Cards List (Screenshot 2) */}
          <div className="reports-roster-list mt-3">
            {rankedRows.length === 0 ? (
              <div className="empty-roster-card">
                <p>No student reports available for this exam yet.</p>
                <button className="btn-primary-sm mt-2" onClick={() => setIsScanningMode(true)}>
                  <Camera size={16} /> Scan First Sheet
                </button>
              </div>
            ) : (
              rankedRows.map((row) => {
                const initial = row.studentName ? row.studentName.charAt(0).toUpperCase() : 'S';

                return (
                  <div key={`report-row-${row.id}`} className="student-report-card" onClick={() => onViewAnalysis(row)}>
                    <div className="student-card-main-row">
                      {/* Circle Avatar with Initial */}
                      <div className="student-avatar-circle">
                        <span>{initial}/</span>
                      </div>

                      {/* Student Info: Name ONLY (No Father Name!) */}
                      <div className="student-name-block">
                        <h4 className="student-primary-name">{row.studentName}</h4>
                        <span className="student-roll-no">{row.studentNum || '40'}</span>
                      </div>

                      {/* Rank Badge */}
                      <div className="student-rank-badge">
                        <Award size={14} />
                        <span>{row.rank}</span>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="student-card-stats-row">
                      <div className="stat-score">
                        <span className="symbol">∑</span>
                        <span className="score-num">{row.score.toFixed(1)}</span>
                      </div>

                      <span className="stat-sep">|</span>

                      <div className="stat-pill correct">
                        <CheckCircle size={14} />
                        <span>{row.correctCount}</span>
                      </div>

                      <div className="stat-pill wrong">
                        <X size={14} />
                        <span>{row.wrongCount}</span>
                      </div>

                      <div className="stat-pill unanswered">
                        <span className="circle-empty">◯</span>
                        <span>{row.unansweredCount}</span>
                      </div>

                      <div className="stat-verified-check">
                        <Check size={14} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: ABSENTEES ROSTER PAGE */}
      {activeView === 'absentees' && (
        <div className="exam-reports-page animate-fade-in">
          {/* Top Bar */}
          <div className="reports-top-bar">
            <div className="bar-left">
              <button className="back-btn-circle" onClick={() => setActiveView('hub')} title="Back to Exam Details">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="reports-exam-title" style={{ margin: 0 }}>Absentees List</h2>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{exam.title} ({exam.className})</span>
              </div>
            </div>

            {absentStudents.length > 0 && (
              <button 
                className="btn-primary-sm" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: '#dc2626', borderColor: '#dc2626' }} 
                onClick={handleBroadcastAbsentees}
              >
                <Send size={14} /> Notify All Absentees
              </button>
            )}
          </div>

          {/* Top Summary Cards for Absentees */}
          <div className="reports-summary-cards">
            <div className="summary-card">
              <div className="card-icon-sq blue">
                <Users size={18} />
              </div>
              <div className="card-info">
                <span className="label">Total Enrolled</span>
                <span className="val">{totalClassCount}</span>
              </div>
            </div>

            <div className="summary-card">
              <div className="card-icon-sq blue-light">
                <CheckCircle size={18} />
              </div>
              <div className="card-info">
                <span className="label">Appeared</span>
                <span className="val">{examSubs.length}</span>
              </div>
            </div>

            <div className="summary-card" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
              <div className="card-icon-sq" style={{ background: '#fee2e2', color: '#dc2626' }}>
                <UserX size={18} />
              </div>
              <div className="card-info">
                <span className="label" style={{ color: '#991b1b' }}>Absent</span>
                <span className="val" style={{ color: '#dc2626' }}>{absentStudents.length}</span>
              </div>
            </div>
          </div>

          {/* Absent Students List */}
          <div className="reports-roster-list mt-3">
            {absentStudents.length === 0 ? (
              <div className="empty-roster-card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', textAlign: 'center', padding: '30px' }}>
                <CheckCircle size={40} color="#16a34a" style={{ margin: '0 auto 10px' }} />
                <h3 style={{ margin: '0 0 6px 0', color: '#166534', fontWeight: 800 }}>No Absentees!</h3>
                <p style={{ margin: 0, color: '#15803d', fontSize: '0.9rem' }}>All enrolled students in {exam.className} have submitted this exam.</p>
              </div>
            ) : (
              absentStudents.map((st) => {
                const initial = st.cleanName ? st.cleanName.charAt(0).toUpperCase() : 'A';

                return (
                  <div key={`absent-st-${st.id}`} className="student-report-card" style={{ borderLeft: '4px solid #dc2626' }}>
                    <div className="student-card-main-row">
                      {/* Circle Avatar with Initial */}
                      <div className="student-avatar-circle" style={{ background: '#fef2f2', color: '#dc2626' }}>
                        <span>{initial}/</span>
                      </div>

                      {/* Student Name ONLY - No father name! */}
                      <div className="student-name-block">
                        <h4 className="student-primary-name">{st.cleanName}</h4>
                        <span className="student-roll-no">Roll No: {st.studentNum || 'N/A'} • {st.className}</span>
                      </div>

                      {/* Absent Badge */}
                      <div className="status-pill" style={{ background: '#fee2e2', color: '#dc2626', fontWeight: 800, padding: '4px 10px', fontSize: '0.8rem' }}>
                        <UserX size={13} /> Absent
                      </div>
                    </div>

                    {/* Action Row */}
                    <div className="student-card-stats-row" style={{ justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {st.whatsappNumber ? `📱 ${st.whatsappNumber}` : 'No WhatsApp number listed'}
                      </span>

                      <button 
                        className="btn-feature-action whatsapp" 
                        style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '6px' }}
                        onClick={() => handleNotifyAbsentee(st)}
                      >
                        <Send size={13} /> Send Alert
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ANSWER KEY DIRECT UPDATE MODAL */}
      {showAnswerKeyModal && (
        <div className="modal-backdrop" onClick={() => setShowAnswerKeyModal(false)}>
          <div className="modal-content answer-key-modal animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Answer Key Editor</h3>
                <p className="subtitle" style={{ margin: 0 }}>{exam.title} ({exam.numQuestions} Questions)</p>
              </div>
              <button className="btn-close-icon" onClick={() => setShowAnswerKeyModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="answer-key-grid-container">
              {Array.from({ length: exam.numQuestions }, (_, i) => i + 1).map((q) => {
                const currentOpt = editableKeys[q] || 'A';
                const optionsList = ['A', 'B', 'C', 'D'];

                return (
                  <div key={`ak-q-${q}`} className="ak-question-row">
                    <span className="ak-q-label">Q{q}</span>
                    <div className="ak-options-group">
                      {optionsList.map((opt) => (
                        <button
                          key={`ak-q-${q}-opt-${opt}`}
                          className={`ak-opt-btn ${currentOpt === opt ? 'active' : ''}`}
                          onClick={() => {
                            setEditableKeys(prev => ({ ...prev, [q]: opt }));
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAnswerKeyModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveAnswerKeys} disabled={isSavingKey}>
                {isSavingKey ? 'Saving...' : 'Save Answer Key'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
