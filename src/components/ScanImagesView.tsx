import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera,
  ArrowLeft,
  RotateCcw, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  RefreshCw,
  Eye,
  Search,
  FileText,
  Zap,
  AlertTriangle,
  Edit3,
  X,
  UserCheck,
  CheckCircle
} from 'lucide-react';
import { db, type Exam, type Student, type ExamSubmission } from '../db';
import { scanOMRSheet, findOMRSheetCornersInROI, getDynamicOMRQuestionLayout, getColumnSlots, isAnswerMatch } from '../utils/omrScanner';
import confetti from 'canvas-confetti';
import { syncSubmissionToCloud, pullCloudUpdatesToIndexedDB } from '../utils/cloudSync';
import { FullScreenOmrViewer } from './FullScreenOmrViewer';
import { EvalbeeResultModal, EvalbeeQuestionBubbleEditorModal, type EvalbeeScanData } from './EvalbeeScanModals';

// Helper function to draw green/red overlays on scanned OMR image bubbles & yellow overlay on roll number
function drawOverlayOnWarpedCanvas(
  canvas: HTMLCanvasElement,
  numQuestions: number,
  answers: Record<number, string>,
  correctKey: Record<number, string>,
  bestDy: number,
  sections: any[],
  questionOffsets?: Record<number, { dx: number; dy: number }>,
  detectedRollNum?: string,
  rollNoDigits?: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const qConf = getDynamicOMRQuestionLayout(numQuestions, undefined, 'auto', sections);
  const bubbleRadius = qConf.bubbleRadius || 6.5;

  for (let q = 1; q <= numQuestions; q++) {
    let colConf = null;
    for (const col of qConf.columns) {
      if (q >= col.qStart && q <= col.qEnd) {
        colConf = col;
        break;
      }
    }
    if (!colConf) continue;

    const sec = sections.find((s: any) => q >= s.qStart && q < s.qStart + s.qCount);
    const is5Option = sec && sec.questionType === '5 option';
    const numOptions = is5Option ? 5 : 4;

    const slots = getColumnSlots(colConf.qStart, colConf.qEnd, sections, numQuestions);
    const qSlot = slots.find(s => s.type === 'question' && s.qNum === q);
    if (!qSlot) continue;
    const slotIndex = qSlot.slotIdx;

    const offset = questionOffsets?.[q] || { dx: 0, dy: 0 };
    const rawY = colConf.yStart + slotIndex * qConf.yStep + offset.dy;

    const studentAns = answers[q] || '';
    const correctAns = correctKey[q] || '';
    const studentPicks = studentAns.split(',').map(s => s.trim()).filter(Boolean);
    const isMultiplePicks = studentPicks.length > 1;

    const optionChars = ['A', 'B', 'C', 'D', 'E'];

    for (let optIdx = 0; optIdx < numOptions; optIdx++) {
      const optChar = optionChars[optIdx];
      const approxX = (optIdx === 4 ? colConf.xOptions[3] + 25 : colConf.xOptions[optIdx]) + offset.dx;

      const finalX = approxX;
      const finalY = rawY;

      const isStudentPick = studentPicks.includes(optChar);
      const isCorrectOption = correctAns === optChar;

      if (isStudentPick) {
        if (!isMultiplePicks && studentAns === correctAns) {
          // Exactly 1 bubble filled and it matches the correct answer: Solid Green
          ctx.beginPath();
          ctx.arc(finalX, finalY, bubbleRadius + 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
          ctx.fill();
          ctx.strokeStyle = '#16a34a';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // Incorrect single choice OR multiple bubbles filled (invalid attempt): Solid Red
          ctx.beginPath();
          ctx.arc(finalX, finalY, bubbleRadius + 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
          ctx.fill();
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (isCorrectOption && studentAns !== '') {
        // Correct answer outline when student made a mistake (wrong or multiple): thin green outline
        ctx.beginPath();
        ctx.arc(finalX, finalY, bubbleRadius + 1.5, 0, 2 * Math.PI);
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Light blue circle for every bubble position (unattempted / not-picked options)
        ctx.beginPath();
        ctx.arc(finalX, finalY, bubbleRadius + 1, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  // Draw Golden Yellow overlay on detected Roll Number bubbles
  if (detectedRollNum && detectedRollNum.trim() !== '') {
    const numDigits = Math.min(detectedRollNum.length, rollNoDigits ?? 3);
    const col0Width = qConf.colWidth;
    const col0Center = (qConf.gridLeft || 70) + 0.5 * col0Width;
    const rollXStep = qConf.rollXStep || (qConf.numCols <= 2 ? 40 : (qConf.numCols === 3 ? 34 : 30));
    const rollTotalWidth = (numDigits - 1) * rollXStep;
    const rollFirstX = col0Center - 0.5 * rollTotalWidth;
    const rollYStep = qConf.rollYStep || (qConf.numCols <= 2 ? 24 : (qConf.numCols === 3 ? 22 : 20));

    const digitValuesList = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const rollDx = questionOffsets?.[1]?.dx || 0;

    for (let colIdx = 0; colIdx < numDigits; colIdx++) {
      const char = detectedRollNum[colIdx];
      const digitVal = parseInt(char, 10);
      if (isNaN(digitVal)) continue;
      const rowIdx = digitValuesList.indexOf(digitVal);
      if (rowIdx === -1) continue;

      const approxX = rollFirstX + colIdx * rollXStep + rollDx;
      const approxY = 188 + rowIdx * rollYStep + bestDy;

      const finalX = approxX;
      const finalY = approxY;

      ctx.beginPath();
      ctx.arc(finalX, finalY, bubbleRadius + 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.55)'; // Golden yellow fill
      ctx.fill();
      ctx.strokeStyle = '#ca8a04'; // Gold border
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

interface ScanImagesViewProps {
  exam: Exam;
  students: Student[];
  onClose: () => void;
}

interface ScanFileItem {
  id: string;
  name: string;
  file?: File;
  previewUrl: string;
  status: 'Pending' | 'Scanning' | 'Scanned' | 'Failed';
  result?: any;
}

export const ScanImagesView: React.FC<ScanImagesViewProps> = ({ exam, students, onClose }) => {
  const [fileList, setFileList] = useState<ScanFileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<string | null>(null);
  const [scanningProgress, setScanningProgress] = useState<number>(0);
  const [cvLoaded, setCvLoaded] = useState(false);

  // Scanned Submissions & Full-Screen View Sheets Mode
  const [existingSubmissions, setExistingSubmissions] = useState<ExamSubmission[]>([]);
  const [showScannedSheetsFullScreen, setShowScannedSheetsFullScreen] = useState(false);
  const [scannedSheetSearch, setScannedSheetSearch] = useState('');
  const [viewingOmrModalUrl, setViewingOmrModalUrl] = useState<{ name: string; url?: string; score: number; answers?: Record<number, string>; correctCount?: number; wrongCount?: number; bookletSet?: string } | null>(null);
  const [editingSubmission, setEditingSubmission] = useState<ExamSubmission | null>(null);

  // Camera Modal States & Refs
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisRequestRef = useRef<number | null>(null);
  const [detectorStatus, setDetectorStatus] = useState<'searching' | 'aligning' | 'ready' | 'invalid-length'>('searching');

  const isScanningRef = useRef<boolean>(false);
  const stableFramesRef = useRef<number>(0);
  const prevCornersRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const lockStartTimeRef = useRef<number | null>(null);
  const lastCornerCheckTimeRef = useRef<number>(0);
  const smoothedCornersRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const cornerLostCountRef = useRef<number>(0);
  const lastCaptureTimeRef = useRef<number>(0);
  const [_cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Registered students in this exam's class limit validation
  const [lastScanOverlay, setLastScanOverlay] = useState<{ 
    studentName: string; 
    studentNum: string; 
    score: number; 
    correctCount: number; 
    wrongCount: number; 
    unansweredCount: number;
    answers: Record<number, string>;
    bookletSet: string;
    omrImageUrl: string;
    studentId: number | null;
    tempStudentId?: number;
    rawTranscribedName?: string;
    rawTranscribedFatherName?: string;
  } | null>(null);

  // Duplicate scanned sheet warning popup state
  const [duplicateWarning, setDuplicateWarning] = useState<{
    existingSubmission: ExamSubmission;
    existingStudentName: string;
    detectedRollNum: string;
    newScanData: {
      score: number;
      correctCount: number;
      wrongCount: number;
      unansweredCount: number;
      answers: Record<number, string>;
      bookletSet: string;
      omrImageUrl: string;
      studentId: number | null;
      rawTranscribedName?: string;
      rawTranscribedFatherName?: string;
    };
  } | null>(null);
  const [editRollInput, setEditRollInput] = useState<string>('');
  const [isEditingRollInDuplicateModal, setIsEditingRollInDuplicateModal] = useState<boolean>(false);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);

  // Evalbee Workflow Review and Visual Question Bubble Editor State
  const [evalbeeReviewData, setEvalbeeReviewData] = useState<EvalbeeScanData | null>(null);
  const [isEditingEvalbeeBubbles, setIsEditingEvalbeeBubbles] = useState<boolean>(false);

  // Auto-Save Mode & Persistent Bottom Candidate Scorecard
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    return localStorage.getItem('omr_auto_save_mode') === 'true';
  });
  const [lastScannedStudentBar, setLastScannedStudentBar] = useState<EvalbeeScanData | null>(null);
  const [autoSaveFlash, setAutoSaveFlash] = useState<boolean>(false);

  const toggleAutoSave = () => {
    const nextVal = !autoSaveEnabled;
    setAutoSaveEnabled(nextVal);
    localStorage.setItem('omr_auto_save_mode', String(nextVal));
  };

  const classStudents = students.filter(s => s.className === exam.className);
  const maxClassSheets = classStudents.length > 0 ? classStudents.length : Infinity;
  const scannedCount = existingSubmissions.length;
  const isClassLimitReached = maxClassSheets !== Infinity && (fileList.length >= maxClassSheets || scannedCount >= maxClassSheets);

  const refreshSubmissions = async () => {
    try {
      const subs = await db.submissions.where('examId').equals(exam.id!).toArray();
      const map = new Map<number, ExamSubmission>();
      subs.forEach(s => {
        // Strip heavy base64 omrImageUrl from in-memory list to keep React memory under 5MB on mobile
        const lightweightSub = { ...s, omrImageUrl: '' };
        if (!map.has(s.studentId) || (s.id && s.id > (map.get(s.studentId)?.id || 0))) {
          map.set(s.studentId, lightweightSub);
        }
      });
      setExistingSubmissions(Array.from(map.values()));
    } catch (e) {
      console.warn("Error loading submissions:", e);
    }
  };

  useEffect(() => {
    refreshSubmissions();
  }, [exam.id, fileList.length]);

  // Clear any temporary unknown candidate submissions (studentId < 0) for this exam on screen mount/refresh
  useEffect(() => {
    const clearUnknownSubmissions = async () => {
      if (exam.id) {
        try {
          const subs = await db.submissions.where('examId').equals(exam.id).toArray();
          const unknownSubs = subs.filter(s => s.studentId < 0);
          if (unknownSubs.length > 0) {
            for (const sub of unknownSubs) {
              if (sub.id) {
                await db.submissions.delete(sub.id);
              }
            }
            refreshSubmissions();
          }
        } catch (err) {
          console.warn("Error clearing unknown submissions on mount:", err);
        }
      }
    };
    clearUnknownSubmissions();
  }, [exam.id]);

  // Helper to persist scanned submission to IndexedDB and Cloud sync
  const saveScannedSubmission = async (
    targetStudentId: number,
    detectedRoll: string,
    score: number,
    answers: Record<number, string>,
    bookletSet: string,
    croppedUrl: string,
    matchedStudentName: string,
    correctCount: number,
    wrongCount: number,
    unansweredCount: number,
    rawName?: string,
    rawFather?: string
  ) => {
    if (exam.id) {
      try {
        await db.submissions.where('[examId+studentId]').equals([exam.id, targetStudentId]).delete();
        const subId = await db.submissions.add({
          examId: exam.id!,
          studentId: targetStudentId,
          score: score,
          answers: answers,
          bookletSet: bookletSet,
          omrImageUrl: croppedUrl,
          scannedAt: new Date(),
          detectedRollNum: detectedRoll || ''
        });

        const savedSub = await db.submissions.get(subId);
        if (savedSub && targetStudentId > 0) {
          syncSubmissionToCloud(savedSub).catch(console.warn);
        }
        pullCloudUpdatesToIndexedDB();
        refreshSubmissions();
      } catch (saveErr) {
        console.error("Auto-save error:", saveErr);
      }
    }

    setLastScanOverlay({
      studentName: matchedStudentName,
      studentNum: detectedRoll || '',
      score,
      correctCount,
      wrongCount,
      unansweredCount,
      answers: answers,
      bookletSet: bookletSet,
      omrImageUrl: croppedUrl,
      studentId: targetStudentId > 0 ? targetStudentId : null,
      tempStudentId: targetStudentId < 0 ? targetStudentId : undefined,
      rawTranscribedName: rawName,
      rawTranscribedFatherName: rawFather
    });

    if (targetStudentId > 0) {
      confetti({ particleCount: 60, spread: 60 });
    }
  };

  const handleSaveEvalbeeScan = async (dataToSave: EvalbeeScanData) => {
    try {
      const cleanRoll = (dataToSave.studentNum || '').trim().replace(/^0+/, '');
      const classStudents = students.filter(s => s.className === exam.className);
      const matchedStudent = cleanRoll
        ? classStudents.find(s => s.studentNum.replace(/^0+/, '') === cleanRoll)
        : null;

      const targetStudentId = matchedStudent?.id ?? (dataToSave.studentId || -(Date.now() + Math.floor(Math.random() * 1000)));
      const scanResultName = matchedStudent ? matchedStudent.name : (dataToSave.studentNum ? `Student (Roll ${dataToSave.studentNum})` : 'Unknown Candidate');

      await saveScannedSubmission(
        targetStudentId,
        dataToSave.studentNum || '',
        dataToSave.score,
        dataToSave.answers,
        dataToSave.bookletSet,
        dataToSave.omrImageUrl,
        scanResultName,
        dataToSave.correctCount,
        dataToSave.wrongCount,
        dataToSave.unansweredCount
      );

      setLastScannedStudentBar(dataToSave);

      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.8 }
      });

      setEvalbeeReviewData(null);
      setIsEditingEvalbeeBubbles(false);
      lastCaptureTimeRef.current = Date.now();

      // Automatically re-open camera so it is immediately ready for next scan!
      setShowCameraModal(true);
    } catch (err: any) {
      alert("Failed to save scan: " + (err.message || err));
    }
  };

  // Duplicate Warning Modal Actions
  const handleOverwriteDuplicate = async () => {
    if (!duplicateWarning) return;
    const { newScanData, detectedRollNum } = duplicateWarning;
    const targetStudentId = newScanData.studentId || duplicateWarning.existingSubmission.studentId || -(Date.now() + Math.floor(Math.random() * 1000));
    const matchedSt = students.find(s => s.id === targetStudentId);
    const displayName = matchedSt ? matchedSt.name : (duplicateWarning.existingStudentName || 'Student');

    await saveScannedSubmission(
      targetStudentId,
      detectedRollNum,
      newScanData.score,
      newScanData.answers,
      newScanData.bookletSet,
      newScanData.omrImageUrl,
      displayName,
      newScanData.correctCount,
      newScanData.wrongCount,
      newScanData.unansweredCount,
      newScanData.rawTranscribedName,
      newScanData.rawTranscribedFatherName
    );
    setDuplicateWarning(null);
  };

  const handleSaveWithNewRoll = async () => {
    if (!duplicateWarning) return;
    const stripLeadingZeros = (val: string) => {
      const cleaned = val.replace(/^0+/, '');
      return cleaned === '' ? '0' : cleaned;
    };
    const newRoll = stripLeadingZeros(editRollInput.trim());
    if (!newRoll) {
      alert("Please enter a valid roll number.");
      return;
    }

    const classSts = students.filter(s => s.className === exam.className);
    const matchedStudent = classSts.find(s => stripLeadingZeros(s.studentNum) === newRoll);
    const targetStudentId = (matchedStudent && matchedStudent.id !== undefined) ? matchedStudent.id : -(Date.now() + Math.floor(Math.random() * 1000));
    const displayName = matchedStudent ? matchedStudent.name : `Roll ${newRoll} (Unregistered)`;
    const { newScanData } = duplicateWarning;

    await saveScannedSubmission(
      targetStudentId,
      newRoll,
      newScanData.score,
      newScanData.answers,
      newScanData.bookletSet,
      newScanData.omrImageUrl,
      displayName,
      newScanData.correctCount,
      newScanData.wrongCount,
      newScanData.unansweredCount,
      newScanData.rawTranscribedName,
      newScanData.rawTranscribedFatherName
    );
    setDuplicateWarning(null);
  };

  const handleDiscardDuplicate = () => {
    setDuplicateWarning(null);
  };

  // Canvas View Controls
  const [rotation, setRotation] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);

  // Scanned verification states
  const [activeResult, setActiveResult] = useState<any | null>(null);
  const [detectedStudentId, setDetectedStudentId] = useState<number | null>(null);

  // Check OpenCV loaded
  useEffect(() => {
    const checkCV = () => {
      if ((window as any).cv) {
        setCvLoaded(true);
      } else {
        setTimeout(checkCV, 100);
      }
    };
    checkCV();
  }, []);

  // Play shutter sound feedback (synthesizing a realistic mechanical camera click)
  const playShutterSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create white noise buffer for shutter mechanical slaps
      const bufferSize = audioCtx.sampleRate * 0.12; // 120ms
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      // Shutter opening click (metallic noise burst)
      const noise1 = audioCtx.createBufferSource();
      noise1.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, audioCtx.currentTime);
      filter.Q.setValueAtTime(3.5, audioCtx.currentTime);
      
      const gain1 = audioCtx.createGain();
      gain1.gain.setValueAtTime(0.85, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
      
      noise1.connect(filter);
      filter.connect(gain1);
      gain1.connect(audioCtx.destination);
      noise1.start();
      
      // Shutter closing click (mechanical slap slightly delayed)
      const noise2 = audioCtx.createBufferSource();
      noise2.buffer = buffer;
      
      const gain2 = audioCtx.createGain();
      gain2.gain.setValueAtTime(0.0, audioCtx.currentTime);
      gain2.gain.setValueAtTime(0.65, audioCtx.currentTime + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.09);
      
      noise2.connect(filter);
      filter.connect(gain2);
      gain2.connect(audioCtx.destination);
      noise2.start(audioCtx.currentTime + 0.04);
      
      // Oscillator for high frequency metallic click transient
      const osc = audioCtx.createOscillator();
      const oscGain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.02);
      
      oscGain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.02);
      
      osc.connect(oscGain);
      oscGain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.025);
    } catch {}
  };

  // Real-time sheet contour tracker
  const runCameraAnalysisLoop = () => {
    if (lastScanOverlay) {
      const canvas = overlayCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setDetectorStatus('searching');
      stableFramesRef.current = 0;
      analysisRequestRef.current = requestAnimationFrame(runCameraAnalysisLoop);
      return;
    }

    if (!videoRef.current || !overlayCanvasRef.current || !cvLoaded) {
      analysisRequestRef.current = requestAnimationFrame(runCameraAnalysisLoop);
      return;
    }

    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const vW = video.videoWidth;
      const vH = video.videoHeight;
      
      // Ensure canvas internal buffer matches video resolution
      if (canvas.width !== vW || canvas.height !== vH) {
        canvas.width = vW;
        canvas.height = vH;
      }
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, vW, vH);
        
        const now = Date.now();

        // 3-Second Snap Cooldown Guard
        const timeSinceLastSnap = now - lastCaptureTimeRef.current;
        const cooldownLeft = Math.max(0, Math.ceil((3000 - timeSinceLastSnap) / 1000));
        setCooldownSeconds(cooldownLeft);

        if (cooldownLeft > 0) {
          lockStartTimeRef.current = null;
          setDetectorStatus('aligning');
          
          // Draw prominent cooldown countdown pill in center
          const cx = vW / 2;
          const cy = vH / 2;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
          ctx.beginPath();
          ctx.roundRect(cx - 95, cy - 24, 190, 48, 24);
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`⏳ Next Snap in ${cooldownLeft}s...`, cx, cy);

          analysisRequestRef.current = requestAnimationFrame(runCameraAnalysisLoop);
          return;
        }

        // ── Compute 4 Corner Viewfinder Boxes (Accurately Proportioned to Dynamic Sheet Layout) ──
        const numQ = exam?.numQuestions || 100;
        const dynamicLayout = getDynamicOMRQuestionLayout(numQ, undefined, 'auto', exam?.sections);
        const sheetGridAspect = (dynamicLayout.bottomAnchorY - dynamicLayout.topAnchorY) / (dynamicLayout.gridRight - dynamicLayout.gridLeft);

        const frameW = Math.round(vW * 0.76);
        const frameH = Math.min(Math.round(vH * 0.82), Math.round(frameW * sheetGridAspect));
        const startX = Math.round((vW - frameW) / 2);
        const startY = Math.round((vH - frameH) / 2);
        
        const boxSize = Math.round(frameW * 0.18);
        const halfBox = Math.round(boxSize / 2);
        const cornerOffset = Math.round(frameW * 0.035);

        const rois = {
          tl: { x: startX + cornerOffset - halfBox, y: startY + cornerOffset - halfBox, width: boxSize, height: boxSize },
          tr: { x: startX + frameW - cornerOffset - halfBox, y: startY + cornerOffset - halfBox, width: boxSize, height: boxSize },
          bl: { x: startX + cornerOffset - halfBox, y: startY + frameH - cornerOffset - halfBox, width: boxSize, height: boxSize },
          br: { x: startX + frameW - cornerOffset - halfBox, y: startY + frameH - cornerOffset - halfBox, width: boxSize, height: boxSize }
        };

        // ── Always Draw 4 Blue Viewfinder Corner Boxes ──
        [rois.tl, rois.tr, rois.bl, rois.br].forEach(b => {
          ctx.save();
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 3;
          ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
          ctx.beginPath();
          ctx.rect(b.x, b.y, b.width, b.height);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });

        // Run corner detection strictly INSIDE the 4 ROI Boxes (every 40ms)
        try {
          if (now - lastCornerCheckTimeRef.current > 40) {
            lastCornerCheckTimeRef.current = now;
            const roiRes = findOMRSheetCornersInROI(video, rois, exam.numQuestions || 100);
            
            if (roiRes && roiRes.allFound && roiRes.corners) {
              cornerLostCountRef.current = 0;
              const freshCorners = roiRes.corners;
              if (!smoothedCornersRef.current) {
                smoothedCornersRef.current = freshCorners.map(p => ({ ...p }));
              } else {
                // Stable low-pass filter (prevents rapid jitter/jumping)
                smoothedCornersRef.current = smoothedCornersRef.current.map((s, idx) => {
                  const target = freshCorners[idx];
                  const dist = Math.hypot(target.x - s.x, target.y - s.y);
                  const alpha = dist > 40 ? 0.35 : 0.60;
                  return {
                    x: s.x * (1 - alpha) + target.x * alpha,
                    y: s.y * (1 - alpha) + target.y * alpha
                  };
                });
              }
            } else {
              cornerLostCountRef.current += 1;
              if (cornerLostCountRef.current > 3) {
                smoothedCornersRef.current = null;
              }
            }

            // Draw individual green target dots for ANY detected corner (instant visual feedback)
            if (roiRes) {
              const cornerKeys: Array<'tl' | 'tr' | 'bl' | 'br'> = ['tl', 'tr', 'bl', 'br'];
              cornerKeys.forEach(k => {
                const pt = roiRes[k];
                if (pt) {
                  const dotBoxSize = 24;
                  ctx.save();
                  ctx.strokeStyle = '#22c55e';
                  ctx.lineWidth = 3;
                  ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
                  ctx.beginPath();
                  ctx.rect(pt.x - dotBoxSize / 2, pt.y - dotBoxSize / 2, dotBoxSize, dotBoxSize);
                  ctx.fill();
                  ctx.stroke();

                  ctx.beginPath();
                  ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
                  ctx.fillStyle = '#ffffff';
                  ctx.fill();
                  ctx.restore();
                }
              });
            }
          }

          const corners = smoothedCornersRef.current;
          if (corners && corners.length === 4) {
            // ══════════════════════════════════════════════════════════════
            // STRICT RECTANGLE GEOMETRY VALIDATION
            // The 4 real outer corner marks ALWAYS form a proper rectangle.
            // Random internal timing marks will NOT pass these checks.
            // ══════════════════════════════════════════════════════════════
            const tl = corners[0];
            const tr = corners[1];
            const br = corners[2];
            const bl = corners[3];
            
            const detW1 = Math.hypot(tr.x - tl.x, tr.y - tl.y);
            const detW2 = Math.hypot(br.x - bl.x, br.y - bl.y);
            const detH1 = Math.hypot(bl.x - tl.x, bl.y - tl.y);
            const detH2 = Math.hypot(br.x - tr.x, br.y - tr.y);
            
            const avgDetW = (detW1 + detW2) / 2;
            const avgDetH = (detH1 + detH2) / 2;
            
            // CHECK 1: Width must span a natural visible paper size on screen
            const isWidthValid = avgDetW >= vW * 0.38 && avgDetW <= vW * 0.90;

            // CHECK 2: Height must span a natural visible paper size on screen
            const isHeightValid = avgDetH >= vH * 0.38 && avgDetH <= vH * 0.92;
            
            // CHECK 3: Aspect ratio must match physical sheet anchor ratio (with ±0.15 tolerance)
            const detAspect = avgDetH / avgDetW;
            const isAspectValid = detAspect >= (sheetGridAspect - 0.15) && detAspect <= (sheetGridAspect + 0.15);
            
            // CHECK 4: Top edge must be straight horizontal
            const topEdgeSkew = Math.abs(tl.y - tr.y) / avgDetH;
            const isTopStraight = topEdgeSkew < 0.10;
            
            // CHECK 5: Bottom edge must be straight horizontal
            const bottomEdgeSkew = Math.abs(bl.y - br.y) / avgDetH;
            const isBottomStraight = bottomEdgeSkew < 0.10;
            
            // CHECK 6: Left edge must be straight vertical
            const leftEdgeSkew = Math.abs(tl.x - bl.x) / avgDetW;
            const isLeftStraight = leftEdgeSkew < 0.10;
            
            // CHECK 7: Right edge must be straight vertical
            const rightEdgeSkew = Math.abs(tr.x - br.x) / avgDetW;
            const isRightStraight = rightEdgeSkew < 0.10;
            
            // CHECK 8: Both diagonals must be nearly equal (rectangle property)
            const diag1 = Math.hypot(br.x - tl.x, br.y - tl.y);
            const diag2 = Math.hypot(bl.x - tr.x, bl.y - tr.y);
            const diagDiff = Math.abs(diag1 - diag2) / Math.max(diag1, diag2);
            const isDiagsEqual = diagDiff < 0.10;
            
            // CHECK 9: Top and bottom widths must be nearly equal
            const widthDiff = Math.abs(detW1 - detW2) / avgDetW;
            const isWidthsEqual = widthDiff < 0.10;
            
            // CHECK 10: Left and right heights must be nearly equal
            const heightDiff = Math.abs(detH1 - detH2) / avgDetH;
            const isHeightsEqual = heightDiff < 0.10;
            
            const isValidRectangle = isWidthValid && isHeightValid && isAspectValid
              && isTopStraight && isBottomStraight
              && isLeftStraight && isRightStraight
              && isDiagsEqual && isWidthsEqual && isHeightsEqual;
            
            if (!isValidRectangle) {
              lockStartTimeRef.current = null;
              stableFramesRef.current = 0;
              smoothedCornersRef.current = null;
              prevCornersRef.current = null;
              setDetectorStatus('invalid-length');
            } else {
              // Check frame-to-frame corner motion stability
              let isMoving = false;
              if (prevCornersRef.current && prevCornersRef.current.length === 4) {
                let totalShift = 0;
                for (let i = 0; i < 4; i++) {
                  const dx = corners[i].x - prevCornersRef.current[i].x;
                  const dy = corners[i].y - prevCornersRef.current[i].y;
                  totalShift += Math.sqrt(dx * dx + dy * dy);
                }
                const avgShift = totalShift / 4;
                if (avgShift > 5.0) {
                  isMoving = true;
                }
              }
              prevCornersRef.current = corners.map(p => ({ ...p }));
  
              if (isMoving) {
                lockStartTimeRef.current = null;
              } else {
                if (lockStartTimeRef.current === null) {
                  lockStartTimeRef.current = now;
                }
              }

            const lockElapsed = lockStartTimeRef.current ? (now - lockStartTimeRef.current) : 0;
            const lockDuration = 450; // Smooth 450ms circular sweep before snapping to guarantee stability
            const lockProgress = isMoving ? 0 : Math.min(1.0, lockElapsed / lockDuration);

            // Center Smooth Circular Lock Animation (Evalbee Video 00:11-00:13 Style)
            const cx = vW / 2;
            const cy = vH / 2;

            if (!isMoving) {
              const whiteR = 40;
              const ringR = 48;

              // Solid White Center Circle (Evalbee signature)
              ctx.beginPath();
              ctx.arc(cx, cy, whiteR, 0, 2 * Math.PI);
              ctx.fillStyle = '#ffffff';
              ctx.fill();

              // Blue sweeping arc (Evalbee signature)
              ctx.beginPath();
              ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + lockProgress * 2 * Math.PI);
              ctx.strokeStyle = '#2563eb';
              ctx.lineWidth = 7;
              ctx.lineCap = 'round';
              ctx.stroke();

              // When the animation circle completes its round (100%), auto-snap immediately!
              if (lockProgress >= 1.0 && !isScanningRef.current) {
                lockStartTimeRef.current = null;
                isScanningRef.current = true;
                setIsScanning(true);
                setTimeout(() => {
                  captureCameraPhoto();
                }, 0);
              }
            }

            setDetectorStatus(isMoving ? 'aligning' : 'ready');
            }
          } else {
            stableFramesRef.current = 0;
            lockStartTimeRef.current = null;
            setDetectorStatus('searching');
          }
        } catch (e) {
          stableFramesRef.current = 0;
          console.warn("Live OMR outline tracking failed:", e);
        }
      }
    }
    
    analysisRequestRef.current = requestAnimationFrame(runCameraAnalysisLoop);
  };

  // Stop active camera stream
  const stopCameraStream = () => {
    if (analysisRequestRef.current) {
      cancelAnimationFrame(analysisRequestRef.current);
      analysisRequestRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
    setIsTorchOn(false);
  };

  // Start live camera stream
  const startCameraStream = async (deviceId?: string) => {
    stopCameraStream();
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        
        // Start the frame loop
        if (analysisRequestRef.current) {
          cancelAnimationFrame(analysisRequestRef.current);
        }
        analysisRequestRef.current = requestAnimationFrame(runCameraAnalysisLoop);
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      let videoInputs = devices.filter(d => d.kind === 'videoinput');
      
      // Filter for rear/back cameras if any exist to enforce back-camera usage on mobile
      const rearCameras = videoInputs.filter(d => {
        const label = d.label.toLowerCase();
        return label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('main') || label.includes('world') || label.includes('camera 0');
      });
      
      if (rearCameras.length > 0) {
        videoInputs = rearCameras;
      } else {
        const nonFrontCameras = videoInputs.filter(d => {
          const label = d.label.toLowerCase();
          return !label.includes('front') && !label.includes('user') && !label.includes('selfie') && !label.includes('face');
        });
        if (nonFrontCameras.length > 0) {
          videoInputs = nonFrontCameras;
        }
      }
      
      setCameraDevices(videoInputs);
      
      // Synchronize selectedCameraId with the active stream's device ID to prevent loop resetting
      const activeTrack = stream.getVideoTracks()[0];
      
      // Apply Programmatic Autofocus and check Torch support
      if (activeTrack) {
        try {
          const capabilities = (activeTrack.getCapabilities ? activeTrack.getCapabilities() : {}) as any;
          setHasTorch(!!capabilities.torch);
          
          const constraintsToApply: any = {};
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            constraintsToApply.focusMode = 'continuous';
          }
          if (Object.keys(constraintsToApply).length > 0) {
            await activeTrack.applyConstraints({ advanced: [constraintsToApply] });
            console.log("✅ Continuous autofocus constraint applied successfully.");
          }
        } catch (e) {
          console.warn("Failed to check capabilities or apply autofocus constraints:", e);
        }
      }

      const activeDeviceId = activeTrack?.getSettings()?.deviceId || '';
      
      if (activeDeviceId && videoInputs.some(d => d.deviceId === activeDeviceId)) {
        setSelectedCameraId(activeDeviceId);
      } else if (videoInputs.length > 0 && (!selectedCameraId || !videoInputs.some(d => d.deviceId === selectedCameraId))) {
        setSelectedCameraId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Unable to access camera. Please ensure camera permissions are granted.");
      setShowCameraModal(false);
    }
  };

  const toggleTorch = async () => {
    if (!activeStreamRef.current) return;
    const track = activeStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState } as any]
      });
      setIsTorchOn(nextState);
      console.log(`🔦 Torch toggled: ${nextState}`);
    } catch (err) {
      console.error("Failed to toggle flashlight/torch:", err);
      alert("Flashlight control is not supported or failed on this camera device.");
    }
  };

  useEffect(() => {
    if (showCameraModal) {
      startCameraStream(selectedCameraId || undefined);
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [showCameraModal, selectedCameraId]);

  const captureCameraPhoto = async () => {
    if (!videoRef.current || !cvLoaded) return;

    if (Date.now() - lastCaptureTimeRef.current < 3000) {
      return;
    }
    lastCaptureTimeRef.current = Date.now();

    if (maxClassSheets !== Infinity && fileList.length >= maxClassSheets) {
      alert(`Class limit reached (${maxClassSheets} registered students).`);
      setShowCameraModal(false);
      return;
    }

    playShutterSound();
    isScanningRef.current = true;
    setIsScanning(true);

    const video = videoRef.current;
    const vW = video.videoWidth || 1280;
    const vH = video.videoHeight || 720;

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = vW;
    snapCanvas.height = vH;
    const sCtx = snapCanvas.getContext('2d');
    if (!sCtx) return;
    sCtx.drawImage(video, 0, 0, vW, vH);

    // Capture the exact 4 precision-tracked corners from the live viewfinder
    const verifiedCorners = smoothedCornersRef.current
      ? smoothedCornersRef.current.map(p => ({ ...p }))
      : null;

    try {
      setScanningProgress(40);
      setScanningStatus("Processing sheet...");

      const scannerRollDigits = Math.min(3, exam.rollNoDigits ?? 3);
      let cvResult = await scanOMRSheet(
        snapCanvas,
        exam.numQuestions,
        scannerRollDigits,
        exam.examSetsCount ?? 1,
        exam.sections ?? [],
        verifiedCorners
      );

      setScanningProgress(100);



      const stripLeadingZeros = (val: string) => {
        const cleaned = val.replace(/^0+/, '');
        return cleaned === '' ? '0' : cleaned;
      };
      const cvRollStripped = stripLeadingZeros(cvResult.studentNum);
      const classStudents = students.filter(s => s.className === exam.className);
      const matchedStudent = classStudents.find(s => stripLeadingZeros(s.studentNum) === cvRollStripped);
      const studentId = (matchedStudent && matchedStudent.id !== undefined) ? matchedStudent.id : null;

      let score = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;

      const detectedSet = cvResult.bookletSet || 'A';
      let correctKey = (exam.answerKeys && exam.answerKeys[detectedSet]) || exam.answerKey;
      if (!correctKey || Object.keys(correctKey).length === 0) {
        correctKey = exam.answerKey;
      }

      if (exam.sections && exam.sections.length > 0) {
        exam.sections.forEach((sec: any) => {
          const secCorrectMarks = sec.correctMarks ?? 4;
          const secIncorrectMarks = sec.incorrectMarks ?? -1;
          const secUnansweredMarks = sec.unansweredMarks ?? 0;
          const qNums: number[] = Array.from({ length: sec.qCount }, (_, k) => sec.qStart + k);

          if (sec.allowOptionalAttempts && sec.maxAttempts) {
            const attempted: Array<{ q: number; ans: string }> = [];
            qNums.forEach(q => {
              const ans = cvResult.answers[q] || '';
              if (ans !== '') attempted.push({ q, ans });
            });

            const evaluated = attempted.slice(0, sec.maxAttempts);
            evaluated.forEach(item => {
              const correctAns = correctKey[item.q] || '';
              if (isAnswerMatch(item.ans, correctAns)) {
                score += secCorrectMarks;
                correctCount++;
              } else {
                score += secIncorrectMarks;
                wrongCount++;
              }
            });

            const unansweredForSec = sec.qCount - evaluated.length;
            unansweredCount += unansweredForSec;
            score += unansweredForSec * secUnansweredMarks;
          } else {
            qNums.forEach(q => {
              const studentAns = cvResult.answers[q] || '';
              const correctAns = correctKey[q] || '';
              if (studentAns === '') {
                score += secUnansweredMarks;
                unansweredCount++;
              } else if (isAnswerMatch(studentAns, correctAns)) {
                score += secCorrectMarks;
                correctCount++;
              } else {
                score += secIncorrectMarks;
                wrongCount++;
              }
            });
          }
        });
      } else {
        const cMarks = exam.correctMarks ?? 4;
        const iMarks = exam.incorrectMarks ?? -1;
        const uMarks = exam.unansweredMarks ?? 0;

        for (let q = 1; q <= exam.numQuestions; q++) {
          const studentAns = cvResult.answers[q] || '';
          const correctAns = correctKey[q] || '';

          if (studentAns === '') {
            score += uMarks;
            unansweredCount++;
          } else if (isAnswerMatch(studentAns, correctAns)) {
            score += cMarks;
            correctCount++;
          } else {
            score += iMarks;
            wrongCount++;
          }
        }
      }

      // Draw green/red question overlays & yellow roll number overlay on the warped canvas before saving
      if (cvResult.debugWarpedCanvas) {
        drawOverlayOnWarpedCanvas(
          cvResult.debugWarpedCanvas,
          exam.numQuestions,
          cvResult.answers,
          correctKey,
          cvResult.bestDy || 0,
          exam.sections ?? [],
          cvResult.questionOffsets,
          cvResult.studentNum || '',
          exam.rollNoDigits ?? 3
        );
      }

      const croppedUrl = cvResult.debugWarpedCanvas 
        ? cvResult.debugWarpedCanvas.toDataURL('image/jpeg', 0.78) 
        : snapCanvas.toDataURL('image/jpeg', 0.78);

      const fallbackStudentId = studentId || -(Date.now() + Math.floor(Math.random() * 1000));
      const scanResultName = matchedStudent ? matchedStudent.name : 'Unknown Candidate';

      // Check for duplicate submission
      const existingSub = existingSubmissions.find(s => 
        (studentId !== null && s.studentId === studentId) ||
        (s.detectedRollNum && stripLeadingZeros(s.detectedRollNum) === cvRollStripped && cvRollStripped !== '0')
      );

      if (existingSub) {
        const existingSt = students.find(st => st.id === existingSub.studentId);
        const existingName = existingSt ? existingSt.name : (existingSub.detectedRollNum ? `Student (Roll ${existingSub.detectedRollNum})` : 'Existing Student');

        setDuplicateWarning({
          existingSubmission: existingSub,
          existingStudentName: existingName,
          detectedRollNum: cvResult.studentNum || cvRollStripped,
          newScanData: {
            score,
            correctCount,
            wrongCount,
            unansweredCount,
            answers: cvResult.answers,
            bookletSet: detectedSet,
            omrImageUrl: croppedUrl,
            studentId
          }
        });
        setEditRollInput(cvResult.studentNum || cvRollStripped);
        setIsEditingRollInDuplicateModal(false);
        isScanningRef.current = false;
        setIsScanning(false);
        setScanningStatus(null);
        setScanningProgress(0);
        return;
      }

      // Compute section-wise score breakdown
      const sectionScores: Record<string, number> = {};
      if (exam.sections && exam.sections.length > 0) {
        exam.sections.forEach((sec: any) => {
          const secName = sec.name || `Section ${sec.id || ''}`;
          let secScore = 0;
          const secCorrectMarks = sec.correctMarks ?? 4;
          const secIncorrectMarks = sec.incorrectMarks ?? -1;
          const secUnansweredMarks = sec.unansweredMarks ?? 0;
          const qNums: number[] = Array.from({ length: sec.qCount }, (_, k) => sec.qStart + k);

          qNums.forEach(q => {
            const studentAns = cvResult.answers[q] || '';
            const correctAns = correctKey[q] || '';
            if (studentAns === '') {
              secScore += secUnansweredMarks;
            } else if (isAnswerMatch(studentAns, correctAns)) {
              secScore += secCorrectMarks;
            } else {
              secScore += secIncorrectMarks;
            }
          });
          sectionScores[secName] = secScore;
        });
      }

      const currentScanData: EvalbeeScanData = {
        studentId: fallbackStudentId,
        studentNum: cvResult.studentNum || cvRollStripped,
        studentName: scanResultName,
        score,
        sectionScores,
        correctCount,
        wrongCount,
        unansweredCount,
        answers: cvResult.answers,
        bookletSet: detectedSet,
        omrImageUrl: croppedUrl,
        bubbleSnippets: cvResult.bubbleSnippets,
        bestDy: cvResult.bestDy,
        questionOffsets: cvResult.questionOffsets
      };

      if (autoSaveEnabled) {
        // ── ⚡ AUTO-SAVE ON FLOW ──
        // 1. Immediately save submission in database and trigger background cloud sync
        await saveScannedSubmission(
          fallbackStudentId,
          cvResult.studentNum || cvRollStripped,
          score,
          cvResult.answers,
          detectedSet,
          croppedUrl,
          scanResultName,
          correctCount,
          wrongCount,
          unansweredCount
        );

        // 2. Set persistent bottom scorecard bar data
        setLastScannedStudentBar(currentScanData);

        // 3. Visual & Audio celebratory feedback
        setAutoSaveFlash(true);
        setTimeout(() => setAutoSaveFlash(false), 800);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.85 }
        });

        // 4. Reset camera scanning lock so it remains instantly ready for the next sheet!
        lastCaptureTimeRef.current = Date.now();
        isScanningRef.current = false;
        setIsScanning(false);
        setScanningStatus(null);
        setScanningProgress(0);
        return;
      }

      // ── 🖐️ MANUAL SAVE (AUTO-SAVE OFF) FLOW ──
      // Stop camera stream and open the Evalbee Result Overview Screen
      stopCameraStream();
      setShowCameraModal(false);
      setEvalbeeReviewData(currentScanData);

    } catch (err: any) {
      const errorMsg = err.message || "Failed to align OMR sheet. Please hold camera straight above sheet and retake.";
      if (!showCameraModal) {
        alert("OMR Scan Error: " + errorMsg);
      } else {
        setCameraErrorMessage(errorMsg);
        setTimeout(() => setCameraErrorMessage(null), 3500);
      }
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
      setScanningStatus(null);
      setScanningProgress(0);
    }
  };



  const getSelectedFile = () => {
    return fileList.find(f => f.id === selectedFileId);
  };

  // Run OMR Scanner
  const runOMRScan = async () => {
    const current = getSelectedFile();
    if (!current) return;

    setIsScanning(true);
    setScanningProgress(30);
    setScanningStatus("Scanning OMR sheet...");
    setActiveResult(null);

    try {
      const img = new Image();
      img.src = current.previewUrl;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      setFileList(prev => prev.map(f => f.id === selectedFileId ? { ...f, status: 'Scanning' } : f));

      setScanningProgress(30);
      setScanningStatus("Scanning OMR sheet...");

      const scannerRollDigits = Math.min(3, exam.rollNoDigits ?? 3);
      let cvResult = await scanOMRSheet(
        img,
        exam.numQuestions,
        scannerRollDigits,
        exam.examSetsCount ?? 1,
        exam.sections ?? []
      );

      setScanningProgress(100);



      const stripLeadingZeros = (val: string) => {
        const cleaned = val.replace(/^0+/, '');
        return cleaned === '' ? '0' : cleaned;
      };
      const cvRollStripped = stripLeadingZeros(cvResult.studentNum);
      const classStudents = students.filter(s => s.className === exam.className);
      const matchedStudent = classStudents.find(s => stripLeadingZeros(s.studentNum) === cvRollStripped);
      const studentId = (matchedStudent && matchedStudent.id !== undefined) ? matchedStudent.id : null;

      let score = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;

      const detectedSet = cvResult.bookletSet || 'A';
      let correctKey = (exam.answerKeys && exam.answerKeys[detectedSet]) || exam.answerKey;
      if (!correctKey || Object.keys(correctKey).length === 0) {
        correctKey = exam.answerKey;
      }

      if (exam.sections && exam.sections.length > 0) {
        exam.sections.forEach((sec: any) => {
          const secCorrectMarks = sec.correctMarks ?? 4;
          const secIncorrectMarks = sec.incorrectMarks ?? -1;
          const secUnansweredMarks = sec.unansweredMarks ?? 0;
          const qNums: number[] = Array.from({ length: sec.qCount }, (_, k) => sec.qStart + k);

          if (sec.allowOptionalAttempts && sec.maxAttempts) {
            const attempted: Array<{ q: number; ans: string }> = [];
            qNums.forEach(q => {
              const ans = cvResult.answers[q] || '';
              if (ans !== '') attempted.push({ q, ans });
            });

            const evaluated = attempted.slice(0, sec.maxAttempts);
            evaluated.forEach(item => {
              const correctAns = correctKey[item.q] || '';
              if (isAnswerMatch(item.ans, correctAns)) {
                score += secCorrectMarks;
                correctCount++;
              } else {
                score += secIncorrectMarks;
                wrongCount++;
              }
            });

            const unattemptedCount = sec.qCount - evaluated.length;
            unansweredCount += unattemptedCount;
            score += unattemptedCount * secUnansweredMarks;
          } else {
            qNums.forEach(q => {
              const studentAns = cvResult.answers[q] || '';
              const correctAns = correctKey[q] || '';
              if (studentAns === '') {
                score += secUnansweredMarks;
                unansweredCount++;
              } else if (isAnswerMatch(studentAns, correctAns)) {
                score += secCorrectMarks;
                correctCount++;
              } else {
                score += secIncorrectMarks;
                wrongCount++;
              }
            });
          }
        });
      } else {
        const cMarks = exam.correctMarks ?? 4;
        const iMarks = exam.incorrectMarks ?? -1;
        const uMarks = exam.unansweredMarks ?? 0;

        for (let q = 1; q <= exam.numQuestions; q++) {
          const studentAns = cvResult.answers[q] || '';
          const correctAns = correctKey[q] || '';

          if (studentAns === '') {
            score += uMarks;
            unansweredCount++;
          } else if (isAnswerMatch(studentAns, correctAns)) {
            score += cMarks;
            correctCount++;
          } else {
            score += iMarks;
            wrongCount++;
          }
        }
      }

      // Draw green/red question overlays & yellow roll number overlay on the warped canvas before saving
      if (cvResult.debugWarpedCanvas) {
        drawOverlayOnWarpedCanvas(
          cvResult.debugWarpedCanvas,
          exam.numQuestions,
          cvResult.answers,
          correctKey,
          cvResult.bestDy || 0,
          exam.sections ?? [],
          cvResult.questionOffsets,
          cvResult.studentNum || '',
          exam.rollNoDigits ?? 3
        );
      }

      const croppedSheetUrl = cvResult.debugWarpedCanvas 
        ? cvResult.debugWarpedCanvas.toDataURL('image/jpeg', 0.92) 
        : null;

      const scanResultData = {
        studentId,
        studentName: matchedStudent ? matchedStudent.name : 'Unknown Candidate',
        detectedStudentNum: cvResult.studentNum,
        bookletSet: detectedSet,
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        answers: cvResult.answers,
        warpedCanvas: cvResult.debugWarpedCanvas
      };

      const studentNum = cvResult.studentNum;
      
      setFileList(prev => {
        let updated = prev.map(f => {
          if (f.id === selectedFileId) {
            return {
              ...f,
              name: `Scanned Sheet - ${studentNum || 'OMR'}`,
              previewUrl: croppedSheetUrl || f.previewUrl,
              status: 'Scanned' as const,
              result: scanResultData
            };
          }
          return f;
        });

        if (studentNum) {
          const dupId = updated.find(f => 
            f.id !== selectedFileId && 
            ((f.result && f.result.detectedStudentNum === studentNum) || 
             f.name === `Camera Snap - ${studentNum}` ||
             f.name === `Scanned Sheet - ${studentNum}`)
          )?.id;
          
          if (dupId) {
            updated = updated.filter(f => f.id !== dupId);
          }
        }
        return updated;
      });

      setActiveResult(scanResultData);
      setDetectedStudentId(studentId || null);

      if (studentId) {
        confetti({ particleCount: 60, spread: 60 });
      }
    } catch (err: any) {
      console.error(err);
      alert(`OMR Scan Failed: ${err.message || err}`);
      setFileList(prev => prev.map(f => {
        if (f.id === selectedFileId) {
          return { ...f, status: 'Failed' };
        }
        return f;
      }));
    } finally {
      setIsScanning(false);
      setScanningStatus(null);
      setScanningProgress(0);
    }
  };


  const handleSaveResult = async () => {
    if (!activeResult || !selectedFileId) return;

    if (!detectedStudentId) {
      alert('Please associate scan with a student.');
      return;
    }

    try {
      let finalStudentId = detectedStudentId;

      // Auto-register unregistered student from transcribed Name/Father Name
      if (detectedStudentId < 0) {
        const cleanName = (activeResult.rawTranscribedName || '').trim();
        const cleanFather = (activeResult.rawTranscribedFatherName || '').trim();
        const studentNum = activeResult.detectedStudentNum || '';

        if (cleanName) {
          try {
            const newStudentId = await db.students.add({
              studentNum,
              name: cleanName,
              fatherName: cleanFather,
              className: exam.className
            });
            finalStudentId = newStudentId;

            // Trigger sync of this new student to the cloud
            const { syncStudentToCloud } = await import('../utils/cloudSync');
            const saved = await db.students.get(newStudentId);
            if (saved) {
              syncStudentToCloud(saved).catch(console.warn);
            }
          } catch (regErr: any) {
            console.error("Auto registration in save flow failed:", regErr);
            alert("Failed to auto-register student: " + (regErr.message || regErr));
            return;
          }
        } else {
          alert('Please associate scan with a student.');
          return;
        }
      }

      let finalOmrUrl: string | undefined = undefined;
      const currentFile = fileList.find(f => f.id === selectedFileId);
      let base64Data: string | null = null;

      if (activeResult.warpedCanvas) {
        base64Data = activeResult.warpedCanvas.toDataURL('image/jpeg', 0.90);
      } else if (currentFile && currentFile.previewUrl.startsWith('data:image')) {
        base64Data = currentFile.previewUrl;
      }

      if (base64Data) {
        try {
          const res = await fetch('/api/upload-omr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageData: base64Data,
              examId: exam.id,
              studentId: finalStudentId
            })
          });
          const data = await res.json();
          if (data.success && data.imageUrl) {
            finalOmrUrl = data.imageUrl;
          }
        } catch (uploadErr) {
          console.warn("Cloud image upload warning:", uploadErr);
        }
        if (!finalOmrUrl) {
          finalOmrUrl = base64Data;
        }
      }

      if (exam.id && finalStudentId) {
        await db.submissions.where('[examId+studentId]').equals([exam.id, finalStudentId]).delete();
      }

      const subId = await db.submissions.add({
        examId: exam.id!,
        studentId: finalStudentId,
        score: activeResult.score,
        answers: activeResult.answers,
        bookletSet: activeResult.bookletSet,
        omrImageUrl: finalOmrUrl,
        scannedAt: new Date()
      });

      const savedSub = await db.submissions.get(subId);
      if (savedSub && finalStudentId > 0) {
        await syncSubmissionToCloud(savedSub);
      }
      pullCloudUpdatesToIndexedDB();

      alert('Student score saved!');
      refreshSubmissions();

      setFileList(prev => {
        const updated = prev.filter(f => {
          if (f.id === selectedFileId) return false;
          if (f.result) {
            if (finalStudentId && f.result.studentId === finalStudentId) return false;
            if (activeResult.detectedStudentNum && f.result.detectedStudentNum === activeResult.detectedStudentNum) return false;
          }
          const rollNum = activeResult.detectedStudentNum;
          if (rollNum) {
            const rollStr = String(rollNum);
            if (f.name.includes(`-${rollStr}`) || f.name.includes(` ${rollStr}`) || f.name.includes(`Roll ${rollStr}`)) {
              return false;
            }
          }
          return true;
        });
        
        const nextPending = updated.find(f => f.status === 'Pending');
        if (nextPending) {
          setSelectedFileId(nextPending.id);
          if (nextPending.result) {
            setActiveResult(nextPending.result);
            setDetectedStudentId(nextPending.result.studentId || null);
          } else {
            setActiveResult(null);
            setDetectedStudentId(null);
          }
        } else if (updated.length > 0) {
          setSelectedFileId(updated[0].id);
          if (updated[0].result) {
            setActiveResult(updated[0].result);
            setDetectedStudentId(updated[0].result.studentId || null);
          } else {
            setActiveResult(null);
            setDetectedStudentId(null);
          }
        } else {
          setSelectedFileId(null);
          setActiveResult(null);
          setDetectedStudentId(null);
        }
        return updated;
      });
    } catch (err: any) {
      alert(`Could not save submission: ${err.message}`);
    }
  };

  // Filtered submissions for Full Screen Scanned Sheets mode
  const filteredSubmissions = existingSubmissions.filter(sub => {
    const student = students.find(s => s.id === sub.studentId);
    const name = student ? student.name : '';
    const roll = student ? student.studentNum : '';
    const query = scannedSheetSearch.toLowerCase();
    return name.toLowerCase().includes(query) || roll.toLowerCase().includes(query);
  });

  if (viewingOmrModalUrl && viewingOmrModalUrl.url) {
    return (
      <FullScreenOmrViewer
        imageUrl={viewingOmrModalUrl.url}
        title={viewingOmrModalUrl.name}
        subtitle={`Score: ${viewingOmrModalUrl.score.toFixed(1)} Marks`}
        onClose={() => setViewingOmrModalUrl(null)}
        scoreInfo={{
          score: viewingOmrModalUrl.score,
          correctCount: viewingOmrModalUrl.correctCount,
          wrongCount: viewingOmrModalUrl.wrongCount,
          unansweredCount: exam.numQuestions - (viewingOmrModalUrl.correctCount || 0) - (viewingOmrModalUrl.wrongCount || 0)
        }}
      />
    );
  }

  return (
    <div className="scan-images-portal animate-fade-in" style={{ paddingBottom: '30px' }}>
      
      {/* CLEAN, MOBILE-PERFECT HEADER BAR */}
      <div className="glass-card mb-3" style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        
        {/* Left Side: Back Arrow + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <button 
            type="button"
            className="clean-back-btn" 
            onClick={onClose}
            style={{ border: 'none', background: '#f1f5f9', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {exam.title}
            </h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {exam.className || 'General'} • Scanned {scannedCount}/{maxClassSheets === Infinity ? '∞' : maxClassSheets}
            </p>
          </div>
        </div>

        {/* Right Side: Clean View Sheets Button */}
        <button
          type="button"
          onClick={() => setShowScannedSheetsFullScreen(true)}
          style={{
            padding: '8px 12px',
            borderRadius: '10px',
            background: '#0284c7',
            color: '#ffffff',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
            boxShadow: '0 2px 6px rgba(2,132,199,0.3)'
          }}
        >
          <Eye size={15} /> View Sheets ({scannedCount})
        </button>
      </div>

      {/* SINGLE SCANNING WORKSPACE */}
      {/* Restructured Workspace: Mobile and layout friendly vertical stack */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Top Section: Buttons Card */}
        <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Live Camera Button */}
            <button
              type="button"
              onClick={() => {
                if (isClassLimitReached) {
                  alert(`Class limit reached (${maxClassSheets} registered students scanned).`);
                  return;
                }
                setShowCameraModal(true);
              }}
              disabled={isClassLimitReached}
              style={{
                padding: '14px',
                borderRadius: '12px',
                background: isClassLimitReached ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '1rem',
                cursor: isClassLimitReached ? 'not-allowed' : 'pointer',
                boxShadow: isClassLimitReached ? 'none' : '0 4px 12px rgba(37,99,235,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%'
              }}
            >
              <Camera size={18} /> Live Camera Scanner
            </button>
          </div>
        </div>

        {fileList.length > 0 && (
          <>
            {selectedFileId && getSelectedFile() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="glass-card" style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                  {isScanning && scanningStatus && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 50,
                      background: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      gap: '16px',
                      padding: '20px',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        border: '4px solid rgba(255,255,255,0.1)',
                        borderTop: '4px solid #0284c7',
                        animation: 'spin 1s linear infinite'
                      }} className="spin" />
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.5px' }}>
                        ⚡ High-Speed OMR Analysis
                      </div>
                      <div style={{ width: '80%', background: 'rgba(255,255,255,0.15)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${scanningProgress}%`, height: '100%', background: '#0284c7', transition: 'width 0.2s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                        {scanningStatus}
                      </div>
                    </div>
                  )}
                  {/* View Controls */}
                  <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px', zIndex: 10 }}>
                    <button type="button" className="btn-icon" onClick={() => setRotation((r) => (r - 90) % 360)} title="Rotate CCW"><RotateCcw size={14} /></button>
                    <button type="button" className="btn-icon" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate CW"><RotateCw size={14} /></button>
                    <button type="button" className="btn-icon" onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))} title="Zoom Out"><ZoomOut size={14} /></button>
                    <button type="button" className="btn-icon" onClick={() => setZoom((z) => Math.min(z + 0.2, 2.5))} title="Zoom In"><ZoomIn size={14} /></button>
                  </div>

                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 10px', minHeight: '240px', background: 'rgba(15,23,42,0.03)', overflow: 'hidden', borderBottom: '1px solid #e2e8f0' }}>
                    <img 
                      src={getSelectedFile()?.previewUrl} 
                      alt="OMR Source" 
                      style={{
                        maxHeight: '320px',
                        maxWidth: '100%',
                        objectFit: 'contain',
                        transform: `rotate(${rotation}deg) scale(${zoom})`,
                        transition: 'transform 0.2s ease',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                      }} 
                    />
                  </div>

                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#ffffff' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>File: {getSelectedFile()?.name}</p>
                    
                    {/* Manual student selector for file mode */}
                    {activeResult && (!activeResult.studentId || activeResult.studentId < 0) && (
                      <div style={{ marginTop: '4px' }}>
                        <select
                          value={detectedStudentId || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            const studentId = val ? parseInt(val) : null;
                            setDetectedStudentId(studentId);
                            
                            const matched = students.find(s => s.id === studentId);
                            if (matched) {
                              setActiveResult((prev: any) => prev ? {
                                ...prev,
                                studentId: matched.id!,
                                studentName: matched.name,
                                detectedStudentNum: matched.studentNum
                              } : null);
                              
                              setFileList((prev: any[]) => prev.map(f => {
                                if (f.id === selectedFileId) {
                                  return {
                                    ...f,
                                    result: {
                                      ...f.result,
                                      studentId: matched.id!,
                                      studentName: matched.name,
                                      detectedStudentNum: matched.studentNum
                                    }
                                  };
                                }
                                return f;
                              }));
                            } else {
                              setActiveResult((prev: any) => prev ? {
                                ...prev,
                                studentId: null,
                                studentName: 'Unknown Candidate',
                                detectedStudentNum: ''
                              } : null);
                            }
                          }}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600, background: '#fff', outline: 'none' }}
                        >
                          <option value="">-- Associate Student --</option>
                          {students.filter(s => s.className === exam.className).map(s => (
                            <option key={s.id} value={s.id}>{s.name} (Roll: {s.studentNum})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {detectedStudentId && detectedStudentId < 0 && activeResult && activeResult.rawTranscribedName && (
                      <div style={{
                        background: '#f3e8ff',
                        border: '1px solid #c084fc',
                        borderRadius: '10px',
                        padding: '12px',
                        marginTop: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <div style={{ fontSize: '0.8rem', color: '#6b21a8', fontWeight: 600 }}>
                          👤 Transcribed Name: "{activeResult.rawTranscribedName}"
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const cleanName = (activeResult.rawTranscribedName || '').trim();
                            const cleanFather = (activeResult.rawTranscribedFatherName || '').trim();
                            const studentNum = activeResult.detectedStudentNum || '';
                            
                            try {
                              const newStudentId = await db.students.add({
                                studentNum,
                                name: cleanName,
                                fatherName: cleanFather,
                                className: exam.className
                              });
                              
                              // Trigger sync of this new student to the cloud
                              const { syncStudentToCloud } = await import('../utils/cloudSync');
                              const saved = await db.students.get(newStudentId);
                              if (saved) {
                                syncStudentToCloud(saved).catch(console.warn);
                              }

                              // Update active results and local state selection to link immediately
                              setDetectedStudentId(newStudentId);
                              setActiveResult((prev: any) => prev ? {
                                ...prev,
                                studentId: newStudentId,
                                studentName: cleanName
                              } : null);

                              setFileList((prev: any[]) => prev.map(f => {
                                if (f.id === selectedFileId) {
                                  return {
                                    ...f,
                                    result: {
                                      ...f.result,
                                      studentId: newStudentId,
                                      studentName: cleanName
                                    }
                                  };
                                }
                                return f;
                              }));

                              alert(`Successfully registered: ${cleanName}`);
                            } catch (err: any) {
                              alert("Registration failed: " + (err.message || err));
                            }
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#7c3aed',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            boxShadow: '0 2px 4px rgba(124, 58, 237, 0.2)'
                          }}
                        >
                          📝 Register as New Student
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        className="btn-primary" 
                        onClick={runOMRScan} 
                        disabled={isScanning}
                        style={{ flex: 1, padding: '10px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.85rem' }}
                      >
                        {isScanning ? <><RefreshCw className="spin" size={14} /> Scanning...</> : '⚡ Run Auto OMR Scan'}
                      </button>

                      {activeResult && (
                        <button 
                          className="btn-success" 
                          onClick={handleSaveResult}
                          disabled={!detectedStudentId}
                          style={{ flex: 1, padding: '10px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.85rem', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}
                        >
                          💾 Save Result
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* FULL SCREEN VIEW SCANNED SHEETS MODE */}
      {showScannedSheetsFullScreen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#f8fafc', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          
          {/* Top Full Screen Header */}
          <div style={{ background: '#ffffff', padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                type="button"
                onClick={() => setShowScannedSheetsFullScreen(false)}
                style={{ border: 'none', background: '#f1f5f9', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>📋 Scanned Student Sheets</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Exam: {exam.title} ({existingSubmissions.length} scanned)
                </p>
              </div>
            </div>

            <button 
              onClick={() => setShowScannedSheetsFullScreen(false)}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: '16px', maxWidth: '800px', margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by student name or roll..."
                value={scannedSheetSearch}
                onChange={(e) => setScannedSheetSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 42px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '0.92rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Student Scanned List */}
            {filteredSubmissions.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <FileText size={40} className="mb-2" style={{ opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No scanned student sheets found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                 {filteredSubmissions.map((sub) => {
                  const student = students.find(s => s.id === sub.studentId);
                  const cleanName = student ? student.name.split('/')[0].trim() : 'Unknown Candidate';
                  const rollNo = student ? student.studentNum : 'N/A';

                  // Calculate correct and wrong counts dynamically for virtual OMR bubble map fallback
                  const correctKey = (exam.answerKeys && exam.answerKeys[sub.bookletSet || 'A']) || exam.answerKey || {};
                  let correctCount = 0;
                  let wrongCount = 0;
                  for (let q = 1; q <= exam.numQuestions; q++) {
                    const sAns = sub.answers[q] || '';
                    const cAns = correctKey[q] || '';
                    if (sAns !== '') {
                      if (isAnswerMatch(sAns, cAns)) {
                        correctCount++;
                      } else {
                        wrongCount++;
                      }
                    }
                  }

                  return (
                    <div 
                      key={`sub-full-${sub.id}`}
                      style={{ padding: '16px', borderRadius: '16px', border: '1px solid #cbd5e1', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                    >
                      {/* Top Row: Avatar and Details */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#ebf8ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.05rem' }}>
                          {cleanName.charAt(0)}
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{cleanName}</h4>
                          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Roll: {rollNo} | Booklet Set: {sub.bookletSet || 'A'}</span>
                        </div>
                      </div>

                      {/* Bottom Row: Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ padding: '6px 12px', background: '#e6f4ea', color: '#137333', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid #c2e7d9' }}>
                          <CheckCircle size={15} />
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1.1' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>Σ {sub.score.toFixed(1)}</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.9 }}>Marks</span>
                          </div>
                        </span>

                        <button
                          type="button"
                          onClick={async () => {
                            let imgUrl = sub.omrImageUrl;
                            if (!imgUrl && sub.id) {
                              const fromDb = await db.submissions.get(sub.id);
                              imgUrl = fromDb?.omrImageUrl || '';
                            }
                            setViewingOmrModalUrl({ 
                              name: cleanName, 
                              url: imgUrl || undefined, 
                              score: sub.score,
                              answers: sub.answers,
                              correctCount: correctCount,
                              wrongCount: wrongCount,
                              bookletSet: sub.bookletSet
                            });
                          }}
                          style={{ padding: '8px 16px', borderRadius: '12px', background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', flex: 1 }}
                        >
                          <Eye size={15} /> View Sheet
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            let fullSub = sub;
                            if (!sub.omrImageUrl && sub.id) {
                              const fromDb = await db.submissions.get(sub.id);
                              if (fromDb) fullSub = fromDb;
                            }
                            setEditingSubmission(fullSub);
                          }}
                          style={{ padding: '8px 16px', borderRadius: '12px', background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                        >
                          ✏️ Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* FALLBACK VIRTUAL BUBBLE MAP MODAL OVERLAY */}
          {viewingOmrModalUrl && !viewingOmrModalUrl.url && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📄 {viewingOmrModalUrl.name}'s Scanned OMR Sheet</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>Score: {viewingOmrModalUrl.score.toFixed(1)} Marks</p>
                </div>
                <button 
                  onClick={() => setViewingOmrModalUrl(null)}
                  style={{ background: '#334155', color: '#ffffff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: '10px' }}>
                {/* Graded Bubble Response Map */}
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
                      Graded Score: <span style={{ color: '#059669', fontWeight: 800 }}>{viewingOmrModalUrl.score} Marks</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem' }}>
                      <span style={{ color: '#059669', fontWeight: 600 }}>🟢 Correct: {viewingOmrModalUrl.correctCount || 0}</span>
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>🔴 Incorrect: {viewingOmrModalUrl.wrongCount || 0}</span>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>⚫ Unanswered: {exam.numQuestions - (viewingOmrModalUrl.correctCount || 0) - (viewingOmrModalUrl.wrongCount || 0)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                    {Array.from({ length: exam.numQuestions }, (_, i) => i + 1).map((qNum) => {
                      const studentAns = viewingOmrModalUrl.answers?.[qNum] || '';
                      const sheetSet = viewingOmrModalUrl.bookletSet || 'A';
                      const correctKey = exam.answerKeys?.[sheetSet] || exam.answerKey || {};
                      const correctAns = correctKey[qNum] || '';
                      
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
                              const studentPicks = studentAns.split(',').map(s => s.trim()).filter(Boolean);
                              const isStudentPick = studentPicks.includes(opt);
                              const isMultiple = studentPicks.length > 1;
                              const isCorrect = !isMultiple && correctAns === opt;
                              
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
                                  bubbleStyle.background = '#10b981';
                                  bubbleStyle.borderColor = '#10b981';
                                  bubbleStyle.color = '#ffffff';
                                } else {
                                  bubbleStyle.background = '#ef4444';
                                  bubbleStyle.borderColor = '#ef4444';
                                  bubbleStyle.color = '#ffffff';
                                }
                              } else if (correctAns === opt) {
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
              </div>
            </div>
          )}
        </div>
      )}

      {editingSubmission && (
        <EditScannedSheetModal
          sub={editingSubmission}
          exam={exam}
          students={students}
          onClose={() => setEditingSubmission(null)}
          refreshSubmissions={refreshSubmissions}
        />
      )}

      {/* LIVE CAMERA MODAL OVERLAY */}
      {showCameraModal && (
        <div className="camera-fullscreen-overlay">
          <div className="clean-app-bar">
            <div className="clean-app-bar-left">
              <button 
                type="button"
                className="clean-back-btn" 
                onClick={() => {
                  stopCameraStream();
                  setShowCameraModal(false);
                }}
                title="Exit Camera Scanner"
              >
                <ArrowLeft size={22} />
              </button>
              <div className="clean-app-bar-titles">
                <h3>📷 {exam.title}</h3>
                <p>{exam.className || 'Live Camera Scanner'}</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* ⚡ Auto Save Mode Toggle Button */}
              <button
                type="button"
                onClick={toggleAutoSave}
                style={{
                  background: autoSaveEnabled ? 'linear-gradient(135deg, #10b981, #059669)' : '#f1f5f9',
                  color: autoSaveEnabled ? '#ffffff' : '#475569',
                  border: autoSaveEnabled ? '1px solid #059669' : '1px solid #cbd5e1',
                  borderRadius: '16px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s',
                  boxShadow: autoSaveEnabled ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none'
                }}
                title="Toggle Instant Auto Save after scanning"
              >
                <Zap size={13} fill={autoSaveEnabled ? '#fff' : 'none'} />
                <span>Auto Save: {autoSaveEnabled ? 'ON' : 'OFF'}</span>
              </button>

              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  style={{
                    background: isTorchOn ? 'var(--primary)' : '#f1f5f9',
                    color: isTorchOn ? '#fff' : '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '16px',
                    padding: '4px 10px',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                  title="Toggle Flashlight / Torch"
                >
                  <Zap size={13} fill={isTorchOn ? '#fff' : 'none'} />
                  <span>{isTorchOn ? 'Flash On' : 'Flash Off'}</span>
                </button>
              )}

              {cameraDevices.length > 1 && (
                <select 
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '16px', padding: '4px 8px', fontSize: '0.76rem', fontWeight: 600 }}
                >
                  {cameraDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="clean-camera-viewport">
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} className="live-stream"></video>
            
            {/* Transparent overlay canvas for drawing the detected corners and guide outline */}
            <canvas ref={overlayCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', zIndex: 10 }}></canvas>

            {/* Instant Green Auto-Save Flash Confirmation Overlay */}
            {autoSaveFlash && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(34, 197, 94, 0.25)',
                border: '4px solid #22c55e',
                zIndex: 45,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'fadeIn 0.15s ease-out'
              }}>
                <div style={{
                  background: 'rgba(22, 163, 74, 0.95)',
                  color: '#ffffff',
                  padding: '10px 20px',
                  borderRadius: '24px',
                  fontWeight: 800,
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                }}>
                  <CheckCircle size={22} />
                  <span>SAVED & READY FOR NEXT SCAN</span>
                </div>
              </div>
            )}

            {/* Live Instant Misalignment Alert Banner */}
            {cameraErrorMessage && (
              <div style={{
                position: 'absolute',
                top: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(220, 38, 38, 0.94)',
                color: '#ffffff',
                padding: '10px 18px',
                borderRadius: '24px',
                fontSize: '0.82rem',
                fontWeight: 700,
                zIndex: 40,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                textAlign: 'center',
                maxWidth: '92%',
                animation: 'fadeIn 0.2s ease-out'
              }}>
                <AlertTriangle size={18} />
                <span>{cameraErrorMessage}</span>
              </div>
            )}

            {/* Dynamic Status Indicator Overlay */}
            <div style={{ 
              position: 'absolute', 
              top: '8px', 
              left: '50%', 
              transform: 'translateX(-50%)', 
              zIndex: 20, 
              padding: '4px 10px', 
              borderRadius: '8px', 
              background: detectorStatus === 'ready' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(15, 23, 42, 0.85)', 
              backdropFilter: 'blur(6px)',
              color: '#ffffff', 
              fontWeight: 700, 
              fontSize: '0.68rem', 
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: detectorStatus === 'ready' ? '1px solid #34d399' : (detectorStatus === 'invalid-length' ? '1px solid #f97316' : '1px solid rgba(255,255,255,0.15)'),
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}>
              {detectorStatus === 'ready' ? (
                <>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', animation: 'ping 1s infinite' }}></span>
                  🟢 READY (HOLD STILL)
                </>
              ) : detectorStatus === 'invalid-length' ? (
                <>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#f97316' }}></span>
                  ⚠️ ALIGN SHEET PROPERLY
                </>
              ) : (
                <>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }}></span>
                  🔍 ALIGN OMR SHEET
                </>
              )}
            </div>

            {/* 📋 Floating Persistent Candidate Scorecard Bar (Stays until next sheet is scanned) */}
            {lastScannedStudentBar && (
              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '92%',
                maxWidth: '460px',
                background: 'rgba(15, 23, 42, 0.94)',
                backdropFilter: 'blur(12px)',
                borderRadius: '14px',
                padding: '10px 14px',
                color: '#ffffff',
                zIndex: 35,
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ 
                      background: '#16a34a', 
                      color: '#ffffff', 
                      fontSize: '0.62rem', 
                      fontWeight: 800, 
                      padding: '2px 6px', 
                      borderRadius: '5px',
                      letterSpacing: '0.5px'
                    }}>
                      SAVED
                    </span>
                    <span style={{ fontSize: '0.86rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Roll: {lastScannedStudentBar.studentNum || 'N/A'} • {lastScannedStudentBar.studentName}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px' }}>
                    Score: <strong style={{ color: '#38bdf8' }}>{lastScannedStudentBar.score.toFixed(1)}</strong> Marks ({lastScannedStudentBar.correctCount} Correct, {lastScannedStudentBar.wrongCount} Wrong)
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEvalbeeReviewData(lastScannedStudentBar);
                    setIsEditingEvalbeeBubbles(true);
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(37,99,235,0.4)'
                  }}
                  title="Edit bubbles / roll number of this scanned sheet"
                >
                  <Edit3 size={13} /> Edit
                </button>
              </div>
            )}

          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        </div>
      )}

      {/* Duplicate Scan Warning Modal */}
      {duplicateWarning && (
        <DuplicateScanWarningModal
          warning={duplicateWarning}
          students={students}
          exam={exam}
          editRollInput={editRollInput}
          setEditRollInput={setEditRollInput}
          isEditingRoll={isEditingRollInDuplicateModal}
          setIsEditingRoll={setIsEditingRollInDuplicateModal}
          onOverwrite={handleOverwriteDuplicate}
          onSaveWithNewRoll={handleSaveWithNewRoll}
          onDiscard={handleDiscardDuplicate}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 3: EVALBEE VISUAL QUESTION BUBBLE EDITOR MODAL (SCREENSHOT 3)
          ═══════════════════════════════════════════════════════════════════ */}
      {evalbeeReviewData && isEditingEvalbeeBubbles && (
        <EvalbeeQuestionBubbleEditorModal
          scanData={evalbeeReviewData}
          exam={exam}
          students={students}
          onCancel={() => setIsEditingEvalbeeBubbles(false)}
          onSaveEdited={async (updated: EvalbeeScanData) => {
            setEvalbeeReviewData(updated);
            await handleSaveEvalbeeScan(updated);
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 2: EVALBEE RESULT OVERVIEW MODAL (SCREENSHOT 2)
          ═══════════════════════════════════════════════════════════════════ */}
      {evalbeeReviewData && !isEditingEvalbeeBubbles && (
        <EvalbeeResultModal
          scanData={evalbeeReviewData}
          exam={exam}
          students={students}
          onCancel={() => {
            setEvalbeeReviewData(null);
            lastCaptureTimeRef.current = Date.now();
          }}
          onEdit={() => setIsEditingEvalbeeBubbles(true)}
          onSave={handleSaveEvalbeeScan}
        />
      )}

    </div>
  );
};

interface DuplicateScanWarningModalProps {
  warning: {
    existingSubmission: ExamSubmission;
    existingStudentName: string;
    detectedRollNum: string;
    newScanData: {
      score: number;
      correctCount: number;
      wrongCount: number;
      unansweredCount: number;
      answers: Record<number, string>;
      bookletSet: string;
      omrImageUrl: string;
      studentId: number | null;
      rawTranscribedName?: string;
      rawTranscribedFatherName?: string;
    };
  };
  students: Student[];
  exam: Exam;
  editRollInput: string;
  setEditRollInput: (val: string) => void;
  isEditingRoll: boolean;
  setIsEditingRoll: (val: boolean) => void;
  onOverwrite: () => void;
  onSaveWithNewRoll: () => void;
  onDiscard: () => void;
}

export const DuplicateScanWarningModal: React.FC<DuplicateScanWarningModalProps> = ({
  warning,
  students,
  exam,
  editRollInput,
  setEditRollInput,
  isEditingRoll,
  setIsEditingRoll,
  onOverwrite,
  onSaveWithNewRoll,
  onDiscard
}) => {
  const classStudents = students.filter(s => s.className === exam.className);
  const cleanInput = editRollInput.trim().replace(/^0+/, '');
  const matchedStudentByRoll = cleanInput 
    ? classStudents.find(s => s.studentNum.replace(/^0+/, '') === cleanInput)
    : null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        maxWidth: '520px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        border: '1px solid #fed7aa',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Modal Header */}
        <div style={{
          background: '#fff7ed',
          padding: '18px 22px',
          borderBottom: '1px solid #fed7aa',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            background: '#ffedd5',
            color: '#c2410c',
            borderRadius: '10px',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#9a3412' }}>
              Duplicate Student Record Found
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#c2410c' }}>
              A scanned submission for Roll No: <strong>{warning.detectedRollNum}</strong> already exists.
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 22px' }}>
          
          {/* Comparison Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
            {/* Existing Card */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '12px'
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                📁 Existing Record
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {warning.existingStudentName}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
                  {warning.existingSubmission.score.toFixed(1)}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Marks</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                Scanned: {warning.existingSubmission.scannedAt ? new Date(warning.existingSubmission.scannedAt).toLocaleDateString() : 'Previously'}
              </div>
            </div>

            {/* New Scanned Card */}
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '12px'
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', marginBottom: '4px' }}>
                ✨ Newly Scanned Sheet
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e40af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Roll No: {warning.detectedRollNum}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb' }}>
                  {warning.newScanData.score.toFixed(1)}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#2563eb' }}>Marks</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#3b82f6', marginTop: '4px', display: 'flex', gap: '6px' }}>
                <span>🟢 {warning.newScanData.correctCount}</span>
                <span>🔴 {warning.newScanData.wrongCount}</span>
                <span>⚫ {warning.newScanData.unansweredCount}</span>
              </div>
            </div>
          </div>

          {/* Edit Roll Input Accordion */}
          {isEditingRoll ? (
            <div style={{
              background: '#fefce8',
              border: '1px solid #fef08a',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '16px'
            }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#854d0e', marginBottom: '6px' }}>
                Assign to a different Roll Number:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Enter new Roll Number..."
                  value={editRollInput}
                  onChange={(e) => setEditRollInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ca8a04',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    outline: 'none',
                    background: '#ffffff'
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={onSaveWithNewRoll}
                  style={{
                    background: '#eab308',
                    color: '#713f12',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Save
                </button>
              </div>
              {matchedStudentByRoll && (
                <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#15803d', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <UserCheck size={14} /> Matches Student: <strong>{matchedStudentByRoll.name}</strong>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '0.86rem', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.45 }}>
              Choose whether to overwrite the existing score with this new scan, assign this sheet to a different roll number, or discard this scan.
            </p>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              onClick={onOverwrite}
              style={{
                width: '100%',
                padding: '11px 16px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.92rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37,99,235,0.25)'
              }}
            >
              <RefreshCw size={16} /> Update / Overwrite Existing Record
            </button>

            <button
              type="button"
              onClick={() => setIsEditingRoll(!isEditingRoll)}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: isEditingRoll ? '#f1f5f9' : '#fffbeb',
                color: '#b45309',
                border: '1px solid #fde68a',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <Edit3 size={16} /> {isEditingRoll ? 'Cancel Roll Number Change' : 'Edit Roll Number for this Sheet'}
            </button>

            <button
              type="button"
              onClick={onDiscard}
              style={{
                width: '100%',
                padding: '9px 16px',
                background: '#ffffff',
                color: '#ef4444',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.86rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <X size={15} /> Discard New Scan (Keep Existing Record)
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

interface EditScannedSheetModalProps {
  sub: ExamSubmission;
  exam: Exam;
  students: Student[];
  onClose: () => void;
  refreshSubmissions: () => void;
}

export const EditScannedSheetModal: React.FC<EditScannedSheetModalProps> = ({ sub, exam, students, onClose, refreshSubmissions }) => {
  const [rollOrSearchInput, setRollOrSearchInput] = useState(() => {
    if (sub.studentId > 0) {
      const s = students.find(item => item.id === sub.studentId);
      return s ? s.studentNum : '';
    }
    return sub.detectedRollNum || '';
  });

  const [selectedBookletSet, setSelectedBookletSet] = useState(sub.bookletSet || 'A');
  const [editedAnswers, setEditedAnswers] = useState<Record<number, string>>(() => ({ ...sub.answers }));

  // Find currently selected student
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(() => {
    if (sub.studentId > 0) {
      return students.find(item => item.id === sub.studentId) || null;
    }
    return null;
  });

  // Calculate search suggestions of class students matching input
  const classStudents = students.filter(s => s.className === exam.className);
  const searchResults = rollOrSearchInput.trim() === '' ? [] : classStudents.filter(s => {
    const term = rollOrSearchInput.trim().toLowerCase();
    return s.studentNum.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
  });

  // Handle manual option bubble toggle
  const handleBubbleClick = (qNum: number, opt: string) => {
    setEditedAnswers(prev => {
      const copy = { ...prev };
      const current = (copy[qNum] || '').split(',').map(s => s.trim()).filter(Boolean);
      if (current.length > 1) {
        // If multiple were detected (e.g. A,B), clicking on an option resolves it to that single option
        copy[qNum] = opt;
      } else if (current.includes(opt)) {
        // If single selected option clicked again, clear it (leave unattempted)
        copy[qNum] = '';
      } else {
        // Select the new option
        copy[qNum] = opt;
      }
      return copy;
    });
  };

  // Recalculate score based on current editedAnswers and bookletSet
  const calculateScore = () => {
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    let correctKey = (exam.answerKeys && exam.answerKeys[selectedBookletSet]) || exam.answerKey;
    if (!correctKey || Object.keys(correctKey).length === 0) {
      correctKey = exam.answerKey;
    }

    if (exam.sections && exam.sections.length > 0) {
      exam.sections.forEach((sec: any) => {
        const secCorrectMarks = sec.correctMarks ?? 4;
        const secIncorrectMarks = sec.incorrectMarks ?? -1;
        const secUnansweredMarks = sec.unansweredMarks ?? 0;
        const qNums: number[] = Array.from({ length: sec.qCount }, (_, k) => sec.qStart + k);

        if (sec.allowOptionalAttempts && sec.maxAttempts) {
          const attempted: Array<{ q: number; ans: string }> = [];
          qNums.forEach(q => {
            const ans = editedAnswers[q] || '';
            if (ans !== '') attempted.push({ q, ans });
          });

          const evaluated = attempted.slice(0, sec.maxAttempts);
          evaluated.forEach(item => {
            const correctAns = correctKey[item.q] || '';
            if (isAnswerMatch(item.ans, correctAns)) {
              score += secCorrectMarks;
              correctCount++;
            } else {
              score += secIncorrectMarks;
              wrongCount++;
            }
          });

          const unansweredForSec = sec.qCount - evaluated.length;
          unansweredCount += unansweredForSec;
          score += unansweredForSec * secUnansweredMarks;
        } else {
          qNums.forEach(q => {
            const studentAns = editedAnswers[q] || '';
            const correctAns = correctKey[q] || '';
            if (studentAns === '') {
              score += secUnansweredMarks;
              unansweredCount++;
            } else if (isAnswerMatch(studentAns, correctAns)) {
              score += secCorrectMarks;
              correctCount++;
            } else {
              score += secIncorrectMarks;
              wrongCount++;
            }
          });
        }
      });
    } else {
      const cMarks = exam.correctMarks ?? 4;
      const iMarks = exam.incorrectMarks ?? -1;
      const uMarks = exam.unansweredMarks ?? 0;

      for (let q = 1; q <= exam.numQuestions; q++) {
        const studentAns = editedAnswers[q] || '';
        const correctAns = correctKey[q] || '';

        if (studentAns === '') {
          score += uMarks;
          unansweredCount++;
        } else if (isAnswerMatch(studentAns, correctAns)) {
          score += cMarks;
          correctCount++;
        } else {
          score += iMarks;
          wrongCount++;
        }
      }
    }

    return { score, correctCount, wrongCount, unansweredCount };
  };

  const { score: liveScore, correctCount, wrongCount, unansweredCount } = calculateScore();

  const handleSave = async () => {
    // If saving as unknown student, we keep a negative student ID.
    // If saving as a real student, we get the selectedStudent.id!
    const targetStudentId = selectedStudent ? selectedStudent.id! : sub.studentId;

    try {
      if (exam.id) {
        // Run database saves and trigger cloud updates immediately in background
        if (targetStudentId !== sub.studentId) {
          // Delete old local
          if (sub.id) {
            await db.submissions.delete(sub.id);
          } else {
            await db.submissions.where('[examId+studentId]').equals([exam.id!, sub.studentId!]).delete();
          }
          
          // Trigger old cloud deletion in background
          if (sub.studentId > 0 && sub.id) {
            import('../utils/cloudSync').then(({ deleteSubmissionFromCloud }) => {
              deleteSubmissionFromCloud(sub.id!).catch(console.warn);
            });
          }

          // Add new local
          const newSubId = await db.submissions.add({
            examId: exam.id!,
            studentId: targetStudentId,
            score: liveScore,
            answers: editedAnswers,
            bookletSet: selectedBookletSet,
            omrImageUrl: sub.omrImageUrl,
            scannedAt: new Date(),
            detectedRollNum: sub.detectedRollNum || rollOrSearchInput
          });

          // Trigger new cloud sync in background
          if (targetStudentId > 0) {
            import('../utils/cloudSync').then(({ syncSubmissionToCloud }) => {
              db.submissions.get(newSubId).then(savedSub => {
                if (savedSub) syncSubmissionToCloud(savedSub).catch(console.warn);
              });
            });
          }
        } else {
          // Modify local
          if (sub.id) {
            await db.submissions.update(sub.id, {
              score: liveScore,
              answers: editedAnswers,
              bookletSet: selectedBookletSet,
              detectedRollNum: sub.detectedRollNum || rollOrSearchInput
            });
          } else {
            await db.submissions.where('[examId+studentId]').equals([exam.id!, sub.studentId!]).modify({
              score: liveScore,
              answers: editedAnswers,
              bookletSet: selectedBookletSet,
              detectedRollNum: sub.detectedRollNum || rollOrSearchInput
            });
          }

          // Trigger cloud sync in background
          if (sub.studentId > 0) {
            import('../utils/cloudSync').then(({ syncSubmissionToCloud }) => {
              const queryPromise = sub.id 
                ? db.submissions.get(sub.id) 
                : db.submissions.where('[examId+studentId]').equals([exam.id!, sub.studentId!]).first();
              queryPromise.then(updatedSub => {
                if (updatedSub) syncSubmissionToCloud(updatedSub).catch(console.warn);
              });
            });
          }
        }

        // Trigger pull cloud updates in background
        import('../utils/cloudSync').then(({ pullCloudUpdatesToIndexedDB }) => {
          pullCloudUpdatesToIndexedDB();
        });

        // Trigger visual success feedback & close modal immediately!
        confetti({ particleCount: 40, spread: 60 });
        refreshSubmissions();
        onClose();
      }
    } catch (err: any) {
      alert('Failed to save changes: ' + err.message);
    }
  };

  // Generate Booklet Sets Options ('A', 'B', 'C', 'D'...)
  const setsCount = exam.examSetsCount ?? 1;
  const bookletSets = Array.from({ length: setsCount }, (_, i) => String.fromCharCode(65 + i));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: '#ffffff',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#0f172a'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>✏️ Edit Scanned Sheet</h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Exam: {exam.title}</p>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: '#f1f5f9', 
              color: '#334155',
              border: 'none', 
              borderRadius: '50%', 
              width: '36px', 
              height: '36px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              fontSize: '1rem',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Top Panel Controls: Student Selection, Set Selection, Live Score */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            
            {/* Roll Number or Student Search input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Roll No / Student Search</label>
              <input
                type="text"
                value={rollOrSearchInput}
                placeholder="Type Roll or Search Name..."
                onChange={(e) => {
                  const val = e.target.value;
                  setRollOrSearchInput(val);
                  // Auto match if exact match roll number
                  const match = classStudents.find(s => s.studentNum.trim().toLowerCase() === val.trim().toLowerCase());
                  if (match) {
                    setSelectedStudent(match);
                  } else {
                    setSelectedStudent(null);
                  }
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  outline: 'none',
                  fontWeight: 600
                }}
              />
              
              {/* Matched Student indicator */}
              <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '4px' }}>
                {selectedStudent ? (
                  <span style={{ color: '#10b981' }}>🟢 Matched: {selectedStudent.name} (Roll: {selectedStudent.studentNum})</span>
                ) : (
                  <span style={{ color: '#ef4444' }}>🔴 Unmatched: Unknown Candidate</span>
                )}
              </div>

              {/* Suggestions dropdown */}
              {searchResults.length > 0 && !selectedStudent && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 10,
                  maxHeight: '150px',
                  overflowY: 'auto',
                  marginTop: '4px'
                }}>
                  {searchResults.map(s => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedStudent(s);
                        setRollOrSearchInput(s.studentNum);
                      }}
                      style={{
                        padding: '8px 12px',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f1f5f9',
                        fontWeight: 600
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {s.name} (Roll: {s.studentNum})
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Booklet Set selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Booklet Set</label>
              <select
                value={selectedBookletSet}
                onChange={(e) => setSelectedBookletSet(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  outline: 'none',
                  fontWeight: 600,
                  background: '#ffffff'
                }}
              >
                {bookletSets.map(set => (
                  <option key={set} value={set}>Set {set}</option>
                ))}
              </select>
            </div>

            {/* Dynamic Score Indicator */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Calculated Score</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>
                {liveScore.toFixed(1)} Marks
              </span>
              <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', marginTop: '4px', fontWeight: 700 }}>
                <span style={{ color: '#10b981' }}>🟢 R: {correctCount}</span>
                <span style={{ color: '#ef4444' }}>🔴 W: {wrongCount}</span>
                <span style={{ color: '#64748b' }}>⚫ L: {unansweredCount}</span>
              </div>
            </div>

          </div>

          {/* Answer Bubble Editing Area */}
          <div>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 800, color: '#334155' }}>
              📝 Edit Bubble Responses
            </h4>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#64748b' }}>
              Click on a bubble to toggle selection. Click on the selected bubble again to leave it blank (unanswered).
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '14px 12px',
              maxHeight: '40vh',
              overflowY: 'auto',
              padding: '4px',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              background: '#f8fafc'
            }}>
              {Array.from({ length: exam.numQuestions }, (_, i) => {
                const qNum = i + 1;
                const studentAns = editedAnswers[qNum] || '';
                const studentPicks = studentAns.split(',').map(s => s.trim()).filter(Boolean);
                const isMultiple = studentPicks.length > 1;
                
                // Determine option list for this question
                const sec = exam.sections?.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
                const is5Option = sec && sec.questionType === '5 option';
                const options = is5Option ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];

                return (
                  <div 
                    key={`edit-q-${qNum}`} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      gap: '8px', 
                      padding: '6px 10px', 
                      background: isMultiple ? '#fff1f2' : '#ffffff', 
                      borderRadius: '8px', 
                      border: isMultiple ? '1px solid #fecaca' : '1px solid #e2e8f0' 
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: '24px', color: isMultiple ? '#dc2626' : '#64748b' }}>
                        {String(qNum).padStart(2, '0')}.
                      </span>
                      {isMultiple && (
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '1px 4px', borderRadius: '4px', whiteSpace: 'nowrap' }} title="Multiple bubbles detected on sheet">
                          Multi ({studentPicks.join(',')})
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {options.map((opt) => {
                        const isStudentPick = studentPicks.includes(opt);
                        
                        let bubbleStyle: React.CSSProperties = {
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          border: isStudentPick 
                            ? (isMultiple ? '1.5px solid #dc2626' : '1.5px solid #2563eb')
                            : '1.5px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: isStudentPick ? '#ffffff' : '#475569',
                          background: isStudentPick 
                            ? (isMultiple ? '#ef4444' : '#2563eb')
                            : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 0.1s ease',
                          userSelect: 'none'
                        };

                        return (
                          <div
                            key={opt}
                            onClick={() => handleBubbleClick(qNum, opt)}
                            style={bubbleStyle}
                            onMouseEnter={(e) => {
                              if (!isStudentPick) {
                                e.currentTarget.style.borderColor = '#2563eb';
                                e.currentTarget.style.backgroundColor = '#eff6ff';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isStudentPick) {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                          >
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

        </div>

        {/* Footer Actions */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f8fafc' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#ffffff',
              color: '#475569',
              border: '1px solid #cbd5e1',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.2)'
            }}
          >
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
};
