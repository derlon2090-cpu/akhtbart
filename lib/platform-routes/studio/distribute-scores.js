import { json,method,sameOrigin,safeError } from '../../server.js';
import { requireStudio,validQuizQuestion } from '../../studio-auth.js';
import { distributeQuestionScores } from '../../ai/score-distribution-service.js';

export default async function handler(req,res){
  if(!method(req,res,'POST'))return;const session=await requireStudio(req,res,['quiz_creator','manager','superadmin']);if(!session)return;if(!sameOrigin(req))return json(res,403,{error:'origin_rejected'});
  const questions=req.body?.questions,instructions=String(req.body?.instructions||'').trim(),totalPoints=Number(req.body?.totalPoints);if(!Array.isArray(questions)||questions.length<1||questions.length>100||!questions.every(validQuizQuestion)||instructions.length<3||instructions.length>2000||!Number.isFinite(totalPoints)||totalPoints<1||totalPoints>10000)return json(res,400,{error:'invalid_score_request'});
  try{return json(res,200,await distributeQuestionScores({questions,instructions,totalPoints}))}catch(error){if(error?.code==='ollama_model_missing')return json(res,503,{error:error.code});if(error instanceof SyntaxError)return json(res,502,{error:'invalid_ollama_output'});if(error?.name==='TimeoutError'||error?.name==='AbortError')return json(res,504,{error:'ollama_timeout'});if(/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(String(error?.message||'')))return json(res,503,{error:'ollama_unavailable'});return json(res,502,safeError(error))}
}

