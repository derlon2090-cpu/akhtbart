import { db, json, method, safeError } from '../../server.js';
import { studioSession } from '../../studio-auth.js';
export default async function handler(req,res){if(!method(req,res,'GET'))return;try{const session=await studioSession(req);return json(res,200,{authenticated:!!session,role:session?.role||null})}catch(error){return json(res,503,safeError(error))}}
