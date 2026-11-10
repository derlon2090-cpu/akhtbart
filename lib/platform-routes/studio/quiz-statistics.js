import { db, json, method, safeError } from "../../server.js";
import { requireStudio } from "../../studio-auth.js";

const objectiveCorrect = (question, answer) => {
  if (question.type === "boolean") return answer === question.correct;
  if (["single", "multi"].includes(question.type)) {
    const given = Array.isArray(answer)
      ? [...answer].map(Number).sort((a, b) => a - b)
      : [];
    const expected = Array.isArray(question.correct)
      ? [...question.correct].map(Number).sort((a, b) => a - b)
      : [];
    return (
      given.length === expected.length &&
      given.every((value, index) => value === expected[index])
    );
  }
  return null;
};

const participantContact = (data) => {
  if (!data || typeof data !== "object") return "";
  for (const key of [
    "email",
    "student_id",
    "studentId",
    "university_id",
    "universityId",
    "phone",
  ])
    if (data[key]) return String(data[key]).slice(0, 180);
  return "";
};

export default async function handler(req, res) {
  if (!method(req, res, "GET")) return;
  const session = await requireStudio(req, res, ["manager", "superadmin"]);
  if (!session) return;
  const quizId = String(req.query?.quizId || "");
  if (!/^[0-9a-f-]{36}$/i.test(quizId))
    return json(res, 400, { error: "invalid_quiz" });
  try {
    const sql = db();
    const [quizzes, responses, attempts] = await Promise.all([
      sql`SELECT quiz_id AS id,slug,title,description,duration_sec AS "durationSec",passing_score AS "passingScore",starts_at AS "startsAt",ends_at AS "endsAt",questions,published FROM studio_quizzes WHERE quiz_id=${quizId}::uuid LIMIT 1`,
      sql`SELECT response_id AS id,participant_name AS name,participant_data AS "participantData",answers,score,duration_sec AS "durationSec",completed_at AS "completedAt",review_status AS "reviewStatus",integrity_summary AS "integritySummary" FROM studio_quiz_responses WHERE quiz_id=${quizId}::uuid ORDER BY completed_at DESC LIMIT 1000`,
      sql`SELECT attempt_id AS id,encode(participant_hash,'hex') AS "participantKey",participant_name AS name,participant_data AS "participantData",started_at AS "startedAt",last_activity_at AS "lastActivityAt",expires_at AS "expiresAt",submitted_at AS "submittedAt",violation_count AS "violationCount",locked_at AS "lockedAt",current_question AS "currentQuestion" FROM studio_quiz_attempts WHERE quiz_id=${quizId}::uuid ORDER BY started_at DESC LIMIT 2000`,
    ]);
    const quiz = quizzes[0];
    if (!quiz) return json(res, 404, { error: "quiz_not_found" });
    const now = Date.now(),
      scores = responses
        .filter((row) => row.score !== null && row.score !== undefined)
        .map((row) => Number(row.score))
        .filter(Number.isFinite),
      durations = responses
        .map((row) => Number(row.durationSec))
        .filter(Number.isFinite);
    const activeAttempts = attempts.filter(
      (row) =>
        !row.submittedAt &&
        !row.lockedAt &&
        new Date(row.expiresAt).getTime() > now &&
        new Date(row.startedAt).getTime() + Number(quiz.durationSec) * 1000 >=
          now,
    );
    const incompleteAttempts = attempts.filter(
      (row) => !row.submittedAt && !activeAttempts.includes(row),
    );
    const uniqueParticipants = new Set(
      attempts.map((row) => row.participantKey),
    ).size;
    const passed = scores.filter(
      (score) => score >= Number(quiz.passingScore),
    ).length;
    const average = (values) =>
      values.length
        ? Math.round(
            (values.reduce((sum, value) => sum + value, 0) / values.length) *
              100,
          ) / 100
        : null;
    const summary = {
      attempts: attempts.length,
      uniqueParticipants,
      completed: responses.length,
      active: activeAttempts.length,
      incomplete: incompleteAttempts.length,
      passed,
      failed: scores.length - passed,
      passRate: scores.length
        ? Math.round((passed / scores.length) * 10000) / 100
        : null,
      averageScore: average(scores),
      highestScore: scores.length ? Math.max(...scores) : null,
      lowestScore: scores.length ? Math.min(...scores) : null,
      averageDurationSec: average(durations),
      fastestDurationSec: durations.length ? Math.min(...durations) : null,
      slowestDurationSec: durations.length ? Math.max(...durations) : null,
    };
    const questionAnalytics = (quiz.questions || []).map((question, index) => {
      let answered = 0,
        correct = 0,
        gradable = 0;
      for (const response of responses) {
        const answer = response.answers?.[index],
          result = objectiveCorrect(question, answer),
          hasAnswer = Array.isArray(answer)
            ? answer.length > 0
            : answer !== null && answer !== undefined && answer !== "";
        if (hasAnswer) answered++;
        if (result !== null) {
          gradable++;
          if (result) correct++;
        }
      }
      return {
        index: index + 1,
        prompt: String(question.prompt || "").slice(0, 500),
        type: question.type,
        answered,
        correct: question.type === "text" ? null : correct,
        correctRate:
          question.type === "text" || !gradable
            ? null
            : Math.round((correct / gradable) * 10000) / 100,
      };
    });
    const participantRows = [
      ...responses.map((row) => ({
        id: row.id,
        name: row.name,
        contact: participantContact(row.participantData),
        participantData: row.participantData,
        status: "completed",
        score:
          row.score === null || row.score === undefined
            ? null
            : Number(row.score),
        durationSec: Number(row.durationSec),
        startedAt: new Date(
          new Date(row.completedAt).getTime() - Number(row.durationSec) * 1000,
        ).toISOString(),
        completedAt: row.completedAt,
        reviewStatus: row.reviewStatus,
        violations: Number(row.integritySummary?.violationCount || 0),
      })),
      ...attempts
        .filter((row) => !row.submittedAt)
        .map((row) => ({
          id: row.id,
          name: row.name,
          contact: participantContact(row.participantData),
          participantData: row.participantData,
          status: activeAttempts.includes(row)
            ? "active"
            : row.lockedAt
              ? "locked"
              : "incomplete",
          score: null,
          durationSec: Math.max(
            0,
            Math.min(
              Number(quiz.durationSec),
              Math.floor(
                (Math.min(now, new Date(row.expiresAt).getTime()) -
                  new Date(row.startedAt).getTime()) /
                  1000,
              ),
            ),
          ),
          startedAt: row.startedAt,
          completedAt: null,
          reviewStatus: null,
          violations: Number(row.violationCount || 0),
          currentQuestion: Number(row.currentQuestion || 0),
        })),
    ].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    return json(res, 200, {
      quiz: {
        id: quiz.id,
        slug: quiz.slug,
        title: quiz.title,
        description: quiz.description,
        durationSec: Number(quiz.durationSec),
        passingScore: Number(quiz.passingScore),
        startsAt: quiz.startsAt,
        endsAt: quiz.endsAt,
        published: quiz.published,
        questionCount: (quiz.questions || []).length,
      },
      summary,
      participants: participantRows,
      questionAnalytics,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json(res, 500, safeError(error));
  }
}
