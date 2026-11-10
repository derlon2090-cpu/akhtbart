import { db, json, method, sameOrigin, safeError } from "../../server.js";
import { requireStudio } from "../../studio-auth.js";
import { EXAM_ORIGIN, normalizeAccountSlug } from "../../quiz-links.js";

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
      .replace(/\s+/g, " ")
      .slice(0, 80);
    const accountSlug = displayName ? normalizeAccountSlug(displayName) : null;
    if (displayName && [...accountSlug].length < 2)
      return json(res, 400, { error: "invalid_account_name" });
    const rows =
      await sql`INSERT INTO studio_profiles(profile_key,display_name,account_slug,updated_at) VALUES (${key},${displayName},${accountSlug},now()) ON CONFLICT(profile_key) DO UPDATE SET display_name=EXCLUDED.display_name,account_slug=EXCLUDED.account_slug,updated_at=now() RETURNING display_name AS "displayName",account_slug AS "accountSlug"`;
    return json(res, 200, {
      saved: true,
      profile: rows[0],
      examOrigin: `${EXAM_ORIGIN}/exam/`,
    });
  } catch (error) {
    if (error?.code === "23505")
      return json(res, 409, { error: "account_name_taken" });
    return json(res, 500, safeError(error));
  }
}
