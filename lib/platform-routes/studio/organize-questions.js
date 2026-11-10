import { json, method, sameOrigin, safeError } from '../../server.js';
import { requireStudio } from '../../studio-auth.js';
import { analyzeBulkQuestions, getQuestionAiStatus } from '../../ai/question-service.js';

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return method(req,res,'GET, POST');
  const session=await requireStudio(req,res,['quiz_creator','manager','superadmin']);if(!session)return;
  try{
    if(req.method==='GET')return json(res,200,await getQuestionAiStatus());
    if(!sameOrigin(req))return json(res,403,{error:'origin_rejected'});
    const text=String(req.body?.text||'').trim();if(text.length<10||text.length>30000)return json(res,400,{error:'invalid_questions_text'});
    return json(res,200,await analyzeBulkQuestions(text,{allowInference:req.body?.allowInference!==false}));
  }catch(error){
    if(['missing_correct_answers','inference_disabled'].includes(error?.code))return json(res,422,{error:error.code,questions:error.questions});
    if(error?.code==='ollama_model_missing')return json(res,503,{error:error.code});
    if(error?.code==='invalid_ollama_output'||error instanceof SyntaxError)return json(res,502,{error:'invalid_ollama_output'});
    if(error?.name==='TimeoutError'||error?.name==='AbortError'||/headers timeout|UND_ERR_HEADERS_TIMEOUT/i.test(String(error?.message||error?.cause?.code||'')))return json(res,504,{error:'ollama_timeout'});
    if(/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(String(error?.message||'')))return json(res,503,{error:'ollama_unavailable'});
    return json(res,502,safeError(error));
  }
}
