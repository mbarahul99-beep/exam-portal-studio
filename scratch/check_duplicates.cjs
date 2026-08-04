const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'u874290068_u874290068_usr',
    password: '2026@Apex',
    database: 'u874290068_u874290068_app'
  });

  console.log("Connected to MySQL!");

  // Check duplicate students
  const [duplicateStudents] = await connection.query(`
    SELECT studentNum, className, COUNT(*) as count 
    FROM students 
    GROUP BY studentNum, className 
    HAVING count > 1
  `);
  console.log("Duplicate Students ([studentNum + className]):", duplicateStudents);

  // Check duplicate class names
  const [duplicateClasses] = await connection.query(`
    SELECT name, COUNT(*) as count 
    FROM classes 
    GROUP BY name 
    HAVING count > 1
  `);
  console.log("Duplicate Classes (name):", duplicateClasses);

  // Check duplicate teachers
  const [duplicateTeachers] = await connection.query(`
    SELECT userId, COUNT(*) as count 
    FROM teachers 
    GROUP BY userId 
    HAVING count > 1
  `);
  console.log("Duplicate Teachers (userId):", duplicateTeachers);

  // Check duplicate exams
  const [duplicateExams] = await connection.query(`
    SELECT title, className, COUNT(*) as count 
    FROM exams 
    GROUP BY title, className 
    HAVING count > 1
  `);
  console.log("Duplicate Exams (title + className):", duplicateExams);

  await connection.end();
}

main().catch(console.error);
