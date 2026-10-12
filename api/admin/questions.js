import { db, json, method, requireAdmin, sameOrigin, safeError } from '../../lib/server.js';

function validQuestion(item) {
  return item && typeof item.q === 'string' && item.q.trim().length > 0 && item.q.trim().length <= 500 &&
    Array.isArray(item.a) && item.a.length === 4 && item.a.every(option => typeof option === 'string' && option.trim().length > 0 && option.trim().length <= 240) &&
    Number.isInteger(item.c) && item.c >= 0 && item.c < 4;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return json(res, 405, { error: 'method_not_allowed' }); }
  if (!requireAdmin(req, res)) return;
  if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { error: 'origin_rejected' });
  try {
    const sql = db();
    if (req.method === 'GET') {
      const rows = await sql`SELECT position, question, options, correct_index FROM chemistry_questions ORDER BY position`;
      return json(res, 200, { questions: rows.map(row => ({ q: row.question, a: row.options, c: row.correct_index })) });
    }
    const bank = req.body?.questions;
    if (!Array.isArray(bank) || bank.length < 1 || bank.length > 100 || !bank.every(validQuestion)) return json(res, 400, { error: 'invalid_question_bank' });
    const active = await sql`SELECT count(*)::int AS count FROM chemistry_attempts WHERE status = 'in_progress' AND started_at > now() - interval '11 minutes'`;
    if (active[0]?.count > 0) return json(res, 409, { error: 'active_attempts' });
    for (let index = 0; index < bank.length; index++) {
      const item = bank[index];
      await sql`INSERT INTO chemistry_questions (position, question, options, correct_index, updated_at)
        VALUES (${index + 1}, ${item.q.trim()}, ${JSON.stringify(item.a.map(option => option.trim()))}::jsonb, ${item.c}, now())
        ON CONFLICT (position) DO UPDATE SET question = EXCLUDED.question, options = EXCLUDED.options, correct_index = EXCLUDED.correct_index, updated_at = now()`;
    }
    await sql`DELETE FROM chemistry_questions WHERE position > ${bank.length}`;
    return json(res, 200, { saved: bank.length });
  } catch (error) { return json(res, 500, safeError(error)); }
}
