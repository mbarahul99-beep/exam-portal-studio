import React, { useState } from 'react';
import { Calendar, X, HelpCircle, Upload, FileText, Check, Copy, Eye } from 'lucide-react';
import * as mammoth from 'mammoth';
// @ts-ignore
import * as wmf from 'wmf';
import { db } from '../db';
import { type ClassEntity, type ExamSection, type ExamSubject } from '../db';
import { MathRenderer } from './MathRenderer';
import { syncExamToCloud, pullCloudUpdatesToIndexedDB } from '../utils/cloudSync';

function drawWmfSafely(bytes: Uint8Array, canvas: HTMLCanvasElement) {
  // Parse actions
  const actions = wmf.get_actions(bytes);
  
  // Patch actions to prevent crashes due to missing properties
  actions.forEach((act: any) => {
    if (act.s) {
      if (!act.s.Font) {
        act.s.Font = { Angle: 0, Name: 'Calibri', Height: 12, Italic: false, Weight: 400 };
      } else {
        if (act.s.Font.Angle === undefined) act.s.Font.Angle = 0;
        if (act.s.Font.Name === undefined) act.s.Font.Name = 'Calibri';
        if (act.s.Font.Height === undefined) act.s.Font.Height = 12;
        if (act.s.Font.Italic === undefined) act.s.Font.Italic = false;
        if (act.s.Font.Weight === undefined) act.s.Font.Weight = 400;
      }
      
      if (!act.s.Pen) {
        act.s.Pen = { Color: 0, Width: 1, Style: 0 };
      }
      if (!act.s.Brush) {
        act.s.Brush = { Color: 0xFFFFFF, Style: 0 };
      }
    }
  });
  
  // Call render_canvas
  wmf.render_canvas(actions, canvas);
  
  // Sanitize dimensions to prevent browser crashes or empty data URIs
  if (canvas.width > 2048) canvas.width = 2048;
  if (canvas.height > 2048) canvas.height = 2048;
  if (canvas.width <= 0) canvas.width = 300;
  if (canvas.height <= 0) canvas.height = 150;
}

interface ExamWizardProps {
  classes: ClassEntity[];
  examId?: number; // Optional prop for edit mode
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

export const ExamWizard: React.FC<ExamWizardProps> = ({ classes, examId, onClose, onSuccess }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  const getStepName = (s: number) => {
    if (examMode === 'online') {
      switch (s) {
        case 1: return "Basic Details";
        case 2: return "Subject Details";
        case 3: return "Section Details";
        case 4: return "Questions Setup";
        case 5: return "Review & Publish";
        case 6: return "Share Link";
        default: return "";
      }
    } else {
      switch (s) {
        case 1: return "Basic Details";
        case 2: return "Subject Details";
        case 3: return "Section Details";
        case 4: return "Answer Keys";
        case 5: return "Review & Publish";
        default: return "";
      }
    }
  };

  const getTotalSteps = () => {
    return examMode === 'online' ? 6 : 5;
  };

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

  // Online Exam Settings
  const [onlineStartsAt, setOnlineStartsAt] = useState(() => {
    const today = new Date();
    // Default start time to tomorrow at 10:00 AM
    today.setDate(today.getDate() + 1);
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T10:00`;
  });
  const [onlineDurationMins, setOnlineDurationMins] = useState(180);
  const [onlinePublishStatus, setOnlinePublishStatus] = useState<'draft' | 'published'>('draft');
  const [onlineLoginOption, setOnlineLoginOption] = useState<'roll_phone' | 'roll_email' | 'roll_only' | 'passcode'>('roll_phone');
  const [onlinePasscode, setOnlinePasscode] = useState('1234');

  // Online Questions Composer States
  const [questionsState, setQuestionsState] = useState<any[]>([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [questionSetupTab, setQuestionSetupTab] = useState<'manual' | 'csv' | 'library' | 'word' | 'pdf'>('manual');
  const [showAddedQuestionsModal, setShowAddedQuestionsModal] = useState(false);
  const [csvUploadSuccess, setCsvUploadSuccess] = useState<string | null>(null);

  // PDF AI Parser States
  const [isParsingPdf, setIsParsingPdf] = useState<boolean>(false);
  const [pdfParseError, setPdfParseError] = useState<string | null>(null);
  const [pdfParseStatus, setPdfParseStatus] = useState<string>('');

  // Word AI Parser States
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [geminiModel, setGeminiModel] = useState<string>(() => localStorage.getItem('gemini_model') || 'gemini-3.6-flash');
  const [isParsingWord, setIsParsingWord] = useState<boolean>(false);
  const [wordParseError, setWordParseError] = useState<string | null>(null);
  const [wordParseStatus, setWordParseStatus] = useState<string>('');
  const [parsedQuestions, setParsedQuestions] = useState<any[]>([]);
  const [selectedParsedIndexes, setSelectedParsedIndexes] = useState<Record<number, boolean>>({});

  // Library filters
  const [selectedLibBankId, setSelectedLibBankId] = useState<string>('All');
  const [libDifficultyFilter, setLibDifficultyFilter] = useState<string>('All');
  const [libSearchQuery, setLibSearchQuery] = useState<string>('');
  const [libraryQuestions, setLibraryQuestions] = useState<any[]>([]);
  const [libLoading, setLibLoading] = useState<boolean>(false);
  const [banksList, setBanksList] = useState<any[]>([]);

  // Success link states
  const [createdExamId, setCreatedExamId] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Step 2: Subject Details States
  const [rollNoDigits, setRollNoDigits] = useState(6);
  const [examSetsCount, setExamSetsCount] = useState(1);
  const [numSubjects, setNumSubjects] = useState(3);
  const [subjectsList, setSubjectsList] = useState<ExamSubject[]>([
    { name: 'Subject 1', numSections: 1 },
    { name: 'Subject 2', numSections: 1 },
    { name: 'Subject 3', numSections: 1 }
  ]);

  // Step 3: Section Details States
  const [sectionsList, setSectionsList] = useState<SectionState[]>([]);
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>('');
  const [selectedSectionName, setSelectedSectionName] = useState<string>('');

  React.useEffect(() => {
    if (sectionsList.length > 0 && (!selectedSubjectName || !selectedSectionName)) {
      setSelectedSubjectName(sectionsList[0].subjectName);
      setSelectedSectionName(sectionsList[0].sectionName);
    }
  }, [sectionsList]);

  // Step 4: Answer Keys (Tabbed by Set, e.g. "A", "B", "C", "D")
  const [activeSetTab, setActiveSetTab] = useState('A');
  const [answerKeys, setAnswerKeys] = useState<Record<string, Record<number, string>>>({
    'A': {},
    'B': {},
    'C': {},
    'D': {}
  });

  const isPlaceholderQuestion = (q: any): boolean => {
    if (!q) return true;
    const text = (q.questionText || '').trim();
    if (!text) return true;
    if (/^Question\s+\d+$/i.test(text) || text.includes(': Solve the given question') || text.includes('Question ')) return true;
    
    const isDefaultOptions = q.options.every((o: string) => {
      const val = o.trim();
      return !val || val === 'Option' || /^Option\s+[A-E](\s+description)?$/i.test(val);
    });
    if (isDefaultOptions) return true;

    return false;
  };

  React.useEffect(() => {
    if (!examId) return;

    const loadExamData = async () => {
      try {
        const exam = await db.exams.get(examId);
        if (!exam) return;

        setExamName(exam.title);
        setClassName(exam.className);
        setExamDate(exam.date);
        
        const isOnline = !!exam.startsAt;
        setExamMode(isOnline ? 'online' : 'offline');

        if (isOnline) {
          setOnlineStartsAt(exam.startsAt || '');
          setOnlineDurationMins(exam.durationMins || 180);
          setOnlinePublishStatus(exam.status === 'public' ? 'published' : 'draft');
          setOnlineLoginOption(exam.loginOption || 'roll_phone');
          setOnlinePasscode(exam.passcode || '1234');
        }

        setRollNoDigits(exam.rollNoDigits || (exam.numQuestions && exam.numQuestions > 100 ? 10 : 6));
        setExamSetsCount(exam.examSetsCount || 1);

        if (exam.subjects) {
          setNumSubjects(exam.subjects.length);
          setSubjectsList(exam.subjects);
        }

        if (exam.sections && exam.sections.length > 0) {
          const mappedSecs: SectionState[] = exam.sections.map(sec => ({
            subjectName: sec.subjectName,
            sectionName: sec.sectionName,
            qCount: sec.qCount,
            questionType: sec.questionType,
            correctMarks: sec.correctMarks,
            incorrectMarks: sec.incorrectMarks,
            allowPartialMarks: sec.allowPartialMarks || false,
            allowOptionalAttempts: sec.allowOptionalAttempts || false,
            maxAttempts: sec.maxAttempts || sec.qCount
          }));
          setSectionsList(mappedSecs);
        } else {
          // Synthesize default section matching the exam's numQuestions
          const defaultSec: SectionState = {
            subjectName: 'Subject 1',
            sectionName: 'Section A',
            qCount: exam.numQuestions || 10,
            questionType: '4 option',
            correctMarks: exam.correctMarks ?? 4,
            incorrectMarks: exam.incorrectMarks ?? -1,
            allowPartialMarks: false,
            allowOptionalAttempts: false,
            maxAttempts: exam.numQuestions || 10
          };
          setSectionsList([defaultSec]);
        }

        if (exam.answerKeys) {
          setAnswerKeys(exam.answerKeys);
        } else if (exam.answerKey) {
          setAnswerKeys({ 'A': exam.answerKey });
        }

        if (isOnline) {
          const qs = await db.questions.where('examId').equals(examId).toArray();
          const nonPlaceholders = qs.filter(q => !isPlaceholderQuestion(q));
          if (nonPlaceholders.length > 0) {
            let qCursor = 1;
            const sectionsWithRanges = (exam.sections || []).map(sec => {
              const start = qCursor;
              const end = qCursor + sec.qCount - 1;
              qCursor = end + 1;
              return { ...sec, qStart: start, qEnd: end };
            });

            const list = nonPlaceholders.map((qVal, idx) => {
              const qNum = idx + 1;
              const matchedSec = sectionsWithRanges.find(sec => qNum >= sec.qStart && qNum <= sec.qEnd);
              return {
                qNum: qNum,
                sectionName: qVal.sectionName || matchedSec?.sectionName || 'Section A',
                subjectName: qVal.subjectName || matchedSec?.subjectName || 'Subject 1',
                questionText: qVal.questionText,
                options: qVal.options,
                correctOptionIdx: qVal.correctOptionIdx,
                explanation: qVal.explanation || '',
                questionImage: qVal.questionImage || ''
              };
            });
            setQuestionsState(list);
          } else {
            setQuestionsState([]);
          }
        }
      } catch (err) {
        console.error("Failed to load exam details for editing:", err);
      }
    };

    loadExamData();
  }, [examId]);

  React.useEffect(() => {
    if (questionSetupTab !== 'library') return;

    const loadQuestionBank = async () => {
      setLibLoading(true);
      try {
        let results = await db.questionBank.toArray();
        if (selectedLibBankId !== 'All') {
          results = results.filter((q: any) => Number(q.bankId) === Number(selectedLibBankId));
        }

        if (libDifficultyFilter !== 'All') {
          results = results.filter((q: any) => q.difficulty === libDifficultyFilter);
        }
        if (libSearchQuery.trim()) {
          const lower = libSearchQuery.toLowerCase();
          results = results.filter((q: any) => 
            q.questionText.toLowerCase().includes(lower) || 
            q.options.some((o: string) => o.toLowerCase().includes(lower))
          );
        }

        setLibraryQuestions(results);
      } catch (err) {
        console.error("Error loading or indexing question bank:", err);
      } finally {
        setLibLoading(false);
      }
    };

    loadQuestionBank();
  }, [questionSetupTab, selectedLibBankId, libDifficultyFilter, libSearchQuery]);

  React.useEffect(() => {
    if (questionSetupTab !== 'library') return;
    db.questionBanks.toArray().then(setBanksList);
  }, [questionSetupTab]);

  React.useEffect(() => {
    if (step === 4 && questionSetupTab === 'manual') {
      const filtered = questionsState.filter(q => q.subjectName === selectedSubjectName && q.sectionName === selectedSectionName);
      if (filtered.length > 0) {
        const currentQ = questionsState[activeQuestionIndex];
        if (!currentQ || currentQ.subjectName !== selectedSubjectName || currentQ.sectionName !== selectedSectionName) {
          const globalIdx = questionsState.findIndex(q => q.subjectName === selectedSubjectName && q.sectionName === selectedSectionName);
          setActiveQuestionIndex(globalIdx !== -1 ? globalIdx : 0);
        }
      } else {
        setActiveQuestionIndex(-1);
      }
    }
  }, [selectedSubjectName, selectedSectionName, questionSetupTab, step, questionsState.length]);



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

    // Sync questionsState slots with configured sections and counts
    setQuestionsState(prev => {
      const updated: any[] = [];
      sectionsWithRanges.forEach(sec => {
        const existing = prev.filter(q => q.subjectName === sec.subjectName && q.sectionName === sec.sectionName);
        for (let i = 0; i < sec.qCount; i++) {
          const qNum = sec.qStart + i;
          if (existing[i]) {
            updated.push({
              ...existing[i],
              qNum,
              subjectName: sec.subjectName,
              sectionName: sec.sectionName
            });
          } else {
            updated.push({
              qNum,
              sectionName: sec.sectionName,
              subjectName: sec.subjectName,
              questionText: '',
              options: sec.questionType === '5 option' ? ['', '', '', '', ''] : ['', '', '', ''],
              correctOptionIdx: 0,
              explanation: '',
              questionImage: ''
            });
          }
        }
      });
      return updated.sort((a, b) => a.qNum - b.qNum);
    });

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

  const parseCsvRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(val => val.replace(/^"|"$/g, ''));
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return;

        const startIdx = lines[0].toLowerCase().includes('question') ? 1 : 0;
        const parsed: any[] = [];

        for (let i = startIdx; i < lines.length; i++) {
          const cols = parseCsvRow(lines[i]);
          if (cols.length < 5) continue;

          const qText = cols[0];
          const optA = cols[1] || '';
          const optB = cols[2] || '';
          const optC = cols[3] || '';
          const optD = cols[4] || '';
          const optE = cols[5] || '';
          
          let correctLetter = (cols[6] || 'A').toUpperCase().trim();
          let explanation = cols[7] || '';
          let secName = cols[8] || '';

          const optionIdx = ['A', 'B', 'C', 'D', 'E'].indexOf(correctLetter);
          const finalOptionIdx = optionIdx !== -1 ? optionIdx : 0;

          parsed.push({
            questionText: qText,
            options: optE ? [optA, optB, optC, optD, optE] : [optA, optB, optC, optD],
            correctOptionIdx: finalOptionIdx,
            explanation,
            sectionName: secName
          });
        }

        // Map sequentially to questionsState
        setQuestionsState(() => {
          const slots: any[] = [];
          sectionsWithRanges.forEach(sec => {
            for (let q = sec.qStart; q <= sec.qEnd; q++) {
              slots.push({
                qNum: q,
                sectionName: sec.sectionName,
                subjectName: sec.subjectName,
                questionText: '',
                options: sec.questionType === '5 option' ? ['', '', '', '', ''] : ['', '', '', ''],
                correctOptionIdx: 0,
                explanation: '',
                questionImage: ''
              });
            }
          });

          for (let idx = 0; idx < slots.length; idx++) {
            const csvQ = parsed[idx];
            if (csvQ) {
              slots[idx] = {
                ...slots[idx],
                questionText: csvQ.questionText,
                options: csvQ.options.length === slots[idx].options.length
                  ? csvQ.options
                  : slots[idx].options.map((orig: string, oIdx: number) => csvQ.options[oIdx] || orig),
                correctOptionIdx: csvQ.correctOptionIdx < slots[idx].options.length ? csvQ.correctOptionIdx : 0,
                explanation: csvQ.explanation
              };
            }
          }
          return slots;
        });

        setCsvUploadSuccess(`Successfully imported ${Math.min(parsed.length, questionsState.length)} questions!`);
      } catch (err) {
        alert('Failed to parse CSV file. Make sure columns align with: Question Text, Option A, Option B, Option C, Option D, Option E (optional), Correct Option (A/B/C/D/E), Explanation');
      }
    };
    reader.readAsText(file);
  };

  const handlePdfFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeBytes = 20 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setPdfParseError("File is too large. Please select a PDF file smaller than 20MB.");
      return;
    }

    if (!geminiApiKey.trim()) {
      setPdfParseError("Please provide a Gemini API Key to proceed.");
      return;
    }

    localStorage.setItem('gemini_api_key', geminiApiKey);
    localStorage.setItem('gemini_model', geminiModel);

    setIsParsingPdf(true);
    setPdfParseError(null);
    setPdfParseStatus("Reading PDF file...");
    setParsedQuestions([]);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64Data = (evt.target?.result as string).split(',')[1];
        if (!base64Data) {
          throw new Error("Failed to read PDF file binary data.");
        }

        setPdfParseStatus("Analyzing PDF structure and transcribing questions (this may take up to a minute)...");

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
        
        const systemPrompt = `You are an expert exam parser. Your job is to extract questions from the provided PDF document.
Identify all multiple choice questions (MCQs) in the document.
For each question:
1. Extract the question text.
2. Extract the options. If there are options like A, B, C, D, parse them. There must be exactly 4 or 5 options. If any options are missing, leave them as empty strings or reconstruct if logical.
3. Determine the correct option index (0-based, i.e., 0 for A, 1 for B, 2 for C, 3 for D). If not clearly indicated, choose the most likely correct answer or default to 0.
4. Provide a brief step-by-step explanation or solution if applicable.
5. Critical: Transcribe all mathematical expressions, equations, and physics formulas into clean inline LaTeX (enclosed in single '$', e.g. '$\\frac{9.8}{\\sqrt{2}}$' or '$g = 10 \\text{ m/s}^2$').
6. Critical: If the question refers to a diagram, graph, or pulley setup in the PDF, insert a placeholder tag '[Diagram Required: <short description>]' in the question text.

Return the result STRICTLY as a JSON array of objects with this structure (no other text, no markdown wrappers, just raw JSON array):
[
  {
    "questionText": "Question text here with LaTeX and optional [Diagram Required: description] tags",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctOptionIdx": 0,
    "explanation": "Explanation here"
  }
]`;

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: systemPrompt },
                  {
                    inlineData: {
                      mimeType: 'application/pdf',
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `API request failed with status ${response.status}`);
        }

        const resData = await response.json();
        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!rawText) {
          throw new Error("Gemini API returned an empty response. Verify your API key or the input PDF.");
        }

        let cleanedJson = rawText.trim();
        if (cleanedJson.startsWith("```")) {
          cleanedJson = cleanedJson.replace(/^```json/, "").replace(/```$/, "").trim();
        }

        const parsed = JSON.parse(cleanedJson);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error("No questions could be structured from the PDF contents. Make sure it contains clear text and questions.");
        }

        const initialIndexes: Record<number, boolean> = {};
        parsed.forEach((_, idx) => {
          initialIndexes[idx] = true;
        });
        setSelectedParsedIndexes(initialIndexes);
        setParsedQuestions(parsed);
        setPdfParseStatus(`Successfully parsed ${parsed.length} questions! Review and import them below.`);
      } catch (err: any) {
        console.error("PDF Parsing error:", err);
        setPdfParseError(err.message || "Failed to upload or parse PDF file.");
      } finally {
        setIsParsingPdf(false);
      }
    };
    reader.onerror = () => {
      setPdfParseError("Failed to read local file bytes.");
      setIsParsingPdf(false);
    };
    reader.readAsDataURL(file);
  };

  const handleWordFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!geminiApiKey.trim()) {
      setWordParseError("Please enter your Gemini API Key first.");
      return;
    }

    // Save key locally
    localStorage.setItem('gemini_api_key', geminiApiKey.trim());
    localStorage.setItem('gemini_model', geminiModel);

    setIsParsingWord(true);
    setWordParseError(null);
    setWordParseStatus("Reading document content...");
    setParsedQuestions([]);
    setSelectedParsedIndexes({});

    try {
      const reader = new FileReader();
      
      const fileLoaded = new Promise<ArrayBuffer>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
      });
      reader.readAsArrayBuffer(file);
      const arrayBuffer = await fileLoaded;

      setWordParseStatus("Extracting images and text formatting...");

      // Cache mapping to keep heavy base64 strings out of LLM inputs, preventing quota/token size overflows
      const imageMap: Record<string, string> = {};
      let imageCounter = 0;
      
      const options = {
        convertImage: mammoth.images.imgElement((image) => {
          return image.read("base64").then((imageBuffer) => {
            let base64Data = '';
            
            const contentType = (image.contentType || '').toLowerCase();
            const cleanBase64 = imageBuffer.replace(/\s/g, '');
            const isWmf = contentType.includes('wmf') || contentType.includes('metafile') ||
                          cleanBase64.startsWith('183Gmg') || cleanBase64.startsWith('183G');

            if (isWmf) {
              try {
                const binaryString = atob(cleanBase64);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const canvas = document.createElement('canvas');
                drawWmfSafely(bytes, canvas);
                if (canvas.width > 0 && canvas.height > 0) {
                  base64Data = canvas.toDataURL('image/png');
                } else {
                  throw new Error("Invalid canvas dimensions: " + canvas.width + "x" + canvas.height);
                }
              } catch (err) {
                console.error("Failed to convert WMF to PNG:", err);
                base64Data = `data:image/x-wmf;base64,${cleanBase64}`;
              }
            } else {
              base64Data = `data:${image.contentType};base64,${cleanBase64}`;
            }

            const refId = `img_ref_${imageCounter++}`;
            imageMap[refId] = base64Data;
            return {
              src: refId
            };
          });
        })
      };

      const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options);
      const htmlContent = result.value;

      if (!htmlContent.trim()) {
        throw new Error("No text or content could be parsed from the Word document.");
      }

      setWordParseStatus("Analyzing document structure...");

      // Split the document into lines/paragraphs/tables to chunk it safely
      const paragraphs = htmlContent.match(/<p[^>]*>.*?<\/p>|<table[^>]*>.*?<\/table>|<h\d[^>]*>.*?<\/h\d>/gi) || [htmlContent];
      
      const questionBlocks: string[][] = [];
      let currentBlock: string[] = [];
      
      paragraphs.forEach((p) => {
        // Strip HTML tags to verify plain text content
        const textContent = p.replace(/<[^>]+>/g, '').trim();
        // Check if paragraph starts with a question marker (e.g. Q1., 1., Q 1.)
        const isNewQuestion = /^(?:Q(?:uestion)?[\s\.]*\d+|\d+\s*[\.\)\-]\s*)/i.test(textContent);
        
        if (isNewQuestion && currentBlock.length > 0) {
          questionBlocks.push(currentBlock);
          currentBlock = [p];
        } else {
          currentBlock.push(p);
        }
      });
      if (currentBlock.length > 0) {
        questionBlocks.push(currentBlock);
      }

      // Group question blocks into chunks (12 questions per chunk to guarantee safe outputs/inputs)
      const questionChunks: string[] = [];
      const questionsPerChunk = 12;
      for (let i = 0; i < questionBlocks.length; i += questionsPerChunk) {
        const chunk = questionBlocks.slice(i, i + questionsPerChunk).map(block => block.join('\n')).join('\n');
        questionChunks.push(chunk);
      }

      const allParsed: any[] = [];
      const totalChunks = questionChunks.length;
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey.trim()}`;
      
      const systemPrompt = `You are a professional examiner. Extract all Multiple Choice Questions (MCQs) from the provided HTML document. 
Return ONLY a valid JSON array of objects representing the questions. Do not include any markdown styling, \`\`\`json blocks, or explanation text.
The JSON structure MUST follow this format strictly:
[
  {
    "questionText": "string containing question. If it contains formula, preserve LaTeX notation. If it contains a diagram like <img src=\\\"img_ref_0\\\" />, keep the exact image tag intact inside the text.",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctOptionIdx": number (0 for A, 1 for B, 2 for C, 3 for D)
  }
]

IMPORTANT IMAGE & FORMULA INSTRUCTIONS:
- You are provided with referenced images labeled as "img_ref_X".
- If a referenced image represents a mathematical equation, formula, variable, fraction, square root, or math symbol, you MUST transcribe it into LaTeX notation (enclosed in single $ for inline, e.g. $\\frac{9.8}{\\sqrt{2}}$ or $\\sqrt{3}$) and insert it directly into the text/option, completely replacing the corresponding <img src="img_ref_X" /> tag.
- If a referenced image is a diagram, illustration, graph, or physics experiment setup (e.g. blocks, pulleys, circuits, drawings), you MUST keep the exact <img src="img_ref_X" /> tag intact inside the text/option so it can render as an image.
- Verify that every question has exactly 4 options (unless it is a 5-option format, then 5 options).
- Find the correct answer key in the text (often marked as "Answer: A" or similar) and translate it to the 0-based index. If no answer is mentioned, default to 0.
- Do NOT alter the ref values inside the img tag src attributes (e.g., img_ref_0). Preserve them exactly where they were located in the questions.`;

      for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
        setWordParseStatus(`Processing questions ${cIdx * questionsPerChunk + 1} to ${Math.min((cIdx + 1) * questionsPerChunk, questionBlocks.length)} (${cIdx + 1} of ${totalChunks} chunks) with Gemini AI...`);
        
        const chunkHtml = questionChunks[cIdx];
        
        // Find all img_ref_X in this chunk
        const chunkImageRefs = Array.from(chunkHtml.matchAll(/img_ref_\d+/g)).map(m => m[0]);
        const uniqueRefs = Array.from(new Set(chunkImageRefs));
        
        const requestParts: any[] = [
          { text: systemPrompt }
        ];

        // Add each referenced image to the request parts
        uniqueRefs.forEach((refId) => {
          const base64Data = imageMap[refId];
          if (base64Data) {
            const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mimeType = match[1].toLowerCase();
              const rawData = match[2];
              
              // Only send supported formats to Gemini API (exclude wmf, emf, etc. that failed to convert)
              const supportedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
              if (supportedTypes.includes(mimeType)) {
                requestParts.push({ text: `Image reference for tag <img src="${refId}" />:\n` });
                requestParts.push({
                  inlineData: {
                    mimeType: mimeType,
                    data: rawData
                  }
                });
              } else {
                console.warn(`Skipping image reference ${refId} in Gemini request: unsupported MIME type "${mimeType}"`);
              }
            }
          }
        });

        // Add the HTML text as the final part
        requestParts.push({ text: `Here is the HTML document containing the questions:\n\n${chunkHtml}` });
        
        try {
          const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: requestParts
                }
              ],
              generationConfig: {
                responseMimeType: 'application/json'
              }
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `HTTP error! status: ${response.status}`);
          }

          const resData = await response.json();
          const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!rawText) {
            throw new Error("Gemini API returned an empty response. Verify your API key or the input text.");
          }

          let cleanedJson = rawText.trim();
          if (cleanedJson.startsWith("```")) {
            cleanedJson = cleanedJson.replace(/^```json/, "").replace(/```$/, "").trim();
          }

          const parsed = JSON.parse(cleanedJson);
          if (Array.isArray(parsed)) {
            allParsed.push(...parsed);
          }
        } catch (err: any) {
          console.warn(`Error parsing chunk ${cIdx + 1}:`, err);
          // If we have parsed some questions already, we will let them review what succeeded so far
          if (allParsed.length === 0) {
            throw err;
          } else {
            setWordParseError(`Partial failure at chunk ${cIdx + 1}: ${err.message || err}. Loaded ${allParsed.length} questions successfully.`);
            break;
          }
        }

        // Add short delay between requests to prevent hitting concurrent request rate limits
        await new Promise(r => setTimeout(r, 600));
      }

      if (allParsed.length === 0) {
        throw new Error("No questions could be successfully parsed from the document.");
      }

      setWordParseStatus("Restoring diagrams and formulas...");

      // Restore base64 source representations from cache
      const restoredQuestions = allParsed.map((q: any) => {
        let text = q.questionText || '';
        text = text.replace(/<img[^>]+src=["'](img_ref_\d+)["'][^>]*>/gi, (match: string, refId: string) => {
          const originalBase64 = imageMap[refId];
          return originalBase64 ? `<img src="${originalBase64}" />` : match;
        });

        const options = (q.options || []).map((opt: string) => {
          return opt.replace(/<img[^>]+src=["'](img_ref_\d+)["'][^>]*>/gi, (match: string, refId: string) => {
            const originalBase64 = imageMap[refId];
            return originalBase64 ? `<img src="${originalBase64}" />` : match;
          });
        });

        return {
          ...q,
          questionText: text,
          options
        };
      });

      setParsedQuestions(restoredQuestions);
      
      // Auto-select all by default
      const initialIndexes: Record<number, boolean> = {};
      restoredQuestions.forEach((_, idx) => {
        initialIndexes[idx] = true;
      });
      setSelectedParsedIndexes(initialIndexes);
      setWordParseStatus(`Successfully parsed ${restoredQuestions.length} questions! Review and import them below.`);
    } catch (err: any) {
      console.error(err);
      setWordParseError(err.message || "Failed to upload or parse MS Word file.");
    } finally {
      setIsParsingWord(false);
    }
  };

  const handleImportSelectedQuestions = () => {
    // Find current subject and section limits
    const sectionConfig = sectionsList.find(s => s.subjectName === selectedSubjectName && s.sectionName === selectedSectionName);
    if (!sectionConfig) return;

    const maxCount = sectionConfig.qCount;
    const currentSectionQuestions = questionsState.filter(q => q.subjectName === selectedSubjectName && q.sectionName === selectedSectionName);
    const existingCount = currentSectionQuestions.filter(q => q.questionText.trim()).length;

    // Filter only selected parsed questions
    const toImport = parsedQuestions.filter((_, idx) => selectedParsedIndexes[idx]);
    if (toImport.length === 0) {
      alert("No questions selected for import.");
      return;
    }

    if (existingCount + toImport.length > maxCount) {
      if (!window.confirm(`⚠️ Warning: You are trying to import ${toImport.length} questions, but this section has a limit of ${maxCount} total questions. (Currently filled: ${existingCount}/${maxCount}). Do you want to proceed and clip the imports to fit the limit?`)) {
        return;
      }
    }

    setQuestionsState(prev => {
      const synced: any[] = [];
      sectionsWithRanges.forEach(sec => {
        const existing = prev.filter(q => q.subjectName === sec.subjectName && q.sectionName === sec.sectionName);
        for (let i = 0; i < sec.qCount; i++) {
          const qNum = sec.qStart + i;
          if (existing[i]) {
            synced.push({
              ...existing[i],
              qNum,
              subjectName: sec.subjectName,
              sectionName: sec.sectionName
            });
          } else {
            synced.push({
              qNum,
              sectionName: sec.sectionName,
              subjectName: sec.subjectName,
              questionText: '',
              options: sec.questionType === '5 option' ? ['', '', '', '', ''] : ['', '', '', ''],
              correctOptionIdx: 0,
              explanation: '',
              questionImage: ''
            });
          }
        }
      });
      const updated = synced.sort((a, b) => a.qNum - b.qNum);
      let importCount = 0;

      // Find indices in the global questionsState corresponding to the active subject and section
      const sectionIndices = updated
        .map((q, idx) => ({ q, idx }))
        .filter(item => item.q.subjectName === selectedSubjectName && item.q.sectionName === selectedSectionName);

      for (let i = 0; i < sectionIndices.length; i++) {
        if (importCount >= toImport.length) break;

        const targetIdx = sectionIndices[i].idx;
        const importedQ = toImport[importCount];
        updated[targetIdx].questionText = importedQ.questionText;
        
        // Make sure options matches the expected count
        const nextOpts = [...updated[targetIdx].options];
        for (let o = 0; o < nextOpts.length; o++) {
          nextOpts[o] = importedQ.options[o] || '';
        }
        updated[targetIdx].options = nextOpts;
        updated[targetIdx].correctOptionIdx = typeof importedQ.correctOptionIdx === 'number' ? importedQ.correctOptionIdx : 0;
        updated[targetIdx].explanation = importedQ.explanation || '';
        
        // Handle images if any are inside the question text
        const imgMatch = importedQ.questionText.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch && imgMatch[1]) {
          updated[targetIdx].questionImage = imgMatch[1];
          // Remove the raw img tag from text so it renders cleanly via our existing UI questionImage rendering
          updated[targetIdx].questionText = importedQ.questionText.replace(/<img[^>]+>/g, '').trim();
        } else {
          updated[targetIdx].questionImage = '';
        }

        importCount++;
      }

      alert(`Successfully imported ${importCount} questions into section ${selectedSectionName}!`);
      return updated;
    });

    // Reset Word Import View
    setParsedQuestions([]);
    setSelectedParsedIndexes({});
    setWordParseStatus('');
    // Go to manual view to see imported results
    setQuestionSetupTab('manual');
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

      // Generate default answerKey from multi-set or questionsState
      let defaultAnswerKey: Record<number, string> = {};
      if (examMode === 'online') {
        questionsState.forEach((q, idx) => {
          defaultAnswerKey[idx + 1] = ['A', 'B', 'C', 'D', 'E'][q.correctOptionIdx] || 'A';
        });
      } else {
        defaultAnswerKey = answerKeys['A'] || {};
      }

      // Generate answerKeys map
      const finalAnswerKeys: Record<string, Record<number, string>> = {};
      if (examMode === 'online') {
        finalAnswerKeys['A'] = defaultAnswerKey;
      } else {
        const sets = Array.from({ length: examSetsCount }).map((_, i) => String.fromCharCode(65 + i));
        sets.forEach(setName => {
          finalAnswerKeys[setName] = answerKeys[setName] || {};
        });
      }

      let finalExamId = examId;
      if (examId) {
        await db.exams.update(examId, {
          title: examName,
          className,
          date: examDate,
          status: examMode === 'online' && onlinePublishStatus === 'published' ? 'public' : 'private',
          numQuestions: totalQuestions,
          answerKey: defaultAnswerKey,
          correctMarks: sectionsList[0]?.correctMarks ?? 4,
          incorrectMarks: sectionsList[0]?.incorrectMarks ?? -1,
          unansweredMarks: 0,
          rollNoDigits,
          examSetsCount: examMode === 'online' ? 1 : examSetsCount,
          subjects: finalSubjects,
          sections: finalSections,
          answerKeys: finalAnswerKeys,
          startsAt: examMode === 'online' ? onlineStartsAt : undefined,
          durationMins: examMode === 'online' ? onlineDurationMins : undefined,
          loginOption: examMode === 'online' ? onlineLoginOption : undefined,
          passcode: (examMode === 'online' && onlineLoginOption === 'passcode') ? onlinePasscode : undefined
        });
      } else {
        finalExamId = await db.exams.add({
          title: examName,
          className,
          date: examDate,
          status: examMode === 'online' && onlinePublishStatus === 'published' ? 'public' : 'private',
          numQuestions: totalQuestions,
          answerKey: defaultAnswerKey,
          correctMarks: sectionsList[0]?.correctMarks ?? 4,
          incorrectMarks: sectionsList[0]?.incorrectMarks ?? -1,
          unansweredMarks: 0,
          rollNoDigits,
          examSetsCount: examMode === 'online' ? 1 : examSetsCount,
          subjects: finalSubjects,
          sections: finalSections,
          answerKeys: finalAnswerKeys,
          startsAt: examMode === 'online' ? onlineStartsAt : undefined,
          durationMins: examMode === 'online' ? onlineDurationMins : undefined,
          loginOption: examMode === 'online' ? onlineLoginOption : undefined,
          passcode: (examMode === 'online' && onlineLoginOption === 'passcode') ? onlinePasscode : undefined,
          createdAt: new Date()
        });
      }

      // Sync exam record to Hostinger MySQL
      if (finalExamId) {
        const savedExam = await db.exams.get(finalExamId);
        if (savedExam) {
          try {
            await syncExamToCloud(savedExam);
          } catch (err) {
            console.warn("MySQL exam sync warning:", err);
          }
        }
      }
      pullCloudUpdatesToIndexedDB();

      // Write questions if online
      if (examMode === 'online' && finalExamId) {
        // If edit mode, delete old questions first to ensure clean state
        if (examId) {
          await db.questions.where('examId').equals(examId).delete();
        }

        const questionRecords = questionsState.map((q) => ({
          examId: finalExamId,
          subjectName: q.subjectName,
          sectionName: q.sectionName,
          questionText: q.questionText || '',
          options: q.options.map((opt: string) => opt || ''),
          correctOptionIdx: q.correctOptionIdx,
          explanation: q.explanation || '',
          questionImage: q.questionImage || undefined
        }));
        await db.questions.bulkAdd(questionRecords);

        // Sync questions to Hostinger MySQL
        try {
          await fetch('/api/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ examId: finalExamId, questions: questionRecords })
          });
        } catch (err) {
          console.warn("MySQL questions sync warning:", err);
        }

        // Advance to step 6 for online links sharing!
        setCreatedExamId(finalExamId);
        setStep(6);
      } else if (finalExamId) {
        onSuccess(finalExamId);
      }
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
      // Validate question counts
      for (const sec of sectionsList) {
        if (sec.qCount <= 0) {
          alert('Each section must have at least 1 question.');
          return;
        }
      }

      if (examMode === 'online') {
        setActiveQuestionIndex(0);
        setCsvUploadSuccess(null);
      }
      handleGoToStep4();
    } else if (step === 4) {
      setStep(5);
    } else if (step === 5) {
      handleSubmit();
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep((step - 1) as any);
    }
  };

  const isLibraryTab = questionSetupTab === 'library' && step === 4;

  return (
    <div className="wizard-overlay animate-fade-in">
      <div className="wizard-container" style={isLibraryTab ? { width: '1200px', maxWidth: '96vw', height: '90vh' } : {}}>
        
        {/* Wizard Header */}
        <header className="wizard-header">
          <div className="wizard-breadcrumb">Exams / <strong>{examId ? "Edit exam" : "Create exam"}</strong></div>
          <button className="btn-close-icon" onClick={onClose} title="Cancel">
            <X size={18} />
          </button>
        </header>

        {/* Stepper Progress Bar (Displays only active step at the top for clean mobile layout) */}
        <div className="wizard-stepper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6px 16px', background: '#f8fafc', borderBottom: '1px solid #edf2f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--primary)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '0.8rem'
            }}>
              {step}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
              <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Step {step} of {getTotalSteps()}
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                {getStepName(step)}
              </span>
            </div>
          </div>
        </div>

        {/* Wizard Form Content */}
        <div className="wizard-body">
          
          {/* STEP 1: BASIC DETAILS */}
          {step === 1 && (
            <div className="wizard-step-content animate-fade-in" style={{ paddingRight: '4px' }}>
              <div className="form-row-three">
                
                {/* Class Name */}
                <div className="floating-field">
                  <label>Class Name</label>
                  <select value={className} onChange={(e) => setClassName(e.target.value)}>
                    {classes.length === 0 ? (
                      <option value="">-- No Classes Created Yet --</option>
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
              <div className="exam-mode-group" style={{ marginBottom: '20px', textAlign: 'left' }}>
                <label className="mode-title-lbl" style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-muted)' }}>EXAM MODE *</label>
                <div className="checkbox-row" style={{ display: 'flex', gap: '24px', marginTop: '8px' }}>
                  <label className="chk-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>
                    <input 
                      type="radio" 
                      name="examMode"
                      checked={examMode === 'offline'} 
                      onChange={() => setExamMode('offline')}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Offline (OMR Sheet)</span>
                  </label>
                  <label className="chk-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>
                    <input 
                      type="radio" 
                      name="examMode"
                      checked={examMode === 'online'} 
                      onChange={() => setExamMode('online')}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Online Exam Portal</span>
                  </label>
                </div>
              </div>

              {/* Detailed settings for Online Exam */}
              {examMode === 'online' && (
                <div className="online-details-card glass-card animate-fade-in" style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  textAlign: 'left'
                }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', letterSpacing: '0.5px' }}>ONLINE EXAM PARAMETERS</h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    {/* Starts At (Schedule Test) */}
                    <div className="floating-field">
                      <label>Schedule Start Date & Time *</label>
                      <input 
                        type="datetime-local" 
                        value={onlineStartsAt} 
                        onChange={(e) => setOnlineStartsAt(e.target.value)} 
                        required
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Test Duration (Minutes) */}
                    <div className="floating-field">
                      <label>Test Duration (Minutes) *</label>
                      <input 
                        type="number" 
                        min={10} 
                        max={600} 
                        value={onlineDurationMins} 
                        onChange={(e) => setOnlineDurationMins(Number(e.target.value))} 
                        required
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    {/* Login Option */}
                    <div className="floating-field">
                      <label>Select Login Option *</label>
                      <select value={onlineLoginOption} onChange={(e) => setOnlineLoginOption(e.target.value as any)} style={{ width: '100%', boxSizing: 'border-box' }}>
                        <option value="roll_phone">Roll Number + Mobile Number</option>
                        <option value="roll_email">Roll Number + Email Address</option>
                        <option value="roll_only">Roll Number Only</option>
                        <option value="passcode">Roll Number + Exam Passcode</option>
                      </select>
                    </div>

                    {/* Publish Status (Published/Draft) */}
                    <div className="floating-field">
                      <label>Exam Status *</label>
                      <select value={onlinePublishStatus} onChange={(e) => setOnlinePublishStatus(e.target.value as any)} style={{ width: '100%', boxSizing: 'border-box' }}>
                        <option value="draft">Draft (Private)</option>
                        <option value="published">Published (Public)</option>
                      </select>
                    </div>
                  </div>

                  {/* Passcode input field if passcode login is selected */}
                  {onlineLoginOption === 'passcode' && (
                    <div className="floating-field animate-scale-up" style={{ maxWidth: '240px' }}>
                      <label>Exam Passcode *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 1234"
                        value={onlinePasscode}
                        onChange={(e) => setOnlinePasscode(e.target.value)}
                        required
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                </div>
              )}
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
                    <button type="button" className="btn-count-dec" onClick={() => setRollNoDigits(prev => Math.max(2, prev - 1))}>-</button>
                    <span className="counter-val">{rollNoDigits}</span>
                    <button type="button" className="btn-count-inc" onClick={() => setRollNoDigits(prev => Math.min(15, prev + 1))}>+</button>
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
            <div className="wizard-step-content animate-fade-in" style={{ paddingRight: '4px' }}>
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
                                {Array.from({ length: 200 }).map((_, i) => (
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

          {/* STEP 4: ANSWER KEYS OR QUESTIONS SETUP */}
          {step === 4 && (
            <>
              {examMode === 'offline' ? (
                <div className="wizard-step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>

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

                          <div className="key-grid-scroll" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
                            gap: '8px',
                            maxHeight: '320px',
                            overflowY: 'auto',
                            padding: '4px'
                          }}>
                            {Array.from({ length: sec.qCount }).map((_, qIdx) => {
                              const qNum = sec.qStart + qIdx;
                              const options = sec.questionType === '5 option' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
                              const currentKey = answerKeys[activeSetTab]?.[qNum] || 'A';

                              return (
                                <div key={`wiz-key-${qNum}`} className="key-row-item" style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '6px 10px',
                                  gap: '6px'
                                }}>
                                  <span className="q-label-number" style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', width: '32px' }}>Q{String(qNum).padStart(2, '0')}</span>
                                  <div className="opt-bubble-row" style={{ display: 'flex', gap: '4px' }}>
                                    {options.map(opt => (
                                      <button
                                        key={`wiz-opt-${qNum}-${opt}`}
                                        className={`wiz-opt-btn ${currentKey === opt ? 'active' : ''}`}
                                        onClick={() => handleOptionSelect(activeSetTab, qNum, opt)}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '50%',
                                          border: 'none',
                                          background: currentKey === opt ? '#008726' : '#f1f5f9',
                                          color: currentKey === opt ? '#ffffff' : '#475569',
                                          fontWeight: 800,
                                          fontSize: '0.82rem',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          boxShadow: currentKey === opt ? '0 2px 4px rgba(0, 135, 38, 0.3)' : 'none'
                                        }}
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
              ) : (
                /* ONLINE MODE QUESTIONS WORKSPACE */
                <div className="wizard-step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Setup Options Header tabs */}
                  <div className="qsetup-tabs-header">
                    <div className="qsetup-tabs-group">
                      <button 
                        className={`btn-seed ${questionSetupTab === 'manual' ? 'active-tab' : ''}`} 
                        onClick={() => setQuestionSetupTab('manual')}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', background: questionSetupTab === 'manual' ? 'var(--primary)' : '#fff', color: questionSetupTab === 'manual' ? '#fff' : '#4a5568', fontSize: '0.85rem', fontWeight: 'bold' }}
                      >
                        Add Manually
                      </button>
                      <button 
                        className={`btn-seed ${questionSetupTab === 'csv' ? 'active-tab' : ''}`} 
                        onClick={() => setQuestionSetupTab('csv')}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', background: questionSetupTab === 'csv' ? 'var(--primary)' : '#fff', color: questionSetupTab === 'csv' ? '#fff' : '#4a5568', fontSize: '0.85rem', fontWeight: 'bold' }}
                      >
                        Import CSV
                      </button>
                      <button 
                        className={`btn-seed ${questionSetupTab === 'library' ? 'active-tab' : ''}`} 
                        onClick={() => setQuestionSetupTab('library')}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', background: questionSetupTab === 'library' ? 'var(--primary)' : '#fff', color: questionSetupTab === 'library' ? '#fff' : '#4a5568', fontSize: '0.85rem', fontWeight: 'bold' }}
                      >
                        Question Bank
                      </button>
                       <button 
                        className={`btn-seed ${questionSetupTab === 'word' ? 'active-tab' : ''}`} 
                        onClick={() => setQuestionSetupTab('word')}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', background: questionSetupTab === 'word' ? 'var(--primary)' : '#fff', color: questionSetupTab === 'word' ? '#fff' : '#4a5568', fontSize: '0.85rem', fontWeight: 'bold' }}
                      >
                        Import MS Word (AI)
                      </button>
                      <button 
                        className={`btn-seed ${questionSetupTab === 'pdf' ? 'active-tab' : ''}`} 
                        onClick={() => setQuestionSetupTab('pdf')}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', background: questionSetupTab === 'pdf' ? 'var(--primary)' : '#fff', color: questionSetupTab === 'pdf' ? '#fff' : '#4a5568', fontSize: '0.85rem', fontWeight: 'bold' }}
                      >
                        Import PDF (AI)
                      </button>
                    </div>

                    <div className="qsetup-stats-group">
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Questions Added: <strong>{questionsState.filter(q => q.questionText.trim()).length} / {totalQuestions}</strong>
                      </div>
                      {questionSetupTab === 'library' && (
                        <button
                          type="button"
                          onClick={() => setShowAddedQuestionsModal(true)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--primary)',
                            background: 'transparent',
                            color: 'var(--primary)',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          View Added Questions
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Subject & Section Selectors */}
                  {sectionsList.length > 0 && (
                    <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#f8fafc', textAlign: 'left' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>SELECT SUBJECT</span>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {Array.from(new Set(sectionsList.map(s => s.subjectName))).map((sub, sIdx) => {
                            const isActive = selectedSubjectName === sub;
                            return (
                              <button
                                key={`sub-tab-${sIdx}`}
                                type="button"
                                onClick={() => {
                                  setSelectedSubjectName(sub);
                                  const firstSec = sectionsList.find(s => s.subjectName === sub);
                                  if (firstSec) {
                                    setSelectedSectionName(firstSec.sectionName);
                                  }
                                }}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: '6px',
                                  border: isActive ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                  background: isActive ? 'var(--primary)' : '#fff',
                                  color: isActive ? '#fff' : 'var(--text-secondary)',
                                  fontWeight: 'bold',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {sub}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>SELECT SECTION</span>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {sectionsList.filter(s => s.subjectName === selectedSubjectName).map((sec, sIdx) => {
                            const isActive = selectedSectionName === sec.sectionName;
                            const count = questionsState.filter(q => q.subjectName === selectedSubjectName && q.sectionName === sec.sectionName && q.questionText.trim()).length;
                            return (
                              <button
                                key={`sec-tab-${sIdx}`}
                                type="button"
                                onClick={() => setSelectedSectionName(sec.sectionName)}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: '6px',
                                  border: isActive ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                  background: isActive ? 'rgba(16, 88, 202, 0.08)' : '#fff',
                                  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                                  fontWeight: 'bold',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span>{sec.sectionName}</span>
                                <span style={{
                                  fontSize: '0.65rem',
                                  background: isActive ? 'var(--primary)' : '#e2e8f0',
                                  color: isActive ? '#fff' : 'var(--text-secondary)',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                  fontWeight: 'bold'
                                }}>
                                  {count} / {sec.qCount}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {questionSetupTab === 'manual' ? (
                    /* Manual entry split layout */
                    <div className="manual-entry-split-layout">
                      
                      {/* Left list panel */}
                      <div className="manual-entry-left-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const sectionConfig = sectionsWithRanges.find(sec => sec.subjectName === selectedSubjectName && sec.sectionName === selectedSectionName);
                            const qStart = sectionConfig ? sectionConfig.qStart : 1;
                            const qEnd = sectionConfig ? sectionConfig.qEnd : 15;
                            const qCount = sectionConfig ? sectionConfig.qCount : 15;

                            const sectionQs = questionsState.filter(q => q.subjectName === selectedSubjectName && q.sectionName === selectedSectionName);
                            if (sectionQs.length >= qCount) {
                              alert(`Cannot add more questions. This section is limited to ${qCount} questions.`);
                              return;
                            }

                            setQuestionsState(prev => {
                              const existingQNums = new Set(sectionQs.map(q => q.qNum));
                              let nextQNum = qStart;
                              while (existingQNums.has(nextQNum) && nextQNum <= qEnd) {
                                nextQNum++;
                              }

                              const newQ = {
                                qNum: nextQNum,
                                sectionName: selectedSectionName,
                                subjectName: selectedSubjectName,
                                questionText: '',
                                options: sectionConfig?.questionType === '5 option' ? ['', '', '', '', ''] : ['', '', '', ''],
                                correctOptionIdx: 0,
                                explanation: '',
                                questionImage: ''
                              };
                              const updated = [...prev, newQ].sort((a, b) => a.qNum - b.qNum);
                              const globalIdx = updated.findIndex(q => q.qNum === nextQNum);
                              setActiveQuestionIndex(globalIdx !== -1 ? globalIdx : 0);
                              return updated;
                            });
                          }}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px dashed var(--primary)',
                            background: '#fff',
                            color: 'var(--primary)',
                            fontWeight: 'bold',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            textAlign: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            marginBottom: '8px'
                          }}
                        >
                          + Add Question
                        </button>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
                          {questionsState.filter(q => q.subjectName === selectedSubjectName && q.sectionName === selectedSectionName).map((q) => {
                            const isFilled = q.questionText.trim().length > 0;
                            const globalIdx = questionsState.findIndex(qs => qs.qNum === q.qNum);
                            const isActive = globalIdx === activeQuestionIndex;
                            return (
                              <button
                                key={`q-list-btn-${q.qNum}`}
                                onClick={() => setActiveQuestionIndex(globalIdx)}
                                className={`manual-entry-q-btn ${isActive ? 'active' : ''}`}
                                style={{
                                  border: isActive ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                                  background: isActive ? 'rgba(16, 88, 202, 0.08)' : '#fff',
                                  color: isActive ? 'var(--primary)' : '#4a5568',
                                  fontWeight: isActive ? 'bold' : 'normal',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                              >
                                <span>Q {q.qNum}</span>
                                {isFilled && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#48bb78' }} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Editor panel */}
                      {questionsState.filter(q => q.subjectName === selectedSubjectName && q.sectionName === selectedSectionName).length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '40px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)', minHeight: '300px' }}>
                          No questions added to this section yet. Click "+ Add Question" on the left to start.
                        </div>
                      ) : questionsState[activeQuestionIndex] && (() => {
                        const q = questionsState[activeQuestionIndex];
                        return (
                          <div className="manual-entry-right-panel">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #edf2f7' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                                {q.subjectName.toUpperCase()} - {q.sectionName.toUpperCase()}
                              </span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Question {q.qNum} of {totalQuestions}</span>
                            </div>

                            {/* Question Text */}
                            <div className="floating-field">
                              <label>Question Text *</label>
                              <textarea
                                value={q.questionText}
                                onChange={(e) => {
                                  setQuestionsState(prev => {
                                    const updated = [...prev];
                                    updated[activeQuestionIndex].questionText = e.target.value;
                                    return updated;
                                  });
                                }}
                                onPaste={(e) => {
                                  const items = e.clipboardData?.items;
                                  if (items) {
                                    for (let i = 0; i < items.length; i++) {
                                      if (items[i].type.indexOf('image') !== -1) {
                                        const file = items[i].getAsFile();
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onloadend = () => {
                                            setQuestionsState(prev => {
                                              const updated = [...prev];
                                              updated[activeQuestionIndex].questionImage = reader.result as string;
                                              return updated;
                                            });
                                          };
                                          reader.readAsDataURL(file);
                                          e.preventDefault();
                                        }
                                      }
                                    }
                                  }
                                }}
                                placeholder="Enter question description... Use $...$ for inline math (e.g. $E=mc^2$) or $$...$$ for block formulas. You can also directly paste an image (Ctrl+V) from screenshots or Word here."
                                style={{ width: '100%', minHeight: '60px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box', fontSize: '0.9rem' }}
                                required
                              />
                              {q.questionText.trim() && (
                                <div style={{ marginTop: '6px', padding: '8px 12px', background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: '6px', fontSize: '0.85rem' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>LIVE PREVIEW</span>
                                  <MathRenderer text={q.questionText} />
                                </div>
                              )}
                            </div>

                            {/* Options A-E input fields */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>OPTIONS & CORRECT ANSWER</span>
                              {q.options.map((optValue: string, optIdx: number) => {
                                const letter = ['A', 'B', 'C', 'D', 'E'][optIdx];
                                const isCorrect = q.correctOptionIdx === optIdx;
                                return (
                                  <div key={`opt-field-${optIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setQuestionsState(prev => {
                                            const updated = [...prev];
                                            updated[activeQuestionIndex].correctOptionIdx = optIdx;
                                            return updated;
                                          });
                                        }}
                                        style={{
                                          width: '28px',
                                          height: '28px',
                                          borderRadius: '50%',
                                          border: isCorrect ? '2px solid #48bb78' : '1px solid var(--border-color)',
                                          background: isCorrect ? '#48bb78' : '#fff',
                                          color: isCorrect ? '#fff' : '#718096',
                                          fontWeight: 'bold',
                                          fontSize: '0.8rem',
                                          cursor: 'pointer',
                                          flexShrink: 0
                                        }}
                                      >
                                        {letter}
                                      </button>
                                      <input
                                        type="text"
                                        placeholder={`Option ${letter} value... (use $...$ for formulas)`}
                                        value={optValue}
                                        onChange={(e) => {
                                          setQuestionsState(prev => {
                                            const updated = [...prev];
                                            const nextOpts = [...updated[activeQuestionIndex].options];
                                            nextOpts[optIdx] = e.target.value;
                                            updated[activeQuestionIndex].options = nextOpts;
                                            return updated;
                                          });
                                        }}
                                        style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                                      />
                                    </div>
                                    {optValue.trim() && (optValue.includes('$') || optValue.includes('$$')) && (
                                      <div style={{ marginLeft: '38px', fontSize: '0.8rem', color: '#4a5568' }}>
                                        <MathRenderer text={optValue} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Explanation */}
                            <div className="floating-field">
                              <label>Explanation / Rationale (Optional)</label>
                              <textarea
                                value={q.explanation}
                                onChange={(e) => {
                                  setQuestionsState(prev => {
                                    const updated = [...prev];
                                    updated[activeQuestionIndex].explanation = e.target.value;
                                    return updated;
                                  });
                                }}
                                placeholder="Explain correct answer logic..."
                                style={{ width: '100%', minHeight: '50px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box', fontSize: '0.85rem' }}
                              />
                              {q.explanation.trim() && (
                                <div style={{ marginTop: '6px', padding: '8px 12px', background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: '6px', fontSize: '0.85rem' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>EXPLANATION PREVIEW</span>
                                  <MathRenderer text={q.explanation} />
                                </div>
                              )}
                            </div>

                            {/* Upload Image (Base64) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>ATTACH QUESTION IMAGE</span>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <label style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 16px',
                                  borderRadius: '6px',
                                  border: '1px dashed var(--border-color)',
                                  background: '#f8fafc',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                  color: 'var(--text-secondary)'
                                }}>
                                  <Upload size={16} /> Choose Image File
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                          setQuestionsState(prev => {
                                            const updated = [...prev];
                                            updated[activeQuestionIndex].questionImage = reader.result as string;
                                            return updated;
                                          });
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  />
                                </label>
                                {q.questionImage && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <img 
                                      src={q.questionImage} 
                                      alt="Preview" 
                                      style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)' }} 
                                    />
                                    <button 
                                      type="button" 
                                      onClick={() => {
                                        setQuestionsState(prev => {
                                          const updated = [...prev];
                                          updated[activeQuestionIndex].questionImage = '';
                                          return updated;
                                        });
                                      }}
                                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--error)', fontSize: '0.75rem', fontWeight: 'bold' }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })()}
                    </div>
                  ) : questionSetupTab === 'csv' ? (
                    /* CSV Upload Drop-zone */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', alignItems: 'center', flex: 1, border: '2px dashed var(--border-color)', borderRadius: '12px', background: '#f8fafc', padding: '24px', boxSizing: 'border-box' }}>
                      <div style={{ background: 'rgba(16,88,202,0.08)', padding: '16px', borderRadius: '50%', color: 'var(--primary)' }}>
                        <FileText size={36} />
                      </div>
                      
                      <div style={{ textAlign: 'center' }}>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 'bold' }}>Import CSV Question File</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '360px', lineHeight: '1.4' }}>
                          Upload a comma-separated CSV file containing questions. Rows will be mapped sequentially to subjects and sections.
                        </p>
                      </div>

                      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', width: '100%', maxWidth: '400px', fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'left', lineHeight: '1.4' }}>
                        <strong>Required Columns Header:</strong><br />
                        <code style={{ fontSize: '0.7rem', display: 'block', background: '#f1f5f9', padding: '6px', borderRadius: '4px', marginTop: '4px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                          Question Text, Option A, Option B, Option C, Option D, Option E, Correct Option (A/B/C/D/E), Explanation, Section Name
                        </code>
                      </div>

                      <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        borderRadius: '6px',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}>
                        <Upload size={16} /> Choose CSV File
                        <input 
                          type="file" 
                          accept=".csv" 
                          style={{ display: 'none' }} 
                          onChange={handleCsvUpload} 
                        />
                      </label>

                      {csvUploadSuccess && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#48bb78', fontWeight: 'bold', background: 'rgba(72,187,120,0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(72,187,120,0.2)' }}>
                          <Check size={16} />
                          {csvUploadSuccess}
                        </div>
                      )}
                    </div>
                  ) : questionSetupTab === 'word' ? (
                    /* MS Word AI Parser Panel */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, padding: '16px', boxSizing: 'border-box' }}>
                      {/* Configuration block */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ background: '#eff6ff', padding: '6px', borderRadius: '8px', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            🔑
                          </span>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#1e293b' }}>Gemini API Key Configuration</h4>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              Required for AI question paper extraction. Obtain a free key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 'bold', textDecoration: 'underline' }}>Google AI Studio</a>.
                            </span>
                          </div>
                        </div>
                        <input
                          type="password"
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          placeholder="Paste your AI Studio API Key here..."
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', outline: 'none', background: '#ffffff', color: '#0f172a', fontWeight: 'bold' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Model Version:</span>
                          <select
                            value={geminiModel}
                            onChange={(e) => setGeminiModel(e.target.value)}
                            style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#fff', color: '#1e293b', fontWeight: 'bold' }}
                          >
                            <option value="gemini-3.6-flash">Gemini 3.6 Flash (Recommended / New Stable)</option>
                            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Stable)</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Legacy / Restricted to older keys)</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro (Advanced Reasoning / High Accuracy)</option>
                          </select>
                        </div>
                      </div>

                      {/* Upload zone */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', alignItems: 'center', flex: 1, border: '2px dashed var(--border-color)', borderRadius: '12px', background: '#f8fafc', padding: '30px', boxSizing: 'border-box' }}>
                        <div style={{ background: 'rgba(37,99,235,0.08)', padding: '18px', borderRadius: '50%', color: '#2563eb' }}>
                          <FileText size={40} />
                        </div>
                        
                        <div style={{ textAlign: 'center' }}>
                          <h4 style={{ margin: '0 0 6px 0', fontSize: '1.02rem', fontWeight: 800, color: '#1e293b' }}>Import Word (.docx) Question Paper</h4>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', maxWidth: '400px', lineHeight: '1.4' }}>
                            Upload a MS Word document containing text, math formatting, and embedded diagrams. Gemini AI will structure the paper into online exam questions.
                          </p>
                        </div>

                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '11px 22px',
                          borderRadius: '8px',
                          background: geminiApiKey.trim() ? '#2563eb' : '#94a3b8',
                          color: '#fff',
                          fontWeight: 'bold',
                          cursor: geminiApiKey.trim() ? 'pointer' : 'not-allowed',
                          fontSize: '0.88rem',
                          boxShadow: '0 2px 4px rgba(37,99,235,0.1)'
                        }}>
                          <Upload size={16} /> Choose Word File
                          {geminiApiKey.trim() && (
                            <input 
                              type="file" 
                              accept=".docx" 
                              style={{ display: 'none' }} 
                              onChange={handleWordFileUpload}
                              disabled={isParsingWord}
                            />
                          )}
                        </label>

                        {isParsingWord && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>
                            <div style={{ width: '16px', height: '16px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <span>{wordParseStatus}</span>
                          </div>
                        )}

                        {wordParseError && (
                          <div style={{ fontSize: '0.8rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fee2e2', padding: '10px 14px', borderRadius: '8px', maxWidth: '400px', textAlign: 'left', fontWeight: 600 }}>
                            ⚠️ {wordParseError}
                          </div>
                        )}
                      </div>

                      {/* Preview zone */}
                      {parsedQuestions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: '#ffffff', textAlign: 'left' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b' }}>
                              Parsed Questions List ({parsedQuestions.length} Found)
                            </h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Select the questions to import into section <strong>{selectedSectionName}</strong>.
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                            {parsedQuestions.map((q, idx) => {
                              // Extract diagram image data if embedded
                              const imgMatch = q.questionText.match(/<img[^>]+src="([^">]+)"/);
                              const hasDiagram = !!imgMatch;
                              const cleanText = q.questionText.replace(/<img[^>]+>/g, '').trim();

                              return (
                                <div key={idx} style={{ display: 'flex', gap: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!selectedParsedIndexes[idx]}
                                    onChange={(e) => setSelectedParsedIndexes(prev => ({ ...prev, [idx]: e.target.checked }))}
                                    style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                  <div style={{ flex: 1, fontSize: '0.85rem' }}>
                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>Question {idx + 1}</div>
                                    <div style={{ marginTop: '4px', color: '#334155', lineHeight: '1.4' }}>
                                      <MathRenderer text={cleanText} />
                                    </div>
                                    
                                    {hasDiagram && imgMatch && (
                                      <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', display: 'inline-block', background: '#fff', padding: '6px' }}>
                                        <img src={imgMatch[1]} alt="Diagram" style={{ maxHeight: '140px', maxWidth: '100%', objectFit: 'contain' }} />
                                      </div>
                                    )}

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px', marginTop: '10px' }}>
                                      {q.options.map((opt: string, oIdx: number) => (
                                        <div key={oIdx} style={{ fontSize: '0.78rem', color: '#475569', display: 'flex', gap: '4px', background: q.correctOptionIdx === oIdx ? '#dcfce7' : '#ffffff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                          <span style={{ fontWeight: 800 }}>{String.fromCharCode(65 + oIdx)}.</span>
                                          <span>{opt}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={handleImportSelectedQuestions}
                            style={{
                              padding: '12px 24px',
                              borderRadius: '8px',
                              border: 'none',
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: '#fff',
                              fontWeight: 'bold',
                              fontSize: '0.88rem',
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(16,185,129,0.2)',
                              textAlign: 'center',
                              alignSelf: 'flex-end',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Check size={16} /> Import Selected ({Object.values(selectedParsedIndexes).filter(Boolean).length}) Questions
                          </button>
                        </div>
                      )}
                    </div>
                  ) : questionSetupTab === 'pdf' ? (
                    /* PDF AI Parser Panel */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, padding: '16px', boxSizing: 'border-box' }}>
                      {/* Configuration block */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ background: '#eff6ff', padding: '6px', borderRadius: '8px', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            🔑
                          </span>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#1e293b' }}>Gemini API Key Configuration</h4>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              Required for AI question paper extraction. Obtain a free key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 'bold', textDecoration: 'underline' }}>Google AI Studio</a>.
                            </span>
                          </div>
                        </div>
                        <input
                          type="password"
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          placeholder="Paste your AI Studio API Key here..."
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', outline: 'none', background: '#ffffff', color: '#0f172a', fontWeight: 'bold' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Model Version:</span>
                          <select
                            value={geminiModel}
                            onChange={(e) => setGeminiModel(e.target.value)}
                            style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#fff', color: '#1e293b', fontWeight: 'bold' }}
                          >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended / Fast)</option>
                            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro (Advanced Reasoning / High Accuracy)</option>
                          </select>
                        </div>
                      </div>

                      {/* Upload zone */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', alignItems: 'center', flex: 1, border: '2px dashed var(--border-color)', borderRadius: '12px', background: '#f8fafc', padding: '30px', boxSizing: 'border-box' }}>
                        <div style={{ background: 'rgba(37,99,235,0.08)', padding: '18px', borderRadius: '50%', color: '#2563eb' }}>
                          <FileText size={40} />
                        </div>
                        
                        <div style={{ textAlign: 'center' }}>
                          <h4 style={{ margin: '0 0 6px 0', fontSize: '1.02rem', fontWeight: 800, color: '#1e293b' }}>Import PDF Question Paper</h4>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', maxWidth: '400px', lineHeight: '1.4' }}>
                            Upload a PDF document containing text, math equations, or printed questions. Gemini AI will OCR and structure the paper into LaTeX questions.
                          </p>
                        </div>

                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '11px 22px',
                          borderRadius: '8px',
                          background: geminiApiKey.trim() ? '#2563eb' : '#94a3b8',
                          color: '#fff',
                          fontWeight: 'bold',
                          cursor: geminiApiKey.trim() ? 'pointer' : 'not-allowed',
                          fontSize: '0.88rem',
                          boxShadow: '0 2px 4px rgba(37,99,235,0.1)'
                        }}>
                          <Upload size={16} /> Choose PDF File
                          {geminiApiKey.trim() && (
                            <input 
                              type="file" 
                              accept=".pdf" 
                              style={{ display: 'none' }} 
                              onChange={handlePdfFileUpload}
                              disabled={isParsingPdf}
                            />
                          )}
                        </label>

                        {isParsingPdf && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>
                            <div style={{ width: '16px', height: '16px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <span>{pdfParseStatus}</span>
                          </div>
                        )}

                        {pdfParseError && (
                          <div style={{ fontSize: '0.8rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fee2e2', padding: '10px 14px', borderRadius: '8px', maxWidth: '400px', textAlign: 'left', fontWeight: 600 }}>
                            ⚠️ {pdfParseError}
                          </div>
                        )}
                      </div>

                      {/* Preview zone */}
                      {parsedQuestions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: '#ffffff', textAlign: 'left' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b' }}>
                              Parsed Questions List ({parsedQuestions.length} Found)
                            </h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Select the questions to import into section <strong>{selectedSectionName}</strong>.
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                            {parsedQuestions.map((q, idx) => {
                              return (
                                <div key={idx} style={{ display: 'flex', gap: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!selectedParsedIndexes[idx]}
                                    onChange={(e) => setSelectedParsedIndexes(prev => ({ ...prev, [idx]: e.target.checked }))}
                                    style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                  <div style={{ flex: 1, fontSize: '0.85rem' }}>
                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>Question {idx + 1}</div>
                                    <div style={{ marginTop: '4px', color: '#334155', lineHeight: '1.4' }}>
                                      <MathRenderer text={q.questionText} />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px', marginTop: '10px' }}>
                                      {q.options.map((opt: string, oIdx: number) => (
                                        <div key={oIdx} style={{ fontSize: '0.78rem', color: '#475569', display: 'flex', gap: '4px', background: q.correctOptionIdx === oIdx ? '#dcfce7' : '#ffffff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                          <span style={{ fontWeight: 800 }}>{String.fromCharCode(65 + oIdx)}.</span>
                                          <span>{opt}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={handleImportSelectedQuestions}
                            style={{
                              padding: '12px 24px',
                              borderRadius: '8px',
                              border: 'none',
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: '#fff',
                              fontWeight: 'bold',
                              fontSize: '0.88rem',
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(16,185,129,0.2)',
                              textAlign: 'center',
                              alignSelf: 'flex-end',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Check size={16} /> Import Selected ({Object.values(selectedParsedIndexes).filter(Boolean).length}) Questions
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* QUESTION BANK LIBRARY DISPLAY */
                    <div className="qbank-library-wrapper">
                      {/* Filter Controls Row */}
                       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>QUESTION BANK</span>
                          <select value={selectedLibBankId} onChange={e => setSelectedLibBankId(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.75rem', background: '#fff', color: '#1e293b' }}>
                            <option value="All">All Banks</option>
                            {banksList.map(bank => (
                              <option key={bank.id} value={bank.id}>{bank.name}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>DIFFICULTY</span>
                          <select value={libDifficultyFilter} onChange={e => setLibDifficultyFilter(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.75rem', background: '#fff' }}>
                            <option value="All">All Levels</option>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SEARCH KEYWORDS</span>
                          <input 
                            type="text" 
                            placeholder="Search questions..." 
                            value={libSearchQuery} 
                            onChange={e => setLibSearchQuery(e.target.value)} 
                            style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.75rem', background: '#fff' }}
                          />
                        </div>
                      </div>

                      {/* Main library questions feed */}
                      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
                        {libLoading ? (
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 0', gap: '12px' }}>
                            <div style={{ border: '3px solid #e2e8f0', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '28px', height: '28px', animation: 'spin 1s linear infinite' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fetching & indexing question libraries...</span>
                          </div>
                        ) : libraryQuestions.length === 0 ? (
                          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            No questions found matching your filters.
                          </div>
                        ) : (
                          libraryQuestions.map((qVal, index) => {
                            const isAddedToExam = questionsState.some(q => q.questionText.trim() === qVal.questionText.trim());
                            const parentBank = banksList.find(b => b.id === qVal.bankId);
                            

                            return (
                              <div key={index} className="qbank-question-card" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#ebf8ff', color: '#2b6cb0', fontWeight: 'bold' }}>{parentBank?.targetExam || 'General'}</span>
                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#f0fff4', color: '#276749', fontWeight: 'bold' }}>{parentBank?.subject || 'General'}</span>
                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: '#fffaf0', color: '#dd6b20', fontWeight: 'bold' }}>{parentBank?.topic || 'General'}</span>
                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: qVal.difficulty === 'easy' ? '#e6fffa' : qVal.difficulty === 'medium' ? '#feebc8' : '#fed7d7', color: qVal.difficulty === 'easy' ? '#234e52' : qVal.difficulty === 'medium' ? '#c05621' : '#9b2c2c', fontWeight: 'bold' }}>{qVal.difficulty}</span>
                                  </div>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--text-dark)', fontWeight: 'bold', marginBottom: '8px' }}>
                                    <MathRenderer text={qVal.questionText} />
                                  </div>
                                  {qVal.questionImage && (
                                    <div style={{ marginTop: '8px', marginBottom: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', display: 'inline-block', background: '#fff', padding: '6px' }}>
                                      <img src={qVal.questionImage} alt="Library Diagram" style={{ maxHeight: '140px', maxWidth: '100%', objectFit: 'contain' }} />
                                    </div>
                                  )}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {qVal.options.map((opt: string, oIdx: number) => (
                                      <div key={oIdx} style={{ display: 'flex', gap: '4px', color: oIdx === qVal.correctOptionIdx ? '#2f855a' : 'inherit', fontWeight: oIdx === qVal.correctOptionIdx ? 'bold' : 'normal' }}>
                                        <span>{['A', 'B', 'C', 'D'][oIdx]})</span>
                                        <MathRenderer text={opt} />
                                      </div>
                                    ))}
                                  </div>
                                  {qVal.explanation && (
                                    <div style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px dashed #edf2f7', paddingTop: '6px', fontStyle: 'italic' }}>
                                      Explanation: <MathRenderer text={qVal.explanation} />
                                    </div>
                                  )}
                                </div>
                                <div className="qbank-question-actions">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isAddedToExam) return;
                                      const sectionConfig = sectionsWithRanges.find(sec => sec.subjectName === selectedSubjectName && sec.sectionName === selectedSectionName);
                                      const qStart = sectionConfig ? sectionConfig.qStart : 1;
                                      const qEnd = sectionConfig ? sectionConfig.qEnd : 15;
                                      const qCount = sectionConfig ? sectionConfig.qCount : 15;

                                      const sectionQs = questionsState.filter(q => q.subjectName === selectedSubjectName && q.sectionName === selectedSectionName);
                                      if (sectionQs.length >= qCount) {
                                        alert(`Cannot add more questions. This section is limited to ${qCount} questions.`);
                                        return;
                                      }

                                      setQuestionsState(prev => {
                                        const existingQNums = new Set(sectionQs.map(q => q.qNum));
                                        let nextQNum = qStart;
                                        while (existingQNums.has(nextQNum) && nextQNum <= qEnd) {
                                          nextQNum++;
                                        }

                                        const newQ = {
                                          qNum: nextQNum,
                                          sectionName: selectedSectionName,
                                          subjectName: selectedSubjectName,
                                          questionText: qVal.questionText,
                                          options: [...qVal.options],
                                          correctOptionIdx: qVal.correctOptionIdx,
                                          explanation: qVal.explanation || '',
                                          questionImage: qVal.questionImage || ''
                                        };
                                        return [...prev, newQ].sort((a, b) => a.qNum - b.qNum);
                                      });
                                    }}
                                    disabled={isAddedToExam}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: isAddedToExam ? '#48bb78' : 'var(--primary)',
                                      color: '#fff',
                                      fontWeight: 'bold',
                                      fontSize: '0.75rem',
                                      cursor: isAddedToExam ? 'default' : 'pointer',
                                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                      width: '110px'
                                    }}
                                  >
                                    {isAddedToExam ? 'Added ✔' : 'Add Question'}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </>
          )}

          {/* STEP 5: REVIEW & PUBLISH */}
          {step === 5 && (
            <div className="wizard-step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
              <h4 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.05rem' }}>Confirm Exam Settings</h4>
              
              <div className="preview-summary-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                <div className="summary-field">
                  <span className="lbl" style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Exam Name:</span>
                  <span className="val" style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{examName.toUpperCase()}</span>
                </div>
                <div className="summary-field">
                  <span className="lbl" style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Target Class:</span>
                  <span className="val" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{className}</span>
                </div>
                <div className="summary-field">
                  <span className="lbl" style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Roll No Digits:</span>
                  <span className="val" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{rollNoDigits} digits</span>
                </div>
                <div className="summary-field">
                  <span className="lbl" style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Questions:</span>
                  <span className="val" style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{totalQuestions} Questions</span>
                </div>
                <div className="summary-field">
                  <span className="lbl" style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Mode:</span>
                  <span className="val" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{examMode === 'online' ? '🌐 Online' : '📄 OMR Bubble Sheet'}</span>
                </div>

              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>ℹ️ Section Configurations</span>
                {sectionsWithRanges.map((sec, idx) => (
                  <div key={`review-sec-${idx}`} style={{ fontSize: '0.78rem', color: '#1e293b', paddingLeft: '8px', borderLeft: '3px solid #22c55e' }}>
                    <strong>{sec.subjectName} - {sec.sectionName}</strong>: {sec.qCount} Questions (Q{sec.qStart} - Q{sec.qEnd}) | +{sec.correctMarks} / {sec.incorrectMarks} Marks
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>Status *</label>
                <select 
                  value={onlinePublishStatus} 
                  onChange={(e) => setOnlinePublishStatus(e.target.value as any)} 
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    color: '#1e293b',
                    background: '#ffffff'
                  }}
                >
                  <option value="draft">Draft (Private)</option>
                  <option value="published">Published (Ready for candidates)</option>
                </select>
              </div>
            </div>
          )}

          {/* STEP 6: ONLINE SUCCESS & SHARE LINK */}
          {step === 6 && createdExamId && (
            <div className="wizard-step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ background: '#e6fffa', border: '2px solid #319795', padding: '16px', borderRadius: '50%', color: '#319795', animation: 'scaleUp 0.4s ease' }}>
                <Check size={40} strokeWidth={3} />
              </div>

              <div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 900 }}>{examId ? "Online Exam Updated!" : "Online Exam Created!"}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>The online exam is successfully configured and saved in database.</p>
              </div>

              <div className="glass-card" style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SHARE LINK WITH CANDIDATES</span>
                  <span style={{ fontSize: '0.7rem', color: onlinePublishStatus === 'published' ? '#48bb78' : '#e53e3e', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {onlinePublishStatus === 'published' ? '🟢 Published' : '🔴 Draft Mode'}
                  </span>
                </div>
                
                {/* Shareable Link Input Group */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    readOnly 
                    value={`${window.location.origin}/?onlineExamId=${createdExamId}`}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', fontSize: '0.8rem', outline: 'none' }}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/?onlineExamId=${createdExamId}`);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: copiedLink ? '#48bb78' : 'var(--primary)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                    {copiedLink ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  💡 Students click this link to access the Exam Portal. {onlinePublishStatus === 'draft' && "Ensure you switch the status to 'Published' in dashboard for candidates to take the test."}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '420px' }}>
                <a 
                  href={`${window.location.origin}/?onlineExamId=${createdExamId}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ flex: 1, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem', padding: '10px 16px', borderRadius: '6px' }}
                >
                  <Eye size={16} /> Test Portal View
                </a>
              </div>
            </div>
          )}

        </div>

        {/* Wizard Footer */}
        <footer className="wizard-footer">
          <button 
            className="btn-outline-cancel"
            onClick={step === 1 ? onClose : handlePrevStep}
            disabled={step === getTotalSteps() && examMode === 'online'}
            style={{ 
              opacity: (step === getTotalSteps() && examMode === 'online') ? 0.4 : 1, 
              cursor: (step === getTotalSteps() && examMode === 'online') ? 'not-allowed' : 'pointer' 
            }}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          
          <button 
            className="btn-primary-wizard"
            onClick={step === getTotalSteps() && examMode === 'online' ? () => onSuccess(createdExamId!) : (step === 5 ? handleSubmit : handleNextStep)}
          >
            {step === getTotalSteps() && examMode === 'online' ? 'Finish & Close' : (step === 5 ? (examId ? 'Save Changes' : 'Create Exam') : 'Next')}
          </button>
        </footer>

      </div>

      {showAddedQuestionsModal && (
        <div className="wizard-overlay animate-fade-in" style={{ zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)' }}>
          <div className="wizard-container" style={{ width: '800px', maxWidth: '92vw', height: '80vh', padding: '24px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Added Questions List</h3>
              <button
                type="button"
                onClick={() => setShowAddedQuestionsModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', paddingRight: '4px' }}>
              {(() => {
                const addedList = questionsState.filter(q => q.questionText.trim() !== '');
                if (addedList.length === 0) {
                  return (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      No questions have been added to the exam yet.
                    </div>
                  );
                }

                return addedList.map((q, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#f8fafc', position: 'relative' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '4px' }}>
                      Q {q.qNum} ({q.subjectName} - {q.sectionName})
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-dark)' }}>
                      <MathRenderer text={q.questionText} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {q.options.map((opt: string, oIdx: number) => (
                        <div key={oIdx} style={{ display: 'flex', gap: '4px', color: oIdx === q.correctOptionIdx ? '#2f855a' : 'inherit', fontWeight: oIdx === q.correctOptionIdx ? 'bold' : 'normal' }}>
                          <span>{['A', 'B', 'C', 'D', 'E'][oIdx]})</span>
                          <MathRenderer text={opt} />
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px dashed #edf2f7', paddingTop: '4px', fontStyle: 'italic' }}>
                        Explanation: <MathRenderer text={q.explanation} />
                      </div>
                    )}
                    
                    <button
                      type="button"
                      onClick={() => {
                        setQuestionsState(prev => {
                          const updated = [...prev];
                          const idxInState = updated.findIndex(item => item.qNum === q.qNum);
                          if (idxInState !== -1) {
                            updated[idxInState] = {
                              ...updated[idxInState],
                              questionText: '',
                              options: updated[idxInState].options.map(() => ''),
                              correctOptionIdx: 0,
                              explanation: '',
                              questionImage: ''
                            };
                          }
                          return updated;
                        });
                      }}
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#e53e3e',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
