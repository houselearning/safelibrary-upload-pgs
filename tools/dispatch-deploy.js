// Node script to manually trigger repository_dispatch for testing.
// Run: node tools/dispatch-deploy.js

const fetch = require('node-fetch');

const token = process.env.PAGES_PAT;
const repo = process.env.PAGES_REPO;

if (!token || !repo) {
  console.error('Set PAGES_PAT and PAGES_REPO env vars.');
  process.exit(1);
}

(async () => {
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
    },
    body: JSON.stringify({
      event_type: 'deploy-user-site',
      client_payload: {
        uid: 'test-uid',
        siteId: 'test-site',
        files: [
          { path: 'index.html', content: '<h1>Hello from test</h1>', contentType: 'text/html' },
        ],
      },
    }),
  });

  console.log(res.status, await res.text());
})();
