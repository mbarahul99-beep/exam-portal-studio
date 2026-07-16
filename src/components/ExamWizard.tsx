import React, { useState } from 'react';
import { Calendar, X, HelpCircle } from 'lucide-react';
import { db } from '../db';
import { type ClassEntity, type ExamSection, type ExamSubject } from '../db';

interface ExamWizardProps {
  classes: ClassEntity[];
  onClose: () => void;
  onSuccess: (examId: number) => void;
}

interface SectionState {
  subjectName: string;
  sectionName: string;
  qCount: number;
  questionType: '4 option' | '5 option';
  correctMarks: number;
  incorrectMarks: number;
  allowPartialMarks: boolean;
  allowOptionalAttempts: boolean;
  maxAttempts: number;
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
  const [rollNoDigits, setRollNoDigits] = useState(6);
  const [examSetsCount, setExamSetsCount] = useState(2);
  const [numSubjects, setNumSubjects] = useState(3);
  const [subjectsList, setSubjectsList] = useState<ExamSubject[]>([
    { name: 'Subject 1', numSections: 1 },
    { name: 'Subject 2', numSections: 1 },
    { name: 'Subject 3', numSections: 1 }
  ]);

  // Step 3: Section Details States
  const [sectionsList, setSectionsList] = useState<SectionState[]>([]);

  // Step 4: Answer Keys (Tabbed by Set, e.g. "A", "B", "C", "D")
  const [activeSetTab, setActiveSetTab] = useState('A');
  const [answerKeys, setAnswerKeys] = useState<Record<string, Record<number, string>>>({
    'A': {},
    'B': {},
    'C': {},
    'D': {}
  });

  const renderStepCircle = (stepNum: number) => {
    if (step > stepNum) {
      return (
        <span className="step-num completed">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </span>
      );
    }
    return <span className={`step-num ${step === stepNum ? 'active' : ''}`}>{stepNum}</span>;
  };

  // Calculate dynamic ranges and total questions
  let qCursor = 1;
  const sectionsWithRanges = sectionsList.map(sec => {
    const start = qCursor;
    const end = qCursor + sec.qCount - 1;
    qCursor = end + 1;
    return { ...sec, qStart: start, qEnd: end };
  });
  const totalQuestions = qCursor - 1;

  // Step 2 Counter Handlers
  const handleSubjectsCountChange = (newCount: number) => {
    if (newCount < 1 || newCount > 10) return;
    setNumSubjects(newCount);
    setSubjectsList(prev => {
      const updated = [...prev];
      if (newCount > prev.length) {
        for (let i = prev.length; i < newCount; i++) {
          updated.push({ name: `Subject ${i + 1}`, numSections: 1 });
        }
      } else {
        updated.splice(newCount);
      }
      return updated;
    });
  };

  const handleSubjectNameChange = (idx: number, name: string) => {
    setSubjectsList(prev => {
      const updated = [...prev];
      updated[idx].name = name;
      return updated;
    });
  };

  const handleSubjectSectionsChange = (idx: number, numSections: number) => {
    setSubjectsList(prev => {
      const updated = [...prev];
      updated[idx].numSections = numSections;
      return updated;
    });
  };

  // Step Transitions
  const handleGoToStep3 = () => {
    // Generate sections list based on subjects configuration
    const list: SectionState[] = [];
    subjectsList.forEach(sub => {
      for (let s = 1; s <= sub.numSections; s++) {
        // Try to preserve existing config if matches
        const existing = sectionsList.find(sec => sec.subjectName === sub.name && sec.sectionName === `Section ${s}`);
        if (existing) {
          list.push(existing);
        } else {
          list.push({
            subjectName: sub.name,
            sectionName: `Section ${s}`,
            qCount: 5, // default questions per section
            questionType: '4 option',
            correctMarks: 4,
            incorrectMarks: -1,
            allowPartialMarks: false,
            allowOptionalAttempts: false,
            maxAttempts: 5
          });
        }
      }
    });
    setSectionsList(list);
    setStep(3);
  };

  const handleGoToStep4 = () => {
    // Validate question counts
    for (const sec of sectionsList) {
      if (sec.qCount <= 0) {
        alert('Each section must have at least 1 question.');
        return;
      }
    }

    // Initialize answer keys with default 'A'
    const updatedKeys = { ...answerKeys };
    const sets = Array.from({ length: examSetsCount }).map((_, i) => String.fromCharCode(65 + i));
    
    sets.forEach(setName => {
      if (!updatedKeys[setName]) {
        updatedKeys[setName] = {};
      }
      for (let q = 1; q <= totalQuestions; q++) {
        if (!updatedKeys[setName][q]) {
          updatedKeys[setName][q] = 'A';
        }
      }
    });
    
    setAnswerKeys(updatedKeys);
    setActiveSetTab(sets[0]);
    setStep(4);
  };

  const handleOptionSelect = (setName: string, qNum: number, option: string) => {
    setAnswerKeys(prev => ({
      ...prev,
      [setName]: {
        ...prev[setName],
        [qNum]: option
      }
    }));
  };

  const handleSubmit = async () => {
    try {
      const finalSubjects: ExamSubject[] = subjectsList;
      const finalSections: ExamSection[] = sectionsWithRanges.map(sec => ({
        subjectName: sec.subjectName,
        sectionName: sec.sectionName,
        qStart: sec.qStart,
        qCount: sec.qCount,
        questionType: sec.questionType,
        correctMarks: sec.correctMarks,
        incorrectMarks: sec.incorrectMarks,
        allowPartialMarks: sec.allowPartialMarks,
        allowOptionalAttempts: sec.allowOptionalAttempts,
        maxAttempts: sec.allowOptionalAttempts ? sec.maxAttempts : undefined
      }));

      // Set A key is default fallback
      const defaultAnswerKey = answerKeys['A'] || {};

      const newExamId = await db.exams.add({
        title: examName,
        className,
        date: examDate,
        status: 'private',
        numQuestions: totalQuestions,
        answerKey: defaultAnswerKey,
        correctMarks: sectionsList[0]?.correctMarks ?? 4,
        incorrectMarks: sectionsList[0]?.incorrectMarks ?? -1,
        unansweredMarks: 0,
        rollNoDigits,
        examSetsCount,
        subjects: finalSubjects,
        sections: finalSections,
        answerKeys,
        createdAt: new Date()
      });

      onSuccess(newExamId);
    } catch (err: any) {
      alert(`Failed to create exam: ${err.message}`);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!examName.trim()) {
        alert('Please enter an Exam Name.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      handleGoToStep3();
    } else if (step === 3) {
      handleGoToStep4();
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep((step - 1) as any);
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

        {/* Stepper Progress Bar */}
        <div className="wizard-stepper">
          <div className={`step-item ${step >= 1 ? 'active' : ''}`}>
            {renderStepCircle(1)}
            <span className="step-label">Basic Details</span>
          </div>
          <div className={`step-line ${step >= 2 ? 'active' : ''}`} />
          <div className={`step-item ${step >= 2 ? 'active' : ''}`}>
            {renderStepCircle(2)}
            <span className="step-label">Subject Details</span>
          </div>
          <div className={`step-line ${step >= 3 ? 'active' : ''}`} />
          <div className={`step-item ${step >= 3 ? 'active' : ''}`}>
            {renderStepCircle(3)}
            <span className="step-label">Section Details</span>
          </div>
          <div className={`step-line ${step >= 4 ? 'active' : ''}`} />
          <div className={`step-item ${step >= 4 ? 'active' : ''}`}>
            {renderStepCircle(4)}
            <span className="step-label">Preview & Keys</span>
          </div>
        </div>

        {/* Wizard Form Content */}
        <div className="wizard-body">
          
          {/* STEP 1: BASIC DETAILS */}
          {step === 1 && (
            <div className="wizard-step-content animate-fade-in">
              <div className="form-row-three">
                
                {/* Class Name */}
                <div className="floating-field">
                  <label>Class Name</label>
                  <select value={className} onChange={(e) => setClassName(e.target.value)}>
                    {classes.length === 0 ? (
                      <>
                        <option value="NEET">NEET</option>
                        <option value="JEE">JEE</option>
                        <option value="Grade 12-A">Grade 12-A</option>
                      </>
                    ) : (
                      classes.map(c => (
                        <option key={`wiz-opt-c-${c.id}`} value={c.name}>{c.name}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* Exam Name */}
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

                {/* Exam Date */}
                <div className="floating-field field-date">
                  <label className="float-lbl">Choose Exam Date</label>
                  <div className="date-input-wrapper">
                    <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                    <Calendar className="cal-icon" size={16} />
                  </div>
                </div>
              </div>

              {/* Exam Mode */}
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

          {/* STEP 2: SUBJECT DETAILS */}
          {step === 2 && (
            <div className="wizard-step-content animate-fade-in">
              <div className="subject-details-setup-row mb-4">
                {/* Roll No Digits */}
                <div className="counter-picker">
                  <label>ROLL NO. DIGITS</label>
                  <div className="counter-controls">
                    <button type="button" className="btn-count-dec" onClick={() => setRollNoDigits(prev => Math.max(4, prev - 1))}>-</button>
                    <span className="counter-val">{rollNoDigits}</span>
                    <button type="button" className="btn-count-inc" onClick={() => setRollNoDigits(prev => Math.min(15, prev + 1))}>+</button>
                  </div>
                </div>

                {/* Exam Sets */}
                <div className="counter-picker">
                  <label>EXAM SETS</label>
                  <div className="counter-controls">
                    <button type="button" className="btn-count-dec" onClick={() => setExamSetsCount(prev => Math.max(1, prev - 1))}>-</button>
                    <span className="counter-val">{examSetsCount}</span>
                    <button type="button" className="btn-count-inc" onClick={() => setExamSetsCount(prev => Math.min(4, prev + 1))}>+</button>
                  </div>
                </div>

                {/* Subjects */}
                <div className="counter-picker">
                  <label>SUBJECTS</label>
                  <div className="counter-controls">
                    <button type="button" className="btn-count-dec" onClick={() => handleSubjectsCountChange(numSubjects - 1)}>-</button>
                    <span className="counter-val">{numSubjects}</span>
                    <button type="button" className="btn-count-inc" onClick={() => handleSubjectsCountChange(numSubjects + 1)}>+</button>
                  </div>
                </div>
              </div>

              {/* Table of Subjects */}
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table className="wizard-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px', textAlign: 'center' }}>SR NO</th>
                      <th>SUBJECT</th>
                      <th style={{ width: '200px' }}>SECTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectsList.map((sub, idx) => (
                      <tr key={`wiz-sub-row-${idx}`}>
                        <td style={{ fontWeight: 'bold', textAlign: 'center', fontSize: '1rem' }}>{idx + 1}</td>
                        <td>
                          <input 
                            type="text" 
                            value={sub.name} 
                            onChange={(e) => handleSubjectNameChange(idx, e.target.value)}
                            className="wizard-table-input"
                            placeholder={`Subject ${idx + 1}`}
                          />
                        </td>
                        <td>
                          <select 
                            value={sub.numSections} 
                            onChange={(e) => handleSubjectSectionsChange(idx, Number(e.target.value))}
                            className="wizard-table-select"
                          >
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: SECTION DETAILS */}
          {step === 3 && (
            <div className="wizard-step-content animate-fade-in" style={{ overflowY: 'auto', maxHeight: '420px', paddingRight: '4px' }}>
              {subjectsList.map((sub, subIdx) => {
                const subSections = sectionsList.filter(sec => sec.subjectName === sub.name);
                
                return (
                  <div key={`wiz-sub-grp-${subIdx}`} className="subject-section-group mb-4">
                    <h3 className="subject-section-title">
                      {sub.name}
                    </h3>
                    
                    {subSections.map((sec) => {
                      const globalIdx = sectionsList.findIndex(s => s.subjectName === sub.name && s.sectionName === sec.sectionName);
                      
                      const updateSection = (fields: Partial<SectionState>) => {
                        setSectionsList(prev => {
                          const updated = [...prev];
                          updated[globalIdx] = { ...updated[globalIdx], ...fields };
                          return updated;
                        });
                      };

                      return (
                        <div key={`sec-card-${globalIdx}`} className="section-config-card glass-card mb-3">
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                            <div className="floating-field">
                              <label>Section name</label>
                              <input 
                                type="text" 
                                value={sec.sectionName} 
                                onChange={(e) => updateSection({ sectionName: e.target.value })}
                              />
                            </div>

                            <div className="floating-field">
                              <label>Number of Questions</label>
                              <select 
                                value={sec.qCount} 
                                onChange={(e) => updateSection({ qCount: Number(e.target.value) })}
                              >
                                {Array.from({ length: 50 }).map((_, i) => (
                                  <option key={`sec-qc-${i + 1}`} value={i + 1}>{i + 1}</option>
                                ))}
                              </select>
                            </div>

                            <div className="floating-field">
                              <label>Question Type</label>
                              <select 
                                value={sec.questionType} 
                                onChange={(e) => updateSection({ questionType: e.target.value as any })}
                              >
                                <option value="4 option">4 option</option>
                                <option value="5 option">5 option</option>
                              </select>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                            <div className="floating-field">
                              <label>Marks for correct</label>
                              <select 
                                value={sec.correctMarks} 
                                onChange={(e) => updateSection({ correctMarks: Number(e.target.value) })}
                              >
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                                <option value={4}>4</option>
                                <option value={5}>5</option>
                              </select>
                            </div>

                            <div className="floating-field">
                              <label>Marks for incorrect</label>
                              <select 
                                value={sec.incorrectMarks} 
                                onChange={(e) => updateSection({ incorrectMarks: Number(e.target.value) })}
                              >
                                <option value={0}>0</option>
                                <option value={-0.25}>-0.25</option>
                                <option value={-0.5}>-0.5</option>
                                <option value={-1}>-1</option>
                              </select>
                            </div>

                            {sec.allowOptionalAttempts && (
                              <div className="floating-field">
                                <label>Max attempts</label>
                                <select 
                                  value={sec.maxAttempts} 
                                  onChange={(e) => updateSection({ maxAttempts: Number(e.target.value) })}
                                >
                                  {Array.from({ length: sec.qCount }).map((_, i) => (
                                    <option key={`max-att-${i + 1}`} value={i + 1}>{i + 1}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          <div className="wiz-checkbox-row">
                            <label className="wiz-checkbox-label">
                              <input 
                                type="checkbox" 
                                checked={sec.allowPartialMarks} 
                                onChange={(e) => updateSection({ allowPartialMarks: e.target.checked })} 
                              />
                              <span>Allow partial marks</span>
                              <HelpCircle size={14} style={{ opacity: 0.5 }} />
                            </label>

                            <label className="wiz-checkbox-label">
                              <input 
                                type="checkbox" 
                                checked={sec.allowOptionalAttempts} 
                                onChange={(e) => updateSection({ allowOptionalAttempts: e.target.checked, maxAttempts: Math.min(sec.maxAttempts, sec.qCount) })} 
                              />
                              <span>Allow optional attempts</span>
                              <HelpCircle size={14} style={{ opacity: 0.5 }} />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP 4: PREVIEW & KEYS */}
          {step === 4 && (
            <div className="wizard-step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: '420px', paddingRight: '4px' }}>
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
                  <span className="lbl">Roll No Digits:</span>
                  <span className="val">{rollNoDigits} digits</span>
                </div>
                <div className="summary-field">
                  <span className="lbl">Total Questions:</span>
                  <span className="val"><strong>{totalQuestions} Questions</strong></span>
                </div>
              </div>

              {/* Set Selection Tabs */}
              {examSetsCount > 1 && (
                <div className="set-tabs-row" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  {Array.from({ length: examSetsCount }).map((_, idx) => {
                    const setName = String.fromCharCode(65 + idx);
                    return (
                      <button
                        key={`set-tab-${setName}`}
                        className={`btn-seed ${activeSetTab === setName ? 'active-tab' : ''}`}
                        onClick={() => setActiveSetTab(setName)}
                        style={{
                          padding: '6px 16px',
                          borderRadius: '20px',
                          border: '1px solid var(--border-color)',
                          background: activeSetTab === setName ? 'var(--primary)' : '#ffffff',
                          color: activeSetTab === setName ? '#ffffff' : 'var(--text-secondary)',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        Set {setName} Key
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Answer Key Grid builder grouped by sections */}
              <div className="key-builder-wizard">
                {sectionsWithRanges.map((sec, secIdx) => {
                  return (
                    <div key={`wiz-sec-grid-${secIdx}`} className="mb-4">
                      <h5 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: '0 0 10px 0', borderBottom: '1px dashed var(--border-color)', paddingBottom: '4px', color: 'var(--text-primary)' }}>
                        {sec.subjectName} - {sec.sectionName} (Q{sec.qStart} - Q{sec.qEnd})
                      </h5>

                      <div className="key-grid-scroll">
                        {Array.from({ length: sec.qCount }).map((_, qIdx) => {
                          const qNum = sec.qStart + qIdx;
                          const options = sec.questionType === '5 option' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
                          const currentKey = answerKeys[activeSetTab]?.[qNum] || 'A';

                          return (
                            <div key={`wiz-key-${qNum}`} className="key-row-item">
                              <span className="q-label-number">Q{String(qNum).padStart(2, '0')}</span>
                              <div className="opt-bubble-row">
                                {options.map(opt => (
                                  <button
                                    key={`wiz-opt-${qNum}-${opt}`}
                                    className={`wiz-opt-btn ${currentKey === opt ? 'active' : ''}`}
                                    onClick={() => handleOptionSelect(activeSetTab, qNum, opt)}
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
                  );
                })}
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
