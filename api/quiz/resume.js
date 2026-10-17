import { db, json, method, readQuizToken, clearQuizCookie, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  let token;
  try { token = readQuizToken(req); }
  catch { return json(res, 503, { error: 'quiz_not_ready' }); }
  if (!token) return json(res, 401, { error: 'quiz_session_expired' });

  try {
    const sql = db();
    const [attempts, bank] = await Promise.all([
      sql`SELECT student_name AS name, email, grade, section, status, total, started_at
        FROM chemistry_attempts WHERE attempt_id = ${token.id}::uuid`,
      sql`SELECT position, question, options FROM chemistry_questions ORDER BY position`
    ]);
    const attempt = attempts[0];
    if (!attempt) { clearQuizCookie(res); return json(res, 401, { error: 'quiz_session_expired' }); }
    if (attempt.status !== 'in_progress') { clearQuizCookie(res); return json(res, 409, { error: 'attempt_not_active' }); }
    if (!bank.length || Number(attempt.total) !== bank.length) return json(res, 409, { error: 'question_bank_changed' });

    return json(res, 200, {
      startedAt: new Date(attempt.started_at).getTime(),
      person: { name: attempt.name, email: attempt.email, grade: attempt.grade, section: attempt.section },
      questions: bank.map(row => ({ id: row.position, q: row.question, a: row.options }))
    });
  } catch (error) { return json(res, 503, safeError(error)); }
}
