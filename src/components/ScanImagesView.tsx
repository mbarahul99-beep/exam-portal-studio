import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  RotateCcw, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  ChevronRight, 
  FileText,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { db, type Exam, type Student } from '../db';
import { scanOMRSheet } from '../utils/omrScanner';
import confetti from 'canvas-confetti';

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
  status: 'Pending' | 'Scanned' | 'Failed';
  result?: any;
}

export const ScanImagesView: React.FC<ScanImagesViewProps> = ({ exam, students, onClose }) => {
  const [fileList, setFileList] = useState<ScanFileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [syncToCloud, setSyncToCloud] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cvLoaded, setCvLoaded] = useState(false);

  // Canvas View Controls
  const [rotation, setRotation] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);

  // Scanned verification states
  const [activeResult, setActiveResult] = useState<any | null>(null);
  const [detectedStudentId, setDetectedStudentId] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const getMaxPotentialScore = () => {
    if (exam.sections && exam.sections.length > 0) {
      let maxScore = 0;
      exam.sections.forEach((sec: any) => {
        const count = sec.allowOptionalAttempts ? (sec.maxAttempts ?? sec.qCount) : sec.qCount;
        maxScore += count * (sec.correctMarks ?? 4);
      });
      return maxScore;
    }
    return exam.numQuestions * (exam.correctMarks ?? 4);
  };

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles: ScanFileItem[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
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
  };

  const handleSimulateAdd = () => {
    // Generate a mock simulated scan item
    const mockItem: ScanFileItem = {
      id: `sim-${Date.now()}`,
      name: `simulated-sheet-${exam.title.toLowerCase().replace(/\s+/g, '-')}.jpg`,
      previewUrl: '', // Will be drawn in canvas when selected
      status: 'Pending'
    };

    setFileList(prev => {
      const updated = [...prev, mockItem];
      setSelectedFileId(mockItem.id);
      return updated;
    });
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
        // Draw simulated sheet on a temp canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1200;
        tempCanvas.height = 1600;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) throw new Error('Could not get simulated sheet context');

        // Draw background desk and paper bounding box
        ctx.fillStyle = '#b0bec5';
        ctx.fillRect(0, 0, 1200, 1600);

        ctx.save();
        ctx.translate(600, 800);
        ctx.rotate((5 * Math.PI) / 180); // Skew angle
        ctx.translate(-600, -800);

        // Draw White A4 sheet
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(100, 100, 1000, 1400);

        // 4 black square corner anchors
        ctx.fillStyle = '#000000';
        ctx.fillRect(120, 120, 40, 40); // TL
        ctx.fillRect(1040, 120, 40, 40); // TR
        ctx.fillRect(120, 1440, 40, 40); // BL
        ctx.fillRect(1040, 1440, 40, 40); // BR

        // Header Title
        ctx.fillStyle = '#c53030';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(exam.title.toUpperCase(), 600, 200);

        // Draw Roll No grid
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

        // Draw Questions & Options
        const mockAnswers: Record<number, string> = {};
        const options = ['A', 'B', 'C', 'D'];
        for (let q = 1; q <= exam.numQuestions; q++) {
          // Calculate correct and wrong answers for NEET
          const correct = exam.answerKey[q];
          // Seed 90% correct
          const picked = Math.random() > 0.1 ? correct : options.filter(o => o !== correct)[Math.floor(Math.random() * 3)];
          mockAnswers[q] = picked;

          // Draw question row bubble
          const colIndex = Math.floor((q - 1) / 50);
          const colQIndex = (q - 1) % 50;

          const startX = 400 + colIndex * 150;
          const startY = 285 + colQIndex * 22;

          ctx.fillStyle = '#c53030';
          ctx.font = '10px Inter';
          ctx.textAlign = 'left';
          ctx.fillText(String(q).padStart(2, '0'), startX, startY + 4);

          for (let optIdx = 0; optIdx < 4; optIdx++) {
            const optChar = options[optIdx];
            const bx = startX + 30 + optIdx * 20;
            ctx.beginPath();
            ctx.arc(bx, startY, 6, 0, 2 * Math.PI);
            if (picked === optChar) {
              ctx.fillStyle = '#000000';
              ctx.fill();
            } else {
              ctx.strokeStyle = '#c53030';
              ctx.stroke();
            }
          }
        }

        ctx.restore();
        imageSource = tempCanvas;
      } else {
        // Load image element
        const img = new Image();
        img.src = current.previewUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        imageSource = img;
      }

      // Run OpenCV sheet scanner (passing rollNoDigits and examSetsCount parameters)
      const cvResult = await scanOMRSheet(
        imageSource, 
        exam.numQuestions, 
        exam.rollNoDigits ?? 10, 
        exam.examSetsCount ?? 1, 
        exam.sections ?? []
      );

      // Match Student Roll No (robust against leading zero mismatches from dynamic digits configuration)
      const stripLeadingZeros = (val: string) => {
        const cleaned = val.replace(/^0+/, '');
        return cleaned === '' ? '0' : cleaned;
      };
      const cvRollStripped = stripLeadingZeros(cvResult.studentNum);
      const matchedStudent = students.find(s => stripLeadingZeros(s.studentNum) === cvRollStripped);
      const studentId = matchedStudent ? matchedStudent.id : null;

      // Grade calculations using multiple sets and section configurations
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
          const start = sec.qStart;
          const secCorrectMarks = sec.correctMarks ?? 4;
          const secIncorrectMarks = sec.incorrectMarks ?? -1;
          const secUnansweredMarks = 0;

          const qNums = Array.from({ length: sec.qCount }, (_, i) => start + i);

          if (sec.allowOptionalAttempts) {
            const maxAttempts = sec.maxAttempts ?? sec.qCount;
            let attemptsCount = 0;

            qNums.forEach(q => {
              const studentAns = cvResult.answers[q] || '';
              const correctAns = correctKey[q] || 'A';

              if (studentAns !== '') {
                if (attemptsCount < maxAttempts) {
                  attemptsCount++;
                  if (studentAns === correctAns) {
                    score += secCorrectMarks;
                    correctCount++;
                  } else {
                    score += secIncorrectMarks;
                    wrongCount++;
                  }
                } else {
                  score += secUnansweredMarks;
                  unansweredCount++;
                }
              } else {
                score += secUnansweredMarks;
                unansweredCount++;
              }
            });
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

      // Update file list status
      setFileList(prev => prev.map(f => {
        if (f.id === selectedFileId) {
          return {
            ...f,
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
  const handleVerifyStudentChange = (studentIdVal: number | null) => {
    setDetectedStudentId(studentIdVal);
    
    if (!activeResult) return;
    const student = students.find(s => s.id === studentIdVal);
    const updatedResult = {
      ...activeResult,
      studentId: studentIdVal,
      studentName: student ? student.name : 'Unknown Candidate'
    };
    
    setActiveResult(updatedResult);
    
    // Update the row item in fileList as well
    setFileList(prev => prev.map(f => {
      if (f.id === selectedFileId) {
        return {
          ...f,
          result: updatedResult
        };
      }
      return f;
    }));
  };

  const handleVerifyAnswerChange = (q: number, option: string) => {
    if (!activeResult) return;

    const updatedAnswers = { ...activeResult.answers, [q]: option };

    // Recalculate score using the same section-wise / uniform marking logic
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    const detectedSet = activeResult.bookletSet || 'A';
    let correctKey = (exam.answerKeys && exam.answerKeys[detectedSet]) || exam.answerKey;
    if (!correctKey || Object.keys(correctKey).length === 0) {
      correctKey = exam.answerKey;
    }

    if (exam.sections && exam.sections.length > 0) {
      exam.sections.forEach((sec: any) => {
        const start = sec.qStart;
        const secCorrectMarks = sec.correctMarks ?? 4;
        const secIncorrectMarks = sec.incorrectMarks ?? -1;
        const secUnansweredMarks = 0;

        const qNums = Array.from({ length: sec.qCount }, (_, i) => start + i);

        if (sec.allowOptionalAttempts) {
          const maxAttempts = sec.maxAttempts ?? sec.qCount;
          let attemptsCount = 0;

          qNums.forEach(currQ => {
            const studentAns = updatedAnswers[currQ] || '';
            const correctAns = correctKey[currQ] || 'A';

            if (studentAns !== '') {
              if (attemptsCount < maxAttempts) {
                attemptsCount++;
                if (studentAns === correctAns) {
                  score += secCorrectMarks;
                  correctCount++;
                } else {
                  score += secIncorrectMarks;
                  wrongCount++;
                }
              } else {
                score += secUnansweredMarks;
                unansweredCount++;
              }
            } else {
              score += secUnansweredMarks;
              unansweredCount++;
            }
          });
        } else {
          qNums.forEach(currQ => {
            const studentAns = updatedAnswers[currQ] || '';
            const correctAns = correctKey[currQ] || 'A';

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

      for (let currQ = 1; currQ <= exam.numQuestions; currQ++) {
        const studentAns = updatedAnswers[currQ] || '';
        const correctAns = correctKey[currQ] || 'A';

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

    const updatedResult = {
      ...activeResult,
      answers: updatedAnswers,
      score,
      correctCount,
      wrongCount,
      unansweredCount
    };

    setActiveResult(updatedResult);

    // Also update the item in fileList so it isn't lost if they click save
    setFileList(prev => prev.map(f => {
      if (f.id === selectedFileId) {
        return {
          ...f,
          result: updatedResult
        };
      }
      return f;
    }));
  };

  const handleSaveResult = async () => {
    if (!activeResult || !selectedFileId) return;

    if (!detectedStudentId) {
      alert('Please associate this scan with a student record before saving.');
      return;
    }

    try {
      const duplicate = await db.submissions
        .where('[examId+studentId]')
        .equals([exam.id!, detectedStudentId])
        .first();

      if (duplicate) {
        if (!confirm('This student already has a graded submission. Do you want to overwrite it?')) {
          return;
        }
        await db.submissions.delete(duplicate.id!);
      }

      await db.submissions.add({
        examId: exam.id!,
        studentId: detectedStudentId,
        score: activeResult.score,
        answers: activeResult.answers,
        bookletSet: activeResult.bookletSet,
        scannedAt: new Date()
      });

      alert('Student score successfully saved to database!');
      
      // Auto-advance to next pending file if available
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
    <div className="scan-images-portal animate-fade-in" style={{ paddingBottom: '120px' }}>
      {/* Top Header Breadcrumb Trail */}
      <div className="breadcrumb-nav mb-4">
        <span style={{ cursor: 'pointer', color: 'var(--primary)', textDecoration: 'underline' }} onClick={onClose}>Exams</span>
        <ChevronRight size={14} />
        <span style={{ cursor: 'pointer', color: 'var(--primary)', textDecoration: 'underline' }} onClick={onClose}>{exam.title}</span>
        <ChevronRight size={14} />
        <span style={{ fontWeight: 'bold' }}>Scan images</span>
      </div>

      <div className="split-scan-view">
        
        {/* LEFT COLUMN: File Listing & Upload */}
        <div className="left-panel glass-card">
          {fileList.length === 0 ? (
            /* Empty State Layout (Screenshot 2) */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px 12px' }}>
              <div style={{ width: '150px', height: '150px', marginBottom: '20px' }}>
                <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                  <rect x="15" y="20" width="70" height="50" rx="4" fill="none" stroke="var(--primary)" strokeWidth="2" />
                  <line x1="15" y1="60" x2="85" y2="60" stroke="var(--primary)" strokeWidth="1.5" />
                  <path d="M50,70 L50,85 M35,85 L65,85" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
                  <rect x="35" y="32" width="30" height="20" rx="2" fill="rgba(16, 88, 202, 0.1)" stroke="var(--primary)" strokeWidth="1" />
                  <circle cx="50" cy="42" r="4" fill="none" stroke="var(--primary)" strokeWidth="1.5" />
                  <path d="M25,28 C28,32 30,30 35,40" fill="none" stroke="#ecc94b" strokeWidth="1.5" strokeDasharray="2,2" />
                </svg>
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '0 0 8px 0' }}>Select images to Scan</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 20px 0' }}>Supported file formats (jpg, jpeg and png)</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                <label className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', padding: '10px 16px', borderRadius: '6px' }}>
                  <Upload size={16} /> Select Images
                  <input type="file" multiple accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                </label>
                <button className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={handleSimulateAdd}>
                  <RefreshCw size={14} /> Simulate scan sheet
                </button>
              </div>
            </div>
          ) : (
            /* Files Loaded List Layout (Screenshot 1) */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: '#ebf8ff', padding: '8px', borderRadius: '6px', color: 'var(--primary)' }}>
                    <ImageIcon size={20} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold' }}>{fileList.length} Total</h4>
                  </div>
                </div>
                <label style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>
                  Choose files
                  <input type="file" multiple accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                </label>
              </div>

              {/* Files Table List */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table className="app-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '30px' }}><input type="checkbox" readOnly /></th>
                      <th>Name/Rollnumber</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileList.map(f => (
                      <tr 
                        key={f.id} 
                        className={`hover-row ${selectedFileId === f.id ? 'active-item' : ''}`}
                        style={{ cursor: 'pointer', background: selectedFileId === f.id ? '#f0f4ff' : 'transparent' }}
                        onClick={() => {
                          setSelectedFileId(f.id);
                          setRotation(0);
                          setZoom(1.0);
                          if (f.status === 'Scanned' && f.result) {
                            setActiveResult(f.result);
                            setDetectedStudentId(f.result.studentId || null);
                          } else {
                            setActiveResult(null);
                            setDetectedStudentId(null);
                          }
                        }}
                      >
                        <td><input type="checkbox" checked={selectedFileId === f.id} readOnly /></td>
                        <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.status === 'Scanned' && f.result ? `${f.result.studentName} (${f.result.detectedStudentNum})` : f.name}>
                          {f.status === 'Scanned' && f.result ? (
                            f.result.studentId ? (
                              <strong>{f.result.studentName} ({f.result.detectedStudentNum})</strong>
                            ) : (
                              <span style={{ color: '#c05621' }}>Roll: {f.result.detectedStudentNum}</span>
                            )
                          ) : (
                            f.name
                          )}
                        </td>
                        <td>
                          <span className={`pill ${f.status === 'Scanned' ? 'pass' : f.status === 'Failed' ? 'fail' : 'pending'}`}>
                            {f.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Image Preview Canvas & Grading Verification */}
        <div className="right-panel">
          
          {/* Main Visual Crop Panel */}
          <div className="glass-card" style={{ flex: 1, position: 'relative', display: 'flex', background: '#f7fafc', minHeight: '400px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            
            {selectedFileId ? (
              <>
                {/* Floating Left Toolbar */}
                <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, background: '#ffffff', padding: '6px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  <button className="action-icon-btn" onClick={() => setRotation(r => (r - 90) % 360)} title="Rotate CCW">
                    <RotateCcw size={16} />
                  </button>
                  <button className="action-icon-btn" onClick={() => setRotation(r => (r + 90) % 360)} title="Rotate CW">
                    <RotateCw size={16} />
                  </button>
                  <button className="action-icon-btn" onClick={() => setZoom(z => Math.min(2.5, z + 0.2))} title="Zoom In">
                    <ZoomIn size={16} />
                  </button>
                  <button className="action-icon-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} title="Zoom Out">
                    <ZoomOut size={16} />
                  </button>
                </div>

                {/* Main Preview Container */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', padding: '24px' }}>
                  {getSelectedFile()?.id.startsWith('sim-') && !activeResult ? (
                    /* Simulated State before scan */
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      <FileText size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>Simulated scan sheet selected. Click <strong>Scan</strong> below to run the OMR scanner.</p>
                    </div>
                  ) : activeResult?.warpedCanvas ? (
                    /* Warped preview canvas from scanned result */
                    <div style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transition: 'transform 0.2s ease', maxHeight: '100%', maxWidth: '100%' }}>
                      <canvas 
                        ref={(el) => {
                          if (el && activeResult.warpedCanvas) {
                            el.width = activeResult.warpedCanvas.width;
                            el.height = activeResult.warpedCanvas.height;
                            const ctx = el.getContext('2d');
                            if (ctx) {
                              ctx.drawImage(activeResult.warpedCanvas, 0, 0);
                            }
                          }
                        }}
                        style={{ height: '360px', width: 'auto', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', borderRadius: '6px' }}
                      />
                    </div>
                  ) : getSelectedFile()?.previewUrl ? (
                    /* Static Uploaded Image Preview */
                    <img 
                      src={getSelectedFile()?.previewUrl} 
                      alt="OMR scan sheet preview" 
                      style={{ 
                        maxHeight: '380px', 
                        maxWidth: '90%', 
                        objectFit: 'contain',
                        transform: `rotate(${rotation}deg) scale(${zoom})`, 
                        transition: 'transform 0.2s ease',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
                        borderRadius: '6px'
                      }}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <p>Upload and select an OMR sheet image on the left to start grading.</p>
              </div>
            )}
          </div>

          {/* Verification Results Panel (if sheet is scanned) */}
          {activeResult && (
            <div className="glass-card animate-scale-up" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="scan-diag-header">
                <h4 style={{ margin: 0, fontWeight: 'bold' }}>Scan Diagnostics & Verification</h4>
                <span className="status-badge success" style={{ textTransform: 'capitalize' }}>
                  ✔ OMR Processed
                </span>
              </div>

              <div className="scan-diag-grid">
                {/* Associate Student */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Detected Candidate Roll: <code>{activeResult.detectedStudentNum}</code>
                  </label>
                  <select 
                    value={detectedStudentId || ''} 
                    onChange={(e) => handleVerifyStudentChange(Number(e.target.value) || null)}
                    style={{ padding: '8px 12px', width: '100%', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                  >
                    <option value="">-- Associate Student --</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (Roll: {s.studentNum})</option>
                    ))}
                  </select>
                </div>

                {/* Score Breakdown summary */}
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Grading Performance Index
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#f7fafc', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Score: <strong>{activeResult.score} / {getMaxPotentialScore()}</strong></span>
                      {exam.examSetsCount && exam.examSetsCount > 1 && (
                        <span className="status-badge info" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Set {activeResult.bookletSet}</span>
                      )}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#4a5568', display: 'flex', gap: '8px' }}>
                      <span className="text-success">✔ {activeResult.correctCount}</span>
                      <span className="text-error">✘ {activeResult.wrongCount}</span>
                      <span style={{ opacity: 0.6 }}>➖ {activeResult.unansweredCount}</span>
                    </span>
                  </div>
                </div>
                
                <div style={{ width: '100%', marginTop: '4px' }}>
                  <button 
                    className="btn-outlined" 
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '6px 12px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'inherit' }}
                    onClick={() => setShowDetails(!showDetails)}
                  >
                    <span>{showDetails ? 'Hide Scanned Items Detail' : 'Show Scanned Items Detail'}</span>
                    <span>{showDetails ? '▲' : '▼'}</span>
                  </button>
                  {showDetails && (
                    <div style={{ marginTop: '8px', maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'rgba(255,255,255,0.01)', padding: '12px' }}>
                      <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', opacity: 0.7 }}>Click any option bubble below to override or correct scanned answers:</p>
                      <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '6px 4px' }}>Q.No</th>
                            <th style={{ padding: '6px 4px' }}>Scanned Bubble / Override</th>
                            <th style={{ padding: '6px 4px' }}>Correct Key</th>
                            <th style={{ padding: '6px 4px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: exam.numQuestions }).map((_, idx) => {
                            const q = idx + 1;
                            const studentAns = activeResult.answers[q] || '';
                            const detectedSet = activeResult.bookletSet || 'A';
                            let correctKey = (exam.answerKeys && exam.answerKeys[detectedSet]) || exam.answerKey;
                            if (!correctKey || Object.keys(correctKey).length === 0) {
                              correctKey = exam.answerKey;
                            }
                            const correctAns = correctKey[q] || 'A';

                            // Determine question options count
                            const sec = exam.sections?.find((s: any) => q >= s.qStart && q < s.qStart + s.qCount);
                            const options = sec && sec.questionType === '5 option' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];

                            const isCorrect = studentAns === correctAns;
                            return (
                              <tr key={`diag-row-${q}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <td style={{ padding: '6px 4px', fontWeight: 'bold' }}>Q{q}</td>
                                <td style={{ padding: '6px 4px' }}>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    {options.map(opt => (
                                      <button
                                        key={`diag-opt-${q}-${opt}`}
                                        onClick={() => handleVerifyAnswerChange(q, studentAns === opt ? '' : opt)}
                                        style={{
                                          width: '22px',
                                          height: '22px',
                                          borderRadius: '50%',
                                          border: '1px solid var(--border-color)',
                                          background: studentAns === opt ? 'var(--primary)' : 'none',
                                          color: studentAns === opt ? '#fff' : 'inherit',
                                          fontSize: '0.65rem',
                                          fontWeight: 'bold',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          transition: 'all 0.15s ease'
                                        }}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                    {studentAns !== '' && (
                                      <button
                                        onClick={() => handleVerifyAnswerChange(q, '')}
                                        style={{
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          border: 'none',
                                          background: 'rgba(229, 62, 62, 0.1)',
                                          color: '#e53e3e',
                                          fontSize: '0.6rem',
                                          cursor: 'pointer',
                                          marginLeft: '4px'
                                        }}
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '6px 4px', fontWeight: '600', fontSize: '0.8rem' }}>{correctAns}</td>
                                <td style={{ padding: '6px 4px', color: studentAns === '' ? 'var(--text-muted)' : isCorrect ? 'var(--success)' : 'var(--error)', fontWeight: 'bold' }}>
                                  {studentAns === '' ? 'Unanswered' : isCorrect ? '✔ Correct' : '✘ Wrong'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="scan-diag-actions" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <button className="btn-secondary" onClick={() => setActiveResult(null)}>Close Results</button>
                <button className="btn-primary" onClick={handleSaveResult}>Save Scanned Score</button>
              </div>
            </div>
          )}

          {/* Bottom Toolbar Action Bar */}
          <div className="glass-card scan-bottom-bar">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={syncToCloud} onChange={(e) => setSyncToCloud(e.target.checked)} />
              Sync images to cloud
            </label>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn-secondary" 
                style={{ padding: '10px 20px', borderRadius: '6px' }}
                disabled={fileList.filter(f => f.status === 'Pending').length === 0}
                onClick={async () => {
                  const pending = fileList.filter(f => f.status === 'Pending');
                  for (const f of pending) {
                    setSelectedFileId(f.id);
                    await runOMRScan();
                  }
                }}
              >
                Scan All
              </button>
              <button 
                className="btn-primary" 
                style={{ padding: '10px 20px', borderRadius: '6px' }}
                disabled={!selectedFileId || isScanning || !cvLoaded}
                onClick={runOMRScan}
              >
                {isScanning ? <RefreshCw className="spin" size={16} /> : 'Scan'}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
