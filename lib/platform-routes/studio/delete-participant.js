import { db, json, method, sameOrigin, safeError } from "../../server.js";
import { requireStudio } from "../../studio-auth.js";

const validId = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ""));

export default async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  if (!sameOrigin(req)) return json(res, 403, { error: "origin_rejected" });
  const session = await requireStudio(req, res, ["manager", "superadmin"]);
  if (!session) return;

  const quizId = String(req.body?.quizId || ""),
    recordId = String(req.body?.recordId || ""),
    recordType = String(req.body?.recordType || "");
  if (!validId(quizId) || !validId(recordId) || !["response", "attempt"].includes(recordType)) return json(res, 400, { error: "invalid_participant_record" });

  try {
    const sql = db();
    if (recordType === "response") {
      const rows = await sql`
        WITH target AS (
          SELECT quiz_id, participant_hash, completed_at
          FROM studio_quiz_responses
          WHERE response_id=${recordId}::uuid AND quiz_id=${quizId}::uuid
        ), matched_attempt AS (
          SELECT a.attempt_id
          FROM studio_quiz_attempts a
          JOIN target t ON t.quiz_id=a.quiz_id AND t.participant_hash=a.participant_hash
          WHERE a.submitted_at IS NOT NULL
          ORDER BY abs(extract(epoch FROM (a.submitted_at-t.completed_at)))
          LIMIT 1
        ), deleted_response AS (
          DELETE FROM studio_quiz_responses
          WHERE response_id=${recordId}::uuid AND quiz_id=${quizId}::uuid
          RETURNING quiz_id, participant_hash
        ), deleted_attempt AS (
          DELETE FROM studio_quiz_attempts
          WHERE attempt_id IN (SELECT attempt_id FROM matched_attempt)
          RETURNING attempt_id
        ), adjusted_participant AS (
          UPDATE studio_quiz_participants p
          SET attempts_started=greatest(0,p.attempts_started-1)
          FROM deleted_response d
          WHERE p.quiz_id=d.quiz_id AND p.participant_hash=d.participant_hash
          RETURNING p.quiz_id
        )
        SELECT
          (SELECT count(*)::int FROM deleted_response) AS responses,
          (SELECT count(*)::int FROM deleted_attempt) AS attempts
      `;
      if (!rows[0]?.responses) return json(res, 404, { error: "participant_record_not_found" });
      return json(res, 200, { deleted: true, responses: rows[0].responses, attempts: rows[0].attempts });
    }

    const rows = await sql`
      WITH deleted_attempt AS (
        DELETE FROM studio_quiz_attempts
        WHERE attempt_id=${recordId}::uuid AND quiz_id=${quizId}::uuid
        RETURNING quiz_id, participant_hash
      ), adjusted_participant AS (
        UPDATE studio_quiz_participants p
        SET attempts_started=greatest(0,p.attempts_started-1)
        FROM deleted_attempt d
        WHERE p.quiz_id=d.quiz_id AND p.participant_hash=d.participant_hash
        RETURNING p.quiz_id
      )
      SELECT count(*)::int AS attempts FROM deleted_attempt
    `;
    if (!rows[0]?.attempts) return json(res, 404, { error: "participant_record_not_found" });
    return json(res, 200, { deleted: true, responses: 0, attempts: rows[0].attempts });
  } catch (error) {
    return json(res, 500, safeError(error));
  }
}
