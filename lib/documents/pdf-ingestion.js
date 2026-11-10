import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { Ollama } from 'ollama';

const MAX_BYTES=25*1024*1024;
const MAX_PAGES=1000;
const clean=value=>String(value||'').normalize('NFKC').replace(/\u0000/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();

export function parsePageRanges(input,totalPages){
  if(!Number.isInteger(totalPages)||totalPages<1||totalPages>5000)throw Object.assign(new Error('invalid_pdf'),{code:'invalid_pdf'});
  const raw=String(input||'all').trim().toLocaleLowerCase('ar');
  if(!raw||['all','كامل','الكل'].includes(raw))return Array.from({length:Math.min(totalPages,MAX_PAGES)},(_,i)=>i+1);
  const pages=new Set();
  for(const token of raw.split(/[,،]/).map(x=>x.trim()).filter(Boolean)){
    const match=token.match(/^(\d+)(?:\s*[-–—:]\s*(\d+))?$/);if(!match)throw Object.assign(new Error('invalid_page_range'),{code:'invalid_page_range'});
    const start=Number(match[1]),end=Number(match[2]||match[1]);if(start<1||end<start||end>totalPages)throw Object.assign(new Error('invalid_page_range'),{code:'invalid_page_range'});
    for(let page=start;page<=end;page++){pages.add(page);if(pages.size>MAX_PAGES)throw Object.assign(new Error('too_many_pages'),{code:'too_many_pages'});}
  }
  if(!pages.size)throw Object.assign(new Error('invalid_page_range'),{code:'invalid_page_range'});return [...pages].sort((a,b)=>a-b);
}

function decodeData(data){
  const raw=String(data||'').replace(/^data:[^;]+;base64,/,''),buffer=Buffer.from(raw,'base64');
  if(!buffer.length||buffer.length>MAX_BYTES)throw Object.assign(new Error(buffer.length?'file_too_large':'empty_file'),{code:buffer.length?'file_too_large':'empty_file'});return buffer;
}

function removeRepeatedMargins(pages){
  const counts=new Map();
  for(const page of pages){const lines=page.text.split('\n').map(clean).filter(Boolean);for(const line of [...lines.slice(0,2),...lines.slice(-2)])if(line.length<140)counts.set(line,(counts.get(line)||0)+1);}
  const threshold=Math.max(2,Math.ceil(pages.length*.55));
  return pages.map(page=>({...page,text:page.text.split('\n').filter(line=>(counts.get(clean(line))||0)<threshold&&!/^\s*[-–—]?\s*\d{1,4}\s*[-–—]?\s*$/.test(line)).join('\n').trim()}));
}

async function ocrPage(page,model){
  const viewport=page.getViewport({scale:1.6}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=canvas.getContext('2d');
  await page.render({canvasContext:context,viewport}).promise;
  const response=await new Ollama({host:process.env.OLLAMA_HOST||'http://127.0.0.1:11434'}).chat({model,messages:[{role:'user',content:'استخرج النص التعليمي الظاهر في هذه الصفحة كما هو، بالعربية أو الإنجليزية. تجاهل أرقام الصفحات والزخارف. أعد النص فقط.',images:[canvas.toBuffer('image/png').toString('base64')]}],think:false,options:{temperature:0}});
  return clean(response.message?.content);
}

export async function inspectDocument({fileName,mimeType,data}){
  const buffer=decodeData(data),name=clean(fileName).slice(0,180),mime=String(mimeType||'');
  if(mime==='application/pdf'||/\.pdf$/i.test(name)){const pdf=await getDocument({data:new Uint8Array(buffer),useSystemFonts:true}).promise;return{fileName:name||'document.pdf',mimeType:'application/pdf',size:buffer.length,totalPages:pdf.numPages};}
  if(mime.startsWith('image/'))return{fileName:name||'image',mimeType:mime,size:buffer.length,totalPages:1};
  if(mime.startsWith('text/')||/\.(txt|md)$/i.test(name))return{fileName:name||'document.txt',mimeType:'text/plain',size:buffer.length,totalPages:1};
  throw Object.assign(new Error('unsupported_file'),{code:'unsupported_file'});
}

export async function extractDocument({fileName,mimeType,data,pageRanges='all',visionModel=process.env.OLLAMA_VISION_MODEL||'qwen3-vl:2b'}){
  const buffer=decodeData(data),info=await inspectDocument({fileName,mimeType,data}),pages=[];
  if(info.mimeType==='application/pdf'){
    const pdf=await getDocument({data:new Uint8Array(buffer),useSystemFonts:true}).promise,selected=parsePageRanges(pageRanges,pdf.numPages);
    for(const number of selected){const page=await pdf.getPage(number),content=await page.getTextContent(),items=content.items.filter(item=>item.str);let text=clean(items.map((item,index)=>{const next=items[index+1];return item.str+(item.hasEOL||next&&Math.abs((next.transform?.[5]||0)-(item.transform?.[5]||0))>4?'\n':' ')}).join(''));let method='text';if(text.replace(/\s/g,'').length<80){try{text=await ocrPage(page,visionModel);method='ocr'}catch{method='unreadable'}}pages.push({page:number,text,method});}
  }else if(info.mimeType.startsWith('image/')){
    const response=await new Ollama({host:process.env.OLLAMA_HOST||'http://127.0.0.1:11434'}).chat({model:visionModel,messages:[{role:'user',content:'استخرج النص التعليمي من الصورة كما هو دون اختراع معلومات. أعد النص فقط.',images:[buffer.toString('base64')]}],think:false,options:{temperature:0}});pages.push({page:1,text:clean(response.message?.content),method:'ocr'});
  }else pages.push({page:1,text:clean(buffer.toString('utf8')),method:'text'});
  const normalized=removeRepeatedMargins(pages);if(!normalized.some(page=>page.text.length>30))throw Object.assign(new Error('document_text_missing'),{code:'document_text_missing'});
  return{...info,pages:normalized,pagesExtracted:normalized.map(page=>page.page),text:normalized.map(page=>`[PAGE ${page.page}]\n${page.text}`).join('\n\n')};
}

export function smartChunks(pages,{maxChars=12000,overlapChars=900}={}){
  const chunks=[];let current='',pageNumbers=[];
  for(const page of pages){const block=`[PAGE ${page.page}]\n${page.text}\n\n`;if(current&&current.length+block.length>maxChars){chunks.push({text:current.trim(),pages:[...new Set(pageNumbers)]});current=current.slice(-overlapChars)+block;pageNumbers=[...pageNumbers.slice(-1),page.page];}else{current+=block;pageNumbers.push(page.page)}}
  if(current.trim())chunks.push({text:current.trim(),pages:[...new Set(pageNumbers)]});return chunks;
}
