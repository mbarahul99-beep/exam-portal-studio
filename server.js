import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-install missing dependencies on startup (designed for Hostinger deploys)
const depPath = path.join(__dirname, 'node_modules', 'google-auth-library');
if (!fs.existsSync(depPath)) {
  console.log('📦 Auto-installing missing dependencies (google-auth-library)...');
  try {
    execSync('npm install --production', { stdio: 'inherit', cwd: __dirname });
    console.log('✅ Dependencies installed successfully!');
  } catch (err) {
    console.error('❌ Auto-install failed:', err.message);
  }
}

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
        studentNum VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        fatherName VARCHAR(255),
        className VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        whatsappNumber VARCHAR(50),
        faceDescriptor LONGTEXT,
        facePhoto LONGTEXT,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_student_class (studentNum, className)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Migrate studentNum index to composite unique key (studentNum, className)
    try {
      await conn.query('ALTER TABLE students DROP INDEX studentNum');
    } catch {}
    try {
      await conn.query('ALTER TABLE students ADD UNIQUE KEY unique_student_class (studentNum, className)');
    } catch {}

    // Ensure columns exist if table was previously created
    try { await conn.query('ALTER TABLE students ADD COLUMN fatherName VARCHAR(255)'); } catch {}
    try { await conn.query('ALTER TABLE pending_registrations ADD COLUMN fatherName VARCHAR(255)'); } catch {}
    try { await conn.query('ALTER TABLE students ADD COLUMN facePhoto LONGTEXT'); } catch {}
    try { await conn.query('ALTER TABLE students MODIFY COLUMN faceDescriptor LONGTEXT'); } catch {}

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
        difficulties JSON,
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
    await addCol('difficulties JSON');
    await addCol('sectionsMarking JSON');
    await addCol('rollNoDigits INT DEFAULT 5');
    await addCol('examSetsCount INT DEFAULT 1');
    await addCol('isResultsPublished TINYINT(1) DEFAULT 0');
    await addCol('showResultsToStudent TINYINT(1) DEFAULT 1');
    await addCol('isArchived TINYINT(1) DEFAULT 0');

    // 4. Questions Table for Online MCQ Tests
    await conn.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        examId INT NOT NULL,
        subjectName VARCHAR(255) DEFAULT NULL,
        sectionName VARCHAR(100),
        questionText LONGTEXT,
        options JSON,
        correctOptionIdx INT DEFAULT 0,
        difficulty VARCHAR(50) DEFAULT 'Easy',
        explanation LONGTEXT,
        questionImage LONGTEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try { await conn.query(`ALTER TABLE questions ADD COLUMN subjectName VARCHAR(255) DEFAULT NULL`); } catch {}
    try { await conn.query(`ALTER TABLE questions ADD COLUMN difficulty VARCHAR(50) DEFAULT 'Easy'`); } catch {}
    try { await conn.query(`ALTER TABLE questions MODIFY COLUMN questionText LONGTEXT`); } catch {}
    try { await conn.query(`ALTER TABLE questions MODIFY COLUMN explanation LONGTEXT`); } catch {}

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
        scannedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        omrImageUrl LONGTEXT,
        accessToken VARCHAR(255),
        attemptType VARCHAR(20) DEFAULT 'OMR',
        cheatingAlertsCount INT DEFAULT 0,
        timeTakenSeconds INT DEFAULT 0,
        bookletSet VARCHAR(10) DEFAULT 'A',
        UNIQUE KEY unique_exam_student (examId, studentId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    // Purge any existing duplicate submissions in MySQL before enforcing UNIQUE constraint
    try {
      await conn.query(`
        DELETE s1 FROM submissions s1
        INNER JOIN submissions s2 
        ON s1.examId = s2.examId AND s1.studentId = s2.studentId AND s1.id < s2.id
      `);
    } catch (e) {}

    try { await conn.query('ALTER TABLE submissions ADD UNIQUE KEY unique_exam_student (examId, studentId)'); } catch {}
    try { await conn.query('ALTER TABLE submissions MODIFY COLUMN omrImageUrl LONGTEXT'); } catch {}
    try { await conn.query('ALTER TABLE submissions MODIFY COLUMN scannedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'); } catch {}

    const addSubCol = async (colDef) => {
      try { await conn.query(`ALTER TABLE submissions ADD COLUMN ${colDef}`); } catch {}
    };
    await addSubCol("attemptType VARCHAR(20) DEFAULT 'OMR'");
    await addSubCol("cheatingAlertsCount INT DEFAULT 0");
    await addSubCol("timeTakenSeconds INT DEFAULT 0");
    await addSubCol("bookletSet VARCHAR(10) DEFAULT 'A'");

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

    // Automatic cleanup of legacy demo data from MySQL
    try {
      await conn.query(`
        DELETE FROM students 
        WHERE email LIKE '%@appexjind.in' 
           OR studentNum IN ('1000000001','1000000002','1000000003','1000000004','1000000005');
      `);
      await conn.query(`
        DELETE FROM exams 
        WHERE title LIKE '%NEET Practice Test 1%';
      `);
      await conn.query(`
        DELETE FROM classes 
        WHERE name IN ('JEE', 'Grade 12-A', 'NEET 1') 
          AND name NOT IN (SELECT DISTINCT className FROM students);
      `);
      console.log('✅ Legacy demo data automatically purged from Hostinger MySQL!');
      
      // Self-healing database optimization & deduplication check
      try {
        console.log('🔄 Optimizing and deduplicating exams & questions database tables...');
        
        // 1. Delete duplicate exams keeping only the latest exam ID for each title + class
        await conn.query(`
          DELETE e1 FROM exams e1
          INNER JOIN exams e2 
          ON e1.title = e2.title AND e1.className = e2.className AND e1.id < e2.id
        `);
        
        // 1b. Clean up orphaned exams for classes that no longer exist
        await conn.query(`
          DELETE FROM exams 
          WHERE className NOT IN (SELECT name FROM classes)
        `);

        // 2. Clean up orphaned questions and submissions
        await conn.query(`
          DELETE FROM questions 
          WHERE examId NOT IN (SELECT id FROM exams)
        `);
        await conn.query(`
          DELETE FROM submissions 
          WHERE examId NOT IN (SELECT id FROM exams)
        `);

        // Permanent one-time deletion of target exams: "NEET TEST" (NEET 12TH) and "NEET T" (NEET)
        try {
          const [targetExams] = await conn.query(
            'SELECT id FROM exams WHERE (title = "NEET TEST" AND className = "NEET 12TH") OR (title = "NEET T" AND className = "NEET")'
          );
          if (targetExams && targetExams.length > 0) {
            const targetIds = targetExams.map(ex => ex.id);
            await conn.query('DELETE FROM questions WHERE examId IN (?)', [targetIds]);
            await conn.query('DELETE FROM submissions WHERE examId IN (?)', [targetIds]);
            await conn.query('DELETE FROM exams WHERE id IN (?)', [targetIds]);
            console.log('✅ Target exams permanently deleted from Hostinger MySQL on startup!');
          }
        } catch (e) {
          console.error('Failed to purge target exams:', e.message);
        }
        
        // 3. Deduplicate questions table by removing duplicate questions linked to the same exam
        await conn.query(`
          DELETE q1 FROM questions q1
          INNER JOIN questions q2
          ON q1.examId = q2.examId AND q1.questionText = q2.questionText AND q1.id > q2.id
        `);
        
        // 4. Reset bloated numQuestions counts of exams has been removed as it is handled dynamically and can override offline OMR exams count.
        
        console.log('✅ MySQL tables optimized, deduplicated, and synced successfully!');
      } catch (err) {
        console.warn('⚠️ Database self-healing optimization warning:', err.message);
      }
    } catch (e) {
      console.warn('Demo data cleanup notice:', e.message);
    }

    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          \`key\` VARCHAR(100) NOT NULL UNIQUE,
          value TEXT,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('✅ app_settings table initialized successfully!');
    } catch (e) {
      console.warn('app_settings table init warning:', e.message);
    }

    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS question_banks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          targetExam VARCHAR(255) NOT NULL,
          subject VARCHAR(255) NOT NULL,
          topic VARCHAR(255) NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('✅ question_banks table initialized successfully!');
    } catch (e) {
      console.warn('question_banks table init warning:', e.message);
    }

    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS bank_questions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          bankId INT NOT NULL,
          questionText LONGTEXT NOT NULL,
          options LONGTEXT NOT NULL,
          correctOptionIdx INT NOT NULL,
          difficulty VARCHAR(50) NOT NULL,
          explanation LONGTEXT,
          questionImage LONGTEXT,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (bankId) REFERENCES question_banks(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('✅ bank_questions table initialized successfully!');
      try { await conn.query('ALTER TABLE bank_questions MODIFY COLUMN options LONGTEXT NOT NULL'); } catch {}
      try { await conn.query('ALTER TABLE bank_questions ADD COLUMN questionImage LONGTEXT'); } catch {}
    } catch (e) {
      console.warn('bank_questions table init warning:', e.message);
    }

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

// Enable CORS globally to support cross-origin requests from Cloudflare Pages (Option B)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Disable API caching globally for all Node.js Hostinger endpoints to prevent stale database state
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

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
    const [settingsRows] = await pool.query('SELECT `key`, `value` FROM app_settings');
    const [questionBanks] = await pool.query('SELECT * FROM question_banks');
    const [bankQuestions] = await pool.query('SELECT * FROM bank_questions');

    res.json({
      students: students.map(s => ({
        ...s,
        faceDescriptor: s.faceDescriptor ? JSON.parse(s.faceDescriptor) : undefined
      })),
      classes,
      exams: exams.map(e => ({
        ...e,
        isResultsPublished: Boolean(e.isResultsPublished),
        showResultsToStudent: e.showResultsToStudent === undefined ? true : Boolean(e.showResultsToStudent),
        isArchived: Boolean(e.isArchived),
        answerKey: typeof e.answerKey === 'string' ? JSON.parse(e.answerKey) : e.answerKey,
        subjects: typeof e.subjects === 'string' ? JSON.parse(e.subjects) : e.subjects,
        sections: typeof e.sections === 'string' ? JSON.parse(e.sections) : e.sections,
        answerKeys: typeof e.answerKeys === 'string' ? JSON.parse(e.answerKeys) : e.answerKeys,
        sectionsMarking: typeof e.sectionsMarking === 'string' ? JSON.parse(e.sectionsMarking) : e.sectionsMarking,
        difficulties: typeof e.difficulties === 'string' ? JSON.parse(e.difficulties) : e.difficulties
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
      teachers,
      settings: settingsRows.reduce((acc, r) => {
        acc[r.key] = r.value;
        return acc;
      }, {}),
      questionBanks,
      bankQuestions: bankQuestions.map(bq => ({
        ...bq,
        options: typeof bq.options === 'string' ? JSON.parse(bq.options) : bq.options
      }))
    });
  } catch (err) {
    console.error('Failed to sync all data:', err);
    res.status(500).json({ error: err.message });
  }
});

// App Settings API Routes
app.get('/api/settings', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const [rows] = await pool.query('SELECT `key`, `value` FROM app_settings');
    const settings = {};
    rows.forEach(r => {
      if (r.key === 'gemini_api_key') {
        settings[r.key] = r.value ? '••••••••' : '';
      } else {
        settings[r.key] = r.value;
      }
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const settings = req.body;
    for (const key of Object.keys(settings)) {
      const val = settings[key];
      await pool.query(
        'INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, val, val]
      );
    }
    res.json({ success: true, message: 'Settings saved successfully in Cloud MySQL database!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/owner', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { idToken, clientId, settings } = req.body;
  if (!idToken) return res.status(400).json({ error: 'Missing Google ID Token' });
  if (!settings) return res.status(400).json({ error: 'Missing settings payload' });

  try {
    const { OAuth2Client } = await import('google-auth-library');
    const googleClient = new OAuth2Client();

    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken,
        audience: clientId
      });
    } catch (authErr) {
      if (authErr.message && authErr.message.includes('Token used too late')) {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const payloadBuf = Buffer.from(parts[1], 'base64');
          const payload = JSON.parse(payloadBuf.toString('utf-8'));
          if (payload && payload.email && payload.email.toLowerCase() === 'rahulpandeyji392@gmail.com') {
            ticket = { getPayload: () => payload };
          } else {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      } else {
        throw authErr;
      }
    }
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token payload' });
    }
    
    const email = payload.email.toLowerCase();
    if (email !== 'rahulpandeyji392@gmail.com') {
      return res.status(403).json({ error: 'Access Denied: Only the application owner/developer can access these controls.' });
    }

    for (const key of Object.keys(settings)) {
      const val = settings[key];
      await pool.query(
        'INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, val, val]
      );
    }
    res.json({ success: true, message: 'Developer settings updated successfully!' });
  } catch (err) {
    console.error("Owner Settings Action Failed:", err);
    res.status(500).json({ error: `Action failed: ${err.message}` });
  }
});

// QUESTION BANK API ROUTES
app.get('/api/question-banks', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const [rows] = await pool.query('SELECT * FROM question_banks ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/question-banks', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id, name, targetExam, subject, topic, createdAt } = req.body;
  try {
    const query = `
      INSERT INTO question_banks (id, name, targetExam, subject, topic, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        targetExam = VALUES(targetExam),
        subject = VALUES(subject),
        topic = VALUES(topic),
        createdAt = VALUES(createdAt);
    `;
    const createdTime = createdAt ? new Date(createdAt) : new Date();
    const [result] = await pool.query(query, [id || null, name, targetExam, subject, topic, createdTime]);
    res.json({ success: true, id: id || result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/question-banks/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const bankId = req.params.id;
  try {
    await pool.query('DELETE FROM question_banks WHERE id = ?', [bankId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/question-banks/delete', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM question_banks WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bank-questions', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const [rows] = await pool.query('SELECT * FROM bank_questions ORDER BY id DESC');
    const parsedRows = rows.map(r => ({
      ...r,
      options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options
    }));
    res.json(parsedRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bank-questions', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id, bankId, questionText, options, correctOptionIdx, difficulty, explanation, questionImage, createdAt } = req.body;
  try {
    const optionsJson = Array.isArray(options) ? JSON.stringify(options) : options;
    const query = `
      INSERT INTO bank_questions (id, bankId, questionText, options, correctOptionIdx, difficulty, explanation, questionImage, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        bankId = VALUES(bankId),
        questionText = VALUES(questionText),
        options = VALUES(options),
        correctOptionIdx = VALUES(correctOptionIdx),
        difficulty = VALUES(difficulty),
        explanation = VALUES(explanation),
        questionImage = VALUES(questionImage),
        createdAt = VALUES(createdAt);
    `;
    const createdTime = createdAt ? new Date(createdAt) : new Date();
    const [result] = await pool.query(query, [id || null, bankId, questionText, optionsJson, correctOptionIdx, difficulty, explanation || null, questionImage || null, createdTime]);
    res.json({ success: true, id: id || result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bank-questions/bulk', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { questions } = req.body;
  if (!Array.isArray(questions)) return res.status(400).json({ error: 'Invalid parameters' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const results = [];
    for (const q of questions) {
      const { id, bankId, questionText, options, correctOptionIdx, difficulty, explanation, questionImage, createdAt } = q;
      const optionsJson = Array.isArray(options) ? JSON.stringify(options) : options;
      const query = `
        INSERT INTO bank_questions (id, bankId, questionText, options, correctOptionIdx, difficulty, explanation, questionImage, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          bankId = VALUES(bankId),
          questionText = VALUES(questionText),
          options = VALUES(options),
          correctOptionIdx = VALUES(correctOptionIdx),
          difficulty = VALUES(difficulty),
          explanation = VALUES(explanation),
          questionImage = VALUES(questionImage),
          createdAt = VALUES(createdAt);
      `;
      const createdTime = createdAt ? new Date(createdAt) : new Date();
      const targetId = (id && Number(id) > 0) ? Number(id) : null;
      const [resObj] = await conn.query(query, [targetId, bankId, questionText, optionsJson, correctOptionIdx, difficulty, explanation || null, questionImage || null, createdTime]);
      
      results.push({
        localId: id,
        serverId: targetId || resObj.insertId
      });
    }
    await conn.commit();
    res.json({ success: true, results });
  } catch (err) {
    await conn.rollback();
    console.error("Bulk bank questions save error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.delete('/api/bank-questions/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const qId = req.params.id;
  try {
    await pool.query('DELETE FROM bank_questions WHERE id = ?', [qId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/bank-questions/delete', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM bank_questions WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
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
  const { userId, password, name, phone, email } = req.body;
  try {
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
  } catch (err) {
    console.error('MySQL teacher upsert error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/teachers/:identifier', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const identifier = req.params.identifier;
  try {
    await pool.query('DELETE FROM teachers WHERE id = ? OR userId = ?', [identifier, identifier]);
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

// Google Sign-In Verification API (OAuth 2.0 Integration)
app.post('/api/auth/google', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { idToken, clientId } = req.body;
  if (!idToken) return res.status(400).json({ error: 'Missing Google ID Token' });
  
  try {
    const { OAuth2Client } = await import('google-auth-library');
    const googleClient = new OAuth2Client();

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: clientId
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token payload' });
    }
    
    const email = payload.email.toLowerCase();
    const name = payload.name || payload.given_name || 'Google User';
    
    // Check if this is the Master Admin (Option A - Environment Variable)
    const adminGoogleEmailsEnv = (process.env.ADMIN_GOOGLE_EMAIL || 'admin@example.com')
      .split(',')
      .map(e => e.trim().toLowerCase());
    
    // Check if there are other master admins configured in MySQL app_settings (Option B)
    let adminGoogleEmailsDb = [];
    try {
      const [settingsRows] = await pool.query('SELECT `value` FROM app_settings WHERE `key` = ?', ['adminGoogleEmails']);
      if (settingsRows.length > 0 && settingsRows[0].value) {
        adminGoogleEmailsDb = settingsRows[0].value
          .split(',')
          .map(e => e.trim().toLowerCase());
      }
    } catch (e) {
      console.warn("Could not query adminGoogleEmails from database:", e.message);
    }

    const allAdminEmails = new Set([...adminGoogleEmailsEnv, ...adminGoogleEmailsDb]);
    const isOwner = email === 'rahulpandeyji392@gmail.com';

    if (isOwner || allAdminEmails.has(email)) {
      return res.json({
        success: true,
        role: 'admin',
        user: {
          id: 'admin',
          userId: 'admin',
          name: name,
          email: email,
          isOwner: isOwner
        }
      });
    }
    
    // Check if this is a registered Teacher in the MySQL database
    const [rows] = await pool.query('SELECT * FROM teachers WHERE LOWER(email) = ?', [email]);
    if (rows.length > 0) {
      const teacher = rows[0];
      return res.json({
        success: true,
        role: 'teacher',
        teacher: {
          id: teacher.id,
          userId: teacher.userId,
          name: teacher.name,
          email: teacher.email,
          phone: teacher.phone
        }
      });
    }
    
    // Unregistered Account fallback
    return res.status(401).json({
      error: `Access Denied: The Google account (${email}) is not registered. Please ask the Master Admin to register your email under Teacher/Staff management.`
    });
    
  } catch (err) {
    console.error("Google Token Verification Failed:", err);
    res.status(401).json({ error: `Google Sign-In failed: ${err.message}` });
  }
});

app.post('/api/students', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id, studentNum, name, fatherName, fathername, father_name, className, email, phone, whatsappNumber, faceDescriptor, facePhoto } = req.body;
  const resolvedFatherName = fatherName || fathername || father_name || null;
  try {
    if (className) {
      try {
        await pool.query('INSERT IGNORE INTO classes (name, state) VALUES (?, ?)', [className, 'Synced']);
      } catch {}
    }
    const faceJson = faceDescriptor ? (typeof faceDescriptor === 'object' ? JSON.stringify(faceDescriptor) : faceDescriptor) : null;
    
    let query = '';
    let params = [];
    let existsOnServer = false;

    if (id) {
      const [rows] = await pool.query('SELECT id FROM students WHERE id = ?', [id]);
      if (rows && rows.length > 0) {
        existsOnServer = true;
      }
    }

    if (existsOnServer) {
      query = `
        UPDATE students SET 
          studentNum = ?,
          name = ?,
          fatherName = ?,
          className = ?,
          email = ?,
          phone = ?,
          whatsappNumber = ?,
          faceDescriptor = COALESCE(?, faceDescriptor),
          facePhoto = COALESCE(?, facePhoto)
        WHERE id = ?
      `;
      params = [studentNum, name, resolvedFatherName, className, email || null, phone || null, whatsappNumber || null, faceJson, facePhoto || null, id];
    } else {
      if (id) {
        query = `
          INSERT INTO students (id, studentNum, name, fatherName, className, email, phone, whatsappNumber, faceDescriptor, facePhoto)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            fatherName = VALUES(fatherName),
            className = VALUES(className),
            email = VALUES(email),
            phone = VALUES(phone),
            whatsappNumber = VALUES(whatsappNumber),
            faceDescriptor = COALESCE(VALUES(faceDescriptor), faceDescriptor),
            facePhoto = COALESCE(VALUES(facePhoto), facePhoto);
        `;
        params = [id, studentNum, name, resolvedFatherName, className, email || null, phone || null, whatsappNumber || null, faceJson, facePhoto || null];
      } else {
        query = `
          INSERT INTO students (studentNum, name, fatherName, className, email, phone, whatsappNumber, faceDescriptor, facePhoto)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            fatherName = VALUES(fatherName),
            className = VALUES(className),
            email = VALUES(email),
            phone = VALUES(phone),
            whatsappNumber = VALUES(whatsappNumber),
            faceDescriptor = COALESCE(VALUES(faceDescriptor), faceDescriptor),
            facePhoto = COALESCE(VALUES(facePhoto), facePhoto);
        `;
        params = [studentNum, name, resolvedFatherName, className, email || null, phone || null, whatsappNumber || null, faceJson, facePhoto || null];
      }
    }

    const [result] = await pool.query(query, params);
    const savedId = existsOnServer ? id : (id || result.insertId);
    res.json({ success: true, id: savedId });
  } catch (err) {
    console.error("Student save error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete Student Face Descriptor API
app.delete('/api/students/:id/face', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const studentId = req.params.id;
  try {
    await pool.query('UPDATE students SET faceDescriptor = NULL, facePhoto = NULL WHERE id = ?', [studentId]);
    res.json({ success: true, message: 'Face record removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/students/delete-face', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.body;
  try {
    await pool.query('UPDATE students SET faceDescriptor = NULL, facePhoto = NULL WHERE id = ?', [id]);
    res.json({ success: true, message: 'Face record removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Student Record API
app.delete('/api/students/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM attendance WHERE studentId = ?', [id]);
    await pool.query('DELETE FROM submissions WHERE studentId = ?', [id]);
    await pool.query('DELETE FROM students WHERE id = ?', [id]);
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/students/delete', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM attendance WHERE studentId = ?', [id]);
    await pool.query('DELETE FROM submissions WHERE studentId = ?', [id]);
    await pool.query('DELETE FROM students WHERE id = ?', [id]);
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Exam API
app.delete('/api/exams/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM questions WHERE examId = ?', [id]);
    await pool.query('DELETE FROM submissions WHERE examId = ?', [id]);
    await pool.query('DELETE FROM exams WHERE id = ?', [id]);
    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/exams/delete', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM questions WHERE examId = ?', [id]);
    await pool.query('DELETE FROM submissions WHERE examId = ?', [id]);
    await pool.query('DELETE FROM exams WHERE id = ?', [id]);
    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Class API
app.delete('/api/classes/:name', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { name } = req.params;
  try {
    await pool.query('DELETE FROM questions WHERE examId IN (SELECT id FROM exams WHERE className = ?)', [name]);
    await pool.query('DELETE FROM submissions WHERE examId IN (SELECT id FROM exams WHERE className = ?)', [name]);
    await pool.query('DELETE FROM exams WHERE className = ?', [name]);
    await pool.query('DELETE FROM submissions WHERE studentId IN (SELECT id FROM students WHERE className = ?)', [name]);
    await pool.query('DELETE FROM attendance WHERE className = ?', [name]);
    await pool.query('DELETE FROM students WHERE className = ?', [name]);
    await pool.query('DELETE FROM classes WHERE name = ?', [name]);
    res.json({ success: true, message: 'Class and all associated records deleted successfully from Cloud database!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/classes/delete', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { name } = req.body;
  try {
    await pool.query('DELETE FROM questions WHERE examId IN (SELECT id FROM exams WHERE className = ?)', [name]);
    await pool.query('DELETE FROM submissions WHERE examId IN (SELECT id FROM exams WHERE className = ?)', [name]);
    await pool.query('DELETE FROM exams WHERE className = ?', [name]);
    await pool.query('DELETE FROM submissions WHERE studentId IN (SELECT id FROM students WHERE className = ?)', [name]);
    await pool.query('DELETE FROM attendance WHERE className = ?', [name]);
    await pool.query('DELETE FROM students WHERE className = ?', [name]);
    await pool.query('DELETE FROM classes WHERE name = ?', [name]);
    res.json({ success: true, message: 'Class and all associated records deleted successfully from Cloud database!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Submission API
app.delete('/api/submissions/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM submissions WHERE id = ?', [id]);
    res.json({ success: true, message: 'Submission deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/submissions/delete', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM submissions WHERE id = ?', [id]);
    res.json({ success: true, message: 'Submission deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Teacher API
app.delete('/api/teachers/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM teachers WHERE id = ? OR userId = ?', [id, id]);
    res.json({ success: true, message: 'Teacher deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/teachers/delete', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM teachers WHERE id = ? OR userId = ?', [id, id]);
    res.json({ success: true, message: 'Teacher deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Pending Registration API
app.delete('/api/pending-registrations/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM pending_registrations WHERE id = ?', [id]);
    res.json({ success: true, message: 'Pending registration deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/pending-registrations/delete', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM pending_registrations WHERE id = ?', [id]);
    res.json({ success: true, message: 'Pending registration deleted successfully' });
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
  const { id, title, className, date, status, numQuestions, answerKey, correctMarks, incorrectMarks, unansweredMarks, startsAt, durationMins, loginOption, passcode, subjects, sections, answerKeys, difficulties, sectionsMarking, rollNoDigits, examSetsCount, isResultsPublished, showResultsToStudent, isArchived } = req.body;
  try {
    const keyJson = typeof answerKey === 'object' ? JSON.stringify(answerKey) : answerKey;
    const subjectsJson = typeof subjects === 'object' ? JSON.stringify(subjects) : subjects;
    const sectionsJson = typeof sections === 'object' ? JSON.stringify(sections) : sections;
    const answerKeysJson = typeof answerKeys === 'object' ? JSON.stringify(answerKeys) : answerKeys;
    const difficultiesJson = typeof difficulties === 'object' ? JSON.stringify(difficulties) : difficulties;
    const sectionsMarkingJson = typeof sectionsMarking === 'object' ? JSON.stringify(sectionsMarking) : sectionsMarking;

    let existingExam = null;
    if (id) {
      const [rows] = await pool.query('SELECT id FROM exams WHERE id = ?', [id]);
      if (rows.length > 0) existingExam = rows[0];
    }

    if (existingExam) {
      const query = `
        UPDATE exams SET
          title = ?, className = ?, date = ?, status = ?, numQuestions = ?, answerKey = ?,
          correctMarks = ?, incorrectMarks = ?, unansweredMarks = ?, startsAt = ?, durationMins = ?,
          loginOption = ?, passcode = ?, subjects = ?, sections = ?, answerKeys = ?, difficulties = ?, sectionsMarking = ?,
          rollNoDigits = ?, examSetsCount = ?, isResultsPublished = ?, showResultsToStudent = ?, isArchived = ?
        WHERE id = ?;
      `;
      await pool.query(query, [title, className, date, status || 'private', numQuestions || 180, keyJson, correctMarks ?? 4, incorrectMarks ?? -1, unansweredMarks ?? 0, startsAt, durationMins, loginOption, passcode, subjectsJson, sectionsJson, answerKeysJson, difficultiesJson, sectionsMarkingJson, rollNoDigits || 5, examSetsCount || 1, isResultsPublished ? 1 : 0, showResultsToStudent !== false ? 1 : 0, isArchived ? 1 : 0, id]);
      res.json({ success: true, id });
    } else {
      const query = `
        INSERT INTO exams (title, className, date, status, numQuestions, answerKey, correctMarks, incorrectMarks, unansweredMarks, startsAt, durationMins, loginOption, passcode, subjects, sections, answerKeys, difficulties, sectionsMarking, rollNoDigits, examSetsCount, isResultsPublished, showResultsToStudent, isArchived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      const [result] = await pool.query(query, [title, className, date, status || 'private', numQuestions || 180, keyJson, correctMarks ?? 4, incorrectMarks ?? -1, unansweredMarks ?? 0, startsAt, durationMins, loginOption, passcode, subjectsJson, sectionsJson, answerKeysJson, difficultiesJson, sectionsMarkingJson, rollNoDigits || 5, examSetsCount || 1, isResultsPublished ? 1 : 0, showResultsToStudent !== false ? 1 : 0, isArchived ? 1 : 0]);
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
        INSERT INTO questions (examId, subjectName, sectionName, questionText, options, correctOptionIdx, explanation, questionImage, difficulty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [examId, q.subjectName || null, q.sectionName, q.questionText, optionsJson, q.correctOptionIdx || 0, q.explanation || '', q.questionImage || null, q.difficulty || 'Easy']);
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
  const { 
    examId, 
    studentId, 
    score, 
    answers, 
    omrImageUrl, 
    accessToken,
    attemptType,
    cheatingAlertsCount,
    timeTakenSeconds,
    bookletSet
  } = req.body;
  if (!examId || !studentId) return res.status(400).json({ error: 'Missing examId or studentId' });
  try {
    const ansJson = typeof answers === 'object' ? JSON.stringify(answers) : answers;
    const token = accessToken || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const query = `
      INSERT INTO submissions (
        examId, studentId, score, answers, omrImageUrl, accessToken,
        attemptType, cheatingAlertsCount, timeTakenSeconds, bookletSet
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        score = VALUES(score),
        answers = VALUES(answers),
        omrImageUrl = COALESCE(VALUES(omrImageUrl), omrImageUrl),
        accessToken = COALESCE(VALUES(accessToken), accessToken),
        attemptType = VALUES(attemptType),
        cheatingAlertsCount = VALUES(cheatingAlertsCount),
        timeTakenSeconds = VALUES(timeTakenSeconds),
        bookletSet = VALUES(bookletSet),
        scannedAt = CURRENT_TIMESTAMP;
    `;
    const [result] = await pool.query(query, [
      examId, 
      studentId, 
      score, 
      ansJson, 
      omrImageUrl || null, 
      token,
      attemptType || 'OMR',
      cheatingAlertsCount || 0,
      timeTakenSeconds || 0,
      bookletSet || 'A'
    ]);
    res.json({ success: true, id: result.insertId || result.id });
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

// Rename Class API
app.post('/api/classes/rename', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'Missing oldName or newName' });
  try {
    // 1. Check if new name already exists
    const [existing] = await pool.query('SELECT name FROM classes WHERE name = ?', [newName]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'A class with the new name already exists' });
    }

    // 2. Cascade rename
    await pool.query('UPDATE classes SET name = ? WHERE name = ?', [newName, oldName]);
    await pool.query('UPDATE students SET className = ? WHERE className = ?', [newName, oldName]);
    await pool.query('UPDATE attendance SET className = ? WHERE className = ?', [newName, oldName]);

    res.json({ success: true, message: 'Class renamed successfully in Cloud database!' });
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
  const { studentNum, name, fatherName, fathername, father_name, className, email, phone, whatsappNumber } = req.body;
  const resolvedFatherName = fatherName || fathername || father_name || null;
  try {
    const query = `
      INSERT INTO pending_registrations (studentNum, name, fatherName, className, email, phone, whatsappNumber, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending');
    `;
    const [result] = await pool.query(query, [studentNum, name, resolvedFatherName, className, email, phone, whatsappNumber]);
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
    const filePath = path.join(omrScansDir, fileName);

    await fs.promises.writeFile(filePath, base64Data, 'base64');
    const publicUrl = `/uploads/omr_scans/${fileName}`;
    res.json({ success: true, url: publicUrl, filename: fileName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gemini AI OMR Scanner models listing debug endpoint
app.post('/api/scan/debug-models', async (req, res) => {
  try {
    let apiKey = '';
    if (pool) {
      const [rows] = await pool.query('SELECT `value` FROM app_settings WHERE `key` = "gemini_api_key"');
      if (rows.length > 0 && rows[0].value) {
        apiKey = rows[0].value;
      }
    }
    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY || '';
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API Key is not configured.' });
    }

    const betaRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const betaData = await betaRes.json();
    
    const stableRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    const stableData = await stableRes.json();

    res.json({
      betaModels: betaData,
      stableModels: stableData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gemini AI OMR Scanner schema validation test endpoint
app.post('/api/scan/test-google-schema', async (req, res) => {
  try {
    let apiKey = '';
    if (pool) {
      const [rows] = await pool.query('SELECT `value` FROM app_settings WHERE `key` = "gemini_api_key"');
      if (rows.length > 0 && rows[0].value) {
        apiKey = rows[0].value;
      }
    }
    if (!apiKey) apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return res.status(400).json({ error: 'No API Key' });

    const requestBody = {
      contents: [
        {
          parts: [
            { text: "Respond with dummy JSON data matching the requested schema." }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            studentId: { type: 'STRING', description: 'The detected Student ID (Roll No) digits.' },
            studentName: { type: 'STRING', description: 'The transcribed handwritten Name from the sheet header, or "" if not found.' },
            fatherName: { type: 'STRING', description: 'The transcribed handwritten Father\'s Name from the sheet header, or "" if not found.' },
            answers: {
              type: 'ARRAY',
              description: 'List of answers for each question.',
              items: {
                type: 'OBJECT',
                properties: {
                  q: { type: 'INTEGER', description: 'Question number (from 1 to numQuestions).' },
                  ans: { type: 'STRING', description: 'Detected option character (A, B, C, D, or "" if empty/blank).' }
                },
                required: ['q', 'ans']
              }
            }
          },
          required: ['studentId', 'studentName', 'fatherName', 'answers']
        }
      }
    };

    const results = {};
    const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    for (const m of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent?key=${apiKey}`;
        const gRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        const text = await gRes.text();
        results[m] = { status: gRes.status, response: JSON.parse(text) };
      } catch (err) {
        results[m] = { error: err.message };
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gemini AI OMR Scanner direct query test endpoint
app.post('/api/scan/test-google-direct', async (req, res) => {
  try {
    let apiKey = '';
    if (pool) {
      const [rows] = await pool.query('SELECT `value` FROM app_settings WHERE `key` = "gemini_api_key"');
      if (rows.length > 0 && rows[0].value) {
        apiKey = rows[0].value;
      }
    }
    if (!apiKey) apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return res.status(400).json({ error: 'No API Key' });

    const results = {};
    const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    for (const m of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent?key=${apiKey}`;
        const gRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Respond 'OK'." }] }]
          })
        });
        const text = await gRes.text();
        results[m] = { status: gRes.status, response: JSON.parse(text) };
      } catch (err) {
        results[m] = { error: err.message };
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gemini AI OMR Scanner verification endpoint
app.post('/api/scan/ai-verify', async (req, res) => {
  const { imageDataBase64, numQuestions } = req.body;
  if (!imageDataBase64) return res.status(400).json({ error: 'No image data provided' });
  if (!numQuestions) return res.status(400).json({ error: 'Missing numQuestions parameter' });

  try {
    // 1. Retrieve Gemini API Key from Database
    let apiKey = '';
    if (pool) {
      const [rows] = await pool.query('SELECT `value` FROM app_settings WHERE `key` = "gemini_api_key"');
      if (rows.length > 0 && rows[0].value) {
        apiKey = rows[0].value;
      }
    }
    
    // Fall back to environment variable
    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY || '';
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API Key is not configured. Please configure it in the System Controls panel.' });
    }

    // 2. Prepare base64 image data
    const base64Data = imageDataBase64.replace(/^data:image\/\w+;base64,/, '');

    // 3. Construct Gemini Prompt & Schema
    const promptText = `You are a professional OMR scanning engine.
Analyze the provided image of an OMR exam sheet. The image may be a warped OMR crop or a full-frame photograph from a mobile camera.
Locate the OMR sheet in the image (it contains the candidate name header, roll number bubble grid, and the question response bubble columns).
The sheet has exactly ${numQuestions} questions.
Read the selected option circles (A, B, C, D, or empty/blank) for each question (from 1 to ${numQuestions}).
Also read the filled digits in the Student ID / Roll No grid columns from left to right.
In addition, transcribe the student's handwritten Name and Father's Name from the text fields in the sheet header (if present).
Return the result as a JSON object matching the requested schema.`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            studentId: { type: 'STRING', description: 'The detected Student ID (Roll No) digits.' },
            studentName: { type: 'STRING', description: 'The transcribed handwritten Name from the sheet header, or "" if not found.' },
            fatherName: { type: 'STRING', description: 'The transcribed handwritten Father\'s Name from the sheet header, or "" if not found.' },
            answers: {
              type: 'ARRAY',
              description: 'List of answers for each question.',
              items: {
                type: 'OBJECT',
                properties: {
                  q: { type: 'INTEGER', description: 'Question number (from 1 to numQuestions).' },
                  ans: { type: 'STRING', description: 'Detected option character (A, B, C, D, or "" if empty/blank).' }
                },
                required: ['q', 'ans']
              }
            }
          },
          required: ['studentId', 'studentName', 'fatherName', 'answers']
        }
      }
    };

    // 4. Call Google Gemini API (With self-healing candidate models fallback loop)
    const candidateModels = [
      'gemini-3.6-flash',
      'gemini-3.5-flash'
    ];

    let response = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      const controller = new AbortController();
      let timerId;

      try {
        console.log(`Attempting OMR parse with model: ${modelName}`);
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
        
        const fetchPromise = fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        const timeoutPromise = new Promise((_, reject) => {
          timerId = setTimeout(() => {
            controller.abort();
            reject(new Error('API request timed out (45s limit exceeded)'));
          }, 45000);
        });

        response = await Promise.race([fetchPromise, timeoutPromise]);
        clearTimeout(timerId);

        if (response.ok) {
          console.log(`OMR parse successful with model: ${modelName}`);
          break;
        } else {
          const errText = await response.text();
          lastError = new Error(`Model ${modelName} failed with status ${response.status}: ${errText}`);
          console.warn(lastError.message);
        }
      } catch (err) {
        if (timerId) clearTimeout(timerId);
        lastError = err;
        console.warn(`Model ${modelName} request failed:`, err.message);
      }
    }

    if (!response || !response.ok) {
      throw lastError || new Error('All candidate Gemini models failed to process the request.');
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Invalid or empty response from Gemini AI Model.');
    }

    const parsedResult = JSON.parse(candidateText.trim());
    
    // Normalize array of answers to key-value map format matching standard scan output
    const answersMap = {};
    if (Array.isArray(parsedResult.answers)) {
      parsedResult.answers.forEach(item => {
        if (item && item.q !== undefined) {
          answersMap[item.q] = item.ans || '';
        }
      });
    }

    res.json({ 
      success: true, 
      studentId: parsedResult.studentId || '', 
      studentName: parsedResult.studentName || '',
      fatherName: parsedResult.fatherName || '',
      answers: answersMap 
    });
  } catch (err) {
    console.error("AI Scan Verification Failed:", err);
    res.status(500).json({ error: `AI Scan failed: ${err.message}` });
  }
});

// Delete Student OMR Submission Record API
app.post('/api/admin/delete-submission', async (req, res) => {
  const { id, examId, studentId } = req.body;
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    if (id) {
      await pool.query('DELETE FROM submissions WHERE id = ?', [id]);
    } else if (examId && studentId) {
      await pool.query('DELETE FROM submissions WHERE examId = ? AND studentId = ?', [examId, studentId]);
    } else {
      return res.status(400).json({ error: 'Missing id or examId and studentId' });
    }
    res.json({ success: true, message: 'Submission record deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Purge Demo Data API
app.post('/api/admin/purge-demo-data', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  try {
    await pool.query("DELETE FROM students WHERE email LIKE '%@appexjind.in' OR studentNum IN ('1000000001','1000000002','1000000003','1000000004','1000000005')");
    await pool.query("DELETE FROM exams WHERE title LIKE '%NEET Practice Test 1%'");
    await pool.query("DELETE FROM classes WHERE name IN ('JEE', 'Grade 12-A', 'NEET 1') AND name NOT IN (SELECT DISTINCT className FROM students)");
    res.json({ success: true, message: 'All demo data permanently purged from MySQL database.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp Webhook Verification Endpoint (GET)
app.get('/api/whatsapp-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'ApexOMRVerifyToken2026';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WhatsApp Webhook verified successfully!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ WhatsApp Webhook verification failed: Token mismatch.');
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

// WhatsApp Webhook Event Handler Endpoint (POST)
app.post('/api/whatsapp-webhook', (req, res) => {
  const body = req.body;
  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0] &&
      body.entry[0].changes[0].value
    ) {
      const value = body.entry[0].changes[0].value;
      console.log('📱 WhatsApp Webhook event received:', JSON.stringify(value, null, 2));
    }
    return res.status(200).send('EVENT_RECEIVED');
  } else {
    return res.sendStatus(404);
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
