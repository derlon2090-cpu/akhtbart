import assert from 'node:assert/strict';
import { parsePageRanges,smartChunks } from '../lib/documents/pdf-ingestion.js';
import { gradeResponse } from '../lib/ai/grading-service.js';
import { validIntegritySettings,validSavedQuizQuestion } from '../lib/studio-auth.js';

assert.deepEqual(parsePageRanges('1-3, 7, 9-10',12),[1,2,3,7,9,10]);
assert.throws(()=>parsePageRanges('3-1',10),/invalid_page_range/);
assert.throws(()=>parsePageRanges('0-2',10),/invalid_page_range/);
assert.ok(smartChunks([{page:1,text:'أ'.repeat(100)},{page:2,text:'ب'.repeat(100)}],{maxChars:130,overlapChars:10}).length>=2);
assert.equal(validIntegritySettings({tabSwitchLimit:3,disableCopy:true,shuffleQuestions:true,shuffleOptions:true,perQuestionSec:60}),true);
assert.equal(validIntegritySettings({tabSwitchLimit:99,disableCopy:true,shuffleQuestions:true,shuffleOptions:true,perQuestionSec:60}),false);
const documentQuestion={type:'single',prompt:'سؤال موثق',options:['أ','ب','ج'],correct:[1],aiMeta:{answerSource:'document',confidenceScore:1,requiresReview:true,reviewed:true,duplicateOptionsRemoved:0}};
assert.equal(validSavedQuizQuestion(documentQuestion),true);
assert.equal(validSavedQuizQuestion({...documentQuestion,aiMeta:{...documentQuestion.aiMeta,reviewed:false}}),false);
const grade=await gradeResponse({questions:[{type:'single',prompt:'س1',options:['أ','ب'],correct:[1],tags:['المفهوم الأول']},{type:'boolean',prompt:'س2',correct:true,tags:['المفهوم الثاني']}],answers:[[1],false]});
assert.equal(grade.score,50);assert.equal(grade.details[0].scoreRatio,1);assert.equal(grade.details[1].scoreRatio,0);assert.ok(grade.learningGaps.includes('المفهوم الثاني'));
console.log('PDF ranges, integrity validation, review gate, and deterministic grading passed.');
