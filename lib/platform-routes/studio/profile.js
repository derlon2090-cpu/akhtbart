import { db, json, method, sameOrigin, safeError } from "../../server.js";
import { requireStudio } from "../../studio-auth.js";
import {
  createQuizSlug,
  EXAM_ORIGIN,
  normalizeAccountSlug,
} from "../../quiz-links.js";

const profileKey = (session) => session.accessCodeId || "superadmin";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method))
    return method(req, res, "GET, POST");
  const session = await requireStudio(req, res);
  if (!session) return;
  const key = profileKey(session);
  try {
    const sql = db();
    if (req.method === "GET") {
      const rows =
        await sql`SELECT display_name AS "displayName",account_slug AS "accountSlug" FROM studio_profiles WHERE profile_key=${key} LIMIT 1`;
      return json(res, 200, {
        profile: rows[0] || { displayName: "", accountSlug: "" },
        examOrigin: `${EXAM_ORIGIN}/exam/`,
      });
    }
    if (!sameOrigin(req)) return json(res, 403, { error: "origin_rejected" });
    const displayName = String(req.body?.displayName || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase();
    if (displayName && !/^[a-z0-9_-]{2,16}$/.test(displayName))
      return json(res, 400, { error: "invalid_account_name" });
    const accountSlug = displayName ? normalizeAccountSlug(displayName) : null;
    const rows =
      await sql`INSERT INTO studio_profiles(profile_key,display_name,account_slug,updated_at) VALUES (${key},${displayName},${accountSlug},now()) ON CONFLICT(profile_key) DO UPDATE SET display_name=EXCLUDED.display_name,account_slug=EXCLUDED.account_slug,updated_at=now() RETURNING display_name AS "displayName",account_slug AS "accountSlug"`;
    if (key === "superadmin")
      await sql`UPDATE studio_quizzes SET owner_profile_key=${key} WHERE owner_profile_key IS NULL AND created_by_role='superadmin'`;
    const owned =
      await sql`SELECT quiz_id AS id FROM studio_quizzes WHERE owner_profile_key=${key}`;
    for (const quiz of owned) {
      await sql`INSERT INTO studio_quiz_aliases(slug,quiz_id) SELECT public_slug,quiz_id FROM studio_quizzes WHERE quiz_id=${quiz.id}::uuid AND public_slug IS NOT NULL ON CONFLICT(slug) DO NOTHING`;
      await sql`UPDATE studio_quizzes SET public_slug=${createQuizSlug(accountSlug, quiz.id)},updated_at=now() WHERE quiz_id=${quiz.id}::uuid`;
    }
    return json(res, 200, {
      saved: true,
      updatedLinks: owned.length,
      profile: rows[0],
      examOrigin: `${EXAM_ORIGIN}/exam/`,
    });
  } catch (error) {
    if (error?.code === "23505")
      return json(res, 409, { error: "account_name_taken" });
    return json(res, 500, safeError(error));
  }
}
