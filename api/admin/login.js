import crypto from 'node:crypto';
import { db, json, method, sameOrigin, setAdminCookie, clientIpHash, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!sameOrigin(req)) return json(res, 403, { error: 'origin_rejected' });
  const password = process.env.ADMIN_PASSWORD;
  if (!process.env.DATABASE_URL || !password || password.length < 16 || !process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32) return json(res, 503, { error: 'admin_auth_not_configured' });
  const submitted = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!submitted || submitted.length > 256) return json(res, 401, { error: 'invalid_credentials' });

  try {
    const sql = db();
    const ipHash = clientIpHash(req);
    const rows = await sql`SELECT failures, window_started_at, locked_until FROM chemistry_admin_login_limits WHERE ip_hash = ${ipHash}`;
    const current = rows[0];
    if (current?.locked_until && new Date(current.locked_until).getTime() > Date.now()) return json(res, 429, { error: 'login_rate_limited' });

    const expected = crypto.createHash('sha256').update(password).digest();
    const actual = crypto.createHash('sha256').update(submitted).digest();
    const valid = crypto.timingSafeEqual(expected, actual);
    if (!valid) {
      const inWindow = current && Date.now() - new Date(current.window_started_at).getTime() < 15 * 60 * 1000;
      const failures = inWindow ? Number(current.failures) + 1 : 1;
      const lockedUntil = failures >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await sql`INSERT INTO chemistry_admin_login_limits (ip_hash, window_started_at, failures, locked_until)
        VALUES (${ipHash}, now(), ${failures}, ${lockedUntil})
        ON CONFLICT (ip_hash) DO UPDATE SET window_started_at = EXCLUDED.window_started_at, failures = EXCLUDED.failures, locked_until = EXCLUDED.locked_until`;
      return json(res, lockedUntil ? 429 : 401, { error: lockedUntil ? 'login_rate_limited' : 'invalid_credentials' });
    }

    await sql`DELETE FROM chemistry_admin_login_limits WHERE ip_hash = ${ipHash}`;
    setAdminCookie(res);
    return json(res, 200, { authenticated: true });
  } catch (error) {
    return json(res, 500, safeError(error));
  }
}
