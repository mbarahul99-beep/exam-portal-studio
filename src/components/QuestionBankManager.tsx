import React, { useState, useRef } from 'react';
import { db, type BankQuestion, type QuestionBank } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { MathRenderer } from './MathRenderer';
import { pdfjsLib } from '../utils/pdfWorker';
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
  ArrowLeft,
  Upload,
  FileText,
  Brain,
  Edit3,
  FolderClosed
} from 'lucide-react';

interface QuestionBankManagerProps {
  onBack?: () => void;
  pdfImportEnabled?: boolean;
}

function closeMalformedJson(jsonStr: string): string {
  let cleaned = jsonStr.trim();
  
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
  }

  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  if (inString) {
    cleaned += '"';
  }

  // Strip trailing commas, colons or partial keys
  cleaned = cleaned.trim().replace(/,\s*$/, "").replace(/:\s*$/, "");

  // Remove dangling keys at the end of the truncated JSON
  cleaned = cleaned.replace(/,\s*"[^"]*"\s*$/, "");
  cleaned = cleaned.replace(/,\s*"[^"]*$/, "");

  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') {
      cleaned += '}';
    } else if (last === '[') {
      cleaned += ']';
    }
  }

  return cleaned;
}

function repairJsonString(str: string): string {
  let cleaned = str.trim();
  
  // First auto-close any truncated structures
  cleaned = closeMalformedJson(cleaned);

  // Fix single quoted keys: e.g. 'key':
  cleaned = cleaned.replace(/'([^']+)'\s*:/g, '"$1":');

  // Fix single quoted values: e.g. : 'value', or : 'value'}
  cleaned = cleaned.replace(/:\s*'([^']*)'\s*([,\}])/g, ':"$1"$2');

  // Escape single backslashes that are not part of double-backslashes or escaped quotes
  cleaned = cleaned.replace(/(?<!\\)\\(?![\\"])/g, '\\\\');

  // Fix multiple commas or commas followed by commas (e.g. 88,, or 88, ,)
  cleaned = cleaned.replace(/,(\s*,)+/g, ',');

  // Fix trailing commas
  cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

  return cleaned;
}

function cropCanvasRegion(
  canvas: HTMLCanvasElement,
  ymin: number,
  xmin: number,
  ymax: number,
  xmax: number
): string | null {
  try {
    const pageW = canvas.width;
    const pageH = canvas.height;

    let x = (xmin / 1000) * pageW;
    let y = (ymin / 1000) * pageH;
    let w = ((xmax - xmin) / 1000) * pageW;
    let h = ((ymax - ymin) / 1000) * pageH;

    const padding = 5;
    x = Math.max(0, x - padding);
    y = Math.max(0, y - padding);
    w = Math.min(pageW - x, w + padding * 2);
    h = Math.min(pageH - y, h + padding * 2);

    if (w <= 0 || h <= 0) return null;

    const cropCanvas = document.createElement('canvas');
    const cropContext = cropCanvas.getContext('2d');
    if (!cropContext) return null;

    cropCanvas.width = w;
    cropCanvas.height = h;
    cropContext.drawImage(canvas, x, y, w, h, 0, 0, w, h);

    return cropCanvas.toDataURL('image/png');
  } catch (err) {
    console.error("cropCanvasRegion error:", err);
    return null;
  }
}

export const QuestionBankManager: React.FC<QuestionBankManagerProps> = ({ onBack, pdfImportEnabled = true }) => {
  // Navigation states
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create Question Bank form states
  const [targetExam, setTargetExam] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');

  // Selected Bank management sub-tab states
  const [subTab, setSubTab] = useState<'browse' | 'add' | 'csv' | 'pdf'>('browse');

  React.useEffect(() => {
    if (!pdfImportEnabled && subTab === 'pdf') {
      setSubTab('browse');
    }
  }, [pdfImportEnabled, subTab]);

  // Question editing states
  const [editingQuestion, setEditingQuestion] = useState<BankQuestion | null>(null);

  // PDF AI Parser States
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [geminiModel, setGeminiModel] = useState<string>(() => localStorage.getItem('gemini_model') || 'gemini-3.6-flash');
  const [isParsingPdf, setIsParsingPdf] = useState<boolean>(false);
  const [pdfParseError, setPdfParseError] = useState<string | null>(null);
  const [pdfParseStatus, setPdfParseStatus] = useState<string>('');
  
  // Bank renaming states
  const [isEditingBankName, setIsEditingBankName] = useState(false);
  const [editBankExam, setEditBankExam] = useState('');
  const [editBankSubject, setEditBankSubject] = useState('');
  const [editBankTopic, setEditBankTopic] = useState('');

  // Bulk question actions states
  const [selectedQIds, setSelectedQIds] = useState<number[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [targetMoveBankId, setTargetMoveBankId] = useState<number | string>('');
  const [parsedQuestions, setParsedQuestions] = useState<any[]>([]);
  const [selectedParsedIndexes, setSelectedParsedIndexes] = useState<Record<number, boolean>>({});
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [pdfFromPage, setPdfFromPage] = useState<number>(2);
  const [pdfToPage, setPdfToPage] = useState<number>(3);
  const [pdfFileObject, setPdfFileObject] = useState<File | null>(null);

  // PDF Batch Parser States
  const [pdfBatchSize, setPdfBatchSize] = useState<number>(1);
  const [pdfBatchDelay, setPdfBatchDelay] = useState<number>(3);
  const [isBatching, setIsBatching] = useState<boolean>(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState<number>(0);
  const [totalBatchesCount, setTotalBatchesCount] = useState<number>(0);
  const abortBatchRef = useRef<boolean>(false);

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

  const handleSaveBankRename = async () => {
    if (!selectedBank || !selectedBank.id) return;
    if (!editBankExam.trim() || !editBankSubject.trim() || !editBankTopic.trim()) {
      alert("Fields cannot be empty.");
      return;
    }
    try {
      const newName = `${editBankExam.trim()} - ${editBankSubject.trim()}: ${editBankTopic.trim()}`;
      await db.questionBanks.update(selectedBank.id, {
        targetExam: editBankExam.trim(),
        subject: editBankSubject.trim(),
        topic: editBankTopic.trim(),
        name: newName
      });

      const updatedBank = {
        ...selectedBank,
        targetExam: editBankExam.trim(),
        subject: editBankSubject.trim(),
        topic: editBankTopic.trim(),
        name: newName
      };

      await syncQuestionBankToCloud(updatedBank);
      setSelectedBank(updatedBank);
      setIsEditingBankName(false);
    } catch (err: any) {
      alert(`Error renaming bank: ${err.message}`);
    }
  };

  const handleDeleteSelectedQuestions = async () => {
    if (selectedQIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete the ${selectedQIds.length} selected questions from this bank?`)) return;
    try {
      for (const id of selectedQIds) {
        await deleteBankQuestionFromCloud(id);
        await db.questionBank.delete(id);
      }
      setSelectedQIds([]);
    } catch (err: any) {
      alert(`Error deleting questions: ${err.message}`);
    }
  };

  const handleMoveSelectedQuestions = async () => {
    if (selectedQIds.length === 0) return;
    if (!targetMoveBankId) {
      alert("Please select a target question bank.");
      return;
    }
    try {
      const targetId = Number(targetMoveBankId);
      const targetBank = questionBanks.find(b => b.id === targetId);
      if (!targetBank) {
        alert("Target question bank not found.");
        return;
      }
      
      for (const id of selectedQIds) {
        const qObj = await db.questionBank.get(id);
        if (qObj) {
          const updatedQObj = {
            ...qObj,
            bankId: targetId
          };
          await db.questionBank.put(updatedQObj);
          await syncBankQuestionToCloud(updatedQObj);
        }
      }
      setSelectedQIds([]);
      setShowMoveModal(false);
      setTargetMoveBankId('');
      alert("Successfully moved selected questions!");
    } catch (err: any) {
      alert(`Error moving questions: ${err.message}`);
    }
  };

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

  const handlePdfFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeBytes = 20 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setPdfParseError("File is too large. Please select a PDF file smaller than 20MB.");
      return;
    }

    setPdfParseError(null);
    setPdfParseStatus("Loading PDF document to calculate pages...");
    setIsParsingPdf(true);
    setParsedQuestions([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const typedArray = new Uint8Array(arrayBuffer);
      const pdfDoc = await pdfjsLib.getDocument({ data: typedArray }).promise;
      
      setPdfPageCount(pdfDoc.numPages);
      setPdfFileObject(file);
      
      // Default to extract pages 2 to 3 (or 1 to 1 if only 1 page exists)
      setPdfFromPage(pdfDoc.numPages >= 2 ? 2 : 1);
      setPdfToPage(pdfDoc.numPages >= 3 ? 3 : pdfDoc.numPages);
      
      setPdfParseStatus(`PDF "${file.name}" loaded successfully (${pdfDoc.numPages} pages). Select range below to extract.`);
    } catch (err: any) {
      console.error("PDF upload error:", err);
      setPdfParseError(err.message || "Failed to load PDF file.");
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handlePdfBatchParse = async () => {
    const file = pdfFileObject;
    if (!file) {
      setPdfParseError("Please select a PDF file first.");
      return;
    }

    if (!geminiApiKey.trim()) {
      setPdfParseError("Please provide a Gemini API Key to proceed.");
      return;
    }

    if (pdfFromPage < 1 || pdfToPage < pdfFromPage || pdfToPage > pdfPageCount) {
      setPdfParseError(`Invalid page range. Must be between 1 and ${pdfPageCount}.`);
      return;
    }

    localStorage.setItem('gemini_api_key', geminiApiKey);
    localStorage.setItem('gemini_model', geminiModel);

    setIsParsingPdf(true);
    setPdfParseError(null);
    setIsBatching(true);
    abortBatchRef.current = false;

    // Calculate batch ranges
    const ranges: Array<{ from: number; to: number }> = [];
    for (let p = pdfFromPage; p <= pdfToPage; p += pdfBatchSize) {
      ranges.push({
        from: p,
        to: Math.min(pdfToPage, p + pdfBatchSize - 1)
      });
    }

    setTotalBatchesCount(ranges.length);
    setCurrentBatchIndex(0);

    try {
      setPdfParseStatus("Loading PDF document...");
      const arrayBuffer = await file.arrayBuffer();
      const typedArray = new Uint8Array(arrayBuffer);
      const pdfDoc = await pdfjsLib.getDocument({ data: typedArray }).promise;

      // Helper function for rate limit delay
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const failedBatches: Array<{ pages: string; error: string }> = [];

      for (let i = 0; i < ranges.length; i++) {
        if (abortBatchRef.current) {
          setPdfParseStatus("Batch extraction stopped by user.");
          break;
        }

        const batch = ranges[i];
        setCurrentBatchIndex(i + 1);
        try {
          setPdfParseStatus(`[Batch ${i + 1}/${ranges.length}] Rendering pages ${batch.from} to ${batch.to}...`);

        const pageCanvases: HTMLCanvasElement[] = [];
        const pageImagesData: string[] = [];

        // Render page canvases
        for (let pNum = batch.from; pNum <= batch.to; pNum++) {
          const page = await pdfDoc.getPage(pNum);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error(`Failed to create 2d context for page ${pNum}`);

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas
          }).promise;

          pageCanvases.push(canvas);

          const jpegBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
          pageImagesData.push(jpegBase64);
        }

        if (abortBatchRef.current) break;

        setPdfParseStatus(`[Batch ${i + 1}/${ranges.length}] Extracting questions from pages ${batch.from} to ${batch.to}...`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

        const systemPrompt = `You are an expert exam parser. Your job is to extract questions from the provided page images of a question paper.
You are given a list of page images.
Identify all multiple choice questions (MCQs) in the images.
For each question:
1. Extract the question text. Paraphrase the question text slightly (reword sentences or use synonyms) while keeping the original academic meaning, variables, and values exactly intact, to ensure compliance with copyright and safety check policies.
2. Extract the options. There must be exactly 4 or 5 options. If any options are missing, leave them as empty strings.
3. Determine the correct option index (0-based, i.e., 0 for A, 1 for B, 2 for C, 3 for D).
4. Provide a very brief, generic 1-line mathematical or conceptual explanation. Do NOT generate long, complex textbook explanations.
5. Transcribe all mathematical expressions, chemical equations, and formulas into clean inline LaTeX (enclosed in '$', e.g. '$\\frac{9.8}{\\sqrt{2}}$' or '$g = 10 \\text{ m/s}^2$').
6. Escape any double quotes inside the questionText or explanation (e.g. use '\\"' instead of '"').
7. CRITICAL - Diagram Bounding Boxes:
   If a question contains a diagram, schematic drawing, math graph, block diagram, or circuit diagram:
   - Identify the 0-based pageIndex of the page image where the diagram is visible.
   - Detect its bounding box coordinates: ymin, xmin, ymax, xmax (normalized 0 to 1000 where 0 is top/left, 1000 is bottom/right).
   - Bounding Box Precision: The bounding box must terminate strictly at the outer edges of the drawings/structures. Do NOT include any question text or label headings from the top or sides of the diagram. Do NOT include any option text or letters (like '(a)', '(b)', '(c)', '(d)', '(i)', '(ii)', etc.) printed underneath or next to the structures.
   - Return this in the "diagramBox" field.
8. CRITICAL - Option Diagram Bounding Boxes:
   If the options themselves are diagrams, chemical structures, or equations rendered as images (rather than standard plain text):
   - For each option that is an image, identify its 0-based pageIndex and bounding box coordinates: ymin, xmin, ymax, xmax (normalized 0 to 1000).
   - Return these in the "optionDiagramBoxes" array of objects, containing "optionIdx" (0-based) and the bounding "box".

CRITICAL JSON RULES:
- Output valid JSON only.
- Do NOT use single quotes for keys or values.
- Do NOT leave trailing commas anywhere.
- Escape all backslashes in LaTeX formulas (e.g. write "\\\\frac" instead of "\\frac" so it is valid JSON).

Return the result STRICTLY as a JSON array of objects with this structure (no other text, no markdown wrappers, just raw JSON array):
[
  {
    "questionText": "Question text here with LaTeX",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctOptionIdx": 0,
    "explanation": "Explanation here",
    "diagramBox": {
      "pageIndex": 0,
      "ymin": 410,
      "xmin": 120,
      "ymax": 530,
      "xmax": 480
    },
    "optionDiagramBoxes": [
      {
        "optionIdx": 0,
        "box": {
          "pageIndex": 1,
          "ymin": 280,
          "xmin": 100,
          "ymax": 360,
          "xmax": 240
        }
      }
    ]
  }
]`;

        const promptParts: any[] = [{ text: systemPrompt }];
        for (const jpegBase64 of pageImagesData) {
          promptParts.push({
            inlineData: {
              data: jpegBase64,
              mimeType: 'image/jpeg'
            }
          });
        }

        const safetySettings = [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ];

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: promptParts
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            },
            safetySettings: safetySettings
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `API request failed with status ${response.status}`);
        }

        const resData = await response.json();
        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!rawText) {
          const finishReason = resData?.candidates?.[0]?.finishReason;
          if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
            throw new Error(`Gemini API empty response: Blocked by Google ${finishReason} / Copyright policy filter.`);
          }
          throw new Error("Gemini API returned an empty response. Verify your API key or check safety restrictions.");
        }

        const repairedJson = repairJsonString(rawText);
        let parsed;
        try {
          parsed = JSON.parse(repairedJson);
        } catch (e: any) {
          console.error("JSON parse failure. Raw text:", rawText);
          console.error("Repaired JSON:", repairedJson);
          
          let snippet = "";
          const posMatch = e.message.match(/position\s+(\d+)/);
          if (posMatch) {
            const pos = parseInt(posMatch[1], 10);
            const start = Math.max(0, pos - 40);
            const end = Math.min(repairedJson.length, pos + 40);
            snippet = repairedJson.substring(start, end);
            snippet = `\nSnippet around error: "...${snippet}..."`;
          }
          throw new Error(`JSON parsing failed: ${e.message}.${snippet}`);
        }
        if (Array.isArray(parsed) && parsed.length > 0) {
          let croppedCount = 0;
          for (let qIdx = 0; qIdx < parsed.length; qIdx++) {
            const q = parsed[qIdx];
            
            // Crop question diagram
            if (q.diagramBox && typeof q.diagramBox.pageIndex === 'number' && typeof q.diagramBox.ymin === 'number') {
              const pIdx = q.diagramBox.pageIndex;
              if (pIdx >= 0 && pIdx < pageCanvases.length) {
                const canvas = pageCanvases[pIdx];
                const cropped = cropCanvasRegion(
                  canvas,
                  q.diagramBox.ymin,
                  q.diagramBox.xmin,
                  q.diagramBox.ymax,
                  q.diagramBox.xmax
                );
                if (cropped) {
                  q.questionImage = cropped;
                  croppedCount++;
                }
              }
            }

            // Crop option diagrams
            if (Array.isArray(q.optionDiagramBoxes)) {
              for (const optBox of q.optionDiagramBoxes) {
                const optIdx = optBox.optionIdx;
                const box = optBox.box;
                if (typeof optIdx === 'number' && box && typeof box.pageIndex === 'number' && typeof box.ymin === 'number') {
                  const pIdx = box.pageIndex;
                  if (pIdx >= 0 && pIdx < pageCanvases.length) {
                    const canvas = pageCanvases[pIdx];
                    const cropped = cropCanvasRegion(
                      canvas,
                      box.ymin,
                      box.xmin,
                      box.ymax,
                      box.xmax
                    );
                    if (cropped) {
                      q.options[optIdx] = cropped;
                      croppedCount++;
                    }
                  }
                }
              }
            }
          }

          // Append parsed questions to queue
          setParsedQuestions(prev => {
            const next = [...prev, ...parsed];
            setSelectedParsedIndexes(old => {
              const updated = { ...old };
              for (let idx = prev.length; idx < next.length; idx++) {
                updated[idx] = true;
              }
              return updated;
            });
            return next;
          });
        }
        } catch (batchErr: any) {
          console.error(`Batch ${i + 1} failed:`, batchErr);
          failedBatches.push({
            pages: `${batch.from} to ${batch.to}`,
            error: batchErr.message || "Unknown error"
          });
        }

        // Rate-limiting delay for subsequent batches
        if (i < ranges.length - 1 && !abortBatchRef.current) {
          for (let sec = pdfBatchDelay; sec > 0; sec--) {
            if (abortBatchRef.current) break;
            setPdfParseStatus(`[Batch ${i + 1}/${ranges.length} Done] Waiting ${sec}s before next batch to prevent rate limits...`);
            await sleep(1000);
          }
        }
      }

      if (abortBatchRef.current) {
        setPdfParseStatus("Extraction stopped. Preview questions parsed so far below.");
      } else {
        if (failedBatches.length > 0) {
          const summary = failedBatches.map(f => `Pages ${f.pages}: ${f.error}`).join('; ');
          setPdfParseStatus(`Completed scanning. Note: Extraction failed for some pages [${summary}]`);
          setPdfParseError(`Extraction finished with errors on these pages:\n` + failedBatches.map(f => `- Pages ${f.pages}: ${f.error}`).join('\n'));
        } else {
          setPdfParseStatus("Successfully completed extracting all batches!");
        }
      }
    } catch (err: any) {
      console.error("PDF Batch Parsing error:", err);
      setPdfParseError(err.message || "Failed to process PDF batch.");
    } finally {
      setIsParsingPdf(false);
      setIsBatching(false);
    }
  };



  const handleImportSelectedQuestionsToBank = async () => {
    if (!selectedBank) return;
    const toImport = parsedQuestions.filter((_, idx) => selectedParsedIndexes[idx]);
    if (toImport.length === 0) {
      alert("No questions selected for import.");
      return;
    }

    try {
      let importCount = 0;
      for (const q of toImport) {
        const item: BankQuestion = {
          bankId: selectedBank.id!,
          questionText: q.questionText,
          options: Array.isArray(q.options) ? q.options.filter(Boolean) : ['', '', '', ''],
          correctOptionIdx: typeof q.correctOptionIdx === 'number' ? q.correctOptionIdx : 0,
          difficulty: q.difficulty || 'medium',
          explanation: q.explanation || undefined,
          questionImage: q.questionImage || undefined,
          createdAt: new Date()
        };

        // Extract diagrams if parsed inside HTML fallback
        const imgMatch = q.questionText.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch && imgMatch[1]) {
          item.questionImage = imgMatch[1];
          item.questionText = q.questionText.replace(/<img[^>]+>/g, '').trim();
        }

        const insertedId = await db.questionBank.add(item);
        item.id = insertedId;
        await syncBankQuestionToCloud(item);
        importCount++;
      }

      alert(`Successfully imported ${importCount} questions into bank: ${selectedBank?.name}!`);
      setParsedQuestions([]);
      setSelectedParsedIndexes({});
      setPdfParseStatus('');
      setSubTab('browse');
    } catch (err: any) {
      alert(`Failed to import questions: ${err.message}`);
    }
  };

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;

    if (!editingQuestion.questionText.trim()) {
      alert("Question text is required.");
      return;
    }

    try {
      const updatedItem: BankQuestion = {
        ...editingQuestion,
        options: editingQuestion.options.filter(Boolean)
      };

      await db.questionBank.put(updatedItem);
      await syncBankQuestionToCloud(updatedItem);

      alert("Question updated successfully!");
      setEditingQuestion(null);
    } catch (err: any) {
      alert(`Error updating question: ${err.message}`);
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {onBack && (
                <button 
                  onClick={onBack}
                  className="btn-outlined" 
                  style={{ padding: '6px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Back to Dashboard"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Database className="text-indigo" size={24} /> Question Banks
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Select a Question Bank to add/edit questions or click the button to create a new one.
                </p>
              </div>
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
              {isEditingBankName ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Target Exam"
                    value={editBankExam}
                    onChange={e => setEditBankExam(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem', width: '100px' }}
                  />
                  <input
                    type="text"
                    placeholder="Subject"
                    value={editBankSubject}
                    onChange={e => setEditBankSubject(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem', width: '120px' }}
                  />
                  <input
                    type="text"
                    placeholder="Topic"
                    value={editBankTopic}
                    onChange={e => setEditBankTopic(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem', width: '140px' }}
                  />
                  <button
                    onClick={handleSaveBankRename}
                    style={{ padding: '4px 10px', borderRadius: '4px', background: '#2f855a', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingBankName(false)}
                    style={{ padding: '4px 10px', borderRadius: '4px', background: '#fff', color: '#4a5568', border: '1px solid var(--border-color)', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>Question Banks</span>
                    <ChevronRight size={12} />
                    <span style={{ fontWeight: 'bold' }}>{selectedBank.targetExam}</span>
                  </div>
                  <h3 style={{ margin: '2px 0 0 0', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedBank.subject} - {selectedBank.topic}
                    <button
                      onClick={() => {
                        setEditBankExam(selectedBank.targetExam);
                        setEditBankSubject(selectedBank.subject);
                        setEditBankTopic(selectedBank.topic);
                        setIsEditingBankName(true);
                      }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--primary)', padding: '2px', display: 'inline-flex', alignItems: 'center' }}
                      title="Rename Question Bank"
                    >
                      <Edit3 size={14} />
                    </button>
                  </h3>
                </div>
              )}
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
              {pdfImportEnabled && (
                <button 
                  onClick={() => setSubTab('pdf')}
                  style={{ padding: '6px 14px', border: 'none', background: subTab === 'pdf' ? 'var(--primary)' : 'transparent', color: subTab === 'pdf' ? '#fff' : '#4a5568', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Import PDF (AI)
                </button>
              )}
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
                {/* Bulk Actions Panel */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '8px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={filteredQuestions.length > 0 && selectedQIds.length === filteredQuestions.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedQIds(filteredQuestions.map(q => q.id!));
                        } else {
                          setSelectedQIds([]);
                        }
                      }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                      Select All ({filteredQuestions.length})
                    </span>
                  </div>

                  {selectedQIds.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                        {selectedQIds.length} selected
                      </span>
                      <button
                        onClick={() => setShowMoveModal(true)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--primary)',
                          background: '#fff',
                          color: 'var(--primary)',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <FolderClosed size={14} /> Move To Bank
                      </button>
                      <button
                        onClick={handleDeleteSelectedQuestions}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#e53e3e',
                          color: '#fff',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Trash2 size={14} /> Delete Selected
                      </button>
                    </div>
                  )}
                </div>

                {filteredQuestions.length === 0 ? (
                  <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No questions stored in this bank matching your filters. Click <strong>+ Add Question</strong> or import them!
                  </div>
                ) : (
                  filteredQuestions.map((q, idx) => {
                    const isSelected = selectedQIds.includes(q.id!);
                    return (
                      <div key={q.id} className="qbank-question-card glass-card animate-fade-in" style={{ border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedQIds(prev => [...prev, q.id!]);
                            } else {
                              setSelectedQIds(prev => prev.filter(id => id !== q.id!));
                            }
                          }}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '4px' }}
                        />
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
                          onClick={() => setEditingQuestion(q)}
                          className="btn-outlined" 
                          style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', width: '110px', border: '1px solid var(--primary)', color: 'var(--primary)', background: '#fff', cursor: 'pointer' }}
                        >
                          Edit
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
                    );
                  })
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
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '0.9rem', width: '20px' }}>{['A', 'B', 'C', 'D', 'E'][idx]}</span>
                      <input 
                        type="text" 
                        value={opt} 
                        onChange={e => {
                          const updated = [...newOptions];
                          updated[idx] = e.target.value;
                          setNewOptions(updated);
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
                                    const updated = [...newOptions];
                                    updated[idx] = reader.result as string;
                                    setNewOptions(updated);
                                  };
                                  reader.readAsDataURL(file);
                                  e.preventDefault();
                                }
                              }
                            }
                          }
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
                    {opt && typeof opt === 'string' && opt.trim() && (opt.includes('$') || opt.includes('$$') || opt.startsWith('data:image/')) && (
                      <div style={{ marginLeft: '28px', fontSize: '0.8rem', color: '#4a5568' }}>
                        <MathRenderer text={opt} />
                      </div>
                    )}
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
          {/* SUB-TAB 4: IMPORT PDF (AI) */}
          {subTab === 'pdf' && (
            <div className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '750px', margin: '0 auto', width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Brain size={20} color="var(--primary)" /> Import Questions via PDF (AI)
              </h3>
              
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
                    <option value="gemini-3.6-flash">Gemini 3.6 Flash (Recommended / Newest)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Fast)</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Stable)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Advanced Reasoning)</option>
                  </select>
                </div>
              </div>

              {/* Upload zone */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', alignItems: 'center', border: '2px dashed var(--border-color)', borderRadius: '12px', background: '#f8fafc', padding: '30px', boxSizing: 'border-box' }}>
                <div style={{ background: 'rgba(37,99,235,0.08)', padding: '18px', borderRadius: '50%', color: '#2563eb' }}>
                  <FileText size={40} />
                </div>
                
                <div style={{ textAlign: 'center' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '1.02rem', fontWeight: 800, color: '#1e293b' }}>
                    {pdfFileObject ? `Selected File: ${pdfFileObject.name}` : "Import PDF Question Paper"}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', maxWidth: '400px', lineHeight: '1.4' }}>
                    {pdfFileObject 
                      ? `Total pages: ${pdfPageCount}. Choose page range to process. Recommended: 2 to 3 pages at a time to prevent timeout/API truncation.` 
                      : "Upload a PDF document. You can extract questions incrementally by choosing page ranges (e.g. pages 2-3, then 4-5)."
                    }
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
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
                    <Upload size={16} /> {pdfFileObject ? "Change PDF File" : "Choose PDF File"}
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

                  {pdfFileObject && (
                    <button
                      type="button"
                      onClick={() => {
                        setPdfFileObject(null);
                        setPdfPageCount(0);
                        setParsedQuestions([]);
                        setPdfParseStatus('');
                      }}
                      style={{
                        padding: '11px 22px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#64748b',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '0.88rem'
                      }}
                    >
                      Clear File
                    </button>
                  )}
                </div>

                {pdfFileObject && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', width: '100%', maxWidth: '400px', boxSizing: 'border-box' }}>
                    {/* Page Range Inputs */}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left', flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>START PAGE</span>
                        <input
                          type="number"
                          min={1}
                          max={pdfPageCount}
                          value={pdfFromPage}
                          onChange={(e) => setPdfFromPage(Math.max(1, Math.min(pdfPageCount, parseInt(e.target.value) || 1)))}
                          disabled={isParsingPdf}
                          style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left', flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>END PAGE</span>
                        <input
                          type="number"
                          min={pdfFromPage}
                          max={pdfPageCount}
                          value={pdfToPage}
                          onChange={(e) => setPdfToPage(Math.max(pdfFromPage, Math.min(pdfPageCount, parseInt(e.target.value) || pdfFromPage)))}
                          disabled={isParsingPdf}
                          style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    {/* Batching & Rate Limit Inputs */}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left', flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>PAGES PER BATCH</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={pdfBatchSize}
                          onChange={(e) => setPdfBatchSize(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                          disabled={isParsingPdf}
                          style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left', flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>DELAY INTERVAL (SEC)</span>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={pdfBatchDelay}
                          onChange={(e) => setPdfBatchDelay(Math.max(0, Math.min(30, parseInt(e.target.value) || 0)))}
                          disabled={isParsingPdf}
                          style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    {/* Process / Cancel Buttons */}
                    <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '8px' }}>
                      {isBatching ? (
                        <button
                          type="button"
                          onClick={() => { abortBatchRef.current = true; setPdfParseStatus("Stopping after current batch..."); }}
                          style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '6px',
                            border: '1px solid #ef4444',
                            background: '#fef2f2',
                            color: '#ef4444',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontSize: '0.88rem',
                            transition: 'background 0.2s'
                          }}
                        >
                          Stop Batch Extraction
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handlePdfBatchParse}
                          disabled={isParsingPdf || !geminiApiKey.trim()}
                          style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: (isParsingPdf || !geminiApiKey.trim()) ? '#94a3b8' : 'var(--primary)',
                            color: '#fff',
                            fontWeight: 'bold',
                            cursor: (isParsingPdf || !geminiApiKey.trim()) ? 'not-allowed' : 'pointer',
                            fontSize: '0.88rem',
                            transition: 'background 0.2s'
                          }}
                        >
                          Start Batch Extraction
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {isParsingPdf && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#2563eb', fontWeight: 600, marginTop: '8px', flexWrap: 'wrap' }}>
                    <div style={{ width: '16px', height: '16px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <span>{pdfParseStatus}</span>
                    {totalBatchesCount > 0 && (
                      <span style={{ background: '#eff6ff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', color: '#2563eb', border: '1px solid #bfdbfe', fontWeight: 'bold' }}>
                        Batch {currentBatchIndex}/{totalBatchesCount}
                      </span>
                    )}
                  </div>
                )}

                {pdfParseError && (
                  <div style={{ fontSize: '0.8rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fee2e2', padding: '10px 14px', borderRadius: '8px', maxWidth: '400px', textAlign: 'left', fontWeight: 600, marginTop: '8px' }}>
                    ⚠️ {pdfParseError}
                  </div>
                )}
              </div>

              {/* Preview zone */}
              {parsedQuestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: '#ffffff', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1e293b' }}>
                        Parsed Questions List ({parsedQuestions.length} Found)
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Select the questions to import into bank: <strong>{selectedBank?.name}</strong>.
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const updated: Record<number, boolean> = {};
                          parsedQuestions.forEach((_, idx) => {
                            updated[idx] = true;
                          });
                          setSelectedParsedIndexes(updated);
                        }}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', cursor: 'pointer', transition: 'background 0.2s' }}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedParsedIndexes({})}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', cursor: 'pointer', transition: 'background 0.2s' }}
                      >
                        Deselect All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setParsedQuestions([]);
                          setSelectedParsedIndexes({});
                          setPdfParseStatus('');
                        }}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', fontSize: '0.75rem', fontWeight: 'bold', color: '#ef4444', cursor: 'pointer', transition: 'background 0.2s' }}
                      >
                        Clear Queue
                      </button>
                    </div>
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
                    onClick={handleImportSelectedQuestionsToBank}
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: 'fit-content',
                      alignSelf: 'flex-end'
                    }}
                  >
                    <Check size={16} /> Import Selected ({Object.values(selectedParsedIndexes).filter(Boolean).length}) Questions
                  </button>
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

      {/* 5. MODAL DIALOG: EDIT QUESTION IN BANK */}
      {editingQuestion && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <form onSubmit={handleUpdateQuestion} className="glass-card animate-scale-up" style={{ background: '#ffffff', width: '90%', maxWidth: '650px', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Edit Question</h3>
              <button type="button" onClick={() => setEditingQuestion(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Question Text */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>QUESTION TEXT *</label>
                <textarea
                  value={editingQuestion.questionText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingQuestion(prev => prev ? { ...prev, questionText: val } : null);
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
                              const base64 = reader.result as string;
                              setEditingQuestion(prev => prev ? { ...prev, questionImage: base64 } : null);
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
                  rows={4} 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'inherit' }} 
                />
                {editingQuestion.questionText.trim() && (
                  <div style={{ marginTop: '4px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #edf2f7', borderRadius: '6px', fontSize: '0.85rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>LIVE PREVIEW</span>
                    <MathRenderer text={editingQuestion.questionText} />
                  </div>
                )}
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>OPTIONS & CORRECT ANSWER *</label>
                {editingQuestion.options.map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '0.9rem', width: '20px' }}>{['A', 'B', 'C', 'D', 'E'][idx]}</span>
                      <input 
                        type="text" 
                        value={opt} 
                        onChange={e => {
                          const updated = [...editingQuestion.options];
                          updated[idx] = e.target.value;
                          setEditingQuestion(prev => prev ? { ...prev, options: updated } : null);
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
                                    const updated = [...editingQuestion.options];
                                    updated[idx] = reader.result as string;
                                    setEditingQuestion(prev => prev ? { ...prev, options: updated } : null);
                                  };
                                  reader.readAsDataURL(file);
                                  e.preventDefault();
                                }
                              }
                            }
                          }
                        }}
                        placeholder={`Option ${['A', 'B', 'C', 'D', 'E'][idx]} text`}
                        required={idx < 4}
                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }} 
                      />
                      <input 
                        type="radio" 
                        name="editCorrectIdx" 
                        checked={editingQuestion.correctOptionIdx === idx}
                        onChange={() => setEditingQuestion(prev => prev ? { ...prev, correctOptionIdx: idx } : null)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Correct</span>
                    </div>
                    {opt && typeof opt === 'string' && opt.trim() && (opt.includes('$') || opt.includes('$$') || opt.startsWith('data:image/')) && (
                      <div style={{ marginLeft: '28px', fontSize: '0.8rem', color: '#4a5568' }}>
                        <MathRenderer text={opt} />
                      </div>
                    )}
                  </div>
                ))}
                
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                  {editingQuestion.options.length < 5 && (
                    <button 
                      type="button" 
                      onClick={() => {
                        const updated = [...editingQuestion.options, ''];
                        setEditingQuestion(prev => prev ? { ...prev, options: updated } : null);
                      }} 
                      className="btn-link" 
                      style={{ fontSize: '0.75rem', padding: 0, border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      + Add Option E
                    </button>
                  )}
                  {editingQuestion.options.length > 4 && (
                    <button 
                      type="button" 
                      onClick={() => {
                        const updated = editingQuestion.options.slice(0, 4);
                        const nextCorrect = editingQuestion.correctOptionIdx >= 4 ? 0 : editingQuestion.correctOptionIdx;
                        setEditingQuestion(prev => prev ? { ...prev, options: updated, correctOptionIdx: nextCorrect } : null);
                      }} 
                      className="btn-link" 
                      style={{ fontSize: '0.75rem', padding: 0, border: 'none', background: 'transparent', color: 'var(--warning)', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      - Remove Option E
                    </button>
                  )}
                </div>
              </div>

              {/* Difficulty */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>DIFFICULTY *</label>
                <select
                  value={editingQuestion.difficulty}
                  onChange={(e) => {
                    const val = e.target.value as 'easy' | 'medium' | 'hard';
                    setEditingQuestion(prev => prev ? { ...prev, difficulty: val } : null);
                  }}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              {/* Explanation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>EXPLANATION (OPTIONAL)</label>
                <textarea
                  value={editingQuestion.explanation || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingQuestion(prev => prev ? { ...prev, explanation: val } : null);
                  }}
                  placeholder="Enter solution explanation... (use $...$ for formulas)"
                  rows={2}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'inherit' }}
                />
              </div>

              {/* Question Image */}
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
                            const base64 = reader.result as string;
                            setEditingQuestion(prev => prev ? { ...prev, questionImage: base64 } : null);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  {editingQuestion.questionImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img 
                        src={editingQuestion.questionImage} 
                        alt="Preview" 
                        style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#fff' }} 
                      />
                      <button 
                        type="button" 
                        onClick={() => setEditingQuestion(prev => prev ? { ...prev, questionImage: '' } : null)}
                        style={{ background: 'transparent', border: 'none', color: '#e53e3e', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
              <button 
                type="button" 
                onClick={() => setEditingQuestion(null)} 
                className="btn-secondary" 
                style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. MODAL DIALOG: MOVE SELECTED QUESTIONS TO ANOTHER BANK */}
      {showMoveModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="glass-card animate-scale-up" style={{ background: '#ffffff', width: '90%', maxWidth: '480px', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Move {selectedQIds.length} Questions</h3>
              <button onClick={() => setShowMoveModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SELECT TARGET QUESTION BANK</label>
                <select 
                  value={targetMoveBankId} 
                  onChange={e => setTargetMoveBankId(e.target.value)} 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: '#fff' }}
                >
                  <option value="">-- Choose Target Bank --</option>
                  {questionBanks.filter(b => b.id !== selectedBank?.id).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
              <button 
                onClick={() => {
                  setShowMoveModal(false);
                  setTargetMoveBankId('');
                }} 
                className="btn-secondary" 
                style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleMoveSelectedQuestions} 
                className="btn-primary" 
                style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: 'bold', background: 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                Move Questions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
