import crypto from 'node:crypto';
import { db, json, method, sameOrigin, clientIpHash, safeError } from '../../lib/server.js';
import { requireStudio, ACCESS_ROLES, roleLabel } from '../../lib/studio-auth.js';

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return method(req,res,'GET, POST');
  if(req.method==='GET'){
    const session=await requireStudio(req,res,['manager','superadmin']);if(!session)return;
    try{const rows=await db()`SELECT access_code_id AS id,code_hint AS hint,role,max_uses AS "maxUses",used_count AS "usedCount",expires_at AS "expiresAt",revoked_at AS "revokedAt",created_at AS "createdAt" FROM studio_access_codes ORDER BY created_at DESC LIMIT 500`;return json(res,200,{codes:rows.map(row=>({...row,roleLabel:roleLabel(row.role),status:row.revokedAt?'revoked':row.expiresAt&&new Date(row.expiresAt)<new Date()?'expired':row.maxUses!==null&&row.usedCount>=row.maxUses?'used':'active'}))})}catch(error){return json(res,500,safeError(error))}
  }
  if(!method(req,res,'POST'))return;
  if(!sameOrigin(req))return json(res,403,{error:'origin_rejected'});
  const session=await requireStudio(req,res,['manager','superadmin']);if(!session)return;
  const {role,maxUses,expiresAt}=req.body||{};
  if(!ACCESS_ROLES.includes(role)||role==='superadmin'&&session.role!=='superadmin')return json(res,400,{error:'invalid_role'});
  const uses=maxUses===null||maxUses===undefined||maxUses===''?null:Number(maxUses);
  if(uses!==null&&(!Number.isInteger(uses)||uses<1||uses>10000))return json(res,400,{error:'invalid_use_limit'});
  let expiry=null;if(expiresAt){expiry=new Date(expiresAt);if(!Number.isFinite(expiry.getTime())||expiry<=new Date()||expiry.getTime()>Date.now()+366*24*3600*1000)return json(res,400,{error:'invalid_expiry'})}
  try{
    const code='AKT-'+crypto.randomBytes(4).toString('hex').toUpperCase()+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();
    const id=crypto.randomUUID(),hash=crypto.createHash('sha256').update(code).digest('hex'),hint='AKT-••••••••-'+code.slice(-4);
    await db()`INSERT INTO studio_access_codes(access_code_id,code_hash,code_hint,role,max_uses,expires_at,created_by) VALUES (${id}::uuid,decode(${hash},'hex'),${hint},${role},${uses},${expiry},${session.accessCodeId}::uuid)`;
    return json(res,201,{id,code,role,roleLabel:roleLabel(role),maxUses:uses,expiresAt:expiry});
  }catch(error){return json(res,500,safeError(error))}
}
