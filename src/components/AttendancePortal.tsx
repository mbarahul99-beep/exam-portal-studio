import React, { useState, useRef } from 'react';
import { db, type Student, type ClassEntity, type AttendanceRecord } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { syncAttendanceToCloud } from '../utils/cloudSync';
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
import * as faceapi from '@vladmandic/face-api';

interface AttendancePortalProps {
  classes: ClassEntity[];
  students: Student[];
}

const RangeSummaryList: React.FC<{
  startDate: string;
  endDate: string;
  dbStudents: Student[];
  onSelectDate: (d: string) => void;
  selectedDate: string;
}> = ({ startDate, endDate, dbStudents, onSelectDate, selectedDate }) => {
  const rangeRecords = useLiveQuery(() => 
    db.attendance
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray()
  , [startDate, endDate]) || [];

  // Generate list of dates in range
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  dates.reverse(); // Newest first

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
      {dates.map(dateStr => {
        const dayRecs = rangeRecords.filter((r: AttendanceRecord) => r.date === dateStr);
        const dayPresent = dayRecs.filter((r: AttendanceRecord) => r.status === 'Present').length;
        const dayAbsent = dayRecs.filter((r: AttendanceRecord) => r.status === 'Absent').length;
        const totalRegistered = dbStudents.length;
        const pct = totalRegistered > 0 ? Math.round((dayPresent / totalRegistered) * 100) : 0;
        const isCurrent = dateStr === selectedDate;

        return (
          <div
            key={dateStr}
            onClick={() => onSelectDate(dateStr)}
            style={{
              background: isCurrent ? '#eff6ff' : '#ffffff',
              border: isCurrent ? '1px solid #2563eb' : '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '10px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem' }}>
                {new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                Presents: <strong style={{ color: '#16a34a' }}>{dayPresent}</strong> | Absents: <strong style={{ color: '#ef4444' }}>{dayAbsent}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: pct >= 75 ? '#16a34a' : (pct > 0 ? '#d97706' : '#64748b') }}>
                {pct}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
  const [remarksMap, setRemarksMap] = useState<Record<number, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Reports & Export Manager states
  const [activePortalTab, setActivePortalTab] = useState<'sessions' | 'reports'>('sessions');
  const [reportStartDate, setReportStartDate] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}-01`;
  });
  const [reportEndDate, setReportEndDate] = useState<string>(getTodayString());
  const [reportClass, setReportClass] = useState<string>('All');
  const [reportType, setReportType] = useState<'matrix' | 'daily'>('matrix');
  const [showOverallDaily, setShowOverallDaily] = useState<boolean>(false);
  const [scanClassFilter, setScanClassFilter] = useState<string>('All');

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

  // face-api.js states & refs
  const isFaceApiLoadedRef = useRef<boolean>(false);
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
  const lastEnrollDescriptorRef = useRef<number[] | null>(null);

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
  const handleSetStatus = async (
    studentId: number, 
    className: string, 
    status: 'Present' | 'Absent',
    attendanceMethod: 'Manual' | 'QR' | 'Face' = 'Manual',
    remarks?: string
  ) => {
    try {
      const existing = attendanceMap.get(studentId);
      let recordToSync: AttendanceRecord;
      if (existing) {
        await db.attendance.update(existing.id!, { status, className, attendanceMethod, remarks });
        recordToSync = { ...existing, status, className, attendanceMethod, remarks };
      } else {
        const newRecord = {
          date: selectedDate,
          studentId,
          className,
          status,
          attendanceMethod,
          remarks,
          createdAt: new Date()
        };
        const newId = await db.attendance.add(newRecord);
        recordToSync = { id: newId, ...newRecord };
      }
      await loadAttendanceRecords();
      
      // Sync with Hostinger MySQL
      syncAttendanceToCloud(recordToSync).catch(console.warn);
    } catch (err: any) {
      console.error("Set attendance failed:", err);
    }
  };

  // Toggle Edit Mode for a student row
  const toggleEditStudent = (studentId: number) => {
    setEditingStudentIds(prev => {
      const willBeEditing = !prev[studentId];
      if (willBeEditing) {
        const existing = attendanceMap.get(studentId);
        setRemarksMap(prevRem => ({ ...prevRem, [studentId]: existing?.remarks || '' }));
      }
      return { ...prev, [studentId]: willBeEditing };
    });
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

    let csvContent = 'Roll ID,Student Name,Class,Status,Date,Check-In Time,Remarks\n';
    classSts.forEach((s, idx) => {
      const rec = attendanceMap.get(s.id!);
      const statusStr = rec ? rec.status : 'Unmarked';
      const timeStr = rec && rec.createdAt ? new Date(rec.createdAt).toLocaleTimeString() : 'N/A';
      csvContent += `"${s.studentNum || (idx + 1)}","${s.name.replace(/"/g, '""')}","${s.className}","${statusStr}","${selectedDate}","${timeStr}","${(rec?.remarks || '').replace(/"/g, '""')}"\n`;
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

  // Export Daily Summary or Student Matrix over a date range
  const handleExportReport = async () => {
    try {
      // Fetch all attendance logs in date range
      const records = await db.attendance
        .where('date')
        .between(reportStartDate, reportEndDate, true, true)
        .toArray();

      if (reportType === 'daily') {
        // Daily Summary Report
        // Group records by date
        const dateGroups: Record<string, { present: number; absent: number; total: number }> = {};
        
        // Generate list of dates in range
        const start = new Date(reportStartDate);
        const end = new Date(reportEndDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          dateGroups[dateStr] = { present: 0, absent: 0, total: 0 };
        }

        records.forEach(rec => {
          if (dateGroups[rec.date]) {
            // Filter by class if selected
            const student = dbStudents.find(s => s.id === rec.studentId);
            if (!student) return;
            if (reportClass !== 'All' && student.className !== reportClass) return;

            if (rec.status === 'Present') dateGroups[rec.date].present++;
            else if (rec.status === 'Absent') dateGroups[rec.date].absent++;
            dateGroups[rec.date].total++;
          }
        });

        let csvContent = 'Date,Total Target Students,Present Count,Absent Count,Present Percentage (%)\n';
        Object.keys(dateGroups).sort().forEach(dateStr => {
          const group = dateGroups[dateStr];
          const targetStudents = reportClass === 'All' ? dbStudents.length : dbStudents.filter(s => s.className === reportClass).length;
          const pct = group.total > 0 ? Math.round((group.present / group.total) * 100) : 0;
          csvContent += `"${dateStr}",${targetStudents},${group.present},${group.absent},${pct}%\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Daily_Attendance_Summary_${reportClass}_${reportStartDate}_to_${reportEndDate}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Student-wise Matrix Report
        const targetStudents = reportClass === 'All' 
          ? dbStudents 
          : dbStudents.filter(s => s.className === reportClass);

        if (targetStudents.length === 0) {
          alert("No students found for this class.");
          return;
        }

        // Generate list of dates in range
        const datesList: string[] = [];
        const start = new Date(reportStartDate);
        const end = new Date(reportEndDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          datesList.push(d.toISOString().split('T')[0]);
        }

        // Create mapping date -> studentId -> status
        const statusMap: Record<string, Record<number, string>> = {};
        datesList.forEach(d => {
          statusMap[d] = {};
        });
        records.forEach(rec => {
          if (statusMap[rec.date]) {
            statusMap[rec.date][rec.studentId] = rec.status;
          }
        });

        // Headers
        let csvContent = 'Roll ID,Student Name,Class,';
        csvContent += datesList.join(',') + ',Total Days,Total Present,Total Absent,Attendance Percentage (%)\n';

        targetStudents.forEach(s => {
          csvContent += `"${s.studentNum}","${s.name.replace(/"/g, '""')}","${s.className}",`;
          let totalPresent = 0;
          let totalAbsent = 0;
          let totalWorking = 0;

          const rowValues = datesList.map(d => {
            const status = statusMap[d][s.id!];
            if (status === 'Present') {
              totalPresent++;
              totalWorking++;
              return 'P';
            } else if (status === 'Absent') {
              totalAbsent++;
              totalWorking++;
              return 'A';
            }
            return '-';
          });

          const pct = totalWorking > 0 ? Math.round((totalPresent / totalWorking) * 100) : 0;
          csvContent += rowValues.join(',') + `,${totalWorking},${totalPresent},${totalAbsent},${pct}%\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Attendance_Matrix_${reportClass}_${reportStartDate}_to_${reportEndDate}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      showToast("Report exported successfully!");
    } catch (err: any) {
      alert("Failed to export report: " + err.message);
    }
  };







  const loadFaceApiModels = async () => {
    if (isFaceApiLoadedRef.current) return true;
    if (isModelLoadingRef.current) return false;
    
    isModelLoadingRef.current = true;
    setIsModelLoading(true);
    setModelLoadError(null);
    isModelFailedRef.current = false;

    // Overwrite window.Module if present to prevent any issues
    if (typeof window !== 'undefined') {
      try {
        (window as any).Module = undefined;
      } catch (e) {}
    }

    try {
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
      console.log("Loading face-api.js models from CDN:", MODEL_URL);
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      
      isFaceApiLoadedRef.current = true;
      isModelLoadingRef.current = false;
      setIsModelLoading(false);
      return true;
    } catch (err: any) {
      console.error("Failed to load face-api.js models:", err);
      const errMsg = err?.message || String(err);
      setModelLoadError(errMsg);
      isModelFailedRef.current = true;
      isModelLoadingRef.current = false;
      setIsModelLoading(false);
      return false;
    }
  };

  const getBiometricSettings = () => {
    try {
      const storedJson = localStorage.getItem('omr_custom_settings');
      if (storedJson) {
        const parsed = JSON.parse(storedJson);
        return {
          faceMatchThreshold: parsed.faceMatchThreshold !== undefined ? Number(parsed.faceMatchThreshold) : 0.65,
          enableLivenessCheck: parsed.enableLivenessCheck !== undefined ? Boolean(parsed.enableLivenessCheck) : true
        };
      }
    } catch (e) {
      console.warn("Failed to load OMR Settings for biometrics:", e);
    }
    return {
      faceMatchThreshold: 0.65,
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
    setScanClassFilter(selectedClass || 'All');

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
        await loadFaceApiModels();
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
    setScanClassFilter(selectedClass || 'All');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
      setScanStream(stream);
      if (scanMode === 'Face') {
        await loadFaceApiModels();
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
    lastEnrollLandmarksRef.current = null;
    lastEnrollDescriptorRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setEnrollStream(stream);

      const isLoaded = await loadFaceApiModels();
      if (isLoaded) {
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

  const enrollFrameLoop = async () => {
    if (!enrollVideoRef.current || !enrollVideoRef.current.srcObject) return;
    const video = enrollVideoRef.current;
    
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      if (isFaceApiLoadedRef.current) {
        try {
          const detection = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            const landmarks = detection.landmarks.positions;
            lastEnrollLandmarksRef.current = landmarks;
            lastEnrollDescriptorRef.current = Array.from(detection.descriptor);

            // Estimate horizontal head turn (Yaw ratio)
            const xNose = landmarks[30].x;
            const xLeft = landmarks[0].x;
            const xRight = landmarks[16].x;
            const span = Math.abs(xRight - xLeft);
            const ratio = span > 0 ? (xNose - Math.min(xLeft, xRight)) / span : 0.5;

            // Render live landmarks projection for visual validation
            const keyIndices = [17, 21, 22, 26, 36, 39, 42, 45, 30, 33, 48, 54, 57, 62, 8];
            const nodes = keyIndices.map(idx => ({
              left: (landmarks[idx].x / video.videoWidth) * 100,
              top: (landmarks[idx].y / video.videoHeight) * 100
            }));
            setEnrollLandmarks(nodes);

            const currentStep = enrollStepRef.current;
            const desc = Array.from(detection.descriptor);

            if (currentStep === 'center') {
              if (ratio >= 0.43 && ratio <= 0.57) {
                capturedCenterRef.current = desc;
                playBeep();
                enrollStepRef.current = 'left';
                setEnrollStep('left');
                setEnrollMsg("Step 2: Turn head slightly to the LEFT.");
              }
            } else if (currentStep === 'left') {
              if (ratio < 0.38 || ratio > 0.62) {
                capturedLeftRef.current = desc;
                playBeep();
                enrollStepRef.current = 'right';
                setEnrollStep('right');
                setEnrollMsg("Step 3: Turn head slightly to the RIGHT.");
              }
            } else if (currentStep === 'right') {
              const isOppositeSide = (ratio < 0.38 || ratio > 0.62);
              if (isOppositeSide) {
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
          }
        } catch (e) {
          console.error("Landmarks tracking loop error:", e);
        }
      }
    }
    
    if (enrollVideoRef.current && enrollVideoRef.current.srcObject && enrollStepRef.current !== 'done') {
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
    if (!lastEnrollDescriptorRef.current) {
      showToast("⚠️ Face recognition descriptor not generated yet. Please look straight at the camera.");
      return;
    }

    const descriptor = lastEnrollDescriptorRef.current;
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
    lastEnrollLandmarksRef.current = null;
    lastEnrollDescriptorRef.current = null;
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
            const student = dbStudents.find(s => 
              stripLeadingZeros(s.studentNum) === cvRollStripped && 
              (scanClassFilter === 'All' || s.className === scanClassFilter)
            );

            if (student) {
              isCooldownRef.current = true;
              playBeep();
              const primaryName = student.name.split('/')[0].trim();
              speakAttendance(primaryName);
              handleSetStatus(student.id!, student.className, 'Present', 'QR');
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

          let isLoaded = isFaceApiLoadedRef.current;
          if (!isLoaded && !isModelLoadingRef.current && !isModelFailedRef.current) {
            isLoaded = await loadFaceApiModels();
          }

          if (!isLoaded) {
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
            const detection = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
              .withFaceLandmarks()
              .withFaceDescriptor();

            if (detection) {
              const landmarks = detection.landmarks.positions;
              const liveDescriptor = Array.from(detection.descriptor);
              const box = detection.detection.box;
              const faceBox = {
                x: Math.round(box.x),
                y: Math.round(box.y),
                w: Math.round(box.width),
                h: Math.round(box.height)
              };

              // EAR calculations for 68 landmarks
              const dist2D = (a: any, b: any) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
              const leftEAR = (dist2D(landmarks[37], landmarks[41]) + dist2D(landmarks[38], landmarks[40])) / (2.0 * dist2D(landmarks[36], landmarks[39]));
              const rightEAR = (dist2D(landmarks[43], landmarks[47]) + dist2D(landmarks[44], landmarks[46])) / (2.0 * dist2D(landmarks[42], landmarks[45]));
              const ear = (leftEAR + rightEAR) / 2.0;

              if (ear > baselineEARRef.current) {
                baselineEARRef.current = ear;
              } else {
                baselineEARRef.current = baselineEARRef.current * 0.999 + ear * 0.001;
              }
              baselineEARRef.current = Math.max(0.15, Math.min(0.40, baselineEARRef.current));

              earHistoryRef.current.push(ear);
              if (earHistoryRef.current.length > 5) {
                earHistoryRef.current.shift();
              }
              const avgEAR = earHistoryRef.current.reduce((a, b) => a + b, 0) / earHistoryRef.current.length;

              if (requiresLiveness) {
                if (!facePresenceStartRef.current) {
                  facePresenceStartRef.current = Date.now();
                }
                const timeStablyPresent = Date.now() - facePresenceStartRef.current;
                const closeThreshold = baselineEARRef.current * 0.72;
                const openThreshold = baselineEARRef.current * 0.85;

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
                  hasBlinkedRef.current = true;
                  setLivenessStatus('blinked');
                  playBeep();
                  showToast("✔ Liveness Auto-Verified. Analyzing facial identity...");
                }
              } else {
                hasBlinkedRef.current = true;
              }

              const keyIndices = [17, 21, 22, 26, 36, 39, 42, 45, 30, 33, 48, 54, 57, 62, 8];
              const nodes = keyIndices.map(idx => ({
                left: (landmarks[idx].x / video.videoWidth) * 100,
                top: (landmarks[idx].y / video.videoHeight) * 100
              }));

              if (hasBlinkedRef.current) {
                if (isCooldownRef.current) {
                  requestRef.current = requestAnimationFrame(scanFrame);
                  return;
                }

                const enrolledStudents = dbStudents.filter(s => 
                  s.faceDescriptor && s.faceDescriptor.length > 0 &&
                  (scanClassFilter === 'All' || s.className === scanClassFilter)
                );

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

                const matchScores: { student: Student, distance: number }[] = [];
                for (const student of enrolledStudents) {
                  let minDistance = 999;
                  if (student.faceDescriptors && student.faceDescriptors.length > 0) {
                    for (const desc of student.faceDescriptors) {
                      const dist = faceapi.euclideanDistance(liveDescriptor, desc);
                      if (dist < minDistance) minDistance = dist;
                    }
                  } else if (student.faceDescriptor) {
                    minDistance = faceapi.euclideanDistance(liveDescriptor, student.faceDescriptor);
                  }
                  matchScores.push({ student, distance: minDistance });
                }

                matchScores.sort((a, b) => a.distance - b.distance);
                const topMatch = matchScores[0];
                const secondMatch = matchScores.length > 1 ? matchScores[1] : null;
                
                const topDistance = topMatch.distance;
                const secondDistance = secondMatch ? secondMatch.distance : 999;

                const topScore = Math.max(0, Math.min(1, 1.3 - topDistance));
                const secondScore = secondMatch ? Math.max(0, Math.min(1, 1.3 - secondDistance)) : 0;
                const margin = topScore - secondScore;

                const targetDistanceThreshold = 1.3 - targetThreshold;

                console.log(`[FaceScanner] Comparing vs ${topMatch.student.name}: dist = ${topDistance.toFixed(4)}, sim = ${(topScore * 100).toFixed(1)}% (target distance threshold = ${targetDistanceThreshold.toFixed(4)})`);

                if (topMatch && topDistance <= targetDistanceThreshold && (matchScores.length === 1 || margin >= 0.04)) {
                  const matchPct = Math.round(topScore * 100);
                  const primaryName = topMatch.student.name.split('/')[0].trim();

                  isCooldownRef.current = true;
                  playBeep();
                  speakAttendance(primaryName);
                  handleSetStatus(topMatch.student.id!, topMatch.student.className, 'Present', 'Face');
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
                  const topSimPct = Math.round(topScore * 100);
                  const partialMatchName = topMatch.student.name.split('/')[0].trim();
                  setTrackedFace({
                    ...faceBox,
                    name: topMatch && topScore >= 0.55 
                      ? `👤 Low Confidence Match: ${partialMatchName} (${topSimPct}%)` 
                      : "👤 Unregistered biometric face",
                    pct: undefined,
                    landmarks: nodes
                  });
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
            console.error("face-api.js detection error:", e);
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
      {!selectedClass && !showOverallDaily && (
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
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err){} }}
                style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: 700, outline: 'none', color: '#0f172a', width: '105px', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '4px', gap: '4px', marginBottom: '20px' }}>
            <button
              onClick={() => setActivePortalTab('sessions')}
              style={{
                flex: 1,
                border: 'none',
                background: activePortalTab === 'sessions' ? '#ffffff' : 'transparent',
                color: activePortalTab === 'sessions' ? '#2563eb' : '#64748b',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: activePortalTab === 'sessions' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
            >
              Active Sessions
            </button>
            <button
              onClick={() => setActivePortalTab('reports')}
              style={{
                flex: 1,
                border: 'none',
                background: activePortalTab === 'reports' ? '#ffffff' : 'transparent',
                color: activePortalTab === 'reports' ? '#2563eb' : '#64748b',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: activePortalTab === 'reports' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
            >
              Reports & Exports
            </button>
          </div>

          {activePortalTab === 'sessions' ? (
            <>
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
                {(() => {
                  const overallPresent = attendanceRecords.filter(r => r.status === 'Present').length;
                  const overallAbsent = attendanceRecords.filter(r => r.status === 'Absent').length;
                  const totalRegistered = dbStudents.length;
                  const overallPct = totalRegistered > 0 ? Math.round((overallPresent / totalRegistered) * 100) : 0;

                  return (
                    <div
                      onClick={() => setShowOverallDaily(true)}
                      style={{
                        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                        color: '#ffffff',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(15,23,42,0.15)',
                        transition: 'all 0.2s ease',
                        marginBottom: '4px'
                      }}
                    >
                      <div style={{ width: '52px', height: '56px', borderRadius: '10px', background: 'rgba(255,255,255,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.25rem', flexShrink: 0 }}>
                        📊
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#ffffff' }}>Overall Daily Summary</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78rem', color: '#94a3b8', marginTop: '6px' }}>
                          <span>Today's Attendance: <strong style={{ color: '#10b981' }}>{overallPresent} Present</strong> / {totalRegistered} Registered</span>
                          <span>Absent today: <strong style={{ color: '#ef4444' }}>{overallAbsent}</strong></span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#10b981' }}>
                          {overallPct}%
                        </span>
                        <ChevronRight size={18} color="#94a3b8" />
                      </div>
                    </div>
                  );
                })()}

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
            </>
          ) : (
            /* Reports Tab View */
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Attendance Export Manager</h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
                  Select a date range and class to generate spreadsheet reports.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Report Type</label>
                  <select
                    value={reportType}
                    onChange={(e: any) => setReportType(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none', background: '#fff' }}
                  >
                    <option value="matrix">Student-wise Matrix (Daily logs spreadsheet)</option>
                    <option value="daily">Daily Summary Report (Aggregates per day)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Target Class</label>
                  <select
                    value={reportClass}
                    onChange={(e) => setReportClass(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none', background: '#fff' }}
                  >
                    <option value="All">All Classes</option>
                    {dbClasses.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>From Date</label>
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err){} }}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none', background: '#fff', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>To Date</label>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err){} }}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none', background: '#fff', cursor: 'pointer' }}
                  />
                </div>
              </div>

              <button
                onClick={handleExportReport}
                style={{
                  marginTop: '8px',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37,99,235,0.2)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <FileSpreadsheet size={18} /> Export CSV Report
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 1.5: OVERALL DAILY ATTENDANCE SUMMARY VIEW                     */}
      {/* ==================================================================== */}
      {showOverallDaily && !selectedClass && (
        <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* HEADER BAR */}
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
                onClick={() => setShowOverallDaily(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <ArrowLeft size={18} color="#0f172a" />
              </button>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Overall Daily Summary
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '3px 6px', borderRadius: '8px' }}>
              <Calendar size={12} color="#64748b" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err){} }}
                style={{ border: 'none', background: 'transparent', fontSize: '0.78rem', fontWeight: 700, outline: 'none', color: '#0f172a', width: '105px', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* KPI CARDS & CLASS BREAKDOWN */}
          <div style={{ flex: 1, padding: '14px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '80px' }}>
            {(() => {
              const totalPresent = attendanceRecords.filter(r => r.status === 'Present').length;
              const totalAbsent = attendanceRecords.filter(r => r.status === 'Absent').length;
              const totalRegistered = dbStudents.length;
              const attendancePct = totalRegistered > 0 ? Math.round((totalPresent / totalRegistered) * 100) : 0;

              return (
                <>
                  {/* Summary blocks */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Present Rate</span>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>{attendancePct}%</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Present</span>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>{totalPresent}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Absent</span>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>{totalAbsent}</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Registered Students</span>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#475569', marginTop: '4px' }}>{totalRegistered}</div>
                    </div>
                  </div>

                  {/* Class-wise totals breakdown list */}
                  <div>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Class-wise Breakdown</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {dbClasses.map(cls => {
                        const clsStudents = dbStudents.filter(s => s.className === cls.name);
                        const clsPresent = clsStudents.filter(s => {
                          const r = attendanceRecords.find(rec => rec.studentId === s.id && rec.status === 'Present');
                          return !!r;
                        }).length;
                        const clsAbsent = clsStudents.filter(s => {
                          const r = attendanceRecords.find(rec => rec.studentId === s.id && rec.status === 'Absent');
                          return !!r;
                        }).length;
                        const clsUnmarked = clsStudents.length - (clsPresent + clsAbsent);
                        const clsPct = clsStudents.length > 0 ? Math.round((clsPresent / clsStudents.length) * 100) : 0;

                        return (
                          <div key={cls.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>{cls.name}</div>
                              <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                                <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{clsPresent} Present</span>
                                <span>•</span>
                                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{clsAbsent} Absent</span>
                                <span>•</span>
                                <span>{clsUnmarked} Unmarked</span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{
                                background: clsPct >= 75 ? '#dcfce7' : (clsPct > 0 ? '#fef3c7' : '#f1f5f9'),
                                color: clsPct >= 75 ? '#16a34a' : (clsPct > 0 ? '#d97706' : '#64748b'),
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 800
                              }}>
                                {clsPct}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic Date Range summary logs section */}
                  <div style={{ marginTop: '10px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Range Summaries</h3>
                    
                    {/* Range selectors */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>From Date</span>
                        <input
                          type="date"
                          value={reportStartDate}
                          onChange={(e) => setReportStartDate(e.target.value)}
                          onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err){} }}
                          style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', outline: 'none', background: '#fff', cursor: 'pointer' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>To Date</span>
                        <input
                          type="date"
                          value={reportEndDate}
                          onChange={(e) => setReportEndDate(e.target.value)}
                          onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err){} }}
                          style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', outline: 'none', background: '#fff', cursor: 'pointer' }}
                        />
                      </div>
                    </div>

                    {/* Summary lists loader */}
                    <RangeSummaryList 
                      startDate={reportStartDate}
                      endDate={reportEndDate}
                      dbStudents={dbStudents}
                      onSelectDate={(d) => setSelectedDate(d)}
                      selectedDate={selectedDate}
                    />
                  </div>
                </>
              );
            })()}
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
                onClick={startScanner}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', marginRight: '6px' }}
                title="Start Camera Scan"
              >
                <Camera size={18} color="#2563eb" />
              </button>

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
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '3px 6px', borderRadius: '8px' }}>
                <Calendar size={12} color="#64748b" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err){} }}
                  style={{ border: 'none', background: 'transparent', fontSize: '0.78rem', fontWeight: 700, outline: 'none', color: '#0f172a', width: '105px', cursor: 'pointer' }}
                />
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
                        {isEditing ? (
                          <input
                            type="text"
                            placeholder="Add remarks..."
                            value={remarksMap[student.id!] || ''}
                            onChange={(e) => setRemarksMap(prev => ({ ...prev, [student.id!]: e.target.value }))}
                            style={{
                              fontSize: '0.72rem',
                              padding: '3px 6px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              marginTop: '4px',
                              width: '100%',
                              minWidth: '130px',
                              maxWidth: '180px',
                              boxSizing: 'border-box'
                            }}
                          />
                        ) : (
                          record?.remarks && (
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                              💬 {record.remarks}
                            </div>
                          )
                        )}
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
                              handleSetStatus(student.id!, selectedClass, 'Absent', 'Manual', remarksMap[student.id!]);
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
                              handleSetStatus(student.id!, selectedClass, 'Present', 'Manual', remarksMap[student.id!]);
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
                  await loadFaceApiModels();
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

            {/* Target Class Filter Selector */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Class:</label>
              <select
                value={scanClassFilter}
                onChange={(e) => setScanClassFilter(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem', outline: 'none', background: '#ffffff', fontWeight: 700, color: '#0f172a' }}
              >
                <option value="All">All Classes (Global scan)</option>
                {classes.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
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
                          await loadFaceApiModels();
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
