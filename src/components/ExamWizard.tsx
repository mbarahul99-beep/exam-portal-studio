import React, { useState } from 'react';
import { Calendar, CheckCircle, X } from 'lucide-react';
import { db } from '../db';

import { type ClassEntity } from '../db';

interface ExamWizardProps {
  classes: ClassEntity[];
  onClose: () => void;
  onSuccess: (examId: number) => void;
}

export const ExamWizard: React.FC<ExamWizardProps> = ({ classes, onClose, onSuccess }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Basic Details States
  const [examName, setExamName] = useState('');
  const [className, setClassName] = useState('NEET');
  const [examDate, setExamDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [examMode, setExamMode] = useState<'offline' | 'online'>('offline');

  // Step 2: Subject Details States
  const [numQuestions, setNumQuestions] = useState(20);
  const [answerKey, setAnswerKey] = useState<Record<number, string>>({});

  // Step 3: Section Details States
  const [correctMarks, setCorrectMarks] = useState(4); // NEET Default (+4)
  const [incorrectMarks, setIncorrectMarks] = useState(-1); // NEET Default (-1)
  const [unansweredMarks, setUnansweredMarks] = useState(0);

  // Validation
  const handleNextStep = () => {
    if (step === 1) {
      if (!examName.trim()) {
        alert('Please enter an Exam Name.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      // Ensure all questions have a key
      const missingKeys = [];
      for (let q = 1; q <= numQuestions; q++) {
        if (!answerKey[q]) {
          missingKeys.push(q);
        }
      }
      if (missingKeys.length > 0) {
        if (!confirm(`Questions ${missingKeys.slice(0, 5).join(', ')}${missingKeys.length > 5 ? '...' : ''} do not have answer keys set. Default to option 'A'?`)) {
          return;
        }
        // Fill missing keys with 'A'
        const updatedKeys = { ...answerKey };
        for (let q = 1; q <= numQuestions; q++) {
          if (!updatedKeys[q]) {
            updatedKeys[q] = 'A';
          }
        }
        setAnswerKey(updatedKeys);
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep((step - 1) as any);
    }
  };

  const handleOptionSelect = (qNum: number, option: string) => {
    setAnswerKey(prev => ({ ...prev, [qNum]: option }));
  };

  const applyTemplate = (type: 'neet' | 'standard' | 'binary') => {
    if (type === 'neet') {
      setCorrectMarks(4);
      setIncorrectMarks(-1);
    } else if (type === 'standard') {
      setCorrectMarks(1);
      setIncorrectMarks(0);
    } else if (type === 'binary') {
      setCorrectMarks(2);
      setIncorrectMarks(-0.5);
    }
  };

  const handleSubmit = async () => {
    // Fill any missing keys with 'A' just in case
    const finalKey = { ...answerKey };
    for (let q = 1; q <= numQuestions; q++) {
      if (!finalKey[q]) {
        finalKey[q] = 'A';
      }
    }

    try {
      const newExamId = await db.exams.add({
        title: examName,
        className,
        date: examDate,
        status: 'private',
        numQuestions,
        answerKey: finalKey,
        correctMarks,
        incorrectMarks,
        unansweredMarks,
        createdAt: new Date()
      });
      onSuccess(newExamId);
    } catch (err: any) {
      alert(`Failed to create exam: ${err.message}`);
    }
  };

  return (
    <div className="wizard-overlay animate-fade-in">
      <div className="wizard-container">
        
        {/* Wizard Header */}
        <header className="wizard-header">
          <div className="wizard-breadcrumb">Exams / <strong>Create exam</strong></div>
          <button className="btn-close-icon" onClick={onClose} title="Cancel">
            <X size={18} />
          </button>
        </header>

        {/* Stepper progress bar */}
        <div className="wizard-stepper">
          <div className={`step-item ${step >= 1 ? 'active' : ''}`}>
            <span className="step-num">1</span>
            <span className="step-label">Basic Details</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step >= 2 ? 'active' : ''}`}>
            <span className="step-num">2</span>
            <span className="step-label">Subject Details</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step >= 3 ? 'active' : ''}`}>
            <span className="step-num">3</span>
            <span className="step-label">Section Details</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${step >= 4 ? 'active' : ''}`}>
            <span className="step-num">4</span>
            <span className="step-label">Preview</span>
          </div>
        </div>

        {/* Wizard Form Content */}
        <div className="wizard-body">
          
          {/* STEP 1: BASIC DETAILS */}
          {step === 1 && (
            <div className="wizard-step-content animate-fade-in">
              <div className="form-row-three">
                
                {/* Class Name Dropdown */}
                <div className="floating-field">
                  <label>Class Name</label>
                  <select 
                    value={className} 
                    onChange={(e) => setClassName(e.target.value)}
                  >
                    {classes.length === 0 ? (
                      <>
                        <option value="NEET">NEET</option>
                        <option value="JEE">JEE</option>
                        <option value="Grade 12-A">Grade 12-A</option>
                        <option value="Grade 12-B">Grade 12-B</option>
                        <option value="Grade 11-A">Grade 11-A</option>
                      </>
                    ) : (
                      classes.map(c => (
                        <option key={`wiz-opt-c-${c.id}`} value={c.name}>{c.name}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* Exam Name Input */}
                <div className="floating-field">
                  <label>Exam Name *</label>
                  <input 
                    type="text" 
                    value={examName} 
                    onChange={(e) => setExamName(e.target.value)} 
                    placeholder="e.g. NEET MOCK TEST" 
                    required 
                  />
                </div>

                {/* Choose Exam Date */}
                <div className="floating-field field-date">
                  <label className="float-lbl">Choose Exam Date</label>
                  <div className="date-input-wrapper">
                    <input 
                      type="date" 
                      value={examDate} 
                      onChange={(e) => setExamDate(e.target.value)} 
                    />
                    <Calendar className="cal-icon" size={16} />
                  </div>
                </div>
              </div>

              {/* Exam Mode Checkboxes */}
              <div className="exam-mode-group">
                <label className="mode-title-lbl">Exam Mode *</label>
                <div className="checkbox-row">
                  <label className="chk-label">
                    <input 
                      type="checkbox" 
                      checked={examMode === 'offline'} 
                      onChange={() => setExamMode('offline')}
                    />
                    <span>Offline</span>
                  </label>
                  <label className="chk-label">
                    <input 
                      type="checkbox" 
                      checked={examMode === 'online'} 
                      onChange={() => setExamMode('online')}
                    />
                    <span>Online</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: SUBJECT DETAILS (Questions & Answer Key Selection) */}
          {step === 2 && (
            <div className="wizard-step-content animate-fade-in">
              <div className="form-group mb-4" style={{ maxWidth: '280px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Number of Questions (Limit 200)</label>
                <input 
                  type="number" 
                  min={5} 
                  max={200} 
                  value={numQuestions} 
                  onChange={(e) => {
                    const val = Math.max(5, Math.min(200, Number(e.target.value) || 20));
                    setNumQuestions(val);
                  }}
                  className="w-full mt-1"
                />
              </div>

              <div className="key-builder-wizard">
                <h4 style={{ fontSize: '0.95rem', margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  Set Correct Answers (Tick Key)
                </h4>
                
                <div className="key-grid-scroll">
                  {Array.from({ length: numQuestions }).map((_, idx) => {
                    const qNum = idx + 1;
                    return (
                      <div key={`wiz-key-${qNum}`} className="key-row-item">
                        <span className="q-label-number">Q{String(qNum).padStart(2, '0')}</span>
                        <div className="opt-bubble-row">
                          {['A', 'B', 'C', 'D'].map(opt => (
                            <button
                              key={`wiz-opt-${qNum}-${opt}`}
                              className={`wiz-opt-btn ${answerKey[qNum] === opt ? 'active' : ''}`}
                              onClick={() => handleOptionSelect(qNum, opt)}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SECTION DETAILS (Marking Scheme Details) */}
          {step === 3 && (
            <div className="wizard-step-content animate-fade-in">
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 12px 0' }}>Configure Marking Scheme</h3>
              <p className="subtitle mb-4">Set point systems for calculated grading. Ticks will add points, incorrect bubbles will deduct.</p>

              {/* Template Quick Selectors */}
              <div className="template-selectors mb-4">
                <button className="btn-seed" style={{ padding: '6px 12px' }} onClick={() => applyTemplate('neet')}>
                  NEET Scheme (+4 / -1)
                </button>
                <button className="btn-seed" style={{ padding: '6px 12px' }} onClick={() => applyTemplate('standard')}>
                  General Board (+1 / 0)
                </button>
                <button className="btn-seed" style={{ padding: '6px 12px' }} onClick={() => applyTemplate('binary')}>
                  JEE Style (+2 / -0.5)
                </button>
              </div>

              <div className="form-row-three">
                <div className="floating-field">
                  <label>Correct Answer Marks</label>
                  <input 
                    type="number" 
                    value={correctMarks} 
                    onChange={(e) => setCorrectMarks(isNaN(Number(e.target.value)) ? 1 : Number(e.target.value))}
                  />
                </div>
                <div className="floating-field">
                  <label>Incorrect Answer Marks (Negative)</label>
                  <input 
                    type="number" 
                    value={incorrectMarks} 
                    onChange={(e) => setIncorrectMarks(isNaN(Number(e.target.value)) ? 0 : Number(e.target.value))}
                  />
                </div>
                <div className="floating-field">
                  <label>Unanswered Marks</label>
                  <input 
                    type="number" 
                    value={unansweredMarks} 
                    onChange={(e) => setUnansweredMarks(isNaN(Number(e.target.value)) ? 0 : Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: PREVIEW DETAILS */}
          {step === 4 && (
            <div className="wizard-step-content animate-fade-in">
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle className="text-success" size={20} /> Review Exam Details
              </h3>

              <div className="preview-summary-card">
                <div className="summary-field">
                  <span className="lbl">Exam Name:</span>
                  <span className="val"><strong>{examName.toUpperCase()}</strong></span>
                </div>
                <div className="summary-field">
                  <span className="lbl">Target Class:</span>
                  <span className="val">{className}</span>
                </div>
                <div className="summary-field">
                  <span className="lbl">Scheduled Date:</span>
                  <span className="val">{new Date(examDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                </div>
                <div className="summary-field">
                  <span className="lbl">Exam Mode:</span>
                  <span className="val" style={{ textTransform: 'capitalize' }}>{examMode}</span>
                </div>
                <div className="summary-field">
                  <span className="lbl">Total Questions:</span>
                  <span className="val">{numQuestions} Questions</span>
                </div>
                <div className="summary-field">
                  <span className="lbl">Marking Scheme:</span>
                  <span className="val text-success">
                    Correct: <strong>+{correctMarks}</strong> | Incorrect: <strong>{incorrectMarks}</strong> | Unanswered: <strong>{unansweredMarks}</strong>
                  </span>
                </div>
                <div className="summary-field">
                  <span className="lbl">Max Score Potential:</span>
                  <span className="val"><strong>{numQuestions * correctMarks} Points</strong></span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Wizard Footer */}
        <footer className="wizard-footer">
          <button 
            className="btn-outline-cancel"
            onClick={step === 1 ? onClose : handlePrevStep}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          
          <button 
            className="btn-primary-wizard"
            onClick={step === 4 ? handleSubmit : handleNextStep}
          >
            {step === 4 ? 'Create Exam' : 'Next'}
          </button>
        </footer>

      </div>
    </div>
  );
};
