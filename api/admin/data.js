import { db, json, method, requireAdmin, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  if (!requireAdmin(req, res)) return;
  try {
    const sql = db();
    const [counts, attempts] = await Promise.all([
      sql`SELECT count(*)::int AS visits FROM chemistry_visits`,
      sql`SELECT student_name AS name, email, grade, section,
          CASE WHEN status = 'in_progress' AND started_at < now() - interval '11 minutes' THEN 'expired' ELSE status END AS status,
          score, total, duration_sec AS "durationSec", coalesce(completed_at, started_at) AS at
        FROM chemistry_attempts ORDER BY started_at DESC LIMIT 10000`
    ]);
    return json(res, 200, { visits: counts[0]?.visits || 0, attempts });
  } catch (error) { return json(res, 500, safeError(error)); }
}
