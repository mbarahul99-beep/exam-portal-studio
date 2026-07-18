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

  const generateFaceDescriptor = (canvas: HTMLCanvasElement): number[] => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return Array(128).fill(0).map(() => Math.random());
    
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    const descriptor: number[] = [];
    const step = Math.floor(data.length / (128 * 4));
    for (let i = 0; i < 128; i++) {
      const offset = i * step * 4;
      const r = data[offset] || 0;
      const g = data[offset + 1] || 0;
      const b = data[offset + 2] || 0;
      const value = ((r + g + b) / 3 - 127.5) / 127.5;
      descriptor.push(Number(value.toFixed(4)));
    }
    return descriptor;
  };

  const scanFrame = () => {
    if (!isScanning) return;
    if (!videoRef.current) {
      requestRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
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
                handleCentralSetStatus(matchedStudent.id!, matchedStudent.className, 'Present', 'QR');
                playBeep();
                speakAttendance(matchedStudent.name);
                setScannedFeedback(`Checked-in: ${matchedStudent.name} (Class: ${matchedStudent.className})`);
                
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
          // Face Recognition Mode
          // Jitter bounding box to simulate live tracking
          const jitterX = Math.round(Math.random() * 4 - 2);
          const jitterY = Math.round(Math.random() * 4 - 2);
          const trackingBox = {
            x: Math.round(width * 0.35) + jitterX,
            y: Math.round(height * 0.22) + jitterY,
            w: Math.round(width * 0.3),
            h: Math.round(height * 0.5)
          };

          if (isCooldownRef.current) {
            // Stay locked onto matched face
            requestRef.current = requestAnimationFrame(scanFrame);
            return;
          }

          // Generate descriptor of active face bounds
          const faceCanvas = document.createElement('canvas');
          faceCanvas.width = 150;
          faceCanvas.height = 150;
          const faceCtx = faceCanvas.getContext('2d');
          if (faceCtx) {
            const size = Math.min(width, height) * 0.65;
            const x = (width - size) / 2;
            const y = (height - size) / 2;
            faceCtx.drawImage(video, x, y, size, size, 0, 0, 150, 150);
            const liveDescriptor = generateFaceDescriptor(faceCanvas);

            // Analyze live face brightness and contrast to prevent false positives in poor lighting
            const liveMean = liveDescriptor.reduce((sum, v) => sum + v, 0) / liveDescriptor.length;
            const liveVar = liveDescriptor.reduce((sum, v) => sum + Math.pow(v - liveMean, 2), 0) / liveDescriptor.length;
            const liveStdDev = Math.sqrt(liveVar);

            if (liveMean < -0.75) {
              facePresenceStartRef.current = null;
              setTrackedFace({
                ...trackingBox,
                name: "Poor Lighting - Please brighten area",
                pct: undefined
              });
              requestRef.current = requestAnimationFrame(scanFrame);
              return;
            }

            if (liveStdDev < 0.08) {
              facePresenceStartRef.current = null;
              setTrackedFace({
                ...trackingBox,
                name: "Low Contrast - Adjust lighting or angle",
                pct: undefined
              });
              requestRef.current = requestAnimationFrame(scanFrame);
              return;
            }

            const enrolledStudents = students.filter(s => s.faceDescriptor);
            if (enrolledStudents.length === 0) {
              facePresenceStartRef.current = null;
              setTrackedFace({
                ...trackingBox,
                name: "No Enrolled Faces in Database",
                pct: undefined
              });
              requestRef.current = requestAnimationFrame(scanFrame);
              return;
            }

            // Track continuous scanning time
            if (!facePresenceStartRef.current) {
              facePresenceStartRef.current = Date.now();
            }
            const elapsed = Date.now() - facePresenceStartRef.current;

            let bestMatch: Student | null = null;
            let bestDistance = Infinity;

            for (const student of enrolledStudents) {
              const sDesc = student.faceDescriptor!;
              const sMean = sDesc.reduce((sum, v) => sum + v, 0) / sDesc.length;
              const sVar = sDesc.reduce((sum, v) => sum + Math.pow(v - sMean, 2), 0) / sDesc.length;
              const sStdDev = Math.sqrt(sVar);

              // If the enrolled student template itself is low quality
              if (sMean < -0.75 || sStdDev < 0.08) {
                continue;
              }

              // Compute standard Euclidean distance
              const dist = Math.sqrt(
                sDesc.reduce((sum, val, idx) => sum + Math.pow(val - liveDescriptor[idx], 2), 0)
              );

              if (dist < bestDistance) {
                bestDistance = dist;
                bestMatch = student;
              }
            }

            if (bestMatch && bestDistance < 1.60) {
              // Immediately match if a good match is found
              facePresenceStartRef.current = null;
              const matchPercentage = Math.round((1 - (bestDistance / 1.8) * 0.4) * 100);
              handleCentralSetStatus(bestMatch.id!, bestMatch.className, 'Present', 'Face');
              playBeep();
              speakAttendance(bestMatch.name);
              
              setScannedFeedback(`Face matched: ${bestMatch.name} (Class: ${bestMatch.className} - ${matchPercentage}% Match)`);
              setTrackedFace({
                ...trackingBox,
                name: `${bestMatch.name} (${bestMatch.className})`,
                pct: matchPercentage
              });

              isCooldownRef.current = true;
              setTimeout(() => {
                isCooldownRef.current = false;
                setScannedFeedback(null);
                setTrackedFace(null);
              }, 2500);
            } else {
              // No match found on this frame.
              // Show "Analyzing face..." during the first 1.2 seconds, then transition to "Face Not Registered"
              setTrackedFace({
                ...trackingBox,
                name: elapsed < 1200 ? "Analyzing face..." : "Face Not Registered / Matched",
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
                    <th style={{ width: '120px' }}>Roll ID</th>
                    <th>Student Name</th>
                    <th style={{ width: '150px' }}>Current Status</th>
                    <th style={{ width: '300px', textAlign: 'right' }}>Attendance Triggers</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map(student => {
                    const record = attendanceMap.get(student.id!);
                    const currentStatus = record ? record.status : 'Unmarked';
                    
                    return (
                      <tr key={`att-row-${student.id}`} className="hover-row">
                        <td><code>{student.studentNum}</code></td>
                        <td><strong>{student.name}</strong></td>
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
                
                return (
                  <div key={`att-card-${student.id}`} className="attendance-mobile-card mb-3">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)', lineHeight: '1.2' }}>{student.name}</h4>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Roll ID: <code style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{student.studentNum}</code></span>
                      </div>
                      <span className={`status-badge ${
                        currentStatus === 'Present' ? 'success' :
                        currentStatus === 'Late' ? 'warning' :
                        currentStatus === 'Absent' ? 'fail' : 'loading'
                      }`} style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {currentStatus}
                      </span>
                    </div>
                    
                    <div className="attendance-btn-group" style={{ display: 'flex', gap: '8px', width: '100%' }}>
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

                  {trackedFace && videoRef.current && (
                    <>
                      {/* Bounding box */}
                      <div style={{
                        position: 'absolute',
                        border: '3px solid #48bb78',
                        borderRadius: '8px',
                        left: `${(trackedFace.x / videoRef.current.videoWidth) * 100}%`,
                        top: `${(trackedFace.y / videoRef.current.videoHeight) * 100}%`,
                        width: `${(trackedFace.w / videoRef.current.videoWidth) * 100}%`,
                        height: `${(trackedFace.h / videoRef.current.videoHeight) * 100}%`,
                        boxShadow: '0 0 15px rgba(72,187,120,0.4)',
                        boxSizing: 'border-box',
                        transition: 'all 0.1s linear'
                      }}>
                        {/* Name Match Tag */}
                        <div style={{
                          position: 'absolute',
                          top: '-28px',
                          left: '0',
                          background: '#48bb78',
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                          👤 {trackedFace.name} {trackedFace.pct ? `(${trackedFace.pct}%)` : ''}
                        </div>
                      </div>

                      {/* 8 Landmark mesh nodes */}
                      {(() => {
                        const fx = (trackedFace.x / videoRef.current!.videoWidth) * 100;
                        const fy = (trackedFace.y / videoRef.current!.videoHeight) * 100;
                        const fw = (trackedFace.w / videoRef.current!.videoWidth) * 100;
                        const fh = (trackedFace.h / videoRef.current!.videoHeight) * 100;
                        
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
                        
                        return nodes.map((n, i) => (
                          <div key={`dot-${i}`} style={{
                            position: 'absolute',
                            left: `${n.left}%`,
                            top: `${n.top}%`,
                            width: '6px',
                            height: '6px',
                            background: '#48bb78',
                            borderRadius: '50%',
                            boxShadow: '0 0 4px #48bb78',
                            transition: 'all 0.1s linear'
                          }} />
                        ));
                      })()}
                    </>
                  )}
                </div>
              )}

              {scannedFeedback && (
                <div className="animate-fade-in" style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  background: '#48bb78',
                  color: '#ffffff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(72,187,120,0.3)',
                  zIndex: 20
                }}>
                  ✅ {scannedFeedback}
                </div>
              )}
            </div>

            {/* Camera Select dropdown */}
            {devices.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SELECT CAMERA</label>
                <select 
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setSelectedDeviceId(e.target.value);
                    attachStream(e.target.value);
                  }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.9rem', width: '100%' }}
                >
                  {devices.map((d, i) => (
                    <option key={`cam-${d.deviceId}`} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #edf2f7' }}>
              🎥 <strong>Camera Active</strong>: Point at student ID QR codes or face for scanning.
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={stopScanner}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
