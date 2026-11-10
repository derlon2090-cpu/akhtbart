import crypto from "node:crypto";

export const EXAM_ORIGIN = "https://www.ikhtibarati.com";

export function normalizeAccountSlug(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .trim()
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (/^[a-z0-9-]+$/.test(normalized)) return normalized.slice(0, 16);
  const titles = new Set([
      "المعلم",
      "معلم",
      "الأستاذ",
      "استاذ",
      "الدكتور",
      "دكتور",
    ]),
    words = normalized.split("-").filter((word) => word && !titles.has(word)),
    word = words[0] || normalized.split("-")[0] || "user",
    common = {
      إبراهيم: "ibrahim",
      ابراهيم: "ibrahim",
      محمد: "mohammed",
      أحمد: "ahmad",
      احمد: "ahmad",
      عبدالله: "abdullah",
    };
  if (common[word]) return common[word];
  const map = {
    ا: "a",
    أ: "a",
    إ: "i",
    آ: "a",
    ب: "b",
    ت: "t",
    ث: "th",
    ج: "j",
    ح: "h",
    خ: "kh",
    د: "d",
    ذ: "dh",
    ر: "r",
    ز: "z",
    س: "s",
    ش: "sh",
    ص: "s",
    ض: "d",
    ط: "t",
    ظ: "z",
    ع: "a",
    غ: "gh",
    ف: "f",
    ق: "q",
    ك: "k",
    ل: "l",
    م: "m",
    ن: "n",
    ه: "h",
    و: "w",
    ي: "y",
    ى: "a",
    ة: "h",
    ء: "",
    ئ: "y",
    ؤ: "w",
  };
  const latin = [...word]
    .map((letter) => map[letter] ?? (/^[a-z0-9]$/.test(letter) ? letter : ""))
    .join("");
  return latin.slice(0, 14) || "user";
}

export function createQuizSlug(accountSlug, quizId) {
  const id = String(quizId || "").toLowerCase();
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("invalid_quiz_id");
  const code = crypto
    .createHash("sha256")
    .update(id)
    .digest()
    .subarray(0, 7)
    .toString("base64url");
  const prefix = normalizeAccountSlug(accountSlug);
  return prefix ? `${prefix}-${code}` : code;
}

export const examLink = (slug) =>
  `${EXAM_ORIGIN}/exam/${encodeURIComponent(String(slug))}`;
