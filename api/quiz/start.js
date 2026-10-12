import crypto from 'node:crypto';
import { db, json, method, sameOrigin, signQuizToken, setQuizCookie, validEmail, validGrade, validName, validSection, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!sameOrigin(req)) return json(res, 403, { error: 'origin_rejected' });
  const { name, email, grade, section } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!validName(normalizedName) || !validEmail(normalizedEmail) || !validGrade(grade) || !validSection(section)) return json(res, 400, { error: 'invalid_student_details' });
  try {
    const sql = db();
    const bank = await sql`SELECT position, question, options FROM chemistry_questions ORDER BY position`;
    if (!bank.length) return json(res, 503, { error: 'quiz_not_ready' });
    const attemptId = crypto.randomUUID();
    const token = signQuizToken({ id: attemptId, exp: Date.now() + 11 * 60 * 1000 });
    try {
      await sql`INSERT INTO chemistry_attempts (attempt_id, email, student_name, grade, section, status, total)
        VALUES (${attemptId}::uuid, ${normalizedEmail}, ${normalizedName}, ${grade}, ${section}, 'in_progress', ${bank.length})`;
    } catch (error) {
      if (error?.code === '23505') return json(res, 409, { error: 'already_attempted' });
      throw error;
    }
    setQuizCookie(res, token);
    return json(res, 200, { attemptId, startedAt: Date.now(), durationMs: 10 * 60 * 1000, questions: bank.map(row => ({ id: row.position, q: row.question, a: row.options })) });
  } catch (error) { return json(res, 503, safeError(error)); }
}
