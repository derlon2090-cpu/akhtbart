import { db, json, method, requireAdmin, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  if (!requireAdmin(req, res)) return;
  try {
    const sql = db();
    const rowsOnly = req.query?.rowsOnly === '1';
    const limit = rowsOnly ? 2000 : 500;
    let cursor = null;
    if (typeof req.query?.cursor === 'string') {
      try {
        const decoded = Buffer.from(req.query.cursor, 'base64url').toString('utf8');
        const value = JSON.parse(decoded);
        if (typeof value.at !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value.at) || !/^[0-9a-f-]{36}$/i.test(value.id)) throw new Error();
        cursor = value;
      } catch { return json(res, 400, { error: 'invalid_cursor' }); }
    }
    const [visits, totals, grades, sections, performance, scoreBuckets, attempts] = await Promise.all([
      rowsOnly ? Promise.resolve([]) : sql`SELECT count(*)::int AS visits FROM chemistry_visits`,
      rowsOnly ? Promise.resolve([]) : sql`SELECT count(*)::int AS started, count(*) FILTER (WHERE status = 'completed')::int AS completed,
          coalesce(round(avg(score::numeric / nullif(total, 0) * 10) FILTER (WHERE status = 'completed'), 1), 0) AS average_score
        FROM chemistry_attempts`,
      rowsOnly ? Promise.resolve([]) : sql`SELECT grade AS name, count(*)::int AS count FROM chemistry_attempts GROUP BY grade ORDER BY grade`,
      rowsOnly ? Promise.resolve([]) : sql`SELECT grade || ' · ' || section AS name, count(*)::int AS count FROM chemistry_attempts GROUP BY grade, section ORDER BY grade, section`,
      rowsOnly ? Promise.resolve([]) : sql`SELECT grade, section, count(*)::int AS started,
          count(*) FILTER (WHERE status = 'completed')::int AS completed,
          coalesce(round(avg(score::numeric / nullif(total, 0) * 10) FILTER (WHERE status = 'completed'), 1), 0) AS average_score,
          round(avg(duration_sec) FILTER (WHERE status = 'completed' AND duration_sec > 0))::int AS average_duration
        FROM chemistry_attempts GROUP BY grade, section ORDER BY grade, section`,
      rowsOnly ? Promise.resolve([]) : sql`SELECT least(4, greatest(0, floor((score::numeric / nullif(total, 0)) * 5)::int)) AS bucket,
          count(*)::int AS count FROM chemistry_attempts WHERE status = 'completed' GROUP BY bucket ORDER BY bucket`,
      cursor
        ? sql`SELECT attempt_id AS "attemptId", student_name AS name, email, grade, section,
            CASE WHEN status = 'in_progress' AND started_at < now() - interval '11 minutes' THEN 'expired' ELSE status END AS status,
            score, total, duration_sec AS "durationSec", coalesce(completed_at, started_at) AS at, started_at AS cursor_at
          FROM chemistry_attempts WHERE (started_at, attempt_id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)
          ORDER BY started_at DESC, attempt_id DESC LIMIT ${limit + 1}`
        : sql`SELECT attempt_id AS "attemptId", student_name AS name, email, grade, section,
            CASE WHEN status = 'in_progress' AND started_at < now() - interval '11 minutes' THEN 'expired' ELSE status END AS status,
            score, total, duration_sec AS "durationSec", coalesce(completed_at, started_at) AS at, started_at AS cursor_at
          FROM chemistry_attempts ORDER BY started_at DESC, attempt_id DESC LIMIT ${limit + 1}`
    ]);
    const hasMore = attempts.length > limit;
    const page = attempts.slice(0, limit);
    const last = page.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ at: new Date(last.cursor_at).toISOString(), id: last.attemptId })).toString('base64url')
      : null;
    for (const attempt of page) delete attempt.cursor_at;
    return json(res, 200, {
      ...(rowsOnly ? {} : {
        visits: visits[0]?.visits || 0,
        totals: totals[0] || { started: 0, completed: 0, average_score: 0 },
        grades,
        sections,
        performance,
        scoreBuckets
      }),
      attempts: page,
      nextCursor
    });
  } catch (error) { return json(res, 500, safeError(error)); }
}
