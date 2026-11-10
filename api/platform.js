import studio_access_codes from "../lib/platform-routes/studio/access-codes.js";
import studio_extend_code from "../lib/platform-routes/studio/extend-code.js";
import studio_generate_template from "../lib/platform-routes/studio/generate-template.js";
import studio_login from "../lib/platform-routes/studio/login.js";
import studio_logout from "../lib/platform-routes/studio/logout.js";
import studio_overview from "../lib/platform-routes/studio/overview.js";
import studio_organize_questions from "../lib/platform-routes/studio/organize-questions.js";
import studio_document_questions from "../lib/platform-routes/studio/document-questions.js";
import studio_distribute_scores from "../lib/platform-routes/studio/distribute-scores.js";
import studio_grade_response from "../lib/platform-routes/studio/grade-response.js";
import studio_live_responses from "../lib/platform-routes/studio/live-responses.js";
import studio_qr from "../lib/platform-routes/studio/qr.js";
import studio_quiz_statistics from "../lib/platform-routes/studio/quiz-statistics.js";
import studio_quizzes from "../lib/platform-routes/studio/quizzes.js";
import studio_responses from "../lib/platform-routes/studio/responses.js";
import studio_revoke_code from "../lib/platform-routes/studio/revoke-code.js";
import studio_session from "../lib/platform-routes/studio/session.js";
import studio_templates from "../lib/platform-routes/studio/templates.js";
import studio_update_quiz from "../lib/platform-routes/studio/update-quiz.js";
import public_quiz from "../lib/platform-routes/public/quiz.js";
import public_verify from "../lib/platform-routes/public/verify.js";
import { json } from "../lib/server.js";
export const config = { api: { bodyParser: { sizeLimit: "30mb" } } };
const routes = {
  "studio/access-codes": studio_access_codes,
  "studio/extend-code": studio_extend_code,
  "studio/generate-template": studio_generate_template,
  "studio/login": studio_login,
  "studio/logout": studio_logout,
  "studio/overview": studio_overview,
  "studio/organize-questions": studio_organize_questions,
  "studio/document-questions": studio_document_questions,
  "studio/distribute-scores": studio_distribute_scores,
  "studio/grade-response": studio_grade_response,
  "studio/live-responses": studio_live_responses,
  "studio/qr": studio_qr,
  "studio/quiz-statistics": studio_quiz_statistics,
  "studio/quizzes": studio_quizzes,
  "studio/responses": studio_responses,
  "studio/revoke-code": studio_revoke_code,
  "studio/session": studio_session,
  "studio/templates": studio_templates,
  "studio/update-quiz": studio_update_quiz,
  "public/quiz": public_quiz,
  "public/verify": public_verify,
};
export default async function handler(req, res) {
  const group = String(req.query?.group || ""),
    endpoint = String(req.query?.endpoint || ""),
    route = routes[group + "/" + endpoint];
  if (!route) return json(res, 404, { error: "route_not_found" });
  return route(req, res);
}
