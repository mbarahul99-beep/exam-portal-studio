const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..');

async function run() {
  console.log('Target directory:', dir);
  
  // 1. Check status matrix
  const matrix = await git.statusMatrix({ fs, dir });
  const modifiedFiles = [];
  matrix.forEach(([filepath, head, workdir, stage]) => {
    if (head !== workdir || head !== stage || workdir !== stage) {
      console.log(`Status: ${filepath} [head=${head}, workdir=${workdir}, stage=${stage}]`);
      modifiedFiles.push(filepath);
    }
  });

  // 2. Check remotes
  const remotes = await git.listRemotes({ fs, dir });
  console.log('Remotes:', JSON.stringify(remotes, null, 2));

  // 3. Current branch
  const branch = await git.currentBranch({ fs, dir, fullname: false });
  console.log('Current Branch:', branch);
}

run().catch(err => console.error(err));
