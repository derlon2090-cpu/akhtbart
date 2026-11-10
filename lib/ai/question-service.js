import { Ollama } from 'ollama';
import { validQuizQuestion } from '../studio-auth.js';

const OLLAMA_HOST=process.env.OLLAMA_HOST||'http://127.0.0.1:11434';
const REQUEST_TIMEOUT_MS=Math.max(30000,Math.min(Number(process.env.OLLAMA_TIMEOUT_MS)||180000,600000));
const preferredModels=['qwen2.5:7b','llama3.2:3b','qwen3:4b','llama3.1:8b','qwen3:8b','qwen3:1.7b'];
const letters='abcdefgh';

export const bulkQuestionsSchema={
  type:'object',additionalProperties:false,required:['questions'],properties:{
    questions:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,
      required:['id','question_text','type','options','correct_option_ids','explanation','tags','answer_source','confidence_score'],
      properties:{
        id:{type:'string',minLength:1,maxLength:20},question_text:{type:'string',minLength:1,maxLength:1000},
        type:{type:'string',enum:['single_choice','multiple_choice','true_false']},
        options:{type:'array',minItems:2,maxItems:8,items:{type:'object',additionalProperties:false,required:['id','text'],properties:{id:{type:'string',minLength:1,maxLength:20},text:{type:'string',minLength:1,maxLength:300}}}},
        correct_option_ids:{type:'array',minItems:1,maxItems:8,items:{type:'string',minLength:1,maxLength:20}},
        explanation:{type:'string',minLength:1,maxLength:1000},tags:{type:'array',maxItems:6,items:{type:'string',minLength:1,maxLength:60}},
        answer_source:{type:'string',enum:['explicit_marker','answer_key','inferred']},confidence_score:{type:'number',minimum:0,maximum:1}
      }
    }}
  }
};

function client(){return new Ollama({host:OLLAMA_HOST,fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)})})}
function chooseModel(models){const installed=models.map(item=>item.name);const configured=String(process.env.OLLAMA_MODEL||'').trim();if(configured&&installed.includes(configured))return configured;return preferredModels.find(name=>installed.includes(name))||installed[0]||null}
const cleanText=value=>String(value||'').normalize('NFKC').trim().replace(/^\s*(?:[أ-يA-H]|\d{1,2})\s*[).:\-ـ]\s*/i,'').replace(/\s*(?:\*+|✅|✔️?|\[الإجابة الصحيحة\]|\(صح\))\s*$/iu,'').trim();
const comparisonKey=value=>cleanText(value).toLocaleLowerCase('ar').normalize('NFD').replace(/[\u064B-\u065F\u0670\p{P}\p{S}\s]/gu,'');
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));

function detectAnswerSources(rawText,count){
  const text=String(rawText||'').replace(/\r/g,''),keyMatch=text.match(/(?:مفتاح\s*(?:الحلول|الإجابات)|answers?\s*key)\s*[:：]?([\s\S]*)$/iu),keyText=keyMatch?.[1]||'',body=keyMatch?text.slice(0,keyMatch.index):text;
  let blocks=body.split(/\n(?=\s*\d+\s*[).:\-ـ])/).map(block=>block.trim()).filter(Boolean);if(blocks.length<count)blocks=body.split(/\n\s*\n+/).map(block=>block.trim()).filter(Boolean);
  const keyNumbers=new Set([...keyText.matchAll(/(?:^|[،,;\s])(?:س(?:ؤال)?\s*)?(\d+)\s*[).:\-ـ=]\s*(?:[أ-حA-H]|صح|خطأ)/gimu)].map(match=>Number(match[1])));
  return Array.from({length:count},(_,index)=>{if(keyNumbers.has(index+1))return'answer_key';const block=blocks[index]||'',explicit=/\*|✅|✔️?|\[\s*الإجابة\s*الصحيحة\s*\]|\(\s*صح\s*\)|(?:الجواب|الإجابة|الاجابة|answer)\s*[:：]|\*\*[^*]+\*\*|<(?:strong|b|mark)\b/i.test(block);return explicit?'explicit_marker':'inferred'});
}

function systemPrompt(allowInference){return `أنت محرك تحليل وتدقيق أسئلة تعليمية عربية وإنجليزية. أعد JSON مطابقًا للمخطط فقط.
- استخرج جميع الأسئلة وخياراتها، بما في ذلك الأسئلة ذات 3 أو 4 خيارات.
- اكتشف الإجابة من النجمة، (صح)، [الإجابة الصحيحة]، حروف مثل (C)، عبارة الجواب/الإجابة، Markdown العريض، HTML الدال على الخط العريض أو اللون، أو قسم منفصل باسم مفتاح الحلول / Answers Key.
- answer_source يكون explicit_marker للعلامة داخل السؤال، answer_key لمفتاح الحلول المنفصل، وinferred فقط عند حل السؤال من المعرفة والمنطق.
- ${allowInference?'إذا غابت أي علامة، حل السؤال وحدد الإجابة الأصح، واشرح السبب، وضع درجة ثقة واقعية.':'إذا غابت الإجابة الصريحة فلا تستنتجها، وأبقِ answer_source=inferred وconfidence_score=0.'}
- لا تجعل الثقة 1 إلا عند وجود مؤشر صريح لا لبس فيه. خفّضها عند غموض السؤال أو تقارب الخيارات.
- احذف أرقام الأسئلة وبادئات الخيارات من question_text وoption.text. حافظ على لغة النص ومعناه العلمي.
- اجمع أكثر من إجابة صحيحة عند وجودها، ولا تنشئ خيارات مكررة.
- tags قصيرة وتشمل الموضوع ومستوى الصعوبة مثل: كيمياء، سهل.`}

function normalizePayload(payload,{allowInference=true,rawText=''}={}){
  if(!payload||!Array.isArray(payload.questions)||payload.questions.length<1||payload.questions.length>100)throw Object.assign(new Error('invalid_ollama_output'),{code:'invalid_ollama_output'});
  const needsAnswer=[],inferenceBlocked=[],warnings=[],detectedSources=rawText?detectAnswerSources(rawText,payload.questions.length):null;
  const questions=payload.questions.map((item,index)=>{
    const unique=[],idMap=new Map(),seen=new Map();
    for(const raw of Array.isArray(item.options)?item.options:[]){const text=cleanText(raw?.text),key=comparisonKey(text);if(!text||!key)continue;if(seen.has(key)){idMap.set(String(raw.id),seen.get(key));continue}const id=`opt_${letters[unique.length]||unique.length+1}`;seen.set(key,id);idMap.set(String(raw.id),id);unique.push({id,text})}
    const correctIds=[...new Set((Array.isArray(item.correct_option_ids)?item.correct_option_ids:[]).map(id=>idMap.get(String(id))).filter(Boolean))];
    const modelSource=['explicit_marker','answer_key','inferred'].includes(item.answer_source)?item.answer_source:'inferred',answerSource=detectedSources?.[index]||modelSource;
    if(!correctIds.length)needsAnswer.push(index+1);if(answerSource==='inferred'&&!allowInference)inferenceBlocked.push(index+1);
    const confidence=answerSource==='inferred'?Math.min(.9,clamp(item.confidence_score)):Math.max(.9,clamp(item.confidence_score)),prompt=cleanText(item.question_text),correct=correctIds.map(id=>unique.findIndex(option=>option.id===id)).filter(position=>position>=0);
    const type=item.type==='true_false'?'boolean':correct.length>1?'multi':'single';
    let platformQuestion;if(type==='boolean'){const selected=unique[correct[0]];platformQuestion={type:'boolean',prompt,correct:/^(?:صح|صحيح|true)$/i.test(selected?.text||'')}}else platformQuestion={type,prompt,options:unique.map(option=>option.text),correct};
    const duplicateOptionsRemoved=Math.max(0,(Array.isArray(item.options)?item.options.length:0)-unique.length),tags=[...new Set((Array.isArray(item.tags)?item.tags:[]).map(tag=>cleanText(tag)).filter(Boolean))].slice(0,6);
    platformQuestion.explanation=cleanText(item.explanation);platformQuestion.tags=tags;
    platformQuestion.aiMeta={answerSource,confidenceScore:confidence,requiresReview:answerSource==='inferred',reviewed:answerSource!=='inferred',duplicateOptionsRemoved};
    if(confidence<.7)warnings.push({question:index+1,code:'low_confidence',confidence});if(duplicateOptionsRemoved)warnings.push({question:index+1,code:'duplicate_options_removed',count:duplicateOptionsRemoved});
    return{platformQuestion,structured:{id:`q${index+1}`,question_text:prompt,options:unique,correct_option_id:correctIds[0]||null,...(correctIds.length>1?{correct_option_ids:correctIds}:{}),explanation:platformQuestion.explanation,tags,answer_source:answerSource,confidence_score:confidence}};
  });
  if(needsAnswer.length)throw Object.assign(new Error('missing_correct_answers'),{code:'missing_correct_answers',questions:needsAnswer});
  if(inferenceBlocked.length)throw Object.assign(new Error('inference_disabled'),{code:'inference_disabled',questions:inferenceBlocked});
  if(!questions.every(({platformQuestion})=>validQuizQuestion(platformQuestion)))throw Object.assign(new Error('invalid_ollama_output'),{code:'invalid_ollama_output'});
  return{questions:questions.map(item=>item.platformQuestion),structuredQuestions:questions.map(item=>item.structured),warnings,requiresReview:questions.filter(item=>item.platformQuestion.aiMeta.requiresReview).length};
}

export async function getQuestionAiStatus(){const ollama=client(),listed=await ollama.list(),model=chooseModel(listed.models||[]);return{available:true,provider:'ollama',host:OLLAMA_HOST.replace(/:\/\/[^/]+/,'://local'),model,models:(listed.models||[]).map(item=>item.name)}}

export async function analyzeBulkQuestions(text,{allowInference=true}={}){
  const ollama=client(),listed=await ollama.list(),model=chooseModel(listed.models||[]);if(!model)throw Object.assign(new Error('ollama_model_missing'),{code:'ollama_model_missing'});
  const stream=await ollama.chat({model,messages:[{role:'system',content:systemPrompt(allowInference)},{role:'user',content:text}],format:bulkQuestionsSchema,stream:true,think:false,options:{temperature:.1,seed:42,num_ctx:8192}});
  let content='';for await(const chunk of stream)content+=chunk?.message?.content||'';
  const result=normalizePayload(JSON.parse(content),{allowInference,rawText:text});return{provider:'ollama',model,...result,totalQuestions:result.questions.length};
}

export const questionServiceInternals={cleanText,comparisonKey,detectAnswerSources,normalizePayload};
