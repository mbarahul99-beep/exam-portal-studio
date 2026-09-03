const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');
const http = require('isomorphic-git/http/node');

const dir = path.resolve(__dirname, '..');
const repoUrl = 'https://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@github.com/mbarahul99-beep/exam-portal.git';

async function pushWithRetry(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`Push attempt ${attempt}/${retries}...`);
    try {
      const result = await git.push({
        fs,
        http,
        dir,
        url: repoUrl,
        remote: 'github',
        ref: 'main',
        singleBranch: true,
        force: true,
        onAuth: () => ({ username: 'mbarahul99-beep' })
      });
      console.log('SUCCESS! Push completed successfully:', JSON.stringify(result, null, 2));
      return;
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err.message || err);
      if (attempt === retries) throw err;
      console.log('Retrying in 2 seconds...');
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

pushWithRetry().catch(err => {
  console.error('Final push failure:', err);
  process.exit(1);
});
