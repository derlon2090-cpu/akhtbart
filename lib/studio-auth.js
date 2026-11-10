import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db, json } from './server.js';

export const ACCESS_ROLES = ['viewer', 'quiz_creator', 'manager', 'superadmin'];
export const roleLabel = role => ({ viewer: 'عرض فقط', quiz_creator: 'منشئ اختبارات', manager: 'مدير', superadmin: 'مدير أعلى' }[role] || 'غير معروف');
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
const scrypt = promisify(crypto.scrypt);
export async function hashQuizPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 32);
  return salt.toString('hex') + derived.toString('hex');
}
export async function verifyQuizPassword(password, stored) {
  if (!/^[0-9a-f]{96}$/i.test(stored || '')) return false;
  const salt = Buffer.from(stored.slice(0, 32), 'hex');
  const expected = Buffer.from(stored.slice(32), 'hex');
  const actual = await scrypt(password, salt, 32);
  return crypto.timingSafeEqual(expected, actual);
}
export function readCookie(req, name) {
  if (req.cookies?.[name]) return String(req.cookies[name]);
  for (const part of String(req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1 || part.slice(0, at).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(at + 1).trim()); } catch { return ''; }
  }
  return '';
}
export async function studioSession(req) {
  const token = readCookie(req, 'studio_session');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const sql = db();
  const rows = await sql`SELECT s.session_id AS id, s.role, s.access_code_id AS "accessCodeId", s.expires_at AS "expiresAt"
    FROM studio_sessions s LEFT JOIN studio_access_codes c ON c.access_code_id=s.access_code_id
    WHERE s.token_hash=decode(${digest(token)},'hex') AND s.revoked_at IS NULL AND s.expires_at>now()
      AND (s.access_code_id IS NULL OR (c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>now()) AND (c.max_uses IS NULL OR c.used_count<=c.max_uses)))
    LIMIT 1`;
  return rows[0] || null;
}
export async function requireStudio(req, res, roles = ACCESS_ROLES) {
  try {
    const session = await studioSession(req);
    if (session && roles.includes(session.role)) return session;
    json(res, session ? 403 : 401, { error: session ? 'insufficient_permissions' : 'studio_auth_required' });
    return null;
  } catch (error) {
    json(res, 503, { error: 'studio_auth_unavailable' });
    return null;
  }
}
export function validSlug(value) { return /^[a-zA-Z0-9_-]{24,80}$/.test(String(value || '')); }
export function validQuizQuestion(q) {
  if (!q || !['single','multi','boolean','text'].includes(q.type) || typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 1000) return false;
  if (q.type === 'single' || q.type === 'multi') return Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 8 && q.options.every(x => typeof x === 'string' && x.trim() && x.length <= 300) && Array.isArray(q.correct) && q.correct.length > 0 && q.correct.every(i => Number.isInteger(i) && i >= 0 && i < q.options.length);
  if (q.type === 'boolean') return typeof q.correct === 'boolean';
  return q.type === 'text' && (q.accepted === undefined || (Array.isArray(q.accepted) && q.accepted.length <= 20 && q.accepted.every(x => typeof x === 'string' && x.length <= 300)));
}

export function validSavedQuizQuestion(q) {
  if (!validQuizQuestion(q) || q.points !== undefined && (!Number.isFinite(q.points) || q.points <= 0 || q.points > 10000 || Math.abs(Math.round(q.points * 100) - q.points * 100) > 1e-8) || q.explanation !== undefined && (typeof q.explanation !== 'string' || q.explanation.length > 1000) || q.tags !== undefined && (!Array.isArray(q.tags) || q.tags.length > 6 || q.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 60))) return false;
  if (q.aiMeta === undefined) return true;
  const meta = q.aiMeta;
  return meta && ['explicit_marker','answer_key','inferred','document'].includes(meta.answerSource) && Number.isFinite(meta.confidenceScore) && meta.confidenceScore >= 0 && meta.confidenceScore <= 1 && typeof meta.requiresReview === 'boolean' && typeof meta.reviewed === 'boolean' && Number.isInteger(meta.duplicateOptionsRemoved || 0) && (meta.duplicateOptionsRemoved || 0) >= 0 && (!['inferred','document'].includes(meta.answerSource) || meta.requiresReview && meta.reviewed);
}

export function validRegistrationFields(fields) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 12) return false;
  const ids = new Set();
  for (const field of fields) {
    if (!field || !/^[a-z][a-z0-9_]{0,31}$/i.test(field.id || '') || ids.has(field.id) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 120 || !['text','email','number','select','checkbox'].includes(field.type) || typeof field.required !== 'boolean') return false;
    if (field.type === 'select' && (!Array.isArray(field.options) || field.options.length < 2 || field.options.length > 20 || field.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 100))) return false;
    ids.add(field.id);
  }
  return ids.has('name');
}

export function validIntegritySettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Number.isInteger(value.tabSwitchLimit) && value.tabSwitchLimit >= 0 && value.tabSwitchLimit <= 20 && typeof value.disableCopy === 'boolean' && typeof value.shuffleQuestions === 'boolean' && typeof value.shuffleOptions === 'boolean' && Number.isInteger(value.perQuestionSec) && value.perQuestionSec >= 0 && value.perQuestionSec <= 3600;
}

export function normalizeParticipantData(fields, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const output = {};
  for (const field of fields) {
    const raw = input[field.id];
    if (field.type === 'checkbox') {
      const value = raw === true;
      if (field.required && !value) return null;
      output[field.id] = value;
      continue;
    }
    const value = String(raw ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (field.required && !value) return null;
    if (value.length > 300 || field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value) || field.type === 'number' && value && !/^-?\d+(?:\.\d+)?$/.test(value) || field.type === 'select' && value && !field.options.includes(value)) return null;
    output[field.id] = value;
  }
  const name = String(output.name || '').trim();
  return name.length >= 2 && name.length <= 100 ? output : null;
}
