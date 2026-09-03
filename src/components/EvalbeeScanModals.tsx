import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  CheckCircle
} from 'lucide-react';
import type { Exam, Student } from '../db';
import { isAnswerMatch } from '../utils/omrScanner';

export interface EvalbeeScanData {
  studentId: number | null;
  studentNum: string;
  studentName: string;
  score: number;
  sectionScores?: Record<string, number>;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  answers: Record<number, string>;
  bookletSet: string;
  omrImageUrl: string;
  bubbleSnippets?: Record<number, Record<string, string>>;
  bestDy?: number;
  questionOffsets?: Record<number, { dx: number; dy: number }>;
}

// ═════════════════════════════════════════════════════════════════════════════
// SCREEN 2: EVALBEE RESULT OVERVIEW MODAL
// ═════════════════════════════════════════════════════════════════════════════
interface EvalbeeResultModalProps {
  scanData: EvalbeeScanData;
  exam?: Exam;
  students?: Student[];
  onCancel: () => void;
  onEdit: () => void;
  onSave: (finalData: EvalbeeScanData) => void;
}

export const EvalbeeResultModal: React.FC<EvalbeeResultModalProps> = ({
  scanData,
  onCancel,
  onEdit,
  onSave
}) => {
  const [zoom, setZoom] = useState<number>(1);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99998,
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      flexDirection: 'column',
      color: '#0f172a',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* ── Top Header Bar (Evalbee Screenshot 2 Style) ── */}
      <div style={{
        background: '#ffffff',
        padding: '16px 20px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
      }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
          Roll No : {scanData.studentNum ? `${scanData.studentNum}-${scanData.studentName.split('/')[0].trim()}` : scanData.studentName}
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#475569' }}>
          Marks : <span style={{ color: '#0f172a', fontWeight: 800 }}>{scanData.score.toFixed(1)}</span>
        </div>

        {/* Section Marks Breakdown */}
        {scanData.sectionScores && Object.keys(scanData.sectionScores).length > 0 && (
          <div style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: '4px'
          }}>
            {Object.entries(scanData.sectionScores).map(([secName, secScore]) => (
              <span 
                key={secName}
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#334155',
                  textTransform: 'uppercase'
                }}
              >
                {secName} : <span style={{ fontWeight: 800, color: secScore >= 0 ? '#16a34a' : '#dc2626' }}>{secScore.toFixed(1)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Center Sheet Preview (With Zoom & Scroll) ── */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: '#090d16'
      }}>
        {/* Floating Zoom Controls */}
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 10,
          display: 'flex',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.75)',
          padding: '6px',
          borderRadius: '12px',
          backdropFilter: 'blur(8px)'
        }}>
          <button 
            type="button" 
            onClick={() => setZoom(z => Math.min(2.5, z + 0.25))}
            style={{ padding: '6px', background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <button 
            type="button" 
            onClick={() => setZoom(z => Math.max(0.6, z - 0.25))}
            style={{ padding: '6px', background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <button 
            type="button" 
            onClick={() => setZoom(1)}
            style={{ padding: '6px', background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
            title="Reset Zoom"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        <div style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          transition: 'transform 0.15s ease-out',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          borderRadius: '8px',
          overflow: 'hidden',
          maxHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <img 
            src={scanData.omrImageUrl} 
            alt="Scanned OMR Sheet" 
            style={{
              maxHeight: 'calc(100vh - 220px)',
              maxWidth: '92vw',
              objectFit: 'contain',
              display: 'block'
            }}
          />
        </div>
      </div>

      {/* ── Bottom Action Bar (Evalbee Screenshot 2 Style: [Cancel] [Edit] [Save]) ── */}
      <div style={{
        background: '#ffffff',
        padding: '16px 20px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.06)'
      }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#ffffff',
            color: '#334155',
            border: '1.5px solid #cbd5e1',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'background 0.15s'
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onEdit}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#ffffff',
            color: '#2563eb',
            border: '1.5px solid #93c5fd',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'background 0.15s'
          }}
        >
          Edit
        </button>

        <button
          type="button"
          onClick={() => onSave(scanData)}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            transition: 'opacity 0.15s'
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCREEN 3: EVALBEE VISUAL QUESTION BUBBLE EDITOR MODAL
// ═════════════════════════════════════════════════════════════════════════════
interface EvalbeeQuestionBubbleEditorModalProps {
  scanData: EvalbeeScanData;
  exam: Exam;
  students: Student[];
  onCancel: () => void;
  onSaveEdited: (updatedData: EvalbeeScanData) => void;
}

export const EvalbeeQuestionBubbleEditorModal: React.FC<EvalbeeQuestionBubbleEditorModalProps> = ({
  scanData,
  exam,
  students,
  onCancel,
  onSaveEdited
}) => {
  const [currentAnswers, setCurrentAnswers] = useState<Record<number, string>>({ ...scanData.answers });
  const [currentRollNum, setCurrentRollNum] = useState<string>(scanData.studentNum || '');
  const optionChars = ['A', 'B', 'C', 'D', 'E'];

  const classStudents = students.filter(s => s.className === exam.className);
  const cleanRoll = currentRollNum.trim().replace(/^0+/, '');
  const matchedStudent = cleanRoll
    ? classStudents.find(s => s.studentNum.replace(/^0+/, '') === cleanRoll)
    : null;

  // Toggle option pick for a question
  const toggleOption = (q: number, optChar: string) => {
    setCurrentAnswers(prev => {
      const existing = prev[q] || '';
      const picks = existing.split(',').map(s => s.trim()).filter(Boolean);
      let nextPicks: string[];
      if (picks.includes(optChar)) {
        nextPicks = picks.filter(p => p !== optChar);
      } else {
        // Single choice selection (or toggle)
        nextPicks = [optChar];
      }
      return {
        ...prev,
        [q]: nextPicks.join(',')
      };
    });
  };

  // Recalculate scores and commit
  const handleSave = () => {
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    const sectionScores: Record<string, number> = {};

    let correctKey = (exam.answerKeys && exam.answerKeys[scanData.bookletSet]) || exam.answerKey;
    if (!correctKey || Object.keys(correctKey).length === 0) {
      correctKey = exam.answerKey || {};
    }

    if (exam.sections && exam.sections.length > 0) {
      exam.sections.forEach((sec: any) => {
        const secName = sec.name || `Section ${sec.id || ''}`;
        let secScore = 0;
        const secCorrectMarks = sec.correctMarks ?? 4;
        const secIncorrectMarks = sec.incorrectMarks ?? -1;
        const secUnansweredMarks = sec.unansweredMarks ?? 0;
        const qNums: number[] = Array.from({ length: sec.qCount }, (_, k) => sec.qStart + k);

        qNums.forEach(q => {
          const studentAns = currentAnswers[q] || '';
          const correctAns = correctKey[q] || '';
          if (studentAns === '') {
            secScore += secUnansweredMarks;
            score += secUnansweredMarks;
            unansweredCount++;
          } else if (isAnswerMatch(studentAns, correctAns)) {
            secScore += secCorrectMarks;
            score += secCorrectMarks;
            correctCount++;
          } else {
            secScore += secIncorrectMarks;
            score += secIncorrectMarks;
            wrongCount++;
          }
        });
        sectionScores[secName] = secScore;
      });
    } else {
      const cMarks = exam.correctMarks ?? 4;
      const iMarks = exam.incorrectMarks ?? -1;
      const uMarks = exam.unansweredMarks ?? 0;

      for (let q = 1; q <= exam.numQuestions; q++) {
        const studentAns = currentAnswers[q] || '';
        const correctAns = correctKey[q] || '';

        if (studentAns === '') {
          score += uMarks;
          unansweredCount++;
        } else if (isAnswerMatch(studentAns, correctAns)) {
          score += cMarks;
          correctCount++;
        } else {
          score += iMarks;
          wrongCount++;
        }
      }
    }

    const updatedData: EvalbeeScanData = {
      ...scanData,
      studentId: matchedStudent?.id ?? scanData.studentId,
      studentNum: currentRollNum,
      studentName: matchedStudent ? matchedStudent.name : (currentRollNum ? `Student (Roll ${currentRollNum})` : scanData.studentName),
      score,
      sectionScores,
      correctCount,
      wrongCount,
      unansweredCount,
      answers: currentAnswers
    };

    onSaveEdited(updatedData);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      background: 'rgba(15, 23, 42, 0.88)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      flexDirection: 'column',
      color: '#0f172a',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* ── Top Header: Roll No Input ── */}
      <div style={{
        background: '#ffffff',
        padding: '16px 20px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
            Roll No
          </span>
          <input 
            type="text"
            value={currentRollNum}
            onChange={(e) => setCurrentRollNum(e.target.value)}
            style={{
              padding: '6px 14px',
              fontSize: '1.1rem',
              fontWeight: 700,
              border: '1.5px solid #cbd5e1',
              borderRadius: '8px',
              width: '130px',
              color: '#0f172a',
              outline: 'none',
              textAlign: 'center'
            }}
            placeholder="Roll No"
          />
        </div>

        {matchedStudent && (
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={16} /> {matchedStudent.name}
          </div>
        )}
      </div>

      {/* ── Scrollable Question Rows (Evalbee Screenshot 3 Style) ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 20px',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {Array.from({ length: exam.numQuestions }, (_, i) => i + 1).map((q) => {
          const sec = exam.sections?.find((s: any) => q >= s.qStart && q < s.qStart + s.qCount);
          const is5Option = sec && sec.questionType === '5 option';
          const numOptions = is5Option ? 5 : 4;
          const currentPick = currentAnswers[q] || '';
          const activePicks = currentPick.split(',').map(s => s.trim()).filter(Boolean);
          const qSnippets = scanData.bubbleSnippets?.[q];

          return (
            <div 
              key={`q-edit-row-${q}`}
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '12px 16px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              {/* Question Number */}
              <div style={{
                width: '36px',
                fontSize: '1.1rem',
                fontWeight: 800,
                color: '#334155',
                textAlign: 'left'
              }}>
                {q}
              </div>

              {/* Options Column (Cropped Photo on Top, Interactive Button on Bottom) */}
              <div style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                flexWrap: 'nowrap'
              }}>
                {optionChars.slice(0, numOptions).map((optChar) => {
                  const isSelected = activePicks.includes(optChar);
                  const bubbleImg = qSnippets?.[optChar];

                  return (
                    <div 
                      key={`q-${q}-opt-${optChar}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {/* 1. Cropped Photo of Bubble on Paper */}
                      <div style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {bubbleImg ? (
                          <img 
                            src={bubbleImg} 
                            alt={`Q${q} ${optChar}`} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>-</span>
                        )}
                      </div>

                      {/* 2. Interactive Option Button */}
                      <button
                        type="button"
                        onClick={() => toggleOption(q, optChar)}
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          border: isSelected ? 'none' : '1px solid #cbd5e1',
                          background: isSelected ? '#16a34a' : '#e2e8f0',
                          color: isSelected ? '#ffffff' : '#334155',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease-out',
                          boxShadow: isSelected ? '0 2px 8px rgba(22, 163, 74, 0.35)' : 'none'
                        }}
                      >
                        {optChar}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom Action Bar: [Cancel] [Save] ── */}
      <div style={{
        background: '#ffffff',
        padding: '16px 20px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.06)'
      }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#ffffff',
            color: '#334155',
            border: '1.5px solid #cbd5e1',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleSave}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
};
