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
  MoreVertical,
  Send,
  Printer,
  Download,
  UserX,
  Eye
} from 'lucide-react';
import { db, type Exam, type ExamSubmission, type Student } from '../db';
import { ScanImagesView } from './ScanImagesView';
import { ResponseAnalysisView } from './ResponseAnalysisView';
import { PublishResultsModal } from './PublishResultsModal';
import { getWhatsAppConfig, sendWhatsAppTemplateMessage } from '../utils/whatsappService';
import { deleteExamFromCloud, pullCloudUpdatesToIndexedDB } from '../utils/cloudSync';

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
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [viewingScannedOmr, setViewingScannedOmr] = useState<{ studentName: string; omrUrl?: string; answers?: Record<number, string>; score?: number; correctCount?: number; wrongCount?: number } | null>(null);
  const [editableKeys, setEditableKeys] = useState<Record<number, string>>(() => ({ ...(exam.answerKey || {}) }));
  const [isSavingKey, setIsSavingKey] = useState(false);

  // WhatsApp Broadcast States
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [broadcastTotal, setBroadcastTotal] = useState(0);
  const [broadcastLog, setBroadcastLog] = useState<{ name: string; status: 'success' | 'warning' | 'error'; details: string }[]>([]);
  const [isCancelRequested, setIsCancelRequested] = useState(false);

  // Submissions and class statistics (Deduplicated by studentId to guarantee exactly 1 record per student)
  const rawExamSubs = submissions.filter(s => s.examId === exam.id);
  const examSubsMap = new Map<number, ExamSubmission>();
  rawExamSubs.forEach(sub => {
    if (!examSubsMap.has(sub.studentId) || (sub.id && sub.id > (examSubsMap.get(sub.studentId)?.id || 0))) {
      examSubsMap.set(sub.studentId, sub);
    }
  });
  const examSubs = Array.from(examSubsMap.values());

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

  const handleDeleteSubmission = async (e: React.MouseEvent, submissionId: number | undefined, studentName: string) => {
    e.stopPropagation();
    if (!submissionId) return;
    if (!window.confirm(`Are you sure you want to delete the scanned OMR sheet record for student: ${studentName}?`)) {
      return;
    }

    try {
      const sub = examSubs.find(s => s.id === submissionId);
      await db.submissions.delete(submissionId);
      
      if (sub) {
        try {
          await fetch('/api/admin/delete-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ examId: sub.examId, studentId: sub.studentId })
          });
        } catch (err) {
          console.warn("Cloud submission deletion error:", err);
        }
      }

      alert(`OMR sheet record for "${studentName}" deleted successfully.`);
      pullCloudUpdatesToIndexedDB();
    } catch (err: any) {
      alert(`Failed to delete submission record: ${err.message || err}`);
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

      // Sync exam to Hostinger MySQL
      const updatedExam = await db.exams.get(exam.id!);
      if (updatedExam) {
        try {
          await fetch('/api/exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedExam)
          });
        } catch (err) {
          console.warn("MySQL exam sync warning:", err);
        }
      }

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

        // Sync submission to Hostinger MySQL
        const updatedSub = await db.submissions.get(sub.id!);
        if (updatedSub) {
          try {
            await fetch('/api/submissions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedSub)
            });
          } catch (err) {
            console.warn("MySQL submission sync warning:", err);
          }
        }
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
        if (exam.id) await deleteExamFromCloud(exam.id);
        await db.exams.delete(exam.id!);
        await db.submissions.where('examId').equals(exam.id!).delete();
        await db.questions.where('examId').equals(exam.id!).delete();
        await pullCloudUpdatesToIndexedDB();
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
    <div className="exam-details-panel animate-fade-in">
      
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
                  <Send size={22} color="#1058ca" />
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
                <div className="circle-icon-box">
                  <UserX size={22} color="#1058ca" />
                </div>
                <span className="action-label">Absentees</span>
              </button>

              <button className="circular-action-card" onClick={handleDownloadExcelReport}>
                <div className="circle-icon-box">
                  <FileSpreadsheet size={22} color="#1058ca" />
                </div>
                <span className="action-label">Download Excel</span>
              </button>

              <button className="circular-action-card" onClick={() => setActiveView('analysis')}>
                <div className="circle-icon-box">
                  <TrendingUp size={22} color="#1058ca" />
                </div>
                <span className="action-label">Response Analysis</span>
              </button>

              <button className="circular-action-card" onClick={() => setShowPublishModal(true)}>
                <div className="circle-icon-box">
                  <Globe size={22} color="#1058ca" />
                </div>
                <span className="action-label">
                  {exam.isResultsPublished ? 'Published' : 'Publish Results'}
                </span>
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

                      <button 
                        type="button"
                        title="View Scanned OMR Sheet"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingScannedOmr({ 
                            studentName: row.studentName, 
                            omrUrl: row.omrImageUrl || undefined, 
                            answers: row.answers, 
                            score: row.score, 
                            correctCount: row.correctCount, 
                            wrongCount: row.wrongCount 
                          });
                        }}
                        style={{
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: '1px solid #bfdbfe',
                          borderRadius: '16px',
                          padding: '4px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                          marginLeft: 'auto',
                          flexShrink: 0
                        }}
                      >
                        <Eye size={14} /> Sheet
                      </button>

                      <button 
                        type="button"
                        title="Delete Scanned OMR Sheet Record"
                        onClick={(e) => handleDeleteSubmission(e, row.id, row.studentName)}
                        style={{
                          background: '#fff5f5',
                          color: '#e53e3e',
                          border: '1px solid #fed7d7',
                          borderRadius: '50%',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          marginLeft: '8px'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: ABSENTEES LIST (CLEAN, PROFESSIONAL, FULL-SCREEN & MOBILE RESPONSIVE) */}
      {activeView === 'absentees' && (
        <div style={{ background: '#ffffff', minHeight: '100vh', width: '100%', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          
          {/* Header Bar */}
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => setActiveView('hub')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1e293b'
                }}
                title="Back to Exam Details"
              >
                <ArrowLeft size={22} />
              </button>

              <div>
                <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  Absentees Roster
                </h1>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                  {exam.title} ({exam.className})
                </div>
              </div>
            </div>

            {absentStudents.length > 0 && (
              <button
                onClick={handleBroadcastAbsentees}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.15)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Send size={14} /> Notify All Absentees ({absentStudents.length})
              </button>
            )}
          </div>

          <div style={{ maxWidth: '720px', margin: '0 auto', padding: '16px' }}>
            
            {/* Clean Summary Stats Strip */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Enrolled</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>{totalClassCount}</div>
              </div>
              <div style={{ borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Appeared</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#16a34a', marginTop: '2px' }}>{examSubs.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Absent</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#dc2626', marginTop: '2px' }}>{absentStudents.length}</div>
              </div>
            </div>

            {/* Absent Students List */}
            {absentStudents.length === 0 ? (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                textAlign: 'center',
                padding: '40px 20px'
              }}>
                <CheckCircle size={44} color="#16a34a" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ margin: '0 0 6px 0', color: '#0f172a', fontWeight: 800 }}>No Absentees!</h3>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>All enrolled students in {exam.className} have appeared for this exam.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {absentStudents.map((st) => {
                  const initial = st.cleanName ? st.cleanName.charAt(0).toUpperCase() : 'A';

                  return (
                    <div 
                      key={`absent-st-${st.id}`} 
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      {/* Top Row: Avatar + Name/Roll + Status Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: '#f1f5f9',
                            color: '#334155',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '1rem'
                          }}>
                            {initial}
                          </div>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                              {st.cleanName}
                            </h4>
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                              Roll No: {st.studentNum || 'N/A'} • {st.className}
                            </div>
                          </div>
                        </div>

                        <span style={{
                          background: '#fef2f2',
                          color: '#991b1b',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid #fecdd3'
                        }}>
                          Absent
                        </span>
                      </div>

                      {/* Action Bar: Phone number + Send Alert Button */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid #f1f5f9',
                        paddingTop: '12px',
                        gap: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                          {st.whatsappNumber ? `📱 ${st.whatsappNumber}` : 'No phone number'}
                        </span>

                        <button 
                          style={{
                            background: '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          onClick={() => handleNotifyAbsentee(st)}
                        >
                          <Send size={12} /> Send Alert
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>
      )}

      {/* VIEW 4: RESPONSE ANALYSIS (MATCHING UPLOADED SCREENSHOTS) */}
      {activeView === 'analysis' && (
        <ResponseAnalysisView 
          exam={exam}
          submissions={submissions}
          onClose={() => setActiveView('hub')}
        />
      )}

      {/* ANSWER KEY DIRECT UPDATE FULL-SCREEN VIEW (EXACT SCREENSHOT MATCH) */}
      {showAnswerKeyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          {/* Top Header */}
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f3f4f6',
            background: '#ffffff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={() => setShowAnswerKeyModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <ArrowLeft size={22} color="#0f172a" />
              </button>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                Answer Key
              </h2>
            </div>

            {/* Quick Fill Dropdown Menu */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  const menu = document.getElementById('ak-quick-menu');
                  if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
              >
                <MoreVertical size={20} color="#0f172a" />
              </button>

              <div
                id="ak-quick-menu"
                style={{
                  display: 'none',
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  background: '#ffffff',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  padding: '8px 0',
                  zIndex: 100,
                  minWidth: '140px'
                }}
              >
                <div style={{ padding: '6px 16px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>QUICK FILL ALL:</div>
                {['A', 'B', 'C', 'D'].map(opt => (
                  <button
                    key={`menu-qf-${opt}`}
                    onClick={() => {
                      const nextKeys: Record<number, string> = {};
                      for (let q = 1; q <= exam.numQuestions; q++) {
                        nextKeys[q] = opt;
                      }
                      setEditableKeys(nextKeys);
                      const menu = document.getElementById('ak-quick-menu');
                      if (menu) menu.style.display = 'none';
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 16px',
                      background: 'transparent',
                      border: 'none',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      cursor: 'pointer'
                    }}
                  >
                    Set All {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Question List View */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 20px',
            boxSizing: 'border-box'
          }}>
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
              {Array.from({ length: exam.numQuestions }, (_, i) => i + 1).map((q) => {
                const currentOpt = editableKeys[q] || 'A';
                const optionsList = ['A', 'B', 'C', 'D'];

                return (
                  <div
                    key={`ak-row-${q}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 4px',
                      borderBottom: '1px solid #f1f5f9'
                    }}
                  >
                    {/* Question Number */}
                    <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1e293b', width: '40px' }}>
                      {q}
                    </span>

                    {/* Option Bubbles */}
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      {optionsList.map((opt) => {
                        const isSelected = currentOpt === opt;
                        return (
                          <button
                            key={`ak-q-${q}-opt-${opt}`}
                            onClick={() => setEditableKeys(prev => ({ ...prev, [q]: opt }))}
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '50%',
                              border: 'none',
                              background: isSelected ? '#008726' : '#e5e7eb',
                              color: isSelected ? '#ffffff' : '#374151',
                              fontWeight: 700,
                              fontSize: '0.95rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.1s ease',
                              boxShadow: isSelected ? '0 2px 6px rgba(0, 135, 38, 0.3)' : 'none'
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Sticky Footer */}
          <div style={{
            padding: '12px 20px 20px',
            borderTop: '1px solid #f3f4f6',
            background: '#ffffff',
            display: 'flex',
            gap: '12px',
            maxWidth: '640px',
            width: '100%',
            margin: '0 auto',
            boxSizing: 'border-box'
          }}>
            {/* Reset Button */}
            <button
              onClick={() => {
                const resetKeys: Record<number, string> = {};
                for (let q = 1; q <= exam.numQuestions; q++) {
                  resetKeys[q] = 'A';
                }
                setEditableKeys(resetKeys);
              }}
              style={{
                flex: 1,
                background: '#ffffff',
                border: '1.5px solid #2563eb',
                borderRadius: '10px',
                padding: '12px',
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#2563eb',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>

            {/* Save Button */}
            <button
              onClick={handleSaveAnswerKeys}
              disabled={isSavingKey}
              style={{
                flex: 1,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '12px',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
              }}
            >
              {isSavingKey ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* PUBLISH EXAM RESULTS MODAL */}
      {showPublishModal && (
        <PublishResultsModal
          exam={exam}
          submissions={submissions}
          onClose={() => setShowPublishModal(false)}
          onStartWhatsAppBroadcast={() => {
            setShowPublishModal(false);
            startWhatsAppBroadcast();
          }}
          onUpdateExam={(updated) => {
            Object.assign(exam, updated);
          }}
        />
      )}

      {/* SCANNED OMR IMAGE MODAL OVERLAY */}
      {viewingScannedOmr && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff', marginBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📄 {viewingScannedOmr.studentName}'s Scanned OMR Sheet</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>Exam: {exam.title}</p>
            </div>
            <button 
              onClick={() => setViewingScannedOmr(null)}
              style={{ background: '#334155', color: '#ffffff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: '10px' }}>
            {viewingScannedOmr.omrUrl ? (
              <img 
                src={viewingScannedOmr.omrUrl} 
                alt="Scanned OMR Sheet" 
                style={{ maxHeight: '85vh', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
              />
            ) : (
              // Graded Bubble Response Map
              <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                width: '100%',
                maxWidth: '800px',
                maxHeight: '75vh',
                overflowY: 'auto',
                color: '#0f172a',
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
                    Graded Score: <span style={{ color: '#059669', fontWeight: 800 }}>{viewingScannedOmr.score} Pts</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem' }}>
                    <span style={{ color: '#059669', fontWeight: 600 }}>🟢 Correct: {viewingScannedOmr.correctCount || 0}</span>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>🔴 Incorrect: {viewingScannedOmr.wrongCount || 0}</span>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>⚫ Unanswered: {exam.numQuestions - (viewingScannedOmr.correctCount || 0) - (viewingScannedOmr.wrongCount || 0)}</span>
                  </div>
                </div>

                {/* Draw bubble grid in multiple columns just like printed OMR */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '20px 14px'
                }}>
                  {Array.from({ length: exam.numQuestions }, (_, i) => {
                    const qNum = i + 1;
                    const studentAns = viewingScannedOmr.answers?.[qNum] || '';
                    const correctAns = exam.answerKey[qNum] || 'A';
                    
                    // Determine option list
                    const sec = exam.sections?.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
                    const is5Option = sec && sec.questionType === '5 option';
                    const options = is5Option ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];

                    return (
                      <div key={`virtual-q-${qNum}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: '24px', color: '#475569' }}>
                          {String(qNum).padStart(2, '0')}.
                        </span>
                        
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {options.map((opt) => {
                            const isStudentPick = studentAns === opt;
                            const isCorrect = correctAns === opt;
                            
                            let bubbleStyle: React.CSSProperties = {
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              border: '1.5px solid #cbd5e1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#64748b',
                              background: 'transparent'
                            };

                            if (isStudentPick) {
                              if (isCorrect) {
                                bubbleStyle.background = '#10b981'; // Green for correct bubbling
                                bubbleStyle.borderColor = '#10b981';
                                bubbleStyle.color = '#ffffff';
                              } else {
                                bubbleStyle.background = '#ef4444'; // Red for wrong bubbling
                                bubbleStyle.borderColor = '#ef4444';
                                bubbleStyle.color = '#ffffff';
                              }
                            } else if (isCorrect) {
                              // Highlight correct option if student got it wrong or didn't answer
                              bubbleStyle.borderColor = '#10b981';
                              bubbleStyle.color = '#10b981';
                              bubbleStyle.boxShadow = '0 0 0 1px #10b981';
                            }

                            return (
                              <div key={opt} style={bubbleStyle}>
                                {opt}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
