import Dexie, { type Table } from 'dexie';

export interface Student {
  id?: number;
  studentNum: string; // e.g. "00001", maps to bubbles filled by student
  name: string;
  className: string;
  email?: string;
  phone?: string;
}

export interface ClassEntity {
  id?: number;
  name: string;
  state: 'Synced' | 'Pending';
  createdAt: Date;
}

export interface Exam {
  id?: number;
  title: string;
  className: string; // Target class name (e.g. "NEET")
  date: string;       // Scheduled Date (e.g. "2026-07-14")
  status: 'private' | 'public';
  numQuestions: number;
  answerKey: Record<number, string>; // Maps question number (1-based) to answer ('A', 'B', 'C', 'D')
  correctMarks: number;              // Marks for correct answer (e.g. +4)
  incorrectMarks: number;            // Marks for incorrect answer (e.g. -1)
  unansweredMarks: number;          // Marks for unanswered question (e.g. 0)
  createdAt: Date;
  startsAt?: string;                 // Scheduled time for online exam (e.g. "2026-07-16T10:00")
  durationMins?: number;             // Duration in minutes for online exam (e.g. 180)
  sectionsMarking?: Record<string, { correctMarks: number; incorrectMarks: number; unansweredMarks: number }>; // Section-wise marking scheme
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
}

class AppDatabase extends Dexie {
  students!: Table<Student>;
  exams!: Table<Exam>;
  submissions!: Table<ExamSubmission>;
  classes!: Table<ClassEntity>;
  questions!: Table<Question>;

  constructor() {
    super('OMRExamsDatabase');
    // Bumped to version 6 to support online exam details and questions table
    this.version(6).stores({
      students: '++id, &studentNum, className',
      exams: '++id, title, className, date, status, createdAt',
      submissions: '++id, examId, studentId, scannedAt, [examId+studentId]',
      classes: '++id, &name, state',
      questions: '++id, examId, sectionName'
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
