import { neon } from '@neondatabase/serverless';

const sql = () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
};

async function ensureTables(db) {
  await db`CREATE TABLE IF NOT EXISTS quiz_attempts (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    student_name TEXT NOT NULL,
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
    duration_sec INTEGER NOT NULL CHECK (duration_sec BETWEEN 0 AND 600),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await db`CREATE TABLE IF NOT EXISTS quiz_visits (
    visitor_id TEXT PRIMARY KEY,
    visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

function validName(value) {
  const name = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 5 || name.length > 80 || name.split(' ').length < 2) return false;
  if (!/^[\p{L}\p{M} .'-]+$/u.test(name)) return false;
  const letters = name.replace(/[\s.'-]/g, '').toLocaleLowerCase();
  if (new Set([...letters]).size < 4) return false;
  if (/(.)\1{3,}/u.test(letters)) return false;
  const words = name.split(' ');
  if (words.some(word => word.length < 2 || new Set([...word]).size < 2)) return false;
  return true;
}

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    if (!process.env.ADMIN_PIN || req.headers['x-admin-pin'] !== process.env.ADMIN_PIN) {
      return res.status(401).json({ error: 'غير مصرح بالدخول إلى التقرير.' });
    }
    try {
      const db = sql(); await ensureTables(db);
      const [attempts, visits] = await Promise.all([
        db`SELECT student_name AS name, email, grade, section, score, 10 AS total,
          duration_sec AS "durationSec", completed_at AS at
          FROM quiz_attempts ORDER BY completed_at DESC`,
        db`SELECT COUNT(*)::int AS count FROM quiz_visits`
      ]);
      return res.status(200).json({ attempts, visits: visits[0]?.count || 0 });
    } catch (error) {
      console.error('Admin report failed:', error);
      return res.status(503).json({ error: 'تعذر تحميل البيانات. تحقق من إعداد قاعدة البيانات.' });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = sql(); await ensureTables(db);
    const body = req.body || {};
    if (body.action === 'visit') {
      const visitorId = String(body.visitorId || '');
      if (!/^[a-f0-9-]{20,80}$/i.test(visitorId)) return res.status(400).json({ error: 'معرّف الزيارة غير صالح.' });
      await db`INSERT INTO quiz_visits(visitor_id) VALUES (${visitorId}) ON CONFLICT DO NOTHING`;
      return res.status(200).json({ ok: true });
    }
    const email = validEmail(body.email);
    if (!email) return res.status(400).json({ error: 'أدخل بريدًا إلكترونيًا صحيحًا.' });
    if (body.action === 'check') {
      const found = await db`SELECT student_name AS name, grade, section, score, duration_sec AS "durationSec"
        FROM quiz_attempts WHERE email=${email} LIMIT 1`;
      return res.status(200).json({ attempted: found.length > 0, attempt: found[0] || null });
    }
    if (body.action !== 'submit') return res.status(400).json({ error: 'طلب غير معروف.' });
    const name = String(body.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const grades = ['أول ثانوي', 'ثاني ثانوي', 'ثالث ثانوي'];
    const sections = ['أ', 'ب', 'ج', 'د'];
    const score = Number(body.score), duration = Number(body.durationSec);
    if (!validName(name)) return res.status(400).json({ error: 'يرجى كتابة الاسم الحقيقي كاملًا (اسمين على الأقل)، دون رموز أو نص عشوائي.' });
    if (!grades.includes(body.grade) || !sections.includes(body.section)) return res.status(400).json({ error: 'الصف أو الشعبة غير صالح.' });
    if (!Number.isInteger(score) || score < 0 || score > 10 || !Number.isInteger(duration) || duration < 0 || duration > 600) return res.status(400).json({ error: 'بيانات النتيجة غير صالحة.' });
    const inserted = await db`INSERT INTO quiz_attempts(email,student_name,grade,section,score,duration_sec)
      VALUES (${email},${name},${body.grade},${body.section},${score},${duration})
      ON CONFLICT (email) DO NOTHING RETURNING id`;
    if (!inserted.length) return res.status(409).json({ error: 'هذا البريد مسجل بمحاولة سابقة. تم الاحتفاظ بأول محاولة فقط.', attempted: true });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Quiz API failed:', error);
    return res.status(503).json({ error: 'تعذر الاتصال بخدمة تسجيل الاختبار. حاول لاحقًا.' });
  }
}
