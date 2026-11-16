const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const app = require('../app');

const startServer = () => new Promise((resolve) => {
  const server = app.listen(0, () => {
    const { port } = server.address();
    resolve({ server, port });
  });
});

test('home page renders successfully', async () => {
  const { server, port } = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Blog/i);
    assert.match(html, /Hi there/i);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('blog index renders posts', async () => {
  const { server, port } = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/blog`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /hello world/i);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('markdown post route renders formatted content', async () => {
  const { server, port } = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/blog/hello-world`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<h1[^>]*>Hello World/i);
    assert.match(html, /This is my first post/i);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('sample markdown file renders all supported elements', async () => {
  const { server, port } = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/blog/rendering-showcase`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<h1[^>]*>Rendering Showcase/i);
    assert.match(html, /<blockquote/i);
    assert.match(html, /<table/i);
    assert.match(html, /<code/i);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('blog post route rejects traversal attempts', async () => {
  const { server, port } = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/blog/%2E%2E%2Freadme`);
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.match(html, /404 - Not Found/i);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('api entry starts a local server', async () => {
  const child = spawn(process.execPath, ['api/index.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: '34567' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timed out waiting for local server to start')), 5000);
  });

  await Promise.race([
    new Promise((resolve, reject) => {
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('Server running at http://localhost:34567')) {
          child.kill('SIGINT');
          resolve();
        }
      });
      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.on('exit', (code) => {
        if (code !== 0 && !output.includes('Server running at http://localhost:34567')) {
          reject(new Error(`Process exited before starting server: code ${code}\n${output}`));
        }
      });
    }),
    timeout
  ]);

  assert.match(output, /Server running at http:\/\/localhost:34567/i);
});
