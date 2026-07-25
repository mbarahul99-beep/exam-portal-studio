import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Hostinger MySQL Connection Configuration
const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbUser = process.env.DB_USER || 'u874290068_u874290068_usr';
const dbPass = process.env.DB_PASSWORD || process.env.DB_PASS || '2026@Apex';
const dbName = process.env.DB_NAME || 'u874290068_u874290068_app';

const dbConfig = {
  host: dbHost,
  user: dbUser,
  password: dbPass,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000
};

let pool;
try {
  pool = mysql.createPool(dbConfig);
  console.log(`✅ Hostinger MySQL Pool Initialized (${dbUser}@${dbHost}/${dbName})`);
} catch (err) {
  console.error('⚠️ MySQL Pool Initialization failed:', err);
}

// Auto-initialize MySQL Tables on Startup
const initDatabase = async () => {
  if (!pool) return;
  try {
    const conn = await pool.getConnection();

    // 1. Students Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        studentNum VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        fatherName VARCHAR(255),
        className VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        whatsappNumber VARCHAR(50),
        faceDescriptor JSON,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure fatherName exists if table was previously created
    try { await conn.query('ALTER TABLE students ADD COLUMN fatherName VARCHAR(255)'); } catch {}
    try { await conn.query('ALTER TABLE pending_registrations ADD COLUMN fatherName VARCHAR(255)'); } catch {}

    // 2. Classes Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        state VARCHAR(50) DEFAULT 'Synced',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Exams Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS exams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        className VARCHAR(100) NOT NULL,
        date VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'private',
        numQuestions INT DEFAULT 180,
        answerKey JSON,
        correctMarks FLOAT DEFAULT 4,
        incorrectMarks FLOAT DEFAULT -1,
        unansweredMarks FLOAT DEFAULT 0,
        startsAt VARCHAR(100),
        durationMins INT DEFAULT 180,
        loginOption VARCHAR(50),
        passcode VARCHAR(50),
        subjects JSON,
        sections JSON,
        answerKeys JSON,
        sectionsMarking JSON,
        rollNoDigits INT DEFAULT 5,
        examSetsCount INT DEFAULT 1,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure columns exist if table was previously created
    const addCol = async (colDef) => {
      try { await conn.query(`ALTER TABLE exams ADD COLUMN ${colDef}`); } catch {}
    };
    await addCol('subjects JSON');
    await addCol('sections JSON');
    await addCol('answerKeys JSON');
    await addCol('sectionsMarking JSON');
    await addCol('rollNoDigits INT DEFAULT 5');
    await addCol('examSetsCount INT DEFAULT 1');

    // 4. Questions Table for Online MCQ Tests
    await conn.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        examId INT NOT NULL,
        sectionName VARCHAR(100),
        questionText TEXT,
        options JSON,
        correctOptionIdx INT DEFAULT 0,
        explanation TEXT,
        questionImage LONGTEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. Attendance Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date VARCHAR(50) NOT NULL,
        studentId INT NOT NULL,
        className VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        attendanceMethod VARCHAR(50) DEFAULT 'Manual',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_daily_att (date, studentId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 6. Submissions Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        examId INT NOT NULL,
        studentId INT NOT NULL,
        score FLOAT NOT NULL,
        answers JSON,
        scannedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        omrImageUrl TEXT,
        accessToken VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 7. Pending Registrations Table for Student Invite Links
    await conn.query(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        studentNum VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        fatherName VARCHAR(255),
        className VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        whatsappNumber VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8. Teachers Table for Master Admin & Teacher Accounts
    await conn.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    conn.release();
    console.log('✅ Hostinger MySQL Database Schema verified & auto-created successfully!');
  } catch (err) {
    console.warn('⚠️ Database auto-init warning (Ensure DB Password is set in .env):', err.message);
  }
};

initDatabase();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure Uploads folder exists for scanned OMR images & face photos
const uploadsDir = path.join(__dirname, 'uploads', 'omr_scans');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve Production React Bundle from dist
app.use(express.static(path.join(__dirname, 'dist')));

// API Health Endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  if (pool) {
    try {
      const conn = await pool.getConnection();
      conn.release();
      dbStatus = 'connected';
    } catch (e) {
      dbStatus = 'connection_error';
    }
  }
  res.json({ 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: dbStatus,
    message: 'Exam Portal Hostinger Node.js Engine Active!' 
  });
});

// Full Cloud Sync Endpoint for Multi-Device Real-Time Sync
app.get('/api/sync/all', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const [students] = await pool.query('SELECT * FROM students');
    const [classes] = await pool.query('SELECT * FROM classes');
    const [exams] = await pool.query('SELECT * FROM exams');
    const [attendance] = await pool.query('SELECT * FROM attendance');
    const [submissions] = await pool.query('SELECT * FROM submissions');
    const [questions] = await pool.query('SELECT * FROM questions');
    const [teachers] = await pool.query('SELECT id, userId, password, name, phone, email, createdAt FROM teachers');

    res.json({
      students: students.map(s => ({
        ...s,
        faceDescriptor: s.faceDescriptor ? JSON.parse(s.faceDescriptor) : undefined
      })),
      classes,
      exams: exams.map(e => ({
        ...e,
        answerKey: typeof e.answerKey === 'string' ? JSON.parse(e.answerKey) : e.answerKey,
        subjects: typeof e.subjects === 'string' ? JSON.parse(e.subjects) : e.subjects,
        sections: typeof e.sections === 'string' ? JSON.parse(e.sections) : e.sections,
        answerKeys: typeof e.answerKeys === 'string' ? JSON.parse(e.answerKeys) : e.answerKeys,
        sectionsMarking: typeof e.sectionsMarking === 'string' ? JSON.parse(e.sectionsMarking) : e.sectionsMarking
      })),
      attendance,
      submissions: submissions.map(sub => ({
        ...sub,
        answers: typeof sub.answers === 'string' ? JSON.parse(sub.answers) : sub.answers
      })),
      questions: questions.map(q => ({
        ...q,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
      })),
      teachers
    });
  } catch (err) {
    console.error('Failed to sync all data:', err);
    res.status(500).json({ error: err.message });
  }
});

// TEACHER MANAGEMENT & AUTHENTICATION ENDPOINTS
app.get('/api/teachers', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const [rows] = await pool.query('SELECT id, userId, password, name, phone, email, createdAt FROM teachers ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teachers', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id, userId, password, name, phone, email } = req.body;
  try {
    if (id) {
      const query = `
        UPDATE teachers SET userId = ?, password = ?, name = ?, phone = ?, email = ?
        WHERE id = ?;
      `;
      await pool.query(query, [userId, password, name, phone || null, email || null, id]);
      res.json({ success: true, id });
    } else {
      const query = `
        INSERT INTO teachers (userId, password, name, phone, email)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          password = VALUES(password),
          name = VALUES(name),
          phone = VALUES(phone),
          email = VALUES(email);
      `;
      const [result] = await pool.query(query, [userId, password, name, phone || null, email || null]);
      res.json({ success: true, id: result.insertId || result.id });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/teachers/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const teacherId = req.params.id;
  try {
    await pool.query('DELETE FROM teachers WHERE id = ?', [teacherId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teacher-login', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { userId, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM teachers WHERE userId = ? AND password = ?', [userId, password]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid Teacher User ID or Password' });
    }
    const teacher = rows[0];
    res.json({
      success: true,
      teacher: {
        id: teacher.id,
        userId: teacher.userId,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upsert Student API
app.post('/api/students', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { studentNum, name, fatherName, className, email, phone, whatsappNumber, faceDescriptor } = req.body;
  try {
    const faceJson = faceDescriptor ? JSON.stringify(faceDescriptor) : null;
    const query = `
      INSERT INTO students (studentNum, name, fatherName, className, email, phone, whatsappNumber, faceDescriptor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        fatherName = VALUES(fatherName),
        className = VALUES(className),
        email = VALUES(email),
        phone = VALUES(phone),
        whatsappNumber = VALUES(whatsappNumber),
        faceDescriptor = COALESCE(VALUES(faceDescriptor), faceDescriptor);
    `;
    const [result] = await pool.query(query, [studentNum, name, fatherName || null, className, email, phone, whatsappNumber, faceJson]);
    res.json({ success: true, id: result.insertId || result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Student Face Descriptor API
app.delete('/api/students/:id/face', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const studentId = req.params.id;
  try {
    await pool.query('UPDATE students SET faceDescriptor = NULL WHERE id = ?', [studentId]);
    res.json({ success: true, message: 'Face descriptor removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upsert Attendance API
app.post('/api/attendance', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { date, studentId, className, status, attendanceMethod } = req.body;
  try {
    const query = `
      INSERT INTO attendance (date, studentId, className, status, attendanceMethod)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status), attendanceMethod = VALUES(attendanceMethod);
    `;
    await pool.query(query, [date, studentId, className, status, attendanceMethod || 'Manual']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upsert Exam API (Create or update exam details & answer keys in Hostinger MySQL)
app.post('/api/exams', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id, title, className, date, status, numQuestions, answerKey, correctMarks, incorrectMarks, unansweredMarks, startsAt, durationMins, loginOption, passcode, subjects, sections, answerKeys, sectionsMarking, rollNoDigits, examSetsCount } = req.body;
  try {
    const keyJson = typeof answerKey === 'object' ? JSON.stringify(answerKey) : answerKey;
    const subjectsJson = typeof subjects === 'object' ? JSON.stringify(subjects) : subjects;
    const sectionsJson = typeof sections === 'object' ? JSON.stringify(sections) : sections;
    const answerKeysJson = typeof answerKeys === 'object' ? JSON.stringify(answerKeys) : answerKeys;
    const sectionsMarkingJson = typeof sectionsMarking === 'object' ? JSON.stringify(sectionsMarking) : sectionsMarking;

    if (id) {
      const query = `
        UPDATE exams SET
          title = ?, className = ?, date = ?, status = ?, numQuestions = ?, answerKey = ?,
          correctMarks = ?, incorrectMarks = ?, unansweredMarks = ?, startsAt = ?, durationMins = ?,
          loginOption = ?, passcode = ?, subjects = ?, sections = ?, answerKeys = ?, sectionsMarking = ?,
          rollNoDigits = ?, examSetsCount = ?
        WHERE id = ?;
      `;
      await pool.query(query, [title, className, date, status || 'private', numQuestions || 180, keyJson, correctMarks ?? 4, incorrectMarks ?? -1, unansweredMarks ?? 0, startsAt, durationMins, loginOption, passcode, subjectsJson, sectionsJson, answerKeysJson, sectionsMarkingJson, rollNoDigits || 5, examSetsCount || 1, id]);
      res.json({ success: true, id });
    } else {
      const query = `
        INSERT INTO exams (title, className, date, status, numQuestions, answerKey, correctMarks, incorrectMarks, unansweredMarks, startsAt, durationMins, loginOption, passcode, subjects, sections, answerKeys, sectionsMarking, rollNoDigits, examSetsCount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      const [result] = await pool.query(query, [title, className, date, status || 'private', numQuestions || 180, keyJson, correctMarks ?? 4, incorrectMarks ?? -1, unansweredMarks ?? 0, startsAt, durationMins, loginOption, passcode, subjectsJson, sectionsJson, answerKeysJson, sectionsMarkingJson, rollNoDigits || 5, examSetsCount || 1]);
      res.json({ success: true, id: result.insertId });
    }
  } catch (err) {
    console.error("Exam save error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Upsert Questions API (Save MCQ questions for online exams in Hostinger MySQL)
app.post('/api/questions', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { examId, questions } = req.body;
  if (!examId || !Array.isArray(questions)) return res.status(400).json({ error: 'Invalid parameters' });
  try {
    await pool.query('DELETE FROM questions WHERE examId = ?', [examId]);
    for (const q of questions) {
      const optionsJson = typeof q.options === 'object' ? JSON.stringify(q.options) : q.options;
      await pool.query(`
        INSERT INTO questions (examId, sectionName, questionText, options, correctOptionIdx, explanation, questionImage)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [examId, q.sectionName, q.questionText, optionsJson, q.correctOptionIdx || 0, q.explanation || '', q.questionImage || null]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Questions save error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Upsert Submission API (Save student scores & graded responses in Hostinger MySQL)
app.post('/api/submissions', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id, examId, studentId, score, answers, omrImageUrl, accessToken } = req.body;
  try {
    const ansJson = typeof answers === 'object' ? JSON.stringify(answers) : answers;
    if (id) {
      const query = `
        UPDATE submissions SET score = ?, answers = ?, omrImageUrl = COALESCE(?, omrImageUrl), accessToken = COALESCE(?, accessToken)
        WHERE id = ?;
      `;
      await pool.query(query, [score, ansJson, omrImageUrl, accessToken, id]);
      res.json({ success: true, id });
    } else {
      const query = `
        INSERT INTO submissions (examId, studentId, score, answers, omrImageUrl, accessToken)
        VALUES (?, ?, ?, ?, ?, ?);
      `;
      const [result] = await pool.query(query, [examId, studentId, score, ansJson, omrImageUrl, accessToken]);
      res.json({ success: true, id: result.insertId });
    }
  } catch (err) {
    console.error("Submission save error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Upsert Class API
app.post('/api/classes', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { name, state } = req.body;
  try {
    const query = `
      INSERT INTO classes (name, state)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE state = VALUES(state);
    `;
    const [result] = await pool.query(query, [name, state || 'Synced']);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pending Registrations APIs for Student Invite Links
app.get('/api/pending-registrations', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const [rows] = await pool.query('SELECT * FROM pending_registrations WHERE status = "pending" ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/register-student', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { studentNum, name, fatherName, className, email, phone, whatsappNumber } = req.body;
  try {
    const query = `
      INSERT INTO pending_registrations (studentNum, name, fatherName, className, email, phone, whatsappNumber, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending');
    `;
    const [result] = await pool.query(query, [studentNum, name, fatherName || null, className, email, phone, whatsappNumber]);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/approve-registration', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id, status } = req.body;
  try {
    await pool.query('UPDATE pending_registrations SET status = ? WHERE id = ?', [status || 'approved', id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save Scanned OMR Sheet Image API
app.post('/api/upload-omr', async (req, res) => {
  const { imageDataBase64, filename } = req.body;
  if (!imageDataBase64) return res.status(400).json({ error: 'No image data provided' });

  try {
    const base64Data = imageDataBase64.replace(/^data:image\/\w+;base64,/, '');
    const fileName = filename || `omr_${Date.now()}.jpg`;
    const filePath = path.join(uploadsDir, fileName);

    await fs.promises.writeFile(filePath, base64Data, 'base64');
    const publicUrl = `/uploads/omr_scans/${fileName}`;
    res.json({ success: true, url: publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve Production Static Assets (Checks both dist folder and root folder for Hostinger)
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')));
}
app.use(express.static(__dirname));

// SPA Routing Fallback with No-Cache Headers
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');

  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else if (fs.existsSync(rootPath)) {
    res.sendFile(rootPath);
  } else {
    res.status(404).send('Index HTML not found. Please ensure npm run build has completed.');
  }
});

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Exam Portal Engine Running on Port ${PORT}`);
  console.log(`🗄️ Hostinger Database: ${dbConfig.database} (${dbConfig.user})`);
  console.log(`===================================================`);
});
