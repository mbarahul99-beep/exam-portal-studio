import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Sparkles, 
  Timer, 
  CheckCircle, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  Maximize, 
  Lock 
} from 'lucide-react';
import { db, type Exam, type Student, type Question } from '../db';
import confetti from 'canvas-confetti';
import { MathRenderer } from './MathRenderer';

interface OnlineExamPortalProps {
  examId: number;
  onClose: () => void;
}

// Option letters mapper
const OPTIONS = ['A', 'B', 'C', 'D'];

export const OnlineExamPortal: React.FC<OnlineExamPortalProps> = ({ examId, onClose }) => {
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Student auth states
  const [rollNo, setRollNo] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [student, setStudent] = useState<Student | null>(null);

  // Exam taking states
  const [examState, setExamState] = useState<'setup' | 'instructions' | 'active' | 'submitted'>('setup');
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({}); // 1-based question number => 'A'|'B'|'C'|'D'
  const [flaggedForReview, setFlaggedForReview] = useState<Record<number, boolean>>({}); // 1-based question number => boolean
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [cheatWarnings, setCheatWarnings] = useState(0);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Graded results state
  const [gradedResult, setGradedResult] = useState<{
    score: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    totalQuestions: number;
    maxScore: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. Fetch Exam details
  useEffect(() => {
    const loadExam = async () => {
      try {
        const examObj = await db.exams.get(examId);
        if (!examObj) {
          setErrorMsg('The selected exam record could not be found.');
          setLoading(false);
          return;
        }
        setExam(examObj);
        setSecondsLeft((examObj.durationMins || 180) * 60);

        // Load custom questions if any exist in the database for this exam
        const dbQs = await db.questions.where('examId').equals(examId).toArray();
        if (dbQs.length > 0) {
          setQuestionsList(dbQs);
        } else {
          // Generate high-fidelity mock questions dynamically aligned with answerKey
          setQuestionsList(generateMockQuestions(examObj.numQuestions, examObj.answerKey, examId));
        }
        setLoading(false);
      } catch (err: any) {
        setErrorMsg(`Failed to load exam: ${err.message}`);
        setLoading(false);
      }
    };
    loadExam();
  }, [examId]);

  // 2. Track Window Focus Blurs (Cheating Tab Switches)
  useEffect(() => {
    if (examState !== 'active') return;

    const handleBlur = () => {
      setCheatWarnings(prev => {
        const newVal = prev + 1;
        alert(`PROCTOR NOTICE: Browser tab out of focus detected!\nThis event has been logged as a suspicious activity warning. Total warnings: ${newVal}`);
        return newVal;
      });
    };

    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
    };
  }, [examState]);

  // 3. Track HTML5 Fullscreen Exits
  useEffect(() => {
    const handleFullscreenChange = () => {
      const currentFull = !!document.fullscreenElement;
      if (examState === 'active' && !currentFull) {
        setShowExitWarning(true);
        setCheatWarnings(prev => prev + 1);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [examState]);

  // 4. Timer countdown hook
  useEffect(() => {
    if (examState !== 'active') return;
    if (secondsLeft <= 0) {
      // Force test submission when clock hits zero
      handleAutoSubmit();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [examState, secondsLeft]);

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exam) return;

    const option = exam.loginOption || 'roll_phone';

    if (option === 'roll_phone' && (!rollNo.trim() || !phone.trim())) {
      alert('Please fill in both fields.');
      return;
    }
    if (option === 'roll_email' && (!rollNo.trim() || !email.trim())) {
      alert('Please fill in both fields.');
      return;
    }
    if (option === 'roll_only' && !rollNo.trim()) {
      alert('Please enter your Roll Number.');
      return;
    }
    if (option === 'passcode' && (!rollNo.trim() || !passcode.trim())) {
      alert('Please fill in both fields.');
      return;
    }

    try {
      // Search matching student
      let matched = await db.students
        .where('[studentNum+className]')
        .equals([rollNo.trim(), exam.className])
        .first();
      
      // Fallback: If database doesn't have the student seeded yet, but they type the standard credentials
      if (!matched && rollNo.trim() === '1000000001') {
        const defaultStudent = {
          studentNum: '1000000001',
          name: 'Aarav Sharma',
          className: exam.className,
          phone: '9876543210',
          email: 'aarav@appexjind.in'
        };
        await db.students.add(defaultStudent);
        matched = await db.students.where('[studentNum+className]').equals(['1000000001', exam.className]).first();
      } else if (!matched && rollNo.trim() === '1000000002') {
        const defaultStudent = {
          studentNum: '1000000002',
          name: 'Diya Patel',
          className: exam.className,
          phone: '9876543211',
          email: 'diya@appexjind.in'
        };
        await db.students.add(defaultStudent);
        matched = await db.students.where('[studentNum+className]').equals(['1000000002', exam.className]).first();
      }

      if (!matched) {
        alert('Authentication Failed: No registered candidate found with this Roll Number.');
        return;
      }

      // Check login credentials based on settings
      if (option === 'roll_phone') {
        if (!matched.phone && phone.trim()) {
          await db.students.update(matched.id!, { phone: phone.trim() });
          matched.phone = phone.trim();
        }
        if (matched.phone !== phone.trim()) {
          alert('Authentication Failed: Mobile number mismatch.');
          return;
        }
      } else if (option === 'roll_email') {
        if (!matched.email && email.trim()) {
          await db.students.update(matched.id!, { email: email.trim() });
          matched.email = email.trim();
        }
        if (matched.email !== email.trim()) {
          alert('Authentication Failed: Email address mismatch.');
          return;
        }
      } else if (option === 'passcode') {
        if (passcode.trim() !== (exam.passcode || '1234')) {
          alert('Authentication Failed: Invalid exam passcode.');
          return;
        }
      }

      // Auto-sync student's class to exam class for frictionless testing
      if (matched.className !== exam.className) {
        await db.students.update(matched.id!, { className: exam.className });
        matched.className = exam.className;
      }

      setStudent(matched);
      setExamState('instructions');
    } catch (err: any) {
      alert(`Login error: ${err.message}`);
    }
  };

  // Trigger HTML5 Fullscreen
  const enterFullscreen = () => {
    if (containerRef.current) {
      containerRef.current.requestFullscreen().then(() => {
        setShowExitWarning(false);
        setExamState('active');
      }).catch(err => {
        alert(`Fullscreen request failed: ${err.message}. Please allow fullscreen permission.`);
      });
    }
  };

  const handleAutoSubmit = () => {
    alert('Time has expired! Submitting your answers automatically.');
    submitExam();
  };

  // Grade and save exam responses
  const submitExam = async () => {
    if (!exam || !student) return;

    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    let score = 0;

    // Load section markings if configured, else default to exam base markings
    const secMarkings = exam.sectionsMarking || {};

    questionsList.forEach((q, idx) => {
      const qNum = idx + 1;
      const studAns = selectedAnswers[qNum];
      const correctAns = exam.answerKey[qNum];

      const secRules = secMarkings[q.sectionName] || {
        correctMarks: exam.correctMarks,
        incorrectMarks: exam.incorrectMarks,
        unansweredMarks: exam.unansweredMarks ?? 0
      };

      if (!studAns) {
        score += secRules.unansweredMarks ?? 0;
        unansweredCount++;
      } else if (studAns === correctAns) {
        score += secRules.correctMarks;
        correctCount++;
      } else {
        score += secRules.incorrectMarks;
        wrongCount++;
      }
    });

    try {
      // 1. Remove duplicate submission if it exists
      const duplicate = await db.submissions
        .where('[examId+studentId]')
        .equals([examId, student.id!])
        .first();
      if (duplicate) {
        await db.submissions.delete(duplicate.id!);
      }

      // 2. Save submission details
      const subId = await db.submissions.add({
        examId: examId,
        studentId: student.id!,
        score: score,
        answers: selectedAnswers,
        scannedAt: new Date(),
        cheatingAlertsCount: cheatWarnings,
        timeTakenSeconds: (exam.durationMins || 180) * 60 - secondsLeft,
        attemptType: 'Online'
      });

      // Sync online submission to Hostinger MySQL
      const savedSub = await db.submissions.get(subId);
      if (savedSub) {
        try {
          await fetch('/api/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(savedSub)
          });
        } catch (err) {
          console.warn("MySQL submission sync warning:", err);
        }
      }

      // Compute total maximum potential points
      let maxScore = 0;
      questionsList.forEach((q) => {
        const secRules = secMarkings[q.sectionName] || { correctMarks: exam.correctMarks };
        maxScore += secRules.correctMarks;
      });

      setGradedResult({
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        totalQuestions: exam.numQuestions,
        maxScore
      });

      setExamState('submitted');
      // Trigger confetti celebration!
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });

      // Exit fullscreen mode
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (err: any) {
      alert(`Submission save failed: ${err.message}`);
    }
  };

  // Helper formats
  const formatTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f7fafc', gap: '16px' }}>
        <div style={{ border: '4px solid #e2e8f0', borderTop: '4px solid var(--primary)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Loading examination portal...</p>
      </div>
    );
  }

  if (errorMsg || !exam) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f7fafc', padding: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '32px', textAlign: 'center', maxWidth: '400px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <AlertTriangle size={48} color="#e53e3e" style={{ marginBottom: '16px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>Error Loading Portal</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>{errorMsg || 'Failed to initialize exam configuration.'}</p>
          <button className="btn-outlined" onClick={onClose} style={{ padding: '8px 24px' }}>Exit Portal</button>
        </div>
      </div>
    );
  }

  // Group questions by section name for Swapper indicators
  const sections = Array.from(new Set(questionsList.map(q => q.sectionName)));
  const currentQ = questionsList[currentQIdx];
  const totalQCount = questionsList.length;

  return (
    <div ref={containerRef} style={{ minHeight: '100vh', width: '100vw', background: '#f0f4f8', position: 'fixed', top: 0, left: 0, zIndex: 99999, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      
      {/* AUTH SETUP STEP */}
      {examState === 'setup' && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '32px', maxWidth: '450px', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'inline-flex', background: '#ebf8ff', padding: '16px', borderRadius: '50%', color: 'var(--primary)', marginBottom: '12px' }}>
                <Shield size={32} />
              </div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', fontWeight: 900 }}>ONLINE EXAM PORTAL</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Enter your registered details to verify and boot test instruction sheet.</p>
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>Candidate Roll Number *</label>
                <input 
                  type="text" 
                  placeholder="e.g. 1000000001" 
                  value={rollNo} 
                  onChange={e => setRollNo(e.target.value)}
                  style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }}
                  required
                />
              </div>

              {(exam.loginOption || 'roll_phone') === 'roll_phone' && (
                <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>Mobile Number *</label>
                  <input 
                    type="tel" 
                    placeholder="e.g. 9876543210" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              )}

              {exam.loginOption === 'roll_email' && (
                <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>Email Address *</label>
                  <input 
                    type="email" 
                    placeholder="e.g. aarav@appexjind.in" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              )}

              {exam.loginOption === 'passcode' && (
                <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>Exam Passcode *</label>
                  <input 
                    type="password" 
                    placeholder="Enter passcode" 
                    value={passcode} 
                    onChange={e => setPasscode(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              )}

              <div style={{ background: '#fffaf0', border: '1px solid #feebc8', borderRadius: '8px', padding: '12px', fontSize: '0.75rem', color: '#c05621', display: 'flex', gap: '8px', alignItems: 'center', textAlign: 'left' }}>
                <Lock size={16} style={{ flexShrink: 0 }} />
                <span>Verify Roll number and credentials match your registered candidate roster.</span>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn-outlined" onClick={onClose} style={{ flex: 1 }}>Exit</button>
                <button type="submit" className="btn-filled" style={{ flex: 2 }}>Acknowledge & Proceed</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSTRUCTIONS SCREEN STEP */}
      {examState === 'instructions' && student && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '32px', maxWidth: '600px', width: '100%', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <div style={{ borderBottom: '2px dashed var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
              <span className="pill pass" style={{ fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '6px', display: 'inline-block' }}>Candidate Verified</span>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>General Exam Instructions</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Exam: <strong>{exam.title}</strong> (Class: {exam.className})</p>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-dark)', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', lineHeight: '1.4' }}>
              <div style={{ background: '#f7fafc', padding: '12px', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
                <strong>Duration Limit</strong>: You will have exactly <strong>{exam.durationMins || 180} minutes</strong> to complete the exam. Once started, the timer cannot be paused.
              </div>
              <div style={{ background: '#f7fafc', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #e53e3e' }}>
                <strong>Mandatory Fullscreen</strong>: This exam enforces fullscreen mode to prevent browsing tab switches. Exiting fullscreen or shifting window focus will be logged as a **Cheating/Tab Blur Alert**.
              </div>
              <div style={{ background: '#f7fafc', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #319795' }}>
                <strong>Section-wise Marking Scheme</strong>:
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px' }}>
                  {sections.map(secName => {
                    const secRules = exam.sectionsMarking?.[secName] || { correctMarks: exam.correctMarks, incorrectMarks: exam.incorrectMarks };
                    return (
                      <li key={secName}>
                        {secName}: <span style={{ color: 'green' }}>+{secRules.correctMarks}</span> for correct, <span style={{ color: 'red' }}>{secRules.incorrectMarks}</span> for wrong
                      </li>
                    );
                  })}
                  {sections.length === 0 && (
                    <li>Uniform scheme: <span style={{ color: 'green' }}>+{exam.correctMarks}</span> (Correct) / <span style={{ color: 'red' }}>{exam.incorrectMarks}</span> (Wrong)</li>
                  )}
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-outlined" onClick={() => setExamState('setup')} style={{ flex: 1 }}>Back</button>
              <button className="btn-filled" onClick={enterFullscreen} style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Maximize size={16} /> Start Fullscreen Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE CBT PLAYER SCREEN STEP */}
      {examState === 'active' && student && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
          
          {/* Top Navbar Header */}
          <header style={{ background: '#fff', borderBottom: '1px solid var(--border-color)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="#dd6b20" />
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold' }}>{exam.title}</h3>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Candidate: <strong>{student.name} ({student.studentNum})</strong>
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {cheatWarnings > 0 && (
                <span className="status-badge pending" style={{ background: '#fff5f5', color: '#e53e3e', border: '1px solid #fed7d7', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  ⚠ Blur Alerts: {cheatWarnings}
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: secondsLeft < 300 ? '#fff5f5' : '#f7fafc', border: secondsLeft < 300 ? '1px solid #feb2b2' : '1px solid var(--border-color)', borderRadius: '8px', color: secondsLeft < 300 ? '#e53e3e' : 'var(--text-dark)', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.05rem' }}>
                <Timer size={18} className={secondsLeft < 300 ? 'animate-pulse' : ''} />
                <span>{formatTime(secondsLeft)}</span>
              </div>
            </div>
          </header>

          {/* Section Swapper Selection Bar */}
          {sections.length > 0 && (
            <div style={{ background: '#2d3748', borderBottom: '2px solid #1a202c', display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
              {sections.map((sec, idx) => {
                const isActive = currentQ.sectionName === sec;
                return (
                  <button 
                    key={idx}
                    onClick={() => {
                      const targetIdx = questionsList.findIndex(q => q.sectionName === sec);
                      if (targetIdx !== -1) setCurrentQIdx(targetIdx);
                    }}
                    style={{
                      padding: '12px 20px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      color: isActive ? '#fff' : '#cbd5e0',
                      background: isActive ? '#1a202c' : 'transparent',
                      border: 'none',
                      borderBottom: isActive ? '3px solid #f6ad55' : 'none',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {sec}
                  </button>
                );
              })}
            </div>
          )}

          {/* Main Content Workspace Split-panels */}
          <div className="cbt-workspace-split">
            
            {/* Left Panel: Question Display Card */}
            <div className="cbt-question-pane">
              
              {/* Question metadata badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', paddingBottom: '16px', marginBottom: '24px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-dark)' }}>
                  Question {currentQIdx + 1}
                </span>
                
                {(() => {
                  const secRules = exam.sectionsMarking?.[currentQ.sectionName] || { correctMarks: exam.correctMarks, incorrectMarks: exam.incorrectMarks };
                  return (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span className="status-badge success" style={{ fontSize: '0.65rem' }}>Correct: +{secRules.correctMarks}</span>
                      <span className="status-badge fail" style={{ fontSize: '0.65rem' }}>Wrong: {secRules.incorrectMarks}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Question Text & Media area */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1rem', color: '#2d3748', lineHeight: '1.5', fontWeight: 'bold', marginBottom: '24px', whiteSpace: 'pre-line', textAlign: 'left' }}>
                  <MathRenderer text={currentQ.questionText} />
                </div>

                {currentQ.questionImage && (
                  <div style={{ marginBottom: '24px', textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', display: 'inline-block', maxWidth: '100%' }}>
                    <img src={currentQ.questionImage} alt="Question Diagram" style={{ maxHeight: '250px', maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                )}

                {/* Option Buttons List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px', marginBottom: '32px' }}>
                  {currentQ.options.map((optText, optIdx) => {
                    const letter = OPTIONS[optIdx];
                    const isSelected = selectedAnswers[currentQIdx + 1] === letter;
                    return (
                      <button
                        key={optIdx}
                        onClick={() => {
                          setSelectedAnswers(prev => ({
                            ...prev,
                            [currentQIdx + 1]: letter
                          }));
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '16px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                          background: isSelected ? '#ebf8ff' : '#fff',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          border: '1px solid',
                          borderColor: isSelected ? 'var(--primary)' : '#cbd5e0',
                          background: isSelected ? 'var(--primary)' : '#fff',
                          color: isSelected ? '#fff' : 'var(--text-dark)',
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                          flexShrink: 0
                        }}>
                          {letter}
                        </span>
                        <span style={{ fontSize: '0.9rem', color: '#4a5568', fontWeight: isSelected ? 'bold' : 'normal' }}>
                          <MathRenderer text={optText} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Card Controls Navigation bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #edf2f7', paddingTop: '20px', marginTop: '24px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    className="btn-outlined" 
                    onClick={() => {
                      setSelectedAnswers(prev => {
                        const copy = { ...prev };
                        delete copy[currentQIdx + 1];
                        return copy;
                      });
                    }}
                    style={{ fontSize: '0.75rem', padding: '8px 16px' }}
                  >
                    Clear Response
                  </button>
                  <button 
                    className="btn-outlined" 
                    style={{ fontSize: '0.75rem', padding: '8px 16px', background: flaggedForReview[currentQIdx + 1] ? '#fffaf0' : 'transparent', borderColor: flaggedForReview[currentQIdx + 1] ? '#f6ad55' : 'var(--border-color)', color: flaggedForReview[currentQIdx + 1] ? '#dd6b20' : 'var(--text-dark)' }}
                    onClick={() => {
                      setFlaggedForReview(prev => ({
                        ...prev,
                        [currentQIdx + 1]: !prev[currentQIdx + 1]
                      }));
                      // Move next automatically if it's marked
                      if (currentQIdx < totalQCount - 1) setCurrentQIdx(prev => prev + 1);
                    }}
                  >
                    {flaggedForReview[currentQIdx + 1] ? 'Unmark Review' : 'Mark for Review'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    className="btn-outlined" 
                    disabled={currentQIdx === 0}
                    onClick={() => setCurrentQIdx(prev => prev - 1)}
                    style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <button 
                    className="btn-filled" 
                    onClick={() => {
                      if (currentQIdx < totalQCount - 1) {
                        setCurrentQIdx(prev => prev + 1);
                      } else {
                        setShowSubmitConfirm(true);
                      }
                    }}
                    style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {currentQIdx < totalQCount - 1 ? (
                      <>Next <ChevronRight size={16} /></>
                    ) : (
                      'Finish Test'
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Panel: Palette Grid navigation panel */}
            <div className="cbt-navigation-pane">
              <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Question Navigation</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                  {questionsList.map((_, idx) => {
                    const qNum = idx + 1;
                    const isAnswered = !!selectedAnswers[qNum];
                    const isFlagged = !!flaggedForReview[qNum];
                    const isCurrent = currentQIdx === idx;

                    // Color code
                    let border = '1px solid #cbd5e0';
                    let bg = '#fff';
                    let color = 'var(--text-dark)';
                    if (isAnswered && isFlagged) {
                      bg = '#ed8936'; // answered & review (orange)
                      color = '#fff';
                      border = 'none';
                    } else if (isAnswered) {
                      bg = '#48bb78'; // answered (green)
                      color = '#fff';
                      border = 'none';
                    } else if (isFlagged) {
                      bg = '#805ad5'; // review only (purple)
                      color = '#fff';
                      border = 'none';
                    }
                    if (isCurrent) {
                      border = '2px solid var(--primary)';
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => setCurrentQIdx(idx)}
                        style={{
                          width: '100%',
                          height: '36px',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          border,
                          background: bg,
                          color,
                          cursor: 'pointer'
                        }}
                      >
                        {qNum}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Legends explanation */}
              <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: '#48bb78' }} />
                    <span>Answered ({Object.keys(selectedAnswers).length})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: '#805ad5' }} />
                    <span>Marked for Review ({Object.keys(flaggedForReview).filter(k => !selectedAnswers[Number(k)]).length})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: '#ed8936' }} />
                    <span>Answered & Review ({Object.keys(flaggedForReview).filter(k => !!selectedAnswers[Number(k)]).length})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: '#fff', border: '1px solid #cbd5e0' }} />
                    <span>Unvisited ({totalQCount - Object.keys(selectedAnswers).length})</span>
                  </div>
                </div>

                <button className="btn-filled" onClick={() => setShowSubmitConfirm(true)} style={{ width: '100%', marginTop: '24px', padding: '10px' }}>
                  Submit Examination
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN EXIT WARNING OVERLAY POPUP */}
      {showExitWarning && examState === 'active' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999999 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', textAlign: 'center', maxWidth: '420px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <AlertTriangle size={48} color="#e53e3e" style={{ marginBottom: '16px', animation: 'bounce 1s infinite' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 'bold', color: '#e53e3e' }}>Fullscreen Lock Violated!</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: '1.4' }}>
              You have attempted to exit fullscreen or switch windows. This event is logged as an **Exam Violation Warning**.<br/>
              <strong style={{ color: 'var(--text-dark)' }}>Please click the button below to re-lock the screen and resume.</strong>
            </p>
            <button className="btn-filled" onClick={enterFullscreen} style={{ width: '100%', background: '#e53e3e', border: 'none' }}>
              Return to Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* SUBMISSION CONFIRMATION MODAL */}
      {showSubmitConfirm && examState === 'active' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999999 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.15rem', fontWeight: 'bold' }}>Submit Examination?</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
              Are you sure you want to end this online exam? You have answered <strong>{Object.keys(selectedAnswers).length}</strong> questions out of <strong>{totalQCount}</strong> total.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-outlined" onClick={() => setShowSubmitConfirm(false)} style={{ flex: 1 }}>Go Back</button>
              <button className="btn-filled" onClick={submitExam} style={{ flex: 1 }}>Yes, Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED/SUBMITTED RESULTS STEP */}
      {examState === 'submitted' && gradedResult && student && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '32px', maxWidth: '500px', width: '100%', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <CheckCircle size={56} color="#48bb78" style={{ marginBottom: '16px' }} />
            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.5rem', fontWeight: 900 }}>Exam Submitted!</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Thank you, <strong>{student.name}</strong>. Your test responses have been logged and graded.
            </p>

            <div style={{ background: '#f7fafc', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #edf2f7', paddingBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Score Achieved</span>
                <strong style={{ fontSize: '1rem', color: 'var(--text-dark)' }}>{gradedResult.score} / {gradedResult.maxScore}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #edf2f7', paddingBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Correct Questions</span>
                <span style={{ fontSize: '0.85rem', color: 'green', fontWeight: 'bold' }}>{gradedResult.correctCount} ✔</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #edf2f7', paddingBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Wrong / Penalized</span>
                <span style={{ fontSize: '0.85rem', color: 'red', fontWeight: 'bold' }}>{gradedResult.wrongCount} ✘</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Unanswered / Skipped</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>{gradedResult.unansweredCount}</span>
              </div>
            </div>

            <button className="btn-filled" onClick={onClose} style={{ width: '100%', padding: '10px' }}>
              Close Portal
            </button>
          </div>
        </div>
      )}

      {/* Floating spin animation stylesheet */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .cbt-workspace-split {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        .cbt-question-pane {
          flex: 3;
          background: #fff;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border-color);
          overflow-y: auto;
          padding: 32px;
        }
        .cbt-navigation-pane {
          flex: 1;
          background: #f7fafc;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        @media (max-width: 992px) {
          .cbt-workspace-split {
            flex-direction: column;
            overflow-y: auto;
          }
          .cbt-question-pane {
            flex: none;
            border-right: none;
            border-bottom: 1px solid var(--border-color);
            padding: 20px;
            overflow-y: visible;
          }
          .cbt-navigation-pane {
            flex: none;
            overflow-y: visible;
            padding-bottom: 40px;
          }
        }
      `}</style>
    </div>
  );
};

/**
 * Generates logical, NEET/competitive-exam-aligned questions dynamically.
 * Swaps option ordering so the correct answer aligns with the index designated in the OMR answerKey map.
 */
function generateMockQuestions(numQuestions: number, answerKey: Record<number, string>, examId: number): Question[] {
  const genericQuestions = [
    {
      text: "Which of the following physical quantities has the same dimensional formula as that of impulse?",
      options: ["Force", "Linear Momentum", "Torque", "Pressure"],
      correctOpt: 'B', // Index 1
      explanation: "Impulse is Force * Time, which is MLT^-2 * T = MLT^-1. This is identical to the dimensional formula of linear momentum."
    },
    {
      text: "A particle is moving in a circle of radius R with constant speed v. The magnitude of average acceleration during a semi-circle turn is:",
      options: ["v^2 / R", "2v^2 / (pi * R)", "v^2 / (2 * R)", "Zero"],
      correctOpt: 'B', // Index 1
      explanation: "Average acceleration is change in velocity divided by time. Time = pi*R/v. Change in velocity is 2v. Average acceleration = 2v / (pi*R/v) = 2v^2/(pi*R)."
    },
    {
      text: "The dimensional formula of universal gravitational constant G is:",
      options: ["[M^-1 L^3 T^-2]", "[M^1 L^3 T^-2]", "[M^-1 L^2 T^-2]", "[M^1 L^2 T^-1]"],
      correctOpt: 'A', // Index 0
      explanation: "Since F = G*m1*m2 / r^2, G = F*r^2 / (m1*m2). Substituting dimensions gives [MLT^-2]*[L^2] / [M^2] = [M^-1 L^3 T^-2]."
    },
    {
      text: "Which of the following organic compounds will show optical activity?",
      options: ["2-Chlorobutane", "1-Chlorobutane", "2-Chloropropane", "Butane"],
      correctOpt: 'A', // Index 0
      explanation: "2-Chlorobutane contains a chiral carbon atom bonded to four different groups (-H, -Cl, -CH3, -CH2CH3)."
    },
    {
      text: "The primary structure of a protein refers to:",
      options: ["Helix configuration", "Sequence of amino acids", "Three dimensional foldings", "Aggregation of sub-units"],
      correctOpt: 'B', // Index 1
      explanation: "The primary structure is the linear sequence of amino acids joined by peptide bonds."
    },
    {
      text: "Which cell organelle is responsible for cellular respiration and ATP generation?",
      options: ["Ribosome", "Mitochondria", "Chloroplast", "Lysosome"],
      correctOpt: 'B', // Index 1
      explanation: "Mitochondria are known as the powerhouses of the cell because they are the site of aerobic respiration and generate ATP."
    },
    {
      text: "In angiosperms, double fertilization is characterized by:",
      options: ["Fusion of two polar nuclei", "Syngamy and triple fusion", "Fertilization of two eggs", "Fusion of tube cell and egg"],
      correctOpt: 'B', // Index 1
      explanation: "Double fertilization involves syngamy (fusion of one male gamete with the egg) and triple fusion (fusion of the second male gamete with the secondary nucleus)."
    },
    {
      text: "The process of division of cytoplasm during cell cycle is named as:",
      options: ["Karyokinesis", "Cytokinesis", "Mitosis", "Meiosis"],
      correctOpt: 'B', // Index 1
      explanation: "Cytokinesis is the physical division of cytoplasm, cell membrane, and organelles into two daughter cells following karyokinesis."
    }
  ];

  const questions: Question[] = [];

  for (let i = 1; i <= numQuestions; i++) {
    // 1-based question number
    const targetAns = answerKey[i] || 'A';
    const targetIdx = OPTIONS.indexOf(targetAns);

    // Section allocation: Physics (1-50), Chemistry (51-100), Botany (101-150), Zoology (151-200)
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

    // Select base question or build a template placeholder
    const baseQ = genericQuestions[(i - 1) % genericQuestions.length];
    
    // Create copy of options array
    const baseOptions = [...baseQ.options];
    const baseCorrectLetter = baseQ.correctOpt;
    const baseCorrectIdx = OPTIONS.indexOf(baseCorrectLetter);

    // We must swap options so that the correct answer matches the targetIdx designated by the OMR answerKey
    if (targetIdx !== -1 && baseCorrectIdx !== targetIdx) {
      const temp = baseOptions[targetIdx];
      baseOptions[targetIdx] = baseOptions[baseCorrectIdx];
      baseOptions[baseCorrectIdx] = temp;
    }

    questions.push({
      examId,
      sectionName,
      questionText: `[Q.${i}] ${baseQ.text} (Section: ${sectionName})`,
      options: baseOptions,
      correctOptionIdx: targetIdx === -1 ? baseCorrectIdx : targetIdx,
      explanation: baseQ.explanation
    });
  }

  return questions;
}
