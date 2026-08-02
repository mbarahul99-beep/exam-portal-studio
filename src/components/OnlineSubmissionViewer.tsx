import React, { useEffect, useState } from 'react';
import { X, Check, AlertCircle, HelpCircle, BookOpen } from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { db, type Exam, type ExamSubmission, type Question } from '../db';

interface OnlineSubmissionViewerProps {
  exam: Exam;
  submission: ExamSubmission;
  studentName: string;
  onClose: () => void;
}

const OPTIONS_LETTERS = ['A', 'B', 'C', 'D', 'E'];

export const OnlineSubmissionViewer: React.FC<OnlineSubmissionViewerProps> = ({
  exam,
  submission,
  studentName,
  onClose
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        setLoading(true);
        // Load custom questions if any exist in the database for this exam
        const dbQs = await db.questions.where('examId').equals(exam.id!).toArray();
        if (dbQs.length > 0) {
          // Sort by question order if needed (assuming sequential sequence or by id)
          // We can sort them to align with Q1, Q2, etc.
          const sorted = [...dbQs].sort((a, b) => (a.id || 0) - (b.id || 0));
          setQuestions(sorted);
        } else {
          // Generate mock questions dynamically aligned with answerKey
          setQuestions(generateMockQuestions(exam.numQuestions, exam.answerKey || {}, exam.id!));
        }
      } catch (err) {
        console.error('Failed to load questions:', err);
      } finally {
        setLoading(false);
      }
    };

    loadQuestions();
  }, [exam, submission]);

  // Group questions by section name
  const sectionsMap = new Map<string, Question[]>();
  questions.forEach((q) => {
    const sec = q.sectionName || 'General Test';
    if (!sectionsMap.has(sec)) {
      sectionsMap.set(sec, []);
    }
    sectionsMap.get(sec)!.push(q);
  });

  const sectionNames = Array.from(sectionsMap.keys());

  // Performance stats
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  for (let i = 1; i <= exam.numQuestions; i++) {
    const studentAns = submission.answers ? submission.answers[i] : '';
    const correctAns = exam.answerKey ? exam.answerKey[i] : '';
    if (!studentAns) skippedCount++;
    else if (studentAns === correctAns) correctCount++;
    else wrongCount++;
  }

  const maxPossibleScore = exam.numQuestions * (exam.correctMarks || 4);

  return (
    <div className="submission-viewer-overlay">
      <style>{`
        .submission-viewer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          z-index: 9999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          box-sizing: border-box;
        }

        .submission-viewer-container {
          background: #f8fafc;
          width: 100%;
          max-width: 900px;
          height: 90vh;
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          animation: viewer-scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes viewer-scale-up {
          0% {
            transform: scale(0.95);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .viewer-header {
          background: #ffffff;
          padding: 20px 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .viewer-header-info h3 {
          margin: 0 0 4px 0;
          font-size: 1.25rem;
          font-weight: 800;
          color: #0f172a;
        }

        .viewer-header-info p {
          margin: 0;
          font-size: 0.85rem;
          color: #64748b;
        }

        .viewer-close-btn {
          background: #f1f5f9;
          color: #64748b;
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .viewer-close-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        .viewer-summary-banner {
          background: #ffffff;
          padding: 16px 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .summary-stats-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .summary-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 9999px;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .summary-pill.score {
          background: #eff6ff;
          color: #2563eb;
        }

        .summary-pill.correct {
          background: #f0fdf4;
          color: #16a34a;
        }

        .summary-pill.wrong {
          background: #fdf2f2;
          color: #dc2626;
        }

        .summary-pill.skipped {
          background: #f1f5f9;
          color: #475569;
        }

        .viewer-content-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .section-header-title {
          font-size: 1rem;
          font-weight: 800;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-left: 4px solid #0d9488;
          padding-left: 10px;
          margin: 16px 0 16px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .question-item-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 24px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .question-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
          border-bottom: 1px dashed #e2e8f0;
          padding-bottom: 12px;
        }

        .q-num-label {
          font-weight: 800;
          color: #0f172a;
        }

        .q-marks-label {
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .q-marks-label.positive {
          background: #e6f4ea;
          color: #137333;
        }

        .q-marks-label.negative {
          background: #fce8e6;
          color: #c5221f;
        }

        .q-marks-label.zero {
          background: #f1f3f4;
          color: #5f6368;
        }

        .option-review-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          font-size: 0.9rem;
          text-align: left;
          transition: all 0.15s ease;
        }

        .option-review-row.correct-key {
          border-color: #86efac;
          background: #f0fdf4;
          color: #14532d;
          font-weight: 600;
        }

        .option-review-row.wrong-selected {
          border-color: #fca5a5;
          background: #fef2f2;
          color: #7f1d1d;
          font-weight: 600;
        }

        .option-letter-badge {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 1px solid #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.78rem;
          flex-shrink: 0;
          background: #ffffff;
          color: #475569;
        }

        .option-review-row.correct-key .option-letter-badge {
          border-color: #22c55e;
          background: #22c55e;
          color: #ffffff;
        }

        .option-review-row.wrong-selected .option-letter-badge {
          border-color: #ef4444;
          background: #ef4444;
          color: #ffffff;
        }

        .explanation-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 16px;
          font-size: 0.85rem;
          color: #475569;
          line-height: 1.5;
        }

        .explanation-box-header {
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .response-summary-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 0.8rem;
          color: #64748b;
          background: #f8fafc;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 600;
        }

        .response-summary-footer span strong {
          color: #334155;
        }

        @media (max-width: 768px) {
          .submission-viewer-overlay {
            padding: 0;
          }
          .submission-viewer-container {
            height: 100vh;
            border-radius: 0;
          }
          .viewer-header {
            padding: 16px;
          }
          .viewer-summary-banner {
            padding: 12px 16px;
          }
          .viewer-content-scroll {
            padding: 16px;
          }
          .question-item-card {
            padding: 16px;
            gap: 12px;
          }
        }
      `}</style>

      <div className="submission-viewer-container">
        {/* Modal Header */}
        <div className="viewer-header">
          <div className="viewer-header-info">
            <h3>{exam.title}</h3>
            <p>Candidate: <strong>{studentName}</strong> • Class: <strong>{exam.className}</strong></p>
          </div>
          <button className="viewer-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Summary Banner */}
        <div className="viewer-summary-banner">
          <div className="summary-stats-pills">
            <div className="summary-pill score">
              Score: {submission.score.toFixed(1)} / {maxPossibleScore.toFixed(0)}
            </div>
            <div className="summary-pill correct">
              <Check size={14} /> {correctCount} Correct
            </div>
            <div className="summary-pill wrong">
              <X size={14} /> {wrongCount} Wrong
            </div>
            <div className="summary-pill skipped">
              <HelpCircle size={14} /> {skippedCount} Left
            </div>
          </div>
        </div>

        {/* Main scrollable questions container */}
        <div className="viewer-content-scroll">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: '#64748b' }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #cbd5e1', borderTopColor: '#0d9488', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span>Loading questions...</span>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : (
            sectionNames.map((sectionName) => {
              const secQs = sectionsMap.get(sectionName) || [];
              return (
                <div key={sectionName} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h4 className="section-header-title">
                    <BookOpen size={16} /> {sectionName}
                  </h4>

                  {secQs.map((q, idx) => {
                    // Determine absolute question number
                    // Map questions to find its 1-based index in the master questions list
                    const qIndexInMaster = questions.findIndex((masterQ) => masterQ.id === q.id || (masterQ.questionText === q.questionText && masterQ.sectionName === q.sectionName));
                    const qNum = qIndexInMaster !== -1 ? qIndexInMaster + 1 : idx + 1;

                    const studentAns = submission.answers ? submission.answers[qNum] : '';
                    const correctAns = exam.answerKey ? exam.answerKey[qNum] : '';

                    // Calculate marks for this question
                    const secRules = exam.sectionsMarking?.[sectionName] || {
                      correctMarks: exam.correctMarks || 4,
                      incorrectMarks: exam.incorrectMarks || -1,
                      unansweredMarks: exam.unansweredMarks || 0
                    };

                    let earnedMarks = 0;
                    let marksClass = 'zero';
                    if (!studentAns) {
                      earnedMarks = secRules.unansweredMarks || 0;
                      marksClass = earnedMarks > 0 ? 'positive' : earnedMarks < 0 ? 'negative' : 'zero';
                    } else if (studentAns === correctAns) {
                      earnedMarks = secRules.correctMarks;
                      marksClass = 'positive';
                    } else {
                      earnedMarks = secRules.incorrectMarks;
                      marksClass = 'negative';
                    }

                    return (
                      <div key={q.id || idx} className="question-item-card">
                        {/* Header: Question Number & Marks */}
                        <div className="question-card-header">
                          <span className="q-num-label">QUESTION {qNum}</span>
                          <span className={`q-marks-label ${marksClass}`}>
                            {earnedMarks >= 0 ? `+${earnedMarks.toFixed(1)}` : earnedMarks.toFixed(1)} Marks
                          </span>
                        </div>

                        {/* Question Text */}
                        <div style={{ fontSize: '0.95rem', color: '#1e293b', fontWeight: '700', textAlign: 'left', lineHeight: '1.6' }}>
                          <MathRenderer text={q.questionText} />
                        </div>

                        {/* Question Image */}
                        {q.questionImage && (
                          <div style={{ alignSelf: 'center', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px', maxWidth: '100%', display: 'inline-block' }}>
                            <img src={q.questionImage} alt={`Q.${qNum} diagram`} style={{ maxHeight: '200px', maxWidth: '100%', objectFit: 'contain' }} />
                          </div>
                        )}

                        {/* Options List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {q.options.map((optText, optIdx) => {
                            const letter = OPTIONS_LETTERS[optIdx];
                            const isCorrectKey = letter === correctAns;
                            const isSelectedWrong = (letter === studentAns) && (studentAns !== correctAns);

                            let optionClass = '';
                            if (isCorrectKey) optionClass = 'correct-key';
                            else if (isSelectedWrong) optionClass = 'wrong-selected';

                            return (
                              <div key={optIdx} className={`option-review-row ${optionClass}`}>
                                <span className="option-letter-badge">{letter}</span>
                                <span style={{ flex: 1 }}><MathRenderer text={optText} /></span>
                                {isCorrectKey && <Check size={18} style={{ color: '#16a34a', marginLeft: 'auto', flexShrink: 0 }} />}
                                {isSelectedWrong && <X size={18} style={{ color: '#dc2626', marginLeft: 'auto', flexShrink: 0 }} />}
                              </div>
                            );
                          })}
                        </div>

                        {/* Question Stats Footer */}
                        <div className="response-summary-footer">
                          <span>Correct Answer: <strong style={{ color: '#16a34a' }}>{correctAns}</strong></span>
                          <span>Student's Response: <strong style={studentAns === correctAns ? { color: '#16a34a' } : studentAns ? { color: '#dc2626' } : { color: '#64748b' }}>{studentAns || 'Skipped (Left)'}</strong></span>
                        </div>

                        {/* Explanation Box */}
                        {q.explanation && (
                          <div className="explanation-box">
                            <div className="explanation-box-header">
                              <AlertCircle size={14} style={{ color: '#0d9488' }} /> Explanation
                            </div>
                            <div style={{ textAlign: 'left' }}>
                              <MathRenderer text={q.explanation} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

// Generates high-fidelity mock questions aligned with the answer key (exactly like OnlineExamPortal.tsx)
const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
function generateMockQuestions(numQuestions: number, answerKey: Record<number, string>, examId: number): Question[] {
  const genericQuestions = [
    {
      text: "Which of the following physical quantities has the same dimensional formula as that of impulse?",
      options: ["Force", "Linear Momentum", "Torque", "Pressure"],
      correctOpt: 'B',
      explanation: "Impulse is Force * Time, which is MLT^-2 * T = MLT^-1. This is identical to the dimensional formula of linear momentum."
    },
    {
      text: "A particle is moving in a circle of radius R with constant speed v. The magnitude of average acceleration during a semi-circle turn is:",
      options: ["v^2 / R", "2v^2 / (pi * R)", "v^2 / (2 * R)", "Zero"],
      correctOpt: 'B',
      explanation: "Average acceleration is change in velocity divided by time. Time = pi*R/v. Change in velocity is 2v. Average acceleration = 2v / (pi*R/v) = 2v^2/(pi*R)."
    },
    {
      text: "The dimensional formula of universal gravitational constant G is:",
      options: ["[M^-1 L^3 T^-2]", "[M^1 L^3 T^-2]", "[M^-1 L^2 T^-2]", "[M^1 L^2 T^-1]"],
      correctOpt: 'A',
      explanation: "Since F = G*m1*m2 / r^2, G = F*r^2 / (m1*m2). Substituting dimensions gives [MLT^-2]*[L^2] / [M^2] = [M^-1 L^3 T^-2]."
    },
    {
      text: "Which of the following organic compounds will show optical activity?",
      options: ["2-Chlorobutane", "1-Chlorobutane", "2-Chloropropane", "Butane"],
      correctOpt: 'A',
      explanation: "2-Chlorobutane contains a chiral carbon atom bonded to four different groups (-H, -Cl, -CH3, -CH2CH3)."
    },
    {
      text: "The primary structure of a protein refers to:",
      options: ["Helix configuration", "Sequence of amino acids", "Three dimensional foldings", "Aggregation of sub-units"],
      correctOpt: 'B',
      explanation: "The primary structure is the linear sequence of amino acids joined by peptide bonds."
    },
    {
      text: "Which cell organelle is responsible for cellular respiration and ATP generation?",
      options: ["Ribosome", "Mitochondria", "Chloroplast", "Lysosome"],
      correctOpt: 'B',
      explanation: "Mitochondria are known as the powerhouses of the cell because they are the site of aerobic respiration and generate ATP."
    },
    {
      text: "In angiosperms, double fertilization is characterized by:",
      options: ["Fusion of two polar nuclei", "Syngamy and triple fusion", "Fertilization of two eggs", "Fusion of tube cell and egg"],
      correctOpt: 'B',
      explanation: "Double fertilization involves syngamy (fusion of one male gamete with the egg) and triple fusion (fusion of the second male gamete with the secondary nucleus)."
    },
    {
      text: "The process of division of cytoplasm during cell cycle is named as:",
      options: ["Karyokinesis", "Cytokinesis", "Mitosis", "Meiosis"],
      correctOpt: 'B',
      explanation: "Cytokinesis is the physical division of cytoplasm, cell membrane, and organelles into two daughter cells following karyokinesis."
    }
  ];

  const questionsList: Question[] = [];

  for (let i = 1; i <= numQuestions; i++) {
    const targetAns = answerKey[i] || 'A';
    const targetIdx = OPTIONS.indexOf(targetAns);

    let sectionName = 'General Test';
    if (numQuestions === 200) {
      if (i <= 50) sectionName = 'Physics';
      else if (i <= 100) sectionName = 'Chemistry';
      else if (i <= 150) sectionName = 'Botany';
      else sectionName = 'Zoology';
    } else if (numQuestions >= 50) {
      const perSec = Math.floor(numQuestions / 3);
      if (i <= perSec) sectionName = 'Physics';
      else if (i <= perSec * 2) sectionName = 'Chemistry';
      else sectionName = 'Biology';
    }

    const baseQ = genericQuestions[(i - 1) % genericQuestions.length];
    
    // Build options list rearranging options so that the correct answer is aligned with targetAns index
    const listOpts = [...baseQ.options];
    const baseCorrectIdx = OPTIONS.indexOf(baseQ.correctOpt);
    
    if (baseCorrectIdx !== -1 && targetIdx !== -1 && baseCorrectIdx !== targetIdx) {
      const temp = listOpts[targetIdx];
      listOpts[targetIdx] = listOpts[baseCorrectIdx];
      listOpts[baseCorrectIdx] = temp;
    }

    questionsList.push({
      examId,
      sectionName,
      questionText: `[Q.${i}] ${baseQ.text} (Section: ${sectionName})`,
      options: listOpts,
      correctOptionIdx: targetIdx !== -1 ? targetIdx : 0,
      explanation: baseQ.explanation
    });
  }

  return questionsList;
}
