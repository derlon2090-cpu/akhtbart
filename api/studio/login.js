import crypto from 'node:crypto';
import { db, json, method, sameOrigin, setStudioCookie, clientIpHash, safeError } from '../../lib/server.js';
import { digest, randomToken } from '../../lib/studio-auth.js';

export default async function handler(req,res) {
  if (!method(req,res,'POST')) return;
  if (!sameOrigin(req)) return json(res,403,{error:'origin_rejected'});
  const code=typeof req.body?.code==='string'?req.body.code.trim():'';
  if (!code || code.length>256) return json(res,401,{error:'invalid_access_code'});
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length<16 || !process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length<32) return json(res,503,{error:'studio_auth_not_configured'});
  try {
    const sql=db(), ipHash=clientIpHash(req);
    const attempts=await sql`SELECT failures,window_started_at,locked_until FROM chemistry_admin_login_limits WHERE ip_hash=${ipHash}`;
    const current=attempts[0];if(current?.locked_until&&new Date(current.locked_until)>new Date())return json(res,429,{error:'login_rate_limited'});
    const token=randomToken(), tokenHash=digest(token), sessionId=crypto.randomUUID();
    const submitted=digest(code), adminHash=digest(process.env.ADMIN_PASSWORD);
    let role=null;
    if (crypto.timingSafeEqual(Buffer.from(submitted,'hex'),Buffer.from(adminHash,'hex'))) {
      role='superadmin';
      await sql`INSERT INTO studio_sessions(session_id,token_hash,role,expires_at) VALUES (${sessionId}::uuid,decode(${tokenHash},'hex'),'superadmin',now()+interval '8 hours')`;
    } else {
      const result=await sql`WITH valid_code AS (
        UPDATE studio_access_codes SET used_count=used_count+1
        WHERE code_hash=decode(${submitted},'hex') AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) AND (max_uses IS NULL OR used_count<max_uses)
        RETURNING access_code_id,role
      ) INSERT INTO studio_sessions(session_id,token_hash,access_code_id,role,expires_at)
        SELECT ${sessionId}::uuid,decode(${tokenHash},'hex'),access_code_id,role,now()+interval '8 hours' FROM valid_code
        RETURNING role`;
      role=result[0]?.role||null;
    }
    if (!role) {const inWindow=current&&Date.now()-new Date(current.window_started_at).getTime()<15*60*1000,failures=inWindow?Number(current.failures)+1:1,locked=failures>=8?new Date(Date.now()+15*60*1000):null;await sql`INSERT INTO chemistry_admin_login_limits(ip_hash,window_started_at,failures,locked_until) VALUES (${ipHash},now(),${failures},${locked}) ON CONFLICT(ip_hash) DO UPDATE SET window_started_at=EXCLUDED.window_started_at,failures=EXCLUDED.failures,locked_until=EXCLUDED.locked_until`;return json(res,locked?429:401,{error:locked?'login_rate_limited':'invalid_access_code'})}
    await sql`DELETE FROM chemistry_admin_login_limits WHERE ip_hash=${ipHash}`;
    setStudioCookie(res,token);
    return json(res,200,{authenticated:true,role});
  } catch(error) { return json(res,500,safeError(error)); }
}
