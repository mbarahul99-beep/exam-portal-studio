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
  CheckCircle,
  FileText
} from 'lucide-react';
import { db, type Exam, type Student, type ExamSubmission } from '../db';
import { scanOMRSheet, findOMRSheetCornersLive, getDynamicOMRQuestionLayout, getColumnSlots, getScaledY } from '../utils/omrScanner';
import confetti from 'canvas-confetti';
import { syncSubmissionToCloud, pullCloudUpdatesToIndexedDB } from '../utils/cloudSync';
import { FullScreenOmrViewer } from './FullScreenOmrViewer';

// Helper to compress and downscale high-res images before API upload
async function compressImage(src: HTMLCanvasElement | string, maxLongEdge = 1000, quality = 0.65): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxLongEdge || height > maxLongEdge) {
        if (width > height) {
          height = Math.round((height * maxLongEdge) / width);
          width = maxLongEdge;
        } else {
          width = Math.round((width * maxLongEdge) / height);
          height = maxLongEdge;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(typeof src === 'string' ? src : src.toDataURL('image/jpeg', quality));
      }
    };
    img.onerror = () => {
      resolve(typeof src === 'string' ? src : src.toDataURL('image/jpeg', quality));
    };
    img.src = typeof src === 'string' ? src : src.toDataURL('image/jpeg', 1.0);
  });
}

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
    const y = getScaledY(colConf.yStart + slotIndex * qConf.yStep, bestDy);

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
  const [isAIScanning, setIsAIScanning] = useState(false);
  const [cameraScanMode, setCameraScanMode] = useState<'standard' | 'ai'>('standard');
  const [hideAiScanning, setHideAiScanning] = useState(false);
  const [cvLoaded, setCvLoaded] = useState(false);

  useEffect(() => {
    const checkSetting = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const settings = await res.json();
          if (settings.hideAiScanning === 'true') {
            setHideAiScanning(true);
            setCameraScanMode('standard');
          }
        }
      } catch (err) {
        console.warn("Failed to check hideAiScanning setting in ScanImagesView:", err);
      }
    };
    checkSetting();
  }, []);

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisRequestRef = useRef<number | null>(null);
  const [detectorStatus, setDetectorStatus] = useState<'searching' | 'aligning' | 'ready'>('searching');
  const isScanningRef = useRef<boolean>(false);
  const stableFramesRef = useRef<number>(0);
  const prevCornersRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const prevTinyFrameRef = useRef<Uint8ClampedArray | null>(null);
  const stableFramesCountRef = useRef<number>(0);
  const lastStabilityCheckRef = useRef<number>(0);
  const lockStartTimeRef = useRef<number | null>(null);

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
        
        // 16x16 motion stability detection for AI Scanner mode
        if (cameraScanMode === 'ai') {
          const now = Date.now();
          if (now - lastStabilityCheckRef.current > 250) {
            lastStabilityCheckRef.current = now;
            
            const tinyCanvas = document.createElement('canvas');
            tinyCanvas.width = 16;
            tinyCanvas.height = 16;
            const tinyCtx = tinyCanvas.getContext('2d');
            if (tinyCtx) {
              tinyCtx.drawImage(video, 0, 0, 16, 16);
              const imgData = tinyCtx.getImageData(0, 0, 16, 16).data;
              
              if (prevTinyFrameRef.current) {
                let diff = 0;
                for (let i = 0; i < imgData.length; i += 4) {
                  diff += Math.abs(imgData[i] - prevTinyFrameRef.current[i]);
                  diff += Math.abs(imgData[i+1] - prevTinyFrameRef.current[i+1]);
                  diff += Math.abs(imgData[i+2] - prevTinyFrameRef.current[i+2]);
                }
                
                const avgDiff = diff / (16 * 16 * 3);
                
                if (avgDiff < 9.0) { // Stable threshold
                  stableFramesCountRef.current += 1;
                  // If stable for 5 checks (1.25s), auto-capture!
                  if (stableFramesCountRef.current >= 5 && !isScanningRef.current && !lastScanOverlay) {
                    stableFramesCountRef.current = 0;
                    isScanningRef.current = true;
                    setIsScanning(true);
                    setTimeout(() => {
                      captureCameraPhoto();
                    }, 0);
                  }
                } else {
                  stableFramesCountRef.current = 0;
                }
              }
              prevTinyFrameRef.current = imgData;
            }
          }
        }

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
              lockStartTimeRef.current = null;
            } else if (!isScanningRef.current) {
              if (lockStartTimeRef.current === null) {
                lockStartTimeRef.current = Date.now();
              }

              const elapsed = Date.now() - lockStartTimeRef.current;
              const progress = Math.min(1.0, elapsed / 1000); // 1-second countdown

              // Draw circular progress countdown loader in the center of the viewport
              const cx = vW / 2;
              const cy = vH / 2;
              const r = 52;

              // 1. Draw glowing transparent background circle ring
              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, 2 * Math.PI);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = 10;
              ctx.stroke();

              // 2. Draw active progress emerald-green arc
              ctx.beginPath();
              ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 10;
              ctx.lineCap = 'round';
              ctx.stroke();

              // 3. Draw central fill circle
              ctx.beginPath();
              ctx.arc(cx, cy, r - 13, 0, 2 * Math.PI);
              ctx.fillStyle = progress >= 1.0 ? '#10b981' : 'rgba(15, 23, 42, 0.45)';
              ctx.fill();

              // 4. Draw countdown text or SNAP label
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 13px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(progress >= 1.0 ? 'SNAP' : `${Math.ceil((1.0 - progress) * 10)}`, cx, cy);

              if (progress >= 1.0) {
                lockStartTimeRef.current = null;
                isScanningRef.current = true;
                setIsScanning(true);
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
            lockStartTimeRef.current = null;
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

    if (cameraScanMode === 'ai') {
      try {
        const scannerRollDigits = Math.min(3, exam.rollNoDigits ?? 3);
        let cvResult: any = null;
        try {
          cvResult = await scanOMRSheet(
            snapCanvas,
            exam.numQuestions,
            scannerRollDigits,
            exam.examSetsCount ?? 1,
            exam.sections ?? []
          );
        } catch (err) {
          console.warn("Local warp alignment failed inside camera AI handler:", err);
        }

        let targetCanvas: HTMLCanvasElement | null = null;
        if (cvResult && cvResult.debugWarpedCanvas) {
          targetCanvas = cvResult.debugWarpedCanvas;
        }

        const imageDataBase64 = await compressImage(targetCanvas || snapCanvas);

        const response = await fetch('/api/scan/ai-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataBase64,
            numQuestions: exam.numQuestions
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'AI Scan request failed');
        }

        const aiResult = await response.json();

        // Map array of answers [{q: 1, ans: "A"}, ...] into key-value map {1: "A", ...}
        const parsedAnswers: Record<number, string> = {};
        if (Array.isArray(aiResult.answers)) {
          aiResult.answers.forEach((item: any) => {
            if (item && typeof item.q === 'number') {
              parsedAnswers[item.q] = item.ans || '';
            }
          });
        }

        const stripLeadingZeros = (val: string) => {
          const cleaned = val.replace(/^0+/, '');
          return cleaned === '' ? '0' : cleaned;
        };
        const aiRollStripped = stripLeadingZeros(aiResult.studentId);
        const classStudents = students.filter(s => s.className === exam.className);
        const matchedStudent = classStudents.find(s => stripLeadingZeros(s.studentNum) === aiRollStripped);
        let studentId = (matchedStudent && matchedStudent.id !== undefined) ? matchedStudent.id : null;

        let score = 0;
        let correctCount = 0;
        let wrongCount = 0;
        let unansweredCount = 0;

        const detectedSet = 'A';
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
                const ans = parsedAnswers[q] || '';
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
                const studentAns = parsedAnswers[q] || '';
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
            const studentAns = parsedAnswers[q] || '';
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

        if (targetCanvas) {
          drawOverlayOnWarpedCanvas(
            targetCanvas,
            exam.numQuestions,
            parsedAnswers,
            correctKey,
            (cvResult && cvResult.bestDy) || 0,
            exam.sections ?? []
          );
        }

        const croppedUrl = targetCanvas 
          ? targetCanvas.toDataURL('image/jpeg', 0.92) 
          : snapCanvas.toDataURL('image/jpeg', 0.92);

        const cleanName = (aiResult.studentName || '').trim();
        const cleanFather = (aiResult.fatherName || '').trim();
        const targetStudentId = studentId || -(Date.now() + Math.floor(Math.random() * 1000));

        if (exam.id) {
          try {
            await db.submissions.where('[examId+studentId]').equals([exam.id, targetStudentId]).delete();
            const subId = await db.submissions.add({
              examId: exam.id!,
              studentId: targetStudentId,
              score: score,
              answers: parsedAnswers,
              bookletSet: detectedSet,
              omrImageUrl: croppedUrl,
              scannedAt: new Date(),
              detectedRollNum: aiResult.studentId || ''
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

        const scanResultName = matchedStudent 
          ? matchedStudent.name 
          : (cleanName 
              ? (cleanFather ? `${cleanName} f/o ${cleanFather} (Unregistered)` : `${cleanName} (Unregistered)`)
              : 'Unknown Candidate');

        setLastScanOverlay({
          studentName: scanResultName,
          studentNum: aiResult.studentId || '',
          score,
          correctCount,
          wrongCount,
          unansweredCount,
          answers: parsedAnswers,
          bookletSet: detectedSet,
          omrImageUrl: croppedUrl,
          studentId: studentId,
          tempStudentId: targetStudentId,
          rawTranscribedName: cleanName,
          rawTranscribedFatherName: cleanFather
        });

      } catch (err: any) {
        console.error(err);
        alert("OMR AI Scan Error: " + (err.message || "Failed to scan sheet."));
        isScanningRef.current = false;
        setIsScanning(false);
      }
      return;
    }

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

      const targetStudentId = studentId || -(Date.now() + Math.floor(Math.random() * 1000));

      if (exam.id) {
        try {
          await db.submissions.where('[examId+studentId]').equals([exam.id, targetStudentId]).delete();
          const subId = await db.submissions.add({
            examId: exam.id!,
            studentId: targetStudentId,
            score: score,
            answers: cvResult.answers,
            bookletSet: detectedSet,
            omrImageUrl: croppedUrl,
            scannedAt: new Date(),
            detectedRollNum: cvResult.studentNum || ''
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
        studentName: matchedStudent ? matchedStudent.name : 'Unknown Candidate',
        studentNum: cvResult.studentNum || '',
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        answers: cvResult.answers,
        bookletSet: detectedSet,
        omrImageUrl: croppedUrl,
        studentId: targetStudentId
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

  const runAIOMRScan = async () => {
    const current = getSelectedFile();
    if (!current) return;

    setIsAIScanning(true);
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
      
      let cvResult: any = null;
      try {
        cvResult = await scanOMRSheet(
          img,
          exam.numQuestions,
          scannerRollDigits,
          exam.examSetsCount ?? 1,
          exam.sections ?? []
        );
      } catch (err) {
        console.warn("Local warp alignment failed, falling back to original image:", err);
      }

      let targetCanvas: HTMLCanvasElement | null = null;
      if (cvResult && cvResult.debugWarpedCanvas) {
        targetCanvas = cvResult.debugWarpedCanvas;
      }

      const imageDataBase64 = await compressImage(targetCanvas || current.previewUrl);

      const response = await fetch('/api/scan/ai-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataBase64,
          numQuestions: exam.numQuestions
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'AI Scan request failed');
      }

      const aiResult = await response.json();
      
      // Map array of answers [{q: 1, ans: "A"}, ...] into key-value map {1: "A", ...}
      const parsedAnswers: Record<number, string> = {};
      if (Array.isArray(aiResult.answers)) {
        aiResult.answers.forEach((item: any) => {
          if (item && typeof item.q === 'number') {
            parsedAnswers[item.q] = item.ans || '';
          }
        });
      }

      const stripLeadingZeros = (val: string) => {
        const cleaned = val.replace(/^0+/, '');
        return cleaned === '' ? '0' : cleaned;
      };
      
      const aiRollStripped = stripLeadingZeros(aiResult.studentId);
      const classStudents = students.filter(s => s.className === exam.className);
      const matchedStudent = classStudents.find(s => stripLeadingZeros(s.studentNum) === aiRollStripped);
      const studentId = (matchedStudent && matchedStudent.id !== undefined) ? matchedStudent.id : null;
      const targetStudentId = studentId || -(Date.now() + Math.floor(Math.random() * 1000));

      let score = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;

      const detectedSet = 'A';
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
              const ans = parsedAnswers[q] || '';
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
              const studentAns = parsedAnswers[q] || '';
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
          const studentAns = parsedAnswers[q] || '';
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

      if (targetCanvas) {
        drawOverlayOnWarpedCanvas(
          targetCanvas,
          exam.numQuestions,
          parsedAnswers,
          correctKey,
          (cvResult && cvResult.bestDy) || 0,
          exam.sections ?? []
        );
      }

      const cleanName = (aiResult.studentName || '').trim();
      const cleanFather = (aiResult.fatherName || '').trim();
      const transcribedName = cleanName 
        ? (cleanFather ? `${cleanName} f/o ${cleanFather} (Unregistered)` : `${cleanName} (Unregistered)`)
        : 'Unknown Candidate';

      const scanResultData = {
        studentId: targetStudentId,
        studentName: matchedStudent ? matchedStudent.name : transcribedName,
        detectedStudentNum: aiResult.studentId,
        bookletSet: detectedSet,
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        answers: parsedAnswers,
        warpedCanvas: targetCanvas,
        rawTranscribedName: cleanName,
        rawTranscribedFatherName: cleanFather
      };

      setFileList(prev => {
        let updated = prev.map(f => {
          if (f.id === selectedFileId) {
            return {
              ...f,
              status: 'Scanned' as const,
              studentNum: aiResult.studentId,
              score,
              correctCount,
              wrongCount,
              unansweredCount,
              answers: parsedAnswers,
              warpedCanvas: targetCanvas || undefined
            };
          }
          return f;
        });
        return updated;
      });

      setDetectedStudentId(targetStudentId);
      setActiveResult(scanResultData);

    } catch (err: any) {
      console.error(err);
      alert(`AI OMR Scan Failed: ${err.message || err}`);
      setFileList(prev => prev.map(f => {
        if (f.id === selectedFileId) {
          return { ...f, status: 'Failed' };
        }
        return f;
      }));
    } finally {
      setIsAIScanning(false);
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                          className="btn-primary" 
                          onClick={runOMRScan} 
                          disabled={isScanning || isAIScanning}
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

                      <button 
                        onClick={runAIOMRScan} 
                        disabled={isScanning || isAIScanning}
                        style={{ 
                          width: '100%', 
                          padding: '10px', 
                          borderRadius: '10px', 
                          fontWeight: 'bold', 
                          fontSize: '0.85rem', 
                          background: '#8b5cf6', 
                          color: '#fff', 
                          border: 'none', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 4px rgba(139, 92, 246, 0.2)'
                        }}
                      >
                        {isAIScanning ? <><RefreshCw className="spin" size={14} /> AI Processing...</> : '🧠 Run AI OMR Scan'}
                      </button>
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
                          onClick={() => setViewingOmrModalUrl({ 
                            name: cleanName, 
                            url: sub.omrImageUrl || undefined, 
                            score: sub.score,
                            answers: sub.answers,
                            correctCount: correctCount,
                            wrongCount: wrongCount,
                            bookletSet: sub.bookletSet
                          })}
                          style={{ padding: '8px 16px', borderRadius: '12px', background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', flex: 1 }}
                        >
                          <Eye size={15} /> View Sheet
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingSubmission(sub)}
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
                                  bubbleStyle.background = '#10b981';
                                  bubbleStyle.borderColor = '#10b981';
                                  bubbleStyle.color = '#ffffff';
                                } else {
                                  bubbleStyle.background = '#ef4444';
                                  bubbleStyle.borderColor = '#ef4444';
                                  bubbleStyle.color = '#ffffff';
                                }
                              } else if (isCorrect) {
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

            {!lastScanOverlay && !hideAiScanning && (
              <div style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                borderRadius: '24px',
                padding: '4px',
                display: 'flex',
                gap: '4px',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
              }}>
                <button
                  type="button"
                  onClick={() => setCameraScanMode('standard')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: 'none',
                    background: cameraScanMode === 'standard' ? '#2563eb' : 'transparent',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  ⚡ Standard
                </button>
                <button
                  type="button"
                  onClick={() => setCameraScanMode('ai')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: 'none',
                    background: cameraScanMode === 'ai' ? '#8b5cf6' : 'transparent',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  🧠 AI Scanner
                </button>
              </div>
            )}

            {!lastScanOverlay && (
              <button
                type="button"
                onClick={() => {
                  isScanningRef.current = true;
                  setIsScanning(true);
                  setTimeout(() => {
                    captureCameraPhoto();
                  }, 0);
                }}
                style={{
                  position: 'absolute',
                  bottom: '76px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '58px',
                  height: '58px',
                  borderRadius: '50%',
                  background: cameraScanMode === 'ai' ? '#7c3aed' : '#2563eb',
                  border: '4px solid #ffffff',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
                  cursor: 'pointer',
                  zIndex: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  outline: 'none'
                }}
                title="Capture & Scan"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px' }}>
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
            )}

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

            {isScanning && cameraScanMode === 'ai' && (
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 50,
                background: 'rgba(15, 23, 42, 0.82)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                gap: '16px'
              }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  border: '4px solid rgba(255,255,255,0.1)',
                  borderTop: '4px solid #8b5cf6',
                  animation: 'spin 1s linear infinite'
                }} className="spin" />
                <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.5px' }}>
                  🧠 AI Processing...
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                  Grading bubble sheet answers via Gemini API
                </div>
              </div>
            )}

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
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                        Roll: {lastScanOverlay.studentNum}
                      </p>
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
                      {(!lastScanOverlay.studentId || lastScanOverlay.studentId < 0) && lastScanOverlay.rawTranscribedName && (
                        <button 
                          type="button"
                          onClick={async () => {
                            const rawName = lastScanOverlay.rawTranscribedName || '';
                            const rawFather = lastScanOverlay.rawTranscribedFatherName || '';
                            
                            try {
                              const newStudentId = await db.students.add({
                                studentNum: lastScanOverlay.studentNum,
                                name: rawName,
                                fatherName: rawFather,
                                className: exam.className
                              });
                              
                              // Update studentId in the saved submission in Dexie database!
                              if (exam.id && lastScanOverlay.tempStudentId) {
                                const existingSub = await db.submissions.where('[examId+studentId]').equals([exam.id, lastScanOverlay.tempStudentId]).first();
                                if (existingSub) {
                                  await db.submissions.where('[examId+studentId]').equals([exam.id, lastScanOverlay.tempStudentId]).delete();
                                  existingSub.studentId = newStudentId;
                                  const newSubId = await db.submissions.add(existingSub);
                                  
                                  const saved = await db.submissions.get(newSubId);
                                  if (saved) {
                                    const { syncSubmissionToCloud } = await import('../utils/cloudSync');
                                    syncSubmissionToCloud(saved).catch(console.warn);
                                  }
                                }
                              }
                              
                              // Sync new student to cloud
                              const { syncStudentToCloud } = await import('../utils/cloudSync');
                              const savedStudent = await db.students.get(newStudentId);
                              if (savedStudent) {
                                syncStudentToCloud(savedStudent).catch(console.warn);
                              }
                              
                              pullCloudUpdatesToIndexedDB();
                              refreshSubmissions();
                              
                              // Update lastScanOverlay state to show registered status
                              setLastScanOverlay(prev => prev ? {
                                ...prev,
                                studentId: newStudentId,
                                studentName: rawName
                              } : null);
                              
                              alert(`Successfully registered student: ${rawName}`);
                            } catch (err: any) {
                              alert("Registration failed: " + (err.message || err));
                            }
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            background: '#7c3aed',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            boxShadow: '0 2px 6px rgba(124, 58, 237, 0.2)'
                          }}
                        >
                          📝 Register
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={() => {
                          setLastScanOverlay(null);
                          isScanningRef.current = false;
                          setIsScanning(false);
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

interface EditScannedSheetModalProps {
  sub: ExamSubmission;
  exam: Exam;
  students: Student[];
  onClose: () => void;
  refreshSubmissions: () => void;
}

const EditScannedSheetModal: React.FC<EditScannedSheetModalProps> = ({ sub, exam, students, onClose, refreshSubmissions }) => {
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
      if (copy[qNum] === opt) {
        copy[qNum] = ''; // Clear answer on double-click
      } else {
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
            const studentAns = editedAnswers[q] || '';
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
        const studentAns = editedAnswers[q] || '';
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
          await db.submissions.where('[examId+studentId]').equals([exam.id!, sub.studentId!]).delete();
          
          // Trigger old cloud deletion in background
          if (sub.studentId > 0) {
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
          await db.submissions.where('[examId+studentId]').equals([exam.id!, sub.studentId!]).modify({
            score: liveScore,
            answers: editedAnswers,
            bookletSet: selectedBookletSet,
            detectedRollNum: sub.detectedRollNum || rollOrSearchInput
          });

          // Trigger cloud sync in background
          if (sub.studentId > 0) {
            import('../utils/cloudSync').then(({ syncSubmissionToCloud }) => {
              db.submissions.where('[examId+studentId]').equals([exam.id!, sub.studentId!]).first().then(updatedSub => {
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
                
                // Determine option list for this question
                const sec = exam.sections?.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
                const is5Option = sec && sec.questionType === '5 option';
                const options = is5Option ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];

                return (
                  <div key={`edit-q-${qNum}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: '24px', color: '#64748b' }}>
                      {String(qNum).padStart(2, '0')}.
                    </span>
                    
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {options.map((opt) => {
                        const isStudentPick = studentAns === opt;
                        
                        let bubbleStyle: React.CSSProperties = {
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          border: isStudentPick ? '1.5px solid #2563eb' : '1.5px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: isStudentPick ? '#ffffff' : '#475569',
                          background: isStudentPick ? '#2563eb' : 'transparent',
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
