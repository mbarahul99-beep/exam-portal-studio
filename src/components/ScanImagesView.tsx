import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Camera,
  ArrowLeft,
  RotateCcw, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  Eye,
  Search,
  CheckCircle,
  FileText
} from 'lucide-react';
import { db, type Exam, type Student, type ExamSubmission } from '../db';
import { scanOMRSheet, findOMRSheetCornersLive, getDynamicOMRQuestionLayout, getColumnSlots } from '../utils/omrScanner';
import confetti from 'canvas-confetti';
import { syncSubmissionToCloud, pullCloudUpdatesToIndexedDB } from '../utils/cloudSync';

// Helper function to draw green/red overlays on scanned OMR image bubbles
function drawOverlayOnWarpedCanvas(
  canvas: HTMLCanvasElement,
  numQuestions: number,
  answers: Record<number, string>,
  correctKey: Record<number, string>,
  bestDy: number,
  sections: any[]
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
    const y = colConf.yStart + slotIndex * qConf.yStep + bestDy;

    const studentAns = answers[q] || '';
    const correctAns = correctKey[q] || '';

    const optionChars = ['A', 'B', 'C', 'D', 'E'];

    for (let optIdx = 0; optIdx < numOptions; optIdx++) {
      const optChar = optionChars[optIdx];
      const x = optIdx === 4 ? colConf.xOptions[3] + 25 : colConf.xOptions[optIdx];

      const isStudentPick = studentAns === optChar;
      const isCorrectOption = correctAns === optChar;

      if (isStudentPick) {
        if (studentAns === correctAns) {
          // Correct choice: Green
          ctx.beginPath();
          ctx.arc(x, y, bubbleRadius + 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
          ctx.fill();
          ctx.strokeStyle = '#16a34a';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // Incorrect choice: Red
          ctx.beginPath();
          ctx.arc(x, y, bubbleRadius + 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
          ctx.fill();
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (isCorrectOption && studentAns !== '') {
        // Correct answer (when student chose wrong): thin green circle outline
        ctx.beginPath();
        ctx.arc(x, y, bubbleRadius + 1.5, 0, 2 * Math.PI);
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
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
  const [cvLoaded, setCvLoaded] = useState(false);

  // Scanned Submissions & Full-Screen View Sheets Mode
  const [existingSubmissions, setExistingSubmissions] = useState<ExamSubmission[]>([]);
  const [showScannedSheetsFullScreen, setShowScannedSheetsFullScreen] = useState(false);
  const [scannedSheetSearch, setScannedSheetSearch] = useState('');
  const [viewingOmrModalUrl, setViewingOmrModalUrl] = useState<{ name: string; url?: string; score: number; answers?: Record<number, string>; correctCount?: number; wrongCount?: number; bookletSet?: string } | null>(null);

  // Camera Modal States & Refs
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisRequestRef = useRef<number | null>(null);
  const [detectorStatus, setDetectorStatus] = useState<'searching' | 'aligning' | 'ready'>('searching');
  const isScanningRef = useRef<boolean>(false);
  const stableFramesRef = useRef<number>(0);
  const prevCornersRef = useRef<Array<{ x: number; y: number }> | null>(null);

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
  } | null>(null);
  const [isEditingOverlayRoll, setIsEditingOverlayRoll] = useState(false);
  const [overlayRollInput, setOverlayRollInput] = useState('');
  const classStudents = students.filter(s => s.className === exam.className);
  const maxClassSheets = classStudents.length > 0 ? classStudents.length : Infinity;
  const scannedCount = existingSubmissions.length;
  const isClassLimitReached = maxClassSheets !== Infinity && (fileList.length >= maxClassSheets || scannedCount >= maxClassSheets);

  const refreshSubmissions = async () => {
    try {
      const subs = await db.submissions.where('examId').equals(exam.id!).toArray();
      const map = new Map<number, ExamSubmission>();
      subs.forEach(s => {
        if (!map.has(s.studentId) || (s.id && s.id > (map.get(s.studentId)?.id || 0))) {
          map.set(s.studentId, s);
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

  // Play shutter sound feedback
  const playShutterSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
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
        
        // Run corner detection using a lightweight OpenCV helper
        try {
          const corners = findOMRSheetCornersLive(video);
          if (corners) {
            // Draw green bounding polygon
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            ctx.lineTo(corners[1].x, corners[1].y);
            ctx.lineTo(corners[2].x, corners[2].y);
            ctx.lineTo(corners[3].x, corners[3].y);
            ctx.closePath();
            
            ctx.strokeStyle = '#10b981'; // Glowing green outline
            ctx.lineWidth = 8;
            ctx.lineJoin = 'round';
            ctx.stroke();
            
            // Draw glowing translucent fill
            ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
            ctx.fill();
            
            // Draw 4 corner tracking circles
            corners.forEach((pt) => {
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 16, 0, 2 * Math.PI);
              ctx.fillStyle = '#10b981';
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 4;
              ctx.stroke();
            });

            // Motion detection: Check if corners are shifting to prevent captures during movement
            let isMoving = false;
            if (prevCornersRef.current && prevCornersRef.current.length === 4 && corners.length === 4) {
              let totalDistance = 0;
              for (let i = 0; i < 4; i++) {
                const dx = corners[i].x - prevCornersRef.current[i].x;
                const dy = corners[i].y - prevCornersRef.current[i].y;
                totalDistance += Math.sqrt(dx * dx + dy * dy);
              }
              const avgDistance = totalDistance / 4;
              if (avgDistance > 6) {
                isMoving = true;
              }
            }
            prevCornersRef.current = corners;

            if (isMoving) {
              stableFramesRef.current = 0;
            } else if (!isScanningRef.current) {
              stableFramesRef.current += 1;

              // Auto-capture after 3 consecutive stable frames (~50ms) for instant snappy scanning
              if (stableFramesRef.current >= 3) {
                stableFramesRef.current = 0;
                isScanningRef.current = true;
                setIsScanning(true);
                // Call capture asynchronously
                setTimeout(() => {
                  captureCameraPhoto();
                }, 0);
              }
            } else {
              stableFramesRef.current = 0;
            }

            setDetectorStatus('ready');
          } else {
            stableFramesRef.current = 0;
            // No sheet found: draw a centered reference guides overlay
            setDetectorStatus('searching');
            
            // Draw target bracket guide box in the center
            const boxW = vW * 0.65;
            const boxH = boxW * 1.414; // A4 ratio
            const startX = (vW - boxW) / 2;
            const startY = (vH - boxH) / 2;
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 5;
            
            // Draw 4 brackets instead of a complete dashed box to look extremely modern/industry-grade
            const bracketLength = 40;
            
            // Top Left Bracket
            ctx.beginPath();
            ctx.moveTo(startX + bracketLength, startY);
            ctx.lineTo(startX, startY);
            ctx.lineTo(startX, startY + bracketLength);
            ctx.stroke();

            // Top Right Bracket
            ctx.beginPath();
            ctx.moveTo(startX + boxW - bracketLength, startY);
            ctx.lineTo(startX + boxW, startY);
            ctx.lineTo(startX + boxW, startY + bracketLength);
            ctx.stroke();

            // Bottom Left Bracket
            ctx.beginPath();
            ctx.moveTo(startX, startY + boxH - bracketLength);
            ctx.lineTo(startX, startY + boxH);
            ctx.lineTo(startX + bracketLength, startY + boxH);
            ctx.stroke();

            // Bottom Right Bracket
            ctx.beginPath();
            ctx.moveTo(startX + boxW - bracketLength, startY + boxH);
            ctx.lineTo(startX + boxW, startY + boxH);
            ctx.lineTo(startX + boxW, startY + boxH - bracketLength);
            ctx.stroke();
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

  // Capture photo from live camera & process with the EXACT SAME OMR PIPELINE!
  const captureCameraPhoto = async () => {
    if (!videoRef.current || !cvLoaded) return;

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

    try {
      const scannerRollDigits = Math.min(3, exam.rollNoDigits ?? 3);
      let cvResult = await scanOMRSheet(
        snapCanvas,
        exam.numQuestions,
        scannerRollDigits,
        exam.examSetsCount ?? 1,
        exam.sections ?? []
      );

      if (cvResult.debugWarpedCanvas) {
        try {
          const pass2 = await scanOMRSheet(
            cvResult.debugWarpedCanvas,
            exam.numQuestions,
            scannerRollDigits,
            exam.examSetsCount ?? 1,
            exam.sections ?? []
          );
          if (pass2 && pass2.answers) cvResult = pass2;
        } catch {}
      }

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
              if (item.ans === correctAns) {
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
              } else if (studentAns === correctAns) {
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
          } else if (studentAns === correctAns) {
            score += cMarks;
            correctCount++;
          } else {
            score += iMarks;
            wrongCount++;
          }
        }
      }

      // Draw green/red overlays on the warped canvas before saving
      if (cvResult.debugWarpedCanvas) {
        drawOverlayOnWarpedCanvas(
          cvResult.debugWarpedCanvas,
          exam.numQuestions,
          cvResult.answers,
          correctKey,
          cvResult.bestDy || 0,
          exam.sections ?? []
        );
      }

      const croppedUrl = cvResult.debugWarpedCanvas 
        ? cvResult.debugWarpedCanvas.toDataURL('image/jpeg', 0.92) 
        : snapCanvas.toDataURL('image/jpeg', 0.92);

      setIsEditingOverlayRoll(false);
      setOverlayRollInput(cvResult.studentNum || '');

      setLastScanOverlay({
        studentName: matchedStudent ? matchedStudent.name : 'Unknown Candidate',
        studentNum: cvResult.studentNum || '',
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        answers: cvResult.answers,
        bookletSet: detectedSet,
        omrImageUrl: croppedUrl,
        studentId: studentId || null
      });

      if (matchedStudent) {
        confetti({ particleCount: 60, spread: 60 });
      }
    } catch (err: any) {
      alert("OMR Scan Error: " + (err.message || "Failed to locate 4 corner anchors. Align sheet inside frame."));
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const currentCount = fileList.length;
    const incomingCount = e.target.files.length;

    if (maxClassSheets !== Infinity && currentCount >= maxClassSheets) {
      alert(`Class limit reached (${maxClassSheets} registered students).`);
      e.target.value = '';
      return;
    }

    let allowedCount = incomingCount;
    if (maxClassSheets !== Infinity && currentCount + incomingCount > maxClassSheets) {
      allowedCount = maxClassSheets - currentCount;
    }

    const newFiles: ScanFileItem[] = [];
    for (let i = 0; i < allowedCount; i++) {
      const f = e.target.files[i];
      newFiles.push({
        id: `file-${Date.now()}-${i}`,
        name: f.name,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: 'Pending'
      });
    }

    setFileList(prev => {
      const updated = [...prev, ...newFiles];
      if (updated.length > 0 && !selectedFileId) {
        setSelectedFileId(updated[updated.length - 1].id);
      }
      return updated;
    });
    e.target.value = '';
  };

  const handleDeleteFile = async (fileId: string) => {
    const target = fileList.find(f => f.id === fileId);
    if (!target) return;

    if (!window.confirm(`Delete sheet record?`)) {
      return;
    }

    try {
      if (target.result && target.result.studentId && exam.id) {
        await db.submissions.where('[examId+studentId]').equals([exam.id, target.result.studentId]).delete();
        try {
          await fetch('/api/admin/delete-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ examId: exam.id, studentId: target.result.studentId })
          });
        } catch (e) {
          console.warn("Cloud deletion warning:", e);
        }
      }

      setFileList(prev => {
        const updated = prev.filter(f => f.id !== fileId);
        if (selectedFileId === fileId) {
          const nextSelected = updated.length > 0 ? updated[updated.length - 1].id : null;
          setSelectedFileId(nextSelected);
          if (nextSelected) {
            const nextItem = updated.find(item => item.id === nextSelected);
            if (nextItem && nextItem.status === 'Scanned' && nextItem.result) {
              setActiveResult(nextItem.result);
              setDetectedStudentId(nextItem.result.studentId || null);
            } else {
              setActiveResult(null);
              setDetectedStudentId(null);
            }
          } else {
            setActiveResult(null);
            setDetectedStudentId(null);
          }
        }
        return updated;
      });

      refreshSubmissions();
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message || err}`);
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
    setActiveResult(null);

    try {
      const img = new Image();
      img.src = current.previewUrl;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      setFileList(prev => prev.map(f => f.id === selectedFileId ? { ...f, status: 'Scanning' } : f));

      const scannerRollDigits = Math.min(3, exam.rollNoDigits ?? 3);
      let cvResult = await scanOMRSheet(
        img,
        exam.numQuestions,
        scannerRollDigits,
        exam.examSetsCount ?? 1,
        exam.sections ?? []
      );

      if (cvResult.debugWarpedCanvas) {
        try {
          const pass2 = await scanOMRSheet(
            cvResult.debugWarpedCanvas,
            exam.numQuestions,
            scannerRollDigits,
            exam.examSetsCount ?? 1,
            exam.sections ?? []
          );
          if (pass2 && pass2.answers) cvResult = pass2;
        } catch {}
      }

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
              if (item.ans === correctAns) {
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
              } else if (studentAns === correctAns) {
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
          } else if (studentAns === correctAns) {
            score += cMarks;
            correctCount++;
          } else {
            score += iMarks;
            wrongCount++;
          }
        }
      }

      // Draw green/red overlays on the warped canvas before saving
      if (cvResult.debugWarpedCanvas) {
        drawOverlayOnWarpedCanvas(
          cvResult.debugWarpedCanvas,
          exam.numQuestions,
          cvResult.answers,
          correctKey,
          cvResult.bestDy || 0,
          exam.sections ?? []
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
    }
  };

  const handleSaveResult = async () => {
    if (!activeResult || !selectedFileId) return;

    if (!detectedStudentId) {
      alert('Please associate scan with a student.');
      return;
    }

    try {
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
              studentId: detectedStudentId
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

      if (exam.id && detectedStudentId) {
        await db.submissions.where('[examId+studentId]').equals([exam.id, detectedStudentId]).delete();
      }

      const subId = await db.submissions.add({
        examId: exam.id!,
        studentId: detectedStudentId,
        score: activeResult.score,
        answers: activeResult.answers,
        bookletSet: activeResult.bookletSet,
        omrImageUrl: finalOmrUrl,
        scannedAt: new Date()
      });

      const savedSub = await db.submissions.get(subId);
      if (savedSub) {
        await syncSubmissionToCloud(savedSub);
      }
      pullCloudUpdatesToIndexedDB();

      alert('Student score saved!');
      refreshSubmissions();

      setFileList(prev => {
        const updated = prev.filter(f => {
          if (f.id === selectedFileId) return false;
          if (f.result) {
            if (detectedStudentId && f.result.studentId === detectedStudentId) return false;
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
          setSelectedFileId('');
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="mobile-grid-1col">
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
                padding: '12px',
                borderRadius: '12px',
                background: isClassLimitReached ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                cursor: isClassLimitReached ? 'not-allowed' : 'pointer',
                boxShadow: isClassLimitReached ? 'none' : '0 4px 12px rgba(37,99,235,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Camera size={16} /> Live Camera Scanner
            </button>

            {/* Upload Files Button */}
            <label
              style={{
                margin: 0,
                padding: '10px 14px',
                borderRadius: '12px',
                background: isClassLimitReached ? '#f1f5f9' : '#f0fdf4',
                border: isClassLimitReached ? '1.5px dashed #cbd5e1' : '1.5px dashed #16a34a',
                color: isClassLimitReached ? '#94a3b8' : '#15803d',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: isClassLimitReached ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 6px rgba(22,163,74,0.08)'
              }}
            >
              <Upload size={16} />
              <span>{isClassLimitReached ? 'Limit Reached' : 'Choose OMR Files'}</span>
              <input 
                type="file" 
                multiple 
                accept="image/*" 
                onChange={handleFileSelect} 
                disabled={isClassLimitReached}
                style={{ display: 'none' }} 
              />
            </label>
          </div>
        </div>

        {/* Middle Section: Selected Image Workspace */}
        {selectedFileId && getSelectedFile() ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-card" style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
              {/* View Controls */}
              <div style={{ position: 'absolute', left: '16px', top: '16px', zIndex: 10, display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.9)', padding: '6px 12px', borderRadius: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <button type="button" onClick={() => setRotation((r) => (r - 90) % 360)} title="Rotate Left" style={{ border: 'none', background: 'none', cursor: 'pointer' }}><RotateCcw size={15} /></button>
                <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate Right" style={{ border: 'none', background: 'none', cursor: 'pointer' }}><RotateCw size={15} /></button>
                <button type="button" onClick={() => setZoom((z) => Math.min(z + 0.2, 2.5))} title="Zoom In" style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ZoomIn size={15} /></button>
                <button type="button" onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))} title="Zoom Out" style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ZoomOut size={15} /></button>
              </div>

              <div style={{ height: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: '#0f172a', padding: '16px' }}>
                <div style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transition: 'transform 0.2s ease', transformOrigin: 'center' }}>
                  <img 
                    src={getSelectedFile()?.previewUrl} 
                    alt="OMR Preview" 
                    style={{ maxHeight: '320px', maxWidth: '100%', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }} 
                  />
                </div>
              </div>
            </div>

            {/* Scan Diagnostics Card */}
            <div className="glass-card scan-diag-card animate-fade-in" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ textAlign: 'left' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>OMR Diagnostic</h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>File: {getSelectedFile()?.name}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {activeResult && (
                    <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                      Score: {activeResult.score} pts
                    </span>
                  )}
                </div>
              </div>

              {activeResult && (
                <div style={{ marginBottom: '14px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Verify/Associate Student (Detected Roll: <code>{activeResult.detectedStudentNum || 'N/A'}</code>)
                  </label>
                  <select 
                    value={detectedStudentId || ''} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setDetectedStudentId(val ? Number(val) : null);
                      const sObj = students.find(s => s.id === Number(val));
                      if (sObj) {
                        setActiveResult((prev: any) => prev ? {
                          ...prev,
                          studentId: sObj.id!,
                          studentName: sObj.name,
                          detectedStudentNum: sObj.studentNum
                        } : null);
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
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.85rem', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    💾 Save Result
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ImageIcon size={32} className="mb-2" style={{ opacity: 0.3 }} />
            <h4 style={{ margin: 0, fontSize: '0.88rem' }}>No OMR Sheet Selected</h4>
            <p style={{ fontSize: '0.78rem', marginTop: '2px' }}>Select a file from the queue below or click "Live Camera Scanner".</p>
          </div>
        )}

        {/* Bottom Section: Scan Queue (rendered below the image workspace!) */}
        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>Scan Queue ({fileList.length})</h4>
          </div>

          {fileList.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              Queue is empty. Scanned sheets are automatically saved and removed from queue.
            </div>
          ) : (
            <table className="clean-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {fileList.map((item) => (
                  <tr 
                    key={item.id} 
                    className={selectedFileId === item.id ? 'active-row' : ''}
                    onClick={() => {
                      setSelectedFileId(item.id);
                      if (item.result) {
                        setActiveResult(item.result);
                        setDetectedStudentId(item.result.studentId || null);
                      } else {
                        setActiveResult(null);
                        setDetectedStudentId(null);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>
                      <span className={`status-badge ${item.status.toLowerCase()}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(item.id);
                        }}
                        style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: '4px' }}
                        title="Delete record"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

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
                      if (sAns === cAns) {
                        correctCount++;
                      } else {
                        wrongCount++;
                      }
                    }
                  }

                  return (
                    <div 
                      key={`sub-full-${sub.id}`}
                      style={{ padding: '14px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#ebf8ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.05rem' }}>
                          {cleanName.charAt(0)}
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-main)' }}>{cleanName}</h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Roll: {rollNo} | Booklet Set: {sub.bookletSet || 'A'}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ padding: '4px 10px', background: '#def7ec', color: '#03543f', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={14} /> ∑ {sub.score.toFixed(1)} Pts
                        </span>

                        <button
                          type="button"
                          onClick={() => setViewingOmrModalUrl({ 
                            name: cleanName, 
                            url: sub.omrImageUrl || undefined, 
                            score: sub.score,
                            answers: sub.answers,
                            correctCount: correctCount,
                            wrongCount: wrongCount,
                            bookletSet: sub.bookletSet
                          })}
                          style={{ padding: '8px 14px', borderRadius: '10px', background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Eye size={15} /> View Sheet
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

      {/* FULL IMAGE VIEWER OVERLAY */}
      {viewingOmrModalUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff', marginBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📄 {viewingOmrModalUrl.name}'s Scanned OMR Sheet</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>Score: {viewingOmrModalUrl.score.toFixed(1)} Pts</p>
            </div>
            <button 
              onClick={() => setViewingOmrModalUrl(null)}
              style={{ background: '#334155', color: '#ffffff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: '10px' }}>
            {viewingOmrModalUrl.url ? (
              <img 
                src={viewingOmrModalUrl.url} 
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
                    Graded Score: <span style={{ color: '#059669', fontWeight: 800 }}>{viewingOmrModalUrl.score} Pts</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem' }}>
                    <span style={{ color: '#059669', fontWeight: 600 }}>🟢 Correct: {viewingOmrModalUrl.correctCount || 0}</span>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>🔴 Incorrect: {viewingOmrModalUrl.wrongCount || 0}</span>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>⚫ Unanswered: {exam.numQuestions - (viewingOmrModalUrl.correctCount || 0) - (viewingOmrModalUrl.wrongCount || 0)}</span>
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

            {cameraDevices.length > 1 && (
              <select 
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '16px', padding: '4px 10px', fontSize: '0.8rem', fontWeight: 600 }}
              >
                {cameraDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
                ))}
              </select>
            )}
          </div>

          <div className="clean-camera-viewport">
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} className="live-stream"></video>
            
            {/* Transparent overlay canvas for drawing the detected corners and guide outline */}
            <canvas ref={overlayCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', zIndex: 10 }}></canvas>

            {/* Dynamic Status Indicator Overlay (Extremely small, clean and mobile friendly) */}
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
              border: detectorStatus === 'ready' ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.15)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}>
              {detectorStatus === 'ready' ? (
                <>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', animation: 'ping 1s infinite' }}></span>
                  🟢 READY (HOLD STILL)
                </>
              ) : (
                <>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }}></span>
                  🔍 ALIGN OMR SHEET
                </>
              )}
            </div>

            {lastScanOverlay && (() => {
              const totalMaxMarks = exam.sections && exam.sections.length > 0
                ? exam.sections.reduce((acc, sec) => acc + ((sec.correctMarks || 4) * sec.qCount), 0)
                : (exam.correctMarks ?? 4) * exam.numQuestions;
              return (
                <div style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  background: 'rgba(255, 255, 255, 0.98)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '16px',
                  padding: '12px 14px',
                  boxShadow: '0 8px 32px rgba(15, 23, 42, 0.25)',
                  zIndex: 40,
                  border: '1px solid rgba(226, 232, 240, 0.9)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  color: '#0f172a'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '4px' }}>
                    <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                      <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lastScanOverlay.studentName.split('/')[0].trim()}
                      </h4>
                      {isEditingOverlayRoll ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Roll:</span>
                          <input 
                            type="text" 
                            value={overlayRollInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOverlayRollInput(val);
                              // Match student by new roll number in this class
                              const matchedStudent = students.find(
                                s => s.studentNum.trim().toLowerCase() === val.trim().toLowerCase() && 
                                     s.className === exam.className
                              );
                              setLastScanOverlay(prev => prev ? {
                                ...prev,
                                studentNum: val,
                                studentId: matchedStudent ? matchedStudent.id! : null,
                                studentName: matchedStudent ? matchedStudent.name : 'Unknown Candidate'
                              } : null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: '2px 6px',
                              fontSize: '0.75rem',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              width: '80px',
                              fontWeight: 700
                            }}
                          />
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                          Roll: {lastScanOverlay.studentNum}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'inline-block' }}>
                        {lastScanOverlay.score} / {totalMaxMarks} M
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        ✔ {lastScanOverlay.correctCount} Right
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b91c1c', background: '#fef2f2', padding: '2px 6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        ✖ {lastScanOverlay.wrongCount} Wrong
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', background: '#f8fafc', padding: '2px 6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                        ➖ {lastScanOverlay.unansweredCount} Left
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        type="button"
                        onClick={() => {
                          setLastScanOverlay(null);
                          isScanningRef.current = false;
                          setIsScanning(false);
                          setIsEditingOverlayRoll(false);
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '8px',
                          background: '#10b981',
                          color: '#ffffff',
                          border: 'none',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          boxShadow: '0 2px 6px rgba(16,185,129,0.2)'
                        }}
                      >
                        Scan Next
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          stopCameraStream();
                          setShowCameraModal(false);
                          setLastScanOverlay(null);
                          isScanningRef.current = false;
                          setIsScanning(false);
                          setIsEditingOverlayRoll(false);
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '8px',
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '0.72rem'
                        }}
                      >
                        Finish
                      </button>
                      {isEditingOverlayRoll ? (
                        <button 
                          type="button"
                          onClick={() => {
                            setIsEditingOverlayRoll(false);
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            background: '#3b82f6',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.72rem'
                          }}
                        >
                          Done
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => {
                            setIsEditingOverlayRoll(true);
                            setOverlayRollInput(lastScanOverlay.studentNum);
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            background: '#e2e8f0',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.72rem'
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={async () => {
                          if (!lastScanOverlay.studentId) {
                            alert('Please enter a valid roll number that matches a registered student before saving.');
                            return;
                          }
                          try {
                            if (exam.id && lastScanOverlay.studentId) {
                              // Check if duplicate submission exists
                              const existingSub = await db.submissions.where('[examId+studentId]').equals([exam.id, lastScanOverlay.studentId]).first();
                              if (existingSub) {
                                if (!window.confirm(`Submission for ${lastScanOverlay.studentName} already exists. Overwrite?`)) {
                                  return;
                                }
                                await db.submissions.where('[examId+studentId]').equals([exam.id, lastScanOverlay.studentId]).delete();
                              }

                              const subId = await db.submissions.add({
                                examId: exam.id!,
                                studentId: lastScanOverlay.studentId,
                                score: lastScanOverlay.score,
                                answers: lastScanOverlay.answers,
                                bookletSet: lastScanOverlay.bookletSet,
                                omrImageUrl: lastScanOverlay.omrImageUrl,
                                scannedAt: new Date()
                              });

                              // Sync submission to Hostinger database in background
                              const savedSub = await db.submissions.get(subId);
                              if (savedSub) {
                                syncSubmissionToCloud(savedSub).catch(console.warn);
                              }
                              pullCloudUpdatesToIndexedDB();
                              refreshSubmissions();
                              alert('Saved successfully!');
                              
                              // Reset state, auto scan next
                              setLastScanOverlay(null);
                              isScanningRef.current = false;
                              setIsScanning(false);
                              setIsEditingOverlayRoll(false);
                            }
                          } catch (err: any) {
                            alert('Error saving submission: ' + err.message);
                          }
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '8px',
                          background: '#3b82f6',
                          color: '#ffffff',
                          border: 'none',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          boxShadow: '0 2px 6px rgba(59,130,246,0.2)'
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        </div>
      )}

    </div>
  );
};
