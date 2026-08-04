const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'scratch') {
        searchDir(fullPath);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('/api/settings') || content.includes('/api/sync/all')) {
          console.log(`Sync/Settings API reference in: ${fullPath}`);
        }
      }
    }
  });
}

searchDir('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal');
