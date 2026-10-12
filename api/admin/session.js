import { json, method, validAdminSession } from '../../lib/server.js';

export default function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try { return json(res, 200, { authenticated: validAdminSession(req) }); }
  catch { return json(res, 200, { authenticated: false }); }
}
