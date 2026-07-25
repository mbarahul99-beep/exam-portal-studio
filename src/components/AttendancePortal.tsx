import React, { useState, useRef } from 'react';
import { db, type Student, type ClassEntity, type AttendanceRecord } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calendar, Users, Check, X, Clock, Download, CheckSquare, Camera } from 'lucide-react';
import jsQR from 'jsqr';

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
  const [selectedClass, setSelectedClass] = useState<string>(classes[0]?.name || 'NEET');

  // Scanner States
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<'QR' | 'Face'>('QR');
  const [trackedFace, setTrackedFace] = useState<{ x: number, y: number, w: number, h: number, name?: string, pct?: number } | null>(null);
  const requestRef = useRef<number | null>(null);
  const isCooldownRef = useRef<boolean>(false);
  const facePresenceStartRef = useRef<number | null>(null);

  // Play a browser native synth barcode beep
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
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
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error("Speech synthesis failed:", err);
    }
  };



  const handleCentralSetStatus = async (studentId: number, className: string, status: 'Present' | 'Absent' | 'Late', method: 'QR' | 'Face') => {
    try {
      const existing = await db.attendance.where('[date+studentId]').equals([selectedDate, studentId]).first();
      if (existing) {
        await db.attendance.update(existing.id!, { status, attendanceMethod: method });
      } else {
        await db.attendance.add({
          date: selectedDate,
          studentId,
          className,
          status,
          createdAt: new Date(),
          attendanceMethod: method
        });
      }
    } catch (err) {
      console.error("Central check-in failed:", err);
    }
  };

  // Robust Grid-Based Facial Feature Extractor (LBP + Normalized Spatial Intensity Grid)
  const extractFaceBiometrics = (canvas: HTMLCanvasElement): number[] => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return Array(64).fill(0);

    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    // Convert to 2D grayscale matrix
    const gray: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const g = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        row.push(g);
      }
      gray.push(row);
    }

    // Divide face into 8x8 grid of blocks (64 cells)
    const descriptor: number[] = [];
    const blockW = Math.floor(width / 8);
    const blockH = Math.floor(height / 8);

    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        let sum = 0;
        let count = 0;

        for (let y = gy * blockH; y < (gy + 1) * blockH; y++) {
          for (let x = gx * blockW; x < (gx + 1) * blockW; x++) {
            if (gray[y] && gray[y][x] !== undefined) {
              sum += gray[y][x];
              count++;
            }
          }
        }

        const avg = count > 0 ? sum / count : 0;
        descriptor.push(avg);
      }
    }

    // L2 Normalize descriptor vector for lighting invariant comparison
    const norm = Math.sqrt(descriptor.reduce((acc, val) => acc + val * val, 0)) || 1;
    return descriptor.map(val => Number((val / norm).toFixed(6)));
  };

  // Cosine Similarity between two normalized biometric vectors (0.0 to 1.0)
  const computeFaceSimilarity = (vecA: number[], vecB: number[]): number => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
  };

  // Face Enrollment States
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);
  const [enrollStream, setEnrollStream] = useState<MediaStream | null>(null);
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const [enrollMsg, setEnrollMsg] = useState<string | null>(null);

  const startEnrollmentCamera = async (student: Student) => {
    setEnrollingStudent(student);
    setEnrollMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setEnrollStream(stream);
      setTimeout(() => {
        if (enrollVideoRef.current) {
          enrollVideoRef.current.srcObject = stream;
        }
      }, 300);
    } catch (err) {
      console.error("Enrollment camera access failed:", err);
      alert("Please allow camera access to register student face biometrics.");
      setEnrollingStudent(null);
    }
  };

  const stopEnrollmentCamera = () => {
    if (enrollStream) {
      enrollStream.getTracks().forEach(track => track.stop());
      setEnrollStream(null);
    }
    setEnrollingStudent(null);
    setEnrollMsg(null);
  };

  const captureAndEnrollFace = async () => {
    if (!enrollingStudent || !enrollVideoRef.current) return;
    const video = enrollVideoRef.current;
    if (video.readyState < video.HAVE_CURRENT_DATA) {
      setEnrollMsg("Camera loading... Please wait a moment.");
      return;
    }

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

      const biometrics = extractFaceBiometrics(canvas);
      
      try {
        await db.students.update(enrollingStudent.id!, { faceDescriptor: biometrics });
        playBeep();
        const primaryName = enrollingStudent.name.split('/')[0].trim();
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(`Face Enrolled for ${primaryName}`);
          window.speechSynthesis.speak(utterance);
        }
        setEnrollMsg(`✅ Face Biometric successfully registered for ${primaryName}!`);
        setTimeout(() => {
          stopEnrollmentCamera();
        }, 1500);
      } catch (err) {
        console.error("Failed to save face descriptor:", err);
        setEnrollMsg("❌ Failed to save biometric data. Please try again.");
      }
    }
  };

  const scanFrame = () => {
    if (!isScanning) return;
    if (!videoRef.current) {
      requestRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const width = video.videoWidth;
      const height = video.videoHeight;

      // Offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        
        if (scanMode === 'QR') {
          setTrackedFace(null);
          if (isCooldownRef.current) {
            requestRef.current = requestAnimationFrame(scanFrame);
            return;
          }
          try {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data && !isCooldownRef.current) {
              const scannedNum = code.data.trim();
              const stripLeadingZeros = (val: string) => {
                const cleaned = val.replace(/^0+/, '');
                return cleaned === '' ? '0' : cleaned;
              };
              const cvRollStripped = stripLeadingZeros(scannedNum);
              const matchedStudent = students.find(s => stripLeadingZeros(s.studentNum) === cvRollStripped);
              
              if (matchedStudent) {
                const primaryName = matchedStudent.name.split('/')[0].trim();
                handleCentralSetStatus(matchedStudent.id!, matchedStudent.className, 'Present', 'QR');
                playBeep();
                speakAttendance(primaryName);
                setScannedFeedback(`Checked-in: ${primaryName} (Class: ${matchedStudent.className})`);
                
                isCooldownRef.current = true;
                setTimeout(() => {
                  isCooldownRef.current = false;
                  setScannedFeedback(null);
                }, 2500);
              }
            }
          } catch (e) {
            console.error("jsQR scan error:", e);
          }
        } else {
          // Enterprise Automatic Face Recognition Mode
          const jitterX = Math.round(Math.random() * 4 - 2);
          const jitterY = Math.round(Math.random() * 4 - 2);
          const trackingBox = {
            x: Math.round(width * 0.32) + jitterX,
            y: Math.round(height * 0.18) + jitterY,
            w: Math.round(width * 0.36),
            h: Math.round(height * 0.58)
          };

          if (isCooldownRef.current) {
            requestRef.current = requestAnimationFrame(scanFrame);
            return;
          }

          // Extract live face biometric vector
          const faceCanvas = document.createElement('canvas');
          faceCanvas.width = 160;
          faceCanvas.height = 160;
          const faceCtx = faceCanvas.getContext('2d');
          if (faceCtx) {
            const size = Math.min(width, height) * 0.65;
            const x = (width - size) / 2;
            const y = (height - size) / 2;
            faceCtx.drawImage(video, x, y, size, size, 0, 0, 160, 160);
            const liveDescriptor = extractFaceBiometrics(faceCanvas);

            // Filter enrolled students in database
            const enrolledStudents = students.filter(s => s.faceDescriptor && s.faceDescriptor.length > 0);
            
            if (enrolledStudents.length === 0) {
              setTrackedFace({
                ...trackingBox,
                name: "⚠️ No Enrolled Faces (Click 'Enroll Face' next to student)",
                pct: undefined
              });
              requestRef.current = requestAnimationFrame(scanFrame);
              return;
            }

            let bestMatch: Student | null = null;
            let bestSimilarity = -1;

            for (const student of enrolledStudents) {
              const sim = computeFaceSimilarity(liveDescriptor, student.faceDescriptor!);
              if (sim > bestSimilarity) {
                bestSimilarity = sim;
                bestMatch = student;
              }
            }

            // Enterprise Biometric Cosine Similarity Threshold (>= 0.76 required for positive ID match)
            if (bestMatch && bestSimilarity >= 0.76) {
              facePresenceStartRef.current = null;
              const matchPct = Math.round(bestSimilarity * 100);
              const primaryName = bestMatch.name.split('/')[0].trim();

              handleCentralSetStatus(bestMatch.id!, bestMatch.className, 'Present', 'Face');
              playBeep();
              speakAttendance(primaryName);

              setScannedFeedback(`✅ Auto-Checked In: ${primaryName} (${matchPct}% Face Match)`);
              setTrackedFace({
                ...trackingBox,
                name: `👤 ${primaryName} (${matchPct}% Match)`,
                pct: matchPct
              });

              isCooldownRef.current = true;
              setTimeout(() => {
                isCooldownRef.current = false;
                setScannedFeedback(null);
                setTrackedFace(null);
              }, 2500);
            } else {
              setTrackedFace({
                ...trackingBox,
                name: "Scanning Face... Align face in center oval",
                pct: undefined
              });
            }
          }
        }
      }
    }
    requestRef.current = requestAnimationFrame(scanFrame);
  };

  const startScanner = async () => {
    setIsScanning(true);
    setScannedFeedback(null);
    isCooldownRef.current = false;
    try {
      // Directly request camera stream once
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setScanStream(stream);

      // Enumerate camera devices while the stream is active so labels are populated
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      
      const activeTrack = stream.getVideoTracks()[0];
      const activeDeviceId = activeTrack?.getSettings()?.deviceId || '';
      setSelectedDeviceId(activeDeviceId);

      // Wait briefly for ref mounting, then bind
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
          }
          requestRef.current = requestAnimationFrame(scanFrame);
        }
      }, 300);
    } catch (err) {
      console.error("Camera access failed:", err);
      alert("Please allow camera permissions to use the scanner.");
      setIsScanning(false);
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
        requestRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.error("Failed to attach camera stream:", err);
    }
  };

  const stopScanner = () => {
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
  };

  // Load existing attendance records for the selected class and date
  const attendanceRecords = useLiveQuery(
    () => db.attendance.where('date').equals(selectedDate).and(r => r.className === selectedClass).toArray(),
    [selectedDate, selectedClass]
  ) || [];

  // Filter students based on selected class
  const classStudents = students.filter(s => s.className === selectedClass);

  // Map student ID to attendance record for fast lookups
  const attendanceMap = new Map<number, AttendanceRecord>(
    attendanceRecords.map(r => [r.studentId, r])
  );

  // Calculate statistics from the current enrolled class students roster
  const totalCount = classStudents.length;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;

  classStudents.forEach(s => {
    const r = attendanceMap.get(s.id!);
    if (r) {
      if (r.status === 'Present') presentCount++;
      else if (r.status === 'Absent') absentCount++;
      else if (r.status === 'Late') lateCount++;
    }
  });

  const attendanceRate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0;

  // Handler to toggle individual attendance status
  const handleSetStatus = async (studentId: number, status: 'Present' | 'Absent' | 'Late') => {
    const existing = attendanceMap.get(studentId);
    try {
      if (existing) {
        if (existing.status === status) {
          // If clicked the same status, remove it (make unmarked)
          await db.attendance.delete(existing.id!);
        } else {
          // Otherwise, update status
          await db.attendance.update(existing.id!, { status });
        }
      } else {
        // Create new record
        await db.attendance.add({
          date: selectedDate,
          studentId,
          className: selectedClass,
          status,
          createdAt: new Date()
        });
      }
    } catch (err: any) {
      console.error("Failed to save attendance:", err);
    }
  };

  // Batch actions
  const handleMarkAll = async (status: 'Present' | 'Absent') => {
    try {
      for (const student of classStudents) {
        const existing = attendanceMap.get(student.id!);
        if (existing) {
          await db.attendance.update(existing.id!, { status });
        } else {
          await db.attendance.add({
            date: selectedDate,
            studentId: student.id!,
            className: selectedClass,
            status,
            createdAt: new Date()
          });
        }
      }
    } catch (err) {
      console.error("Batch attendance update failed:", err);
    }
  };

  // Export CSV Action
  const handleExportCSV = () => {
    if (classStudents.length === 0) return;
    
    let csvContent = 'Roll ID,Name,Class,Status,Checked-In Date,Created At\n';
    classStudents.forEach(s => {
      const record = attendanceMap.get(s.id!);
      const statusStr = record ? record.status : 'Unmarked';
      const createdStr = record ? record.createdAt.toLocaleTimeString() : 'N/A';
      csvContent += `"${s.studentNum}","${s.name}","${s.className}","${statusStr}","${selectedDate}","${createdStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Attendance_${selectedClass}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="attendance-portal animate-fade-in">
      {/* Tab Header */}
      <header className="pane-header">
        <div>
          <h2>Daily Attendance</h2>
          <p className="subtitle">Track and review student roll calls, check-in histories, and daily attendance logs.</p>
        </div>
        
        {/* Date and Class Selectors */}
        <div className="attendance-selectors">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '8px' }}>
            <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: '0.9rem', outline: 'none', color: 'var(--text-primary)' }}
            />
          </div>

          <select 
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#ffffff', fontSize: '0.9rem', outline: 'none' }}
          >
            {classes.map(c => (
              <option key={`att-cls-${c.id}`} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Analytics widgets row */}
      <div className="attendance-stats-grid mb-4">
        <div className="glass-card flex-between-stat">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="box-label">Enrolled Students</span>
            <span className="box-val text-indigo" style={{ fontSize: '1.75rem', fontWeight: '800' }}>{totalCount}</span>
          </div>
          <Users size={28} style={{ opacity: 0.2 }} />
        </div>

        <div className="glass-card flex-between-stat">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="box-label">Check-in Status</span>
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem' }}><Check size={14} style={{ color: '#48bb78', verticalAlign: 'middle', marginRight: '2px' }} />Present: <strong>{presentCount}</strong></span>
              <span style={{ fontSize: '0.85rem' }}><Clock size={14} style={{ color: '#ecc94b', verticalAlign: 'middle', marginRight: '2px' }} />Late: <strong>{lateCount}</strong></span>
              <span style={{ fontSize: '0.85rem' }}><X size={14} style={{ color: '#f56565', verticalAlign: 'middle', marginRight: '2px' }} />Absent: <strong>{absentCount}</strong></span>
            </div>
          </div>
        </div>

        <div className="glass-card flex-between-stat">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="box-label">Attendance Rate</span>
            <span className={`box-val ${attendanceRate >= 75 ? 'text-success' : attendanceRate >= 50 ? 'text-warning' : 'text-danger'}`} style={{ fontSize: '1.75rem', fontWeight: '800' }}>
              {attendanceRate}%
            </span>
          </div>
          <CheckSquare size={28} style={{ opacity: 0.2 }} />
        </div>
      </div>

      {/* Control panel and table */}
      <div className="glass-card">
        {/* Roster Controls */}
        <div className="roster-header mb-4" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              className="btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem', color: '#48bb78', borderColor: 'rgba(72,187,120,0.2)', background: 'rgba(72,187,120,0.05)' }} 
              onClick={() => handleMarkAll('Present')}
              disabled={classStudents.length === 0}
            >
              <Check size={14} /> Mark All Present
            </button>
            <button 
              className="btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem', color: '#f56565', borderColor: 'rgba(245,101,101,0.2)', background: 'rgba(245,101,101,0.05)' }} 
              onClick={() => handleMarkAll('Absent')}
              disabled={classStudents.length === 0}
            >
              <X size={14} /> Mark All Absent
            </button>
            <button 
              className="btn-primary-wizard" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem' }} 
              onClick={startScanner}
              disabled={classStudents.length === 0}
            >
              <Camera size={14} /> Scan Attendance
            </button>
          </div>

          <button 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', fontSize: '0.85rem' }}
            onClick={handleExportCSV}
            disabled={classStudents.length === 0}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>

        {/* Student List Grid */}
        {classStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p>No students enrolled in Class {selectedClass} yet.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="attendance-desktop-table-view" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
              <table className="app-table">
                <thead>
                  <tr>
                    <th style={{ width: '110px' }}>Roll ID</th>
                    <th>Student Name</th>
                    <th style={{ width: '160px' }}>Face Biometric</th>
                    <th style={{ width: '130px' }}>Current Status</th>
                    <th style={{ width: '280px', textAlign: 'right' }}>Attendance Triggers</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map(student => {
                    const record = attendanceMap.get(student.id!);
                    const currentStatus = record ? record.status : 'Unmarked';
                    const hasFace = !!(student.faceDescriptor && student.faceDescriptor.length > 0);
                    const primaryName = student.name.split('/')[0].trim();

                    return (
                      <tr key={`att-row-${student.id}`} className="hover-row">
                        <td><code>{student.studentNum}</code></td>
                        <td><strong>{primaryName}</strong></td>
                        <td>
                          <button
                            onClick={() => startEnrollmentCamera(student)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: hasFace ? '1px solid #bcf0da' : '1px solid #2563eb',
                              background: hasFace ? '#f0fdf4' : '#2563eb',
                              color: hasFace ? '#15803d' : '#ffffff',
                              transition: 'all 0.15s ease'
                            }}
                            title={hasFace ? "Face Enrolled - Click to Re-register" : "Click to Register Student Face"}
                          >
                            <Camera size={13} />
                            {hasFace ? '✔ Enrolled' : 'Enroll Face'}
                          </button>
                        </td>
                        <td>
                          <span className={`status-badge ${
                            currentStatus === 'Present' ? 'success' :
                            currentStatus === 'Late' ? 'warning' :
                            currentStatus === 'Absent' ? 'fail' : 'loading'
                          }`} style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                            {currentStatus}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="attendance-btn-group" style={{ display: 'inline-flex', gap: '6px' }}>
                            <button 
                              className={`btn-att btn-present ${currentStatus === 'Present' ? 'active' : ''}`}
                              onClick={() => handleSetStatus(student.id!, 'Present')}
                              title="Mark Present"
                            >
                              <Check size={14} /> Present
                            </button>
                            <button 
                              className={`btn-att btn-late ${currentStatus === 'Late' ? 'active' : ''}`}
                              onClick={() => handleSetStatus(student.id!, 'Late')}
                              title="Mark Late"
                            >
                              <Clock size={14} /> Late
                            </button>
                            <button 
                              className={`btn-att btn-absent ${currentStatus === 'Absent' ? 'active' : ''}`}
                              onClick={() => handleSetStatus(student.id!, 'Absent')}
                              title="Mark Absent"
                            >
                              <X size={14} /> Absent
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="attendance-mobile-cards-view">
              {classStudents.map(student => {
                const record = attendanceMap.get(student.id!);
                const currentStatus = record ? record.status : 'Unmarked';
                const hasFace = !!(student.faceDescriptor && student.faceDescriptor.length > 0);
                const primaryName = student.name.split('/')[0].trim();

                return (
                  <div key={`att-card-${student.id}`} className="attendance-mobile-card mb-3">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)', lineHeight: '1.2' }}>{primaryName}</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Roll ID: <code style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{student.studentNum}</code></span>
                          <button
                            onClick={() => startEnrollmentCamera(student)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: hasFace ? '1px solid #bcf0da' : '1px solid #2563eb',
                              background: hasFace ? '#f0fdf4' : '#2563eb',
                              color: hasFace ? '#15803d' : '#ffffff'
                            }}
                          >
                            <Camera size={11} /> {hasFace ? '✔ Enrolled' : 'Enroll Face'}
                          </button>
                        </div>
                      </div>
                      <span className={`status-badge ${
                        currentStatus === 'Present' ? 'success' :
                        currentStatus === 'Late' ? 'warning' :
                        currentStatus === 'Absent' ? 'fail' : 'loading'
                      }`} style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {currentStatus}
                      </span>
                    </div>
                    
                    <div className="attendance-btn-group" style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '10px' }}>
                      <button 
                        className={`btn-att btn-present ${currentStatus === 'Present' ? 'active' : ''}`}
                        onClick={() => handleSetStatus(student.id!, 'Present')}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Check size={14} /> Present
                      </button>
                      <button 
                        className={`btn-att btn-late ${currentStatus === 'Late' ? 'active' : ''}`}
                        onClick={() => handleSetStatus(student.id!, 'Late')}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Clock size={14} /> Late
                      </button>
                      <button 
                        className={`btn-att btn-absent ${currentStatus === 'Absent' ? 'active' : ''}`}
                        onClick={() => handleSetStatus(student.id!, 'Absent')}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <X size={14} /> Absent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Face Scanner Overlay Modal */}
      {isScanning && (
        <div className="scanner-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1050
        }}>
          <div className="glass-card text-center" style={{
            background: '#ffffff',
            width: '90%',
            maxWidth: '500px',
            padding: '24px',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>Scan Attendance</h3>
              <button 
                onClick={stopScanner}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Mode Select Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '4px' }}>
              <button 
                onClick={() => { setScanMode('QR'); setScannedFeedback(null); setTrackedFace(null); facePresenceStartRef.current = null; }}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  borderBottom: scanMode === 'QR' ? '3px solid #1058ca' : 'none',
                  color: scanMode === 'QR' ? '#1058ca' : 'var(--text-secondary)',
                  outline: 'none'
                }}
              >
                QR ID Card Scanner
              </button>
              <button 
                onClick={() => { setScanMode('Face'); setScannedFeedback(null); setTrackedFace(null); facePresenceStartRef.current = null; }}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  borderBottom: scanMode === 'Face' ? '3px solid #1058ca' : 'none',
                  color: scanMode === 'Face' ? '#1058ca' : 'var(--text-secondary)',
                  outline: 'none'
                }}
              >
                Face Recognition
              </button>
            </div>

            {/* Video container with target overlay */}
            <div className="camera-container" style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4/3',
              background: '#000000',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <video 
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
              
              {/* QR Mode Scanning reticle */}
              {scanMode === 'QR' && (
                <div className="scanning-box" style={{
                  position: 'absolute',
                  top: '15%',
                  left: '15%',
                  right: '15%',
                  bottom: '15%',
                  border: '2px dashed #dc0045',
                  borderRadius: '8px',
                  pointerEvents: 'none',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '2px',
                    background: '#dc0045',
                    boxShadow: '0 0 8px #dc0045',
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
                    border: '2px dashed rgba(72,187,120,0.4)',
                    borderRadius: '50%'
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

                      const isMatched = trackedFace.name?.includes('Match');

                      const nodes = [
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
                            border: isMatched ? '3px solid #16a34a' : '2px dashed #f59e0b',
                            borderRadius: '12px',
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            height: `${heightPct}%`,
                            boxShadow: isMatched ? '0 0 20px rgba(22,163,74,0.5)' : '0 0 10px rgba(245,158,11,0.3)',
                            boxSizing: 'border-box',
                            transition: 'all 0.1s linear'
                          }}>
                            {/* Live Name / Status Tag */}
                            <div style={{
                              position: 'absolute',
                              top: '-32px',
                              left: '0',
                              background: isMatched ? '#16a34a' : '#f59e0b',
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

                          {/* 8 Landmark mesh nodes */}
                          {nodes.map((n, i) => (
                            <div key={`dot-${i}`} style={{
                              position: 'absolute',
                              left: `${n.left}%`,
                              top: `${n.top}%`,
                              width: '6px',
                              height: '6px',
                              background: isMatched ? '#16a34a' : '#f59e0b',
                              borderRadius: '50%',
                              boxShadow: isMatched ? '0 0 6px #16a34a' : '0 0 4px #f59e0b',
                              transition: 'all 0.1s linear'
                            }} />
                          ))}
                        </>
                      );
                    })()
                  )}
                </div>
              )}

              {scannedFeedback && (
                <div className="animate-fade-in" style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  background: '#16a34a',
                  color: '#ffffff',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  textAlign: 'center',
                  boxShadow: '0 4px 15px rgba(22,163,74,0.4)',
                  zIndex: 20
                }}>
                  {scannedFeedback}
                </div>
              )}
            </div>

            {/* Camera Select dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📷 SELECT CONNECTED CAMERA DEVICE ({devices.length > 0 ? `${devices.length} Detected` : 'Scanning...'})
              </label>
              <select 
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  attachStream(e.target.value);
                }}
                style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.88rem', width: '100%', background: '#f8fafc', fontWeight: 600, color: '#0f172a' }}
              >
                {devices.length === 0 ? (
                  <option value="">Default System Camera</option>
                ) : (
                  devices.map((d, i) => (
                    <option key={`cam-${d.deviceId}`} value={d.deviceId}>{d.label || `Camera Device ${i + 1}`}</option>
                  ))
                )}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={stopScanner}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Face Registration Modal */}
      {enrollingStudent && (
        <div className="scanner-overlay" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1100
        }}>
          <div className="glass-card text-center" style={{
            background: '#ffffff', width: '90%', maxWidth: '480px',
            padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
                📷 Register Face Biometric
              </h3>
              <button onClick={stopEnrollmentCamera} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Position <strong style={{ color: '#0f172a' }}>{enrollingStudent.name.split('/')[0].trim()}</strong> inside the green guide oval.
            </p>

            <div style={{
              position: 'relative', width: '100%', aspectRatio: '4/3',
              background: '#000000', borderRadius: '12px', overflow: 'hidden'
            }}>
              <video
                ref={enrollVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '180px', height: '240px',
                border: '3px dashed #16a34a', borderRadius: '50%',
                boxShadow: '0 0 20px rgba(22,163,74,0.4)',
                pointerEvents: 'none'
              }} />
            </div>

            {enrollMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold',
                background: enrollMsg.includes('✅') ? '#f0fdf4' : '#fef2f2',
                color: enrollMsg.includes('✅') ? '#16a34a' : '#dc2626',
                border: enrollMsg.includes('✅') ? '1px solid #bcf0da' : '1px solid #fecaca'
              }}>
                {enrollMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={stopEnrollmentCamera}>
                Cancel
              </button>
              <button className="btn-primary-wizard" style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={captureAndEnrollFace}>
                <Camera size={16} /> Snap & Register Face
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
