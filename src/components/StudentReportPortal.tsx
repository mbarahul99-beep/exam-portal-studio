import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Award, BookOpen, TrendingUp, Activity, Calendar, ChevronLeft, Download, CheckCircle, XCircle, MinusCircle, Camera, X, Lightbulb, Users, CheckCircle2, Check, AlertCircle, Clock } from 'lucide-react';
import { db, type Exam, type ExamSubmission } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { StudentReportPrint } from './StudentReportPrint';
import { OnlineSubmissionViewer } from './OnlineSubmissionViewer';
import { MathRenderer } from './MathRenderer';
import { pullCloudUpdatesToIndexedDB } from '../utils/cloudSync';
import { FullScreenOmrViewer } from './FullScreenOmrViewer';

interface StudentReportPortalProps {
  studentId: number;
  onLogout?: () => void;
  adminMode?: boolean;
  onClose?: () => void;
  preSelectedExamId?: number;
  publicMode?: boolean;
  onStartExam?: (examId: number) => void;
}

function getPieSectorPath(startPercent: number, endPercent: number): string {
  const startAngle = 2 * Math.PI * startPercent - Math.PI / 2;
  const endAngle = 2 * Math.PI * endPercent - Math.PI / 2;
  
  const x1 = 50 + 40 * Math.cos(startAngle);
  const y1 = 50 + 40 * Math.sin(startAngle);
  const x2 = 50 + 40 * Math.cos(endAngle);
  const y2 = 50 + 40 * Math.sin(endAngle);
  
  const largeArcFlag = endPercent - startPercent > 0.5 ? 1 : 0;
  
  return `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
}

export const StudentReportPortal: React.FC<StudentReportPortalProps> = ({ 
  studentId, 
  onLogout,
  adminMode = false,
  onClose,
  preSelectedExamId,
  publicMode = false,
  onStartExam
}) => {
  const [activeAnalysisSub, setActiveAnalysisSub] = useState<(ExamSubmission & { exam: Exam; studentRank: number; totalStudents: number; classAvg: number }) | null>(null);
  const [selectedChartDiff, setSelectedChartDiff] = useState<'Easy' | 'Moderate' | 'Difficult' | null>(null);
  const [selectedPiePortion, setSelectedPiePortion] = useState<'Right' | 'Wrong' | 'Unattempted' | null>(null);
  const [hasInitializedPreSelected, setHasInitializedPreSelected] = useState(false);
  const [showOmrModal, setShowOmrModal] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [showOnlineViewer, setShowOnlineViewer] = useState(false);

  const handleDownloadPdf = async () => {
    if (!activeAnalysisSub || !student) return;
    setIsDownloadingPdf(true);
    try {
      const loadHtml2Pdf = () => {
        return new Promise((resolve, reject) => {
          if ((window as any).html2pdf) {
            resolve((window as any).html2pdf);
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.integrity = 'sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==';
          script.crossOrigin = 'anonymous';
          script.referrerPolicy = 'no-referrer';
          script.onload = () => resolve((window as any).html2pdf);
          script.onerror = reject;
          document.body.appendChild(script);
        });
      };

      const html2pdf = await loadHtml2Pdf() as any;

      const element = document.querySelector('.report-print-page');
      if (!element) {
        alert('Report element not found.');
        return;
      }

      element.classList.add('is-generating-pdf');

      const opt = {
        margin:       [0, 0, 0, 0],
        filename:     `${student.name}_${activeAnalysisSub.exam.title}_Report.pdf`.replace(/\s+/g, '_'),
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 3, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'] }
      };

      try {
        const pdfBlob = await html2pdf().from(element).set(opt).output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);

        // Download locally
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = `${student.name}_${activeAnalysisSub.exam.title}_Report.pdf`.replace(/\s+/g, '_');
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Open directly in a new window/tab
        window.open(blobUrl, '_blank');
      } finally {
        element.classList.remove('is-generating-pdf');
      }
    } catch (err: any) {
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Dynamic Header Logo Scaling States
  const [logoHeight, setLogoHeight] = useState<number>(42);
  const [logoNameHeight, setLogoNameHeight] = useState<number>(38);
  const [activeTab, setActiveTab] = useState<'exams' | 'attendance' | 'online-exams'>('exams');

  useEffect(() => {
    const loadBranding = () => {
      const storedJson = localStorage.getItem('omr_custom_settings');
      if (storedJson) {
        try {
          const parsed = JSON.parse(storedJson);
          if (parsed.logoHeight) setLogoHeight(parsed.logoHeight);
          if (parsed.logoNameHeight) setLogoNameHeight(parsed.logoNameHeight);
        } catch (e) {}
      }
    };
    loadBranding();
    window.addEventListener('omr_settings_updated', loadBranding);
    return () => window.removeEventListener('omr_settings_updated', loadBranding);
  }, []);

  // PWA Install Promo States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPromo, setShowInstallPromo] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if launched as PWA or in dedicated student app mode
    const standaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches || 
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (window.navigator as any).standalone ||
      window.location.search.includes('app=student');
      
    setIsStandalone(!!standaloneMode);

    // Read the globally captured prompt if already fired on page load
    if ((window as any).deferredAppInstallPrompt) {
      setDeferredPrompt((window as any).deferredAppInstallPrompt);
    }

    // Listen to custom event in case it fires during active session
    const handlePromptAvailable = (e: any) => {
      setDeferredPrompt(e.detail);
    };

    // Fallback listener in case browser fires it late
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredAppInstallPrompt = e;
      setDeferredPrompt(e);
    };

    window.addEventListener('pwa-prompt-available', handlePromptAvailable);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    return () => {
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    // Sync latest database data immediately on mount of the student portal
    pullCloudUpdatesToIndexedDB();
    // Also set up a periodic sync loop every 5 seconds while in Student portal view
    const interval = setInterval(pullCloudUpdatesToIndexedDB, 5000);
    return () => clearInterval(interval);
  }, []);

  const numStudentId = Number(studentId);

  // Live queries
  const student = useLiveQuery(() => db.students.get(numStudentId), [numStudentId]);
  const submissions = useLiveQuery(() => db.submissions.where('studentId').equals(numStudentId).toArray(), [numStudentId]) || [];
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const allSubmissions = useLiveQuery(() => db.submissions.toArray()) || [];
  const allQuestions = useLiveQuery(() => db.questions.toArray()) || [];
  const studentAttendance = useLiveQuery(() => db.attendance.where('studentId').equals(numStudentId).toArray(), [numStudentId]) || [];

  // Fetch online exams configured for the student's class
  const onlineExams = React.useMemo(() => {
    if (!student) return [];
    return exams.filter(exam => {
      const isForClass = exam.className === student.className;
      const isPublic = exam.status === 'public';
      const isOnline = exam.startsAt !== undefined || exam.durationMins !== undefined || exam.loginOption !== undefined;
      return isForClass && isPublic && isOnline;
    });
  }, [exams, student]);

  // Match exam, calculate rank, and class average for each submission
  const examMap = new Map(exams.map(e => [e.id, e]));
  const studentHistory = submissions.map(sub => {
    const rawExam = examMap.get(sub.examId);
    if (!rawExam) return null;
    const exam = { ...rawExam };

    // Fallback: Auto-heal numQuestions locally in the view if it is less than sections total or answerKey length
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
      if (Number(s.studentId) === numStudentId) {
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
  }).filter(item => {
    if (!item) return false;
    if (adminMode) return true;
    return Boolean(item.exam.isResultsPublished || item.exam.status === 'public');
  }) as Array<ExamSubmission & { exam: Exam; studentRank: number; totalStudents: number; classAvg: number }>;

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
      const setKey = exam.answerKeys?.[item.bookletSet || 'A'] || exam.answerKey || {};
      const cAns = setKey[q];
      
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

  useEffect(() => {
    if (preSelectedExamId && studentHistory.length > 0 && !hasInitializedPreSelected) {
      const match = studentHistory.find(h => h.examId === preSelectedExamId);
      if (match) {
        setActiveAnalysisSub(match);
        setHasInitializedPreSelected(true);
      }
    }
  }, [preSelectedExamId, studentHistory, hasInitializedPreSelected]);

  if (!student) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f7fafc' }}>
        <p style={{ fontSize: '0.9rem', color: '#718096' }}>Loading candidate profile data...</p>
      </div>
    );
  }

  // Calculate stats for the selected exam analysis modal
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

    // Calculate subject-wise breakdown (Physics, Chemistry, Maths, etc.)
    const subjectStats: Record<string, { attempted: number; correct: number; unattempted: number; negativeMarks: number; total: number; score: number; totalPossible: number }> = {};
    
    // Calculate difficulty-wise breakdown
    const diffStats: Record<'Easy' | 'Moderate' | 'Difficult', { correct: number; wrong: number; skipped: number; total: number; questions: number[] }> = {
      Easy: { correct: 0, wrong: 0, skipped: 0, total: 0, questions: [] },
      Moderate: { correct: 0, wrong: 0, skipped: 0, total: 0, questions: [] },
      Difficult: { correct: 0, wrong: 0, skipped: 0, total: 0, questions: [] }
    };

    const correctQuestions: number[] = [];
    const incorrectQuestions: number[] = [];
    const unansweredQuestions: number[] = [];

    let totalNegativeMarks = 0;
    const examQuestions = allQuestions.filter(q => q.examId === activeAnalysisSub.exam.id);

    for (let q = 1; q <= activeAnalysisSub.exam.numQuestions; q++) {
      const secName = getQuestionSection(q, activeAnalysisSub.exam);
      const cleanSubject = secName.split(' - ')[0] || secName;
      const sAns = activeAnalysisSub.answers[q];
      const setKey = activeAnalysisSub.exam.answerKeys?.[activeAnalysisSub.bookletSet || 'A'] || activeAnalysisSub.exam.answerKey || {};
      const cAns = setKey[q];
      
      const isCorrect = sAns === cAns;
      const isLeft = !sAns;
      
      const secRules: any = activeAnalysisSub.exam.sectionsMarking?.[secName] || {
        correctMarks: activeAnalysisSub.exam.correctMarks || 4,
        incorrectMarks: activeAnalysisSub.exam.incorrectMarks || -1,
        unansweredMarks: activeAnalysisSub.exam.unansweredMarks || 0
      };
      
      secTotals[secName] = (secTotals[secName] || 0) + 1;
      
      if (isLeft) {
        secUnanswereds[secName] = (secUnanswereds[secName] || 0) + 1;
        unansweredQuestions.push(q);
      } else if (isCorrect) {
        secCorrects[secName] = (secCorrects[secName] || 0) + 1;
        correctQuestions.push(q);
      } else {
        secIncorrects[secName] = (secIncorrects[secName] || 0) + 1;
        incorrectQuestions.push(q);
      }

      // Subject stats
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
      if (activeAnalysisSub.attemptType === 'Online') {
        const qObj = examQuestions[q - 1];
        if (qObj && qObj.difficulty) {
          qDiff = qObj.difficulty;
        }
      } else {
        if (activeAnalysisSub.exam.difficulties && activeAnalysisSub.exam.difficulties[q]) {
          qDiff = activeAnalysisSub.exam.difficulties[q];
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

    let easyNegativeMarks = 0;
    diffStats.Easy.questions.forEach(q => {
      const sAns = activeAnalysisSub.answers[q];
      const subSet = activeAnalysisSub.bookletSet || 'A';
      const setKey = activeAnalysisSub.exam.answerKeys?.[subSet] || activeAnalysisSub.exam.answerKey || {};
      const cAns = setKey[q];
      if (sAns && sAns !== cAns) {
        const secName = getQuestionSection(q, activeAnalysisSub.exam);
        const secRules = activeAnalysisSub.exam.sectionsMarking?.[secName] || {
          incorrectMarks: activeAnalysisSub.exam.incorrectMarks || -1
        };
        easyNegativeMarks += Math.abs(secRules.incorrectMarks);
      }
    });

    analysisDetails = {
      maxScore,
      accuracy,
      sectionRows: sectionAnalysisRows,
      subjectStats,
      diffStats,
      totalNegativeMarks,
      easyNegativeMarks,
      correctQuestions,
      incorrectQuestions,
      unansweredQuestions
    };
  }

  if (showOmrModal && activeAnalysisSub && activeAnalysisSub.omrImageUrl) {
    return (
      <FullScreenOmrViewer
        imageUrl={activeAnalysisSub.omrImageUrl}
        title={`Scanned OMR Sheet - ${student?.name || 'Student'}`}
        subtitle={`Roll Number: ${student?.studentNum || ''}${student?.fatherName ? ` | Father: ${student.fatherName}` : ''}`}
        onClose={() => setShowOmrModal(false)}
        scoreInfo={{
          score: activeAnalysisSub.score || 0,
          correctCount: analysisDetails ? (analysisDetails.diffStats.Easy.correct + analysisDetails.diffStats.Moderate.correct + analysisDetails.diffStats.Difficult.correct) : undefined,
          wrongCount: analysisDetails ? (analysisDetails.diffStats.Easy.wrong + analysisDetails.diffStats.Moderate.wrong + analysisDetails.diffStats.Difficult.wrong) : undefined,
          unansweredCount: analysisDetails ? (analysisDetails.diffStats.Easy.skipped + analysisDetails.diffStats.Moderate.skipped + analysisDetails.diffStats.Difficult.skipped) : undefined
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#f8fafc', padding: '24px 16px', boxSizing: 'border-box', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Dynamic PDF Generation Progress Modal */}
      {isDownloadingPdf && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999
        }}>
          <div style={{
            background: '#ffffff',
            padding: '36px 28px',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05)',
            textAlign: 'center',
            maxWidth: '380px',
            width: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center'
          }}>
            <div className="pdf-loading-spinner" />
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 'bold' }}>
              Generating PDF Report
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: '1.5' }}>
              Rendering scorecard layouts, section score analytics, and detail grids.
            </p>
            <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 'bold', background: '#f0fdf4', padding: '4px 12px', borderRadius: '12px' }}>
              Will open automatically after download
            </span>
          </div>
        </div>
      )}

      {/* Dynamic Student PWA App Download Overlay */}
      {showInstallPromo && !isStandalone && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '24px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            padding: '40px 32px',
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            color: '#fff'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>📱</div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#10b981' }}>
              APEX Student App
            </h2>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.6 }}>
              Download our dedicated mobile application for instant notifications, faster loading of report cards, and secure offline results access.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {deferredPrompt ? (
                <button
                  onClick={() => {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choiceResult: any) => {
                      if (choiceResult.outcome === 'accepted') {
                        setShowInstallPromo(false);
                        localStorage.setItem('apex_student_app_promo_dismissed', 'true');
                      }
                    });
                  }}
                  style={{
                    padding: '14px 24px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                    transition: 'all 0.2s'
                  }}
                >
                  Install Dedicated App
                </button>
              ) : (
                <div style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px dashed rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  padding: '16px',
                  fontSize: '0.85rem',
                  color: '#cbd5e1',
                  lineHeight: '1.5',
                  textAlign: 'left'
                }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>How to Install:</p>
                  <p style={{ margin: 0 }}>
                    <strong>iOS Safari:</strong> Tap the <strong>Share</strong> button at the bottom of your screen, then select <strong>'Add to Home Screen'</strong>.
                  </p>
                  <p style={{ margin: '8px 0 0 0' }}>
                    <strong>Android / Chrome:</strong> Tap the three dots menu at the top right, then select <strong>'Install App'</strong>.
                  </p>
                </div>
              )}

              <button
                onClick={() => {
                  setShowInstallPromo(false);
                  localStorage.setItem('apex_student_app_promo_dismissed', 'true');
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Skip & Continue to Website
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Print-only scorecard document (rendered outside the no-print modal overlay via React Portal) */}
      {activeAnalysisSub && createPortal(
        <div className="print-only">
          <StudentReportPrint 
            exam={activeAnalysisSub.exam}
            student={student}
            submission={activeAnalysisSub}
          />
        </div>,
        document.body
      )}

      {/* Main Dashboard Screen (hidden on print) */}
      <div className="no-print" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Active Detailed Exam Analysis View */}
        {activeAnalysisSub && analysisDetails ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            
            {/* Public Brand Header */}
            {publicMode && (
              <header className="report-portal-brand-header">
                <div className="brand-logos-container">
                  <img src="/logo.png" alt="APEX Logo" style={{ height: `${logoHeight}px`, width: 'auto', objectFit: 'contain' }} />
                  <img src="/logo_name.png" alt="Institute APEX" style={{ height: `${logoNameHeight}px`, width: 'auto', objectFit: 'contain' }} />
                  <span style={{ fontSize: '0.75rem', background: '#f0fdf4', color: '#16a34a', fontWeight: 800, padding: '4px 12px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Official Scorecard</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold' }}>
                  Student Performance Evaluation
                </div>
              </header>
            )}

            {/* Analysis Header */}
            <div className="dashboard-header-buttons">
              {!publicMode ? (
                <div className="dashboard-back-btn-group">
                  <button 
                    onClick={() => setActiveAnalysisSub(null)}
                    style={{ background: 'transparent', border: '1px solid #2563eb', color: '#2563eb' }}
                  >
                    {adminMode ? <TrendingUp size={16} /> : <ChevronLeft size={16} />} {adminMode ? 'Student Dashboard' : 'Back to Dashboard'}
                  </button>
                  {adminMode && (
                    <button 
                      onClick={onClose}
                      style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#64748b' }}
                    >
                      Close Analysis
                    </button>
                  )}
                </div>
              ) : <div />}

              <div className="dashboard-actions-btn-group no-print">
                {activeAnalysisSub.omrImageUrl && (
                  <button 
                    onClick={() => setShowOmrModal(true)}
                    style={{ background: '#0d9488', border: 'none', color: '#fff', boxShadow: '0 4px 6px -1px rgba(13,148,136,0.2)' }}
                  >
                    <Camera size={16} /> View OMR Sheet
                  </button>
                )}
                <button 
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  style={{ background: '#16a34a', border: 'none', color: '#fff', boxShadow: '0 4px 6px -1px rgba(22,163,74,0.2)', opacity: isDownloadingPdf ? 0.7 : 1 }}
                >
                  {isDownloadingPdf ? (
                    <>⏳ Downloading...</>
                  ) : (
                    <><Download size={16} /> Download PDF</>
                  )}
                </button>
                {activeAnalysisSub.attemptType === 'Online' && (
                  <button 
                    onClick={() => setShowOnlineViewer(true)}
                    style={{ background: '#2563eb', border: 'none', color: '#fff', boxShadow: '0 4px 6px -1px rgba(37,99,235,0.2)' }}
                  >
                    <BookOpen size={16} /> View Submission
                  </button>
                )}
              </div>
            </div>

            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
                {activeAnalysisSub.exam.title}
              </h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>Candidate: <strong style={{ color: '#0f172a' }}>{student.name}</strong></span>
                {student.fatherName && (
                  <>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <span>Father: <strong style={{ color: '#0f172a' }}>{student.fatherName}</strong></span>
                  </>
                )}
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span>Roll ID: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{student.studentNum}</code></span>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span>Detailed Performance Diagnostic & Section-wise Evaluation</span>
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

            {/* SUBJECT-WISE PERFORMANCE ANALYSIS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} style={{ color: '#2563eb' }} /> Subject-wise Performance Diagnostics
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                {Object.entries(analysisDetails.subjectStats).map(([subName, stats]) => {
                  const accuracy = stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0;
                  // Color styling based on subject name
                  let themeColor = '#2563eb'; // blue
                  let lightBg = '#eff6ff';
                  if (subName.toLowerCase().includes('chem')) {
                    themeColor = '#ea580c'; // orange
                    lightBg = '#fff7ed';
                  } else if (subName.toLowerCase().includes('biol') || subName.toLowerCase().includes('bot') || subName.toLowerCase().includes('zoo')) {
                    themeColor = '#16a34a'; // green
                    lightBg = '#f0fdf4';
                  }
                  
                  return (
                    <div key={subName} style={{ background: '#fff', border: `1px solid #e2e8f0`, borderTop: `4px solid ${themeColor}`, borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{subName}</h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Attempted</span>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{stats.attempted} <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 'normal' }}>/ {stats.total}</span></div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Correct</span>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16a34a' }}>{stats.correct}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Skipped</span>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#475569' }}>{stats.unattempted}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Negative Marks</span>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>-{stats.negativeMarks}</div>
                        </div>
                      </div>
                      
                      <div style={{ background: lightBg, padding: '10px', borderRadius: '8px', textAlign: 'center', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>
                          <span style={{ fontSize: '0.62rem', color: '#64748b', display: 'block', fontWeight: 'bold', textTransform: 'uppercase' }}>Accuracy Rate</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: themeColor }}>{accuracy}%</span>
                        </div>
                        <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '4px', marginTop: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.72rem' }}>
                          <div>
                            <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Marks</span>
                            <div style={{ fontWeight: 800, color: '#1e293b' }}>{stats.score} / {stats.totalPossible}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Percentage</span>
                            <div style={{ fontWeight: 800, color: '#1e293b' }}>{stats.totalPossible > 0 ? Math.round((stats.score / stats.totalPossible) * 100) : 0}%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Negative Marks dashboard card */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Negative Marks Lost Breakdown</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', alignItems: 'stretch' }}>
                  {Object.entries(analysisDetails.subjectStats).map(([subName, stats]) => (
                    <div key={`portal-neg-${subName}`} style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#475569' }}>{subName}</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>-{stats.negativeMarks}</div>
                    </div>
                  ))}
                  <div style={{ padding: '12px', background: '#ef4444', color: '#fff', borderRadius: '8px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(239,68,68,0.2)' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.85)' }}>Total Negative</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>-{analysisDetails.totalNegativeMarks}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* DIFFICULTY LEVEL DIAGNOSTICS & ROI ANALYSIS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={18} style={{ color: '#2563eb' }} /> Difficulty-level Diagnostics & ROI Analysis
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                
                                {/* 1. Stacked Bar Chart Card */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)', width: '100%', boxSizing: 'border-box' }}>
                  <h4 style={{ margin: '0 0 20px 0', fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Questions Distribution by Difficulty</h4>
                  
                  {/* The Chart Axes Area */}
                  <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-end', height: '200px', width: '100%', maxWidth: '320px', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', boxSizing: 'border-box' }}>
                    
                    {/* Easy Bar */}
                    {(() => {
                      const stats = analysisDetails.diffStats.Easy;
                      const tot = stats.total || 1;
                      const correctPct = (stats.correct / tot) * 100;
                      const wrongPct = (stats.wrong / tot) * 100;
                      const skippedPct = (stats.skipped / tot) * 100;
                      const isSelected = selectedChartDiff === 'Easy';
                      return (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <div 
                            onClick={() => setSelectedChartDiff(prev => prev === 'Easy' ? null : 'Easy')}
                            style={{ 
                              width: '36px', 
                              height: '160px', 
                              background: '#f1f5f9', 
                              borderRadius: '6px', 
                              overflow: 'hidden', 
                              display: 'flex', 
                              flexDirection: 'column-reverse', 
                              boxShadow: isSelected ? '0 0 0 2px #2563eb, inset 0 2px 4px rgba(0,0,0,0.05)' : 'inset 0 2px 4px rgba(0,0,0,0.05)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {stats.correct > 0 && (
                              <div style={{ height: `${correctPct}%`, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Correct: ${stats.correct}`}>
                                {correctPct >= 12 ? stats.correct : ''}
                              </div>
                            )}
                            {stats.wrong > 0 && (
                              <div style={{ height: `${wrongPct}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Incorrect: ${stats.wrong}`}>
                                {wrongPct >= 12 ? stats.wrong : ''}
                              </div>
                            )}
                            {stats.skipped > 0 && (
                              <div style={{ height: `${skippedPct}%`, background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Skipped: ${stats.skipped}`}>
                                {skippedPct >= 12 ? stats.skipped : ''}
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isSelected ? '#2563eb' : '#475569' }}>Easy</span>
                        </div>
                      );
                    })()}

                    {/* Moderate Bar */}
                    {(() => {
                      const stats = analysisDetails.diffStats.Moderate;
                      const tot = stats.total || 1;
                      const correctPct = (stats.correct / tot) * 100;
                      const wrongPct = (stats.wrong / tot) * 100;
                      const skippedPct = (stats.skipped / tot) * 100;
                      const isSelected = selectedChartDiff === 'Moderate';
                      return (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <div 
                            onClick={() => setSelectedChartDiff(prev => prev === 'Moderate' ? null : 'Moderate')}
                            style={{ 
                              width: '36px', 
                              height: '160px', 
                              background: '#f1f5f9', 
                              borderRadius: '6px', 
                              overflow: 'hidden', 
                              display: 'flex', 
                              flexDirection: 'column-reverse', 
                              boxShadow: isSelected ? '0 0 0 2px #2563eb, inset 0 2px 4px rgba(0,0,0,0.05)' : 'inset 0 2px 4px rgba(0,0,0,0.05)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {stats.correct > 0 && (
                              <div style={{ height: `${correctPct}%`, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Correct: ${stats.correct}`}>
                                {correctPct >= 12 ? stats.correct : ''}
                              </div>
                            )}
                            {stats.wrong > 0 && (
                              <div style={{ height: `${wrongPct}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Incorrect: ${stats.wrong}`}>
                                {wrongPct >= 12 ? stats.wrong : ''}
                              </div>
                            )}
                            {stats.skipped > 0 && (
                              <div style={{ height: `${skippedPct}%`, background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Skipped: ${stats.skipped}`}>
                                {skippedPct >= 12 ? stats.skipped : ''}
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isSelected ? '#2563eb' : '#475569' }}>Moderate</span>
                        </div>
                      );
                    })()}

                    {/* Difficult Bar */}
                    {(() => {
                      const stats = analysisDetails.diffStats.Difficult;
                      const tot = stats.total || 1;
                      const correctPct = (stats.correct / tot) * 100;
                      const wrongPct = (stats.wrong / tot) * 100;
                      const skippedPct = (stats.skipped / tot) * 100;
                      const isSelected = selectedChartDiff === 'Difficult';
                      return (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <div 
                            onClick={() => setSelectedChartDiff(prev => prev === 'Difficult' ? null : 'Difficult')}
                            style={{ 
                              width: '36px', 
                              height: '160px', 
                              background: '#f1f5f9', 
                              borderRadius: '6px', 
                              overflow: 'hidden', 
                              display: 'flex', 
                              flexDirection: 'column-reverse', 
                              boxShadow: isSelected ? '0 0 0 2px #2563eb, inset 0 2px 4px rgba(0,0,0,0.05)' : 'inset 0 2px 4px rgba(0,0,0,0.05)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {stats.correct > 0 && (
                              <div style={{ height: `${correctPct}%`, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Correct: ${stats.correct}`}>
                                {correctPct >= 12 ? stats.correct : ''}
                              </div>
                            )}
                            {stats.wrong > 0 && (
                              <div style={{ height: `${wrongPct}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Incorrect: ${stats.wrong}`}>
                                {wrongPct >= 12 ? stats.wrong : ''}
                              </div>
                            )}
                            {stats.skipped > 0 && (
                              <div style={{ height: `${skippedPct}%`, background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: '0.65rem', fontWeight: 'bold' }} title={`Skipped: ${stats.skipped}`}>
                                {skippedPct >= 12 ? stats.skipped : ''}
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isSelected ? '#2563eb' : '#475569' }}>Difficult</span>
                        </div>
                      );
                    })()}

                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', gap: '16px', marginTop: '20px', fontSize: '0.75rem', color: '#64748b' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', background: '#2563eb', borderRadius: '3px' }} /> Correct
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '3px' }} /> Incorrect
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', background: '#cbd5e1', borderRadius: '3px' }} /> Skipped
                    </span>
                  </div>

                  {/* Interactive Chart Details Box */}
                  {selectedChartDiff && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px 14px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      position: 'relative',
                      alignSelf: 'stretch',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                      <button 
                        onClick={() => setSelectedChartDiff(null)}
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          lineHeight: '1'
                        }}
                      >
                        ×
                      </button>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {selectedChartDiff} Level Stats
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        <div style={{ background: '#f0fdf4', padding: '4px 6px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: '#15803d', fontWeight: 'bold' }}>CORRECT</div>
                          <div style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 800 }}>{analysisDetails.diffStats[selectedChartDiff].correct}</div>
                        </div>
                        <div style={{ background: '#fdf2f2', padding: '4px 6px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: '#b91c1c', fontWeight: 'bold' }}>WRONG</div>
                          <div style={{ fontSize: '0.9rem', color: '#991b1b', fontWeight: 800 }}>{analysisDetails.diffStats[selectedChartDiff].wrong}</div>
                        </div>
                        <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 'bold' }}>SKIPPED</div>
                          <div style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 800 }}>{analysisDetails.diffStats[selectedChartDiff].skipped}</div>
                        </div>
                        <div style={{ background: '#eff6ff', padding: '4px 6px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: '#2563eb', fontWeight: 'bold' }}>TOTAL</div>
                          <div style={{ fontSize: '0.9rem', color: '#1e40af', fontWeight: 800 }}>{analysisDetails.diffStats[selectedChartDiff].total}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginTop: '4px', lineHeight: '1.4', wordBreak: 'break-word' }}>
                        <strong>Questions:</strong> {analysisDetails.diffStats[selectedChartDiff].questions.map(qNum => `Q${qNum}`).join(', ') || 'None'}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Standalone Interactive Pie Chart Card */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)', width: '100%', boxSizing: 'border-box' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overall Performance Pie Chart</h4>

                  {(() => {
                    const totalCorrect = analysisDetails.correctQuestions.length;
                    const totalWrong = analysisDetails.incorrectQuestions.length;
                    const totalSkipped = analysisDetails.unansweredQuestions.length;
                    const total = totalCorrect + totalWrong + totalSkipped;

                    const slices = [
                      { type: 'Right' as const, count: totalCorrect, color: '#22c55e', label: 'Right' },
                      { type: 'Wrong' as const, count: totalWrong, color: '#ef4444', label: 'Wrong' },
                      { type: 'Unattempted' as const, count: totalSkipped, color: '#78350f', label: 'Unattempted' }
                    ];

                    let currentPercent = 0;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        {/* Interactive SVG Pie - Increased Size with Labels on Portions */}
                        <div style={{ position: 'relative', width: '100%', maxWidth: '245px', aspectRatio: '1/1', margin: '0 auto' }}>
                          <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%', overflow: 'visible' }}>
                            {total === 0 ? (
                              <circle cx="50" cy="50" r="45" fill="#cbd5e1" />
                            ) : (
                              slices.map((slice) => {
                                if (slice.count === 0) return null;
                                if (slice.count === total) {
                                  const textX = 50;
                                  const textY = 25;
                                  return (
                                    <g key={slice.type}>
                                      <circle
                                        cx="50"
                                        cy="50"
                                        r="45"
                                        fill={slice.color}
                                        onClick={() => setSelectedPiePortion(prev => prev === slice.type ? null : slice.type)}
                                        style={{
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease',
                                          stroke: selectedPiePortion === slice.type ? '#000' : 'none',
                                          strokeWidth: 2
                                        }}
                                      />
                                      <text
                                        x={textX}
                                        y={textY}
                                        textAnchor="middle"
                                        fill="#fff"
                                        fontSize="7.5"
                                        fontWeight="bold"
                                        style={{ pointerEvents: 'none', filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.6))' }}
                                      >
                                        {slice.count}
                                      </text>
                                    </g>
                                  );
                                }
                                const start = currentPercent;
                                currentPercent += slice.count / total;
                                const end = currentPercent;
                                const pathData = getPieSectorPath(start, end);
                                
                                // Calculate portion labels coordinates
                                const middlePercent = start + (end - start) / 2;
                                const middleAngle = 2 * Math.PI * middlePercent - Math.PI / 2;
                                const textX = 50 + 31 * Math.cos(middleAngle);
                                const textY = 50 + 31 * Math.sin(middleAngle) + 2.2;
                                const slicePercent = (slice.count / total) * 100;

                                return (
                                  <g key={slice.type}>
                                    <path
                                      d={pathData}
                                      fill={slice.color}
                                      onClick={() => setSelectedPiePortion(prev => prev === slice.type ? null : slice.type)}
                                      style={{
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        transform: selectedPiePortion === slice.type ? 'scale(1.04)' : 'scale(1)',
                                        transformOrigin: '50px 50px',
                                        stroke: selectedPiePortion === slice.type ? '#000' : '#fff',
                                        strokeWidth: selectedPiePortion === slice.type ? 1.5 : 0.5
                                      }}
                                    />
                                    {slicePercent > 1.5 && (
                                      <text
                                        x={textX}
                                        y={textY}
                                        textAnchor="middle"
                                        fill="#fff"
                                        fontSize="6.5"
                                        fontWeight="bold"
                                        style={{ pointerEvents: 'none', filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.65))' }}
                                      >
                                        {slice.count}
                                      </text>
                                    )}
                                  </g>
                                );
                              })
                            )}
                            {/* Inner Donut hole natively rendered in SVG */}
                            <circle cx="50" cy="50" r="26" fill="#fff" />
                            <text x="50" y="46" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#64748b">TOTAL</text>
                            <text x="50" y="58" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0f172a">{total}</text>
                          </svg>
                        </div>

                        {/* Interactive Selection Legend & Counts */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '16px', fontSize: '0.72rem', fontWeight: 800 }}>
                          {slices.map(slice => (
                            <span
                              key={slice.type}
                              onClick={() => setSelectedPiePortion(prev => prev === slice.type ? null : slice.type)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                background: selectedPiePortion === slice.type ? '#f1f5f9' : 'transparent',
                                border: selectedPiePortion === slice.type ? '1px solid #cbd5e1' : '1px solid transparent',
                                transition: 'all 0.2s ease',
                                color: slice.type === 'Right' ? '#166534' : slice.type === 'Wrong' ? '#991b1b' : '#7c2d12',
                                boxShadow: selectedPiePortion === slice.type ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                              }}
                            >
                              <span style={{ width: '10px', height: '10px', background: slice.color, borderRadius: '50%' }} />
                              {slice.label}: {slice.count}
                            </span>
                          ))}
                        </div>

                        {/* Difficulty Level Breakdown Grid */}
                        <div style={{ width: '100%', borderTop: '1px solid #e2e8f0', marginTop: '16px', paddingTop: '16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 50px)', gap: '8px', textAlign: 'center', fontSize: '0.75rem' }}>
                            <div style={{ fontWeight: 800, textAlign: 'left', color: '#475569' }}>Difficulty</div>
                            <div style={{ fontWeight: 800, color: '#22c55e' }}>Right</div>
                            <div style={{ fontWeight: 800, color: '#ef4444' }}>Wrong</div>
                            <div style={{ fontWeight: 800, color: '#78350f' }}>Left</div>

                            <div style={{ textAlign: 'left', fontWeight: 600 }}>Easy</div>
                            <div style={{ color: '#166534', fontWeight: 700 }}>{analysisDetails.diffStats.Easy.correct}</div>
                            <div style={{ color: '#991b1b', fontWeight: 700 }}>{analysisDetails.diffStats.Easy.wrong}</div>
                            <div style={{ color: '#7c2d12', fontWeight: 700 }}>{analysisDetails.diffStats.Easy.skipped}</div>

                            <div style={{ textAlign: 'left', fontWeight: 600 }}>Moderate</div>
                            <div style={{ color: '#166534', fontWeight: 700 }}>{analysisDetails.diffStats.Moderate.correct}</div>
                            <div style={{ color: '#991b1b', fontWeight: 700 }}>{analysisDetails.diffStats.Moderate.wrong}</div>
                            <div style={{ color: '#7c2d12', fontWeight: 700 }}>{analysisDetails.diffStats.Moderate.skipped}</div>

                            <div style={{ textAlign: 'left', fontWeight: 600 }}>Difficult</div>
                            <div style={{ color: '#166534', fontWeight: 700 }}>{analysisDetails.diffStats.Difficult.correct}</div>
                            <div style={{ color: '#991b1b', fontWeight: 700 }}>{analysisDetails.diffStats.Difficult.wrong}</div>
                            <div style={{ color: '#7c2d12', fontWeight: 700 }}>{analysisDetails.diffStats.Difficult.skipped}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Selected Pie Portion Detail List - Full Width and Length Downside Charts */}
              {selectedPiePortion && (
                <div style={{ 
                  background: '#fff', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '12px', 
                  padding: '24px', 
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '20px',
                  marginTop: '12px',
                  width: '100%',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ 
                        width: '12px', 
                        height: '12px', 
                        background: selectedPiePortion === 'Right' ? '#22c55e' : selectedPiePortion === 'Wrong' ? '#ef4444' : '#78350f', 
                        borderRadius: '50%' 
                      }} />
                      {selectedPiePortion} Questions List ({
                        selectedPiePortion === 'Right' ? analysisDetails.correctQuestions.length : 
                        selectedPiePortion === 'Wrong' ? analysisDetails.incorrectQuestions.length : 
                        analysisDetails.unansweredQuestions.length
                      })
                    </h3>
                    <button 
                      onClick={() => setSelectedPiePortion(null)}
                      style={{
                        background: '#f1f5f9',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Close ×
                    </button>
                  </div>
                  
                  {/* Detailed list of question cards in full width and length */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {(() => {
                      const examQuestions = allQuestions.filter(q => q.examId === activeAnalysisSub.exam.id);
                      const sortedQs = [...examQuestions].sort((a, b) => (a.id || 0) - (b.id || 0));
                      const qNumsList = selectedPiePortion === 'Right' ? analysisDetails.correctQuestions : selectedPiePortion === 'Wrong' ? analysisDetails.incorrectQuestions : analysisDetails.unansweredQuestions;
                      
                      const OPTIONS_LETTERS = ['A', 'B', 'C', 'D', 'E'];
                      
                      return qNumsList.map((qNum: number) => {
                        // Find question details in bank
                        const qObj = sortedQs[qNum - 1];
                        
                        const sAns = activeAnalysisSub.answers[qNum];
                        const subSet = activeAnalysisSub.bookletSet || 'A';
                        const setKey = activeAnalysisSub.exam.answerKeys?.[subSet] || activeAnalysisSub.exam.answerKey || {};
                        const cAns = setKey[qNum];
                        
                        const isCorrect = sAns === cAns;
                        const isLeft = !sAns;
                        
                        const secName = getQuestionSection(qNum, activeAnalysisSub.exam);
                        
                        let qDiff = 'Easy';
                        if (activeAnalysisSub.attemptType === 'Online') {
                          if (qObj && qObj.difficulty) qDiff = qObj.difficulty;
                        } else {
                          if (activeAnalysisSub.exam.difficulties && activeAnalysisSub.exam.difficulties[qNum]) {
                            qDiff = activeAnalysisSub.exam.difficulties[qNum];
                          }
                        }

                        let themeColor = '#cbd5e1';
                        let statusText = 'Left / Unattempted';
                        let marksText = '0 Marks';
                        
                        if (isCorrect) {
                          themeColor = '#22c55e';
                          statusText = 'Correct Answer';
                          marksText = `+${activeAnalysisSub.exam.correctMarks || 4} Marks`;
                        } else if (!isLeft) {
                          themeColor = '#ef4444';
                          statusText = 'Wrong Answer';
                          marksText = `${activeAnalysisSub.exam.incorrectMarks || -1} Marks`;
                        }

                        return (
                          <div 
                            key={qNum}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderLeft: `6px solid ${themeColor}`,
                              borderRadius: '12px',
                              padding: '18px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px',
                              boxSizing: 'border-box',
                              width: '100%'
                            }}
                          >
                            {/* Question Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                                {secName} • Question {qNum} • <span style={{ color: qDiff === 'Easy' ? '#16a34a' : qDiff === 'Difficult' ? '#dc2626' : '#d97706' }}>{qDiff}</span>
                              </span>
                              <span style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: 800, 
                                color: isCorrect ? '#166534' : isLeft ? '#475569' : '#991b1b',
                                background: isCorrect ? '#f0fdf4' : isLeft ? '#f1f5f9' : '#fdf2f2',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                border: `1px solid ${isCorrect ? '#bbf7d0' : isLeft ? '#e2e8f0' : '#fecaca'}`
                              }}>
                                {statusText} ({marksText})
                              </span>
                            </div>

                            {/* Question Text */}
                            {qObj && qObj.questionText ? (
                              <div style={{ fontSize: '0.88rem', color: '#1e293b', fontWeight: 600, lineHeight: 1.5 }}>
                                <MathRenderer text={qObj.questionText} />
                              </div>
                            ) : activeAnalysisSub.attemptType === 'Online' ? (
                              <div style={{ fontSize: '0.82rem', color: '#64748b', fontStyle: 'italic', fontWeight: 600 }}>
                                Question text is not registered. Grading details are shown below.
                              </div>
                            ) : null}

                            {/* Diagram if available */}
                            {qObj && qObj.questionImage && (
                              <div style={{ alignSelf: 'flex-start', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px', background: '#fff', maxWidth: '100%', boxSizing: 'border-box' }}>
                                <img 
                                  src={qObj.questionImage} 
                                  alt={`Question ${qNum} diagram`} 
                                  style={{ maxHeight: '200px', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px' }} 
                                />
                              </div>
                            )}

                            {/* Options block */}
                            {qObj && qObj.options && qObj.options.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                {qObj.options.map((optText, optIdx) => {
                                  const letter = OPTIONS_LETTERS[optIdx];
                                  const isCorrectKey = letter === cAns;
                                  const isSelectedWrong = (letter === sAns) && (sAns !== cAns);

                                  let itemBg = '#fff';
                                  let itemBorder = '1px solid #e2e8f0';
                                  let itemColor = '#1e293b';

                                  if (isCorrectKey) {
                                    itemBg = '#f0fdf4';
                                    itemBorder = '1px solid #bbf7d0';
                                    itemColor = '#166534';
                                  } else if (isSelectedWrong) {
                                    itemBg = '#fdf2f2';
                                    itemBorder = '1px solid #fecaca';
                                    itemColor = '#991b1b';
                                  }

                                  return (
                                    <div 
                                      key={optIdx} 
                                      style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '10px', 
                                        padding: '10px 14px', 
                                        borderRadius: '8px', 
                                        background: itemBg, 
                                        border: itemBorder,
                                        color: itemColor,
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        boxSizing: 'border-box'
                                      }}
                                    >
                                      <span style={{ 
                                        width: '20px', 
                                        height: '20px', 
                                        borderRadius: '50%', 
                                        background: isCorrectKey ? '#22c55e' : isSelectedWrong ? '#ef4444' : '#f1f5f9',
                                        color: isCorrectKey || isSelectedWrong ? '#fff' : '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.72rem',
                                        fontWeight: 'bold',
                                        flexShrink: 0
                                      }}>
                                        {letter}
                                      </span>
                                      <span style={{ flex: 1 }}><MathRenderer text={optText} /></span>
                                      {isCorrectKey && <Check size={16} style={{ color: '#16a34a', marginLeft: 'auto', flexShrink: 0 }} />}
                                      {isSelectedWrong && <X size={16} style={{ color: '#dc2626', marginLeft: 'auto', flexShrink: 0 }} />}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              /* Standard Fallback comparison widget */
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(2, 1fr)', 
                                gap: '12px', 
                                background: '#fff', 
                                border: '1px solid #e2e8f0', 
                                borderRadius: '8px', 
                                padding: '10px 14px',
                                boxSizing: 'border-box',
                                marginTop: '4px'
                              }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                  Correct Answer Key: <strong style={{ color: '#16a34a', fontSize: '0.9rem', marginLeft: '4px' }}>{cAns}</strong>
                                </div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                  Candidate Response: <strong style={{ 
                                    color: isCorrect ? '#16a34a' : isLeft ? '#64748b' : '#dc2626',
                                    fontSize: '0.9rem',
                                    marginLeft: '4px'
                                  }}>
                                    {sAns === 'MULTIPLE' ? 'M (Multiple)' : (sAns || 'Left/Skipped')}
                                  </strong>
                                </div>
                              </div>
                            )}

                            {/* Explanation solution box */}
                            {qObj && qObj.explanation && (
                              <div style={{ 
                                background: '#f0fdf4', 
                                border: '1px solid #ccfbf1', 
                                borderRadius: '8px', 
                                padding: '10px 14px',
                                boxSizing: 'border-box',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                                  <AlertCircle size={14} /> Explanation & Solution Detail
                                </div>
                                <div style={{ fontSize: '0.82rem', color: '#115e59', fontWeight: 600, lineHeight: 1.5 }}>
                                  <MathRenderer text={qObj.explanation} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* 3. ROI Insights Alert Box */}
              {analysisDetails.diffStats.Easy.wrong > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
                  <Lightbulb size={20} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '0.88rem', fontWeight: 800, color: '#b45309' }}>ROI Optimization Insight</h5>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#d97706', lineHeight: '1.4', fontWeight: 600 }}>
                      You got <strong style={{ color: '#92400e', fontSize: '0.85rem' }}>{analysisDetails.diffStats.Easy.wrong} Easy Questions incorrect</strong> (costing you <strong style={{ color: '#92400e', fontSize: '0.85rem' }}>-{analysisDetails.easyNegativeMarks} marks</strong> in negative scoring). Easy questions represent the highest return-on-investment (ROI) of your time during exams. Double-check your calculations on simple questions to avoid throwing away these free marks!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Full-width Question Response Map */}
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Array.from({ length: activeAnalysisSub.exam.numQuestions }, (_, i) => {
                    const qNum = i + 1;
                    const sAns = activeAnalysisSub.answers[qNum];
                    const subSet = activeAnalysisSub.bookletSet || 'A';
                    const setKey = activeAnalysisSub.exam.answerKeys?.[subSet] || activeAnalysisSub.exam.answerKey || {};
                    const cAns = setKey[qNum];
                    
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

                    const displayAns = sAns === 'MULTIPLE' ? 'M' : (sAns || '-');
                    return (
                      <div 
                        key={qNum}
                        title={`Q.${qNum} | Correct Key: ${cAns} | Student Response: ${sAns || 'Left/Unanswered'}`}
                        style={{
                          width: '48px',
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
                        <span style={{ fontSize: '0.62rem', color: '#64748b' }}>Q{qNum}</span>
                        <div style={{ display: 'flex', gap: '3px', fontSize: '0.55rem', marginTop: '1px' }}>
                          <span style={{ color: '#16a34a', fontWeight: '900' }} title="Correct Key">{cAns}</span>
                          <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>/</span>
                          <span style={{ fontWeight: '900', color: isCorrect ? '#16a34a' : isLeft ? '#64748b' : '#ef4444' }} title="Student Response">
                            {displayAns}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>

          </div>
        ) : (
          /* Landing Dashboard Overview screen */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {(() => {
              const storedJson = localStorage.getItem('omr_custom_settings');
              let titleFontSize = 14;
              let addressFontSize = 11;
              let contactFontSize = 11;
              if (storedJson) {
                try {
                  const parsed = JSON.parse(storedJson);
                  if (parsed.pdfTitleFontSize) titleFontSize = Math.max(12, parsed.pdfTitleFontSize - 1);
                  if (parsed.pdfAddressFontSize) addressFontSize = Math.max(10, parsed.pdfAddressFontSize);
                  if (parsed.pdfContactFontSize) contactFontSize = Math.max(10, parsed.pdfContactFontSize);
                } catch (e) {}
              }

              return (
                <>
                  {/* Top Branding Header (matches printable A4 report branding) */}
                  <header style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <img src="/logo.png" alt="APEX Logo" style={{ height: `${logoHeight + 16}px`, width: 'auto', objectFit: 'contain' }} />
                      <img src="/logo_name.png" alt="Institute APEX" style={{ height: `${logoNameHeight + 10}px`, width: 'auto', objectFit: 'contain' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: `${titleFontSize}px`, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Institute of Medical Entrance Exams (NEET) & IIT-JEE Coaching
                      </div>
                      <div style={{ fontSize: `${addressFontSize}px`, fontWeight: 600, color: '#475569' }}>
                        #1257, Urban State, Near HUDA Ground, Jind- 126102 (Haryana)
                      </div>
                      <div style={{ fontSize: `${contactFontSize}px`, fontWeight: 600, color: '#64748b' }}>
                        Call : 9467752374, Email: instituteapexjind@gmail.com
                      </div>
                    </div>
                  </header>

                  {/* Candidate Info sub-bar with Portal Navigation and Logout */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.03)'
                  }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', fontWeight: 800, padding: '4px 12px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'inline-block', marginBottom: '6px' }}>Candidate Hub</span>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                        Welcome back, <strong style={{ color: '#0f172a' }}>{student.name}</strong> {student.fatherName ? `(Father: ${student.fatherName})` : ''} | Roll ID: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{student.studentNum}</code> | Target Stream: <strong style={{ color: '#0f172a' }}>{student.className}</strong>
                      </p>
                    </div>

                    {/* Tab Navigation & Logout button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '4px', gap: '4px' }}>
                        <button
                          onClick={() => setActiveTab('exams')}
                          style={{
                            border: 'none',
                            background: activeTab === 'exams' ? '#ffffff' : 'transparent',
                            color: activeTab === 'exams' ? '#2563eb' : '#64748b',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'exams' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <BookOpen size={14} /> Exam Reports
                        </button>
                        <button
                          onClick={() => setActiveTab('attendance')}
                          style={{
                            border: 'none',
                            background: activeTab === 'attendance' ? '#ffffff' : 'transparent',
                            color: activeTab === 'attendance' ? '#2563eb' : '#64748b',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'attendance' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Calendar size={14} /> Attendance
                        </button>
                        <button
                          onClick={() => setActiveTab('online-exams')}
                          style={{
                            border: 'none',
                            background: activeTab === 'online-exams' ? '#ffffff' : 'transparent',
                            color: activeTab === 'online-exams' ? '#2563eb' : '#64748b',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'online-exams' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Activity size={14} /> Online Exams
                        </button>
                      </div>

                      <button 
                        onClick={adminMode ? onClose : onLogout}
                        style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 20px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', transition: 'all 0.2s ease', outline: 'none' }}
                      >
                        {adminMode ? <ChevronLeft size={16} /> : <LogOut size={16} />} {adminMode ? 'Close Analysis' : 'Log Out'}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}

            {activeTab === 'exams' && (
              <>

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
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total marks achieved</span>
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
                  
                  {/* Desktop Table View */}
                  <div className="desktop-roster-table-view" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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

                  {/* Mobile Roster Cards View */}
                  <div className="mobile-roster-cards-view">
                    {studentHistory.map((sub, idx) => {
                      const maxScore = sub.exam.numQuestions * (sub.exam.correctMarks || 4);
                      const pct = maxScore > 0 ? Math.round((sub.score / maxScore) * 100) : 0;
                      const diffFromAvg = Math.round((sub.score - sub.classAvg) * 10) / 10;
                      const aboveAvg = diffFromAvg >= 0;

                      return (
                        <div key={`m-roster-${idx}`} className="mobile-exam-item-card">
                          <div className="card-header-line">
                            <div>
                              <h4 className="exam-card-title">{sub.exam.title}</h4>
                              <div className="sub-meta-row">
                                <span className="meta-text"><Calendar size={12} /> {new Date(sub.exam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                                <span className={`type-badge ${sub.attemptType === 'Online' ? 'online' : 'omr'}`}>
                                  {sub.attemptType || 'OMR'}
                                </span>
                              </div>
                            </div>
                            <span className="rank-badge-pill">Rank #{sub.studentRank}</span>
                          </div>

                          <div className="stats-grid-row">
                            <div className="stat-box">
                              <span className="lbl">Score</span>
                              <span className="val">{sub.score} <small>/ {maxScore}</small></span>
                            </div>
                            <div className="stat-box">
                              <span className="lbl">Class Avg</span>
                              <span className="val">{sub.classAvg} <small style={{ color: aboveAvg ? '#16a34a' : '#dc2626' }}>({aboveAvg ? '+' : ''}{diffFromAvg})</small></span>
                            </div>
                            <div className="stat-box">
                              <span className="lbl">Accuracy</span>
                              <span className="val">{pct}%</span>
                            </div>
                          </div>

                          <div className="card-action-row">
                            <button className="btn-view-analysis-mobile" onClick={() => setActiveAnalysisSub(sub)}>
                              View Analysis
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
          </>
        )}

        {activeTab === 'attendance' && (
              /* Attendance View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {(() => {
                  const totalDays = studentAttendance.length;
                  const presentCount = studentAttendance.filter(a => a.status === 'Present').length;
                  const absentCount = studentAttendance.filter(a => a.status === 'Absent').length;
                  const attendancePct = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;

                  // Sort attendance by date descending
                  const sortedAttendance = [...studentAttendance].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  return (
                    <>
                      {/* Attendance KPI Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attendance Percentage</span>
                            <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.8rem', fontWeight: 900, color: attendancePct >= 75 ? '#16a34a' : '#ea580c' }}>{attendancePct}%</h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{attendancePct >= 75 ? 'Excellent standing' : 'Low attendance (Required >= 75%)'}</span>
                          </div>
                          <div style={{ background: attendancePct >= 75 ? '#dcfce7' : '#fee2e2', color: attendancePct >= 75 ? '#16a34a' : '#ef4444', padding: '12px', borderRadius: '12px' }}>
                            <CheckCircle2 size={24} />
                          </div>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Days Present</span>
                            <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.8rem', fontWeight: 900, color: '#16a34a' }}>{presentCount} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 'normal' }}>/ {totalDays}</span></h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Classes & exams attended</span>
                          </div>
                          <div style={{ background: '#dcfce7', color: '#16a34a', padding: '12px', borderRadius: '12px' }}>
                            <Users size={24} />
                          </div>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Days Absent</span>
                            <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.8rem', fontWeight: 900, color: '#ef4444' }}>{absentCount}</h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Unexcused absences</span>
                          </div>
                          <div style={{ background: '#fee2e2', color: '#ef4444', padding: '12px', borderRadius: '12px' }}>
                            <X size={24} />
                          </div>
                        </div>
                      </div>

                      {/* Daily Log list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Daily Attendance Log</h3>
                        
                        {sortedAttendance.length === 0 ? (
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '36px', textAlign: 'center', color: '#64748b' }}>
                            No attendance records found for your account.
                          </div>
                        ) : (
                          <>
                            {/* Desktop Table View */}
                            <div className="desktop-attendance-table-view" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                <thead>
                                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 800 }}>
                                    <th style={{ padding: '18px 24px' }}>Date</th>
                                    <th style={{ padding: '18px 20px' }}>Status</th>
                                    <th style={{ padding: '18px 20px' }}>Method</th>
                                    <th style={{ padding: '18px 20px' }}>Class</th>
                                    <th style={{ padding: '18px 24px' }}>Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedAttendance.map((rec) => (
                                    <tr key={rec.id || rec.date} style={{ borderBottom: '1px solid #edf2f7' }}>
                                      <td style={{ padding: '18px 24px', fontWeight: 700, color: '#0f172a' }}>
                                        {new Date(rec.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                      </td>
                                      <td style={{ padding: '18px 20px' }}>
                                        <span style={{
                                          padding: '4px 10px',
                                          borderRadius: '20px',
                                          fontSize: '0.72rem',
                                          fontWeight: 800,
                                          background: rec.status === 'Present' ? '#dcfce7' : rec.status === 'Absent' ? '#fee2e2' : '#fef3c7',
                                          color: rec.status === 'Present' ? '#15803d' : rec.status === 'Absent' ? '#b91c1c' : '#b45309'
                                        }}>
                                          {rec.status}
                                        </span>
                                      </td>
                                      <td style={{ padding: '18px 20px', color: '#475569', fontWeight: 600 }}>{rec.attendanceMethod || 'Manual'}</td>
                                      <td style={{ padding: '18px 20px', color: '#475569' }}>{rec.className}</td>
                                      <td style={{ padding: '18px 24px', color: '#64748b' }}>{rec.remarks || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Mobile Cards List */}
                            <div className="mobile-attendance-cards-view" style={{ flexDirection: 'column', gap: '12px' }}>
                              {sortedAttendance.map((rec) => (
                                <div key={`m-att-${rec.id || rec.date}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                  <div>
                                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem', marginBottom: '4px' }}>
                                      {new Date(rec.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                      Method: {rec.attendanceMethod || 'Manual'} | Class: {rec.className} {rec.remarks ? `| Remarks: ${rec.remarks}` : ''}
                                    </div>
                                  </div>
                                  <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    background: rec.status === 'Present' ? '#dcfce7' : rec.status === 'Absent' ? '#fee2e2' : '#fef3c7',
                                    color: rec.status === 'Present' ? '#15803d' : rec.status === 'Absent' ? '#b91c1c' : '#b45309'
                                  }}>
                                    {rec.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {activeTab === 'online-exams' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Live & Upcoming Exams</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>Take online exams configured for your target class: {student?.className}</p>
                  </div>
                </div>

                {onlineExams.length === 0 ? (
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '48px', textAlign: 'center', color: '#64748b' }}>
                    <BookOpen size={36} style={{ color: '#94a3b8', marginBottom: '12px' }} />
                    <p style={{ margin: 0, fontWeight: 'bold' }}>No online exams available</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>There are currently no active or scheduled online exams for your class.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {onlineExams.map(exam => {
                      const hasSubmitted = submissions.some(sub => sub.examId === exam.id);
                      const startsAtDate = exam.startsAt ? new Date(exam.startsAt) : null;
                      const isUpcoming = startsAtDate && startsAtDate.getTime() > Date.now();

                      return (
                        <div 
                          key={exam.id} 
                          style={{ 
                            background: '#fff', 
                            border: '1px solid #e2e8f0', 
                            borderRadius: '16px', 
                            padding: '24px', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            justifyContent: 'space-between', 
                            boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
                            position: 'relative'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                              <span style={{ 
                                fontSize: '0.72rem', 
                                background: hasSubmitted ? '#dcfce7' : isUpcoming ? '#fef3c7' : '#dbeafe', 
                                color: hasSubmitted ? '#15803d' : isUpcoming ? '#b45309' : '#2563eb', 
                                fontWeight: 800, 
                                padding: '4px 10px', 
                                borderRadius: '12px',
                                textTransform: 'uppercase'
                              }}>
                                {hasSubmitted ? 'Completed' : isUpcoming ? 'Upcoming' : 'Active Now'}
                              </span>
                              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold' }}>{exam.numQuestions} Questions</span>
                            </div>

                            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{exam.title}</h4>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: '#475569', marginBottom: '18px' }}>
                              {exam.durationMins && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Clock size={13} style={{ color: '#94a3b8' }} />
                                  <span>Duration: <strong>{exam.durationMins} Mins</strong></span>
                                </div>
                              )}
                              {startsAtDate && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Calendar size={13} style={{ color: '#94a3b8' }} />
                                  <span>Starts: <strong>{startsAtDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            {hasSubmitted ? (
                              <button 
                                disabled 
                                style={{ 
                                  width: '100%', 
                                  padding: '10px', 
                                  borderRadius: '10px', 
                                  background: '#f1f5f9', 
                                  color: '#94a3b8', 
                                  border: 'none', 
                                  fontWeight: 'bold', 
                                  fontSize: '0.85rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px'
                                }}
                              >
                                <Check size={16} /> Exam Submitted
                              </button>
                            ) : isUpcoming ? (
                              <button 
                                disabled 
                                style={{ 
                                  width: '100%', 
                                  padding: '10px', 
                                  borderRadius: '10px', 
                                  background: '#f8fafc', 
                                  color: '#64748b', 
                                  border: '1px solid #e2e8f0', 
                                  fontWeight: 'bold', 
                                  fontSize: '0.85rem'
                                }}
                              >
                                Upcoming Exam
                              </button>
                            ) : (
                              <button 
                                onClick={() => onStartExam && onStartExam(exam.id!)}
                                style={{ 
                                  width: '100%', 
                                  padding: '10px', 
                                  borderRadius: '10px', 
                                  background: 'var(--primary)', 
                                  color: '#fff', 
                                  border: 'none', 
                                  fontWeight: 'bold', 
                                  fontSize: '0.85rem',
                                  cursor: 'pointer',
                                  boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)',
                                  transition: 'background 0.2s'
                                }}
                              >
                                Start Exam
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>

      {/* Responsive mobile stylesheet overrides */}
      <style>{`
        .print-only {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: 210mm !important;
          height: auto !important;
          overflow: visible !important;
          display: block !important;
          z-index: -9999 !important;
        }

        .pdf-loading-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #e2e8f0;
          border-top: 4px solid #16a34a;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Result portal buttons styles */
        .dashboard-header-buttons {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          width: 100%;
        }

        .dashboard-back-btn-group, .dashboard-actions-btn-group {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .dashboard-back-btn-group button, .dashboard-actions-btn-group button {
          font-size: 0.8rem;
          font-weight: bold;
          border-radius: 8px;
          padding: 8.5px 15px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .report-portal-brand-header {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
        }

        .brand-logos-container {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .desktop-attendance-table-view {
          display: block;
        }
        .mobile-attendance-cards-view {
          display: none;
        }
        @media (max-width: 768px) {
          .desktop-attendance-table-view {
            display: none !important;
          }
          .mobile-attendance-cards-view {
            display: flex !important;
          }
        }

        @media (max-width: 768px) {
          .dashboard-header-buttons {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .dashboard-back-btn-group, .dashboard-actions-btn-group {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)) !important;
            gap: 8px !important;
          }
          .dashboard-back-btn-group button, .dashboard-actions-btn-group button {
            width: 100% !important;
            justify-content: center !important;
            font-size: 0.76rem !important;
            padding: 10px 8px !important;
            border-radius: 8px !important;
          }
          .report-portal-brand-header {
            flex-direction: column !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 14px 16px !important;
            text-align: center !important;
          }
          .brand-logos-container {
            justify-content: center !important;
          }
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
        @media (max-width: 768px) {
          .student-analysis-split table th, 
          .student-analysis-split table td {
            padding: 8px 10px !important;
            font-size: 0.75rem !important;
          }
          .student-dashboard-split table th, 
          .student-dashboard-split table td {
            padding: 10px 12px !important;
            font-size: 0.75rem !important;
          }
          .grade-badge {
            padding: 2px 4px !important;
            font-size: 0.7rem !important;
          }
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            position: static !important;
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
            display: block !important;
          }
        }
        @keyframes omrModalFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Online Submission Questions & Responses Overlay */}
      {showOnlineViewer && activeAnalysisSub && (
        <OnlineSubmissionViewer
          exam={activeAnalysisSub.exam}
          submission={activeAnalysisSub}
          studentName={student.fatherName ? `${student.name} (Father: ${student.fatherName})` : student.name}
          onClose={() => setShowOnlineViewer(false)}
        />
      )}

    </div>
  );
};

/**
 * Helper to determine section name from question number indices.
 * Aligns perfectly with OMR seeder/test specifications.
 */
function getQuestionSection(qIndex: number, exam: Exam): string {
  if (exam.sections && exam.sections.length > 0) {
    let currentQStart = 1;
    for (const sec of exam.sections) {
      const qStart = sec.qStart || currentQStart;
      const qCount = sec.qCount || 0;
      const qEnd = qStart + qCount - 1;
      currentQStart = qEnd + 1;
      if (qIndex >= qStart && qIndex <= qEnd) {
        return sec.subjectName && sec.sectionName ? `${sec.subjectName} - ${sec.sectionName}` : (sec.subjectName || sec.sectionName || 'General');
      }
    }
  }

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
