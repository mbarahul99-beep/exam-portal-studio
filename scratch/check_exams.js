import mysql from 'mysql2/promise';

const dbConfig = {
  host: '127.0.0.1',
  user: 'u874290068_u874290068_usr',
  password: '2026@Apex',
  database: 'u874290068_u874290068_app'
};

async function main() {
  const connection = await mysql.createConnection(dbConfig);
  const [exams] = await connection.query("SELECT id, title, className, numQuestions, correctMarks, incorrectMarks, sections FROM exams");
  console.log("EXAMS IN DB:");
  console.log(JSON.stringify(exams, null, 2));
  await connection.end();
}

main().catch(console.error);
