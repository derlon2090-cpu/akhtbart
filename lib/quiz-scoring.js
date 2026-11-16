export const questionPoints = (question) => (Number.isFinite(Number(question?.points)) && Number(question.points) > 0 ? Number(question.points) : 1);

export const totalQuizPoints = (questions) => Math.round((Array.isArray(questions) ? questions : []).reduce((sum, question) => sum + questionPoints(question), 0) * 100) / 100;

export const scoreToPoints = (score, questions) => {
  const value = Number(score),
    total = totalQuizPoints(questions);
  if (!Number.isFinite(value) || !total) return null;
  return Math.round(value * total) / 100;
};

export function weightedScore(questions, ratios) {
  const weights = questions.map(questionPoints),
    total = weights.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  const earned = weights.reduce((sum, weight, index) => sum + weight * Math.max(0, Math.min(1, Number(ratios[index]) || 0)), 0);
  return Math.round((earned / total) * 10000) / 100;
}

export const normalizeTextAnswer = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .replace(/[\u0640\u064B-\u065F\u0670]/gu, "")
    .replace(/[إأآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

export function automaticAnswerRatio(question, answer) {
  if (["single", "multi"].includes(question?.type)) {
    const given = Array.isArray(answer) ? [...new Set(answer.map(Number).filter(Number.isInteger))].sort((a, b) => a - b) : [],
      expected = Array.isArray(question.correct) ? [...new Set(question.correct.map(Number).filter(Number.isInteger))].sort((a, b) => a - b) : [];
    return given.length === expected.length && given.every((value, index) => value === expected[index]) ? 1 : 0;
  }
  if (question?.type === "boolean") return answer === question.correct ? 1 : 0;
  if (question?.type === "text") {
    const normalized = normalizeTextAnswer(answer);
    return normalized && Array.isArray(question.accepted) && question.accepted.some((value) => normalizeTextAnswer(value) === normalized) ? 1 : 0;
  }
  return 0;
}

export const automaticQuizScore = (questions, answers) => weightedScore(questions, questions.map((question, index) => automaticAnswerRatio(question, answers?.[index])));
