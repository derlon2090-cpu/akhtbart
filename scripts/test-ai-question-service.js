import assert from 'node:assert/strict';
import { questionServiceInternals } from '../lib/ai/question-service.js';
import { validSavedQuizQuestion } from '../lib/studio-auth.js';

const inferred={questions:[{id:'q1',question_text:'1. ما عاصمة المملكة؟',type:'multiple_choice',options:[{id:'a',text:'أ) الرياض *'},{id:'b',text:'الرياض'},{id:'c',text:'ب) جدة'}],correct_option_ids:['a'],explanation:'الرياض هي العاصمة.',tags:['جغرافيا','سهل'],answer_source:'inferred',confidence_score:.82}]};
const result=questionServiceInternals.normalizePayload(inferred,{allowInference:true});
assert.equal(result.questions.length,1);
assert.deepEqual(result.questions[0].options,['الرياض','جدة']);
assert.deepEqual(result.questions[0].correct,[0]);
assert.equal(result.questions[0].type,'single');
assert.equal(result.questions[0].aiMeta.requiresReview,true);
assert.equal(result.questions[0].aiMeta.duplicateOptionsRemoved,1);
assert.equal(validSavedQuizQuestion(result.questions[0]),false);
result.questions[0].aiMeta.reviewed=true;
assert.equal(validSavedQuizQuestion(result.questions[0]),true);
assert.throws(()=>questionServiceInternals.normalizePayload(inferred,{allowInference:false}),error=>error.code==='inference_disabled');

const explicit={questions:[{...inferred.questions[0],answer_source:'answer_key',confidence_score:.99}]};
const explicitResult=questionServiceInternals.normalizePayload(explicit,{allowInference:false});
assert.equal(explicitResult.questions[0].aiMeta.requiresReview,false);
assert.equal(validSavedQuizQuestion(explicitResult.questions[0]),true);
assert.deepEqual(questionServiceInternals.detectAnswerSources('1. سؤال\nأ) خيار *\nب) آخر\n\n2. سؤال بلا علامة\nأ) نعم\nب) لا\n\n3. سؤال\nأ) 1\nب) 2\n\nمفتاح الحلول: 3- ب',3),['explicit_marker','inferred','answer_key']);
const misreported={questions:[{...inferred.questions[0],answer_source:'explicit_marker',confidence_score:.99}]};
const correctedSource=questionServiceInternals.normalizePayload(misreported,{allowInference:true,rawText:'1. ما عاصمة المملكة؟\nأ) الرياض\nب) جدة'});
assert.equal(correctedSource.questions[0].aiMeta.answerSource,'inferred');
assert.equal(correctedSource.questions[0].aiMeta.requiresReview,true);
assert.equal(correctedSource.questions[0].aiMeta.confidenceScore,.9);

console.log('AI question service validation passed.');
