import React, { useState, useEffect } from 'react';
import { db, type BankQuestion } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { MathRenderer } from './MathRenderer';
import { 
  Plus, 
  Search, 
  Trash2, 
  Upload, 
  BookOpen, 
  X, 
  Check, 
  CheckCircle, 
  Database,
  PlusCircle,
  FileText
} from 'lucide-react';

interface QuestionBankManagerProps {
  onBack?: () => void;
}

export const QuestionBankManager: React.FC<QuestionBankManagerProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'add' | 'csv' | 'public'>('browse');

  // Browse tab states
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [difficultyFilter, setDifficultyFilter] = useState('All');

  // Add question form states
  const [newSource, setNewSource] = useState<'NEET' | 'IIT JEE' | 'NCERT Science' | 'NCERT Math' | 'Custom'>('Custom');
  const [newSubject, setNewSubject] = useState('');
  const [newChapter, setNewChapter] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newOptions, setNewOptions] = useState<string[]>(['', '', '', '']);
  const [newCorrectIdx, setNewCorrectIdx] = useState<number>(0);
  const [newDifficulty, setNewDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [newExplanation, setNewExplanation] = useState('');
  const [addFeedback, setAddFeedback] = useState<string | null>(null);

  // CSV tab states
  const [csvInput, setCsvInput] = useState('');
  const [csvFeedback, setCsvFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Public Library states
  const [publicQuestions, setPublicQuestions] = useState<any[]>([]);
  const [pubLoading, setPubLoading] = useState(false);
  const [pubFeedback, setPubFeedback] = useState<string | null>(null);

  // Add to exam overlay / modal states
  const [selectedBankQ, setSelectedBankQ] = useState<BankQuestion | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | string>('');
  const [selectedSectionName, setSelectedSectionName] = useState<string>('');
  const [examSelectFeedback, setExamSelectFeedback] = useState<string | null>(null);

  // Fetch central question bank using live query
  const centralQuestions = useLiveQuery(() => db.questionBank.toArray()) || [];
  const examsList = useLiveQuery(() => db.exams.toArray()) || [];

  // Derived filter options
  const sources = Array.from(new Set(centralQuestions.map(q => q.source)));
  const subjects = Array.from(new Set(centralQuestions.map(q => q.subject)));

  // Load public questions on tab change
  useEffect(() => {
    if (activeTab === 'public' && publicQuestions.length === 0) {
      const fetchPublicLibrary = async () => {
        setPubLoading(true);
        try {
          const response = await fetch('/neet_jee_bank.json');
          if (response.ok) {
            const data = await response.json();
            setPublicQuestions(data);
          }
        } catch (err) {
          console.error("Error fetching public library:", err);
        } finally {
          setPubLoading(false);
        }
      };
      fetchPublicLibrary();
    }
  }, [activeTab, publicQuestions.length]);

  // Handle adding manual question
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) {
      alert("Question text is required.");
      return;
    }
    if (newOptions.some(o => !o.trim())) {
      alert("All options must be filled.");
      return;
    }

    try {
      const q: BankQuestion = {
        source: newSource,
        subject: newSubject.trim() || 'General',
        chapter: newChapter.trim() || 'General',
        topic: newTopic.trim() || undefined,
        questionText: newQuestionText.trim(),
        options: newOptions.map(o => o.trim()),
        correctOptionIdx: newCorrectIdx,
        difficulty: newDifficulty,
        explanation: newExplanation.trim() || undefined,
        createdAt: new Date()
      };

      await db.questionBank.add(q);
      setAddFeedback("Question successfully added to central bank!");
      
      // Reset form
      setNewQuestionText('');
      setNewOptions(['', '', '', '']);
      setNewCorrectIdx(0);
      setNewExplanation('');
      
      setTimeout(() => setAddFeedback(null), 3000);
    } catch (err: any) {
      alert(`Error saving question: ${err.message}`);
    }
  };

  // Handle CSV Import
  const handleImportCSV = async () => {
    if (!csvInput.trim()) {
      alert("Please paste CSV data first.");
      return;
    }

    try {
      const lines = csvInput.split('\n');
      const importedList: BankQuestion[] = [];
      let skippedLines = 0;

      lines.forEach((line) => {
        const cleaned = line.trim();
        if (!cleaned) return;

        // Simple CSV split logic that respects quotes
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < cleaned.length; i++) {
          const char = cleaned[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            parts.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current.trim().replace(/^"|"$/g, ''));

        // Expected format: Question Text, Option A, Option B, Option C, Option D, Correct Option, Subject, Chapter, Difficulty, Explanation
        // At least need Question Text and 4 Options + Correct Option
        if (parts.length >= 6) {
          const qText = parts[0];
          const opts = [parts[1], parts[2], parts[3], parts[4]];
          const correctStr = parts[5].toUpperCase().trim();
          
          let correctIdx = 0;
          if (correctStr === 'B' || correctStr === '1') correctIdx = 1;
          else if (correctStr === 'C' || correctStr === '2') correctIdx = 2;
          else if (correctStr === 'D' || correctStr === '3') correctIdx = 3;
          else if (correctStr === 'E' || correctStr === '4') correctIdx = 4;

          const subj = parts[6] || 'General';
          const chap = parts[7] || 'General';
          const diffRaw = (parts[8] || 'medium').toLowerCase().trim();
          const difficulty: 'easy' | 'medium' | 'hard' = 
            diffRaw === 'easy' || diffRaw === 'hard' ? diffRaw : 'medium';
          const explanation = parts[9] || '';

          importedList.push({
            source: 'Custom',
            subject: subj,
            chapter: chap,
            questionText: qText,
            options: opts.filter(Boolean),
            correctOptionIdx: correctIdx,
            difficulty,
            explanation: explanation || undefined,
            createdAt: new Date()
          });
        } else {
          skippedLines++;
        }
      });

      if (importedList.length > 0) {
        await db.questionBank.bulkAdd(importedList);
        setCsvFeedback({
          success: true,
          message: `Successfully imported ${importedList.length} questions into Central Bank!${skippedLines > 0 ? ` (Skipped ${skippedLines} invalid lines)` : ''}`
        });
        setCsvInput('');
      } else {
        setCsvFeedback({
          success: false,
          message: "Could not import any questions. Please check the CSV format example."
        });
      }
    } catch (err: any) {
      setCsvFeedback({
        success: false,
        message: `Import failed: ${err.message}`
      });
    }
  };

  // Import single question from Public Library into Central Bank
  const importPublicQuestion = async (pubQ: any) => {
    try {
      const exists = centralQuestions.some(q => q.questionText === pubQ.questionText);
      if (exists) {
        alert("This question is already in your central bank.");
        return;
      }

      await db.questionBank.add({
        ...pubQ,
        createdAt: new Date()
      });
      setPubFeedback(`Successfully saved "${pubQ.questionText.substring(0, 30)}..." to central bank!`);
      setTimeout(() => setPubFeedback(null), 2500);
    } catch (err: any) {
      alert(`Failed to save question: ${err.message}`);
    }
  };

  // Import all library questions
  const importAllLibrary = async () => {
    if (publicQuestions.length === 0) return;
    try {
      let added = 0;
      for (const q of publicQuestions) {
        const exists = centralQuestions.some(cq => cq.questionText === q.questionText);
        if (!exists) {
          await db.questionBank.add({
            ...q,
            createdAt: new Date()
          });
          added++;
        }
      }
      alert(`Imported ${added} new questions from library to your central bank!`);
    } catch (err: any) {
      alert(`Error bulk importing: ${err.message}`);
    }
  };

  // Delete question from Central Bank
  const handleDeleteBankQ = async (id: number) => {
    if (confirm("Are you sure you want to delete this question from the Central Question Bank?")) {
      await db.questionBank.delete(id);
    }
  };

  // Add question to a selected Exam
  const handleAddQuestionToExam = async () => {
    if (!selectedBankQ || !selectedExamId) return;

    try {
      const exam = examsList.find(e => e.id === Number(selectedExamId));
      if (!exam) {
        alert("Selected exam not found.");
        return;
      }

      const optionLetters = ['A', 'B', 'C', 'D', 'E'];
      const newQNum = exam.numQuestions + 1;

      // 1. Create Question record
      await db.questions.add({
        examId: exam.id!,
        sectionName: selectedSectionName || selectedBankQ.subject || 'General',
        questionText: selectedBankQ.questionText,
        options: [...selectedBankQ.options],
        correctOptionIdx: selectedBankQ.correctOptionIdx,
        explanation: selectedBankQ.explanation || ''
      });

      // 2. Update Exam parameters (correct option mapping in answerKey)
      const updatedKey = { ...exam.answerKey };
      updatedKey[newQNum] = optionLetters[selectedBankQ.correctOptionIdx] || 'A';

      const updatedKeys = exam.answerKeys ? { ...exam.answerKeys } : {};
      if (exam.answerKeys) {
        Object.keys(updatedKeys).forEach(set => {
          updatedKeys[set][newQNum] = set === 'A' ? (optionLetters[selectedBankQ.correctOptionIdx] || 'A') : 'A';
        });
      }

      await db.exams.update(exam.id!, {
        numQuestions: newQNum,
        answerKey: updatedKey,
        answerKeys: Object.keys(updatedKeys).length > 0 ? updatedKeys : undefined
      });

      setExamSelectFeedback(`Successfully added question as Q${newQNum} to "${exam.title}"!`);
      setTimeout(() => {
        setExamSelectFeedback(null);
        setSelectedBankQ(null);
        setSelectedExamId('');
        setSelectedSectionName('');
      }, 2000);
    } catch (err: any) {
      alert(`Failed to add question to exam: ${err.message}`);
    }
  };

  // Selected exam sections extraction
  const targetExam = selectedExamId ? examsList.find(e => e.id === Number(selectedExamId)) : null;
  const targetExamSections = targetExam?.sections || [];

  // Filter central questions
  const filteredQuestions = centralQuestions.filter(q => {
    if (sourceFilter !== 'All' && q.source !== sourceFilter) return false;
    if (subjectFilter !== 'All' && q.subject !== subjectFilter) return false;
    if (difficultyFilter !== 'All' && q.difficulty !== difficultyFilter) return false;
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      const inText = q.questionText.toLowerCase().includes(lower);
      const inChapter = q.chapter.toLowerCase().includes(lower);
      const inOptions = q.options.some(o => o.toLowerCase().includes(lower));
      if (!inText && !inChapter && !inOptions) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100%' }}>
      {/* Top Banner Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database className="text-indigo" size={24} /> Central Question Bank
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Manage reusable questions, upload topics in CSV, or browse pre-loaded public library questions.
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px' }}>
            Back to Dashboard
          </button>
        )}
      </div>

      {/* Tabs Menu Navigation Bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '16px' }}>
        <button 
          onClick={() => setActiveTab('browse')}
          style={{
            padding: '10px 4px',
            border: 'none',
            borderBottom: activeTab === 'browse' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'browse' ? 'bold' : 'normal',
            color: activeTab === 'browse' ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <BookOpen size={16} /> Browse Questions ({filteredQuestions.length})
        </button>
        <button 
          onClick={() => setActiveTab('add')}
          style={{
            padding: '10px 4px',
            border: 'none',
            borderBottom: activeTab === 'add' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'add' ? 'bold' : 'normal',
            color: activeTab === 'add' ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={16} /> Add Manually
        </button>
        <button 
          onClick={() => setActiveTab('csv')}
          style={{
            padding: '10px 4px',
            border: 'none',
            borderBottom: activeTab === 'csv' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'csv' ? 'bold' : 'normal',
            color: activeTab === 'csv' ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Upload size={16} /> Import CSV
        </button>
        <button 
          onClick={() => setActiveTab('public')}
          style={{
            padding: '10px 4px',
            border: 'none',
            borderBottom: activeTab === 'public' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'public' ? 'bold' : 'normal',
            color: activeTab === 'public' ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <FileText size={16} /> Public Library
        </button>
      </div>

      {/* TAB 1: BROWSE CENTRAL QUESTION BANK */}
      {activeTab === 'browse' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters Bar card */}
          <div className="glass-card" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SEARCH TEXT</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search questions..."
                  style={{ padding: '8px 12px 8px 30px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SOURCE</label>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}>
                <option value="All">All Sources</option>
                <option value="NEET">NEET</option>
                <option value="IIT JEE">IIT JEE</option>
                <option value="NCERT Science">NCERT Science</option>
                <option value="NCERT Math">NCERT Math</option>
                <option value="Custom">Custom</option>
                {sources.filter(s => s !== 'NEET' && s !== 'IIT JEE' && s !== 'NCERT Science' && s !== 'NCERT Math' && s !== 'Custom').map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SUBJECT</label>
              <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}>
                <option value="All">All Subjects</option>
                {subjects.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>DIFFICULTY</label>
              <select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}>
                <option value="All">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* List display */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredQuestions.length === 0 ? (
              <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No questions found in your Central Bank. Go to the "Public Library" tab to import standard NEET/JEE questions or upload from CSV!
              </div>
            ) : (
              filteredQuestions.map(q => (
                <div key={q.id} className="glass-card animate-fade-in" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#ebf8ff', color: '#2b6cb0', fontWeight: 'bold' }}>{q.source}</span>
                      <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#f0fff4', color: '#276749', fontWeight: 'bold' }}>{q.subject}</span>
                      <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#fffaf0', color: '#dd6b20', fontWeight: 'bold' }}>{q.chapter}</span>
                      {q.difficulty && (
                        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: q.difficulty === 'easy' ? '#e6fffa' : q.difficulty === 'medium' ? '#feebc8' : '#fed7d7', color: q.difficulty === 'easy' ? '#234e52' : q.difficulty === 'medium' ? '#c05621' : '#9b2c2c', fontWeight: 'bold' }}>{q.difficulty.toUpperCase()}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '8px' }}>
                      <MathRenderer text={q.questionText} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} style={{ display: 'flex', gap: '4px', color: oIdx === q.correctOptionIdx ? 'var(--success)' : 'inherit', fontWeight: oIdx === q.correctOptionIdx ? 'bold' : 'normal' }}>
                          <span>{['A', 'B', 'C', 'D', 'E'][oIdx]})</span>
                          <MathRenderer text={opt} />
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-color)', paddingTop: '6px', fontStyle: 'italic' }}>
                        Explanation: <MathRenderer text={q.explanation} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                    <button 
                      onClick={() => setSelectedBankQ(q)}
                      className="btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', width: '110px' }}
                    >
                      Add to Exam
                    </button>
                    <button 
                      onClick={() => handleDeleteBankQ(q.id!)}
                      className="btn-danger" 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', width: '110px', background: 'transparent', color: '#e53e3e', border: '1px solid #fed7d7' }}
                    >
                      <Trash2 size={12} style={{ marginRight: '4px' }} /> Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ADD QUESTION MANUALLY FORM */}
      {activeTab === 'add' && (
        <form onSubmit={handleAddQuestion} className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '700px', margin: '0 auto', width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Add Question to Central Bank</h3>
          
          {addFeedback && (
            <div style={{ background: '#e6fffa', border: '1px solid #319795', color: '#234e52', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={16} /> {addFeedback}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SOURCE *</label>
              <select value={newSource} onChange={e => setNewSource(e.target.value as any)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                <option value="Custom">Custom / Internal</option>
                <option value="NEET">NEET</option>
                <option value="IIT JEE">IIT JEE</option>
                <option value="NCERT Science">NCERT Science</option>
                <option value="NCERT Math">NCERT Math</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>DIFFICULTY *</label>
              <select value={newDifficulty} onChange={e => setNewDifficulty(e.target.value as any)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SUBJECT *</label>
              <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="e.g. Physics" required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>CHAPTER *</label>
              <input type="text" value={newChapter} onChange={e => setNewChapter(e.target.value)} placeholder="e.g. Electrostatics" required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>TOPIC</label>
              <input type="text" value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="e.g. Coulomb's Law" style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>QUESTION TEXT (Supports LaTeX e.g. $F = qE$) *</label>
            <textarea value={newQuestionText} onChange={e => setNewQuestionText(e.target.value)} placeholder="Type question content here..." required rows={3} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'inherit' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>OPTIONS *</label>
            {newOptions.map((opt, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', width: '20px' }}>{['A', 'B', 'C', 'D', 'E'][idx]}</span>
                <input 
                  type="text" 
                  value={opt} 
                  onChange={e => {
                    const updated = [...newOptions];
                    updated[idx] = e.target.value;
                    setNewOptions(updated);
                  }}
                  placeholder={`Option ${['A', 'B', 'C', 'D', 'E'][idx]} text`}
                  required={idx < 4}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} 
                />
                <input 
                  type="radio" 
                  name="correctIdx" 
                  checked={newCorrectIdx === idx}
                  onChange={() => setNewCorrectIdx(idx)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Correct</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              {newOptions.length < 5 && (
                <button type="button" onClick={() => setNewOptions([...newOptions, ''])} className="btn-link" style={{ fontSize: '0.75rem', padding: 0 }}>+ Add Option E</button>
              )}
              {newOptions.length > 4 && (
                <button type="button" onClick={() => setNewOptions(newOptions.slice(0, 4))} className="btn-link animate-fade-in" style={{ fontSize: '0.75rem', padding: 0, color: 'var(--warning)' }}>- Remove Option E</button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>EXPLANATION</label>
            <textarea value={newExplanation} onChange={e => setNewExplanation(e.target.value)} placeholder="Explain the solution step-by-step..." rows={2} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'inherit' }} />
          </div>

          <button type="submit" className="btn-primary" style={{ padding: '10px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            <PlusCircle size={18} /> Save to Central Bank
          </button>
        </form>
      )}

      {/* TAB 3: IMPORT FROM CSV TEXT AREA */}
      {activeTab === 'csv' && (
        <div className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '750px', margin: '0 auto', width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Import CSV Questions</h3>
          
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Paste CSV formatted lines below. Ensure each line matches the exact column mapping below:
          </p>

          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
            <strong>CSV Column Order:</strong><br/>
            <code>Question Text, Option A, Option B, Option C, Option D, Correct Option (A-D), Subject, Chapter, Difficulty, Explanation</code>
          </div>

          <div style={{ background: '#fffaf0', border: '1px solid #dd6b20', color: '#7b341e', padding: '10px 12px', borderRadius: '6px', fontSize: '0.75rem' }}>
            <strong>Note on Quotes:</strong> Wrap fields in double quotes if they contain commas or mathematical equations (e.g. <code>"If $x,y=2$, find $x$","2","4","5","3",A,Maths,Algebra,easy</code>).
          </div>

          {csvFeedback && (
            <div style={{ background: csvFeedback.success ? '#e6fffa' : '#fed7d7', border: csvFeedback.success ? '1px solid #319795' : '1px solid #e53e3e', color: csvFeedback.success ? '#234e52' : '#9b2c2c', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem' }}>
              {csvFeedback.message}
            </div>
          )}

          <textarea 
            value={csvInput}
            onChange={e => setCsvInput(e.target.value)}
            rows={10} 
            placeholder='Example:&#10;"Which organelle is the powerhouse of the cell?",Mitochondria,Ribosome,Lysosome,Golgi,A,Biology,Cytology,easy,"Mitochondria produces ATP molecules."&#10;"Find derivative of $x^2$",2x,3x,x,1,A,Maths,Calculus,easy,"Power rule gives d/dx(x^2)=2x"'
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
          />

          <button 
            onClick={handleImportCSV}
            className="btn-primary" 
            style={{ padding: '10px', borderRadius: '8px', fontWeight: 'bold' }}
          >
            Start Bulk Import
          </button>
        </div>
      )}

      {/* TAB 4: BROWSE & IMPORT FROM PUBLIC LIBRARIES */}
      {activeTab === 'public' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Info & Bulk Import block */}
          <div className="glass-card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', textAlign: 'left' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold' }}>Standard NEET / IIT JEE Core Questions</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                These are pre-seeded expert collections of questions for NEET Physics, Chemistry, Biology and JEE Maths.
              </p>
            </div>
            <button 
              onClick={importAllLibrary}
              className="btn-primary" 
              style={{ padding: '8px 16px', borderRadius: '8px', background: '#319795', border: 'none' }}
            >
              Import All Questions to Central Bank
            </button>
          </div>

          {pubFeedback && (
            <div style={{ background: '#e6fffa', border: '1px solid #319795', color: '#234e52', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', textAlign: 'left' }}>
              {pubFeedback}
            </div>
          )}

          {pubLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '80px 0', gap: '12px' }}>
              <div style={{ border: '3px solid #e2e8f0', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading public question library...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {publicQuestions.map((q, index) => {
                const isImported = centralQuestions.some(cq => cq.questionText === q.questionText);
                return (
                  <div key={index} className="glass-card animate-fade-in" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#ebf8ff', color: '#2b6cb0', fontWeight: 'bold' }}>{q.source}</span>
                        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#f0fff4', color: '#276749', fontWeight: 'bold' }}>{q.subject}</span>
                        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#fffaf0', color: '#dd6b20', fontWeight: 'bold' }}>{q.chapter}</span>
                        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: q.difficulty === 'easy' ? '#e6fffa' : q.difficulty === 'medium' ? '#feebc8' : '#fed7d7', color: q.difficulty === 'easy' ? '#234e52' : q.difficulty === 'medium' ? '#c05621' : '#9b2c2c', fontWeight: 'bold' }}>{q.difficulty.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '8px' }}>
                        <MathRenderer text={q.questionText} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        {q.options.map((opt: string, oIdx: number) => (
                          <div key={oIdx} style={{ display: 'flex', gap: '4px', color: oIdx === q.correctOptionIdx ? 'var(--success)' : 'inherit', fontWeight: oIdx === q.correctOptionIdx ? 'bold' : 'normal' }}>
                            <span>{['A', 'B', 'C', 'D', 'E'][oIdx]})</span>
                            <MathRenderer text={opt} />
                          </div>
                        ))}
                      </div>
                    </div>

                    <button 
                      onClick={() => importPublicQuestion(q)}
                      disabled={isImported}
                      className={isImported ? "btn-secondary" : "btn-primary"} 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', width: '130px', flexShrink: 0 }}
                    >
                      {isImported ? "Already in Bank ✓" : "Save to Bank"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SELECT EXAM POPUP MODAL (Add to Exam) */}
      {selectedBankQ && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="glass-card animate-scale-up" style={{ background: '#ffffff', width: '90%', maxWidth: '480px', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Add Question to Exam</h3>
              <button onClick={() => setSelectedBankQ(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            {examSelectFeedback ? (
              <div style={{ background: '#e6fffa', border: '1px solid #319795', color: '#234e52', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={16} /> {examSelectFeedback}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                <div style={{ fontSize: '0.8rem', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  Question: <strong><MathRenderer text={selectedBankQ.questionText.substring(0, 100) + (selectedBankQ.questionText.length > 100 ? '...' : '')} /></strong>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SELECT TARGET EXAM</label>
                  <select 
                    value={selectedExamId} 
                    onChange={e => {
                      setSelectedExamId(e.target.value);
                      setSelectedSectionName('');
                    }} 
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}
                  >
                    <option value="">-- Choose Exam --</option>
                    {examsList.filter(e => !!e.startsAt).map(e => (
                      <option key={e.id} value={e.id}>{e.title} ({e.className})</option>
                    ))}
                  </select>
                </div>

                {selectedExamId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} className="animate-fade-in">
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SELECT SECTION / SUBJECT IN EXAM</label>
                    {targetExamSections.length > 0 ? (
                      <select 
                        value={selectedSectionName} 
                        onChange={e => setSelectedSectionName(e.target.value)} 
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}
                      >
                        <option value="">-- Choose Section --</option>
                        {targetExamSections.map((sec, idx) => (
                          <option key={idx} value={sec.sectionName}>{sec.subjectName} - {sec.sectionName}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        value={selectedSectionName} 
                        onChange={e => setSelectedSectionName(e.target.value)} 
                        placeholder="e.g. Physics Section A" 
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} 
                      />
                    )}
                  </div>
                )}

                <button 
                  onClick={handleAddQuestionToExam}
                  disabled={!selectedExamId}
                  className="btn-primary" 
                  style={{ padding: '10px', borderRadius: '8px', fontWeight: 'bold', marginTop: '8px' }}
                >
                  Confirm and Add Question
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
