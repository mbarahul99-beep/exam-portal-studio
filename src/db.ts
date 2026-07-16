import Dexie, { type Table } from 'dexie';

export interface Student {
  id?: number;
  studentNum: string; // e.g. "00001", maps to bubbles filled by student
  name: string;
  className: string;
  email?: string;
  phone?: string;
  faceDescriptor?: number[]; // Vector embedding for facial biometrics
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
  subjects?: ExamSubject[];
  sections?: ExamSection[];
  answerKeys?: Record<string, Record<number, string>>; // Multi-set answer keys (Set -> QNum -> Option)
  loginOption?: 'roll_phone' | 'roll_email' | 'roll_only' | 'passcode';
  passcode?: string;
}

export interface Question {
  id?: number;
  examId: number;
  sectionName: string;
  questionText: string;
  options: string[]; // Size 4
  correctOptionIdx: number; // 0-3
  explanation: string;
  questionImage?: string; // Base64 or URL
}

export interface ExamSubmission {
  id?: number;
  examId: number;
  studentId: number;
  score: number; // calculated score based on marking scheme
  answers: Record<number, string>; // Maps question number to student response ('A', 'B', 'C', 'D', or '' for empty)
  scannedAt: Date;
  cheatingAlertsCount?: number; // tab blurs/cheating events
  timeTakenSeconds?: number;
  attemptType?: 'OMR' | 'Online';
  bookletSet?: string;
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

class AppDatabase extends Dexie {
  students!: Table<Student>;
  exams!: Table<Exam>;
  submissions!: Table<ExamSubmission>;
  classes!: Table<ClassEntity>;
  questions!: Table<Question>;
  attendance!: Table<AttendanceRecord>;

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
  }
}

export const db = new AppDatabase();

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
