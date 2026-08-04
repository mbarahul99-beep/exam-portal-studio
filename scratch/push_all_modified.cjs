const git = require('isomorphic-git');
const fs = require('fs');
const http = require('isomorphic-git/http/node');
const path = require('path');

const dir = 'C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal';

async function main() {
  console.log("Analyzing git status matrix...");
  const matrix = await git.statusMatrix({ fs, dir });
  
  // Find all modified, added, or deleted files
  for (const [filepath, head, workdir, stage] of matrix) {
    // 0 = absent, 1 = present/unchanged, 2 = modified
    if (head !== workdir || workdir !== stage) {
      if (workdir === 0) {
        // File deleted in workdir, remove from git
        console.log(`Removing: ${filepath}`);
        await git.remove({ fs, dir, filepath });
      } else {
        // File added or modified in workdir, add/stage it
        console.log(`Staging: ${filepath}`);
        await git.add({ fs, dir, filepath });
      }
    }
  }

  console.log("Committing changes...");
  const sha = await git.commit({
    fs,
    dir,
    author: {
      name: 'mbarahul99-beep',
      email: 'mbarahul99@gmail.com'
    },
    message: 'feat: Remove duplicate sections from student portal web dashboard and push production builds'
  });
  console.log(`Committed successfully. SHA: ${sha}`);

  console.log("Pushing to origin main...");
  const pushResponse = await git.push({
    fs,
    http,
    dir,
    remote: 'origin',
    ref: 'main'
  });
  console.log("Push complete:", pushResponse);
}

main().catch(err => {
  console.error("Git error:", err);
  process.exit(1);
});
