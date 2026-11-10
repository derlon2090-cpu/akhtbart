export const EXAM_ORIGIN = "https://www.ikhtibarati.com";

export function normalizeAccountSlug(value) {
  const slug = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .trim()
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return [...slug].slice(0, 28).join("");
}

export function createQuizSlug(accountSlug, quizId) {
  const code = String(quizId || "")
    .replace(/-/g, "")
    .toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error("invalid_quiz_id");
  const prefix = normalizeAccountSlug(accountSlug);
  return prefix ? `${prefix}-${code}` : code;
}

export const examLink = (slug) =>
  `${EXAM_ORIGIN}/exam/${encodeURIComponent(String(slug))}`;
