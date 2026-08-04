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
    if (content.toLowerCase().includes('pdf') || content.toLowerCase().includes('jspdf') || content.toLowerCase().includes('html2pdf') || content.toLowerCase().includes('html2canvas')) {
      console.log(`Found match in: ${filePath}`);
    }
  }
});
