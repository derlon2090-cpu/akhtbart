import { db, json, method, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    const rows = await db()`SELECT position, question, options FROM chemistry_questions ORDER BY position`;
    return json(res, 200, { questions: rows.map(row => ({ id: row.position, q: row.question, a: row.options })) });
  } catch (error) { return json(res, 503, safeError(error)); }
}
