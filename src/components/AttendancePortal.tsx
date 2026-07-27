import React, { useState, useRef } from 'react';
import { db, type Student, type ClassEntity, type AttendanceRecord } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  ArrowLeft, 
  Calendar, 
  Users, 
  Check, 
  X, 
  Camera, 
  FileSpreadsheet, 
  ChevronRight,
  UserCheck,
  UserX,
  Edit2,
  ListOrdered,
  Globe,
  CheckCircle2
} from 'lucide-react';
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
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [editingStudentIds, setEditingStudentIds] = useState<Record<number, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Scanner States
  const [isScanning, setIsScanning] = useState(false);
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<'QR' | 'Face'>('QR');
  const requestRef = useRef<number | null>(null);
  const isCooldownRef = useRef<boolean>(false);
  const facePresenceStartRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);

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

  // Reactive live queries from IndexedDB
  const liveDbStudents = useLiveQuery(() => db.students.toArray(), []);
  const dbStudents = (liveDbStudents && liveDbStudents.length > 0) ? liveDbStudents : students;

  const liveDbClasses = useLiveQuery(() => db.classes.toArray(), []);
  const fallbackClasses = (classes && classes.length > 0) 
    ? classes 
    : [{ id: 1, name: 'NEET', state: 'Synced' as const, createdAt: new Date() }];

  const dbClasses = (liveDbClasses && liveDbClasses.length > 0) ? liveDbClasses : fallbackClasses;

  const attendanceRecords = useLiveQuery(
    async () => {
      try {
        return await db.attendance.where('date').equals(selectedDate).toArray();
      } catch (err) {
        return [];
      }
    },
    [selectedDate]
  ) || [];

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

  // SCANNER LOGIC (QR Code & Face Recognition)
  const isHumanFacePresent = (canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    let totalLuminance = 0;
    const totalPixels = width * height;
    const blockMeans: number[] = [];

    const blockW = Math.floor(width / 4);
    const blockH = Math.floor(height / 4);

    for (let by = 0; by < 4; by++) {
      for (let bx = 0; bx < 4; bx++) {
        let bSum = 0;
        let bCount = 0;

        for (let y = by * blockH; y < (by + 1) * blockH; y++) {
          for (let x = bx * blockW; x < (bx + 1) * blockW; x++) {
            const idx = (y * width + x) * 4;
            const g = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            bSum += g;
            bCount++;
            totalLuminance += g;
          }
        }
        blockMeans.push(bCount > 0 ? bSum / bCount : 0);
      }
    }

    const overallAvg = totalLuminance / totalPixels;
    if (overallAvg < 15 || overallAvg > 245) return false;

    const variance = blockMeans.reduce((acc, m) => acc + Math.pow(m - overallAvg, 2), 0) / blockMeans.length;
    const stdDev = Math.sqrt(variance);

    return stdDev >= 15;
  };

  const extractFaceBiometrics = (canvas: HTMLCanvasElement): number[] => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return Array(128).fill(0);

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
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
  };

  const startScanner = async () => {
    setIsScanning(true);
    isScanningRef.current = true;
    setScannedFeedback(null);
    facePresenceStartRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setScanStream(stream);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          requestRef.current = requestAnimationFrame(scanFrame);
        }
      }, 300);
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Please allow camera access to scan attendance.");
      setIsScanning(false);
    }
  };

  const scanFrame = () => {
    if (!isScanningRef.current) return;

    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (scanMode === 'QR') {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });

          if (code && code.data && !isCooldownRef.current) {
            const rawRoll = code.data.trim();
            const student = dbStudents.find(s => s.studentNum === rawRoll);

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
          const isFace = isHumanFacePresent(canvas);
          if (isFace) {
            if (!facePresenceStartRef.current) {
              facePresenceStartRef.current = Date.now();
            }

            const frameDescriptor = extractFaceBiometrics(canvas);
            let bestMatch: Student | null = null;
            let highestSim = 0;

            for (const st of dbStudents) {
              if (st.faceDescriptor && st.faceDescriptor.length > 0) {
                const sim = computeFaceSimilarity(frameDescriptor, st.faceDescriptor);
                if (sim > highestSim) {
                  highestSim = sim;
                  bestMatch = st;
                }
              }
            }

            if (bestMatch && highestSim >= 0.72) {
              const primaryName = bestMatch.name.split('/')[0].trim();

              if (!isCooldownRef.current) {
                isCooldownRef.current = true;
                playBeep();
                speakAttendance(primaryName);
                handleSetStatus(bestMatch.id!, bestMatch.className, 'Present');
                setScannedFeedback(`✔ Face Recognized: ${primaryName} (${Math.round(highestSim * 100)}%)`);

                setTimeout(() => {
                  isCooldownRef.current = false;
                  setScannedFeedback(null);
                  facePresenceStartRef.current = null;
                }, 2500);
              }
            }
          } else {
            facePresenceStartRef.current = null;
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
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '4px 0' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>Attendance Roster</h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Select a class or use camera scanner to take roll call.</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '10px' }}>
              <Calendar size={16} color="#64748b" />
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ border: 'none', background: 'transparent', fontSize: '0.88rem', fontWeight: 700, outline: 'none', color: '#0f172a' }}
              />
            </div>
          </div>

          {/* PROMINENT SCANNER CARD AT TOP */}
          <div 
            onClick={startScanner}
            style={{
              background: 'linear-gradient(135deg, #ffffff, #f8fafc)',
              border: '1.5px solid #bfdbfe',
              borderRadius: '16px',
              padding: '18px 20px',
              marginBottom: '24px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(37,99,235,0.06)',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #93c5fd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={24} color="#2563eb" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a' }}>
                  Live Attendance Scanner
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#3b82f6', fontWeight: 600 }}>
                  Instant QR ID Card & Facial Recognition Check-In
                </p>
              </div>
            </div>

            <span style={{
              background: '#2563eb',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '20px',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(37,99,235,0.3)'
            }}>
              Start Scan
            </span>
          </div>

          {/* CLASSES LIST (MATCHING CLASSES THEME) */}
          <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px' }}>
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
                    borderRadius: '14px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem' }}>
                      {cls.name.charAt(0).toUpperCase()}
                    </div>

                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{cls.name}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                        <span><Users size={13} style={{ verticalAlign: 'middle' }} /> {clsStudents.length} Students</span>
                        <span>•</span>
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>{clsPresent}/{clsStudents.length} Present</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 800, color: pct >= 75 ? '#16a34a' : '#d97706' }}>
                        {pct}%
                      </span>
                    </div>
                    <ChevronRight size={20} color="#94a3b8" />
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
            padding: '16px 20px',
            borderBottom: '1px solid #f1f5f9',
            background: '#ffffff',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={() => setSelectedClass(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <ArrowLeft size={22} color="#0f172a" />
              </button>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                Session Detail
              </h2>
            </div>

            <button
              onClick={() => handleExportCSV(selectedClass)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              title="Export CSV Spreadsheet"
            >
              <FileSpreadsheet size={22} color="#2563eb" />
            </button>
          </div>

          {/* SCREENSHOT CLASS & SESSION META TOP CARD */}
          <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#ffffff' }}>
            <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              {selectedClass}
            </h3>
            <span style={{ fontSize: '0.9rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
              attendance
            </span>

            {/* Metadata Line matching screenshot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', fontSize: '0.88rem', color: '#475569' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={16} color="#64748b" />
                <span style={{ fontWeight: 600 }}>{formatDateDisplay(selectedDate)}</span>
              </div>

              <span style={{ color: '#cbd5e1' }}>|</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={16} color="#64748b" />
                <span style={{ fontWeight: 600 }}>{classStudents.length}</span>
              </div>

              <div style={{ marginLeft: 'auto' }}>
                <span style={{
                  background: '#e6f4ea',
                  color: '#137333',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Globe size={13} /> Public
                </span>
              </div>
            </div>
          </div>

          {/* SCREENSHOT STUDENT ROSTER LIST */}
          <div style={{ flex: 1, padding: '0 20px' }}>
            {filteredStudents.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
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
                      padding: '16px 0',
                      borderBottom: '1px solid #f1f5f9'
                    }}
                  >
                    {/* Left: Circular Avatar & Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '50%',
                        background: '#eff6ff',
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '1.1rem'
                      }}>
                        {initial}
                      </div>

                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                          {primaryName}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                          <ListOrdered size={14} color="#94a3b8" />
                          <span>{rollDisplay}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions matching Screenshot Exactly */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      
                      {/* EDITING / SELECTION STATE (Show Red ❌ and Green ✔️ round buttons) */}
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {/* Red Circular Absent Button */}
                          <button
                            type="button"
                            onClick={() => {
                              handleSetStatus(student.id!, selectedClass, 'Absent');
                              setEditingStudentIds(prev => ({ ...prev, [student.id!]: false }));
                            }}
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: '#ef4444',
                              color: '#ffffff',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(239,68,68,0.3)',
                              transition: 'transform 0.15s ease'
                            }}
                            title="Mark Absent"
                          >
                            <X size={20} strokeWidth={2.5} />
                          </button>

                          {/* Green Circular Present Button */}
                          <button
                            type="button"
                            onClick={() => {
                              handleSetStatus(student.id!, selectedClass, 'Present');
                              setEditingStudentIds(prev => ({ ...prev, [student.id!]: false }));
                            }}
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(22,163,74,0.3)',
                              transition: 'transform 0.15s ease'
                            }}
                            title="Mark Present"
                          >
                            <Check size={20} strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        /* SAVED STATE (Show green user check icon or red user cross icon + edit pen) */
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          {isPresent && (
                            <div style={{ display: 'flex', alignItems: 'center', color: '#16a34a' }} title="Present">
                              <UserCheck size={24} />
                            </div>
                          )}

                          {isAbsent && (
                            <div style={{ display: 'flex', alignItems: 'center', color: '#dc2626' }} title="Absent">
                              <UserX size={24} />
                            </div>
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
                            title="Change Attendance Status"
                          >
                            <Edit2 size={18} />
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* SCREENSHOT BOTTOM STICKY ACTION BUTTONS */}
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 20px',
            display: 'flex',
            gap: '14px',
            zIndex: 100
          }}>
            <button
              type="button"
              onClick={() => setSelectedClass(null)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#2563eb',
                border: '1.5px solid #2563eb',
                fontWeight: 700,
                fontSize: '0.95rem',
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
                padding: '12px',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
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
          <div style={{ background: '#ffffff', width: '100%', maxWidth: '440px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Attendance Camera Scanner</h3>
              <button onClick={stopScanner} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              <button 
                onClick={() => { setScanMode('QR'); setScannedFeedback(null); }}
                style={{
                  flex: 1, padding: '12px', border: 'none', background: 'transparent', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                  borderBottom: scanMode === 'QR' ? '3px solid #2563eb' : 'none', color: scanMode === 'QR' ? '#2563eb' : '#64748b'
                }}
              >
                QR ID Card
              </button>
              <button 
                onClick={() => { setScanMode('Face'); setScannedFeedback(null); }}
                style={{
                  flex: 1, padding: '12px', border: 'none', background: 'transparent', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                  borderBottom: scanMode === 'Face' ? '3px solid #2563eb' : 'none', color: scanMode === 'Face' ? '#2563eb' : '#64748b'
                }}
              >
                Face Biometrics
              </button>
            </div>

            {/* Video Viewport */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#000000', overflow: 'hidden' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              
              <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(37,99,235,0.4)', pointerEvents: 'none' }} />

              {scannedFeedback && (
                <div style={{
                  position: 'absolute', bottom: '16px', left: '16px', right: '16px',
                  background: '#0f172a', color: '#ffffff', padding: '10px 14px', borderRadius: '10px',
                  fontSize: '0.85rem', fontWeight: 700, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}>
                  {scannedFeedback}
                </div>
              )}
            </div>

            <div style={{ padding: '14px', textAlign: 'center' }}>
              <button onClick={stopScanner} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#f1f5f9', color: '#334155', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                Done Scanning
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
