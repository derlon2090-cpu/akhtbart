import { db, json, method, sameOrigin, readQuizToken, clearQuizCookie, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!sameOrigin(req)) return json(res, 403, { error: 'origin_rejected' });
  let token;
  try { token = readQuizToken(req); }
  catch { return json(res, 503, { error: 'quiz_not_ready' }); }
  if (!token) return json(res, 401, { error: 'quiz_session_expired' });
  const answers = req.body?.answers;
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 100 || answers.some(value => value !== null && (!Number.isInteger(value) || value < 0 || value > 3))) return json(res, 400, { error: 'invalid_answers' });
  try {
    const sql = db();
    const [attempts, bank] = await Promise.all([
      sql`SELECT attempt_id, status, started_at, total FROM chemistry_attempts WHERE attempt_id = ${token.id}::uuid`,
      sql`SELECT position, correct_index FROM chemistry_questions ORDER BY position`
    ]);
    const attempt = attempts[0];
    if (!attempt) { clearQuizCookie(res); return json(res, 401, { error: 'quiz_session_expired' }); }
    if (attempt.status === 'completed' || attempt.status === 'expired') return json(res, 409, { error: 'already_submitted' });
    if (answers.length !== bank.length || Number(attempt.total) !== bank.length) return json(res, 409, { error: 'question_bank_changed' });
    const elapsed = Math.max(1, Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000));
    const expired = elapsed > 630;
    const score = expired ? 0 : answers.reduce((sum, answer, index) => sum + (answer === Number(bank[index].correct_index) ? 1 : 0), 0);
    const durationSec = Math.min(600, elapsed);
    const status = expired ? 'expired' : 'completed';
    const result = await sql`UPDATE chemistry_attempts SET status = ${status}, score = ${score}, completed_at = now(), duration_sec = ${durationSec}
      WHERE attempt_id = ${token.id}::uuid AND status = 'in_progress'
      RETURNING student_name AS name, grade, section, score, total, duration_sec AS "durationSec", completed_at AS at`;
    clearQuizCookie(res);
    if (!result.length) return json(res, 409, { error: 'already_submitted' });
    return json(res, 200, { attempt: result[0], timeExpired: expired });
  } catch (error) { return json(res, 503, safeError(error)); }
}
