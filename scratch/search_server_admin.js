import fs from 'fs';

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('adminGoogleEmails') || line.toLowerCase().includes('google') || line.toLowerCase().includes('auth')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
