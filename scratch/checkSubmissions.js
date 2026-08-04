import mysql from 'mysql2/promise';

async function run() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'u874290068_u874290068_usr',
    password: '2026@Apex',
    database: 'u874290068_u874290068_app'
  });

  console.log('Connected to database!');

  const [subs] = await connection.query('SELECT * FROM submissions');
  console.log('Submissions table rows:');
  console.log(JSON.stringify(subs, null, 2));

  await connection.end();
}

run().catch(console.error);
