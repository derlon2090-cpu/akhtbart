import { db, json, method, requireAdmin, sameOrigin, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!requireAdmin(req, res)) return;
  if (!sameOrigin(req)) return json(res, 403, { error: 'origin_rejected' });
  const attemptId = String(req.body?.attemptId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) return json(res, 400, { error: 'invalid_attempt_id' });
  try {
    const sql = db();
    const deleted = await sql`DELETE FROM chemistry_attempts WHERE attempt_id = ${attemptId}::uuid RETURNING attempt_id`;
    if (!deleted.length) return json(res, 404, { error: 'attempt_not_found' });
    return json(res, 200, { deleted: true });
  } catch (error) { return json(res, 500, safeError(error)); }
}