import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadDatabaseUrl() {
  let envText;
  try {
    envText = readFileSync('.env.local', 'utf8');
  } catch {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    throw new Error('Set DATABASE_URL or run neon init to create .env.local.');
  }
  const entries = envText.split(/\r?\n/);
  const entry = entries.find(line => /^\s*DATABASE_URL_UNPOOLED\s*=/.test(line))
    || entries.find(line => /^\s*DATABASE_URL\s*=/.test(line));
  if (!entry) throw new Error('DATABASE_URL was not found in .env.local.');
  const value = entry.slice(entry.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!value) throw new Error('DATABASE_URL is empty.');
  return value;
}

const sql = neon(loadDatabaseUrl());
const schema = readFileSync('db/schema.sql', 'utf8');
const statements = schema.split(/;\s*(?:\r?\n|$)/).map(statement => statement.trim()).filter(Boolean);

for (const statement of statements) await sql.query(statement);

const [result] = await sql`SELECT count(*)::int AS question_count FROM chemistry_questions`;
if (Number(result.question_count) !== 10) {
  throw new Error(`Expected 10 chemistry questions; found ${result.question_count}.`);
}

console.log('Database schema is ready; 10 chemistry questions verified.');
