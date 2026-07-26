import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Camera,
  ArrowLeft,
  RotateCcw, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  ChevronRight, 
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  Search,
  CheckCircle,
  Eye,
  UserCheck
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

export interface ScanFileItem {
  id: string;
  name: string;
  file?: File;
  previewUrl: string;
  status: 'Pending' | 'Scanning' | 'Scanned' | 'Failed';
  result?: {
    studentId: number | null;
    studentName: string;
    detectedStudentNum: string;
    bookletSet: string;
    score: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    answers: Record<number, string>;
    warpedCanvas?: HTMLCanvasElement;
  };
}

export const ScanImagesView: React.FC<ScanImagesViewProps> = ({ exam, students, onClose }) => {
  const [fileList, setFileList] = useState<ScanFileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cvLoaded, setCvLoaded] = useState(false);

  // 3-Screen Architecture State
  const [activeScreen, setActiveScreen] = useState<1 | 2 | 3>(1);
  const [selectedStudentSub, setSelectedStudentSub] = useState<any | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [existingSubmissions, setExistingSubmissions] = useState<ExamSubmission[]>([]);

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
      alert(`⚠️ Registered Students Limit Reached!\n\nClass "${exam.className}" has only ${maxClassSheets} registered student(s).\nYou cannot scan extra sheets beyond the registered student count (${maxClassSheets}).`);
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
      alert("OMR Scan Error: " + (err.message || "Failed to locate 4 corner anchors. Please align sheet inside video frame."));
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const currentCount = fileList.length;
    const incomingCount = e.target.files.length;

    if (maxClassSheets !== Infinity && currentCount >= maxClassSheets) {
      alert(`⚠️ Registered Students Limit Reached!\n\nClass "${exam.className}" has only ${maxClassSheets} registered student(s).\nYou cannot scan extra sheets beyond the registered student count (${maxClassSheets}).`);
      e.target.value = '';
      return;
    }

    let allowedCount = incomingCount;
    if (maxClassSheets !== Infinity && currentCount + incomingCount > maxClassSheets) {
      allowedCount = maxClassSheets - currentCount;
      alert(`⚠️ Selection Adjusted!\n\nClass "${exam.className}" has ${maxClassSheets} registered student(s). Only ${allowedCount} sheet(s) could be added to reach the maximum limit of ${maxClassSheets}.`);
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

  // Delete student's OMR sheet record
  const handleDeleteFile = async (fileId: string) => {
    const target = fileList.find(f => f.id === fileId);
    if (!target) return;

    const studentInfo = target.result 
      ? (target.result.studentName !== 'Unknown Candidate' ? `${target.result.studentName} (${target.result.detectedStudentNum})` : `Roll: ${target.result.detectedStudentNum}`)
      : target.name;

    if (!window.confirm(`Are you sure you want to delete this OMR sheet record?\n\nFile/Student: ${studentInfo}`)) {
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

      alert(`OMR sheet record deleted successfully.`);
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message || err}`);
    }
  };

  const getSelectedFile = () => {
    return fileList.find(f => f.id === selectedFileId);
  };

  // Run the OMR scanner on the active image
  const runOMRScan = async () => {
    const current = getSelectedFile();
    if (!current) return;

    setIsScanning(true);
    setActiveResult(null);

    try {
      let imageSource: HTMLImageElement | HTMLCanvasElement;

      if (current.id.startsWith('sim-')) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1200;
        tempCanvas.height = 1600;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) throw new Error('Could not get simulated sheet context');

        ctx.fillStyle = '#b0bec5';
        ctx.fillRect(0, 0, 1200, 1600);

        ctx.save();
        ctx.translate(600, 800);
        ctx.rotate((5 * Math.PI) / 180);
        ctx.translate(-600, -800);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(100, 100, 1000, 1400);

        ctx.fillStyle = '#000000';
        ctx.fillRect(120, 120, 40, 40);
        ctx.fillRect(1040, 120, 40, 40);
        ctx.fillRect(120, 1440, 40, 40);
        ctx.fillRect(1040, 1440, 40, 40);

        ctx.fillStyle = '#c53030';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(exam.title.toUpperCase(), 600, 200);

        ctx.strokeStyle = '#c53030';
        ctx.lineWidth = 1;
        const candidateRoll = '1000000001';
        for (let col = 0; col < 10; col++) {
          const selectedDigit = parseInt(candidateRoll[col]);
          for (let row = 0; row < 10; row++) {
            const cx = 150 + col * 20;
            const cy = 280 + row * 20;
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            if (row === selectedDigit) {
              ctx.fillStyle = '#000000';
              ctx.fill();
            } else {
              ctx.stroke();
            }
          }
        }

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 20px Inter, sans-serif';
        ctx.fillText('BOOKLET SET', 450, 240);
        ctx.beginPath();
        ctx.arc(550, 235, 8, 0, 2 * Math.PI);
        ctx.fill();

        for (let q = 1; q <= Math.min(exam.numQuestions, 100); q++) {
          const colIndex = Math.floor((q - 1) / 25);
          const rowIndex = (q - 1) % 25;
          const startX = 150 + colIndex * 220;
          const startY = 520 + rowIndex * 35;

          const optionChars = ['A', 'B', 'C', 'D'];
          const correctOption = (exam.answerKey && exam.answerKey[q]) || 'A';
          const fillChoice = Math.random() > 0.15 ? correctOption : optionChars[Math.floor(Math.random() * 4)];

          optionChars.forEach((opt, idx) => {
            const bx = startX + 60 + idx * 30;
            const by = startY;
            ctx.beginPath();
            ctx.arc(bx, by, 7, 0, 2 * Math.PI);
            if (opt === fillChoice) {
              ctx.fillStyle = '#000000';
              ctx.fill();
            } else {
              ctx.stroke();
            }
          });
        }
        ctx.restore();
        imageSource = tempCanvas;
      } else {
        const img = new Image();
        img.src = current.previewUrl;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });
        imageSource = img;
      }

      setFileList(prev => prev.map(f => f.id === selectedFileId ? { ...f, status: 'Scanning' } : f));

      let cvResult = await scanOMRSheet(
        imageSource,
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
      alert('Please associate this scan with a student record before saving.');
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

      alert('Student score successfully saved to database!');
      
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

  return (
    <div className="scan-images-portal animate-fade-in" style={{ paddingBottom: '30px' }}>
      
      {/* MOBILE-OPTIMIZED 3-SCREEN APP BAR */}
      <div className="clean-app-header mb-3" style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              className="clean-back-btn" 
              onClick={() => {
                if (activeScreen > 1) setActiveScreen(1);
                else onClose();
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {activeScreen === 1 && `📷 Scan OMR: ${exam.title}`}
                {activeScreen === 2 && `📋 Student Roster (${scannedCount}/${maxClassSheets === Infinity ? classStudents.length : maxClassSheets})`}
                {activeScreen === 3 && `📄 Student OMR View`}
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Class: {exam.className || 'General'}</p>
            </div>
          </div>
        </div>

        {/* 3 Mobile Screen Selector Pills */}
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '4px' }}>
          <button
            onClick={() => setActiveScreen(1)}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '8px',
              background: activeScreen === 1 ? 'var(--primary)' : 'transparent',
              color: activeScreen === 1 ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Camera size={15} /> 1. Scan Hub
          </button>
          <button
            onClick={() => setActiveScreen(2)}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '8px',
              background: activeScreen === 2 ? 'var(--primary)' : 'transparent',
              color: activeScreen === 2 ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <UserCheck size={15} /> 2. Students ({scannedCount})
          </button>
          <button
            onClick={() => {
              if (selectedStudentSub) setActiveScreen(3);
              else alert('Select a student from Screen 2 to view their scanned sheet.');
            }}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '8px',
              background: activeScreen === 3 ? 'var(--primary)' : 'transparent',
              color: activeScreen === 3 ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Eye size={15} /> 3. Sheet View
          </button>
        </div>
      </div>

      {/* SCREEN 1: SCAN HUB & PENDING QUEUE */}
      {activeScreen === 1 && (
        <div className="screen-1-hub animate-fade-in">
          
          {/* Progress Header Card */}
          <div className="glass-card mb-3" style={{ padding: '16px', background: '#ffffff', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Class Scanning Progress</span>
                <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{scannedCount} of {maxClassSheets === Infinity ? 'Unlimited' : maxClassSheets} Sheets Scanned</h4>
              </div>
              <div style={{ background: '#ebf8ff', padding: '10px 14px', borderRadius: '12px', border: '1px solid #bee3f8', textAlign: 'right' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2b6cb0' }}>{maxClassSheets === Infinity ? 100 : Math.round((scannedCount / maxClassSheets) * 100)}%</span>
              </div>
            </div>

            <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${maxClassSheets === Infinity ? 100 : Math.min(100, (scannedCount / maxClassSheets) * 100)}%`, 
                  background: 'linear-gradient(90deg, #3182ce, #2b6cb0)',
                  transition: 'width 0.4s ease'
                }} 
              />
            </div>

            {isClassLimitReached && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px', color: '#c53030', fontSize: '0.85rem', fontWeight: 600 }}>
                ⚠️ Registered Class Limit Reached! All {maxClassSheets} registered student sheets for "{exam.className}" have been scanned. No extra sheets can be scanned.
              </div>
            )}
          </div>

          <div className="split-scan-view">
            {/* Left Controls & Queue */}
            <div className="left-panel glass-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                
                {/* Live Camera Scanner Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isClassLimitReached) {
                      alert(`⚠️ Registered Class Limit Reached!\n\nAll ${maxClassSheets} student sheets for class "${exam.className}" are already scanned.`);
                      return;
                    }
                    setShowCameraModal(true);
                  }}
                  disabled={isClassLimitReached}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    background: isClassLimitReached ? '#cbd5e1' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    cursor: isClassLimitReached ? 'not-allowed' : 'pointer',
                    boxShadow: isClassLimitReached ? 'none' : '0 4px 14px rgba(37,99,235,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                >
                  <Camera size={20} /> Live Camera Fast Scanner
                </button>

                <label className={`upload-drop-zone ${isClassLimitReached ? 'disabled' : ''}`} style={{ margin: 0, padding: '16px', borderRadius: '12px', cursor: isClassLimitReached ? 'not-allowed' : 'pointer' }}>
                  <Upload size={22} className="mb-1" />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Choose OMR Image Files</span>
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
              <div style={{ flex: 1, overflowY: 'auto', marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Pending Scans ({fileList.length})</h4>
                </div>

                {fileList.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No pending images. Click "Live Camera Fast Scanner" or choose files to begin.
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
                              title="Delete sheet record"
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
                          style={{ maxHeight: '420px', maxWidth: '100%', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Scan Diagnostics Card */}
                  <div className="glass-card scan-diag-card mt-3 animate-fade-in" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>OMR Processing Diagnostic</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>File: {getSelectedFile()?.name}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {activeResult && (
                          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
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
                          💾 Save Student Result
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <ImageIcon size={48} className="mb-2" style={{ opacity: 0.3 }} />
                  <h4>No OMR Sheet Selected</h4>
                  <p style={{ fontSize: '0.85rem' }}>Select a file from the pending queue or click "Live Camera Fast Scanner" above.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 2: STUDENT ROSTER LIST WITH LIVE SEARCH */}
      {activeScreen === 2 && (
        <div className="screen-2-roster animate-fade-in">
          <div className="glass-card mb-3" style={{ padding: '14px 18px', background: '#ffffff', borderRadius: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search student by Name or Roll Number..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {classStudents.filter(s => 
              s.name.toLowerCase().includes(rosterSearch.toLowerCase()) || 
              s.studentNum.toLowerCase().includes(rosterSearch.toLowerCase())
            ).length === 0 ? (
              <div className="glass-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No registered students found matching search filter.
              </div>
            ) : (
              classStudents
                .filter(s => 
                  s.name.toLowerCase().includes(rosterSearch.toLowerCase()) || 
                  s.studentNum.toLowerCase().includes(rosterSearch.toLowerCase())
                )
                .map(student => {
                  const sub = existingSubmissions.find(subItem => subItem.studentId === student.id);
                  const isScanned = !!sub;

                  return (
                    <div 
                      key={`roster-${student.id}`} 
                      className="glass-card hover-row" 
                      onClick={() => {
                        if (isScanned) {
                          setSelectedStudentSub({ student, submission: sub });
                          setActiveScreen(3);
                        } else {
                          alert(`No OMR sheet scanned yet for ${student.name.split('/')[0].trim()} (Roll: ${student.studentNum}). Go to "1. Scan Hub" to scan or upload.`);
                        }
                      }}
                      style={{ 
                        padding: '14px 18px', 
                        background: '#ffffff', 
                        borderRadius: '12px', 
                        border: '1px solid var(--border-color)', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        cursor: isScanned ? 'pointer' : 'default' 
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: isScanned ? '#e6fffa' : '#f1f5f9', color: isScanned ? '#319795' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{student.name.split('/')[0].trim()}</h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Roll: {student.studentNum}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ textAlign: 'right' }}>
                          {isScanned ? (
                            <span style={{ padding: '4px 10px', background: '#def7ec', color: '#03543f', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle size={14} /> Scanned ∑ {sub.score.toFixed(1)}
                            </span>
                          ) : (
                            <span style={{ padding: '4px 10px', background: '#fef3c7', color: '#92400e', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 600 }}>
                              ⏳ Pending Scan
                            </span>
                          )}
                        </div>
                        <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* SCREEN 3: INDIVIDUAL STUDENT SHEET DETAIL VIEW & SERVER OMR VIEWER */}
      {activeScreen === 3 && selectedStudentSub && (
        <div className="screen-3-detail animate-fade-in">
          <div className="glass-card mb-3" style={{ padding: '16px', background: '#ffffff', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <button className="clean-back-btn mb-2" onClick={() => setActiveScreen(2)}>
                <ArrowLeft size={16} /> Back to Roster
              </button>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {selectedStudentSub.student.name.split('/')[0].trim()}
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Roll: {selectedStudentSub.student.studentNum} | Booklet Set: {selectedStudentSub.submission.bookletSet || 'A'}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Total Marks</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {selectedStudentSub.submission.score.toFixed(1)} Pts
              </div>
            </div>
          </div>

          <div className="glass-card mb-3" style={{ padding: '16px', background: '#ffffff', borderRadius: '12px' }}>
            <h4 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Eye size={18} /> Permanent Scanned OMR Sheet Image
            </h4>

            {selectedStudentSub.submission.omrImageUrl ? (
              <div style={{ width: '100%', minHeight: '350px', background: '#0f172a', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                <img 
                  src={selectedStudentSub.submission.omrImageUrl} 
                  alt="Scanned OMR Sheet" 
                  style={{ maxHeight: '550px', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }} 
                />
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: 'var(--text-muted)' }}>
                <ImageIcon size={40} className="mb-2" style={{ opacity: 0.4 }} />
                <p style={{ margin: 0 }}>Local OMR Scan stored on device.</p>
              </div>
            )}
          </div>

          {/* Student Delete Action */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <button
              type="button"
              className="btn-danger"
              style={{ padding: '10px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={async () => {
                if (window.confirm(`Are you sure you want to delete OMR sheet record for ${selectedStudentSub.student.name}?`)) {
                  await db.submissions.where({ examId: exam.id, studentId: selectedStudentSub.student.id }).delete();
                  try {
                    await fetch('/api/admin/delete-submission', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ examId: exam.id, studentId: selectedStudentSub.student.id })
                    });
                  } catch {}
                  alert('Submission deleted successfully.');
                  refreshSubmissions();
                  setActiveScreen(2);
                }
              }}
            >
              <Trash2 size={16} /> Delete Student Record
            </button>
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
