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
import { scanOMRSheet } from '../utils/omrScanner';
import confetti from 'canvas-confetti';
import { syncSubmissionToCloud, pullCloudUpdatesToIndexedDB } from '../utils/cloudSync';

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
  const [viewingOmrModalUrl, setViewingOmrModalUrl] = useState<{ name: string; url: string; score: number } | null>(null);

  // Camera Modal States & Refs
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Registered students in this exam's class limit validation
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

  // Stop active camera stream
  const stopCameraStream = () => {
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
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedCameraId) {
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
    if (!videoRef.current || !cvLoaded || isScanning) return;

    if (maxClassSheets !== Infinity && fileList.length >= maxClassSheets) {
      alert(`Class limit reached (${maxClassSheets} registered students).`);
      setShowCameraModal(false);
      return;
    }

    playShutterSound();
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
      let cvResult = await scanOMRSheet(
        snapCanvas,
        exam.numQuestions,
        exam.rollNoDigits ?? 10,
        exam.examSetsCount ?? 1,
        exam.sections ?? []
      );

      if (cvResult.debugWarpedCanvas) {
        try {
          const pass2 = await scanOMRSheet(
            cvResult.debugWarpedCanvas,
            exam.numQuestions,
            exam.rollNoDigits ?? 10,
            exam.examSetsCount ?? 1,
            exam.sections ?? []
          );
          if (pass2 && pass2.answers) cvResult = pass2;
        } catch {}
      }

      const croppedUrl = cvResult.debugWarpedCanvas 
        ? cvResult.debugWarpedCanvas.toDataURL('image/jpeg', 0.92) 
        : snapCanvas.toDataURL('image/jpeg', 0.92);

      const stripLeadingZeros = (val: string) => {
        const cleaned = val.replace(/^0+/, '');
        return cleaned === '' ? '0' : cleaned;
      };
      const cvRollStripped = stripLeadingZeros(cvResult.studentNum);
      const matchedStudent = students.find(s => stripLeadingZeros(s.studentNum) === cvRollStripped);
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
              const correctAns = correctKey[item.q] || 'A';
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
              const correctAns = correctKey[q] || 'A';
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
          const correctAns = correctKey[q] || 'A';

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

      const newItemId = `cam-${Date.now()}`;
      const newItem: ScanFileItem = {
        id: newItemId,
        name: `Camera Snap - ${cvResult.studentNum || 'OMR'}`,
        previewUrl: croppedUrl,
        status: 'Scanned',
        result: scanResultData
      };

      setFileList(prev => [...prev, newItem]);
      setSelectedFileId(newItemId);
      setActiveResult(scanResultData);
      setDetectedStudentId(studentId || null);

      confetti({ particleCount: 60, spread: 60 });
      setShowCameraModal(false);
    } catch (err: any) {
      alert("OMR Scan Error: " + (err.message || "Failed to locate 4 corner anchors. Align sheet inside frame."));
    } finally {
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
      if (target.result && target.result.studentId) {
        await db.submissions.where({ examId: exam.id, studentId: target.result.studentId }).delete();
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

      let cvResult = await scanOMRSheet(
        img,
        exam.numQuestions,
        exam.rollNoDigits ?? 10,
        exam.examSetsCount ?? 1,
        exam.sections ?? []
      );

      if (cvResult.debugWarpedCanvas) {
        try {
          const pass2 = await scanOMRSheet(
            cvResult.debugWarpedCanvas,
            exam.numQuestions,
            exam.rollNoDigits ?? 10,
            exam.examSetsCount ?? 1,
            exam.sections ?? []
          );
          if (pass2 && pass2.answers) cvResult = pass2;
        } catch {}
      }

      const croppedSheetUrl = cvResult.debugWarpedCanvas 
        ? cvResult.debugWarpedCanvas.toDataURL('image/jpeg', 0.92) 
        : null;

      const stripLeadingZeros = (val: string) => {
        const cleaned = val.replace(/^0+/, '');
        return cleaned === '' ? '0' : cleaned;
      };
      const cvRollStripped = stripLeadingZeros(cvResult.studentNum);
      const matchedStudent = students.find(s => stripLeadingZeros(s.studentNum) === cvRollStripped);
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
              const correctAns = correctKey[item.q] || 'A';
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
              const correctAns = correctKey[q] || 'A';
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
          const correctAns = correctKey[q] || 'A';

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

      setFileList(prev => prev.map(f => {
        if (f.id === selectedFileId) {
          return {
            ...f,
            previewUrl: croppedSheetUrl || f.previewUrl,
            status: 'Scanned',
            result: scanResultData
          };
        }
        return f;
      }));
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
      }

      await db.submissions.where({ examId: exam.id, studentId: detectedStudentId }).delete();

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
        const nextPending = prev.find(f => f.id !== selectedFileId && f.status === 'Pending');
        if (nextPending) {
          setSelectedFileId(nextPending.id);
          setActiveResult(null);
        }
        return prev;
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
      <div className="split-scan-view">
        {/* Left Controls & Queue */}
        <div className="left-panel glass-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
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
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                background: isClassLimitReached ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                cursor: isClassLimitReached ? 'not-allowed' : 'pointer',
                boxShadow: isClassLimitReached ? 'none' : '0 4px 14px rgba(37,99,235,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Camera size={18} /> Live Camera Scanner
            </button>

            <label className={`upload-drop-zone ${isClassLimitReached ? 'disabled' : ''}`} style={{ margin: 0, padding: '14px', borderRadius: '12px', cursor: isClassLimitReached ? 'not-allowed' : 'pointer' }}>
              <Upload size={20} className="mb-1" />
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                {isClassLimitReached ? 'Class Limit Reached' : 'Choose OMR Image Files'}
              </span>
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

          {/* Pending Queue List */}
          <div style={{ flex: 1, overflowY: 'auto', marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Scan Queue ({fileList.length})</h4>
            </div>

            {fileList.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No pending images in queue. Click "Live Camera Scanner" or choose files to begin.
              </div>
            ) : (
              <table className="clean-table">
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
                      <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.name}</td>
                      <td>
                        <span className={`status-badge ${item.status.toLowerCase()}`}>
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
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Panel Workspace */}
        <div className="right-panel">
          {selectedFileId && getSelectedFile() ? (
            <>
              <div className="glass-card" style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '320px' }}>
                {/* View Controls */}
                <div style={{ position: 'absolute', left: '16px', top: '16px', zIndex: 10, display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.9)', padding: '6px 12px', borderRadius: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <button type="button" onClick={() => setRotation((r) => (r - 90) % 360)} title="Rotate Left"><RotateCcw size={16} /></button>
                  <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate Right"><RotateCw size={16} /></button>
                  <button type="button" onClick={() => setZoom((z) => Math.min(z + 0.2, 2.5))} title="Zoom In"><ZoomIn size={16} /></button>
                  <button type="button" onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))} title="Zoom Out"><ZoomOut size={16} /></button>
                </div>

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: '#0f172a', padding: '20px' }}>
                  <div style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transition: 'transform 0.2s ease', transformOrigin: 'center' }}>
                    <img 
                      src={getSelectedFile()?.previewUrl} 
                      alt="OMR Preview" 
                      style={{ maxHeight: '400px', maxWidth: '100%', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
                    />
                  </div>
                </div>
              </div>

              {/* Scan Diagnostics Card */}
              <div className="glass-card scan-diag-card mt-3 animate-fade-in" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>OMR Diagnostic</h4>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>File: {getSelectedFile()?.name}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {activeResult && (
                      <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                        Score: {activeResult.score} pts
                      </span>
                    )}
                  </div>
                </div>

                <div className="scan-diag-actions" style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    className="btn-primary" 
                    onClick={runOMRScan} 
                    disabled={isScanning}
                    style={{ flex: 1, padding: '12px', borderRadius: '10px', fontWeight: 'bold' }}
                  >
                    {isScanning ? <><RefreshCw className="spin" size={16} /> Scanning...</> : '⚡ Run Auto OMR Scan'}
                  </button>

                  {activeResult && (
                    <button 
                      className="btn-success" 
                      onClick={handleSaveResult}
                      style={{ flex: 1, padding: '12px', borderRadius: '10px', fontWeight: 'bold', background: '#16a34a', color: '#fff', border: 'none' }}
                    >
                      💾 Save Result
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="glass-card" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <ImageIcon size={40} className="mb-2" style={{ opacity: 0.3 }} />
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>No OMR Sheet Selected</h4>
              <p style={{ fontSize: '0.82rem', marginTop: '4px' }}>Select a file from the queue or click "Live Camera Scanner".</p>
            </div>
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

                        {sub.omrImageUrl ? (
                          <button
                            type="button"
                            onClick={() => setViewingOmrModalUrl({ name: cleanName, url: sub.omrImageUrl!, score: sub.score })}
                            style={{ padding: '8px 14px', borderRadius: '10px', background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Eye size={15} /> View Sheet
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Saved on device</span>
                        )}
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

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
            <img 
              src={viewingOmrModalUrl.url} 
              alt="Scanned OMR Sheet" 
              style={{ maxHeight: '85vh', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
            />
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
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} className="live-stream"></video>

            <div style={{ position: 'absolute', bottom: '28px', left: '50%', transform: 'translateX(-50%)', zIndex: 30 }}>
              <button 
                type="button"
                onClick={captureCameraPhoto}
                style={{ 
                  padding: '14px 36px', 
                  fontSize: '1.1rem', 
                  borderRadius: '32px', 
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', 
                  color: '#ffffff', 
                  border: 'none', 
                  fontWeight: 'bold', 
                  cursor: 'pointer', 
                  boxShadow: '0 6px 24px rgba(37,99,235,0.6), 0 0 0 4px rgba(255,255,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
                disabled={isScanning}
              >
                {isScanning ? <RefreshCw className="spin" size={20} /> : '📷 Capture & Scan Photo'}
              </button>
            </div>
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        </div>
      )}

    </div>
  );
};
