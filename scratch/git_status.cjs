const git = require('isomorphic-git');
const fs = require('fs');
const dir = 'C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal';

async function main() {
  const status = await git.statusMatrix({ fs, dir });
  status.forEach(([filepath, head, workdir, stage]) => {
    if (head !== workdir || head !== stage || workdir !== stage) {
      console.log(`${filepath}: head=${head}, workdir=${workdir}, stage=${stage}`);
    }
  });
}
main();
