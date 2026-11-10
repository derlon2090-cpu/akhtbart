import { json,method,sameOrigin,safeError } from '../../server.js';
import { requireStudio } from '../../studio-auth.js';
import { inspectDocument,extractDocument } from '../../documents/pdf-ingestion.js';
import { generateQuestionsFromDocument } from '../../ai/document-quiz-service.js';
export default async function handler(req,res){
 if(!method(req,res,'POST'))return;const session=await requireStudio(req,res,['quiz_creator','manager','superadmin']);if(!session)return;if(!sameOrigin(req))return json(res,403,{error:'origin_rejected'});
 try{const body=req.body||{},action=body.action||'generate',file={fileName:body.fileName,mimeType:body.mimeType,data:body.data};if(action==='inspect')return json(res,200,await inspectDocument(file));const document=await extractDocument({...file,pageRanges:body.pageRanges||'all'}),result=await generateQuestionsFromDocument(document,body.settings||{});return json(res,200,{...result,extraction:{pageCount:document.pages.length,methods:document.pages.map(x=>({page:x.page,method:x.method}))}})}catch(error){const code=error?.code||error?.message;if(['unsupported_file','file_too_large','empty_file','invalid_page_range','too_many_pages','document_text_missing','ollama_model_missing','question_count_mismatch','invalid_generated_question'].includes(code))return json(res,422,{error:code});return json(res,500,safeError(error))}
}
