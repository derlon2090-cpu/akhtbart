import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}

export function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export function method(req, res, expected) {
  res.setHeader('Allow', expected);
  if (req.method !== expected) {
    json(res, 405, { error: 'method_not_allowed' });
    return false;
  }
  return true;
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === String(host).split(',')[0].trim().toLowerCase(); }
  catch { return false; }
}

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters');
  return value;
}

function requestCookies(req) {
  if (req.cookies && typeof req.cookies === 'object') return req.cookies;
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try { cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { return {}; }
  }
  return cookies;
}

export function adminCookieToken(expiresAt) {
  const expires = String(expiresAt);
  const signature = crypto.createHmac('sha256', secret()).update(`admin:${expires}`).digest('base64url');
  return `${expires}.${signature}`;
}

export function validAdminSession(req) {
  const cookies = requestCookies(req);
  const token = cookies.admin_session;
  if (!token || !/^\d{10,13}\.[A-Za-z0-9_-]{40,50}$/.test(token)) return false;
  const [expires, signature] = token.split('.');
  if (Number(expires) < Date.now() || Number(expires) > Date.now() + 8 * 60 * 60 * 1000 + 60000) return false;
  const expected = adminCookieToken(expires).split('.')[1];
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireAdmin(req, res) {
  try {
    if (validAdminSession(req)) return true;
  } catch {}
  json(res, 401, { error: 'admin_auth_required' });
  return false;
}

export function setAdminCookie(res) {
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  res.setHeader('Set-Cookie', `admin_session=${adminCookieToken(expires)}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=28800`);
}

export function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0');
}

export function signQuizToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(`quiz:${encoded}`).digest('base64url');
  return `${encoded}.${signature}`;
}

export function readQuizToken(req) {
  const cookies = requestCookies(req);
  const token = cookies.quiz_session;
  if (!token || token.length > 1024) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', secret()).update(`quiz:${encoded}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof payload.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.id) || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export function setQuizCookie(res, token) {
  res.setHeader('Set-Cookie', `quiz_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/quiz; Max-Age=660`);
}

export function clearQuizCookie(res) {
  res.setHeader('Set-Cookie', 'quiz_session=; HttpOnly; Secure; SameSite=Strict; Path=/api/quiz; Max-Age=0');
}

export function clientIpHash(req) {
  const raw = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return crypto.createHmac('sha256', secret()).update(`ip:${raw}`).digest('hex');
}

export function safeError(error) {
  console.error('API error', error?.message || 'unknown');
  return { error: 'server_error' };
}

export function validName(value) {
  const name = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 5 || name.length > 80 || name.split(' ').length < 2 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) return false;
  const letters = name.replace(/[\s.'-]/g, '').toLocaleLowerCase();
  return new Set([...letters]).size >= 4 && !/(.)\1{3,}/u.test(letters) && name.split(' ').every(word => word.length >= 2 && new Set([...word]).size >= 2);
}

export const validEmail = value => /^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@jzb\.moe\.gov\.sa$/i.test(String(value || '').trim());
export const validGrade = value => ['أول ثانوي', 'ثاني ثانوي', 'ثالث ثانوي'].includes(value);
export const validSection = value => ['أ', 'ب', 'ج', 'د'].includes(value);
