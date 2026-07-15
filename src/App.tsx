import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Student, type Exam } from './db';
import { useOpenCv } from './hooks/useOpenCv';
import { scanOMRSheet, OMR_CONFIG } from './utils/omrScanner';
import { OmrPrintSheet } from './components/OmrPrintSheet';
import { StudentReportPrint } from './components/StudentReportPrint';
import confetti from 'canvas-confetti';
import { ExamWizard } from './components/ExamWizard';
import { ExamDetailsView } from './components/ExamDetailsView';
import { OnlineExamPortal } from './components/OnlineExamPortal';
import { UnifiedLoginPortal } from './components/UnifiedLoginPortal';
import { StudentReportPortal } from './components/StudentReportPortal';
import { 
  Users, 
  FileText, 
  Camera, 
  Award, 
  BookOpen, 
  Plus, 
  CheckCircle, 
  AlertTriangle, 
  Check, 
  Upload, 
  Search, 
  RefreshCw, 
  TrendingUp,
  Link,
  Download,
  Trash2,
  X,
  ChevronRight,
  LogOut,
  Menu
} from 'lucide-react';

export default function App() {
  const { loaded: cvLoaded, error: cvError } = useOpenCv();
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'exams' | 'scanner' | 'analysis'>('dashboard');
  const [selectedAnalysisExamId, setSelectedAnalysisExamId] = useState<number | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [onlineExamId, setOnlineExamId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Authentication State
  const [sessionRole, setSessionRole] = useState<'admin' | 'student' | null>(
    () => (localStorage.getItem('appex_session_role') as any) || null
  );
  const [sessionStudentId, setSessionStudentId] = useState<number | null>(
    () => {
      const val = localStorage.getItem('appex_session_student_id');
      return val ? Number(val) : null;
    }
  );

  const handleLogout = () => {
    localStorage.removeItem('appex_session_role');
    localStorage.removeItem('appex_session_student_id');
    setSessionRole(null);
    setSessionStudentId(null);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const examIdStr = params.get('examId');
    if (view === 'online-exam' && examIdStr) {
      setOnlineExamId(Number(examIdStr));
    }
  }, []);
  
  // DB Live Queries
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const submissions = useLiveQuery(() => db.submissions.toArray()) || [];
  const classes = useLiveQuery(() => db.classes.toArray()) || [];

  // Classes & Student Navigation/Modal States
  const [selectedClassName, setSelectedClassName] = useState<string | null>(null);
  const [showAddStudentDrawer, setShowAddStudentDrawer] = useState(false);
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  
  // Add Class Form State
  const [newClassName, setNewClassName] = useState('');

  // Add Student Drawer Form States
  const [drawerRollNo, setDrawerRollNo] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [drawerEmail, setDrawerEmail] = useState('');
  const [drawerPhone, setDrawerPhone] = useState('');

  // Sort State
  const [classSortField, setClassSortField] = useState<'name' | 'studentsCount'>('name');
  const [classSortOrder, setClassSortOrder] = useState<'asc' | 'desc'>('asc');

  // Form States
  const [csvText, setCsvText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');




  // Printing state
  const [printExam, setPrintExam] = useState<Exam | null>(null);
  const [printReportData, setPrintReportData] = useState<{ exam: Exam; student: Student; submission: any } | null>(null);

  // Scanner States
  const [scannerExamId, setScannerExamId] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    detectedStudentNum: string;
    studentName: string;
    studentId: number | null;
    score: number;
    answers: Record<number, string>;
    warpedCanvas: HTMLCanvasElement | null;
    correctCount?: number;
    wrongCount?: number;
    unansweredCount?: number;
  } | null>(null);

  // Webcam stream states
  const [useWebcam, setUseWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Selected Student Profile State for Reports
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // Populate Mock Data Helper
  const handleSeedData = async (silent = false) => {
    try {
      // 1. Clear existing
      await db.students.clear();
      await db.exams.clear();
      await db.submissions.clear();
      await db.classes.clear();

      // 2. Add mock classes
      const mockClasses = [
        { name: 'NEET 1', state: 'Synced' as const, createdAt: new Date() },
        { name: 'NEET', state: 'Synced' as const, createdAt: new Date() }
      ];
      for (const cls of mockClasses) {
        await db.classes.add(cls);
      }

      // 3. Add mock students
      const mockStudents: Student[] = [
        { studentNum: '1000000001', name: 'Aarav Sharma', className: 'NEET', phone: '9876543210', email: 'aarav@evalbee.in' },
        { studentNum: '1000000002', name: 'Diya Patel', className: 'NEET', phone: '9876543211', email: 'diya@evalbee.in' },
        { studentNum: '1000000003', name: 'Kabir Mehta', className: 'NEET', phone: '9876543212', email: 'kabir@evalbee.in' },
        { studentNum: '1000000004', name: 'Ananya Rao', className: 'NEET 1', phone: '9876543213', email: 'ananya@evalbee.in' },
        { studentNum: '1000000005', name: 'Rohan Gupta', className: 'NEET 1', phone: '9876543214', email: 'rohan@evalbee.in' }
      ];
      for (const s of mockStudents) {
        await db.students.add(s);
      }

      // 3. Add a mock exam
      const key: Record<number, string> = {};
      const options = ['A', 'B', 'C', 'D'];
      for (let i = 1; i <= 200; i++) {
        // Random correct answer for mock exam key
        key[i] = options[Math.floor(Math.sin(i) * 2 + 2) % 4];
      }

      const examId = await db.exams.add({
        title: 'NEET Practice Test 1 (200 Qs)',
        className: 'NEET',
        date: '2026-07-14',
        status: 'private',
        numQuestions: 200,
        answerKey: key,
        correctMarks: 4,
        incorrectMarks: -1,
        unansweredMarks: 0,
        createdAt: new Date()
      });

      // 4. Add mock submissions
      const sub1: Record<number, string> = { ...key }; // 200/200 correct -> 800 marks
      
      const sub2: Record<number, string> = { ...key }; // 190 correct, 10 incorrect -> 750 marks
      for (let i = 1; i <= 10; i++) {
        const q = i * 15;
        sub2[q] = sub2[q] === 'A' ? 'B' : 'A';
      }

      const sub3: Record<number, string> = { ...key }; // 165 correct, 35 incorrect -> 625 marks
      for (let i = 1; i <= 35; i++) {
        const q = i * 5;
        sub3[q] = sub3[q] === 'A' ? 'B' : 'A';
      }

      const dbStudents = await db.students.toArray();
      
      await db.submissions.add({
        examId,
        studentId: dbStudents[0].id!, // Aarav (800 marks)
        score: 800,
        answers: sub1,
        scannedAt: new Date(Date.now() - 3600000)
      });

      await db.submissions.add({
        examId,
        studentId: dbStudents[1].id!, // Diya (750 marks)
        score: 750,
        answers: sub2,
        scannedAt: new Date(Date.now() - 1800000)
      });

      await db.submissions.add({
        examId,
        studentId: dbStudents[2].id!, // Kabir (625 marks)
        score: 625,
        answers: sub3,
        scannedAt: new Date()
      });

      if (!silent) {
        confetti({ particleCount: 80, spread: 60 });
        alert('Mock data loaded! 5 Students, 1 NEET Exam (200 Qs), and 3 scan results created.');
      }
    } catch (err: any) {
      if (!silent) {
        alert(`Error loading mock data: ${err.message}`);
      }
    }
  };

  // Auto-seed database if empty on startup (silent load)
  useEffect(() => {
    const autoSeed = async () => {
      try {
        const classCount = await db.classes.count();
        const studentCount = await db.students.count();
        const examCount = await db.exams.count();
        
        if (classCount === 0 || studentCount === 0 || examCount === 0) {
          console.log("Database looks empty or incomplete on startup. Auto-seeding mock data...");
          await handleSeedData(true);
        }
      } catch (e) {
        console.error("Auto-seeding check failed:", e);
      }
    };
    autoSeed();
  }, []);



  const handleImportCsv = async () => {
    if (!csvText) return;
    const lines = csvText.split('\n');
    let imported = 0;
    let failed = 0;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length >= 2) {
        const num = parts[0].trim();
        const name = parts[1].trim();
        const cls = (parts[2] || selectedClassName || 'NEET').trim();

        if (num.length === 10 && !isNaN(Number(num))) {
          try {
            await db.students.add({ studentNum: num, name, className: cls });
            
            // Auto-register class if it doesn't exist
            const classExists = await db.classes.where('name').equalsIgnoreCase(cls).first();
            if (!classExists) {
              await db.classes.add({
                name: cls,
                state: 'Synced',
                createdAt: new Date()
              });
            }
            imported++;
          } catch {
            failed++;
          }
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    }
    setCsvText('');
    alert(`CSV Import Complete: ${imported} students imported, ${failed} failed.`);
  };

  const handleAddClass = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newClassName.trim()) return;

    try {
      const exists = await db.classes.where('name').equalsIgnoreCase(newClassName.trim()).first();
      if (exists) {
        alert('A class with this name already exists.');
        return;
      }

      await db.classes.add({
        name: newClassName.trim(),
        state: 'Synced',
        createdAt: new Date()
      });

      setNewClassName('');
      setShowAddClassModal(false);
    } catch (err: any) {
      alert(`Error adding class: ${err.message}`);
    }
  };

  const handleDrawerAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassName || !drawerRollNo || !drawerName) return;

    if (drawerRollNo.length !== 10 || isNaN(Number(drawerRollNo))) {
      alert('Student Roll ID must be exactly a 10-digit number.');
      return;
    }

    try {
      const exists = await db.students.where('studentNum').equals(drawerRollNo).first();
      if (exists) {
        alert(`A student with Roll ID ${drawerRollNo} is already registered (${exists.name}).`);
        return;
      }

      await db.students.add({
        name: drawerName.trim(),
        studentNum: drawerRollNo,
        className: selectedClassName,
        email: drawerEmail.trim() || undefined,
        phone: drawerPhone.trim() || undefined
      });

      setDrawerRollNo('');
      setDrawerName('');
      setDrawerEmail('');
      setDrawerPhone('');
      setShowAddStudentDrawer(false);
    } catch (err: any) {
      alert(`Error adding student: ${err.message}`);
    }
  };



  // Printing Action
  const triggerPrint = (exam: Exam) => {
    setPrintExam(exam);
    setTimeout(() => {
      window.print();
      setPrintExam(null);
    }, 300);
  };

  const triggerPrintReport = async (subInfo: { score: number; answers: Record<number, string>; scannedAt: Date; studentId: number }) => {
    const examObj = exams.find(e => e.id === scannerExamId || e.id === selectedExamId);
    const studentObj = students.find(s => s.id === subInfo.studentId);
    if (!examObj || !studentObj) {
      alert("Could not load student or exam details for the report card.");
      return;
    }

    setPrintReportData({
      exam: examObj,
      student: studentObj,
      submission: subInfo
    });

    setTimeout(() => {
      window.print();
      setPrintReportData(null);
    }, 500);
  };

  const handleDownloadJPG = (exam: Exam) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1414;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background white page
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 1414);

    // Red outer frame border
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 4;
    ctx.strokeRect(70, 70, 860, 1300);

    // 4 black square corner anchors
    ctx.fillStyle = '#000000';
    // TL
    ctx.fillRect(30 - 10, 30 - 10, 20, 20);
    // TR
    ctx.fillRect(970 - 10, 30 - 10, 20, 20);
    // BL
    ctx.fillRect(30 - 10, 1384 - 10, 20, 20);
    // BR
    ctx.fillRect(970 - 10, 1384 - 10, 20, 20);

    // Title banner text
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(exam.title.toUpperCase(), 500, 90);
    ctx.font = 'bold 12px Arial';
    ctx.fillText(`OMR ANSWER BUBBLE SHEET - ${exam.numQuestions} QUESTIONS`, 500, 115);

    // Draw background borders for Roll No, Test Booklet, Booklet Code
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(70, 130, 275, 283); // Roll No Box
    ctx.strokeRect(345, 130, 200, 283); // Test Booklet Box
    ctx.strokeRect(545, 130, 385, 283); // Booklet Code Box

    // Section Titles
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 10px Arial';
    ctx.fillText("ROLL NO. / अनुक्रमांक", 207, 145);
    ctx.fillText("TEST BOOKLET NO.", 445, 145);
    ctx.fillText("BOOKLET CODE / पुस्तिका कोड", 737, 145);

    // Draw grid headers for Roll No
    const DIGIT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const xRollStart = OMR_CONFIG.studentId.xStart;
    const xRollStep = OMR_CONFIG.studentId.xStep;
    const yRollStart = OMR_CONFIG.studentId.yStart;
    const yRollStep = OMR_CONFIG.studentId.yStep;
    ctx.lineWidth = 1.0;
    for (let col = 0; col < 10; col++) {
      const x = xRollStart + col * xRollStep;
      ctx.strokeRect(x - 10, yRollStart - 28, 20, 20);
    }
    // Draw grid bubbles for Roll No
    for (let col = 0; col < 10; col++) {
      const x = xRollStart + col * xRollStep;
      for (let row = 0; row < 10; row++) {
        const y = yRollStart + row * yRollStep;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.font = 'bold 8px Arial';
        // Draw the text in very light pink (makes it invisible to OpenCV scanner)
        ctx.fillStyle = '#ffdbe3';
        ctx.fillText(DIGIT_VALUES[row].toString(), x, y + 3);
      }
    }

    // Test Booklet No grid
    const xBkStart = OMR_CONFIG.bookletNo.xStart;
    const xBkStep = OMR_CONFIG.bookletNo.xStep;
    const yBkStart = OMR_CONFIG.bookletNo.yStart;
    for (let col = 0; col < 7; col++) {
      const x = xBkStart + col * xBkStep;
      ctx.strokeRect(x - 10, yBkStart - 28, 20, 20);
    }
    for (let col = 0; col < 7; col++) {
      const x = xBkStart + col * xBkStep;
      for (let row = 0; row < 10; row++) {
        const y = yRollStart + row * yRollStep;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.font = 'bold 8px Arial';
        // Draw text in very light pink
        ctx.fillStyle = '#ffdbe3';
        ctx.fillText(DIGIT_VALUES[row].toString(), x, y + 3);
      }
    }

    // Booklet Code grid
    const bcOptions = ['A', 'B', 'C', 'D'];
    for (let col = 0; col < 4; col++) {
      const x = 580 + col * 35;
      ctx.strokeRect(x - 10, 162, 20, 20);
      ctx.fillStyle = '#dc0045';
      ctx.font = 'bold 10px Arial';
      ctx.fillText(bcOptions[col], x, 175);
    }
    // Draw columns for Booklet Code
    for (let col = 0; col < 4; col++) {
      const x = 580 + col * 35;
      for (let row = 0; row < 4; row++) {
        const y = 205 + row * 21;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.font = 'bold 8px Arial';
        // Draw text in very light pink
        ctx.fillStyle = '#ffdbe3';
        ctx.fillText(bcOptions[row], x, y + 3);
      }
    }

    // Draw Questions Grid (using target coordinates from OMR_CONFIG)
    const OPTIONS = ['A', 'B', 'C', 'D'];
    const qConf = OMR_CONFIG.questions;
    
    for (const col of qConf.columns) {
      const qStart = col.qStart;
      const qEnd = Math.min(col.qEnd, exam.numQuestions);
      if (qStart > exam.numQuestions) continue;

      // Draw Column Header
      ctx.fillStyle = '#dc0045';
      ctx.font = 'bold 9px Arial';
      ctx.fillText("Q.No.", col.xLabel, qConf.yStart - 18);
      for (let i = 0; i < 4; i++) {
        ctx.fillText(OPTIONS[i], col.xOptions[i], qConf.yStart - 18);
      }

      for (let q = qStart; q <= qEnd; q++) {
        const qIdx = q - qStart;
        const y = qConf.yStart + qIdx * qConf.yStep;

        // Draw Q Number
        ctx.fillStyle = '#dc0045';
        ctx.font = 'bold 9px Arial';
        ctx.fillText(q.toString(), col.xLabel, y + 3);

        // Draw bubbles
        for (let opt = 0; opt < 4; opt++) {
          const x = col.xOptions[opt];
          ctx.strokeStyle = '#dc0045';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, qConf.bubbleRadius, 0, 2 * Math.PI);
          ctx.stroke();
          // Draw option letter inside bubble using very light pink
          ctx.font = '8px Arial';
          ctx.fillStyle = '#ffdbe3';
          ctx.fillText(OPTIONS[opt], x, y + 3);
        }
      }
    }

    // Bottom signatures
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1;
    ctx.strokeRect(70, 1315, 275, 45); // Left box
    ctx.strokeRect(355, 1315, 275, 45); // Center box
    ctx.strokeRect(640, 1315, 275, 45); // Right box

    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 8px Arial';
    ctx.fillText("Candidate Signature", 207, 1350);
    ctx.fillText("Invigilator Signature", 492, 1350);
    ctx.fillText("Centre Superintendent Stamp", 777, 1350);

    // Download action
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${exam.title.replace(/\s+/g, '-').toLowerCase()}-blank-omr.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadDemoFilledJPG = (exam: Exam) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1414;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background white page
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 1414);

    // Red outer frame border
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 4;
    ctx.strokeRect(70, 70, 860, 1300);

    // 4 black square corner anchors
    ctx.fillStyle = '#000000';
    // TL
    ctx.fillRect(30 - 10, 30 - 10, 20, 20);
    // TR
    ctx.fillRect(970 - 10, 30 - 10, 20, 20);
    // BL
    ctx.fillRect(30 - 10, 1384 - 10, 20, 20);
    // BR
    ctx.fillRect(970 - 10, 1384 - 10, 20, 20);

    // Title banner text
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(exam.title.toUpperCase(), 500, 90);
    ctx.font = 'bold 12px Arial';
    ctx.fillText(`OMR ANSWER BUBBLE SHEET - ${exam.numQuestions} QUESTIONS`, 500, 115);

    // Draw background borders for Roll No, Test Booklet, Booklet Code
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(70, 130, 275, 283); // Roll No Box
    ctx.strokeRect(345, 130, 200, 283); // Test Booklet Box
    ctx.strokeRect(545, 130, 385, 283); // Booklet Code Box

    // Section Titles
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 10px Arial';
    ctx.fillText("ROLL NO. / अनुक्रमांक", 207, 145);
    ctx.fillText("TEST BOOKLET NO.", 445, 145);
    ctx.fillText("BOOKLET CODE / पुस्तिका कोड", 737, 145);

    // Roll No details: mock student number "1000000002" (Diya Patel)
    const mockRoll = "1000000002";
    const DIGIT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const xRollStart = OMR_CONFIG.studentId.xStart;
    const xRollStep = OMR_CONFIG.studentId.xStep;
    const yRollStart = OMR_CONFIG.studentId.yStart;
    const yRollStep = OMR_CONFIG.studentId.yStep;
    ctx.lineWidth = 1.0;

    // Draw grid headers with digits
    for (let col = 0; col < 10; col++) {
      const x = xRollStart + col * xRollStep;
      ctx.strokeRect(x - 10, yRollStart - 28, 20, 20);
      ctx.fillStyle = '#2d3748';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(mockRoll[col], x, yRollStart - 14);
    }

    // Draw grid bubbles and fill selected
    for (let col = 0; col < 10; col++) {
      const x = xRollStart + col * xRollStep;
      const activeDigit = Number(mockRoll[col]);
      for (let row = 0; row < 10; row++) {
        const y = yRollStart + row * yRollStep;
        ctx.strokeStyle = '#dc0045';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();

        if (DIGIT_VALUES[row] === activeDigit) {
          // Fill bubble
          ctx.fillStyle = '#2d3748';
          ctx.beginPath();
          ctx.arc(x, y, 6.5, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          // Empty bubble text
          ctx.font = 'bold 8px Arial';
          ctx.fillStyle = '#ffdbe3';
          ctx.fillText(DIGIT_VALUES[row].toString(), x, y + 3);
        }
      }
    }

    // Test Booklet No grid: fill 1234567
    const mockBooklet = "1234567";
    const xBkStart = OMR_CONFIG.bookletNo.xStart;
    const xBkStep = OMR_CONFIG.bookletNo.xStep;
    const yBkStart = OMR_CONFIG.bookletNo.yStart;
    for (let col = 0; col < 7; col++) {
      const x = xBkStart + col * xBkStep;
      ctx.strokeRect(x - 10, yBkStart - 28, 20, 20);
      ctx.fillStyle = '#2d3748';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(mockBooklet[col], x, yBkStart - 14);
    }
    for (let col = 0; col < 7; col++) {
      const x = xBkStart + col * xBkStep;
      const activeDigit = Number(mockBooklet[col]);
      for (let row = 0; row < 10; row++) {
        const y = yRollStart + row * yRollStep;
        ctx.strokeStyle = '#dc0045';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();

        if (DIGIT_VALUES[row] === activeDigit) {
          ctx.fillStyle = '#2d3748';
          ctx.beginPath();
          ctx.arc(x, y, 6.5, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.font = 'bold 8px Arial';
          ctx.fillStyle = '#ffdbe3';
          ctx.fillText(DIGIT_VALUES[row].toString(), x, y + 3);
        }
      }
    }

    // Booklet Code grid: fill Code 'A' (row index 0)
    const bcOptions = ['A', 'B', 'C', 'D'];
    for (let col = 0; col < 4; col++) {
      const x = 580 + col * 35;
      ctx.strokeRect(x - 10, 162, 20, 20);
      ctx.fillStyle = '#2d3748';
      ctx.font = 'bold 12px Arial';
      if (col === 0) {
        ctx.fillText('A', x, 176);
      }
    }
    for (let col = 0; col < 4; col++) {
      const x = 580 + col * 35;
      for (let row = 0; row < 4; row++) {
        const y = 205 + row * 21;
        ctx.strokeStyle = '#dc0045';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();

        if (col === 0 && row === 0) {
          // Fill A bubble
          ctx.fillStyle = '#2d3748';
          ctx.beginPath();
          ctx.arc(x, y, 6.5, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.font = 'bold 8px Arial';
          ctx.fillStyle = '#ffdbe3';
          ctx.fillText(bcOptions[row], x, y + 3);
        }
      }
    }

    // Draw Questions and Fill correct answers (mostly correct, some empty/wrong)
    const OPTIONS = ['A', 'B', 'C', 'D'];
    const qConf = OMR_CONFIG.questions;
    
    for (const col of qConf.columns) {
      const qStart = col.qStart;
      const qEnd = Math.min(col.qEnd, exam.numQuestions);
      if (qStart > exam.numQuestions) continue;

      // Draw Column Header
      ctx.fillStyle = '#dc0045';
      ctx.font = 'bold 9px Arial';
      ctx.fillText("Q.No.", col.xLabel, qConf.yStart - 18);
      for (let i = 0; i < 4; i++) {
        ctx.fillText(OPTIONS[i], col.xOptions[i], qConf.yStart - 18);
      }

      for (let q = qStart; q <= qEnd; q++) {
        const qIdx = q - qStart;
        const y = qConf.yStart + qIdx * qConf.yStep;

        // Draw Q Number
        ctx.fillStyle = '#dc0045';
        ctx.font = 'bold 9px Arial';
        ctx.fillText(q.toString(), col.xLabel, y + 3);

        const correctOpt = exam.answerKey[q] || 'A';
        // Fill answers: Aarav/Diya style (95% correct, 5% wrong or empty)
        let fillOption = correctOpt;
        if (q % 17 === 0) {
          // Unanswered
          fillOption = '';
        } else if (q % 23 === 0) {
          // Wrong answer
          fillOption = correctOpt === 'A' ? 'B' : 'A';
        }

        // Draw bubbles
        for (let opt = 0; opt < 4; opt++) {
          const x = col.xOptions[opt];
          ctx.strokeStyle = '#dc0045';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, qConf.bubbleRadius, 0, 2 * Math.PI);
          ctx.stroke();

          if (OPTIONS[opt] === fillOption) {
            // Fill bubble
            ctx.fillStyle = '#2d3748';
            ctx.beginPath();
            ctx.arc(x, y, qConf.bubbleRadius - 0.5, 0, 2 * Math.PI);
            ctx.fill();
          } else {
            // Light bubble letter
            ctx.font = '8px Arial';
            ctx.fillStyle = '#ffdbe3';
            ctx.fillText(OPTIONS[opt], x, y + 3);
          }
        }
      }
    }

    // Bottom signatures
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1;
    ctx.strokeRect(70, 1315, 275, 45); // Left box
    ctx.strokeRect(355, 1315, 275, 45); // Center box
    ctx.strokeRect(640, 1315, 275, 45); // Right box

    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 8px Arial';
    ctx.fillText("Candidate Signature", 207, 1350);
    ctx.fillText("Invigilator Signature", 492, 1350);
    ctx.fillText("Centre Superintendent Stamp", 777, 1350);

    // Mock handwriting-like signatures in the signatures boxes
    ctx.strokeStyle = '#1a365d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(120, 1335); ctx.quadraticCurveTo(150, 1320, 180, 1340); ctx.stroke(); // Candidate signature mockup

    // Download action
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${exam.title.replace(/\s+/g, '-').toLowerCase()}-filled-demo-scan.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Scanner File Upload & Capture Processing
  const processImageForOMR = async (imageElement: HTMLImageElement | HTMLCanvasElement) => {
    if (!scannerExamId) {
      alert('Please select the exam first.');
      return;
    }
    const exam = exams.find(e => e.id === scannerExamId);
    if (!exam) return;

    setIsScanning(true);
    setScanError(null);
    setScanResult(null);

    try {
      // Run CV scanning pipeline
      const result = await scanOMRSheet(imageElement, exam.numQuestions);

      // Match Student ID in db
      const student = await db.students.where('studentNum').equals(result.studentNum).first();
      
      // Calculate initial score based on correct options and custom marking scheme
      let score = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;
      const cMarks = typeof exam.correctMarks === 'number' ? exam.correctMarks : 4;
      const iMarks = typeof exam.incorrectMarks === 'number' ? exam.incorrectMarks : -1;
      const uMarks = typeof exam.unansweredMarks === 'number' ? exam.unansweredMarks : 0;

      for (let q = 1; q <= exam.numQuestions; q++) {
        const studentAns = result.answers[q];
        const correctAns = exam.answerKey[q];
        if (!studentAns) {
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

      setScanResult({
        detectedStudentNum: result.studentNum,
        studentName: student ? student.name : 'Unknown Student',
        studentId: student ? student.id! : null,
        score,
        answers: result.answers,
        warpedCanvas: result.debugWarpedCanvas || null,
        correctCount,
        wrongCount,
        unansweredCount
      });

      if (student) {
        confetti({ particleCount: 50, spread: 45 });
      }

    } catch (err: any) {
      setScanError(err.message || 'Image processing failed. Ensure anchors are visible.');
    } finally {
      setIsScanning(false);
    }
  };

  // Simulates a physical skewed, rotated photograph of a completed NEET sheet on a desk
  const handleSimulateScan = async () => {
    if (!scannerExamId) {
      alert('Please select an exam first.');
      return;
    }
    const exam = exams.find(e => e.id === scannerExamId);
    if (!exam) return;

    // Pick a random mock student or create one
    let student = students[Math.floor(Math.random() * students.length)];
    if (!student) {
      alert('Please click "Load Demo Setup" first to load mock students.');
      return;
    }

    setIsScanning(true);
    setScanError(null);
    setScanResult(null);

    // Create a programmatical OMR sheet canvas (1000x1414)
    const omrCanvas = document.createElement('canvas');
    omrCanvas.width = 1000;
    omrCanvas.height = 1414;
    const ctx = omrCanvas.getContext('2d');
    if (!ctx) return;

    // Background white page
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 1414);

    // Red outer frame border
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 4;
    ctx.strokeRect(70, 70, 860, 1274);

    // 4 black square corner anchors (critical for CV detection!)
    ctx.fillStyle = '#000000';
    // TL
    ctx.fillRect(30 - 10, 30 - 10, 20, 20);
    // TR
    ctx.fillRect(970 - 10, 30 - 10, 20, 20);
    // BL
    ctx.fillRect(30 - 10, 1384 - 10, 20, 20);
    // BR
    ctx.fillRect(970 - 10, 1384 - 10, 20, 20);

    // Title banner text
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(exam.title.toUpperCase(), 500, 90);
    ctx.font = 'bold 12px Arial';
    ctx.fillText(`OMR ANSWER BUBBLE SHEET - ${exam.numQuestions} QUESTIONS`, 500, 115);

    // Draw background borders for Roll No, Test Booklet, Booklet Code
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(70, 112, 275, 283); // Roll No Box
    ctx.strokeRect(345, 112, 200, 283); // Test Booklet Box
    ctx.strokeRect(545, 112, 385, 283); // Booklet Code Box

    // Fill Roll No grid bubbles
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const rollIdStr = student.studentNum.padStart(10, '0');
    for (let col = 0; col < 10; col++) {
      const activeDigit = Number(rollIdStr[col]);
      const x = 100 + col * 25;
      
      // Draw digit box header
      ctx.strokeStyle = '#dc0045';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 6, 162 - 6, 12, 12);
      ctx.fillStyle = '#000000';
      ctx.font = '9px Arial';
      ctx.fillText(activeDigit.toString(), x, 166);

      // Draw bubbles
      for (let r = 0; r < 10; r++) {
        const y = 190 + r * 21;
        const bubbleVal = digits[r];
        if (bubbleVal === activeDigit) {
          // Fill bubble
          ctx.fillStyle = '#2d3748';
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          // Empty bubble
          ctx.strokeStyle = '#dc0045';
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    }

    // Fill Test Booklet No (mock 7-digit number "3933115")
    const mockBooklet = '3933115';
    for (let col = 0; col < 7; col++) {
      const activeDigit = Number(mockBooklet[col]);
      const x = 370 + col * 25;
      // Draw digit header
      ctx.strokeStyle = '#dc0045';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 6, 162 - 6, 12, 12);
      ctx.fillStyle = '#000000';
      ctx.font = '9px Arial';
      ctx.fillText(activeDigit.toString(), x, 166);

      // Draw bubbles
      for (let r = 0; r < 10; r++) {
        const y = 190 + r * 21;
        const bubbleVal = digits[r];
        if (bubbleVal === activeDigit) {
          ctx.fillStyle = '#2d3748';
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.strokeStyle = '#dc0045';
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    }

    // Booklet Code (Fill A)
    for (let i = 0; i < 4; i++) {
      const x = 610 + i * 45;
      const y = 175;
      if (i === 0) {
        ctx.fillStyle = '#2d3748';
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#dc0045';
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }

    // Draw Questions (mostly correct answers)
    const options = ['A', 'B', 'C', 'D'];
    const columns = OMR_CONFIG.questions.columns;

    for (let q = 1; q <= exam.numQuestions; q++) {
      let colConf = null;
      for (const col of columns) {
        if (q >= col.qStart && q <= col.qEnd) {
          colConf = col;
          break;
        }
      }
      if (!colConf) continue;

      const qIndex = q - colConf.qStart;
      const y = OMR_CONFIG.questions.yStart + qIndex * OMR_CONFIG.questions.yStep;

      // Determine answer: 92% correct, 5% incorrect, 3% unanswered
      const rand = Math.random();
      let chosenOpt = '';
      const correctOpt = exam.answerKey[q];
      
      if (rand < 0.92) {
        chosenOpt = correctOpt;
      } else if (rand < 0.97) {
        chosenOpt = options.find(o => o !== correctOpt) || 'A';
      }

      for (let optIdx = 0; optIdx < 4; optIdx++) {
        const x = colConf.xOptions[optIdx];
        const optChar = options[optIdx];
        
        if (optChar === chosenOpt) {
          ctx.fillStyle = '#2d3748';
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.strokeStyle = '#dc0045';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    }

    // CREATE CAMERA PHOTO SIMULATION (Desk background with a skewed angle!)
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = 1280;
    photoCanvas.height = 720;
    const pCtx = photoCanvas.getContext('2d');
    if (!pCtx) return;

    // Draw wood desk background
    pCtx.fillStyle = '#5c4033';
    pCtx.fillRect(0, 0, 1280, 720);
    pCtx.strokeStyle = '#3d2b22';
    pCtx.lineWidth = 4;
    for (let l = 0; l < 20; l++) {
      pCtx.beginPath();
      pCtx.moveTo(0, l * 40);
      pCtx.lineTo(1280, l * 40 + Math.sin(l) * 20);
      pCtx.stroke();
    }

    // Skew and rotate
    pCtx.save();
    pCtx.translate(640, 360);
    pCtx.rotate(3.5 * Math.PI / 180);
    pCtx.scale(0.44, 0.44);
    
    // Draw shadow
    pCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    pCtx.shadowBlur = 30;
    pCtx.shadowOffsetX = 10;
    pCtx.shadowOffsetY = 15;
    
    pCtx.drawImage(omrCanvas, -500, -707);
    pCtx.restore();

    await processImageForOMR(photoCanvas);
  };

  // File Input Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      processImageForOMR(img);
    };
    img.src = URL.createObjectURL(file);
  };

  // Synchronize Classes table with Students classes on startup if empty
  const studentsClassNames = students.map(s => s.className).join(',');
  useEffect(() => {
    const syncClasses = async () => {
      if (studentsClassNames.length > 0 && classes.length === 0) {
        const uniqueClasses = Array.from(new Set(studentsClassNames.split(',')));
        for (const clsName of uniqueClasses) {
          try {
            await db.classes.add({
              name: clsName,
              state: 'Synced',
              createdAt: new Date()
            });
          } catch {
            // Already exists or concurrency
          }
        }
      } else if (studentsClassNames.length === 0 && classes.length === 0) {
        const defaultClasses = ['NEET 1', 'NEET'];
        for (const clsName of defaultClasses) {
          try {
            await db.classes.add({
              name: clsName,
              state: 'Synced',
              createdAt: new Date()
            });
          } catch {
            // Already exists
          }
        }
      }
    };
    syncClasses();
  }, [studentsClassNames, classes.length]);

  // Webcam Operations
  useEffect(() => {
    if (useWebcam) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setCameraDevices(videoDevices);
        if (videoDevices.length > 0 && !selectedCameraId) {
          setSelectedCameraId(videoDevices[0].deviceId);
        }
      });
    } else {
      // stop stream
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [useWebcam, selectedCameraId]);

  useEffect(() => {
    if (useWebcam && selectedCameraId) {
      navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCameraId }, width: 1280, height: 720 }
      }).then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }).catch(err => {
        alert(`Error opening camera: ${err.message}`);
        setUseWebcam(false);
      });
    }
  }, [selectedCameraId, useWebcam]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        processImageForOMR(canvas);
      }
    }
  };

  // Edit Scan verification parameters before saving
  const handleVerifyAnswerChange = (q: number, option: string) => {
    if (!scanResult || !scannerExamId) return;
    const exam = exams.find(e => e.id === scannerExamId);
    if (!exam) return;

    const updatedAnswers = { ...scanResult.answers, [q]: option };
    
    // Recalculate score based on custom marking scheme
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    const cMarks = typeof exam.correctMarks === 'number' ? exam.correctMarks : 4;
    const iMarks = typeof exam.incorrectMarks === 'number' ? exam.incorrectMarks : -1;
    const uMarks = typeof exam.unansweredMarks === 'number' ? exam.unansweredMarks : 0;

    for (let i = 1; i <= exam.numQuestions; i++) {
      const studentAns = updatedAnswers[i];
      const correctAns = exam.answerKey[i];
      if (!studentAns) {
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

    setScanResult(prev => prev ? {
      ...prev,
      answers: updatedAnswers,
      score,
      correctCount,
      wrongCount,
      unansweredCount
    } : null);
  };

  const handleVerifyStudentChange = async (studentIdStr: string) => {
    if (!scanResult) return;
    const sId = Number(studentIdStr);
    const student = students.find(s => s.id === sId);
    if (student) {
      setScanResult(prev => prev ? {
        ...prev,
        studentId: student.id!,
        studentName: student.name,
        detectedStudentNum: student.studentNum
      } : null);
    }
  };

  // Save scan result to Database
  const handleSaveScanResult = async () => {
    if (!scanResult || !scannerExamId) return;
    if (!scanResult.studentId) {
      alert('Please associate this scan with a registered student first.');
      return;
    }

    try {
      // Check if duplicate submission exists
      const duplicate = await db.submissions
        .where('[examId+studentId]')
        .equals([scannerExamId, scanResult.studentId])
        .first();

      if (duplicate) {
        if (!confirm('This student already has a submission saved for this exam. Overwrite?')) {
          return;
        }
        await db.submissions.delete(duplicate.id!);
      }

      await db.submissions.add({
        examId: scannerExamId,
        studentId: scanResult.studentId,
        score: scanResult.score,
        answers: scanResult.answers,
        scannedAt: new Date()
      });

      confetti({ particleCount: 100, spread: 80 });
      alert(`Score of ${scanResult.score} saved successfully for ${scanResult.studentName}!`);
      
      // Reset scan states
      setScanResult(null);
      setUseWebcam(false);
    } catch (err: any) {
      alert(`Error saving submission: ${err.message}`);
    }
  };

  // Helper Stats and Rankings logic
  const getExamSubmissions = (examId: number) => {
    return submissions.filter(s => s.examId === examId);
  };

  const getRankedLeaderboard = (examId: number) => {
    const examSubs = getExamSubmissions(examId);
    const studentMap = new Map(students.map(s => [s.id, s]));

    const sorted = examSubs.map(sub => {
      const student = studentMap.get(sub.studentId);
      return {
        ...sub,
        studentName: student ? student.name : 'Unknown',
        studentNum: student ? student.studentNum : '',
        className: student ? student.className : ''
      };
    }).sort((a, b) => b.score - a.score);

    // Calculate ranks (dense rank logic resolving ties)
    let currentRank = 0;
    let lastScore = -1;
    let countInTie = 0;

    return sorted.map((s) => {
      if (s.score !== lastScore) {
        currentRank = currentRank + countInTie + 1;
        countInTie = 0;
        lastScore = s.score;
      } else {
        countInTie++;
      }
      return { ...s, rank: currentRank };
    });
  };

  if (onlineExamId !== null) {
    return (
      <OnlineExamPortal 
        examId={onlineExamId} 
        onClose={() => {
          // Reset URL search parameters and reload/reset state
          window.history.replaceState({}, document.title, window.location.pathname);
          setOnlineExamId(null);
        }} 
      />
    );
  }

  // 2. Auth Gate: Intercept render if no session is active or logged in as student
  if (sessionRole === null) {
    return (
      <UnifiedLoginPortal 
        onLoginSuccess={(role, studId) => {
          localStorage.setItem('appex_session_role', role);
          if (studId) {
            localStorage.setItem('appex_session_student_id', String(studId));
          }
          setSessionRole(role);
          setSessionStudentId(studId || null);
        }}
      />
    );
  }

  if (sessionRole === 'student') {
    return (
      <StudentReportPortal 
        studentId={sessionStudentId!} 
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="app-container">
      {/* 1. PRINT ONLY CONTAINER: Loaded on print dialog */}
      {printExam && (
        <div className="print-only">
          <OmrPrintSheet 
            examTitle={printExam.title} 
            numQuestions={printExam.numQuestions} 
          />
        </div>
      )}
      {printReportData && (
        <div className="print-only">
          <StudentReportPrint 
            exam={printReportData.exam}
            student={printReportData.student}
            submission={printReportData.submission}
          />
        </div>
      )}

      {/* 2. NO-PRINT INTERACTIVE WEB APP: Main Dashboard */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      {/* Mobile Top Header Navigation */}
      <header className="mobile-header no-print">
        <button 
          className="hamburger-btn" 
          onClick={() => setMobileMenuOpen(true)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Menu size={24} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>⚡</span>
          <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Appex</span>
        </div>
        <div style={{ width: '24px' }}></div>
      </header>

      <div className="no-print app-layout">
        
        {/* Sidebar Panel */}
        <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
          <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 20px' }}>
            <span style={{ fontSize: '1.4rem', color: 'var(--primary)', marginRight: '-2px' }}>⚡</span>
            <span style={{ fontWeight: 'bold', fontSize: '1.1rem', letterSpacing: '0.5px', color: 'var(--text-primary)' }}>Appex</span>
          </div>

          <nav className="sidebar-nav">
            <button 
              className={`nav-item ${activeTab === 'exams' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('exams');
                setSelectedExamId(null);
                setMobileMenuOpen(false);
              }}
            >
              <FileText size={18} /> Exams
            </button>
            <button 
              className="nav-item disabled-nav" 
              onClick={() => alert('Attendance Module is coming soon!')}
            >
              <CheckCircle size={18} /> Attendance
            </button>
            <button 
              className={`nav-item ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('students');
                setMobileMenuOpen(false);
              }}
            >
              <Users size={18} /> Classes
            </button>
            <button 
              className="nav-item disabled-nav" 
              onClick={() => alert('Teachers Module is coming soon!')}
            >
              <Users size={18} /> Teachers
            </button>
            <button 
              className="nav-item disabled-nav" 
              onClick={() => alert('Question Banks Module is coming soon!')}
            >
              <BookOpen size={18} /> Question Banks
            </button>
            <button 
              className={`nav-item ${activeTab === 'analysis' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('analysis');
                setMobileMenuOpen(false);
              }}
            >
              <Award size={18} /> Reports
            </button>
             <button 
              className={`nav-item ${activeTab === 'scanner' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('scanner');
                setMobileMenuOpen(false);
              }}
            >
              <Camera size={18} /> OMR Scanner
            </button>
            <button 
              className="nav-item"
              onClick={() => {
                handleLogout();
                setMobileMenuOpen(false);
              }}
              style={{ color: '#e53e3e', borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' }}
            >
              <LogOut size={18} /> Log Out
            </button>
          </nav>

          {/* Seed Data Utility in sidebar */}
          <div className="sidebar-footer">
            <button className="btn-seed" onClick={() => handleSeedData(false)} style={{ width: '100%', marginBottom: '8px' }}>
              <RefreshCw size={14} /> Load Demo Setup
            </button>
            
            <div className="cv-status">
              {cvLoaded ? (
                <span className="status-badge success"><Check size={12} /> OpenCV.js Ready</span>
              ) : cvError ? (
                <span className="status-badge error"><AlertTriangle size={12} /> OpenCV Load Failed</span>
              ) : (
                <span className="status-badge loading"><RefreshCw size={12} className="spin" /> Loading CV Engine...</span>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="main-viewport">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="tab-pane animate-fade-in">
              <header className="pane-header">
                <h2>Overview Dashboard</h2>
                <p className="subtitle">Welcome to OMR Scanner. Administer and grade paper exams offline instantly.</p>
              </header>

              <div className="stats-grid">
                <div className="stat-card glass-card">
                  <div className="stat-info">
                    <span className="stat-label">Registered Students</span>
                    <span className="stat-val">{students.length}</span>
                  </div>
                  <Users className="stat-icon purple" />
                </div>

                <div className="stat-card glass-card">
                  <div className="stat-info">
                    <span className="stat-label">Exams Created</span>
                    <span className="stat-val">{exams.length}</span>
                  </div>
                  <FileText className="stat-icon indigo" />
                </div>

                <div className="stat-card glass-card">
                  <div className="stat-info">
                    <span className="stat-label">Total Graded Papers</span>
                    <span className="stat-val">{submissions.length}</span>
                  </div>
                  <CheckCircle className="stat-icon emerald" />
                </div>
              </div>

              <div className="dashboard-content">
                <div className="glass-card recent-scans">
                  <h3>Recent Graded Exams</h3>
                  {submissions.length === 0 ? (
                    <div className="empty-state">
                      <p>No scans completed yet. Go to OMR Scanner to scan your first sheet.</p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table className="app-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Student</th>
                            <th>Exam</th>
                            <th>Score</th>
                            <th>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {submissions.slice(-5).reverse().map((sub) => {
                            const s = students.find(std => std.id === sub.studentId);
                            const e = exams.find(ex => ex.id === sub.examId);
                            return (
                              <tr key={`recent-${sub.id}`}>
                                <td>{new Date(sub.scannedAt).toLocaleDateString()}</td>
                                <td><strong>{s ? s.name : 'Unknown'}</strong></td>
                                <td>{e ? e.title : 'Deleted Exam'}</td>
                                <td>{sub.score} / {e ? e.numQuestions * (e.correctMarks ?? 4) : 0}</td>
                                <td>
                                  {(() => {
                                    const totalPossible = e ? e.numQuestions * (e.correctMarks ?? 4) : 1;
                                    const pct = totalPossible > 0 ? Math.max(0, Math.round((sub.score / totalPossible) * 100)) : 0;
                                    return (
                                      <span className={`pill ${pct >= 50 ? 'pass' : 'fail'}`}>
                                        {pct}%
                                      </span>
                                    );
                                  })()}
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
            </div>
          )}

          {/* TAB 2: CLASSES & STUDENTS PANEL */}
          {activeTab === 'students' && (
            <div className="tab-pane animate-fade-in">
              {selectedClassName === null ? (
                /* CLASS LISTING VIEW (Screenshot 1) */
                <div className="classes-portal">
                  <header className="pane-header">
                    <div>
                      <h2 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0 }}>Classes</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '6px' }}
                        onClick={() => alert('Manage Invite Links module is coming soon!')}
                      >
                        <Link size={16} /> Manage invite links
                      </button>
                      <button 
                        className="btn-primary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '6px' }}
                        onClick={() => setShowAddClassModal(true)}
                      >
                        <Plus size={16} /> Add class
                      </button>
                    </div>
                  </header>

                  <div className="glass-card mt-4">
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table className="app-table">
                        <thead>
                          <tr>
                            <th style={{ width: '40px' }}><input type="checkbox" readOnly /></th>
                            <th>
                              <button 
                                style={{ background: 'transparent', border: 'none', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: 0 }}
                                onClick={() => {
                                  setClassSortField('name');
                                  setClassSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                }}
                              >
                                Class Name {classSortField === 'name' && (classSortOrder === 'asc' ? '↓' : '↑')}
                              </button>
                            </th>
                            <th>
                              <button 
                                style={{ background: 'transparent', border: 'none', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: 0 }}
                                onClick={() => {
                                  setClassSortField('studentsCount');
                                  setClassSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                }}
                              >
                                No. Of Students {classSortField === 'studentsCount' && (classSortOrder === 'asc' ? '↓' : '↑')}
                              </button>
                            </th>
                            <th>State</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const classList = [...classes];
                            classList.sort((a, b) => {
                              if (classSortField === 'name') {
                                return classSortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
                              } else {
                                const countA = students.filter(s => s.className === a.name).length;
                                const countB = students.filter(s => s.className === b.name).length;
                                return classSortOrder === 'asc' ? countA - countB : countB - countA;
                              }
                            });

                            if (classList.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', opacity: 0.6 }}>
                                    No classes created yet. Click "+ Add class" to start.
                                  </td>
                                </tr>
                              );
                            }

                            return classList.map(cls => {
                              const count = students.filter(s => s.className === cls.name).length;
                              return (
                                <tr key={`cls-row-${cls.id}`} className="hover-row">
                                  <td><input type="checkbox" readOnly /></td>
                                  <td>
                                    <span 
                                      style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}
                                      onClick={() => setSelectedClassName(cls.name)}
                                    >
                                      {cls.name}
                                    </span>
                                  </td>
                                  <td>{count}</td>
                                  <td>
                                    <span className="status-badge success" style={{ textTransform: 'capitalize', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <Check size={12} /> {cls.state}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <button 
                                      className="action-icon-btn text-error" 
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete class "${cls.name}" and all its registered students?`)) {
                                          await db.classes.delete(cls.id!);
                                          const related = students.filter(s => s.className === cls.name);
                                          for (const s of related) {
                                            await db.students.delete(s.id!);
                                            await db.submissions.where('studentId').equals(s.id!).delete();
                                          }
                                        }
                                      }}
                                      title="Delete Class"
                                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--error)' }}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {/* Classes Listing Footer Actions */}
                    <div style={{ display: 'flex', gap: '20px', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      <button 
                        className="btn-link" 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--primary)', background: 'transparent', border: 'none', padding: 0 }}
                        onClick={() => {
                          const bulkInput = prompt("Enter student list CSV:\nFormat: RollNo,Name,ClassName\n(One student per line)");
                          if (bulkInput) {
                            setCsvText(bulkInput);
                            setTimeout(() => handleImportCsv(), 200);
                          }
                        }}
                      >
                        <Upload size={14} /> Import csv/excel
                      </button>
                      <button 
                        className="btn-link" 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--primary)', background: 'transparent', border: 'none', padding: 0 }}
                        onClick={() => {
                          if (classes.length === 0) return alert('No classes to export.');
                          const csvRows = ['Class Name,No. Of Students,State'];
                          classes.forEach(c => {
                            const count = students.filter(s => s.className === c.name).length;
                            csvRows.push(`"${c.name}",${count},"${c.state}"`);
                          });
                          const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `classes_report_${new Date().toISOString().slice(0, 10)}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download size={14} /> Export csv
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* STUDENTS DRILL DOWN VIEW (Screenshot 3) */
                <div className="students-portal animate-fade-in">
                  {/* Breadcrumb row */}
                  <div className="breadcrumb-nav mb-3" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', opacity: 0.7 }}>
                    <span 
                      style={{ cursor: 'pointer', color: 'var(--primary)', textDecoration: 'underline' }}
                      onClick={() => setSelectedClassName(null)}
                    >
                      Classes
                    </span>
                    <ChevronRight size={14} />
                    <span style={{ fontWeight: 'bold' }}>{selectedClassName}</span>
                  </div>

                  <header className="pane-header">
                    <div>
                      <h2 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0 }}>Students</h2>
                    </div>
                    
                    {/* Top action header options */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <select 
                        value={selectedClassName}
                        onChange={(e) => setSelectedClassName(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#ffffff', fontSize: '0.9rem' }}
                      >
                        {classes.map(c => (
                          <option key={`sel-cls-${c.id}`} value={c.name}>{c.name}</option>
                        ))}
                      </select>

                      <div className="search-bar" style={{ margin: 0, padding: '4px 10px', height: '38px', width: '200px' }}>
                        <Search size={16} />
                        <input 
                          type="text" 
                          placeholder="Search..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <button 
                        className="btn-secondary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '6px' }}
                        onClick={() => alert('Create Invite Link module is coming soon!')}
                      >
                        <Link size={16} /> Create invite link
                      </button>
                      
                      <button 
                        className="btn-primary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '6px' }}
                        onClick={() => setShowAddStudentDrawer(true)}
                      >
                        <Plus size={16} /> Add student
                      </button>
                    </div>
                  </header>

                  {(() => {
                    const classStudents = students.filter(s => s.className === selectedClassName);
                    const filteredStudents = classStudents.filter(s => 
                      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      s.studentNum.includes(searchQuery)
                    );

                    if (classStudents.length === 0) {
                      /* Empty state matching Screenshot 3 */
                      return (
                        <div className="glass-card mt-4" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 24px', textAlign: 'center' }}>
                          {/* Beautiful Open Box Custom SVG */}
                          <div style={{ width: '120px', height: '120px', marginBottom: '20px', position: 'relative' }}>
                            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                              {/* Open Box Path lines */}
                              <polygon points="50,22 85,38 50,54 15,38" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2 }} />
                              <polygon points="50,54 85,38 85,68 50,84" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }} />
                              <polygon points="50,54 15,38 15,68 50,84" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }} />
                              
                              {/* Left & Right Flaps */}
                              <polygon points="15,38 35,28 35,48 15,58" fill="rgba(16, 88, 202, 0.12)" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
                              <polygon points="85,38 65,28 65,48 85,58" fill="rgba(16, 88, 202, 0.12)" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
                              
                              {/* Front Flap */}
                              <polygon points="50,54 50,84 15,68 15,38" fill="rgba(16, 88, 202, 0.05)" />
                              
                              {/* Dashed Loop trail with plane */}
                              <path d="M50,45 C50,25 35,30 42,12" fill="none" stroke="var(--primary)" strokeWidth="2" strokeDasharray="3,3" strokeLinecap="round" style={{ opacity: 0.7 }} />
                              <polygon points="42,12 36,15 39,18" fill="var(--primary)" />
                            </svg>
                          </div>
                          
                          <h3 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '0 0 8px 0' }}>No students added</h3>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '0 0 24px 0' }}>Start adding students</p>
                          
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                              className="btn-secondary" 
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '6px' }}
                              onClick={() => {
                                const csvInput = prompt("Enter student CSV format:\nRollNo,Name\n(Will be added to class " + selectedClassName + ")");
                                if (csvInput) {
                                  setCsvText(csvInput);
                                  setTimeout(() => handleImportCsv(), 200);
                                }
                              }}
                            >
                              <Upload size={16} /> Import csv
                            </button>
                            <button 
                              className="btn-primary" 
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '6px' }}
                              onClick={() => setShowAddStudentDrawer(true)}
                            >
                              <Plus size={16} /> Add student
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="glass-card mt-4">
                        <table className="app-table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px' }}><input type="checkbox" readOnly /></th>
                              <th>Roll ID</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Phone</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredStudents.length === 0 ? (
                              <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '16px', opacity: 0.6 }}>
                                  No students match search filter.
                                </td>
                              </tr>
                            ) : (
                              filteredStudents.map(s => (
                                <tr key={`stud-row-${s.id}`} className="hover-row">
                                  <td><input type="checkbox" readOnly /></td>
                                  <td><code className="font-mono">{s.studentNum}</code></td>
                                  <td><strong>{s.name}</strong></td>
                                  <td>{s.email || <span style={{ opacity: 0.4 }}>-</span>}</td>
                                  <td>{s.phone || <span style={{ opacity: 0.4 }}>-</span>}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <button 
                                      className="action-icon-btn text-error" 
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete student "${s.name}"?`)) {
                                          await db.students.delete(s.id!);
                                          await db.submissions.where('studentId').equals(s.id!).delete();
                                        }
                                      }}
                                      title="Delete Student"
                                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--error)' }}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MANAGE EXAMS */}
          {activeTab === 'exams' && (
            <div className="tab-pane animate-fade-in">
              {selectedExamId ? (
                /* EXAM DETAILS VIEW */
                (() => {
                  const examObj = exams.find(e => e.id === selectedExamId);
                  if (!examObj) {
                    return (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', gap: '8px' }}>
                        <RefreshCw size={24} className="spin" style={{ color: 'var(--primary)' }} />
                        <span>Loading Exam Details...</span>
                      </div>
                    );
                  }
                  return (
                    <ExamDetailsView 
                      exam={examObj}
                      submissions={submissions}
                      students={students}
                      onClose={() => setSelectedExamId(null)}
                      onPrintRedirect={(exam) => triggerPrint(exam)}
                      onDownloadJPG={(exam) => handleDownloadJPG(exam)}
                      onPrintReport={(sub) => triggerPrintReport(sub)}
                    />
                  );
                })()
              ) : (
                /* EXAMS LIST TABLE PAGE */
                <div className="exams-list-portal animate-fade-in">
                  <header className="pane-header">
                    <div>
                      <h2>Exams</h2>
                      <p className="subtitle">View scheduled exam entries, class sizes, and OMR submission reports.</p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-secondary" style={{ padding: '8px 12px' }} title="Filter List">
                        <TrendingUp size={16} />
                      </button>
                      <button className="btn-primary" onClick={() => setShowCreateWizard(true)}>
                        <Plus size={16} /> Create exam
                      </button>
                    </div>
                  </header>

                  <div className="glass-card">
                    {exams.length === 0 ? (
                      <div className="empty-state">
                        <p>No exams created yet. Click "+ Create exam" in the top right to start.</p>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table className="app-table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px' }}><input type="checkbox" readOnly /></th>
                              <th>Exam</th>
                              <th>Scheduled Date</th>
                              <th>Class</th>
                              <th>Student Appeared</th>
                              <th>State</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {exams.map(exam => {
                              const appeared = submissions.filter(s => s.examId === exam.id).length;
                              return (
                                <tr 
                                  key={`exam-row-${exam.id}`} 
                                  className="hover-row cursor-pointer"
                                  onClick={() => setSelectedExamId(exam.id!)}
                                >
                                  <td><input type="checkbox" onClick={(e) => e.stopPropagation()} /></td>
                                  <td><strong>{exam.title}</strong></td>
                                  <td>{new Date(exam.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                  <td>{exam.className}</td>
                                  <td>{appeared}</td>
                                  <td>NA</td>
                                  <td>
                                    <span className="status-badge private-lock-badge">
                                      <span style={{ fontSize: '10px', marginRight: '4px' }}>🔒</span> Private
                                    </span>
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
              )}

              {/* CREATE EXAM WIZARD STEPPER MODAL */}
              {showCreateWizard && (
                <ExamWizard 
                  classes={classes}
                  onClose={() => setShowCreateWizard(false)}
                  onSuccess={(newExamId) => {
                    setShowCreateWizard(false);
                    setSelectedExamId(newExamId);
                  }}
                />
              )}
            </div>
          )}

          {/* TAB 4: OMR SCANNING PORTAL */}
          {activeTab === 'scanner' && (
            <div className="tab-pane animate-fade-in">
              <header className="pane-header">
                <h2>OMR Scanning Portal</h2>
                <p className="subtitle">Scan a photo of the filled OMR sheet using your camera or file upload.</p>
              </header>

              <div className="scanner-layout">
                {/* Controls */}
                <div className="glass-card scanner-controls">
                  <h3>Scan Setup</h3>
                  <div className="form-group">
                    <label>Select Exam</label>
                    <select 
                      value={scannerExamId || ''} 
                      onChange={(e) => {
                        setScannerExamId(Number(e.target.value) || null);
                        setScanResult(null);
                        setScanError(null);
                      }}
                    >
                      <option value="">-- Choose Exam --</option>
                      {exams.map(e => (
                        <option key={e.id} value={e.id}>{e.title} ({e.numQuestions} Qs)</option>
                      ))}
                    </select>
                  </div>

                  {scannerExamId && (
                    <>
                      <div className="scan-source-toggles">
                        <button 
                          className={`btn-source ${!useWebcam ? 'active' : ''}`}
                          onClick={() => setUseWebcam(false)}
                        >
                          <Upload size={16} /> Upload Image File
                        </button>
                        <button 
                          className={`btn-source ${useWebcam ? 'active' : ''}`}
                          onClick={() => setUseWebcam(true)}
                          disabled={!cvLoaded}
                        >
                          <Camera size={16} /> Live Webcam Scan
                        </button>
                      </div>

                      <button 
                        onClick={handleSimulateScan} 
                        className="btn-seed w-full mb-4"
                        style={{ padding: '12px', fontSize: '0.9rem', borderColor: 'var(--primary)' }}
                        disabled={isScanning || !cvLoaded}
                      >
                        <RefreshCw size={16} className={isScanning ? 'spin' : ''} />
                        Simulate Skewed OMR Scan
                      </button>
                    </>
                  )}

                  {!scannerExamId ? (
                    <div className="scanner-placeholder">
                      <AlertTriangle className="warn-icon" />
                      <p>Select an exam to enable scanning inputs.</p>
                    </div>
                  ) : useWebcam ? (
                    /* Webcam Capture UI */
                    <div className="camera-view-container">
                      <div className="camera-select-row">
                        <label>Camera Source</label>
                        <select 
                          value={selectedCameraId}
                          onChange={(e) => setSelectedCameraId(e.target.value)}
                        >
                          {cameraDevices.map(d => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
                          ))}
                        </select>
                      </div>

                      <div className="video-viewport">
                        <video ref={videoRef} autoPlay playsInline muted className="live-stream"></video>
                        <div className="alignment-overlay">
                          <div className="marker-box tl" />
                          <div className="marker-box tr" />
                          <div className="marker-box bl" />
                          <div className="marker-box br" />
                          <p className="overlay-instructions">Align the 4 black corners of the paper inside the viewport and hold steady.</p>
                        </div>
                      </div>

                      <button 
                        onClick={capturePhoto} 
                        className="btn-primary w-full capture-btn"
                        disabled={isScanning}
                      >
                        {isScanning ? <RefreshCw className="spin" /> : 'Snap Photo & Scan'}
                      </button>
                      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                    </div>
                  ) : (
                    /* File Upload UI */
                    <>
                      <div className="upload-dropzone">
                        <label className="dropzone-label">
                          <Upload size={32} />
                          <span>Click to upload OMR photo</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleFileUpload} 
                            className="file-hidden"
                            disabled={isScanning}
                          />
                        </label>
                      </div>
                      <div className="demo-download-box mt-3" style={{ padding: '12px', background: '#ebf8ff', borderRadius: '8px', border: '1px solid #bee3f8', fontSize: '0.85rem', color: '#2b6cb0', textAlign: 'center' }}>
                        <span>Want to test the scanner without printing?</span>
                        <button 
                          className="btn-link" 
                          style={{ marginLeft: '6px', fontWeight: 'bold', textDecoration: 'underline', color: '#2b6cb0', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                          onClick={() => {
                            const exam = exams.find(e => e.id === scannerExamId);
                            if (exam) handleDownloadDemoFilledJPG(exam);
                          }}
                        >
                          Download Filled Demo Scan Sheet (JPG)
                        </button>
                      </div>
                    </>
                  )}

                  {isScanning && (
                    <div className="scan-loader">
                      <RefreshCw size={24} className="spin" />
                      <span>Analyzing sheet layout and scanning bubbles...</span>
                    </div>
                  )}

                  {scanError && (
                    <div className="scan-error-msg">
                      <AlertTriangle size={18} />
                      <p>{scanError}</p>
                    </div>
                  )}
                </div>

                {/* Verification Results Panel */}
                <div className="glass-card scanner-results">
                  <h3>Scan Verification</h3>
                  
                  {!scanResult ? (
                    <div className="empty-results-state">
                      <p>No paper scanned yet. Load a photo or take a capture to see details here.</p>
                    </div>
                  ) : (
                    <div className="verification-details">
                      {/* Warped alignment debug canvas preview */}
                      <div className="warped-debug-view">
                        <label>Warped Alignment Preview</label>
                        <div className="canvas-wrapper">
                          <canvas 
                            ref={(el) => {
                              if (el && scanResult.warpedCanvas) {
                                el.width = scanResult.warpedCanvas.width;
                                el.height = scanResult.warpedCanvas.height;
                                const ctx = el.getContext('2d');
                                if (ctx) {
                                  ctx.drawImage(scanResult.warpedCanvas, 0, 0);
                                }
                              }
                            }}
                            className="warped-preview-canvas"
                          />
                        </div>
                      </div>

                      {/* Map ID Verification */}
                      <div className="verify-student-row">
                        <div className="form-group">
                          <label>Detected Student ID: <code>{scanResult.detectedStudentNum}</code></label>
                          <select 
                            value={scanResult.studentId || ''} 
                            onChange={(e) => handleVerifyStudentChange(e.target.value)}
                          >
                            <option value="">-- Associate Student --</option>
                            {students.map(s => (
                              <option key={s.id} value={s.id}>{s.name} (Roll: {s.studentNum})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {(() => {
                        const examObj = exams.find(e => e.id === scannerExamId);
                        const cMarks = typeof examObj?.correctMarks === 'number' ? examObj.correctMarks : 4;
                        const totalPossible = (examObj?.numQuestions || 0) * cMarks;
                        const scorePct = totalPossible > 0 ? Math.max(0, Math.round((scanResult.score / totalPossible) * 100)) : 0;
                        return (
                          <div className="score-summary-bar" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Score: <strong>{scanResult.score} / {totalPossible}</strong></span>
                              <span className="score-pct">{scorePct}%</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '0.8rem', textAlign: 'center' }}>
                              <div style={{ background: '#e6fffa', color: '#00543d', padding: '6px', borderRadius: '6px', border: '1px solid #b2f5ea' }}>
                                <strong>{scanResult.correctCount ?? 0}</strong> Correct
                              </div>
                              <div style={{ background: '#fff5f5', color: '#742a2a', padding: '6px', borderRadius: '6px', border: '1px solid #fed7d7' }}>
                                <strong>{scanResult.wrongCount ?? 0}</strong> Wrong
                              </div>
                              <div style={{ background: '#f7fafc', color: '#4a5568', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <strong>{scanResult.unansweredCount ?? 0}</strong> Left
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Verification Table */}
                      <div className="responses-verify-grid">
                        <label>Verify Answers</label>
                        <div className="verify-scroller">
                          {Array.from({ length: exams.find(e => e.id === scannerExamId)?.numQuestions || 0 }, (_, idx) => {
                            const q = idx + 1;
                            const isCorrect = scanResult.answers[q] === exams.find(e => e.id === scannerExamId)?.answerKey[q];
                            return (
                              <div key={`verify-q-${q}`} className={`verify-q-row ${isCorrect ? 'row-correct' : 'row-incorrect'}`}>
                                <span className="q-label">Q{q}:</span>
                                <div className="opt-buttons">
                                  {['A', 'B', 'C', 'D'].map(opt => (
                                    <button
                                      key={`v-opt-${q}-${opt}`}
                                      className={`v-btn ${scanResult.answers[q] === opt ? 'active' : ''}`}
                                      onClick={() => handleVerifyAnswerChange(q, opt)}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                  <button
                                    className={`v-btn empty-btn ${!scanResult.answers[q] ? 'active' : ''}`}
                                    onClick={() => handleVerifyAnswerChange(q, '')}
                                    title="Mark Unanswered"
                                  >
                                    [ ]
                                  </button>
                                </div>
                                <span className="key-indicator">
                                  Key: {exams.find(e => e.id === scannerExamId)?.answerKey[q]}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button onClick={handleSaveScanResult} className="btn-primary w-full mt-4">
                        Confirm & Save Scores
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: REPORTS & RANKINGS */}
          {/* TAB 5: RESULT ANALYSIS */}
          {activeTab === 'analysis' && (
            <div className="tab-pane animate-fade-in">
              <header className="pane-header">
                <h2>Result Analysis</h2>
                <p className="subtitle">Inspect individual student performance, test history, and detailed question correctness grids.</p>
              </header>

              <div className="reports-layout" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px', alignItems: 'stretch' }}>
                {/* Left Pane: Student Roster List */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '720px', boxSizing: 'border-box' }}>
                  <h3>Student Roster</h3>
                  
                  {/* Search bar */}
                  <div className="search-box mb-3">
                    <Search size={16} />
                    <input 
                      type="text" 
                      placeholder="Search name or ID..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
                    {students.length === 0 ? (
                      <div className="empty-state">
                        <p>No registered students found.</p>
                      </div>
                    ) : (
                      <div className="student-list-analysis">
                        {students.filter(s => 
                          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.studentNum.includes(searchQuery)
                        ).map(s => (
                          <div 
                            key={`anal-list-${s.id}`} 
                            className={`student-roster-item ${selectedStudentId === s.id ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedStudentId(s.id!);
                              setSelectedAnalysisExamId(null);
                            }}
                          >
                            <div className="student-roster-info">
                              <span className="name">{s.name}</span>
                              <span className="desc">ID: {s.studentNum} • {s.className}</span>
                            </div>
                            <Award size={14} className="icon" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Pane: Selected Student Dashboard */}
                <div className="glass-card" style={{ minHeight: '600px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                  {!selectedStudentId ? (
                    <div className="empty-state" style={{ margin: 'auto', textAlign: 'center' }}>
                      <Award size={48} className="empty-icon mb-3" style={{ opacity: 0.4, color: 'var(--primary)' }} />
                      <h3>Select a Student</h3>
                      <p>Select a student from the roster list on the left to load their academic analysis dashboard.</p>
                    </div>
                  ) : (() => {
                    const student = students.find(s => s.id === selectedStudentId);
                    const studentSubs = submissions.filter(s => s.studentId === selectedStudentId);
                    
                    // Calc stats
                    const testsTaken = studentSubs.length;
                    
                    let totalPct = 0;
                    studentSubs.forEach(sub => {
                      const ex = exams.find(e => e.id === sub.examId);
                      if (ex) {
                        const totalPossible = ex.numQuestions * (ex.correctMarks ?? 4);
                        totalPct += (sub.score / (totalPossible || 1)) * 100;
                      }
                    });
                    const avgPctVal = testsTaken > 0 ? Math.round(totalPct / testsTaken) : 0;

                    let totalRank = 0;
                    let rankedCount = 0;
                    studentSubs.forEach(sub => {
                      const leaderboard = getRankedLeaderboard(sub.examId);
                      const rankInfo = leaderboard.find(r => r.studentId === selectedStudentId);
                      if (rankInfo) {
                        totalRank += rankInfo.rank;
                        rankedCount++;
                      }
                    });
                    const avgRankVal = rankedCount > 0 ? (totalRank / rankedCount).toFixed(1) : 'N/A';

                    let highestPct = 0;
                    let highestScoreLabel = 'N/A';
                    studentSubs.forEach(sub => {
                      const ex = exams.find(e => e.id === sub.examId);
                      if (ex) {
                        const totalPossible = ex.numQuestions * (ex.correctMarks ?? 4);
                        const pct = (sub.score / (totalPossible || 1)) * 100;
                        if (pct > highestPct) {
                          highestPct = pct;
                          highestScoreLabel = `${sub.score}/${totalPossible} (${Math.round(pct)}%)`;
                        }
                      }
                    });

                    return (
                      <div className="student-profile-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {student && (
                          <div className="profile-header mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                            <h4 style={{ fontSize: '1.4rem', margin: 0 }}>{student.name}</h4>
                            <p className="subtitle" style={{ fontSize: '0.85rem', margin: '4px 0 0 0', opacity: 0.7 }}>
                              Roll Number: <code>{student.studentNum}</code> • Class: {student.className}
                            </p>
                          </div>
                        )}

                        {testsTaken === 0 ? (
                          <div className="empty-state" style={{ margin: 'auto', textAlign: 'center' }}>
                            <p>No exam results recorded for this student yet.</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Stats Overview Grid */}
                            <div className="stats-box" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                              <div className="box-stat" style={{ padding: '10px' }}>
                                <span className="box-label" style={{ fontSize: '0.7rem' }}>Tests Taken</span>
                                <span className="box-val text-success" style={{ fontSize: '1.4rem' }}>{testsTaken}</span>
                              </div>
                              <div className="box-stat" style={{ padding: '10px' }}>
                                <span className="box-label" style={{ fontSize: '0.7rem' }}>Avg Score %</span>
                                <span className="box-val text-indigo" style={{ fontSize: '1.4rem' }}>{avgPctVal}%</span>
                              </div>
                              <div className="box-stat" style={{ padding: '10px' }}>
                                <span className="box-label" style={{ fontSize: '0.7rem' }}>Avg Rank</span>
                                <span className="box-val text-warning" style={{ fontSize: '1.4rem' }}>#{avgRankVal}</span>
                              </div>
                              <div className="box-stat" style={{ padding: '10px' }}>
                                <span className="box-label" style={{ fontSize: '0.7rem' }}>Best Attempt</span>
                                <span className="box-val text-error" style={{ fontSize: '1rem', whiteSpace: 'nowrap' }}>{highestScoreLabel}</span>
                              </div>
                            </div>

                            {/* Test History List */}
                            <div>
                              <h4 style={{ fontSize: '1rem', margin: '0 0 8px 0' }}>Exam History</h4>
                              <div className="report-card-entries" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {studentSubs.map(sub => {
                                  const exam = exams.find(e => e.id === sub.examId);
                                  const leaderboard = getRankedLeaderboard(sub.examId);
                                  const rankInfo = leaderboard.find(r => r.studentId === selectedStudentId);
                                  
                                  return (
                                    <div 
                                      key={`rep-${sub.id}`} 
                                      className={`report-card-item ${selectedAnalysisExamId === sub.examId ? 'active-item' : ''}`}
                                      style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        padding: '10px 14px', 
                                        background: selectedAnalysisExamId === sub.examId ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.02)', 
                                        border: '1px solid',
                                        borderColor: selectedAnalysisExamId === sub.examId ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                      }}
                                      onClick={() => setSelectedAnalysisExamId(sub.examId)}
                                    >
                                      <div className="report-card-desc">
                                        <h5 style={{ margin: 0, fontSize: '0.9rem' }}>{exam ? exam.title : 'Deleted Exam'}</h5>
                                        <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', opacity: 0.6 }}>Scanned on {new Date(sub.scannedAt).toLocaleDateString()}</p>
                                      </div>
                                      
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div className="report-card-grades" style={{ display: 'flex', gap: '8px' }}>
                                          <div className="grade-badge" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>
                                            <span className="label">Score</span>
                                            <span className="val">{sub.score} / {exam ? exam.numQuestions * (exam.correctMarks ?? 4) : 0}</span>
                                          </div>
                                          {rankInfo && (
                                            <div className="grade-badge" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>
                                              <span className="label">Rank</span>
                                              <span className="val text-success">#{rankInfo.rank}</span>
                                            </div>
                                          )}
                                        </div>
                                        <button className="btn-link" style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px' }}>
                                          Details &rarr;
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Detailed Response Analysis Grid */}
                            {selectedAnalysisExamId && (() => {
                              const activeExam = exams.find(e => e.id === selectedAnalysisExamId);
                              const activeSub = studentSubs.find(s => s.examId === selectedAnalysisExamId);
                              if (!activeExam || !activeSub) return null;

                              return (
                                <div className="glass-card animate-fade-in" style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', padding: '15px', marginTop: '10px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '0.95rem', margin: 0, color: 'var(--primary)' }}>
                                      Q&A Breakdown - {activeExam.title}
                                    </h4>
                                    <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                      {(() => {
                                        const totalPossible = activeExam.numQuestions * (activeExam.correctMarks ?? 4);
                                        const pct = totalPossible > 0 ? Math.max(0, Math.round((activeSub.score / totalPossible) * 100)) : 0;
                                        return (
                                          <>Score: <strong>{activeSub.score}/{totalPossible}</strong> ({pct}%)</>
                                        );
                                      })()}
                                    </span>
                                  </div>

                                  <div className="analysis-grid">
                                    {Array.from({ length: activeExam.numQuestions }).map((_, idx) => {
                                      const q = idx + 1;
                                      const response = activeSub.answers[q];
                                      const correct = activeExam.answerKey[q];
                                      const isCorrect = response === correct;
                                      const isUnanswered = !response;

                                      return (
                                        <div 
                                          key={`cell-${q}`}
                                          className={`analysis-cell ${isUnanswered ? 'analysis-cell-empty' : isCorrect ? 'analysis-cell-correct' : 'analysis-cell-incorrect'}`}
                                          title={`Question ${q}: Selected "${response || 'Unanswered'}", Correct Answer is "${correct}"`}
                                        >
                                          <span className="q-num">Q{q}</span>
                                          <span className="q-ans">{response || '-'}</span>
                                          <span className="q-key">Key: {correct}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}

                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ADD CLASS MODAL */}
      {showAddClassModal && (
        <div className="modal-backdrop" onClick={() => setShowAddClassModal(false)}>
          <div className="modal-content animate-scale-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%', background: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>Add Class</h3>
              <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }} onClick={() => setShowAddClassModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddClass} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Class Name</label>
                <input 
                  type="text" 
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g. NEET, Grade 11-B"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowAddClassModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Class</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD STUDENT SLIDE-OUT DRAWER (Screenshot 2) */}
      {showAddStudentDrawer && (
        <div className="drawer-backdrop" onClick={() => setShowAddStudentDrawer(false)}>
          <div className="drawer-panel animate-slide-left" onClick={(e) => e.stopPropagation()} style={{ width: '450px', background: '#ffffff', height: '100%', position: 'fixed', right: 0, top: 0, zIndex: 1002, boxShadow: '-5px 0 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            <header style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Add student</h3>
              <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }} onClick={() => setShowAddStudentDrawer(false)}>
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleDrawerAddStudent} style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Class Name</label>
                <input 
                  type="text" 
                  value={selectedClassName || ''} 
                  disabled 
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#f7fafc', cursor: 'not-allowed', color: '#4a5568', fontWeight: '600' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Roll No *</label>
                <input 
                  type="text" 
                  maxLength={10}
                  value={drawerRollNo}
                  onChange={(e) => setDrawerRollNo(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 10-digit Roll ID"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
                />
                <small style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px', display: 'block' }}>Must be a unique 10-digit number matching the bubbles on the OMR sheet.</small>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Name *</label>
                <input 
                  type="text" 
                  value={drawerName}
                  onChange={(e) => setDrawerName(e.target.value)}
                  placeholder="Enter student full name"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Email Id</label>
                <input 
                  type="email" 
                  value={drawerEmail}
                  onChange={(e) => setDrawerEmail(e.target.value)}
                  placeholder="Enter email address"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Phone No</label>
                <input 
                  type="text" 
                  value={drawerPhone}
                  onChange={(e) => setDrawerPhone(e.target.value)}
                  placeholder="Enter phone number"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
                />
              </div>

              {/* Drawer actions at bottom */}
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <button type="button" className="btn-secondary" style={{ padding: '10px 20px', borderRadius: '6px' }} onClick={() => setShowAddStudentDrawer(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '10px 20px', borderRadius: '6px' }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSS Stylesheet for the web app UI (glassmorphic styling, sidebar alignment) */}
      <style>{`
        .mobile-header {
          display: none;
        }

        .sidebar-backdrop {
          display: none;
        }

        .app-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .app-layout {
          display: flex;
          flex-grow: 1;
          min-height: 100vh;
        }

        .sidebar {
          width: var(--sidebar-width);
          background: rgba(10, 8, 25, 0.95);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }

        .sidebar-brand {
          padding: 24px;
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(135deg, var(--text-primary) 30%, var(--primary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .brand-icon {
          color: var(--primary);
          flex-shrink: 0;
          -webkit-text-fill-color: var(--primary);
        }

        .sidebar-nav {
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex-grow: 1;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px 16px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          border-radius: 8px;
          text-align: left;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .nav-item:hover, .nav-item.active {
          color: var(--text-primary);
          background: rgba(124, 58, 237, 0.1);
        }

        .nav-item.active {
          background: var(--primary);
          box-shadow: 0 4px 12px var(--primary-glow);
        }

        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .btn-seed {
          background: rgba(255, 255, 255, 0.05);
          border: 1px dashed var(--border-color);
          color: var(--text-secondary);
          padding: 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .btn-seed:hover {
          background: rgba(124, 58, 237, 0.1);
          border-color: var(--primary);
          color: var(--text-primary);
        }

        .status-badge {
          font-size: 0.75rem;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          justify-content: center;
          width: 100%;
        }

        .status-badge.success { background: var(--success-glow); color: var(--success); }
        .status-badge.error { background: var(--error-glow); color: var(--error); }
        .status-badge.loading { background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); }

        .main-viewport {
          flex-grow: 1;
          padding: 40px;
          overflow-y: auto;
          max-width: 1200px;
        }

        .pane-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          gap: 16px;
        }

        .pane-header h2 {
          font-size: 2rem;
          font-weight: 800;
          margin-bottom: 4px;
        }

        .subtitle {
          color: var(--text-secondary);
          font-size: 1rem;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 24px;
          margin-bottom: 40px;
        }

        .stat-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
        }

        .stat-label {
          color: var(--text-secondary);
          font-size: 0.9rem;
          font-weight: 500;
        }

        .stat-val {
          font-size: 2.2rem;
          font-weight: 800;
          line-height: 1.2;
          margin-top: 4px;
        }

        .stat-icon {
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
        }

        .stat-icon.purple { color: #8b5cf6; background: rgba(139, 92, 246, 0.1); }
        .stat-icon.indigo { color: #6366f1; background: rgba(99, 102, 241, 0.1); }
        .stat-icon.emerald { color: #10b981; background: rgba(16, 185, 129, 0.1); }

        /* Forms Layout */
        .form-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          align-items: start;
          margin-bottom: 32px;
        }

        .form-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .help-text {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .custom-textarea {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          padding: 12px;
          font-family: monospace;
          font-size: 0.9rem;
          resize: vertical;
          outline: none;
        }

        .custom-textarea:focus {
          border-color: var(--primary);
        }

        /* Lists and Tables */
        .app-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 16px;
          text-align: left;
        }

        .app-table th {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-secondary);
          font-weight: 600;
          font-size: 0.85rem;
        }

        .app-table td {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          font-size: 0.95rem;
        }

        .pill {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: bold;
        }

        .pill.pass { background: var(--success-glow); color: var(--success); }
        .pill.fail { background: var(--error-glow); color: var(--error); }
        .pill.pending { background: #feebc8; color: #c05621; }

        .btn-link {
          background: transparent;
          border: none;
          font-weight: 600;
          font-size: 0.85rem;
        }
        
        .btn-link.text-error { color: var(--error); }
        .btn-link.text-error:hover { text-decoration: underline; }

        .roster-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .search-bar {
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-color);
          padding: 0 12px;
          border-radius: 8px;
          gap: 8px;
          width: 250px;
        }

        .search-bar input {
          border: none;
          background: transparent;
          padding: 8px 0;
          color: #fff;
          outline: none;
        }

        /* Key Builder options */
        .key-builder {
          border-top: 1px solid var(--border-color);
          padding-top: 16px;
        }

        .key-scroller {
          max-height: 200px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 8px;
          margin-top: 8px;
        }

        .key-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .q-badge {
          width: 28px;
          height: 28px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .btn-opt {
          flex-grow: 1;
          padding: 6px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          border-radius: 6px;
          font-weight: bold;
          transition: all 0.2s;
        }

        .btn-opt:hover, .btn-opt.active {
          background: rgba(124, 58, 237, 0.1);
          border-color: var(--primary);
          color: var(--text-primary);
        }

        .btn-opt.active {
          background: var(--primary);
          color: #fff;
        }

        .exam-scroller {
          max-height: 480px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 16px;
        }

        .exam-card-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          border-radius: 12px;
        }

        .exam-card-info h4 {
          font-size: 1.05rem;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .exam-card-info p {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .exam-card-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* OMR Scanner Panel Styles */
        .scanner-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          align-items: start;
        }

        .scan-source-toggles {
          display: flex;
          gap: 12px;
          margin-top: 12px;
          margin-bottom: 20px;
        }

        .btn-source {
          flex-grow: 1;
          padding: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          border-radius: 8px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .btn-source.active {
          border-color: var(--primary);
          background: rgba(124, 58, 237, 0.1);
          color: var(--text-primary);
        }

        .scanner-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          border: 1px dashed var(--border-color);
          border-radius: 12px;
          color: var(--text-secondary);
          gap: 12px;
        }

        .warn-icon {
          color: var(--warning);
          size: 32px;
        }

        .upload-dropzone {
          border: 2px dashed var(--border-color);
          border-radius: 12px;
          padding: 40px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: border 0.3s;
        }

        .upload-dropzone:hover {
          border-color: var(--primary);
        }

        .dropzone-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: var(--text-secondary);
        }

        .file-hidden {
          display: none;
        }

        .camera-view-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .camera-select-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .video-viewport {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
        }

        .live-stream {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .alignment-overlay {
          position: absolute;
          inset: 0;
          border: 2px solid rgba(124,58,237,0.3);
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .marker-box {
          position: absolute;
          width: 24px;
          height: 24px;
          border: 2px solid #000;
          background: rgba(255, 255, 255, 0.2);
        }
        .marker-box.tl { top: 10px; left: 10px; }
        .marker-box.tr { top: 10px; right: 10px; }
        .marker-box.bl { bottom: 10px; left: 10px; }
        .marker-box.br { bottom: 10px; right: 10px; }

        .overlay-instructions {
          background: rgba(0,0,0,0.7);
          color: #fff;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.75rem;
          text-align: center;
          position: absolute;
          bottom: 20px;
          max-width: 80%;
        }

        .scan-loader {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          margin-top: 12px;
          color: var(--text-secondary);
        }

        .scan-error-msg {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--error-glow);
          border: 1px solid var(--error);
          border-radius: 8px;
          margin-top: 12px;
          color: var(--error);
        }

        .empty-results-state {
          padding: 80px 20px;
          text-align: center;
          color: var(--text-secondary);
          border: 1px dashed var(--border-color);
          border-radius: 12px;
        }

        .warped-debug-view {
          margin-bottom: 20px;
        }

        .warped-debug-view label {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
          display: block;
          margin-bottom: 8px;
        }

        .canvas-wrapper {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
          background: #000;
          display: flex;
          justify-content: center;
        }

        .warped-preview-canvas {
          max-width: 100%;
          height: auto;
          display: block;
          max-height: 250px;
        }

        .score-summary-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid var(--success);
          border-radius: 12px;
          font-size: 1.1rem;
          margin-bottom: 20px;
        }

        .score-pct {
          font-weight: 800;
          color: var(--success);
        }

        .responses-verify-grid {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .responses-verify-grid label {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .verify-scroller {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: rgba(0,0,0,0.1);
        }

        .verify-q-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.02);
        }

        .verify-q-row.row-correct {
          background: rgba(16, 185, 129, 0.02);
        }

        .verify-q-row.row-incorrect {
          background: rgba(239, 68, 68, 0.02);
        }

        .verify-q-row .q-label {
          width: 35px;
          font-family: monospace;
          font-weight: bold;
          font-size: 0.9rem;
        }

        .opt-buttons {
          display: flex;
          gap: 4px;
          flex-grow: 1;
        }

        .v-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-secondary);
          font-weight: bold;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .v-btn:hover {
          border-color: var(--text-secondary);
        }

        .v-btn.active {
          background: var(--primary);
          color: #fff;
          border-color: var(--primary);
        }

        .v-btn.empty-btn.active {
          background: #374151;
          color: #fff;
          border-color: #374151;
        }

        .key-indicator {
          font-size: 0.8rem;
          font-family: monospace;
          color: var(--text-muted);
          font-weight: bold;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Reports Views */
        .reports-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          align-items: start;
        }

        .stats-box {
          display: flex;
          gap: 16px;
        }

        .box-stat {
          flex-grow: 1;
          padding: 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .box-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .box-val {
          font-size: 1.5rem;
          font-weight: 800;
        }

        .text-success { color: var(--success); }
        .text-indigo { color: #6366f1; }

        .profile-header h4 {
          font-size: 1.3rem;
          font-weight: 800;
        }

        .report-card-entries {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .report-card-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          border-radius: 12px;
        }

        .report-card-desc h5 {
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 2px;
        }

        .report-card-desc p {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .report-card-grades {
          display: flex;
          gap: 12px;
        }

        .grade-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-color);
          padding: 6px 12px;
          border-radius: 8px;
          min-width: 60px;
        }

        .grade-badge .label {
          font-size: 0.65rem;
          color: var(--text-secondary);
        }

         .grade-badge .val {
          font-size: 0.9rem;
          font-weight: 700;
        }

        /* Result Analysis styles */
        .student-list-analysis {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .student-roster-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.03);
          background: rgba(255, 255, 255, 0.01);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .student-roster-item:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.08);
        }
        .student-roster-item.active {
          background: rgba(99, 102, 241, 0.08);
          border-color: rgba(99, 102, 241, 0.3);
        }
        .student-roster-item.active .icon {
          color: var(--primary);
        }
        .student-roster-item .name {
          display: block;
          font-weight: bold;
          font-size: 0.9rem;
        }
        .student-roster-item .desc {
          font-size: 0.75rem;
          opacity: 0.6;
        }
        .student-roster-item .icon {
          opacity: 0.5;
        }
        .analysis-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
          gap: 6px;
          margin-top: 10px;
          max-height: 240px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .analysis-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 6px 2px;
          border-radius: 6px;
          border: 1px solid;
          text-align: center;
        }
        .analysis-cell .q-num {
          font-size: 8px;
          font-weight: bold;
          opacity: 0.7;
        }
        .analysis-cell .q-ans {
          font-size: 13px;
          font-weight: 900;
          margin: 1px 0;
        }
        .analysis-cell .q-key {
          font-size: 8px;
          font-weight: 500;
          opacity: 0.7;
        }
        .analysis-cell-correct {
          background: rgba(16, 185, 129, 0.1) !important;
          border-color: rgba(16, 185, 129, 0.25) !important;
          color: #10b981 !important;
        }
        .analysis-cell-incorrect {
          background: rgba(244, 63, 94, 0.1) !important;
          border-color: rgba(244, 63, 94, 0.25) !important;
          color: #f43f5e !important;
        }
        .analysis-cell-empty {
          background: rgba(255, 255, 255, 0.03) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
          color: #94a3b8 !important;
        }
        .active-item {
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.15);
        }
        
        /* Drawer Backdrop Overlay */
        .drawer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(2px);
          z-index: 1001;
        }

        /* Drawer Panel Slide-in Content */
        .drawer-panel {
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
          animation: slideLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Modal backdrop centering */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1005;
        }

        /* Modal scale up styling */
        .modal-content {
          animation: scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        /* custom micro-animations keyframes */
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        /* Breadcrumb style decoration */
        .breadcrumb-nav span:hover {
          color: var(--primary-hover) !important;
        }

        @media (max-width: 992px) {
          .mobile-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            background: #ffffff;
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 0;
            z-index: 999;
            width: 100%;
            height: 60px;
          }

          .sidebar-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 1000;
            backdrop-filter: blur(2px);
          }

          .app-layout {
            flex-direction: column;
            min-height: calc(100vh - 60px);
          }

          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            width: 280px;
            z-index: 1001;
            transform: translateX(-100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 10px 0 25px rgba(0, 0, 0, 0.15);
            background: #ffffff !important;
            border-right: 1px solid var(--border-color);
          }

          .sidebar.open {
            transform: translateX(0);
          }

          .main-viewport {
            margin-left: 0 !important;
            padding: 20px 16px !important;
            max-width: 100% !important;
          }

          .form-cols {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }

          .stats-grid {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) !important;
            gap: 16px !important;
          }

          /* Ensure OMR scanner splits stack on mobile */
          .scanner-layout {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }

          /* General layouts stacking */
          .dashboard-content {
            flex-direction: column !important;
          }

          .pane-header {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            gap: 12px !important;
          }
          .pane-header > div {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .pane-header .subtitle {
            text-align: center;
          }
        }

        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
