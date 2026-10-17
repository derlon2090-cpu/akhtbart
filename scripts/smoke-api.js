import { readFileSync } from 'node:fs';

try {
  const contents = readFileSync('.env.local', 'utf8');
  const entry = contents.split(/\r?\n/).find(line => /^\s*DATABASE_URL\s*=/.test(line));
  if (entry) process.env.DATABASE_URL = entry.slice(entry.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
} catch {}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing from .env.local and the environment.');

const { default: questionsHandler } = await import('../api/quiz/questions.js');
const response = {
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
};

await questionsHandler({ method: 'GET' }, response);
if (response.statusCode !== 200 || !Array.isArray(response.body?.questions) || response.body.questions.length !== 10) {
  throw new Error(`Questions API failed end to end (HTTP ${response.statusCode ?? 'unknown'}).`);
}
if (response.body.questions.some(question => question.a?.length !== 4)) {
  throw new Error('Questions API returned an invalid answer set.');
}

console.log(`Questions API passed end to end: HTTP ${response.statusCode}, ${response.body.questions.length} questions, four options each.`);
