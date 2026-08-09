import React, { useEffect, useState, useMemo } from 'react';
import { X, Check, AlertCircle, HelpCircle, BookOpen, AlertTriangle, Timer, FileText, Award, Filter } from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { db, type Exam, type ExamSubmission, type Question } from '../db';

interface OnlineSubmissionViewerProps {
  exam: Exam;
  submission: ExamSubmission;
  studentName: string;
  onClose: () => void;
}

const OPTIONS_LETTERS = ['A', 'B', 'C', 'D', 'E'];

export const OnlineSubmissionViewer: React.FC<OnlineSubmissionViewerProps> = ({
  exam,
  submission,
  studentName,
  onClose
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQIndex, setSelectedQIndex] = useState<number>(0);
  const [filterType, setFilterType] = useState<'all' | 'correct' | 'incorrect' | 'skipped'>('all');

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        setLoading(true);
        // Load custom questions if any exist in the database for this exam
        const dbQs = await db.questions.where('examId').equals(exam.id!).toArray();
        if (dbQs.length > 0) {
          const sorted = [...dbQs].sort((a, b) => (a.id || 0) - (b.id || 0));
          
          let qCursor = 1;
          const sectionsWithRanges = (exam.sections || []).map(sec => {
            const start = qCursor;
            const end = qCursor + sec.qCount - 1;
            qCursor = end + 1;
            return { ...sec, qStart: start, qEnd: end };
          });

          const healed = sorted.map((qVal, idx) => {
            const qNum = idx + 1;
            const matchedSec = sectionsWithRanges.find(sec => qNum >= sec.qStart && qNum <= sec.qEnd);
            return {
              ...qVal,
              subjectName: qVal.subjectName || matchedSec?.subjectName || 'Subject 1',
              sectionName: qVal.sectionName || matchedSec?.sectionName || 'Section A'
            };
          });
          setQuestions(healed);
        } else {
          // Generate mock questions dynamically aligned with answerKey
          setQuestions(generateMockQuestions(exam.numQuestions, exam.answerKey || {}, exam.id!));
        }
      } catch (err) {
        console.error('Failed to load questions:', err);
      } finally {
        setLoading(false);
      }
    };

    loadQuestions();
  }, [exam, submission]);

  // Format time taken helper
  const formattedTimeTaken = useMemo(() => {
    if (submission.timeTakenSeconds === undefined || submission.timeTakenSeconds === null) {
      return 'N/A';
    }
    const mins = Math.floor(submission.timeTakenSeconds / 60);
    const secs = submission.timeTakenSeconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }, [submission.timeTakenSeconds]);

  // Questions status map
  const questionStatuses = useMemo(() => {
    return questions.map((q, idx) => {
      const qNum = idx + 1;
      const studentAns = submission.answers ? submission.answers[qNum] : '';
      const subSet = submission.bookletSet || 'A';
      const setKey = exam.answerKeys?.[subSet] || exam.answerKey || {};
      const correctAns = setKey[qNum] || '';
      
      let status: 'correct' | 'incorrect' | 'skipped' = 'skipped';
      if (studentAns) {
        status = studentAns === correctAns ? 'correct' : 'incorrect';
      }
      return { qNum, q, studentAns, correctAns, status };
    });
  }, [questions, submission.answers, exam.answerKey]);

  // Filtered question indices
  const filteredQuestions = useMemo(() => {
    return questionStatuses.filter(item => {
      if (filterType === 'correct') return item.status === 'correct';
      if (filterType === 'incorrect') return item.status === 'incorrect';
      if (filterType === 'skipped') return item.status === 'skipped';
      return true;
    });
  }, [questionStatuses, filterType]);

  // Safe selected index adjustment if filtered out
  useEffect(() => {
    if (filteredQuestions.length > 0) {
      const stillExists = filteredQuestions.some(item => item.qNum === selectedQIndex + 1);
      if (!stillExists) {
        setSelectedQIndex(filteredQuestions[0].qNum - 1);
      }
    }
  }, [filteredQuestions, selectedQIndex]);

  // Performance stats calculations
  const stats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    let skipped = 0;
    questionStatuses.forEach(item => {
      if (item.status === 'correct') correct++;
      else if (item.status === 'incorrect') incorrect++;
      else skipped++;
    });
    return { correct, incorrect, skipped };
  }, [questionStatuses]);

  const maxPossibleScore = exam.numQuestions * (exam.correctMarks || 4);



  return (
    <div className="submission-viewer-overlay">
      <style>{`
        .submission-viewer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          box-sizing: border-box;
        }

        .submission-viewer-container {
          background: #f8fafc;
          width: 100%;
          max-width: 1200px;
          height: 85vh;
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          animation: viewer-scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes viewer-scale-up {
          0% {
            transform: scale(0.96);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .viewer-header {
          background: #ffffff;
          padding: 20px 28px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .viewer-header-info h3 {
          margin: 0 0 4px 0;
          font-size: 1.3rem;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.02em;
        }

        .viewer-header-info p {
          margin: 0;
          font-size: 0.88rem;
          color: #64748b;
        }

        .viewer-close-btn {
          background: #f1f5f9;
          color: #64748b;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .viewer-close-btn:hover {
          background: #cbd5e1;
          color: #0f172a;
          transform: rotate(90deg);
        }

        .viewer-layout-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .viewer-sidebar {
          width: 380px;
          background: #ffffff;
          border-right: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .viewer-main-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #f8fafc;
          overflow-y: auto;
          padding: 28px;
          box-sizing: border-box;
        }

        .sidebar-scrollable-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Stats Blocks */
        .stats-grid-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .stat-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-box-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .stat-box-value {
          font-size: 1.05rem;
          font-weight: 800;
          color: #1e293b;
        }

        .stat-box-value.correct { color: #16a34a; }
        .stat-box-value.wrong { color: #dc2626; }
        .stat-box-value.score { color: #2563eb; }

        /* Proctoring Alerts */
        .proctoring-summary-card {
          border-radius: 16px;
          padding: 14px 18px;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid #e2e8f0;
        }

        .proctoring-summary-card.secure {
          background: #f0fdf4;
          border-color: #bbf7d0;
          color: #166534;
        }

        .proctoring-summary-card.warning {
          background: #fffbeb;
          border-color: #fde68a;
          color: #92400e;
        }

        /* Filter Selector */
        .sidebar-filter-bar {
          display: flex;
          background: #f1f5f9;
          border-radius: 12px;
          padding: 4px;
          gap: 4px;
        }

        .filter-btn {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 0.78rem;
          font-weight: 700;
          color: #64748b;
          padding: 6px 4px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        .filter-btn.active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 2px 4px rgba(0,0,0,0.06);
        }

        /* Visual Grid */
        .question-visual-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }

        .grid-card-btn {
          border: 2px solid transparent;
          aspect-ratio: 1;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 800;
          cursor: pointer;
          position: relative;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .grid-card-btn.correct {
          background: #f0fdf4;
          border-color: #bbf7d0;
          color: #166534;
        }
        .grid-card-btn.correct:hover {
          background: #dcfce7;
        }

        .grid-card-btn.incorrect {
          background: #fdf2f2;
          border-color: #fecaca;
          color: #991b1b;
        }
        .grid-card-btn.incorrect:hover {
          background: #fee2e2;
        }

        .grid-card-btn.skipped {
          background: #f8fafc;
          border-color: #e2e8f0;
          color: #64748b;
        }
        .grid-card-btn.skipped:hover {
          background: #f1f5f9;
        }

        .grid-card-btn.active {
          box-shadow: 0 0 0 3px #3b82f6;
          transform: translateY(-2px);
        }

        .grid-card-sublabel {
          font-size: 0.58rem;
          opacity: 0.75;
          margin-top: 1px;
          font-weight: 600;
        }

        /* Main details area */
        .active-question-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .active-q-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 16px;
        }

        .section-badge {
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 0.78rem;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .marks-earned-badge {
          font-size: 0.85rem;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 8px;
        }

        .marks-earned-badge.positive {
          background: #dcfce7;
          color: #15803d;
        }
        .marks-earned-badge.negative {
          background: #fee2e2;
          color: #b91c1c;
        }
        .marks-earned-badge.zero {
          background: #f1f5f9;
          color: #475569;
        }

        .active-q-body-text {
          font-size: 1.05rem;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.6;
          text-align: left;
        }

        .options-review-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .option-review-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          font-size: 0.95rem;
          text-align: left;
          transition: all 0.15s ease;
          background: #ffffff;
        }

        .option-review-item.correct-key {
          border-color: #86efac;
          background: #f0fdf4;
          color: #14532d;
          font-weight: 600;
        }

        .option-review-item.wrong-selected {
          border-color: #fca5a5;
          background: #fef2f2;
          color: #7f1d1d;
          font-weight: 600;
        }

        .option-badge-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.85rem;
          flex-shrink: 0;
          background: #ffffff;
          color: #475569;
        }

        .option-review-item.correct-key .option-badge-circle {
          border-color: #22c55e;
          background: #22c55e;
          color: #ffffff;
        }

        .option-review-item.wrong-selected .option-badge-circle {
          border-color: #ef4444;
          background: #ef4444;
          color: #ffffff;
        }

        /* Match Widget */
        .match-widget-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.88rem;
          font-weight: 600;
        }

        /* Explanation Drawer */
        .explanation-drawer-box {
          background: #f0fdfa;
          border: 1px solid #ccfbf1;
          border-radius: 14px;
          padding: 20px;
          text-align: left;
        }

        .explanation-title {
          font-weight: 800;
          color: #0f766e;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9rem;
        }

        @media (max-width: 992px) {
          .submission-viewer-overlay {
            padding: 0;
          }
          .submission-viewer-container {
            height: 100vh;
            border-radius: 0;
          }
          .viewer-layout-body {
            flex-direction: column;
            overflow-y: auto;
          }
          .viewer-sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid #e2e8f0;
            flex-shrink: 0;
          }
          .viewer-main-panel {
            padding: 16px;
            overflow-y: visible;
          }
          .active-question-card {
            padding: 20px;
          }
        }
      `}</style>

      <div className="submission-viewer-container">
        {/* Header */}
        <div className="viewer-header">
          <div className="viewer-header-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={22} style={{ color: '#2563eb' }} />
            </div>
            <div>
              <h3 style={{ margin: 0 }}>{exam.title} Review</h3>
              <p style={{ margin: 0 }}>Candidate: <strong>{studentName}</strong> • Class: <strong>{exam.className}</strong></p>
            </div>
          </div>
          <button className="viewer-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Layout Body */}
        <div className="viewer-layout-body">
          {/* Sidebar */}
          <div className="viewer-sidebar">
            <div className="sidebar-scrollable-content">
              {/* Score & General Stats */}
              <div className="stats-grid-card">
                <div className="stat-box">
                  <span className="stat-box-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Award size={13} style={{ color: '#3b82f6' }} /> Score
                  </span>
                  <span className="stat-box-value score">
                    {submission.score.toFixed(1)} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#64748b' }}>/ {maxPossibleScore}</span>
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-box-label">Correct</span>
                  <span className="stat-box-value correct">{stats.correct}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-box-label">Incorrect</span>
                  <span className="stat-box-value wrong">{stats.incorrect}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-box-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <HelpCircle size={13} style={{ color: '#64748b' }} /> Skipped
                  </span>
                  <span className="stat-box-value" style={{ color: '#64748b' }}>{stats.skipped}</span>
                </div>
              </div>

              {/* Proctoring & Attempt Info */}
              <div className="stats-grid-card" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="stat-box">
                  <span className="stat-box-label">Mode / Type</span>
                  <span className="stat-box-value" style={{ fontSize: '0.9rem' }}>
                    {submission.attemptType === 'Online' ? '💻 Online' : '📝 OMR Sheet'}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-box-label">Booklet Set</span>
                  <span className="stat-box-value" style={{ fontSize: '0.9rem' }}>
                    Set {submission.bookletSet || 'A'}
                  </span>
                </div>
                {submission.attemptType === 'Online' && (
                  <>
                    <div className="stat-box">
                      <span className="stat-box-label">Time Taken</span>
                      <span className="stat-box-value" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}>
                        <Timer size={14} style={{ color: '#64748b' }} /> {formattedTimeTaken}
                      </span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-box-label">Alerts</span>
                      <span className={`stat-box-value ${submission.cheatingAlertsCount && submission.cheatingAlertsCount > 0 ? 'wrong' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}>
                        <AlertTriangle size={14} style={{ color: submission.cheatingAlertsCount && submission.cheatingAlertsCount > 0 ? '#dc2626' : '#64748b' }} />
                        {submission.cheatingAlertsCount || 0}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Proctoring Alerts Summary Box */}
              {submission.attemptType === 'Online' && (
                submission.cheatingAlertsCount && submission.cheatingAlertsCount > 0 ? (
                  <div className="proctoring-summary-card warning">
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Proctoring Alert:</strong> {submission.cheatingAlertsCount} focus loss events occurred during the test.
                    </div>
                  </div>
                ) : (
                  <div className="proctoring-summary-card secure">
                    <Check size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Session Secure:</strong> No suspicious tab switching or cheating alerts recorded.
                    </div>
                  </div>
                )
              )}

              {/* Filter Cards Bar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Filter size={13} style={{ color: '#475569' }} /> Filter Questions
                </span>
                <div className="sidebar-filter-bar">
                  <button className={`filter-btn ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>All</button>
                  <button className={`filter-btn ${filterType === 'correct' ? 'active' : ''}`} onClick={() => setFilterType('correct')}>🟢 OK</button>
                  <button className={`filter-btn ${filterType === 'incorrect' ? 'active' : ''}`} onClick={() => setFilterType('incorrect')}>🔴 Err</button>
                  <button className={`filter-btn ${filterType === 'skipped' ? 'active' : ''}`} onClick={() => setFilterType('skipped')}>⚫ Skip</button>
                </div>
              </div>

              {/* Interactive Visual Question Selector Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookOpen size={13} style={{ color: '#475569' }} /> Question Navigator
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                    Showing {filteredQuestions.length} of {questions.length}
                  </span>
                </div>

                <div className="question-visual-grid">
                  {filteredQuestions.map((item) => {
                    const isActive = selectedQIndex === item.qNum - 1;
                    return (
                      <button
                        key={item.qNum}
                        className={`grid-card-btn ${item.status} ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedQIndex(item.qNum - 1);
                          const el = document.getElementById(`q-card-${item.qNum}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        title={`Question ${item.qNum} (${item.status.toUpperCase()})`}
                      >
                        {item.qNum}
                        <span className="grid-card-sublabel">
                          {item.status === 'skipped' ? '—' : item.studentAns || 'X'}
                        </span>
                      </button>
                    );
                  })}
                  {filteredQuestions.length === 0 && (
                    <div style={{ gridColumn: 'span 5', textAlign: 'center', padding: '20px 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
                      No questions match this filter.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main Question View Panel */}
          <div className="viewer-main-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: '#64748b' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span>Loading Question Details...</span>
              </div>
            ) : filteredQuestions.length > 0 ? (
              filteredQuestions.map((item) => {
                const secRules = exam.sectionsMarking?.[item.q.sectionName || 'General Test'] || { 
                  correctMarks: exam.correctMarks, 
                  incorrectMarks: exam.incorrectMarks, 
                  unansweredMarks: exam.unansweredMarks 
                };
                const earnedMarks = item.status === 'skipped' ? (secRules.unansweredMarks || 0) : item.status === 'correct' ? secRules.correctMarks : secRules.incorrectMarks;

                return (
                  <div 
                    key={item.qNum} 
                    id={`q-card-${item.qNum}`} 
                    className="active-question-card"
                    style={{
                      borderLeft: item.status === 'correct' ? '6px solid #16a34a' : item.status === 'incorrect' ? '6px solid #dc2626' : '6px solid #64748b'
                    }}
                  >
                    {/* Header (Section & Marks) */}
                    <div className="active-q-header">
                      <span className="section-badge">
                        {item.q.subjectName ? `${item.q.subjectName} - ${item.q.sectionName}` : (item.q.sectionName || 'General Test')} • Q.{item.qNum}
                      </span>
                      
                      <span className={`marks-earned-badge ${item.status === 'correct' ? 'positive' : item.status === 'incorrect' ? 'negative' : 'zero'}`}>
                        {item.status === 'correct' && `Correct (+${secRules?.correctMarks || 4} Marks)`}
                        {item.status === 'incorrect' && `Incorrect (${secRules?.incorrectMarks || -1} Marks)`}
                        {item.status === 'skipped' && `Skipped (${earnedMarks >= 0 ? '+' : ''}${earnedMarks} Marks)`}
                      </span>
                    </div>

                    {/* Question text content */}
                    <div className="active-q-body-text">
                      <MathRenderer text={item.q.questionText} />
                    </div>

                    {/* Diagram if available */}
                    {item.q.questionImage && (
                      <div style={{ alignSelf: 'flex-start', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px', background: '#f8fafc', maxWidth: '100%' }}>
                        <img src={item.q.questionImage} alt={`Question ${item.qNum} illustration`} style={{ maxHeight: '250px', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px' }} />
                      </div>
                    )}

                    {/* Option Rows */}
                    <div className="options-review-list">
                      {item.q.options.map((optText, optIdx) => {
                        const letter = OPTIONS_LETTERS[optIdx];
                        const isCorrectKey = letter === item.correctAns;
                        const isSelectedWrong = (letter === item.studentAns) && (item.studentAns !== item.correctAns);

                        let itemClass = '';
                        if (isCorrectKey) itemClass = 'correct-key';
                        else if (isSelectedWrong) itemClass = 'wrong-selected';

                        return (
                          <div key={optIdx} className={`option-review-item ${itemClass}`}>
                            <span className="option-badge-circle">{letter}</span>
                            <span style={{ flex: 1 }}><MathRenderer text={optText} /></span>
                            {isCorrectKey && <Check size={18} style={{ color: '#16a34a', marginLeft: 'auto', flexShrink: 0 }} />}
                            {isSelectedWrong && <X size={18} style={{ color: '#dc2626', marginLeft: 'auto', flexShrink: 0 }} />}
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Match Comparison Widget */}
                    <div className="match-widget-card">
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Correct Answer: <strong style={{ color: '#16a34a', fontSize: '1rem' }}>{item.correctAns}</strong>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Student Answer: 
                        <strong style={{ 
                          color: item.status === 'correct' ? '#16a34a' : item.status === 'incorrect' ? '#dc2626' : '#64748b',
                          fontSize: '1rem'
                        }}>
                          {item.studentAns || 'Skipped (No Option)'}
                        </strong>
                      </span>
                    </div>

                    {/* Explanation Markdown Box */}
                    {item.q.explanation && (
                      <div className="explanation-drawer-box">
                        <div className="explanation-title">
                          <AlertCircle size={15} /> Explanation & Solution Detail
                        </div>
                        <div style={{ fontSize: '0.92rem', color: '#0f766e', lineHeight: 1.6 }}>
                          <MathRenderer text={item.q.explanation} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                No questions match this filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Generates high-fidelity mock questions aligned with the answer key (exactly like OnlineExamPortal.tsx)
const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
function generateMockQuestions(numQuestions: number, answerKey: Record<number, string>, examId: number): Question[] {
  const genericQuestions = [
    {
      text: "Which of the following physical quantities has the same dimensional formula as that of impulse?",
      options: ["Force", "Linear Momentum", "Torque", "Pressure"],
      correctOpt: 'B',
      explanation: "Impulse is Force * Time, which is MLT^-2 * T = MLT^-1. This is identical to the dimensional formula of linear momentum."
    },
    {
      text: "A particle is moving in a circle of radius R with constant speed v. The magnitude of average acceleration during a semi-circle turn is:",
      options: ["v^2 / R", "2v^2 / (pi * R)", "v^2 / (2 * R)", "Zero"],
      correctOpt: 'B',
      explanation: "Average acceleration is change in velocity divided by time. Time = pi*R/v. Change in velocity is 2v. Average acceleration = 2v / (pi*R/v) = 2v^2/(pi*R)."
    },
    {
      text: "The dimensional formula of universal gravitational constant G is:",
      options: ["[M^-1 L^3 T^-2]", "[M^1 L^3 T^-2]", "[M^-1 L^2 T^-2]", "[M^1 L^2 T^-1]"],
      correctOpt: 'A',
      explanation: "Since F = G*m1*m2 / r^2, G = F*r^2 / (m1*m2). Substituting dimensions gives [MLT^-2]*[L^2] / [M^2] = [M^-1 L^3 T^-2]."
    },
    {
      text: "Which of the following organic compounds will show optical activity?",
      options: ["2-Chlorobutane", "1-Chlorobutane", "2-Chloropropane", "Butane"],
      correctOpt: 'A',
      explanation: "2-Chlorobutane contains a chiral carbon atom bonded to four different groups (-H, -Cl, -CH3, -CH2CH3)."
    },
    {
      text: "The primary structure of a protein refers to:",
      options: ["Helix configuration", "Sequence of amino acids", "Three dimensional foldings", "Aggregation of sub-units"],
      correctOpt: 'B',
      explanation: "The primary structure is the linear sequence of amino acids joined by peptide bonds."
    },
    {
      text: "Which cell organelle is responsible for cellular respiration and ATP generation?",
      options: ["Ribosome", "Mitochondria", "Chloroplast", "Lysosome"],
      correctOpt: 'B',
      explanation: "Mitochondria are known as the powerhouses of the cell because they are the site of aerobic respiration and generate ATP."
    },
    {
      text: "In angiosperms, double fertilization is characterized by:",
      options: ["Fusion of two polar nuclei", "Syngamy and triple fusion", "Fertilization of two eggs", "Fusion of tube cell and egg"],
      correctOpt: 'B',
      explanation: "Double fertilization involves syngamy (fusion of one male gamete with the egg) and triple fusion (fusion of the second male gamete with the secondary nucleus)."
    },
    {
      text: "The process of division of cytoplasm during cell cycle is named as:",
      options: ["Karyokinesis", "Cytokinesis", "Mitosis", "Meiosis"],
      correctOpt: 'B',
      explanation: "Cytokinesis is the physical division of cytoplasm, cell membrane, and organelles into two daughter cells following karyokinesis."
    }
  ];

  const questionsList: Question[] = [];

  for (let i = 1; i <= numQuestions; i++) {
    const targetAns = answerKey[i] || 'A';
    const targetIdx = OPTIONS.indexOf(targetAns);

    let sectionName = 'General Test';
    if (numQuestions === 200) {
      if (i <= 50) sectionName = 'Physics';
      else if (i <= 100) sectionName = 'Chemistry';
      else if (i <= 150) sectionName = 'Botany';
      else sectionName = 'Zoology';
    } else if (numQuestions >= 50) {
      const perSec = Math.floor(numQuestions / 3);
      if (i <= perSec) sectionName = 'Physics';
      else if (i <= perSec * 2) sectionName = 'Chemistry';
      else sectionName = 'Biology';
    }

    const baseQ = genericQuestions[(i - 1) % genericQuestions.length];
    
    // Build options list rearranging options so that the correct answer is aligned with targetAns index
    const listOpts = [...baseQ.options];
    const baseCorrectIdx = OPTIONS.indexOf(baseQ.correctOpt);
    
    if (baseCorrectIdx !== -1 && targetIdx !== -1 && baseCorrectIdx !== targetIdx) {
      const temp = listOpts[targetIdx];
      listOpts[targetIdx] = listOpts[baseCorrectIdx];
      listOpts[baseCorrectIdx] = temp;
    }

    questionsList.push({
      examId,
      sectionName,
      questionText: `[Q.${i}] ${baseQ.text} (Section: ${sectionName})`,
      options: listOpts,
      correctOptionIdx: targetIdx !== -1 ? targetIdx : 0,
      explanation: baseQ.explanation
    });
  }

  return questionsList;
}
