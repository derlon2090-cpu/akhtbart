import { Ollama } from 'ollama';

const schema={type:'object',additionalProperties:false,required:['allocations','summary'],properties:{allocations:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,required:['index','points','reason'],properties:{index:{type:'integer'},points:{type:'number',minimum:.01},reason:{type:'string',maxLength:240}}}},summary:{type:'string',maxLength:800}}};
const preferredModels=['qwen2.5:7b','llama3.2:3b','qwen3:4b','llama3.1:8b','qwen3:8b'];
const chooseModel=models=>{const installed=models.map(item=>item.name),configured=String(process.env.OLLAMA_MODEL||'').trim();return configured&&installed.includes(configured)?configured:preferredModels.find(name=>installed.includes(name))||installed[0]||null};

export function normalizeScorePlan(payload,count,totalPoints){
  const rows=Array.isArray(payload?.allocations)?payload.allocations:[],byIndex=new Map(rows.map(row=>[Number(row.index),row])),raw=Array.from({length:count},(_,index)=>Math.max(.0001,Number(byIndex.get(index)?.points)||1)),rawTotal=raw.reduce((sum,value)=>sum+value,0),targetCents=Math.round(totalPoints*100),base=raw.map(value=>Math.floor(value/rawTotal*targetCents)),minimum=targetCents>=count?1:0;
  for(let index=0;index<base.length;index++)base[index]=Math.max(minimum,base[index]);
  let difference=targetCents-base.reduce((sum,value)=>sum+value,0),cursor=0;
  while(difference>0){base[cursor++%count]++;difference--}
  while(difference<0){const index=cursor++%count;if(base[index]>minimum){base[index]--;difference++}}
  return{allocations:base.map((cents,index)=>({index,points:cents/100,reason:String(byIndex.get(index)?.reason||'توزيع متوازن حسب بنية السؤال.').slice(0,240)})),summary:String(payload?.summary||'وُزعت الدرجات حسب نوع السؤال وصعوبته والتعليمات.').slice(0,800),totalPoints:targetCents/100};
}

export async function distributeQuestionScores({questions,instructions,totalPoints}){
  const host=process.env.OLLAMA_HOST||'http://127.0.0.1:11434',timeout=Math.max(30000,Math.min(Number(process.env.OLLAMA_TIMEOUT_MS)||180000,600000)),ollama=new Ollama({host,fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(timeout)})}),listed=await ollama.list(),model=chooseModel(listed.models||[]);if(!model)throw Object.assign(new Error('ollama_model_missing'),{code:'ollama_model_missing'});
  const material=questions.map((question,index)=>({index,type:question.type,question:question.prompt,difficulty:question.difficulty||question.tags?.find(tag=>/سهل|متوسط|صعب/i.test(tag))||'غير محدد',current_points:Number(question.points)||1}));
  const response=await ollama.chat({model,messages:[{role:'system',content:`أنت خبير قياس وتقويم تربوي. وزّع درجات الاختبار بعدالة حسب الصعوبة، نوع السؤال، عمق التفكير، والوقت المتوقع. يجب إرجاع تخصيص لكل index دون حذف أو تكرار، وأن يكون مجموع points قريبًا من ${totalPoints}. لا تغيّر نصوص الأسئلة أو إجاباتها. أعد JSON مطابقًا للمخطط فقط.`},{role:'user',content:JSON.stringify({total_points:totalPoints,instructions,questions:material})}],format:schema,think:false,options:{temperature:.1,seed:42}});
  const normalized=normalizeScorePlan(JSON.parse(response.message.content),questions.length,totalPoints);return{provider:'ollama',model,...normalized};
}

