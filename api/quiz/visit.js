import { db, json, method, safeError } from '../../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  const visitorId = req.body?.visitorId;
  if (typeof visitorId !== 'string' || !/^[0-9a-f-]{36}$/i.test(visitorId)) return json(res, 400, { error: 'invalid_visitor' });
  try {
    await db()`INSERT INTO chemistry_visits (visitor_id) VALUES (${visitorId}::uuid) ON CONFLICT (visitor_id) DO NOTHING`;
    return json(res, 200, { recorded: true });
  } catch (error) { return json(res, 503, safeError(error)); }
}
