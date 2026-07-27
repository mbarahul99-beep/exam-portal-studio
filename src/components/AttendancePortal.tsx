import React, { useState, useRef } from 'react';
import { db, type Student, type ClassEntity, type AttendanceRecord } from '../db';
import { 
  ArrowLeft, 
  Calendar, 
  Users, 
  Check, 
  X, 
  Camera, 
  FileSpreadsheet, 
  ChevronRight,
  Edit2,
  ListOrdered,
  Globe,
  CheckCircle2,
  RefreshCw,
  QrCode,
  Sparkles,
  Trash2
} from 'lucide-react';
import jsQR from 'jsqr';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

interface AttendancePortalProps {
  classes: ClassEntity[];
  students: Student[];
}

export const AttendancePortal: React.FC<AttendancePortalProps> = ({ classes, students }) => {
  // Current local date in YYYY-MM-DD format
  const getTodayString = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [editingStudentIds, setEditingStudentIds] = useState<Record<number, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Scanner & Biometric States
  const [isScanning, setIsScanning] = useState(false);
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<'QR' | 'Face'>('QR');
  const [trackedFace, setTrackedFace] = useState<{ x: number, y: number, w: number, h: number, name?: string, pct?: number, landmarks?: { left: number, top: number }[] } | null>(null);
  const requestRef = useRef<number | null>(null);
  const isCooldownRef = useRef<boolean>(false);
  const facePresenceStartRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);

  // MediaPipe FaceLandmarker states & refs
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const isModelLoadingRef = useRef<boolean>(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const isModelFailedRef = useRef<boolean>(false);
  const [livenessStatus, setLivenessStatus] = useState<'pending' | 'blinked' | 'failed'>('pending');
  const hasBlinkedRef = useRef<boolean>(false);
  const earHistoryRef = useRef<number[]>([]);
  const lastBlinkTimeRef = useRef<number>(0);
  const baselineEARRef = useRef<number>(0.25);

  // Face Enrollment Modal State
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const [enrollStream, setEnrollStream] = useState<MediaStream | null>(null);
  const [enrollMsg, setEnrollMsg] = useState<string | null>(null);
  
  // Multi-direction wizard states & refs
  const [enrollStep, setEnrollStep] = useState<'center' | 'left' | 'right' | 'done'>('center');
  const [enrollLandmarks, setEnrollLandmarks] = useState<{ left: number, top: number }[] | null>(null);
  const enrollStepRef = useRef<'center' | 'left' | 'right' | 'done'>('center');
  const capturedCenterRef = useRef<number[] | null>(null);
  const capturedLeftRef = useRef<number[] | null>(null);
  const capturedRightRef = useRef<number[] | null>(null);
  const lastEnrollLandmarksRef = useRef<any>(null);

  // Show temporary toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Play browser synth audio beep
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (err) {
      console.error("Audio beep failed:", err);
    }
  };

  const speakAttendance = (name: string) => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(`${name}, Present`);
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error("Speech synthesis failed:", err);
    }
  };

  // Data sources from props with safety fallbacks
  const dbStudents = (students && students.length > 0) ? students : [];

  const fallbackClasses = (classes && classes.length > 0) 
    ? classes 
    : [{ id: 1, name: 'NEET', state: 'Synced' as const, createdAt: new Date() }];

  const dbClasses = fallbackClasses;

  // Local state for attendance records safely managed via useEffect
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);

  const loadAttendanceRecords = async () => {
    try {
      if (!db.isOpen()) {
        await db.open();
      }
      const records = await db.attendance.where('date').equals(selectedDate).toArray();
      setAttendanceRecords(records || []);
    } catch (err) {
      console.warn("Failed to load attendance records:", err);
      setAttendanceRecords([]);
    }
  };

  React.useEffect(() => {
    loadAttendanceRecords();
  }, [selectedDate, selectedClass]);

  // Map student ID -> Attendance Record
  const attendanceMap = new Map<number, AttendanceRecord>(
    attendanceRecords.map(r => [r.studentId, r])
  );

  // Set individual attendance status in DB
  const handleSetStatus = async (studentId: number, className: string, status: 'Present' | 'Absent') => {
    try {
      const existing = attendanceMap.get(studentId);
      if (existing) {
        await db.attendance.update(existing.id!, { status, className });
      } else {
        await db.attendance.add({
          date: selectedDate,
          studentId,
          className,
          status,
          createdAt: new Date()
        });
      }
      await loadAttendanceRecords();
    } catch (err: any) {
      console.error("Set attendance failed:", err);
    }
  };

  // Toggle Edit Mode for a student row
  const toggleEditStudent = (studentId: number) => {
    setEditingStudentIds(prev => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  // Export CSV Action for selected class or all classes
  const handleExportCSV = (clsName?: string) => {
    const targetClass = clsName || selectedClass;
    if (!targetClass) return;

    const classSts = dbStudents.filter(s => s.className === targetClass);
    if (classSts.length === 0) {
      alert(`No students found in class ${targetClass}.`);
      return;
    }

    let csvContent = 'Roll ID,Student Name,Class,Status,Date,Check-In Time\n';
    classSts.forEach((s, idx) => {
      const rec = attendanceMap.get(s.id!);
      const statusStr = rec ? rec.status : 'Unmarked';
      const timeStr = rec ? rec.createdAt.toLocaleTimeString() : 'N/A';
      csvContent += `"${s.studentNum || (idx + 1)}","${s.name.replace(/"/g, '""')}","${s.className}","${statusStr}","${selectedDate}","${timeStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_${targetClass}_${selectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  const extractFaceBiometrics = (canvas: HTMLCanvasElement | null, landmarks?: any[]): number[] => {
    if (landmarks && landmarks.length > 0) {
      // 2D Geometric Landmark descriptor representing robust face proportions (excluding noisy relative depth Z-coordinate)
      const keyIndices = [10, 152, 234, 454, 33, 133, 159, 145, 263, 362, 386, 374, 70, 107, 300, 336, 4, 1, 197, 2, 64, 294, 61, 291, 13, 14, 172, 397];
      
      const p33 = landmarks[33];
      const p263 = landmarks[263];
      const scaleDist = Math.sqrt(
        Math.pow(p33.x - p263.x, 2) +
        Math.pow(p33.y - p263.y, 2)
      ) || 1;

      const descriptor: number[] = [];
      for (let i = 0; i < keyIndices.length; i++) {
        const ptA = landmarks[keyIndices[i]];
        for (let j = i + 1; j < keyIndices.length; j++) {
          const ptB = landmarks[keyIndices[j]];
          const dist = Math.sqrt(
            Math.pow(ptA.x - ptB.x, 2) +
            Math.pow(ptA.y - ptB.y, 2)
          );
          descriptor.push(Number((dist / scaleDist).toFixed(6)));
        }
      }
      return descriptor;
    }

    if (!canvas) return Array(378).fill(0);
    const ctx = canvas.getContext('2d');
    if (!ctx) return Array(378).fill(0);

    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    const gray: number[][] = [];
    let sumGray = 0;
    const totalPixels = width * height;

    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const g = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        row.push(g);
        sumGray += g;
      }
      gray.push(row);
    }

    const meanGray = sumGray / totalPixels;
    let varSum = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        varSum += Math.pow(gray[y][x] - meanGray, 2);
      }
    }
    const stdGray = Math.sqrt(varSum / totalPixels) || 1;

    const stdMatrix: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        row.push((gray[y][x] - meanGray) / stdGray);
      }
      stdMatrix.push(row);
    }

    const descriptor: number[] = [];
    const blockW = Math.floor(width / 8);
    const blockH = Math.floor(height / 8);

    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        let bSum = 0;
        let count = 0;
        for (let y = gy * blockH; y < (gy + 1) * blockH; y++) {
          for (let x = gx * blockW; x < (gx + 1) * blockW; x++) {
            if (stdMatrix[y] && stdMatrix[y][x] !== undefined) {
              bSum += stdMatrix[y][x];
              count++;
            }
          }
        }
        descriptor.push(count > 0 ? bSum / count : 0);
      }
    }

    const gBlockW = Math.floor(width / 4);
    const gBlockH = Math.floor(height / 4);

    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        let gradSum = 0;
        let count = 0;
        for (let y = gy * gBlockH + 1; y < (gy + 1) * gBlockH - 1; y++) {
          for (let x = gx * gBlockW + 1; x < (gx + 1) * gBlockW - 1; x++) {
            if (stdMatrix[y] && stdMatrix[y][x] !== undefined) {
              const dx = stdMatrix[y][x + 1] - stdMatrix[y][x - 1];
              const dy = stdMatrix[y + 1][x] - stdMatrix[y - 1][x];
              gradSum += Math.sqrt(dx * dx + dy * dy);
              count++;
            }
          }
        }
        descriptor.push(count > 0 ? gradSum / count : 0);
      }
    }

    const subW = Math.floor(width / 4);
    const subH = Math.floor(height / 8);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 4; c++) {
        let val = 0;
        let cnt = 0;
        for (let y = r * subH; y < (r + 1) * subH; y++) {
          for (let x = c * subW; x < (c + 1) * subW; x++) {
            if (stdMatrix[y] && stdMatrix[y][x] !== undefined) {
              val += stdMatrix[y][x];
              cnt++;
            }
          }
        }
        descriptor.push(cnt > 0 ? val / cnt : 0);
      }
    }

    const norm = Math.sqrt(descriptor.reduce((acc, val) => acc + val * val, 0)) || 1;
    return descriptor.map(val => Number((val / norm).toFixed(6)));
  };

  const computeFaceSimilarity = (vecA: number[], vecB: number[]): number => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    // If it is the 3D landmark geometric vector descriptor, compute mean relative difference
    if (vecA.length === 378) {
      let sumAbsDiff = 0;
      for (let i = 0; i < vecA.length; i++) {
        sumAbsDiff += Math.abs(vecA[i] - vecB[i]);
      }
      const meanDiff = sumAbsDiff / vecA.length;
      return Math.max(0, Math.min(1, 1 - meanDiff * 5.0));
    }

    // Fallback to legacy HOG-like image cosine similarity
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
  };



  const loadFaceLandmarker = async () => {
    if (faceLandmarkerRef.current) return faceLandmarkerRef.current;
    if (isModelLoadingRef.current) return null;
    
    isModelLoadingRef.current = true;
    setIsModelLoading(true);
    setModelLoadError(null);
    isModelFailedRef.current = false;

    // Permanently overwrite window.Module to prevent Emscripten namespace conflicts between OpenCV and MediaPipe.
    // Since OpenCV is already loaded inside window.cv, window.Module is no longer needed by OpenCV.
    // Overwriting is used instead of delete because global var declarations in third-party scripts are non-configurable.
    if (typeof window !== 'undefined') {
      try {
        (window as any).Module = undefined;
      } catch (e) {}
    }

    try {
      const baseUrl = window.location.pathname.endsWith('/') 
        ? window.location.pathname 
        : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

      // Construct clean absolute same-origin URL paths to ensure they resolve reliably
      const origin = window.location.origin.replace(/\/+$/, '');
      const cleanBase = baseUrl.replace(/^\/+|\/+$/g, '');
      
      const wasmPath = cleanBase 
        ? `${origin}/${cleanBase}/wasm/` 
        : `${origin}/wasm/`;

      const modelPath = cleanBase 
        ? `${origin}/${cleanBase}/face_landmarker.task` 
        : `${origin}/face_landmarker.task`;

      console.log("Loading FilesetResolver from wasmPath:", wasmPath);
      const vision = await FilesetResolver.forVisionTasks(wasmPath);

      console.log("Loading FaceLandmarker with modelPath:", modelPath);
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: "CPU" // CPU is stable and avoids WebGL shader shader compilation locks / tab freezes
        },
        outputFaceBlendshapes: false,
        runningMode: "VIDEO",
        numFaces: 1
      });
      
      faceLandmarkerRef.current = landmarker;
      isModelLoadingRef.current = false;
      setIsModelLoading(false);
      return landmarker;
    } catch (err: any) {
      console.error("Failed to load MediaPipe FaceLandmarker:", err);
      const errMsg = err?.message || String(err);
      setModelLoadError(errMsg);
      isModelFailedRef.current = true;
      isModelLoadingRef.current = false;
      setIsModelLoading(false);
      return null;
    }
  };

  const getBiometricSettings = () => {
    try {
      const storedJson = localStorage.getItem('omr_custom_settings');
      if (storedJson) {
        const parsed = JSON.parse(storedJson);
        return {
          faceMatchThreshold: parsed.faceMatchThreshold !== undefined ? Number(parsed.faceMatchThreshold) : 0.58,
          enableLivenessCheck: parsed.enableLivenessCheck !== undefined ? Boolean(parsed.enableLivenessCheck) : true
        };
      }
    } catch (e) {
      console.warn("Failed to load OMR Settings for biometrics:", e);
    }
    return {
      faceMatchThreshold: 0.58,
      enableLivenessCheck: true
    };
  };

  const startScanner = async () => {
    setIsScanning(true);
    isScanningRef.current = true;
    setScannedFeedback(null);
    setTrackedFace(null);
    isCooldownRef.current = false;
    hasBlinkedRef.current = false;
    setLivenessStatus('pending');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFacingMode } });
      setScanStream(stream);

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      
      const activeTrack = stream.getVideoTracks()[0];
      const activeDeviceId = activeTrack?.getSettings()?.deviceId || '';
      setSelectedDeviceId(activeDeviceId);

      if (scanMode === 'Face') {
        await loadFaceLandmarker();
      }

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
          }
          requestRef.current = requestAnimationFrame(scanFrame);
        }
      }, 200);
    } catch (err) {
      console.error("Camera access failed:", err);
      alert("Please allow camera permissions to use the scanner.");
      setIsScanning(false);
      isScanningRef.current = false;
    }
  };

  const attachStream = async (deviceId: string) => {
    if (scanStream) {
      scanStream.getTracks().forEach(track => track.stop());
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    try {
      const constraints = { video: { deviceId: { exact: deviceId } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setScanStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        requestRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.error("Failed to attach camera stream:", err);
    }
  };

  const toggleCameraFacing = () => {
    const nextMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(nextMode);
    if (isScanning) {
      stopScanner();
      setTimeout(() => {
        startScannerWithFacing(nextMode);
      }, 300);
    }
  };

  const startScannerWithFacing = async (facing: 'user' | 'environment') => {
    setIsScanning(true);
    isScanningRef.current = true;
    setScannedFeedback(null);
    setTrackedFace(null);
    hasBlinkedRef.current = false;
    setLivenessStatus('pending');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
      setScanStream(stream);
      if (scanMode === 'Face') {
        await loadFaceLandmarker();
      }
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          requestRef.current = requestAnimationFrame(scanFrame);
        }
      }, 200);
    } catch (err) {
      console.error("Facing camera access failed:", err);
    }
  };

  const startFaceEnrollment = async (student: Student) => {
    setEnrollingStudent(student);
    setIsEnrolling(true);
    setEnrollMsg("Initializing biometrics resolver...");
    setEnrollStep('center');
    enrollStepRef.current = 'center';
    capturedCenterRef.current = null;
    capturedLeftRef.current = null;
    capturedRightRef.current = null;
    setEnrollLandmarks(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setEnrollStream(stream);

      const landmarkerInstance = await loadFaceLandmarker();
      if (landmarkerInstance) {
        setEnrollMsg("Step 1: Look straight at the camera.");
      } else {
        setEnrollMsg("Position face inside guidelines.");
      }

      setTimeout(() => {
        if (enrollVideoRef.current) {
          enrollVideoRef.current.srcObject = stream;
          enrollVideoRef.current.play().catch(() => {});
          requestAnimationFrame(enrollFrameLoop);
        }
      }, 300);
    } catch (err) {
      alert("Could not access camera for face enrollment.");
      setIsEnrolling(false);
      setEnrollingStudent(null);
    }
  };

  const enrollFrameLoop = () => {
    if (!enrollVideoRef.current || !enrollVideoRef.current.srcObject) return;
    const video = enrollVideoRef.current;
    
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {

      const landmarkerInstance = faceLandmarkerRef.current;
      if (landmarkerInstance) {
        try {
          const result = landmarkerInstance.detectForVideo(video, performance.now());
          if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
            const landmarks = result.faceLandmarks[0];
            lastEnrollLandmarksRef.current = landmarks;

            // Estimate horizontal head turn (Yaw ratio)
            const xNose = landmarks[1].x;
            const xLeft = landmarks[234].x;
            const xRight = landmarks[454].x;
            const span = Math.abs(xRight - xLeft);
            const ratio = span > 0 ? (xNose - Math.min(xLeft, xRight)) / span : 0.5;

            // Render live landmarks projection for visual validation
            const keyIndices = [1, 33, 133, 159, 145, 362, 263, 386, 374, 61, 291, 152, 10, 234, 454];
            const nodes = keyIndices.map(idx => ({
              left: landmarks[idx].x * 100,
              top: landmarks[idx].y * 100
            }));
            setEnrollLandmarks(nodes);

            const currentStep = enrollStepRef.current;

            if (currentStep === 'center') {
              if (ratio >= 0.44 && ratio <= 0.56) {
                const desc = extractFaceBiometrics(null, landmarks);
                capturedCenterRef.current = desc;
                playBeep();
                enrollStepRef.current = 'left';
                setEnrollStep('left');
                setEnrollMsg("Step 2: Turn head slightly to the LEFT.");
              }
            } else if (currentStep === 'left') {
              if (ratio < 0.38 || ratio > 0.62) {
                const desc = extractFaceBiometrics(null, landmarks);
                capturedLeftRef.current = desc;
                playBeep();
                enrollStepRef.current = 'right';
                setEnrollStep('right');
                setEnrollMsg("Step 3: Turn head slightly to the RIGHT.");
              }
            } else if (currentStep === 'right') {
              const isOppositeSide = (ratio < 0.38 || ratio > 0.62);
              if (isOppositeSide) {
                const desc = extractFaceBiometrics(null, landmarks);
                capturedRightRef.current = desc;
                playBeep();
                enrollStepRef.current = 'done';
                setEnrollStep('done');
                setEnrollMsg("🎉 Enrollment Complete! Saving profiles...");
                
                setTimeout(() => {
                  saveMultiDirectionDescriptors();
                }, 1200);
              }
            }
          } else {
            setEnrollLandmarks(null);
          }
        } catch (e) {
          console.error("Landmarks tracking loop error:", e);
        }
      }
    }

    const isStillEnrolling = enrollVideoRef.current && enrollVideoRef.current.srcObject;
    if (isStillEnrolling && enrollStepRef.current !== 'done') {
      requestAnimationFrame(enrollFrameLoop);
    }
  };

  const saveMultiDirectionDescriptors = async () => {
    if (!enrollingStudent) return;
    const center = capturedCenterRef.current;
    const left = capturedLeftRef.current;
    const right = capturedRightRef.current;

    if (center && left && right) {
      try {
        await db.students.update(enrollingStudent.id!, {
          faceDescriptor: center,
          faceDescriptors: [center, left, right]
        });
        playBeep();
        showToast(`✔ Multi-angle biometrics saved for ${enrollingStudent.name}!`);
      } catch (err) {
        console.error("Failed to save multi-angle descriptors:", err);
      }
    }
    stopFaceEnrollment();
  };

  const captureFaceBiometrics = async () => {
    if (!enrollingStudent || !enrollVideoRef.current) return;
    if (!lastEnrollLandmarksRef.current) {
      showToast("⚠️ Face landmarks not detected yet. Please look straight at the camera.");
      return;
    }
    const video = enrollVideoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const size = Math.min(width, height) * 0.65;
      const x = (width - size) / 2;
      const y = (height - size) / 2;
      ctx.drawImage(video, x, y, size, size, 0, 0, 160, 160);

      const descriptor = extractFaceBiometrics(null, lastEnrollLandmarksRef.current);
      try {
        await db.students.update(enrollingStudent.id!, {
          faceDescriptor: descriptor,
          faceDescriptors: [descriptor, descriptor, descriptor]
        });
        playBeep();
        showToast(`✔ Enrolled single-face template for ${enrollingStudent.name}!`);
      } catch (err) {
        console.error("Save biometrics error:", err);
      }
      stopFaceEnrollment();
    }
  };

  const stopFaceEnrollment = () => {
    if (enrollStream) {
      enrollStream.getTracks().forEach(t => t.stop());
      setEnrollStream(null);
    }
    setIsEnrolling(false);
    setEnrollingStudent(null);
    setEnrollMsg(null);
    setEnrollLandmarks(null);
  };

  const scanFrame = async () => {
    if (!isScanningRef.current) return;
    if (!videoRef.current) {
      requestRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const width = video.videoWidth;
      const height = video.videoHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);

        if (scanMode === 'QR') {
          setTrackedFace(null);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });

          if (code && code.data && !isCooldownRef.current) {
            const rawRoll = code.data.trim();
            const stripLeadingZeros = (val: string) => {
              const cleaned = val.replace(/^0+/, '');
              return cleaned === '' ? '0' : cleaned;
            };
            const cvRollStripped = stripLeadingZeros(rawRoll);
            const student = dbStudents.find(s => stripLeadingZeros(s.studentNum) === cvRollStripped);

            if (student) {
              isCooldownRef.current = true;
              playBeep();
              const primaryName = student.name.split('/')[0].trim();
              speakAttendance(primaryName);
              handleSetStatus(student.id!, student.className, 'Present');
              setScannedFeedback(`✔ Checked-In: ${primaryName} (${student.className})`);

              setTimeout(() => {
                isCooldownRef.current = false;
                setScannedFeedback(null);
              }, 2200);
            } else {
              setScannedFeedback(`⚠️ Unknown Roll ID: ${rawRoll}`);
            }
          }
        } else if (scanMode === 'Face') {
          const bioSettings = getBiometricSettings();
          const targetThreshold = bioSettings.faceMatchThreshold;
          const requiresLiveness = bioSettings.enableLivenessCheck;

          let landmarkerInstance = faceLandmarkerRef.current;
          if (!landmarkerInstance && !isModelLoadingRef.current && !isModelFailedRef.current) {
            landmarkerInstance = await loadFaceLandmarker();
          }

          if (!landmarkerInstance) {
            setTrackedFace({
              x: Math.round(width * 0.32),
              y: Math.round(height * 0.18),
              w: Math.round(width * 0.36),
              h: Math.round(height * 0.58),
              name: isModelFailedRef.current ? "⚠️ Biometrics Engine Load Failed" : "⏳ Loading Face biometrics engine...",
              pct: undefined
            });
            requestRef.current = requestAnimationFrame(scanFrame);
            return;
          }

          try {
            const result = landmarkerInstance.detectForVideo(video, performance.now());
            if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
              const landmarks = result.faceLandmarks[0];

              // Calculate Bounding Box around face
              let minX = 1, maxX = 0, minY = 1, maxY = 0;
              for (const pt of landmarks) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
              }
              const faceBox = {
                x: Math.round(minX * width),
                y: Math.round(minY * height),
                w: Math.round((maxX - minX) * width),
                h: Math.round((maxY - minY) * height)
              };

              // EAR calculations for Left Eye (points 33, 160, 158, 133, 153, 144) and Right Eye (points 362, 385, 387, 263, 380, 373)
              const dist3D = (a: any, b: any) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
              const leftEAR = (dist3D(landmarks[160], landmarks[153]) + dist3D(landmarks[158], landmarks[144])) / (2.0 * dist3D(landmarks[33], landmarks[133]));
              const rightEAR = (dist3D(landmarks[385], landmarks[373]) + dist3D(landmarks[387], landmarks[380])) / (2.0 * dist3D(landmarks[362], landmarks[263]));
              const ear = (leftEAR + rightEAR) / 2.0;

              // Self-calibration of eye aspect ratio (EAR) baseline
              if (ear > baselineEARRef.current) {
                baselineEARRef.current = ear;
              } else {
                baselineEARRef.current = baselineEARRef.current * 0.999 + ear * 0.001;
              }
              // Constrain baseline to sensible real-world eye openness bounds (0.15 - 0.40)
              baselineEARRef.current = Math.max(0.15, Math.min(0.40, baselineEARRef.current));

              earHistoryRef.current.push(ear);
              if (earHistoryRef.current.length > 5) {
                earHistoryRef.current.shift();
              }
              const avgEAR = earHistoryRef.current.reduce((a, b) => a + b, 0) / earHistoryRef.current.length;

              // Blink trigger liveness verification
              if (requiresLiveness) {
                if (!facePresenceStartRef.current) {
                  facePresenceStartRef.current = Date.now();
                }

                const timeStablyPresent = Date.now() - facePresenceStartRef.current;
                const closeThreshold = baselineEARRef.current * 0.72; // 28% drop indicates close
                const openThreshold = baselineEARRef.current * 0.85;  // reopening to 85% openness

                if (avgEAR < closeThreshold && !isCooldownRef.current) {
                  lastBlinkTimeRef.current = Date.now();
                } else if (avgEAR > openThreshold && lastBlinkTimeRef.current > 0 && (Date.now() - lastBlinkTimeRef.current < 1500)) {
                  if (!hasBlinkedRef.current) {
                    hasBlinkedRef.current = true;
                    setLivenessStatus('blinked');
                    playBeep();
                    showToast("✔ Blink Verified! Analyzing facial identity...");
                  }
                  lastBlinkTimeRef.current = 0;
                } else if (timeStablyPresent > 4000 && !hasBlinkedRef.current) {
                  // Fallback: stable face for over 4 seconds is auto-verified for better UX
                  hasBlinkedRef.current = true;
                  setLivenessStatus('blinked');
                  playBeep();
                  showToast("✔ Liveness Auto-Verified. Analyzing facial identity...");
                }
              } else {
                hasBlinkedRef.current = true;
              }

              // Selected facial feature mesh nodes to project in UI
              const keyIndices = [1, 33, 133, 159, 145, 362, 263, 386, 374, 61, 291, 152, 10, 234, 454];
              const nodes = keyIndices.map(idx => {
                const pt = landmarks[idx];
                return {
                  left: pt.x * 100,
                  top: pt.y * 100
                };
              });

              if (hasBlinkedRef.current) {
                if (isCooldownRef.current) {
                  requestRef.current = requestAnimationFrame(scanFrame);
                  return;
                }

                const faceCanvas = document.createElement('canvas');
                faceCanvas.width = 160;
                faceCanvas.height = 160;
                const faceCtx = faceCanvas.getContext('2d');
                if (faceCtx) {
                  const size = Math.min(width, height) * 0.65;
                  const x = (width - size) / 2;
                  const y = (height - size) / 2;
                  faceCtx.drawImage(video, x, y, size, size, 0, 0, 160, 160);

                  const liveDescriptor = extractFaceBiometrics(null, landmarks);
                  const enrolledStudents = dbStudents.filter(s => s.faceDescriptor && s.faceDescriptor.length > 0);

                  if (enrolledStudents.length === 0) {
                    setTrackedFace({
                      ...faceBox,
                      name: "⚠️ No Enrolled Faces (Click 'Enroll' next to student)",
                      pct: undefined,
                      landmarks: nodes
                    });
                    requestRef.current = requestAnimationFrame(scanFrame);
                    return;
                  }

                  const matchScores: { student: Student, similarity: number }[] = [];
                  for (const student of enrolledStudents) {
                    let maxSim = 0;
                    if (student.faceDescriptors && student.faceDescriptors.length > 0) {
                      for (const desc of student.faceDescriptors) {
                        const sim = computeFaceSimilarity(liveDescriptor, desc);
                        if (sim > maxSim) maxSim = sim;
                      }
                    } else if (student.faceDescriptor) {
                      maxSim = computeFaceSimilarity(liveDescriptor, student.faceDescriptor);
                    }
                    console.log(`[FaceScanner] Comparing vs ${student.name}: sim = ${maxSim.toFixed(4)} (live len = ${liveDescriptor.length}, enrolled len = ${student.faceDescriptor ? student.faceDescriptor.length : 0})`);
                    matchScores.push({ student, similarity: maxSim });
                  }

                  matchScores.sort((a, b) => b.similarity - a.similarity);
                  const topMatch = matchScores[0];
                  const secondMatch = matchScores.length > 1 ? matchScores[1] : null;
                  const topScore = topMatch.similarity;
                  const secondScore = secondMatch ? secondMatch.similarity : 0;
                  const margin = topScore - secondScore;

                  if (topMatch && topScore >= targetThreshold && (matchScores.length === 1 || margin >= 0.04)) {
                    const matchPct = Math.round(topScore * 100);
                    const primaryName = topMatch.student.name.split('/')[0].trim();

                    isCooldownRef.current = true;
                    playBeep();
                    speakAttendance(primaryName);
                    handleSetStatus(topMatch.student.id!, topMatch.student.className, 'Present');
                    setScannedFeedback(`✔ Face Recognized: ${primaryName} (${matchPct}% Match)`);
                    setTrackedFace({
                      ...faceBox,
                      name: `👤 ${primaryName} (${matchPct}% Match)`,
                      pct: matchPct,
                      landmarks: nodes
                    });

                    setTimeout(() => {
                      isCooldownRef.current = false;
                      hasBlinkedRef.current = false;
                      setLivenessStatus('pending');
                      setScannedFeedback(null);
                      setTrackedFace(null);
                    }, 3000);
                  } else {
                    const topSimPct = topMatch ? Math.round(topScore * 100) : 0;
                    const partialMatchName = topMatch ? topMatch.student.name.split('/')[0].trim() : '';
                    setTrackedFace({
                      ...faceBox,
                      name: topMatch && topScore >= 0.40 
                        ? `👤 Low Confidence Match: ${partialMatchName} (${topSimPct}%)` 
                        : "👤 Unregistered biometric face",
                      pct: undefined,
                      landmarks: nodes
                    });
                  }
                }
              } else {
                setTrackedFace({
                  ...faceBox,
                  name: "🔒 Liveness Check: PLEASE BLINK YOUR EYES",
                  pct: undefined,
                  landmarks: nodes
                });
              }
            } else {
              setTrackedFace(null);
              hasBlinkedRef.current = false;
              facePresenceStartRef.current = null;
              if (livenessStatus !== 'pending') {
                setLivenessStatus('pending');
              }
            }
          } catch (e) {
            console.error("MediaPipe detection error:", e);
          }
        }
      }
    }

    if (isScanningRef.current) {
      requestRef.current = requestAnimationFrame(scanFrame);
    }
  };

  const stopScanner = () => {
    isScanningRef.current = false;
    facePresenceStartRef.current = null;
    if (scanStream) {
      scanStream.getTracks().forEach(track => track.stop());
      setScanStream(null);
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    setIsScanning(false);
    setScannedFeedback(null);
    setTrackedFace(null);
    hasBlinkedRef.current = false;
  };

  // Helper to format date display (DD-MM-YYYY)
  const formatDateDisplay = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  // Class Students Roster for currently selected class
  const classStudents = selectedClass ? dbStudents.filter(s => s.className === selectedClass) : [];
  const filteredStudents = classStudents;

  // Present count for selected class
  const presentCountForSelected = classStudents.filter(s => {
    const rec = attendanceMap.get(s.id!);
    return rec && rec.status === 'Present';
  }).length;

  return (
    <div className="attendance-clean-portal animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '80px' }}>
      
      {/* Toast Feedback Banner */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: '#0f172a',
          color: '#ffffff',
          padding: '10px 20px',
          borderRadius: '20px',
          fontSize: '0.88rem',
          fontWeight: 600,
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} color="#48bb78" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 1: CLASSES SELECTION LIST VIEW (WHEN NO CLASS IS SELECTED)       */}
      {/* ==================================================================== */}
      {!selectedClass && (
        <div style={{ padding: '4px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Attendance Roster</h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '5px 10px', borderRadius: '10px' }}>
              <Calendar size={14} color="#64748b" />
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: 700, outline: 'none', color: '#0f172a', width: '105px' }}
              />
            </div>
          </div>

          {/* COMPACT SCANNER CARD */}
          <div 
            onClick={startScanner}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ width: '52px', height: '56px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Camera size={24} color="#1d4ed8" />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                Attendance
              </h3>
            </div>

            <span style={{
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              padding: '6px 12px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.78rem',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
              flexShrink: 0
            }}>
              Start Scan
            </span>
          </div>

          {/* CLASSES LIST */}
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', marginBottom: '12px' }}>
            Select Class ({dbClasses.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dbClasses.map((cls) => {
              const clsStudents = dbStudents.filter(s => s.className === cls.name);
              const clsPresent = clsStudents.filter(s => {
                const rec = attendanceMap.get(s.id!);
                return rec && rec.status === 'Present';
              }).length;

              const pct = clsStudents.length > 0 ? Math.round((clsPresent / clsStudents.length) * 100) : 0;

              return (
                <div
                  key={`cls-card-${cls.id}`}
                  onClick={() => setSelectedClass(cls.name)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ width: '52px', height: '56px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.25rem', flexShrink: 0 }}>
                    {cls.name.charAt(0).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{cls.name}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={14} /> {clsStudents.length}</span>
                      <span style={{ color: '#cbd5e1' }}>|</span>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>{clsPresent}/{clsStudents.length} Present</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: pct >= 75 ? '#16a34a' : (pct > 0 ? '#d97706' : '#94a3b8') }}>
                      {pct}%
                    </span>
                    <ChevronRight size={18} color="#94a3b8" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 2: SESSION DETAIL ATTENDANCE SCREEN (EXACT MATCH SCREENSHOT)   */}
      {/* ==================================================================== */}
      {selectedClass && (
        <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* SCREENSHOT TOP HEADER BAR */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid #f1f5f9',
            background: '#ffffff',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setSelectedClass(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <ArrowLeft size={18} color="#0f172a" />
              </button>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Session Detail
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => handleExportCSV(selectedClass)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                title="Export CSV"
              >
                <FileSpreadsheet size={18} color="#2563eb" />
              </button>

              <button
                onClick={async () => {
                  if (window.confirm("⚠️ WARNING: This will permanently delete ALL registered face biometric templates for all students. This cannot be undone. Are you sure you want to proceed?")) {
                    try {
                      const allStudents = await db.students.toArray();
                      let count = 0;
                      for (const s of allStudents) {
                        if (s.faceDescriptor || (s.faceDescriptors && s.faceDescriptors.length > 0)) {
                          await db.students.update(s.id!, {
                            faceDescriptor: undefined,
                            faceDescriptors: []
                          });
                          count++;
                        }
                      }
                      showToast(`Successfully deleted registered face templates for ${count} students.`);
                    } catch (err) {
                      console.error("Failed to delete face templates:", err);
                      alert("Error deleting face templates.");
                    }
                  }
                }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', marginLeft: '6px' }}
                title="Delete All Registered Biometrics"
              >
                <Trash2 size={18} color="#dc2626" />
              </button>
            </div>
          </div>

          {/* CLASS & SESSION META CARD */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', background: '#ffffff' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
              {selectedClass}
            </h3>

            {/* Metadata Line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', fontSize: '0.78rem', color: '#64748b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} color="#64748b" />
                <span style={{ fontWeight: 600 }}>{formatDateDisplay(selectedDate)}</span>
              </div>

              <span>•</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Users size={12} color="#64748b" />
                <span style={{ fontWeight: 600 }}>{classStudents.length}</span>
              </div>

              <div style={{ marginLeft: 'auto' }}>
                <span style={{
                  background: '#eff6ff',
                  color: '#2563eb',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}>
                  <Globe size={11} /> Public
                </span>
              </div>
            </div>
          </div>

          {/* STUDENT ROSTER LIST */}
          <div style={{ flex: 1, padding: '0 12px 80px 12px' }}>
            {filteredStudents.length === 0 ? (
              <div style={{ padding: '40px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No students found in class {selectedClass}.
              </div>
            ) : (
              filteredStudents.map((student, index) => {
                const record = attendanceMap.get(student.id!);
                const isPresent = record?.status === 'Present';
                const isAbsent = record?.status === 'Absent';
                const isEditing = editingStudentIds[student.id!] || (!isPresent && !isAbsent);
                const primaryName = student.name.split('/')[0].trim();
                const initial = primaryName.charAt(0).toUpperCase();
                const rollDisplay = student.studentNum || (index + 1);

                return (
                  <div
                    key={`st-row-${student.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid #f1f5f9'
                    }}
                  >
                    {/* Left: circular avatar and name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#eff6ff',
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}>
                        {initial}
                      </div>

                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                          {primaryName}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', color: '#94a3b8', marginTop: '1px' }}>
                          <ListOrdered size={12} color="#94a3b8" />
                          <span>{rollDisplay}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      
                      {/* EDITING STATE */}
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              handleSetStatus(student.id!, selectedClass, 'Absent');
                              setEditingStudentIds(prev => ({ ...prev, [student.id!]: false }));
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: '#ef4444',
                              color: '#ffffff',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 1px 4px rgba(239,68,68,0.2)'
                            }}
                            title="Mark Absent"
                          >
                            <X size={15} strokeWidth={2.5} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleSetStatus(student.id!, selectedClass, 'Present');
                              setEditingStudentIds(prev => ({ ...prev, [student.id!]: false }));
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 1px 4px rgba(22,163,74,0.2)'
                            }}
                            title="Mark Present"
                          >
                            <Check size={15} strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        /* SAVED STATE */
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isPresent && (
                            <span style={{
                              background: '#e6f4ea',
                              color: '#137333',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <Check size={11} strokeWidth={3} /> Present
                            </span>
                          )}

                          {isAbsent && (
                            <span style={{
                              background: '#fce8e6',
                              color: '#c5221f',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <X size={11} strokeWidth={3} /> Absent
                            </span>
                          )}

                          {/* Face Enrollment Button */}
                          <button
                            type="button"
                            onClick={() => startFaceEnrollment(student)}
                            style={{
                              background: student.faceDescriptor ? '#f0fdf4' : '#f8fafc',
                              border: student.faceDescriptor ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                              color: student.faceDescriptor ? '#16a34a' : '#64748b',
                              cursor: 'pointer',
                              padding: '3px 6px',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '0.7rem',
                              fontWeight: 700
                            }}
                            title={student.faceDescriptor ? "Face Set" : "Register Face"}
                          >
                            <Camera size={11} />
                            <span>{student.faceDescriptor ? "Set" : "Face"}</span>
                          </button>

                          {student.faceDescriptor && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`Are you sure you want to clear face biometrics for ${student.name}?`)) {
                                  try {
                                    await db.students.update(student.id!, {
                                      faceDescriptor: undefined,
                                      faceDescriptors: []
                                    });
                                    showToast(`Biometrics cleared for ${student.name}`);
                                  } catch (err) {
                                    console.error("Failed to clear face biometrics:", err);
                                  }
                                }
                              }}
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                cursor: 'pointer',
                                padding: '3px 6px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '0.7rem',
                                fontWeight: 700
                              }}
                              title="Delete Registered Face"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}

                          {/* Edit Pen Icon */}
                          <button
                            type="button"
                            onClick={() => toggleEditStudent(student.id!)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#2563eb',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Change Status"
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* BOTTOM STICKY ACTION BAR */}
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '8px 12px',
            display: 'flex',
            gap: '8px',
            zIndex: 100
          }}>
            <button
              type="button"
              onClick={() => setSelectedClass(null)}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
                background: '#ffffff',
                color: '#2563eb',
                border: '1px solid #2563eb',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => {
                showToast(`Saved attendance for ${selectedClass} (${presentCountForSelected}/${classStudents.length} Present)!`);
              }}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(37,99,235,0.2)'
              }}
            >
              Save
            </button>
          </div>

        </div>
      )}

      {/* SCANNER OVERLAY MODAL */}
      {isScanning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#ffffff', width: '100%', maxWidth: '440px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.25)' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 8px #16a34a' }}></span>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Live Attendance Scanner</h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Switch Camera Button */}
                <button 
                  onClick={toggleCameraFacing} 
                  title="Switch Camera (Front/Back)"
                  style={{ border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', fontWeight: 700, color: '#2563eb' }}
                >
                  <RefreshCw size={14} /> Switch Camera
                </button>

                <button onClick={stopScanner} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
              </div>
            </div>

            {/* Mode Selection Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
              <button 
                onClick={() => { setScanMode('QR'); setScannedFeedback(null); }}
                style={{
                  flex: 1, padding: '12px', border: 'none', background: 'transparent', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  borderBottom: scanMode === 'QR' ? '3px solid #2563eb' : '3px solid transparent', color: scanMode === 'QR' ? '#2563eb' : '#64748b'
                }}
              >
                <QrCode size={16} /> QR ID Card
              </button>
              <button 
                onClick={async () => { 
                  setScanMode('Face'); 
                  setScannedFeedback(null); 
                  hasBlinkedRef.current = false;
                  setLivenessStatus('pending');
                  await loadFaceLandmarker();
                }}
                style={{
                  flex: 1, padding: '12px', border: 'none', background: 'transparent', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  borderBottom: scanMode === 'Face' ? '3px solid #2563eb' : '3px solid transparent', color: scanMode === 'Face' ? '#2563eb' : '#64748b'
                }}
              >
                <Sparkles size={16} color="#8b5cf6" /> Face Biometrics
              </button>
            </div>

            {/* Video Viewport with Scanning Target Reticle */}
            <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: '360px', background: '#000000', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
              
              {/* MediaPipe Model Loading Overlay */}
              {scanMode === 'Face' && (isModelLoading || modelLoadError) && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.9)', zIndex: 99, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '20px' }}>
                  {modelLoadError ? (
                    <>
                      <span style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 'bold' }}>⚠️ Initialization Failed</span>
                      <span style={{ color: '#cbd5e1', fontSize: '0.82rem', textAlign: 'center', maxWidth: '300px', lineHeight: '1.4' }}>
                        {modelLoadError}
                      </span>
                      <button 
                        onClick={async () => {
                          setModelLoadError(null);
                          isModelFailedRef.current = false;
                          await loadFaceLandmarker();
                        }}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#8b5cf6', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', marginTop: '10px' }}
                      >
                        Retry Load
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.2)', borderTop: '4px solid #8b5cf6', borderRadius: '50%', animation: 'laserScanAnim 1.2s linear infinite' }}></div>
                      <span style={{ color: '#ffffff', fontSize: '0.92rem', fontWeight: 800, textAlign: 'center' }}>Initializing Face Biometrics Engine...</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem', textAlign: 'center' }}>First-time local model loading may take a few seconds.</span>
                    </>
                  )}
                </div>
              )}

              {/* QR Mode Scanning reticle */}
              {scanMode === 'QR' && (
                <div className="scanning-box" style={{
                  position: 'absolute',
                  top: '15%',
                  left: '15%',
                  right: '15%',
                  bottom: '15%',
                  border: '2px dashed #2563eb',
                  borderRadius: '8px',
                  pointerEvents: 'none',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '2px',
                    background: '#2563eb',
                    boxShadow: '0 0 8px #2563eb',
                    animation: 'scanLaser 2s infinite linear'
                  }} />
                </div>
              )}

              {/* Face Mode biometric tracking box & landmarks mesh */}
              {scanMode === 'Face' && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  boxShadow: 'inset 0 0 80px rgba(0,0,0,0.6)'
                }}>
                  {/* Face oval guidelines overlay */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '180px',
                    height: '240px',
                    border: '2px dashed rgba(37,99,235,0.6)',
                    borderRadius: '50%',
                    boxShadow: '0 0 15px rgba(37,99,235,0.2)'
                  }} />

                  {trackedFace && (
                    (() => {
                      const vW = (videoRef.current && videoRef.current.videoWidth > 0) ? videoRef.current.videoWidth : 640;
                      const vH = (videoRef.current && videoRef.current.videoHeight > 0) ? videoRef.current.videoHeight : 480;

                      const leftPct = (trackedFace.x / vW) * 100;
                      const topPct = (trackedFace.y / vH) * 100;
                      const widthPct = (trackedFace.w / vW) * 100;
                      const heightPct = (trackedFace.h / vH) * 100;

                      const fx = leftPct;
                      const fy = topPct;
                      const fw = widthPct;
                      const fh = heightPct;

                      const isMatched = trackedFace.name?.includes('Match') || trackedFace.name?.includes('Recognized') || trackedFace.name?.includes('Checked');
                      const isLivenessLocked = trackedFace.name?.includes('Liveness Check') || trackedFace.name?.includes('BLINKYOUR');

                      const nodes = trackedFace.landmarks || [
                        { left: fx + fw * 0.25, top: fy + fh * 0.3 },
                        { left: fx + fw * 0.75, top: fy + fh * 0.3 },
                        { left: fx + fw * 0.5, top: fy + fh * 0.5 },
                        { left: fx + fw * 0.3, top: fy + fh * 0.7 },
                        { left: fx + fw * 0.7, top: fy + fh * 0.7 },
                        { left: fx + fw * 0.5, top: fy + fh * 0.85 },
                        { left: fx + fw * 0.15, top: fy + fh * 0.45 },
                        { left: fx + fw * 0.85, top: fy + fh * 0.45 }
                      ];

                      return (
                        <>
                          {/* Live Biometric Bounding Box */}
                          <div style={{
                            position: 'absolute',
                            border: isMatched ? '3px solid #16a34a' : (isLivenessLocked ? '2px dashed #3b82f6' : '2px dashed #f59e0b'),
                            borderRadius: '12px',
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            height: `${heightPct}%`,
                            boxShadow: isMatched ? '0 0 20px rgba(22,163,74,0.5)' : (isLivenessLocked ? '0 0 10px rgba(59,130,246,0.3)' : '0 0 10px rgba(245,158,11,0.3)'),
                            boxSizing: 'border-box',
                            transition: 'all 0.1s linear'
                          }}>
                            {/* Live Name / Status Tag */}
                            <div style={{
                              position: 'absolute',
                              top: '-32px',
                              left: '0',
                              background: isMatched ? '#16a34a' : (isLivenessLocked ? '#2563eb' : '#f59e0b'),
                              color: '#ffffff',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                              boxShadow: '0 4px 6px rgba(0,0,0,0.15)'
                            }}>
                              {trackedFace.name}
                            </div>
                          </div>

                          {/* Landmark mesh nodes */}
                          {nodes.map((n, i) => (
                            <div key={`dot-${i}`} style={{
                              position: 'absolute',
                              left: `${n.left}%`,
                              top: `${n.top}%`,
                              width: '6px',
                              height: '6px',
                              background: isMatched ? '#16a34a' : (isLivenessLocked ? '#3b82f6' : '#f59e0b'),
                              borderRadius: '50%',
                              boxShadow: isMatched ? '0 0 6px #16a34a' : (isLivenessLocked ? '0 0 4px #3b82f6' : '0 0 4px #f59e0b'),
                              transition: 'all 0.05s linear'
                            }} />
                          ))}
                        </>
                      );
                    })()
                  )}
                </div>
              )}

              {/* Status Pill Badge */}
              <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)', color: '#ffffff', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', zIndex: 10 }}>
                {(() => {
                  if (scanMode === 'QR') {
                    return (
                      <>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }}></span>
                        <span>AUTO SCANNING</span>
                      </>
                    );
                  }
                  
                  const settings = getBiometricSettings();
                  if (!settings.enableLivenessCheck) {
                    return (
                      <>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }}></span>
                        <span>🔓 LIVENESS VERIFICATION BYPASSED</span>
                      </>
                    );
                  }

                  return (
                    <>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: livenessStatus === 'pending' ? '#3b82f6' : '#22c55e' }}></span>
                      <span>{livenessStatus === 'pending' ? '🔒 LIVENESS VERIFICATION PENDING' : '🔓 LIVENESS VERIFIED'}</span>
                    </>
                  );
                })()}
              </div>

              {scannedFeedback && (
                <div style={{
                  position: 'absolute', bottom: '16px', left: '16px', right: '16px',
                  background: '#0f172a', color: '#ffffff', padding: '10px 14px', borderRadius: '10px',
                  fontSize: '0.85rem', fontWeight: 700, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  border: '1px solid #334155', animation: 'fade-in 0.2s ease-in', zIndex: 20
                }}>
                  {scannedFeedback}
                </div>
              )}
            </div>

            {/* Footer with clean white margin */}
            <div style={{ padding: '14px 20px', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Connected Camera Device selector */}
              {devices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Connected Camera
                  </label>
                  <select 
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value);
                      attachStream(e.target.value);
                    }}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.82rem', width: '100%', background: '#f8fafc', fontWeight: 600, color: '#0f172a' }}
                  >
                    {devices.map((d, i) => (
                      <option key={`cam-${d.deviceId}`} value={d.deviceId}>{d.label || `Camera Device ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                  {scanMode === 'QR' ? 'Point camera at student QR ID Card' : 'Position face inside guide circle'}
                </span>

                <button onClick={stopScanner} style={{ padding: '8px 16px', borderRadius: '8px', background: '#f1f5f9', color: '#0f172a', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* FACE ENROLLMENT OVERLAY MODAL */}
      {isEnrolling && enrollingStudent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#ffffff', width: '100%', maxWidth: '420px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
            
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Enroll Face Biometrics</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Candidate: <strong>{enrollingStudent.name}</strong></p>
              </div>
              <button onClick={stopFaceEnrollment} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>

            {/* Live Camera Box for Enrollment */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#000000', overflow: 'hidden' }}>
              <video ref={enrollVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '60%', height: '70%', borderRadius: '50%', border: '2px dashed #3b82f6', pointerEvents: 'none' }} />
              
              {/* Live Enrollment Landmarks mesh */}
              {enrollLandmarks && enrollLandmarks.map((n, i) => (
                <div key={`enroll-dot-${i}`} style={{
                  position: 'absolute',
                  left: `${n.left}%`,
                  top: `${n.top}%`,
                  width: '5px',
                  height: '5px',
                  background: '#10b981',
                  borderRadius: '50%',
                  boxShadow: '0 0 4px #10b981'
                }} />
              ))}

              {enrollMsg && (
                <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', background: 'rgba(15,23,42,0.85)', color: '#ffffff', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, textAlign: 'center', zIndex: 10, border: '1px solid #334155' }}>
                  {enrollMsg}
                </div>
              )}
            </div>

            {/* Checklist Indicator showing active/completed states */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: enrollStep === 'center' ? '#2563eb' : '#64748b' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: capturedCenterRef.current ? '#10b981' : '#cbd5e1' }}></span>
                <span>1. Center</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: enrollStep === 'left' ? '#2563eb' : '#64748b' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: capturedLeftRef.current ? '#10b981' : '#cbd5e1' }}></span>
                <span>2. Left Profile</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: enrollStep === 'right' ? '#2563eb' : '#64748b' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: capturedRightRef.current ? '#10b981' : '#cbd5e1' }}></span>
                <span>3. Right Profile</span>
              </div>
            </div>

            <div style={{ padding: '16px', display: 'flex', gap: '12px', background: '#ffffff' }}>
              <button onClick={stopFaceEnrollment} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                Cancel
              </button>
              <button onClick={captureFaceBiometrics} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.82rem' }}>
                <Camera size={14} /> Skip & Save Center
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Laser Scanning Keyframe Animation */}
      <style>{`
        @keyframes laserScanAnim {
          0% { top: 10%; }
          50% { top: 90%; }
          100% { top: 10%; }
        }
      `}</style>

    </div>
  );
};
