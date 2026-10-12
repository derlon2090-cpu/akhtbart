import { json, method, sameOrigin, clearAdminCookie } from '../../lib/server.js';

export default function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!sameOrigin(req)) return json(res, 403, { error: 'origin_rejected' });
  clearAdminCookie(res);
  return json(res, 200, { authenticated: false });
}
