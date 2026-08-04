import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

walkDir('src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.toLowerCase().includes('whatsapp') || content.toLowerCase().includes('google account') || content.toLowerCase().includes('gmail')) {
      // Find matching lines
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('whatsapp') && (line.toLowerCase().includes('google') || line.toLowerCase().includes('account') || line.toLowerCase().includes('setting') || line.toLowerCase().includes('config') || line.toLowerCase().includes('email') || line.toLowerCase().includes('gmail'))) {
          console.log(`Match in ${filePath}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }
});
