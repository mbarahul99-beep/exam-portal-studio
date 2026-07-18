import React, { useState, useEffect } from 'react';
import { db, type BankQuestion, type QuestionBank } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { MathRenderer } from './MathRenderer';
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
  const [subTab, setSubTab] = useState<'browse' | 'add' | 'csv' | 'public'>('browse');

  // Browse questions filters
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('All');

  // Add question form states
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newOptions, setNewOptions] = useState<string[]>(['', '', '', '']);
  const [newCorrectIdx, setNewCorrectIdx] = useState<number>(0);
  const [newDifficulty, setNewDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [newExplanation, setNewExplanation] = useState('');
  const [addFeedback, setAddFeedback] = useState<string | null>(null);

  // CSV import states
  const [csvInput, setCsvInput] = useState('');
  const [csvFeedback, setCsvFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Public library states
  const [publicQuestions, setPublicQuestions] = useState<any[]>([]);
  const [pubLoading, setPubLoading] = useState(false);
  const [pubFeedback, setPubFeedback] = useState<string | null>(null);

  // Fetch from URL states
  const [fetchUrl, setFetchUrl] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedCount, setFetchedCount] = useState<number | null>(null);
  const [fetchedQList, setFetchedQList] = useState<any[]>([]);
  const [fetchSuccessMsg, setFetchSuccessMsg] = useState<string | null>(null);

  // Add to exam popup states
  const [selectedBankQ, setSelectedBankQ] = useState<BankQuestion | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | string>('');
  const [selectedSectionName, setSelectedSectionName] = useState<string>('');
  const [examSelectFeedback, setExamSelectFeedback] = useState<string | null>(null);

  // Dexie live queries
  const questionBanks = useLiveQuery(() => db.questionBanks.toArray()) || [];
  const allBankQuestions = useLiveQuery(() => db.questionBank.toArray()) || [];
  const examsList = useLiveQuery(() => db.exams.toArray()) || [];

  // Filter public library questions based on the active bank's subject/topic when public tab is loaded
  useEffect(() => {
    if (subTab === 'public' && publicQuestions.length === 0) {
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
  }, [subTab, publicQuestions.length]);

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
      // Delete all questions linked to this bank
      await db.questionBank.where('bankId').equals(bankId).delete();
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
        createdAt: new Date()
      };

      await db.questionBank.add(q);
      setAddFeedback("Question successfully added to bank!");
      
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
        await db.questionBank.bulkAdd(importedList);
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

  // Import single question from Public Library into active bank
  const importPublicQuestion = async (pubQ: any) => {
    if (!selectedBank) return;
    try {
      const activeBankQuestions = allBankQuestions.filter(q => q.bankId === selectedBank.id);
      const exists = activeBankQuestions.some(q => q.questionText === pubQ.questionText);
      if (exists) {
        alert("This question is already in this bank.");
        return;
      }

      await db.questionBank.add({
        bankId: selectedBank.id!,
        questionText: pubQ.questionText,
        options: [...pubQ.options],
        correctOptionIdx: pubQ.correctOptionIdx,
        difficulty: pubQ.difficulty || 'medium',
        explanation: pubQ.explanation || undefined,
        createdAt: new Date()
      });
      setPubFeedback(`Successfully saved question to "${selectedBank.name}"!`);
      setTimeout(() => setPubFeedback(null), 2500);
    } catch (err: any) {
      alert(`Failed to save question: ${err.message}`);
    }
  };

  // Import all filtered library questions to active bank
  const importAllLibrary = async (filteredPub: any[]) => {
    if (!selectedBank || filteredPub.length === 0) return;
    try {
      const activeBankQuestions = allBankQuestions.filter(q => q.bankId === selectedBank.id);
      let added = 0;
      for (const q of filteredPub) {
        const exists = activeBankQuestions.some(cq => cq.questionText === q.questionText);
        if (!exists) {
          await db.questionBank.add({
            bankId: selectedBank.id!,
            questionText: q.questionText,
            options: [...q.options],
            correctOptionIdx: q.correctOptionIdx,
            difficulty: q.difficulty || 'medium',
            explanation: q.explanation || undefined,
            createdAt: new Date()
          });
          added++;
        }
      }
      alert(`Imported ${added} questions to "${selectedBank.name}"!`);
    } catch (err: any) {
      alert(`Error bulk importing: ${err.message}`);
    }
  };

  // Fetch questions from an external URL dynamically in the browser
  const handleFetchFromUrl = async (urlToFetch: string) => {
    if (!urlToFetch) {
      alert("Please enter a valid URL first.");
      return;
    }
    setFetchLoading(true);
    setFetchError(null);
    setFetchedCount(null);
    setFetchedQList([]);

    try {
      // Use AllOrigins as a reliable CORS proxy
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(urlToFetch.trim())}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch from URL: ${response.statusText}`);
      }
      
      const data = await response.json();
      let questionsArray: any[] = [];

      if (Array.isArray(data)) {
        questionsArray = data;
      } else if (data.questions && Array.isArray(data.questions)) {
        questionsArray = data.questions;
      } else {
        // Look for any array in the object properties
        const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
        if (arrayKey) {
          questionsArray = data[arrayKey];
        }
      }

      if (questionsArray.length === 0) {
        throw new Error("No questions array found in the fetched JSON payload. Ensure it is a JSON array or contains a 'questions' array.");
      }

      // Standardize the fetched questions to BankQuestion structure
      const standardized = questionsArray.map((q: any, idx: number) => {
        const questionText = q.questionText || q.question_text || q.question || q.text || `Question ${idx + 1}`;
        
        let options: string[] = [];
        if (Array.isArray(q.options)) {
          options = q.options.map((o: any) => typeof o === 'object' ? (o.text || o.value || '') : String(o));
        } else if (q.options && typeof q.options === 'object') {
          options = Object.values(q.options).map(String);
        }

        let correctOptionIdx = 0;
        const rawCorrect = q.correctOptionIdx !== undefined ? q.correctOptionIdx : (q.correct_answer || q.answer);
        if (typeof rawCorrect === 'number') {
          correctOptionIdx = rawCorrect;
        } else if (typeof rawCorrect === 'string') {
          const letters = ['A', 'B', 'C', 'D', 'E'];
          const idxLetter = letters.indexOf(rawCorrect.toUpperCase().trim());
          if (idxLetter !== -1) {
            correctOptionIdx = idxLetter;
          } else {
            const num = parseInt(rawCorrect, 10);
            if (!isNaN(num)) correctOptionIdx = num - 1; // 1-based to 0-based
          }
        }

        return {
          questionText: String(questionText),
          options: options.length > 0 ? options : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctOptionIdx: correctOptionIdx >= 0 && correctOptionIdx < 5 ? correctOptionIdx : 0,
          difficulty: q.difficulty || 'medium',
          explanation: q.explanation || q.solution || ''
        };
      });

      setFetchedQList(standardized);
      setFetchedCount(standardized.length);
    } catch (err: any) {
      setFetchError(err.message || "An unknown error occurred while fetching.");
    } finally {
      setFetchLoading(false);
    }
  };

  // Import the fetched questions into the active selected bank
  const handleImportFetchedQuestions = async () => {
    if (!selectedBank || fetchedQList.length === 0) return;

    try {
      const activeBankQuestions = allBankQuestions.filter(q => q.bankId === selectedBank.id);
      let added = 0;

      const importPromises = fetchedQList.map(async (q) => {
        const exists = activeBankQuestions.some(cq => cq.questionText === q.questionText);
        if (!exists) {
          await db.questionBank.add({
            bankId: selectedBank.id!,
            questionText: q.questionText,
            options: [...q.options],
            correctOptionIdx: q.correctOptionIdx,
            difficulty: q.difficulty || 'medium',
            explanation: q.explanation || undefined,
            createdAt: new Date()
          });
          added++;
        }
      });

      await Promise.all(importPromises);

      setFetchSuccessMsg(`Successfully imported ${added} new questions into "${selectedBank.name}"!`);
      setFetchedQList([]);
      setFetchedCount(null);
      setFetchUrl('');
      
      setTimeout(() => setFetchSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
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
      await db.questions.add({
        examId: exam.id!,
        sectionName: selectedSectionName || selectedBank?.subject || 'General',
        questionText: selectedBankQ.questionText,
        options: [...selectedBankQ.options],
        correctOptionIdx: selectedBankQ.correctOptionIdx,
        explanation: selectedBankQ.explanation || ''
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

  // Filter public library questions based on active bank's subject/topic
  const filteredPublicQuestions = publicQuestions.filter(q => {
    if (!selectedBank) return false;
    // Match subject loosely
    const bankSub = selectedBank.subject.toLowerCase();
    const pubSub = q.subject.toLowerCase();
    return pubSub.includes(bankSub) || bankSub.includes(pubSub);
  });

  const targetExamObj = selectedExamId ? examsList.find(e => e.id === Number(selectedExamId)) : null;
  const targetExamSections = targetExamObj?.sections || [];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100%' }}>
      
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
              <button 
                onClick={() => setSubTab('public')}
                style={{ padding: '6px 14px', border: 'none', background: subTab === 'public' ? 'var(--primary)' : 'transparent', color: subTab === 'public' ? '#fff' : '#4a5568', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Public Library
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
                    <div key={q.id} className="glass-card animate-fade-in" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start' }}>
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
                          onClick={async () => {
                            if (confirm("Delete this question from the bank?")) {
                              await db.questionBank.delete(q.id!);
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

          {/* SUB-TAB 4: PUBLIC LIBRARY AUTOFILTERED BY ACTIVE BANK'S SUBJECT */}
          {subTab === 'public' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* FETCH FROM EXTERNAL URL INTERACTION PANEL */}
              <div className="glass-card animate-fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database className="text-indigo" size={18} /> Fetch Open Question Banks from Web
                </h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Enter any public raw JSON questions URL (e.g. raw GitHub URLs or HuggingFace API JSONs) to download and import them directly into your database.
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    placeholder="https://raw.githubusercontent.com/.../questions.json"
                    value={fetchUrl}
                    onChange={e => setFetchUrl(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                  />
                  <button 
                    onClick={() => handleFetchFromUrl(fetchUrl)}
                    disabled={fetchLoading}
                    className="btn-primary"
                    style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}
                  >
                    {fetchLoading ? 'Fetching...' : 'Fetch & Preview'}
                  </button>
                </div>

                {/* Pre-configured public sources links */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>QUICK SOURCE SAMPLES:</span>
                  <button 
                    type="button" 
                    onClick={() => {
                      const url = 'https://raw.githubusercontent.com/mbarahul99-beep/exam-portal/main/public/neet_jee_bank.json';
                      setFetchUrl(url);
                      handleFetchFromUrl(url);
                    }} 
                    className="btn-outlined" 
                    style={{ padding: '4px 8px', fontSize: '0.65rem', borderRadius: '4px' }}
                  >
                    NEET/JEE Sample (15 Qs)
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      const url = 'https://raw.githubusercontent.com/AdithSuresh2004/exam-questions/main/nimcet/physics.json';
                      setFetchUrl(url);
                      handleFetchFromUrl(url);
                    }} 
                    className="btn-outlined" 
                    style={{ padding: '4px 8px', fontSize: '0.65rem', borderRadius: '4px' }}
                  >
                    AdithSuresh Physics (200+ Qs)
                  </button>
                </div>

                {fetchError && (
                  <div style={{ background: '#fed7d7', border: '1px solid #e53e3e', color: '#9b2c2c', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem' }}>
                    {fetchError}
                  </div>
                )}

                {fetchSuccessMsg && (
                  <div style={{ background: '#e6fffa', border: '1px solid #319795', color: '#234e52', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem' }}>
                    {fetchSuccessMsg}
                  </div>
                )}

                {fetchedCount !== null && fetchedQList.length > 0 && (
                  <div className="animate-scale-up" style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(49, 151, 149, 0.05)', padding: '14px', border: '1px dashed #319795', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#234e52', fontWeight: 'bold' }}>
                        ✓ Successfully scanned! Found {fetchedCount} compatible questions.
                      </span>
                      <button 
                        onClick={handleImportFetchedQuestions}
                        className="btn-filled"
                        style={{ background: '#319795', padding: '6px 14px', fontSize: '0.75rem', borderRadius: '6px' }}
                      >
                        Import All {fetchedCount} to "{selectedBank.name}"
                      </button>
                    </div>
                    {/* Tiny preview list */}
                    <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {fetchedQList.slice(0, 5).map((q, idx) => (
                        <div key={idx} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'left', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          Q{idx+1}: {q.questionText}
                        </div>
                      ))}
                      {fetchedCount > 5 && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'left' }}>
                          ...and {fetchedCount - 5} more questions.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CURATED LOCAL QUESTIONS LIST */}
              <div className="glass-card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', textAlign: 'left' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold' }}>
                    Curated Public Library for: <span style={{ color: 'var(--primary)' }}>{selectedBank.subject}</span>
                  </h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Auto-filtered collections containing high-quality questions matching your question bank's subject.
                  </p>
                </div>
                {filteredPublicQuestions.length > 0 && (
                  <button 
                    onClick={() => importAllLibrary(filteredPublicQuestions)}
                    className="btn-primary" 
                    style={{ padding: '8px 16px', borderRadius: '8px', background: '#319795', border: 'none' }}
                  >
                    Import All ({filteredPublicQuestions.length}) to This Bank
                  </button>
                )}
              </div>

              {pubFeedback && (
                <div style={{ background: '#e6fffa', border: '1px solid #319795', color: '#234e52', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', textAlign: 'left' }}>
                  {pubFeedback}
                </div>
              )}

              {pubLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '80px 0', gap: '12px' }}>
                  <div style={{ border: '3px solid #e2e8f0', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Filtering public library...</span>
                </div>
              ) : filteredPublicQuestions.length === 0 ? (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No public library questions match the subject "{selectedBank.subject}".
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredPublicQuestions.map((q, index) => {
                    const isImported = activeQuestions.some(cq => cq.questionText === q.questionText);
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
                          {isImported ? "Imported ✓" : "Import to Bank"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
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
