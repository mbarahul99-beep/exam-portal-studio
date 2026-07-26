import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Student, type Exam } from './db';
import { useOpenCv } from './hooks/useOpenCv';
import { scanOMRSheet, OMR_CONFIG } from './utils/omrScanner';
import { OmrPrintSheet } from './components/OmrPrintSheet';
import confetti from 'canvas-confetti';
import { ExamWizard } from './components/ExamWizard';
import { ExamDetailsView } from './components/ExamDetailsView';
import { OnlineExamPortal } from './components/OnlineExamPortal';
import { UnifiedLoginPortal } from './components/UnifiedLoginPortal';
import { StudentReportPortal } from './components/StudentReportPortal';
import { AttendancePortal } from './components/AttendancePortal';
import { QuestionBankManager } from './components/QuestionBankManager';
import { StudentRegisterPortal } from './components/StudentRegisterPortal';
import { InviteStudentModal } from './components/InviteStudentModal';
import { PendingApprovalsModal } from './components/PendingApprovalsModal';
import { TeacherManagementModal } from './components/TeacherManagementModal';
import { TeacherManagementView } from './components/TeacherManagementView';
import { TeacherProfileModal } from './components/TeacherProfileModal';
import { InstallPWAPrompt, isAppInstalled } from './components/InstallPWAPrompt';
import { pullCloudUpdatesToIndexedDB, syncStudentToCloud, syncClassToCloud } from './utils/cloudSync';
import { 
  Users,
  UserCheck, 
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
  Trash2,
  Edit2,
  QrCode,
  X,
  LogOut,
  Menu,
  CalendarCheck,
  Settings,
  Archive,
  Filter,
  Globe,
  Lock,
  HelpCircle,
  Scan,
  MoreHorizontal,
  FileSpreadsheet,
  ListOrdered,
  Phone,
  ArrowLeft,
  MoreVertical,
  User,
  Shield,
  Download
} from 'lucide-react';

export default function App() {
  const { loaded: cvLoaded, error: cvError } = useOpenCv();
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'teachers' | 'exams' | 'scanner' | 'analysis' | 'attendance' | 'whatsapp-settings' | 'questions-bank'>('dashboard');
  const [selectedAnalysisExamId, setSelectedAnalysisExamId] = useState<number | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [onlineExamId, setOnlineExamId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  // Authentication State
  const [sessionRole, setSessionRole] = useState<'admin' | 'teacher' | 'student' | null>(
    () => (localStorage.getItem('appex_session_role') as any) || null
  );
  const [sessionStudentId, setSessionStudentId] = useState<number | null>(
    () => {
      const val = localStorage.getItem('appex_session_student_id');
      return val ? Number(val) : null;
    }
  );
  const [sessionTeacherId, setSessionTeacherId] = useState<number | null>(
    () => {
      const val = localStorage.getItem('appex_session_teacher_id');
      return val ? Number(val) : null;
    }
  );

  const [showTeacherManagementModal, setShowTeacherManagementModal] = useState(false);
  const [showTeacherProfileModal, setShowTeacherProfileModal] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('appex_session_role');
    localStorage.removeItem('appex_session_student_id');
    localStorage.removeItem('appex_session_teacher_id');
    setSessionRole(null);
    setSessionStudentId(null);
    setSessionTeacherId(null);
  };

  // Student Invite & Pending Approvals State
  const [inviteClassParam, setInviteClassParam] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPendingApprovalsModal, setShowPendingApprovalsModal] = useState(false);

  const pendingCount = useLiveQuery(
    () => db.pendingRegistrations.where('status').equals('pending').count(),
    []
  ) || 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const examIdStr = params.get('examId');
    const onlineExamIdStr = params.get('onlineExamId');
    const inviteClass = params.get('inviteClass');
    const isRegister = params.get('register');

    if (inviteClass) {
      setInviteClassParam(inviteClass);
    } else if (isRegister === 'true') {
      setInviteClassParam('NEET-2026');
    }
    
    if (onlineExamIdStr) {
      setOnlineExamId(Number(onlineExamIdStr));
    } else if (view === 'online-exam' && examIdStr) {
      setOnlineExamId(Number(examIdStr));
    }

    // Pull latest database updates from Hostinger MySQL immediately and every 3 seconds for instant real-time sync
    pullCloudUpdatesToIndexedDB();
    const interval = setInterval(pullCloudUpdatesToIndexedDB, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-seed question bank on mount
  useEffect(() => {
    const seedQuestionBank = async () => {
      try {
        const bankCount = await db.questionBanks.count();
        if (bankCount === 0) {
          // 1. Create a default library question bank
          const defaultBankId = await db.questionBanks.add({
            name: "NEET / JEE - Core Library: Mixed Topics",
            targetExam: "NEET/JEE",
            subject: "Mixed",
            topic: "Core Syllabus",
            createdAt: new Date()
          });

          // 2. Fetch and seed questions linked to this default bank
          const response = await fetch('/neet_jee_bank.json');
          if (response.ok) {
            const data = await response.json();
            const formatted = data.map((q: any) => ({
              bankId: defaultBankId,
              questionText: q.questionText,
              options: [...q.options],
              correctOptionIdx: q.correctOptionIdx,
              difficulty: q.difficulty || 'medium',
              explanation: q.explanation || '',
              createdAt: new Date()
            }));
            await db.questionBank.bulkAdd(formatted);
            console.log("Central question bank successfully auto-seeded with default bank on mount!");
          }
        }
      } catch (err) {
        console.error("Auto-seeding error:", err);
      }
    };
    seedQuestionBank();
  }, []);

  // Public Access Routing State
  const [publicReportToken, setPublicReportToken] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/report-view/')) {
        const token = hash.replace('#/report-view/', '');
        setPublicReportToken(token);
      } else {
        setPublicReportToken(null);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Fetch the submission, student, and exam details for public view
  const publicSubmissionData = useLiveQuery(async () => {
    if (!publicReportToken) return null;
    const sub = await db.submissions.where('accessToken').equals(publicReportToken).first();
    if (!sub) return null;
    const student = await db.students.get(sub.studentId);
    const exam = await db.exams.get(sub.examId);
    if (!student || !exam) return null;
    return { sub, student, exam };
  }, [publicReportToken]);
  
  // DB Live Queries
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const exams = useLiveQuery(() => db.exams.toArray()) || [];
  const submissions = useLiveQuery(() => db.submissions.toArray()) || [];
  const classes = useLiveQuery(() => db.classes.toArray()) || [];

  // Classes & Student Navigation/Modal States
  const [selectedClassName, setSelectedClassName] = useState<string | null>(null);
  const [showAddStudentDrawer, setShowAddStudentDrawer] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [viewingQrStudent, setViewingQrStudent] = useState<Student | null>(null);
  const [showAddClassModal, setShowAddClassModal] = useState(false);

  // Face Enrollment States
  const [enrollingFaceStudent, setEnrollingFaceStudent] = useState<Student | null>(null);
  const [enrollStream, setEnrollStream] = useState<MediaStream | null>(null);
  const [enrollCountdown, setEnrollCountdown] = useState<number | null>(null);
  const [enrollMessage, setEnrollMessage] = useState<string>('Center face inside the oval');
  const [enrollSuccess, setEnrollSuccess] = useState<boolean>(false);
  const [enrollDevices, setEnrollDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedEnrollDeviceId, setSelectedEnrollDeviceId] = useState<string>('');
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // Add Class Form State
  const [newClassName, setNewClassName] = useState('');

  // Add Student Drawer Form States
  const [drawerRollNo, setDrawerRollNo] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [drawerFatherName, setDrawerFatherName] = useState('');
  const [drawerEmail, setDrawerEmail] = useState('');
  const [drawerPhone, setDrawerPhone] = useState('');
  const [drawerWhatsApp, setDrawerWhatsApp] = useState('');
  const [isDrawerSameWhatsApp, setIsDrawerSameWhatsApp] = useState(true);
  const [studentMenuOpenId, setStudentMenuOpenId] = useState<number | null>(null);

  // WhatsApp API Configuration States
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [templateName, setTemplateName] = useState('exam_report_notification');
  const [templateType, setTemplateType] = useState<'body_link' | 'button_link'>('body_link');

  // Load WhatsApp settings from IndexedDB
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const tokenSetting = await db.settings.where('key').equals('metaAccessToken').first();
        const phoneSetting = await db.settings.where('key').equals('phoneNumberId').first();
        const templateSetting = await db.settings.where('key').equals('templateName').first();
        const typeSetting = await db.settings.where('key').equals('templateType').first();

        if (tokenSetting) setMetaAccessToken(tokenSetting.value);
        if (phoneSetting) setPhoneNumberId(phoneSetting.value);
        if (templateSetting) setTemplateName(templateSetting.value);
        if (typeSetting) setTemplateType(typeSetting.value as any);
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    loadSettings();
  }, [activeTab]);

  const handleSaveWhatsAppSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const keys = ['metaAccessToken', 'phoneNumberId', 'templateName', 'templateType'];
      const values = [metaAccessToken.trim(), phoneNumberId.trim(), templateName.trim(), templateType];
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const val = values[i];
        const record = await db.settings.where('key').equals(key).first();
        if (record) {
          await db.settings.update(record.id!, { value: val });
        } else {
          await db.settings.add({ key, value: val });
        }
      }
      alert('WhatsApp API Configuration saved successfully!');
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    }
  };

  // Form States
  const [csvText, setCsvText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');




  // Printing state
  const [printExam, setPrintExam] = useState<Exam | null>(null);
  const [viewingStudentAnalysisSub, setViewingStudentAnalysisSub] = useState<{ studentId: number; preSelectedExamId?: number } | null>(null);

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
        { studentNum: '1000000001', name: 'Aarav Sharma', className: 'NEET', phone: '9876543210', email: 'aarav@appexjind.in' },
        { studentNum: '1000000002', name: 'Diya Patel', className: 'NEET', phone: '9876543211', email: 'diya@appexjind.in' },
        { studentNum: '1000000003', name: 'Kabir Mehta', className: 'NEET', phone: '9876543212', email: 'kabir@appexjind.in' },
        { studentNum: '1000000004', name: 'Ananya Rao', className: 'NEET 1', phone: '9876543213', email: 'ananya@appexjind.in' },
        { studentNum: '1000000005', name: 'Rohan Gupta', className: 'NEET 1', phone: '9876543214', email: 'rohan@appexjind.in' }
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
        rollNoDigits: 10,
        examSetsCount: 1,
        subjects: [
          { name: 'Physics', numSections: 1 },
          { name: 'Chemistry', numSections: 1 },
          { name: 'Botany', numSections: 1 },
          { name: 'Zoology', numSections: 1 }
        ],
        sections: [
          { subjectName: 'Physics', sectionName: 'Section 1', qStart: 1, qCount: 50, questionType: '4 option', correctMarks: 4, incorrectMarks: -1, allowPartialMarks: false, allowOptionalAttempts: false, maxAttempts: 50 },
          { subjectName: 'Chemistry', sectionName: 'Section 1', qStart: 51, qCount: 50, questionType: '4 option', correctMarks: 4, incorrectMarks: -1, allowPartialMarks: false, allowOptionalAttempts: false, maxAttempts: 50 },
          { subjectName: 'Botany', sectionName: 'Section 1', qStart: 101, qCount: 50, questionType: '4 option', correctMarks: 4, incorrectMarks: -1, allowPartialMarks: false, allowOptionalAttempts: false, maxAttempts: 50 },
          { subjectName: 'Zoology', sectionName: 'Section 1', qStart: 151, qCount: 50, questionType: '4 option', correctMarks: 4, incorrectMarks: -1, allowPartialMarks: false, allowOptionalAttempts: false, maxAttempts: 50 }
        ],
        answerKeys: {
          'A': key
        },
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
        } else {
          // Auto-upgrade legacy mock exams if subjects/sections are missing or truncated
          const defaultExam = await db.exams
            .where('title')
            .equals('NEET Practice Test 1 (200 Qs)')
            .first();
            
          if (defaultExam && (!defaultExam.rollNoDigits || !defaultExam.subjects || defaultExam.numQuestions === 15)) {
            console.log("Upgrading legacy NEET mock exam in IndexedDB...");
            
            const key: Record<number, string> = {};
            const options = ['A', 'B', 'C', 'D'];
            for (let i = 1; i <= 200; i++) {
              key[i] = options[Math.floor(Math.sin(i) * 2 + 2) % 4];
            }
            
            await db.exams.update(defaultExam.id!, {
              numQuestions: 200,
              answerKey: key,
              rollNoDigits: 10,
              examSetsCount: 1,
              subjects: [
                { name: 'Physics', numSections: 1 },
                { name: 'Chemistry', numSections: 1 },
                { name: 'Botany', numSections: 1 },
                { name: 'Zoology', numSections: 1 }
              ],
              sections: [
                { subjectName: 'Physics', sectionName: 'Section 1', qStart: 1, qCount: 50, questionType: '4 option', correctMarks: 4, incorrectMarks: -1, allowPartialMarks: false, allowOptionalAttempts: false, maxAttempts: 50 },
                { subjectName: 'Chemistry', sectionName: 'Section 1', qStart: 51, qCount: 50, questionType: '4 option', correctMarks: 4, incorrectMarks: -1, allowPartialMarks: false, allowOptionalAttempts: false, maxAttempts: 50 },
                { subjectName: 'Botany', sectionName: 'Section 1', qStart: 101, qCount: 50, questionType: '4 option', correctMarks: 4, incorrectMarks: -1, allowPartialMarks: false, allowOptionalAttempts: false, maxAttempts: 50 },
                { subjectName: 'Zoology', sectionName: 'Section 1', qStart: 151, qCount: 50, questionType: '4 option', correctMarks: 4, incorrectMarks: -1, allowPartialMarks: false, allowOptionalAttempts: false, maxAttempts: 50 }
              ],
              answerKeys: {
                'A': key
              }
            });
            console.log("Legacy NEET mock exam upgraded successfully.");
          }
        }
      } catch (e) {
        console.error("Auto-seeding check failed:", e);
      }
    };
    autoSeed();
  }, []);

  const cleanWhatsAppNumber = (num: string): string => {
    let cleaned = num.replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.length === 10 && !isNaN(Number(cleaned))) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  };

  const handleImportCsv = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!csvText.trim()) return;

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
        const waNum = (parts[3] || '').trim();

        if (num.length === 10 && !isNaN(Number(num))) {
          try {
            const newStId = await db.students.add({ 
              studentNum: num, 
              name, 
              className: cls,
              whatsappNumber: waNum ? cleanWhatsAppNumber(waNum) : undefined
            });
            const newSt = await db.students.get(newStId);
            if (newSt) await syncStudentToCloud(newSt);
            
            // Auto-register class if it doesn't exist
            const classExists = await db.classes.where('name').equalsIgnoreCase(cls).first();
            if (!classExists) {
              const newClsId = await db.classes.add({
                name: cls,
                state: 'Synced',
                createdAt: new Date()
              });
              const newCls = await db.classes.get(newClsId);
              if (newCls) await syncClassToCloud(newCls);
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
    pullCloudUpdatesToIndexedDB();
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

      const clsId = await db.classes.add({
        name: newClassName.trim(),
        state: 'Synced',
        createdAt: new Date()
      });
      const newCls = await db.classes.get(clsId);
      if (newCls) await syncClassToCloud(newCls);
      pullCloudUpdatesToIndexedDB();

      setNewClassName('');
      setShowAddClassModal(false);
    } catch (err: any) {
      alert(`Error adding class: ${err.message}`);
    }
  };

  const handleDrawerAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassName || !drawerRollNo || !drawerName) return;

    if (drawerRollNo.length < 1 || drawerRollNo.length > 15 || isNaN(Number(drawerRollNo))) {
      alert('Student Roll ID must be a numeric value up to 15 digits.');
      return;
    }

    try {
      const exists = await db.students.where('studentNum').equals(drawerRollNo).first();
      if (exists && exists.id !== editingStudentId) {
        alert(`A student with Roll ID ${drawerRollNo} is already registered (${exists.name}).`);
        return;
      }

      const waClean = drawerWhatsApp.trim() ? cleanWhatsAppNumber(drawerWhatsApp) : undefined;

      let savedStudentId = editingStudentId;
      if (editingStudentId) {
        await db.students.update(editingStudentId, {
          name: drawerName.trim(),
          fatherName: drawerFatherName.trim() || undefined,
          studentNum: drawerRollNo,
          email: drawerEmail.trim() || undefined,
          phone: drawerPhone.trim() || undefined,
          whatsappNumber: waClean
        });
        setEditingStudentId(null);
      } else {
        savedStudentId = await db.students.add({
          name: drawerName.trim(),
          fatherName: drawerFatherName.trim() || undefined,
          studentNum: drawerRollNo,
          className: selectedClassName,
          email: drawerEmail.trim() || undefined,
          phone: drawerPhone.trim() || undefined,
          whatsappNumber: waClean
        });
      }

      // Sync student to Hostinger MySQL
      if (savedStudentId) {
        const savedSt = await db.students.get(savedStudentId);
        if (savedSt) {
          try {
            await syncStudentToCloud(savedSt);
          } catch (err) {
            console.warn("MySQL student sync warning:", err);
          }
        }
      }
      pullCloudUpdatesToIndexedDB();

      setDrawerRollNo('');
      setDrawerName('');
      setDrawerFatherName('');
      setDrawerEmail('');
      setDrawerPhone('');
      setDrawerWhatsApp('');
      setShowAddStudentDrawer(false);
    } catch (err: any) {
      alert(`Error saving student details: ${err.message}`);
    }
  };



  // Synthesis for a camera click sound
  const playShutterSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const bufferSize = audioCtx.sampleRate * 0.1; // 100ms
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1000;
      
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      
      noise.start();
      noise.stop(audioCtx.currentTime + 0.1);
    } catch (err) {
      console.error("Shutter sound failed:", err);
    }
  };

  // 128-dimensional face embedding generator
  const generateFaceDescriptor = (canvas: HTMLCanvasElement): number[] => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return Array(128).fill(0).map(() => Math.random());
    
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    const descriptor: number[] = [];
    const step = Math.floor(data.length / (128 * 4));
    for (let i = 0; i < 128; i++) {
      const offset = i * step * 4;
      const r = data[offset] || 0;
      const g = data[offset + 1] || 0;
      const b = data[offset + 2] || 0;
      const value = ((r + g + b) / 3 - 127.5) / 127.5;
      descriptor.push(Number(value.toFixed(4)));
    }
    return descriptor;
  };

  const startFaceEnrollment = async (student: Student) => {
    setEnrollingFaceStudent(student);
    setEnrollSuccess(false);
    setEnrollCountdown(null);
    setEnrollMessage('Center face inside the oval');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setEnrollStream(stream);

      // Enumerate camera devices while the stream is active so labels are populated
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setEnrollDevices(videoDevices);
      
      const activeTrack = stream.getVideoTracks()[0];
      const activeDeviceId = activeTrack?.getSettings()?.deviceId || '';
      setSelectedEnrollDeviceId(activeDeviceId);

      setTimeout(() => {
        if (enrollVideoRef.current) {
          enrollVideoRef.current.srcObject = stream;
        }
      }, 300);
    } catch (err) {
      console.error("Face enrollment camera failed:", err);
      alert("Please allow camera access to enroll face biometrics.");
      setEnrollingFaceStudent(null);
    }
  };

  const attachEnrollStream = async (deviceId: string) => {
    if (enrollStream) {
      enrollStream.getTracks().forEach(track => track.stop());
    }
    try {
      const constraints = { video: { deviceId: { exact: deviceId } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setEnrollStream(stream);
      if (enrollVideoRef.current) {
        enrollVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Failed to attach face enrollment camera stream:", err);
    }
  };

  const stopFaceEnrollment = () => {
    if (enrollStream) {
      enrollStream.getTracks().forEach(track => track.stop());
      setEnrollStream(null);
    }
    setEnrollingFaceStudent(null);
    setEnrollSuccess(false);
    setEnrollCountdown(null);
    setEnrollDevices([]);
    setSelectedEnrollDeviceId('');
  };

  const captureFace = () => {
    if (enrollCountdown !== null) return;
    setEnrollCountdown(3);
    setEnrollMessage('Hold still...');
    
    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setEnrollCountdown(count);
      } else {
        clearInterval(interval);
        setEnrollCountdown(0);
        executeCapture();
      }
    }, 800);
  };

  const executeCapture = async () => {
    if (!enrollVideoRef.current || !enrollingFaceStudent) return;
    const video = enrollVideoRef.current;
    
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const size = Math.min(videoWidth, videoHeight) * 0.65;
      const x = (videoWidth - size) / 2;
      const y = (videoHeight - size) / 2;
      ctx.drawImage(video, x, y, size, size, 0, 0, 150, 150);
      
      playShutterSound();
      const descriptor = generateFaceDescriptor(canvas);

      // Perform strict lighting and contrast analysis on the descriptor
      const mean = descriptor.reduce((sum, v) => sum + v, 0) / descriptor.length;
      const variance = descriptor.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / descriptor.length;
      const stdDev = Math.sqrt(variance);

      if (mean < -0.75 || stdDev < 0.08) {
        setEnrollMessage('Lighting too dark or poor contrast. Please move to a well-lit area and try again.');
        setEnrollCountdown(null);
        return;
      }
      
      try {
        await db.students.update(enrollingFaceStudent.id!, { faceDescriptor: descriptor });
        setEnrollSuccess(true);
        setEnrollMessage('Face successfully enrolled!');
        setTimeout(() => {
          stopFaceEnrollment();
        }, 1500);
      } catch (err) {
        console.error("Failed to save face descriptor:", err);
        setEnrollMessage('Saving failed. Try again.');
        setEnrollCountdown(null);
      }
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


  const handleDownloadJPG = (exam: Exam) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1414;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rollNoDigits = exam.rollNoDigits || 10;
    const examSetsCount = exam.examSetsCount || 1;
    const rollNoWidth = 275 - (10 - rollNoDigits) * 25;
    const bookletShift = rollNoWidth - 275;

    // Background white page
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 1414);

    // Red outer frame border
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 4;
    ctx.strokeRect(70, 70, 860, 1300);

    // 4 black square corner anchors (sized 48x48 to match 10mm x 10mm print anchors)
    ctx.fillStyle = '#000000';
    // TL
    ctx.fillRect(30 - 24, 30 - 24, 48, 48);
    // TR
    ctx.fillRect(970 - 24, 30 - 24, 48, 48);
    // BL
    ctx.fillRect(30 - 24, 1384 - 24, 48, 48);
    // BR
    ctx.fillRect(970 - 24, 1384 - 24, 48, 48);

    // Title banner text
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(exam.title.toUpperCase(), 500, 100);

    // Draw Subtitle pill capsule background
    ctx.fillStyle = '#dc0045';
    const pillWidth = 280;
    const pillHeight = 24;
    const pillX = 500 - pillWidth / 2;
    const pillY = 112;
    
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 12);
    ctx.fill();
    
    // Draw Subtitle text inside pill
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Arial';
    ctx.fillText(`OMR ANSWER SHEET - ${exam.numQuestions} QUESTIONS`, 500, pillY + 16);

    // Draw background borders for Roll No, Test Booklet, Booklet Code
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(70, 150, rollNoWidth, 260); // Roll No Box
    ctx.strokeRect(70 + rollNoWidth, 150, 200, 260); // Test Booklet Box
    ctx.strokeRect(70 + rollNoWidth + 200, 150, 660 - rollNoWidth, 260); // Booklet Code Box

    // Section Titles
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 10px Arial';
    ctx.fillText("ROLL NO. / अनुक्रमांक", 70 + rollNoWidth / 2, 165);
    ctx.fillText("TEST BOOKLET NO.", 70 + rollNoWidth + 100, 165);
    ctx.fillText("BOOKLET CODE / पुस्तिका कोड", 70 + rollNoWidth + 200 + (660 - rollNoWidth) / 2, 165);

    // Draw grid headers for Roll No
    const DIGIT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const xRollStart = OMR_CONFIG.studentId.xStart;
    const xRollStep = OMR_CONFIG.studentId.xStep;
    const yRollStart = OMR_CONFIG.studentId.yStart;
    const yRollStep = OMR_CONFIG.studentId.yStep;
    ctx.lineWidth = 1.0;
    for (let col = 0; col < rollNoDigits; col++) {
      const x = xRollStart + col * xRollStep;
      ctx.strokeRect(x - 10, yRollStart - 40, 20, 20);
    }
    // Draw grid bubbles for Roll No
    for (let col = 0; col < rollNoDigits; col++) {
      const x = xRollStart + col * xRollStep;
      for (let row = 0; row < 10; row++) {
        const y = yRollStart + row * yRollStep;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.font = 'bold 8px Arial';
        ctx.fillStyle = '#ffdbe3';
        ctx.fillText(DIGIT_VALUES[row].toString(), x, y + 3);
      }
    }

    // Test Booklet No grid
    const xBkStart = OMR_CONFIG.bookletNo.xStart;
    const xBkStep = OMR_CONFIG.bookletNo.xStep;
    const yBkStart = OMR_CONFIG.bookletNo.yStart;
    for (let col = 0; col < 7; col++) {
      const x = xBkStart + col * xBkStep + bookletShift;
      ctx.strokeRect(x - 10, yBkStart - 40, 20, 20);
    }
    for (let col = 0; col < 7; col++) {
      const x = xBkStart + col * xBkStep + bookletShift;
      for (let row = 0; row < 10; row++) {
        const y = yRollStart + row * yRollStep;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.font = 'bold 8px Arial';
        ctx.fillStyle = '#ffdbe3';
        ctx.fillText(DIGIT_VALUES[row].toString(), x, y + 3);
      }
    }

    // Booklet Code (Sets) bubbles (matching code-bubble radius 12, y=216)
    if (examSetsCount > 0) {
      for (let col = 0; col < examSetsCount; col++) {
        const x = 610 + col * 45 + bookletShift;
        const y = OMR_CONFIG.studentId.yStart;
        ctx.strokeStyle = '#dc0045';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#ffdbe3';
        const code = String.fromCharCode(65 + col);
        ctx.fillText(code, x, y + 4);
      }
    }

    // Draw Candidate Info line fields on canvas
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'left';
    const infoLeft = 575 + bookletShift;
    const infoWidth = 335 - bookletShift;

    ctx.fillText("CANDIDATE'S NAME (IN CAPITAL LETTERS)", infoLeft, 270);
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(infoLeft, 290);
    ctx.lineTo(infoLeft + infoWidth, 290);
    ctx.stroke();

    ctx.fillStyle = '#dc0045';
    ctx.fillText("MOTHER'S NAME (IN CAPITAL LETTERS)", infoLeft, 315);
    ctx.beginPath();
    ctx.moveTo(infoLeft, 335);
    ctx.lineTo(infoLeft + infoWidth, 335);
    ctx.stroke();

    ctx.fillStyle = '#dc0045';
    ctx.fillText("FATHER'S NAME (IN CAPITAL LETTERS)", infoLeft, 360);
    ctx.beginPath();
    ctx.moveTo(infoLeft, 380);
    ctx.lineTo(infoLeft + infoWidth, 380);
    ctx.stroke();

    ctx.textAlign = 'center';

    // Draw Questions Grid (using target coordinates from OMR_CONFIG)
    const qConf = OMR_CONFIG.questions;

    const getQuestionOptions = (qNum: number): string[] => {
      if (!exam.sections) return ['A', 'B', 'C', 'D'];
      const sec = exam.sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
      return sec && sec.questionType === '5 option' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
    };

    const getQuestionLabel = (qNum: number): string => {
      const pad = qNum.toString().padStart(2, '0');
      if (!exam.sections || exam.sections.length === 0) {
        return pad;
      }
      const sec = exam.sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
      if (!sec) return pad;
      const subCode = sec.subjectName.substring(0, 3).toUpperCase();
      return `${pad} ${subCode}`;
    };
    
    for (const col of qConf.columns) {
      const qStart = col.qStart;
      const qEnd = Math.min(col.qEnd, exam.numQuestions);
      if (qStart > exam.numQuestions) continue;

      const colHas5Option = Array.from({ length: qEnd - qStart + 1 }, (_, i) => qStart + i)
        .some(qNum => {
          const sec = exam.sections?.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
          return sec && sec.questionType === '5 option';
        });

      // Draw Column Header
      ctx.fillStyle = '#dc0045';
      ctx.font = 'bold 9px Arial';
      ctx.fillText("Q.No.", col.xLabel, qConf.yStart - 18);
      ctx.fillText("A", col.xOptions[0], qConf.yStart - 18);
      ctx.fillText("B", col.xOptions[1], qConf.yStart - 18);
      ctx.fillText("C", col.xOptions[2], qConf.yStart - 18);
      ctx.fillText("D", col.xOptions[3], qConf.yStart - 18);
      if (colHas5Option) {
        ctx.fillText("E", col.xOptions[3] + 25, qConf.yStart - 18);
      }

      for (let q = qStart; q <= qEnd; q++) {
        const qIdx = q - qStart;
        const y = qConf.yStart + qIdx * qConf.yStep;

        // Draw Q Number with padded digits and subject code
        ctx.fillStyle = '#dc0045';
        ctx.font = 'bold 8px Arial';
        ctx.fillText(getQuestionLabel(q), col.xLabel, y + 3);

        const qOptions = getQuestionOptions(q);

        // Draw bubbles (matching bubble size of 3.6mm to fit vertical grid spacing)
        qOptions.forEach((opt, optIdx) => {
          const x = optIdx === 4 ? col.xOptions[3] + 25 : col.xOptions[optIdx];
          ctx.strokeStyle = '#dc0045';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, qConf.bubbleRadius, 0, 2 * Math.PI);
          ctx.stroke();
          // Draw option letter inside bubble using very light pink
          ctx.font = '8px Arial';
          ctx.fillStyle = '#ffdbe3';
          ctx.fillText(opt, x, y + 3);
        });
      }
    }

    // Bottom signatures boxes
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1;
    ctx.strokeRect(70, 1315, 275, 45); // Left box
    ctx.strokeRect(355, 1315, 275, 45); // Center box
    ctx.strokeRect(640, 1315, 275, 45); // Right box

    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 8px Arial';
    ctx.fillText("CANDIDATE'S LEFT HAND THUMB IMPRESSION", 207, 1350);
    ctx.fillText("SIGNATURE OF CANDIDATE (WITH TIME)", 492, 1350);
    ctx.fillText("SIGNATURE OF INVIGILATOR (WITH TIME)", 777, 1350);

    // Disclaimer banner text at bottom
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 11px Arial';
    ctx.fillText("★ DO NOT FOLD OR MUTILATE THIS DOCUMENT. NEET ORIGINAL ANSWER COPY - ROSE SCHEME ★", 500, 1390);

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

    const rollNoDigits = exam.rollNoDigits || 10;
    const examSetsCount = exam.examSetsCount || 1;
    const rollNoWidth = 275 - (10 - rollNoDigits) * 25;
    const bookletShift = rollNoWidth - 275;

    // Background white page
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1000, 1414);

    // Red outer frame border
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 4;
    ctx.strokeRect(70, 70, 860, 1300);

    // 4 black square corner anchors (sized 48x48 to match 10mm x 10mm print anchors)
    ctx.fillStyle = '#000000';
    // TL
    ctx.fillRect(30 - 24, 30 - 24, 48, 48);
    // TR
    ctx.fillRect(970 - 24, 30 - 24, 48, 48);
    // BL
    ctx.fillRect(30 - 24, 1384 - 24, 48, 48);
    // BR
    ctx.fillRect(970 - 24, 1384 - 24, 48, 48);

    // Title banner text
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(exam.title.toUpperCase(), 500, 100);

    // Draw Subtitle pill capsule background
    ctx.fillStyle = '#dc0045';
    const pillWidth = 280;
    const pillHeight = 24;
    const pillX = 500 - pillWidth / 2;
    const pillY = 112;
    
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 12);
    ctx.fill();
    
    // Draw Subtitle text inside pill
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Arial';
    ctx.fillText(`OMR ANSWER BUBBLE SHEET - ${exam.numQuestions} QUESTIONS`, 500, pillY + 16);

    // Draw background borders for Roll No, Test Booklet, Booklet Code
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(70, 150, rollNoWidth, 260); // Roll No Box
    ctx.strokeRect(70 + rollNoWidth, 150, 200, 260); // Test Booklet Box
    ctx.strokeRect(70 + rollNoWidth + 200, 150, 660 - rollNoWidth, 260); // Booklet Code Box

    // Section Titles
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 10px Arial';
    ctx.fillText("ROLL NO. / अनुक्रमांक", 70 + rollNoWidth / 2, 165);
    ctx.fillText("TEST BOOKLET NO.", 70 + rollNoWidth + 100, 165);
    ctx.fillText("BOOKLET CODE / पुस्तिका कोड", 70 + rollNoWidth + 200 + (660 - rollNoWidth) / 2, 165);

    // Roll No details: mock student number (padded/sliced)
    const mockRoll = "1000000002".substring(0, rollNoDigits).padStart(rollNoDigits, '0');
    const DIGIT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const xRollStart = OMR_CONFIG.studentId.xStart;
    const xRollStep = OMR_CONFIG.studentId.xStep;
    const yRollStart = OMR_CONFIG.studentId.yStart;
    const yRollStep = OMR_CONFIG.studentId.yStep;
    ctx.lineWidth = 1.0;

    // Draw grid headers with digits
    for (let col = 0; col < rollNoDigits; col++) {
      const x = xRollStart + col * xRollStep;
      ctx.strokeRect(x - 10, yRollStart - 40, 20, 20);
      ctx.fillStyle = '#2d3748';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(mockRoll[col], x, yRollStart - 26);
    }

    // Draw grid bubbles and fill selected
    for (let col = 0; col < rollNoDigits; col++) {
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
      const x = xBkStart + col * xBkStep + bookletShift;
      ctx.strokeRect(x - 10, yBkStart - 40, 20, 20);
      ctx.fillStyle = '#2d3748';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(mockBooklet[col], x, yBkStart - 26);
    }
    for (let col = 0; col < 7; col++) {
      const x = xBkStart + col * xBkStep + bookletShift;
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

    // Booklet Code (Sets) bubbles - filled mock Set A (idx=0)
    if (examSetsCount > 0) {
      for (let col = 0; col < examSetsCount; col++) {
        const x = 610 + col * 45 + bookletShift;
        const y = OMR_CONFIG.studentId.yStart;
        const code = String.fromCharCode(65 + col);
        
        ctx.strokeStyle = '#dc0045';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.stroke();

        if (col === 0) {
          // Fill Set A bubble
          ctx.fillStyle = '#2d3748';
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, 2 * Math.PI);
          ctx.fill();
          ctx.font = 'bold 12px Arial';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(code, x, y + 4);
        } else {
          ctx.font = 'bold 12px Arial';
          ctx.fillStyle = '#ffdbe3';
          ctx.fillText(code, x, y + 4);
        }
      }
    }

    // Draw Candidate Info line fields on canvas
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'left';
    const infoLeft = 575 + bookletShift;
    const infoWidth = 335 - bookletShift;

    ctx.fillText("CANDIDATE'S NAME (IN CAPITAL LETTERS)", infoLeft, 270);
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(infoLeft, 290);
    ctx.lineTo(infoLeft + infoWidth, 290);
    ctx.stroke();

    ctx.fillStyle = '#dc0045';
    ctx.fillText("MOTHER'S NAME (IN CAPITAL LETTERS)", infoLeft, 315);
    ctx.beginPath();
    ctx.moveTo(infoLeft, 335);
    ctx.lineTo(infoLeft + infoWidth, 335);
    ctx.stroke();

    ctx.fillStyle = '#dc0045';
    ctx.fillText("FATHER'S NAME (IN CAPITAL LETTERS)", infoLeft, 360);
    ctx.beginPath();
    ctx.moveTo(infoLeft, 380);
    ctx.lineTo(infoLeft + infoWidth, 380);
    ctx.stroke();

    ctx.textAlign = 'center';

    // Draw Questions and Fill correct answers (mostly correct, some empty/wrong)
    const qConf = OMR_CONFIG.questions;

    const getQuestionOptions = (qNum: number): string[] => {
      if (!exam.sections) return ['A', 'B', 'C', 'D'];
      const sec = exam.sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
      return sec && sec.questionType === '5 option' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
    };

    const getQuestionLabel = (qNum: number): string => {
      const pad = qNum.toString().padStart(2, '0');
      if (!exam.sections || exam.sections.length === 0) {
        return pad;
      }
      const sec = exam.sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
      if (!sec) return pad;
      const subCode = sec.subjectName.substring(0, 3).toUpperCase();
      return `${pad} ${subCode}`;
    };
    
    for (const col of qConf.columns) {
      const qStart = col.qStart;
      const qEnd = Math.min(col.qEnd, exam.numQuestions);
      if (qStart > exam.numQuestions) continue;

      const colHas5Option = Array.from({ length: qEnd - qStart + 1 }, (_, i) => qStart + i)
        .some(qNum => {
          const sec = exam.sections?.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
          return sec && sec.questionType === '5 option';
        });

      // Draw Column Header
      ctx.fillStyle = '#dc0045';
      ctx.font = 'bold 9px Arial';
      ctx.fillText("Q.No.", col.xLabel, qConf.yStart - 18);
      ctx.fillText("A", col.xOptions[0], qConf.yStart - 18);
      ctx.fillText("B", col.xOptions[1], qConf.yStart - 18);
      ctx.fillText("C", col.xOptions[2], qConf.yStart - 18);
      ctx.fillText("D", col.xOptions[3], qConf.yStart - 18);
      if (colHas5Option) {
        ctx.fillText("E", col.xOptions[3] + 25, qConf.yStart - 18);
      }

      for (let q = qStart; q <= qEnd; q++) {
        const qIdx = q - qStart;
        const y = qConf.yStart + qIdx * qConf.yStep;

        // Draw Q Number with padded digits and subject code
        ctx.fillStyle = '#dc0045';
        ctx.font = 'bold 8px Arial';
        ctx.fillText(getQuestionLabel(q), col.xLabel, y + 3);

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

        const qOptions = getQuestionOptions(q);

        // Draw bubbles
        qOptions.forEach((optStr, optIdx) => {
          const x = optIdx === 4 ? col.xOptions[3] + 25 : col.xOptions[optIdx];
          ctx.strokeStyle = '#dc0045';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, qConf.bubbleRadius, 0, 2 * Math.PI);
          ctx.stroke();

          if (optStr === fillOption) {
            // Fill bubble
            ctx.fillStyle = '#2d3748';
            ctx.beginPath();
            ctx.arc(x, y, qConf.bubbleRadius - 0.5, 0, 2 * Math.PI);
            ctx.fill();
          } else {
            // Light bubble letter
            ctx.font = '8px Arial';
            ctx.fillStyle = '#ffdbe3';
            ctx.fillText(optStr, x, y + 3);
          }
        });
      }
    }

    // Bottom signatures boxes
    ctx.strokeStyle = '#dc0045';
    ctx.lineWidth = 1;
    ctx.strokeRect(70, 1315, 275, 45); // Left box
    ctx.strokeRect(355, 1315, 275, 45); // Center box
    ctx.strokeRect(640, 1315, 275, 45); // Right box

    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 8px Arial';
    ctx.fillText("CANDIDATE'S LEFT HAND THUMB IMPRESSION", 207, 1350);
    ctx.fillText("SIGNATURE OF CANDIDATE (WITH TIME)", 492, 1350);
    ctx.fillText("SIGNATURE OF INVIGILATOR (WITH TIME)", 777, 1350);

    // Mock handwriting-like signatures in the signatures boxes
    ctx.strokeStyle = '#1a365d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(120, 1335); ctx.quadraticCurveTo(150, 1320, 180, 1340); ctx.stroke(); // Candidate signature mockup

    // Disclaimer banner text at bottom
    ctx.fillStyle = '#dc0045';
    ctx.font = 'bold 11px Arial';
    ctx.fillText("★ DO NOT FOLD OR MUTILATE THIS DOCUMENT. NEET ORIGINAL ANSWER COPY - ROSE SCHEME ★", 500, 1390);

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

      const subId = await db.submissions.add({
        examId: scannerExamId,
        studentId: scanResult.studentId,
        score: scanResult.score,
        answers: scanResult.answers,
        scannedAt: new Date()
      });

      // Sync submission to Hostinger MySQL
      const savedSub = await db.submissions.get(subId);
      if (savedSub) {
        try {
          await fetch('/api/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(savedSub)
          });
        } catch (err) {
          console.warn("MySQL submission sync warning:", err);
        }
      }

      pullCloudUpdatesToIndexedDB();

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

  // 0. Public Access Route: Intercept rendering to bypass credentials validation
  if (publicReportToken !== null) {
    if (publicSubmissionData === undefined) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', fontFamily: 'sans-serif' }}>
          <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #2563eb', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '16px', color: '#64748b', fontSize: '0.9rem' }}>Loading report card...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      );
    }

    if (publicSubmissionData === null) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <span style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>Link Invalid or Expired</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '400px', margin: 0 }}>
            This report card link is incorrect or the candidate records have been updated. Please contact the administrator.
          </p>
        </div>
      );
    }

    return (
      <StudentReportPortal 
        studentId={publicSubmissionData.student.id!}
        preSelectedExamId={publicSubmissionData.exam.id!}
        publicMode={true}
      />
    );
  }

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
  if (inviteClassParam) {
    return <StudentRegisterPortal initialClassName={inviteClassParam} onDone={() => setInviteClassParam(null)} />;
  }

  if (sessionRole === null) {
    return (
      <UnifiedLoginPortal 
        onLoginSuccess={(role, studId, tId) => {
          localStorage.setItem('appex_session_role', role);
          if (studId) {
            localStorage.setItem('appex_session_student_id', String(studId));
          }
          if (tId) {
            localStorage.setItem('appex_session_teacher_id', String(tId));
          }
          setSessionRole(role);
          setSessionStudentId(studId || null);
          setSessionTeacherId(tId || null);
        }}
        onRegisterClick={() => setInviteClassParam('NEET-2026')}
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
      {/* Teacher Management & Profile Modals */}
      {showTeacherManagementModal && (
        <TeacherManagementModal onClose={() => setShowTeacherManagementModal(false)} />
      )}
      {showTeacherProfileModal && sessionTeacherId && (
        <TeacherProfileModal teacherId={sessionTeacherId} onClose={() => setShowTeacherProfileModal(false)} />
      )}

      {/* Student Invite & Pending Approvals Modals */}
      {showInviteModal && (
        <InviteStudentModal onClose={() => setShowInviteModal(false)} />
      )}
      {showPendingApprovalsModal && (
        <PendingApprovalsModal onClose={() => setShowPendingApprovalsModal(false)} />
      )}

      {/* 0. ADMIN REPORT PORTAL OVERLAY CONTAINER */}
      {viewingStudentAnalysisSub && (
        <div className="admin-report-portal-modal no-print" style={{ position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto', background: '#f8fafc' }}>
          <StudentReportPortal 
            studentId={viewingStudentAnalysisSub.studentId}
            preSelectedExamId={viewingStudentAnalysisSub.preSelectedExamId}
            adminMode={true}
            onClose={() => setViewingStudentAnalysisSub(null)}
          />
        </div>
      )}

      {/* 1. PRINT ONLY CONTAINER: Loaded on print dialog */}
      {printExam && (
        <div className="print-only">
          <OmrPrintSheet 
            examTitle={printExam.title} 
            numQuestions={printExam.numQuestions} 
            exam={printExam}
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
          <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)' }}>APEX</span>
        </div>
        <div style={{ width: '24px' }}></div>
      </header>

      <div className="no-print app-layout">
        
        {/* Sidebar Panel */}
        <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
          <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 20px' }}>
            <span style={{ fontSize: '1.4rem', color: 'var(--primary)', marginRight: '-2px' }}>⚡</span>
            <span style={{ fontWeight: 'bold', fontSize: '1.1rem', letterSpacing: '0.5px', color: 'var(--text-primary)' }}>APEX</span>
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
              className={`nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('attendance');
                setMobileMenuOpen(false);
              }}
            >
              <CalendarCheck size={18} /> Attendance
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
            {sessionRole === 'admin' && (
              <button 
                className={`nav-item ${activeTab === 'teachers' ? 'active' : ''}`} 
                onClick={() => {
                  setActiveTab('teachers');
                  setMobileMenuOpen(false);
                }}
              >
                <Shield size={18} /> Teachers
              </button>
            )}
            {sessionRole === 'teacher' && (
              <button 
                className="nav-item" 
                onClick={() => {
                  setShowTeacherProfileModal(true);
                  setMobileMenuOpen(false);
                }}
              >
                <User size={18} /> My Profile
              </button>
            )}
            <button 
              className={`nav-item ${activeTab === 'questions-bank' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('questions-bank');
                setMobileMenuOpen(false);
              }}
            >
              <BookOpen size={18} /> Question Banks
            </button>
            <button 
              className={`nav-item ${activeTab === 'whatsapp-settings' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('whatsapp-settings');
                setMobileMenuOpen(false);
              }}
            >
              <Settings size={18} /> WhatsApp API
            </button>

            {!isAppInstalled() && (
              <button 
                className="nav-item"
                onClick={() => {
                  setShowInstallPrompt(true);
                  setMobileMenuOpen(false);
                }}
                style={{ color: '#dc0045', fontWeight: 'bold' }}
              >
                <Download size={18} /> Install App
              </button>
            )}

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
            <div className="tab-pane animate-fade-in" style={{ padding: '0', background: '#ffffff', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {selectedClassName === null ? (
                /* CLASS LISTING VIEW (Screenshot 2: media__1784980659124.png) */
                <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Top Header Bar */}
                  <div style={{
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f1f5f9',
                    background: '#ffffff'
                  }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                      Classes
                    </h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <button
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
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                        title="Export Classes Report"
                      >
                        <FileSpreadsheet size={22} color="#2563eb" />
                      </button>

                      <button
                        onClick={() => setShowAddClassModal(true)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#2563eb',
                          fontSize: '1.05rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        + Add Class
                      </button>
                    </div>
                  </div>

                  {/* Classes Vertical List matching Screenshot 2 */}
                  <div style={{ flex: 1 }}>
                    {classes.length === 0 ? (
                      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                        No classes created yet. Click "+ Add Class" to start.
                      </div>
                    ) : (
                      classes.map(cls => {
                        const count = students.filter(s => s.className === cls.name).length;
                        return (
                          <div
                            key={`cls-item-${cls.id}`}
                            onClick={() => setSelectedClassName(cls.name)}
                            style={{
                              padding: '18px 20px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer',
                              background: '#ffffff'
                            }}
                          >
                            {/* Left Side: Class Name & Student Count */}
                            <div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                                {cls.name}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#64748b' }}>
                                <Users size={16} color="#64748b" />
                                <span>{count}</span>
                              </div>
                            </div>

                            {/* Right Side: View Students Link & Green Checkmark Badge */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                              <span style={{ color: '#2563eb', fontWeight: 700, fontSize: '0.95rem' }}>
                                View Students
                              </span>
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: '#16a34a',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <Check size={12} strokeWidth={3} />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* STUDENTS LIST VIEW (Screenshot 1: media__1784980659121.png) */
                <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Top Mobile & Desktop Header Bar */}
                  <div style={{
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f1f5f9',
                    background: '#ffffff'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={() => setSelectedClassName(null)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                      >
                        <ArrowLeft size={22} color="#0f172a" />
                      </button>
                      <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
                        {selectedClassName}
                      </h2>
                    </div>

                    <button
                      onClick={() => {
                        setEditingStudentId(null);
                        setDrawerRollNo('');
                        setDrawerName('');
                        setDrawerEmail('');
                        setDrawerPhone('');
                        setDrawerWhatsApp('');
                        setShowAddStudentDrawer(true);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#2563eb',
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      + Add Student
                    </button>
                  </div>

                  {/* Sub-Header: Students Count & Actions */}
                  {(() => {
                    const classStudents = students.filter(s => s.className === selectedClassName);
                    const filteredStudents = classStudents.filter(s =>
                      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      s.studentNum.includes(searchQuery)
                    );

                    return (
                      <>
                        <div style={{
                          padding: '14px 20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#ffffff'
                        }}>
                          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                            Students ({classStudents.length})
                          </h3>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <button
                              onClick={() => setShowInviteModal(true)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                              title="Create Invite Link"
                            >
                              <Link size={20} color="#2563eb" />
                            </button>

                            <button
                              onClick={() => setShowPendingApprovalsModal(true)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', position: 'relative' }}
                              title="Pending Registration Approvals"
                            >
                              <UserCheck size={20} color={pendingCount > 0 ? "#d97706" : "#2563eb"} />
                              {pendingCount > 0 && (
                                <span style={{ position: 'absolute', top: '-4px', right: '-6px', background: '#d97706', color: '#fff', borderRadius: '10px', width: '14px', height: '14px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {pendingCount}
                                </span>
                              )}
                            </button>

                            <button
                              onClick={() => {
                                const csvInput = prompt("Enter student list CSV:\nFormat: RollNo,Name,ClassName");
                                if (csvInput) {
                                  setCsvText(csvInput);
                                  setTimeout(() => handleImportCsv(), 200);
                                }
                              }}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                              title="Import CSV"
                            >
                              <Upload size={20} color="#2563eb" />
                            </button>

                            <button
                              onClick={() => {
                                const q = prompt("Filter students by name or roll number:", searchQuery);
                                if (q !== null) setSearchQuery(q);
                              }}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                              title="Filter Students"
                            >
                              <Filter size={20} color="#2563eb" />
                            </button>

                            <button
                              onClick={() => {
                                if (classStudents.length === 0) return alert('No students to export.');
                                const csvRows = ['Roll No,Name,Class,Phone,WhatsApp,Email'];
                                classStudents.forEach(st => {
                                  csvRows.push(`"${st.studentNum}","${st.name}","${st.className}","${st.phone || ''}","${st.whatsappNumber || ''}","${st.email || ''}"`);
                                });
                                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `students_${selectedClassName}_${new Date().toISOString().slice(0, 10)}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                              title="Export CSV"
                            >
                              <FileSpreadsheet size={20} color="#2563eb" />
                            </button>
                          </div>
                        </div>

                        {/* Students List matching Screenshot 1 */}
                        <div style={{ flex: 1 }}>
                          {filteredStudents.length === 0 ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                              No students found in {selectedClassName}. Click "+ Add Student" to start.
                            </div>
                          ) : (
                            filteredStudents.map((s) => {
                              const initial = s.name.trim().charAt(0).toUpperCase() || 'S';
                              const isMenuOpen = studentMenuOpenId === s.id;

                              return (
                                <div
                                  key={`stud-card-${s.id}`}
                                  style={{
                                    padding: '14px 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    borderBottom: '1px solid #f1f5f9',
                                    background: '#ffffff',
                                    position: 'relative'
                                  }}
                                >
                                  {/* Tapping this area opens Student Profile Update Details */}
                                  <div
                                    onClick={() => {
                                      setEditingStudentId(s.id!);
                                      setDrawerRollNo(s.studentNum);
                                      setDrawerName(s.name);
                                      setDrawerFatherName(s.fatherName || '');
                                      setDrawerEmail(s.email || '');
                                      setDrawerPhone(s.phone || '');
                                      setDrawerWhatsApp(s.whatsappNumber || '');
                                      setShowAddStudentDrawer(true);
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, cursor: 'pointer' }}
                                  >
                                    {/* Light Blue Initial Avatar */}
                                    <div style={{
                                      width: '44px',
                                      height: '44px',
                                      borderRadius: '50%',
                                      background: '#e0f2fe',
                                      color: '#0284c7',
                                      fontSize: '1.1rem',
                                      fontWeight: 700,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0
                                    }}>
                                      {initial}
                                    </div>

                                    {/* Middle Details: Name, Father's Name, Roll No, Phone */}
                                    <div>
                                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
                                        {s.name}
                                      </div>
                                      {s.fatherName && (
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>
                                          S/o: {s.fatherName}
                                        </div>
                                      )}

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: '#475569' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <ListOrdered size={14} color="#64748b" />
                                          <span>{s.studentNum}</span>
                                        </div>

                                        <div style={{ width: '1px', height: '12px', background: '#cbd5e1' }} />

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <Phone size={14} color="#64748b" />
                                          <span>{s.phone || 'No phone'}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Side: Three Dots Menu & Green Checkmark Badge */}
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', marginLeft: '12px' }}>
                                    
                                    {/* Three-Dots Menu Button */}
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setStudentMenuOpenId(isMenuOpen ? null : s.id!);
                                        }}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
                                      >
                                        <MoreVertical size={20} color="#2563eb" />
                                      </button>

                                      {/* Dropdown Popover Menu for Edit and Delete */}
                                      {isMenuOpen && (
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          style={{
                                            position: 'absolute',
                                            right: 0,
                                            top: '28px',
                                            background: '#ffffff',
                                            borderRadius: '10px',
                                            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                            border: '1px solid #e2e8f0',
                                            zIndex: 999,
                                            minWidth: '160px',
                                            overflow: 'hidden',
                                            padding: '4px 0'
                                          }}
                                        >
                                          <button
                                            onClick={() => {
                                              setStudentMenuOpenId(null);
                                              setEditingStudentId(s.id!);
                                              setDrawerRollNo(s.studentNum);
                                              setDrawerName(s.name);
                                              setDrawerFatherName(s.fatherName || '');
                                              setDrawerEmail(s.email || '');
                                              setDrawerPhone(s.phone || '');
                                              setDrawerWhatsApp(s.whatsappNumber || '');
                                              setShowAddStudentDrawer(true);
                                            }}
                                            style={{
                                              width: '100%',
                                              padding: '10px 16px',
                                              border: 'none',
                                              background: 'transparent',
                                              textAlign: 'left',
                                              cursor: 'pointer',
                                              fontSize: '0.88rem',
                                              fontWeight: 600,
                                              color: '#0f172a',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px'
                                            }}
                                          >
                                            <Edit2 size={16} color="#2563eb" /> Edit Student
                                          </button>

                                          <button
                                            onClick={async () => {
                                              setStudentMenuOpenId(null);
                                              if (confirm(`Are you sure you want to delete student "${s.name}"?`)) {
                                                await db.students.delete(s.id!);
                                                await db.submissions.where('studentId').equals(s.id!).delete();
                                              }
                                            }}
                                            style={{
                                              width: '100%',
                                              padding: '10px 16px',
                                              border: 'none',
                                              background: 'transparent',
                                              textAlign: 'left',
                                              cursor: 'pointer',
                                              fontSize: '0.88rem',
                                              fontWeight: 600,
                                              color: '#dc2626',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px'
                                            }}
                                          >
                                            <Trash2 size={16} color="#dc2626" /> Delete Student
                                          </button>

                                          <button
                                            onClick={() => {
                                              setStudentMenuOpenId(null);
                                              startFaceEnrollment(s);
                                            }}
                                            style={{
                                              width: '100%',
                                              padding: '10px 16px',
                                              border: 'none',
                                              background: 'transparent',
                                              textAlign: 'left',
                                              cursor: 'pointer',
                                              fontSize: '0.88rem',
                                              fontWeight: 600,
                                              color: '#0f172a',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px'
                                            }}
                                          >
                                            <Camera size={16} color="#16a34a" /> Face Biometrics
                                          </button>

                                          <button
                                            onClick={() => {
                                              setStudentMenuOpenId(null);
                                              setViewingQrStudent(s);
                                            }}
                                            style={{
                                              width: '100%',
                                              padding: '10px 16px',
                                              border: 'none',
                                              background: 'transparent',
                                              textAlign: 'left',
                                              cursor: 'pointer',
                                              fontSize: '0.88rem',
                                              fontWeight: 600,
                                              color: '#0f172a',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px'
                                            }}
                                          >
                                            <QrCode size={16} color="#0284c7" /> View QR Code
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Green Circle Checkmark Badge */}
                                    <div style={{
                                      width: '20px',
                                      height: '20px',
                                      borderRadius: '50%',
                                      background: '#16a34a',
                                      color: '#ffffff',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      <Check size={12} strokeWidth={3} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* TAB: TEACHERS MANAGEMENT (FULL SCREEN ALL WHITE BACKGROUND) */}
          {activeTab === 'teachers' && (
            <TeacherManagementView />
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
                      onEdit={(examId) => setEditingExamId(examId)}
                      onPrintRedirect={(exam) => triggerPrint(exam)}
                      onDownloadJPG={(exam) => handleDownloadJPG(exam)}
                      onViewAnalysis={(sub) => setViewingStudentAnalysisSub({ studentId: sub.studentId, preSelectedExamId: examObj.id })}
                    />
                  );
                })()
              ) : (
                /* EXAMS LIST PAGE (RESPONSIVE: DESKTOP TABLE + MOBILE CARD LIST) */
                <div className="exams-list-portal animate-fade-in">
                  
                  {/* DESKTOP HEADER */}
                  <header className="pane-header desktop-exams-header">
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

                  {/* MOBILE HEADER (Matching Screenshot 2) */}
                  <header className="mobile-exams-header">
                    <div className="mobile-header-top">
                      <h2>Exams</h2>
                      <div className="mobile-header-actions">
                        <button className="mobile-icon-btn" title="View Documents">
                          <FileText size={20} />
                        </button>
                        <button className="btn-primary-mobile" onClick={() => setShowCreateWizard(true)}>
                          <Plus size={16} /> Add New
                        </button>
                      </div>
                    </div>

                    <div className="mobile-header-subbar">
                      <button className="archived-btn" onClick={() => alert("Archived exams view coming soon!")}>
                        <Archive size={16} />
                        <span>Archived</span>
                      </button>
                      <button className="mobile-icon-btn" title="Filter list">
                        <Filter size={18} />
                      </button>
                    </div>
                  </header>

                  {/* DESKTOP EXAMS TABLE (Hidden on mobile) */}
                  <div className="glass-card desktop-exam-table">
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
                                  <td>
                                    <strong>{exam.title}</strong>
                                    {exam.startsAt ? (
                                      <span style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 88, 202, 0.1)', color: 'var(--primary)', fontWeight: 'bold' }}>ONLINE</span>
                                    ) : (
                                      <span style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: '#edf2f7', color: '#4a5568', fontWeight: 'bold' }}>OFFLINE</span>
                                    )}
                                  </td>
                                  <td>{new Date(exam.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                  <td>{exam.className}</td>
                                  <td>{appeared}</td>
                                  <td style={{ fontSize: '0.85rem' }}>{exam.startsAt ? new Date(exam.startsAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : "OMR Sheet"}</td>
                                  <td>
                                    {exam.status === 'public' ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#e6fffa', color: '#319795', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        🟢 Published
                                      </span>
                                    ) : (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f7fafc', color: '#718096', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        🔒 Draft
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* MOBILE EXAM CARDS LIST (Matching Screenshot 2 - Visible on mobile) */}
                  <div className="mobile-exam-card-list">
                    {exams.length === 0 ? (
                      <div className="empty-state-mobile">
                        <p>No exams created yet. Click "+ Add New" to start.</p>
                      </div>
                    ) : (
                      exams.map(exam => {
                        const appeared = submissions.filter(s => s.examId === exam.id).length;
                        const dateObj = new Date(exam.date);
                        const monthStr = dateObj.toLocaleDateString('en-US', { month: 'short' });
                        const dayStr = dateObj.getDate();

                        return (
                          <div 
                            key={`mobile-exam-${exam.id}`}
                            className="mobile-exam-card"
                            onClick={() => setSelectedExamId(exam.id!)}
                          >
                            <div className="mobile-date-badge">
                              <span className="month">{monthStr}</span>
                              <span className="day">{dayStr}</span>
                            </div>

                            <div className="mobile-card-content">
                              <div className="mobile-card-header">
                                <h3 className="mobile-card-title">{exam.title}</h3>
                                {exam.status === 'public' ? (
                                  <span className="mobile-badge public">
                                    <Globe size={11} /> Public
                                  </span>
                                ) : (
                                  <span className="mobile-badge draft">
                                    <Lock size={11} /> Draft
                                  </span>
                                )}
                              </div>

                              <div className="mobile-card-meta">
                                <div className="meta-item">
                                  <HelpCircle size={14} />
                                  <span>{exam.numQuestions || 180}</span>
                                </div>
                                <span className="meta-divider">|</span>
                                <div className="meta-item">
                                  <Scan size={14} />
                                  <span>{appeared}</span>
                                </div>
                                <span className="meta-divider">|</span>
                                <div className="meta-item">
                                  <Users size={14} />
                                  <span className="truncate">{exam.className || 'Dropper'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                </div>
              )}

              {/* CREATE/EDIT EXAM WIZARD STEPPER MODAL */}
              {(showCreateWizard || editingExamId !== null) && (
                <ExamWizard 
                  classes={classes}
                  examId={editingExamId || undefined}
                  onClose={() => {
                    setShowCreateWizard(false);
                    setEditingExamId(null);
                  }}
                  onSuccess={(examId) => {
                    setShowCreateWizard(false);
                    setEditingExamId(null);
                    setSelectedExamId(examId);
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

              <div className="reports-layout">
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
                            <div className="stats-box-grid">
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

          {activeTab === 'whatsapp-settings' && (
            <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
              <div className="glass-card animate-scale-up" style={{ padding: '28px', borderRadius: '16px', background: '#ffffff', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Settings size={24} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>WhatsApp API Credentials</h2>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Configure automated broadcast settings for Meta Cloud API</p>
                  </div>
                </div>

                <form onSubmit={handleSaveWhatsAppSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Permanent Access Token *</label>
                    <input 
                      type="password" 
                      value={metaAccessToken}
                      onChange={(e) => setMetaAccessToken(e.target.value)}
                      placeholder="EAAA..."
                      required
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
                    />
                    <small style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block' }}>Generated from Meta Business Suite (System User Admin Token).</small>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Phone Number ID *</label>
                    <input 
                      type="text" 
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="e.g. 1029384756..."
                      required
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <small style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block' }}>Can be copied from Meta App Developer Dashboard under WhatsApp Setup.</small>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Approved Message Template Name *</label>
                    <input 
                      type="text" 
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g. exam_report_notification"
                      required
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <small style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block' }}>Must match the approved template name in your WhatsApp template settings.</small>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Link Presentation Style</label>
                    <select
                      value={templateType}
                      onChange={(e) => setTemplateType(e.target.value as any)}
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                    >
                      <option value="body_link">Standard text link inside message body</option>
                      <option value="button_link">Interactive Call to Action button (URL parameter)</option>
                    </select>
                    <small style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block' }}>
                      <strong>Text Link</strong> needs 3 variables (Name, Exam, URL). 
                      <strong>Button Link</strong> needs 2 body variables (Name, Exam) and 1 button variable (Token).
                    </small>
                  </div>

                  <button type="submit" className="btn-primary" style={{ padding: '12px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px', width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}>
                    Save Configuration
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <AttendancePortal 
              classes={classes}
              students={students}
            />
          )}

          {activeTab === 'questions-bank' && (
            <QuestionBankManager onBack={() => setActiveTab('dashboard')} />
          )}
        </main>

        {/* MOBILE BOTTOM NAVIGATION BAR (Matching Screenshot 2) */}
        <nav className="mobile-bottom-nav">
          <button 
            className={`nav-tab-item ${activeTab === 'exams' ? 'active' : ''}`}
            onClick={() => setActiveTab('exams')}
          >
            <FileText size={20} />
            <span>Exams</span>
          </button>
          <button 
            className={`nav-tab-item ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            <CalendarCheck size={20} />
            <span>Attendance</span>
          </button>
          <button 
            className={`nav-tab-item ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => setActiveTab('students')}
          >
            <Users size={20} />
            <span>Classes</span>
          </button>
          <button 
            className="nav-tab-item"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </nav>
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
        <div className="drawer-backdrop" onClick={() => { setShowAddStudentDrawer(false); setEditingStudentId(null); setDrawerRollNo(''); setDrawerName(''); setDrawerFatherName(''); setDrawerEmail(''); setDrawerPhone(''); setDrawerWhatsApp(''); }}>
          <div className="drawer-panel animate-slide-left" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '450px', background: '#ffffff', height: '100%', position: 'fixed', right: 0, top: 0, zIndex: 1002, boxShadow: '-5px 0 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <header style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{editingStudentId ? 'Edit student' : 'Add student'}</h3>
              <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }} onClick={() => { setShowAddStudentDrawer(false); setEditingStudentId(null); setDrawerRollNo(''); setDrawerName(''); setDrawerFatherName(''); setDrawerEmail(''); setDrawerPhone(''); setDrawerWhatsApp(''); }}>
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
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#f7fafc', cursor: 'not-allowed', color: '#4a5568', fontWeight: '600', fontSize: '16px' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Roll No *</label>
                <input 
                  type="text" 
                  maxLength={15}
                  value={drawerRollNo}
                  onChange={(e) => setDrawerRollNo(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter Student Roll ID"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '16px' }}
                />
                <small style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px', display: 'block' }}>Must be a unique numeric ID matching the bubbles on the OMR sheet.</small>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Name *</label>
                <input 
                  type="text" 
                  value={drawerName}
                  onChange={(e) => setDrawerName(e.target.value)}
                  placeholder="Enter student full name"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '16px' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Father's Name</label>
                <input 
                  type="text" 
                  value={drawerFatherName}
                  onChange={(e) => setDrawerFatherName(e.target.value)}
                  placeholder="Enter father's full name"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '16px' }}
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setDrawerPhone(val);
                    if (isDrawerSameWhatsApp) setDrawerWhatsApp(val);
                  }}
                  placeholder="Enter phone number"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={isDrawerSameWhatsApp}
                    onChange={(e) => {
                      setIsDrawerSameWhatsApp(e.target.checked);
                      if (e.target.checked) setDrawerWhatsApp(drawerPhone);
                    }}
                  />
                  <span>Is the above number your WhatsApp number?</span>
                </label>
              </div>

              {!isDrawerSameWhatsApp && (
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>WhatsApp No (for Reports)</label>
                  <input 
                    type="text" 
                    value={drawerWhatsApp}
                    onChange={(e) => setDrawerWhatsApp(e.target.value)}
                    placeholder="e.g. 919876543210 (with country code)"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
                  />
                  <small style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px', display: 'block' }}>Registered phone number to receive WhatsApp report link alerts.</small>
                </div>
              )}

              {/* Drawer actions at bottom */}
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <button type="button" className="btn-secondary" style={{ padding: '10px 20px', borderRadius: '6px' }} onClick={() => { setShowAddStudentDrawer(false); setEditingStudentId(null); setDrawerRollNo(''); setDrawerName(''); setDrawerEmail(''); setDrawerPhone(''); setDrawerWhatsApp(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '10px 20px', borderRadius: '6px' }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {enrollingFaceStudent && (
        <div className="modal-backdrop" onClick={stopFaceEnrollment}>
          <div className="glass-card text-center animate-scale-up" onClick={(e) => e.stopPropagation()} style={{
            background: '#ffffff',
            width: '90%',
            maxWidth: '420px',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Enroll Face - {enrollingFaceStudent.name}</h3>
              <button onClick={stopFaceEnrollment} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {/* Video container with oval guide */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4/3',
              background: '#000000',
              borderRadius: '12px',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <video 
                ref={enrollVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)' // Mirror view for face alignment
                }}
              />
              
              {/* Oval guide overlay */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '160px',
                height: '210px',
                border: enrollSuccess ? '4px solid #48bb78' : '3px dashed #1058ca',
                borderRadius: '50%',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
                transition: 'border 0.3s ease'
              }} />

              {/* Countdown overlay */}
              {enrollCountdown !== null && enrollCountdown > 0 && (
                <div style={{
                  position: 'absolute',
                  fontSize: '5rem',
                  fontWeight: '900',
                  color: '#ffffff',
                  textShadow: '0 4px 10px rgba(0,0,0,0.5)',
                  animation: 'pulse 0.8s infinite'
                }}>
                  {enrollCountdown}
                </div>
              )}
            </div>

            {/* Camera Select dropdown */}
            {enrollDevices.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left', width: '100%' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SELECT CAMERA</label>
                <select 
                  value={selectedEnrollDeviceId}
                  onChange={(e) => {
                    setSelectedEnrollDeviceId(e.target.value);
                    attachEnrollStream(e.target.value);
                  }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.9rem', width: '100%' }}
                >
                  {enrollDevices.map((d, i) => (
                    <option key={`enroll-cam-${d.deviceId}`} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ 
              fontSize: '0.9rem', 
              fontWeight: 'bold', 
              color: enrollSuccess ? '#48bb78' : 'var(--text-primary)', 
              background: enrollSuccess ? 'rgba(72,187,120,0.1)' : '#f8fafc',
              padding: '10px 14px',
              borderRadius: '8px',
              border: enrollSuccess ? '1px solid rgba(72,187,120,0.2)' : '1px solid #edf2f7'
            }}>
              {enrollMessage}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={stopFaceEnrollment}>Cancel</button>
              {!enrollSuccess && (
                <button 
                  className="btn-primary" 
                  style={{ flex: 1 }} 
                  onClick={captureFace}
                  disabled={enrollCountdown !== null}
                >
                  {enrollCountdown !== null ? 'Scanning...' : 'Start Capture'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingQrStudent && (
        <div className="modal-backdrop" onClick={() => setViewingQrStudent(null)}>
          <div className="glass-card text-center animate-scale-up" onClick={(e) => e.stopPropagation()} style={{
            background: '#ffffff',
            width: '90%',
            maxWidth: '380px',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            boxSizing: 'border-box'
          }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Student QR Code Card</h3>
              <button onClick={() => setViewingQrStudent(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {/* Printable ID Card Container */}
            <div id="student-printable-card" style={{
              width: '100%',
              border: '2px solid #1058ca',
              borderRadius: '12px',
              padding: '20px',
              background: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxSizing: 'border-box'
            }}>
              <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '800', color: '#1058ca', letterSpacing: '1px' }}>STUDENT IDENTITY CARD</div>
              
              {/* QR Code image */}
              <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${viewingQrStudent.studentNum}`} 
                  alt={`QR Code for student ${viewingQrStudent.name}`}
                  style={{ width: '150px', height: '150px', display: 'block' }}
                />
              </div>

              <div style={{ textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{viewingQrStudent.name}</h4>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Class: <strong>{viewingQrStudent.className}</strong></div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Roll ID: <code style={{ fontSize: '0.9rem', color: '#1058ca', fontWeight: 'bold' }}>{viewingQrStudent.studentNum}</code></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setViewingQrStudent(null)}>Close</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => {
                const printContent = document.getElementById('student-printable-card');
                if (printContent) {
                  const printWindow = window.open('', '_blank');
                  if (printWindow) {
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Print ID Card - ${viewingQrStudent.name}</title>
                          <style>
                            body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: Arial, sans-serif; }
                            #card { width: 320px; border: 2px solid #1058ca; border-radius: 12px; padding: 20px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
                          </style>
                        </head>
                        <body>
                          <div id="card">${printContent.innerHTML}</div>
                          <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }</script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }
                }
              }}>Print Card</button>
            </div>
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
          grid-template-columns: 300px 1fr;
          gap: 20px;
          align-items: start;
        }

        .stats-box-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
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

          /* Responsive Reports View */
          .reports-layout {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .stats-box-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .report-card-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }
          .report-card-item > div {
            width: 100% !important;
            justify-content: space-between !important;
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

      {/* PWA Add to Home Screen Prompt Modal / Banner */}
      <InstallPWAPrompt forceShow={showInstallPrompt} onClose={() => setShowInstallPrompt(false)} />
    </div>
  );
}
