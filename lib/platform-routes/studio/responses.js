import { db, json, method, sameOrigin, safeError } from '../../server.js';
import { requireStudio } from '../../studio-auth.js';
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return method(req,res,'GET, POST');
 const session=await requireStudio(req,res,['manager','superadmin']);if(!session)return;
 if(req.method==='GET'){
  const quizId=String(req.query?.quizId||'');if(!/^[0-9a-f-]{36}$/i.test(quizId))return json(res,400,{error:'invalid_quiz'});
  try{const rows=await db()`SELECT r.response_id AS id,r.participant_name AS name,r.answers,r.score,r.duration_sec AS "durationSec",r.completed_at AS "completedAt",r.review_status AS "reviewStatus",q.title AS "quizTitle",q.questions,q.passing_score AS "passingScore" FROM studio_quiz_responses r JOIN studio_quizzes q USING(quiz_id) WHERE q.quiz_id=${quizId}::uuid ORDER BY r.completed_at DESC LIMIT 500`;return json(res,200,{responses:rows})}catch(error){return json(res,500,safeError(error))}
 }
 if(!method(req,res,'POST'))return;if(!sameOrigin(req))return json(res,403,{error:'origin_rejected'});
 const id=String(req.body?.responseId||''),score=Number(req.body?.score);if(!/^[0-9a-f-]{36}$/i.test(id)||!Number.isFinite(score)||score<0||score>100)return json(res,400,{error:'invalid_grade'});
 try{const rows=await db()`UPDATE studio_quiz_responses SET score=${Math.round(score*100)/100},review_status='graded' WHERE response_id=${id}::uuid RETURNING response_id`;if(!rows.length)return json(res,404,{error:'response_not_found'});return json(res,200,{graded:true})}catch(error){return json(res,500,safeError(error))}
}
