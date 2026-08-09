import Dexie, { type Table } from 'dexie';

export interface Student {
  id?: number;
  studentNum: string; // e.g. "00001", maps to bubbles filled by student
  name: string;
  fatherName?: string;
  className: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string; // e.g. "919876543210"
  faceDescriptor?: number[]; // Vector embedding for facial biometrics
  faceDescriptors?: number[][]; // Multiple profile templates: [Center, Left, Right]
  facePhoto?: string; // Base64 or image URL for face biometric image
}

export interface QuestionBank {
  id?: number;
  name: string;
  targetExam: string;
  subject: string;
  topic: string;
  createdAt: Date;
}

export interface BankQuestion {
  id?: number;
  bankId: number; // Links to QuestionBank
  questionText: string;
  options: string[];
  correctOptionIdx: number;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation?: string;
  questionImage?: string; // Base64 or URL
  createdAt?: Date;
}

export interface ClassEntity {
  id?: number;
  name: string;
  state: 'Synced' | 'Pending';
  createdAt: Date;
}

export interface ExamSubject {
  name: string;
  numSections: number;
}

export interface ExamSection {
  subjectName: string;
  sectionName: string;
  qStart: number;
  qCount: number;
  questionType: '4 option' | '5 option';
  correctMarks: number;
  incorrectMarks: number;
  allowPartialMarks: boolean;
  allowOptionalAttempts: boolean;
  maxAttempts?: number;
}

export interface Exam {
  id?: number;
  title: string;
  className: string; // Target class name (e.g. "NEET")
  date: string;       // Scheduled Date (e.g. "2026-07-14")
  status: 'private' | 'public';
  isResultsPublished?: boolean;
  numQuestions: number;
  answerKey: Record<number, string>; // Default answer key (Maps question number to option)
  correctMarks: number;              // Default marks for correct answer
  incorrectMarks: number;            // Default marks for incorrect answer
  unansweredMarks: number;          // Default marks for unanswered question
  createdAt: Date;
  startsAt?: string;                 // Scheduled time for online exam (e.g. "2026-07-16T10:00")
  durationMins?: number;             // Duration in minutes for online exam (e.g. 180)
  sectionsMarking?: Record<string, { correctMarks: number; incorrectMarks: number; unansweredMarks: number }>; // Section-wise marking scheme
  rollNoDigits?: number;
  examSetsCount?: number;
  showResultsToStudent?: boolean;
  subjects?: ExamSubject[];
  sections?: ExamSection[];
  answerKeys?: Record<string, Record<number, string>>; // Multi-set answer keys (Set -> QNum -> Option)
  difficulties?: Record<number, 'Easy' | 'Moderate' | 'Difficult'>; // Question-wise difficulty levels for offline OMR
  loginOption?: 'roll_phone' | 'roll_email' | 'roll_only' | 'passcode';
  passcode?: string;
}

export interface Question {
  id?: number;
  examId: number;
  subjectName?: string;
  sectionName: string;
  questionText: string;
  options: string[]; // Size 4
  correctOptionIdx: number; // 0-3
  explanation: string;
  questionImage?: string; // Base64 or URL
  difficulty?: 'Easy' | 'Moderate' | 'Difficult'; // Question-wise difficulty level for online exam
}

export interface ExamSubmission {
  id?: number;
  examId: number;
  studentId: number;
  score: number; // calculated score based on marking scheme
  answers: Record<number, string>; // Maps question number to student response ('A', 'B', 'C', 'D', or '' for empty)
  scannedAt: Date;
  omrImageUrl?: string; // Base64 or public server image URL for scanned OMR sheet
  cheatingAlertsCount?: number; // tab blurs/cheating events
  timeTakenSeconds?: number;
  attemptType?: 'OMR' | 'Online';
  bookletSet?: string;
  accessToken?: string; // Cryptographic unguessable access key for public report sharing
  detectedRollNum?: string; // Original detected roll number string from scanning
}

export interface SystemSetting {
  id?: number;
  key: string;
  value: string;
}

export interface AttendanceRecord {
  id?: number;
  date: string;         // YYYY-MM-DD
  studentId: number;
  className: string;
  status: 'Present' | 'Absent' | 'Late';
  remarks?: string;
  createdAt: Date;
  attendanceMethod?: 'Manual' | 'QR' | 'Face';
}

export interface PendingRegistration {
  id?: number;
  studentNum: string;
  name: string;
  fatherName?: string;
  className: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Teacher {
  id?: number;
  userId: string;
  password: string;
  name: string;
  phone?: string;
  email?: string;
  createdAt: Date;
}

class AppDatabase extends Dexie {
  students!: Table<Student>;
  exams!: Table<Exam>;
  submissions!: Table<ExamSubmission>;
  classes!: Table<ClassEntity>;
  questions!: Table<Question>;
  attendance!: Table<AttendanceRecord>;
  questionBank!: Table<BankQuestion>;
  questionBanks!: Table<QuestionBank>;
  settings!: Table<SystemSetting>;
  pendingRegistrations!: Table<PendingRegistration>;
  teachers!: Table<Teacher>;

  constructor() {
    super('OMRExamsDatabase');
    // Version 6 support online exam details and questions table
    this.version(6).stores({
      students: '++id, &studentNum, className',
      exams: '++id, title, className, date, status, createdAt',
      submissions: '++id, examId, studentId, scannedAt, [examId+studentId]',
      classes: '++id, &name, state',
      questions: '++id, examId, sectionName'
    });
    // Version 7 adds the attendance table for daily tracking
    this.version(7).stores({
      attendance: '++id, date, studentId, className, [date+studentId]'
    });
    // Version 8 adds the questionBank table for educational library MCQs
    this.version(8).stores({
      questionBank: '++id, source, subject, chapter, difficulty'
    });
    // Version 9 adds settings table and index for accessToken in submissions
    this.version(9).stores({
      submissions: '++id, examId, studentId, scannedAt, accessToken, [examId+studentId]',
      settings: '++id, &key'
    });
    // Version 10 adds questionBanks and updates questionBank indexes
    this.version(10).stores({
      questionBanks: '++id, targetExam, subject, topic',
      questionBank: '++id, bankId, difficulty'
    });
    // Version 11 adds pendingRegistrations table for student invite & self-registration
    this.version(11).stores({
      pendingRegistrations: '++id, status, className, createdAt'
    });
    // Version 12 adds teachers table for Master Admin & Teacher authentication
    this.version(12).stores({
      teachers: '++id, &userId, name'
    });
    // Version 13 updates students table to support class-wise unique studentNum
    this.version(13).stores({
      students: '++id, studentNum, className, &[studentNum+className]'
    });
  }
}

export const db = new AppDatabase();

// Auto-generate unguessable random accessToken for every new exam submission
db.submissions.hook('creating', (_, obj) => {
  if (!obj.accessToken) {
    obj.accessToken = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  }
});

// Seed default system settings & migrate legacy submissions
db.on('ready', async () => {
  // One-time database alignment migration to prevent primary key conflicts after server-assigned ID alignment
  if (localStorage.getItem('omr_db_aligned_v4') !== 'true') {
    console.log("Performing one-time database alignment migration...");
    try {
      await Promise.all([
        db.exams.clear(),
        db.classes.clear(),
        db.students.clear(),
        db.submissions.clear(),
        db.questions.clear(),
        db.teachers.clear(),
        db.attendance.clear()
      ]);
      localStorage.setItem('omr_db_aligned_v4', 'true');
      console.log("Database alignment migration completed successfully.");
    } catch (err) {
      console.error("Database alignment migration failed:", err);
    }
  }

  const p1 = db.settings.count().then((count) => {
    if (count === 0) {
      return db.settings.bulkAdd([
        { key: 'metaAccessToken', value: '' },
        { key: 'phoneNumberId', value: '' },
        { key: 'templateName', value: 'exam_report_notification' },
        { key: 'templateType', value: 'body_link' }
      ]);
    }
  });

  const p2 = db.submissions.toArray().then(async (subs) => {
    const missing = subs.filter(s => !s.accessToken);
    if (missing.length > 0) {
      console.log(`Migrating database: Generating accessTokens for ${missing.length} existing submissions...`);
      for (const sub of missing) {
        const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
        await db.submissions.update(sub.id!, { accessToken: token });
      }
      console.log("Database token backfill migration complete.");
    }
  });

  return Promise.all([p1, p2]).catch((err) => {
    console.error("Failed to seed/migrate settings database table:", err);
  });
});

// Handle upgrade errors by deleting and recreating DB
db.open().catch(async (err) => {
  console.error("Dexie database open failed, recreating:", err);
  try {
    await Dexie.delete('OMRExamsDatabase');
    window.location.reload();
  } catch (e) {
    console.error("Failed to delete database:", e);
  }
});
