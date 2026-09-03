const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');
const http = require('isomorphic-git/http/node');

const dir = path.resolve(__dirname, '..');
const repoUrl = 'https://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@github.com/mbarahul99-beep/exam-portal.git';

async function pushToGitHub() {
  console.log('Staging files in:', dir);
  
  // Stage modified scanner files
  await git.add({ fs, dir, filepath: 'src/utils/omrScanner.ts' });
  await git.add({ fs, dir, filepath: 'src/components/ScanImagesView.tsx' });
  
  console.log('Committing changes...');
  const sha = await git.commit({
    fs,
    dir,
    author: {
      name: 'mbarahul99-beep',
      email: 'mbarahul99@gmail.com'
    },
    message: 'Fix OMR sheet scanner corner detection & dynamic layout alignment'
  });
  console.log('Commit created with SHA:', sha);

  console.log('Pushing to remote GitHub repository...');
  const pushResult = await git.push({
    fs,
    http,
    dir,
    url: repoUrl,
    remote: 'github',
    ref: 'main',
    force: true,
    onAuth: () => ({ username: 'mbarahul99-beep' })
  });

  console.log('Push successful! Result:', JSON.stringify(pushResult, null, 2));
}

pushToGitHub().catch(err => {
  console.error('Git operation failed:', err);
});
