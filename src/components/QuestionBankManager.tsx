import React, { useState } from 'react';
import { db, type BankQuestion, type QuestionBank } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { MathRenderer } from './MathRenderer';
import { 
  syncQuestionBankToCloud, 
  deleteQuestionBankFromCloud, 
  syncBankQuestionToCloud, 
  deleteBankQuestionFromCloud,
  syncExamToCloud 
} from '../utils/cloudSync';
import { 
  Plus, 
  Search, 
  Trash2, 
  X, 
  Check, 
  CheckCircle, 
  Database,
  PlusCircle,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';

interface QuestionBankManagerProps {
  onBack?: () => void;
}

export const QuestionBankManager: React.FC<QuestionBankManagerProps> = () => {
  // Navigation states
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create Question Bank form states
  const [targetExam, setTargetExam] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');

  // Selected Bank management sub-tab states
  const [subTab, setSubTab] = useState<'browse' | 'add' | 'csv'>('browse');

  // Browse questions filters
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('All');

  // Add question form states
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newOptions, setNewOptions] = useState<string[]>(['', '', '', '']);
  const [newCorrectIdx, setNewCorrectIdx] = useState<number>(0);
  const [newDifficulty, setNewDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [newExplanation, setNewExplanation] = useState('');
  const [newQuestionImage, setNewQuestionImage] = useState<string>('');
  const [addFeedback, setAddFeedback] = useState<string | null>(null);

  // CSV import states
  const [csvInput, setCsvInput] = useState('');
  const [csvFeedback, setCsvFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Add to exam popup states
  const [selectedBankQ, setSelectedBankQ] = useState<BankQuestion | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | string>('');
  const [selectedSectionName, setSelectedSectionName] = useState<string>('');
  const [examSelectFeedback, setExamSelectFeedback] = useState<string | null>(null);

  // Dexie live queries
  const questionBanks = useLiveQuery(() => db.questionBanks.toArray()) || [];
  const allBankQuestions = useLiveQuery(() => db.questionBank.toArray()) || [];
  const examsList = useLiveQuery(() => db.exams.toArray()) || [];

  // Handle creating a new Question Bank
  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetExam.trim() || !subject.trim() || !topic.trim()) {
      alert("Please fill out all fields.");
      return;
    }

    try {
      const bankName = `${targetExam.trim()} - ${subject.trim()}: ${topic.trim()}`;
      const newBank: QuestionBank = {
        name: bankName,
        targetExam: targetExam.trim(),
        subject: subject.trim(),
        topic: topic.trim(),
        createdAt: new Date()
      };

      const bankId = await db.questionBanks.add(newBank);
      newBank.id = bankId;
      await syncQuestionBankToCloud(newBank);
      
      // Auto-open the newly created bank
      setSelectedBank(newBank);
      setSubTab('browse');
      setShowCreateModal(false);

      // Reset form
      setTargetExam('');
      setSubject('');
      setTopic('');
    } catch (err: any) {
      alert(`Error creating bank: ${err.message}`);
    }
  };

  // Handle deleting a Question Bank
  const handleDeleteBank = async (bankId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this entire Question Bank and all questions stored inside it?")) {
      await db.questionBanks.delete(bankId);
      await deleteQuestionBankFromCloud(bankId);
      // Delete all questions linked to this bank from local and cloud
      const qList = await db.questionBank.toArray();
      const linkedQs = qList.filter((q: any) => Number(q.bankId) === Number(bankId));
      for (const q of linkedQs) {
        if (q.id) {
          await deleteBankQuestionFromCloud(q.id);
          await db.questionBank.delete(q.id);
        }
      }
      if (selectedBank && selectedBank.id === bankId) {
        setSelectedBank(null);
      }
    }
  };

  // Handle adding manual question inside active bank
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBank) return;
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
        bankId: selectedBank.id!,
        questionText: newQuestionText.trim(),
        options: newOptions.map(o => o.trim()),
        correctOptionIdx: newCorrectIdx,
        difficulty: newDifficulty,
        explanation: newExplanation.trim() || undefined,
        questionImage: newQuestionImage || undefined,
        createdAt: new Date()
      };

      const qId = await db.questionBank.add(q);
      q.id = qId;
      await syncBankQuestionToCloud(q);

      setAddFeedback("Question successfully added to bank!");
      
      // Reset form
      setNewQuestionText('');
      setNewOptions(['', '', '', '']);
      setNewCorrectIdx(0);
      setNewExplanation('');
      setNewQuestionImage('');
      
      setTimeout(() => setAddFeedback(null), 3000);
    } catch (err: any) {
      alert(`Error saving question: ${err.message}`);
    }
  };

  // Handle CSV Import for active bank
  const handleImportCSV = async () => {
    if (!selectedBank) return;
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

        // Expected format: Question Text, Option A, Option B, Option C, Option D, Correct Option (A-D), Difficulty, Explanation
        if (parts.length >= 6) {
          const qText = parts[0];
          const opts = [parts[1], parts[2], parts[3], parts[4]];
          const correctStr = parts[5].toUpperCase().trim();
          
          let correctIdx = 0;
          if (correctStr === 'B' || correctStr === '1') correctIdx = 1;
          else if (correctStr === 'C' || correctStr === '2') correctIdx = 2;
          else if (correctStr === 'D' || correctStr === '3') correctIdx = 3;
          else if (correctStr === 'E' || correctStr === '4') correctIdx = 4;

          const diffRaw = (parts[6] || 'medium').toLowerCase().trim();
          const difficulty: 'easy' | 'medium' | 'hard' = 
            diffRaw === 'easy' || diffRaw === 'hard' ? diffRaw : 'medium';
          const explanation = parts[7] || '';

          importedList.push({
            bankId: selectedBank.id!,
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
        for (const item of importedList) {
          const insertedId = await db.questionBank.add(item);
          item.id = insertedId;
          await syncBankQuestionToCloud(item);
        }
        setCsvFeedback({
          success: true,
          message: `Successfully imported ${importedList.length} questions into bank!${skippedLines > 0 ? ` (Skipped ${skippedLines} invalid lines)` : ''}`
        });
        setCsvInput('');
      } else {
        setCsvFeedback({
          success: false,
          message: "Could not import any questions. Please check the CSV format."
        });
      }
    } catch (err: any) {
      setCsvFeedback({
        success: false,
        message: `Import failed: ${err.message}`
      });
    }
  };


  // Add question from bank to exam
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
      let targetSubjectName = selectedBank?.subject || 'Subject 1';
      let targetSectionName = selectedSectionName;

      if (selectedSectionName.includes('|')) {
        const [subName, secName] = selectedSectionName.split('|');
        targetSubjectName = subName;
        targetSectionName = secName;
      }

      await db.questions.add({
        examId: exam.id!,
        subjectName: targetSubjectName,
        sectionName: targetSectionName || 'General',
        questionText: selectedBankQ.questionText,
        options: [...selectedBankQ.options],
        correctOptionIdx: selectedBankQ.correctOptionIdx,
        explanation: selectedBankQ.explanation || '',
        questionImage: selectedBankQ.questionImage || undefined
      });

      // 2. Update Exam parameters
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

      // 3. Sync updated exam parameters & questions list to Hostinger MySQL
      const updatedExam = await db.exams.get(exam.id!);
      if (updatedExam) {
        await syncExamToCloud(updatedExam);
      }
      const allExamQs = await db.questions.where('examId').equals(exam.id!).toArray();
      try {
        await fetch('/api/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examId: exam.id!, questions: allExamQs })
        });
      } catch (err) {
        console.warn("MySQL questions sync warning:", err);
      }

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

  // Get question counts for each bank
  const getQuestionCountForBank = (bankId: number) => {
    return allBankQuestions.filter(q => q.bankId === bankId).length;
  };

  // Filter current active bank's questions
  const activeQuestions = selectedBank 
    ? allBankQuestions.filter(q => q.bankId === selectedBank.id)
    : [];

  const filteredQuestions = activeQuestions.filter(q => {
    if (difficultyFilter !== 'All' && q.difficulty !== difficultyFilter) return false;
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      const inText = q.questionText.toLowerCase().includes(lower);
      const inOptions = q.options.some(o => o.toLowerCase().includes(lower));
      if (!inText && !inOptions) return false;
    }
    return true;
  });



  const targetExamObj = selectedExamId ? examsList.find(e => e.id === Number(selectedExamId)) : null;
  const targetExamSections = targetExamObj?.sections || [];

  return (
    <div className="qbank-container">
      
      {/* 1. ROOT VIEW: LIST OF ALL CREATED QUESTION BANKS */}
      {!selectedBank ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', textAlign: 'left' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database className="text-indigo" size={24} /> Question Banks
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Select a Question Bank to add/edit questions or click the button to create a new one.
              </p>
            </div>
            
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="btn-primary" 
              style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={18} /> Create Question Bank
            </button>
          </div>

          {/* List of created banks */}
          {questionBanks.length === 0 ? (
            <div className="glass-card animate-fade-in" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Database size={48} style={{ marginBottom: '16px', opacity: 0.3, color: 'var(--primary)' }} />
              <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>No Question Banks Found</h4>
              <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem' }}>Create your first modular question bank categorized by exam, subject, and topic.</p>
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="btn-primary"
                style={{ padding: '8px 16px', borderRadius: '8px' }}
              >
                Create Question Bank
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {questionBanks.map(bank => {
                const count = getQuestionCountForBank(bank.id!);
                return (
                  <div 
                    key={bank.id} 
                    className="glass-card hover-card animate-fade-in" 
                    onClick={() => {
                      setSelectedBank(bank);
                      setSubTab('browse');
                    }}
                    style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer', textAlign: 'left', position: 'relative' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '12px', background: '#ebf8ff', color: '#2b6cb0', fontWeight: 'bold', textTransform: 'uppercase' }}>
                        {bank.targetExam}
                      </span>
                      <button 
                        onClick={(e) => handleDeleteBank(bank.id!, e)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                        title="Delete Question Bank"
                      >
                        <Trash2 size={15} className="hover-red" />
                      </button>
                    </div>

                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{bank.subject}</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Topic: <strong>{bank.topic}</strong>
                      </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span>Questions: <strong>{count}</strong></span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--primary)', fontWeight: 'bold' }}>
                        Manage <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        
        /* 2. DASHBOARD VIEW: MANAGE A SINGLE SELECTED QUESTION BANK */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Breadcrumbs & Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
              <button 
                onClick={() => setSelectedBank(null)}
                className="btn-outlined" 
                style={{ padding: '6px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Question Banks</span>
                  <ChevronRight size={12} />
                  <span style={{ fontWeight: 'bold' }}>{selectedBank.targetExam}</span>
                </div>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {selectedBank.subject} - {selectedBank.topic}
                </h3>
              </div>
            </div>

            <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
              <button 
                onClick={() => setSubTab('browse')}
                style={{ padding: '6px 14px', border: 'none', background: subTab === 'browse' ? 'var(--primary)' : 'transparent', color: subTab === 'browse' ? '#fff' : '#4a5568', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Browse ({filteredQuestions.length})
              </button>
              <button 
                onClick={() => setSubTab('add')}
                style={{ padding: '6px 14px', border: 'none', background: subTab === 'add' ? 'var(--primary)' : 'transparent', color: subTab === 'add' ? '#fff' : '#4a5568', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + Add Question
              </button>
              <button 
                onClick={() => setSubTab('csv')}
                style={{ padding: '6px 14px', border: 'none', background: subTab === 'csv' ? 'var(--primary)' : 'transparent', color: subTab === 'csv' ? '#fff' : '#4a5568', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Import CSV
              </button>
            </div>
          </div>

          {/* SUB-TAB 1: BROWSE BANK QUESTIONS */}
          {subTab === 'browse' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Filter controls */}
              <div className="glass-card" style={{ padding: '14px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search questions inside this bank..."
                    style={{ padding: '8px 12px 8px 30px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}>
                  <option value="All">All Levels</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              {/* Questions Feed */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredQuestions.length === 0 ? (
                  <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No questions stored in this bank matching your filters. Click <strong>+ Add Question</strong> or import them!
                  </div>
                ) : (
                  filteredQuestions.map((q, idx) => (
                    <div key={q.id} className="qbank-question-card glass-card animate-fade-in">
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>Q{idx + 1}.</span>
                          <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: q.difficulty === 'easy' ? '#e6fffa' : q.difficulty === 'medium' ? '#feebc8' : '#fed7d7', color: q.difficulty === 'easy' ? '#234e52' : q.difficulty === 'medium' ? '#c05621' : '#9b2c2c', fontWeight: 'bold' }}>
                            {q.difficulty.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '8px' }}>
                          <MathRenderer text={q.questionText} />
                        </div>
                        {q.questionImage && (
                          <div style={{ marginTop: '8px', marginBottom: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', display: 'inline-block', background: '#fff', padding: '6px' }}>
                            <img src={q.questionImage} alt="Diagram" style={{ maxHeight: '140px', maxWidth: '100%', objectFit: 'contain' }} />
                          </div>
                        )}
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

                      <div className="qbank-question-actions">
                        <button 
                          onClick={() => setSelectedBankQ(q)}
                          className="btn-primary" 
                          style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', width: '110px' }}
                        >
                          Add to Exam
                        </button>
                        <button 
                          onClick={async () => {
                            if (confirm("Delete this question from the bank?")) {
                              await db.questionBank.delete(q.id!);
                              await deleteBankQuestionFromCloud(q.id!);
                            }
                          }}
                          className="btn-danger" 
                          style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', width: '110px', background: 'transparent', color: '#e53e3e', border: '1px solid #fed7d7' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SUB-TAB 2: ADD SIMPLIFIED QUESTION MANUALLY */}
          {subTab === 'add' && (
            <form onSubmit={handleAddQuestion} className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '650px', margin: '0 auto', width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Add Question to Bank</h3>
              
              {addFeedback && (
                <div style={{ background: '#e6fffa', border: '1px solid #319795', color: '#234e52', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={16} /> {addFeedback}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>LEVEL / DIFFICULTY TAG *</label>
                <select value={newDifficulty} onChange={e => setNewDifficulty(e.target.value as any)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>QUESTION TEXT (Supports LaTeX e.g. $E=mc^2$) *</label>
                <textarea 
                  value={newQuestionText} 
                  onChange={e => setNewQuestionText(e.target.value)} 
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (items) {
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                          const file = items[i].getAsFile();
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setNewQuestionImage(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                            e.preventDefault();
                          }
                        }
                      }
                    }
                  }}
                  placeholder="Type question content here... You can also directly paste an image (Ctrl+V) from screenshots or Word here." 
                  required 
                  rows={3} 
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'inherit' }} 
                />
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
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>QUESTION IMAGE / DIAGRAM (OPTIONAL)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label 
                    className="btn-secondary" 
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)', 
                      background: '#fff', 
                      color: 'var(--text-secondary)', 
                      fontSize: '0.8rem', 
                      fontWeight: 'bold', 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px' 
                    }}
                  >
                    <span>Upload Image</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewQuestionImage(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  {newQuestionImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img 
                        src={newQuestionImage} 
                        alt="Preview" 
                        style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#fff' }} 
                      />
                      <button 
                        type="button" 
                        onClick={() => setNewQuestionImage('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--error)', fontSize: '0.75rem', fontWeight: 'bold' }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>EXPLANATION</label>
                <textarea value={newExplanation} onChange={e => setNewExplanation(e.target.value)} placeholder="Explain the solution step-by-step..." rows={2} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'inherit' }} />
              </div>

              <button type="submit" className="btn-primary" style={{ padding: '10px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                <PlusCircle size={18} /> Save Question to Bank
              </button>
            </form>
          )}

          {/* SUB-TAB 3: SIMPLIFIED IMPORT CSV */}
          {subTab === 'csv' && (
            <div className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '700px', margin: '0 auto', width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Import CSV Questions</h3>
              
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Paste CSV formatted lines below. Ensure each line matches the exact column order:
              </p>

              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                <strong>CSV Column Order:</strong><br/>
                <code>Question Text, Option A, Option B, Option C, Option D, Correct Option (A-D), Difficulty, Explanation</code>
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
                placeholder='Example:&#10;"Which cell organelle generates ATP?",Mitochondria,Ribosome,Lysosome,Nucleus,A,easy,"Mitochondria cellular respiration produces ATP."&#10;"Evaluate derivative of $x^3$",3x^2,2x^2,x^2,3x,A,medium,"d/dx(x^3) = 3x^2"'
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


        </div>
      )}

      {/* 3. MODAL DIALOG: SETUP / CREATE NEW QUESTION BANK */}
      {showCreateModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <form onSubmit={handleCreateBank} className="glass-card animate-scale-up" style={{ background: '#ffffff', width: '90%', maxWidth: '420px', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Create Question Bank</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>TARGET EXAM *</label>
                <input 
                  type="text" 
                  value={targetExam} 
                  onChange={e => setTargetExam(e.target.value)} 
                  placeholder="e.g. NEET" 
                  required 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SUBJECT *</label>
                <input 
                  type="text" 
                  value={subject} 
                  onChange={e => setSubject(e.target.value)} 
                  placeholder="e.g. Physics" 
                  required 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>TOPIC *</label>
                <input 
                  type="text" 
                  value={topic} 
                  onChange={e => setTopic(e.target.value)} 
                  placeholder="e.g. Electrostatics" 
                  required 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} 
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn-primary" 
              style={{ padding: '10px', borderRadius: '8px', fontWeight: 'bold', marginTop: '8px' }}
            >
              Create Bank & Add Questions
            </button>
          </form>
        </div>
      )}

      {/* 4. MODAL DIALOG: SELECT TARGET EXAM & SECTION TO ADD QUESTION TO */}
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
                          <option key={idx} value={`${sec.subjectName}|${sec.sectionName}`}>{sec.subjectName} - {sec.sectionName}</option>
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
