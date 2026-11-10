export const questionPoints=question=>Number.isFinite(Number(question?.points))&&Number(question.points)>0?Number(question.points):1;

export function weightedScore(questions,ratios){
  const weights=questions.map(questionPoints),total=weights.reduce((sum,value)=>sum+value,0);
  if(!total)return 0;
  const earned=weights.reduce((sum,weight,index)=>sum+weight*Math.max(0,Math.min(1,Number(ratios[index])||0)),0);
  return Math.round(earned/total*10000)/100;
}

