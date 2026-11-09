import studio_access_codes from '../lib/platform-routes/studio/access-codes.js';
import studio_extend_code from '../lib/platform-routes/studio/extend-code.js';
import studio_generate_template from '../lib/platform-routes/studio/generate-template.js';
import studio_login from '../lib/platform-routes/studio/login.js';
import studio_logout from '../lib/platform-routes/studio/logout.js';
import studio_overview from '../lib/platform-routes/studio/overview.js';
import studio_qr from '../lib/platform-routes/studio/qr.js';
import studio_quizzes from '../lib/platform-routes/studio/quizzes.js';
import studio_responses from '../lib/platform-routes/studio/responses.js';
import studio_revoke_code from '../lib/platform-routes/studio/revoke-code.js';
import studio_session from '../lib/platform-routes/studio/session.js';
import studio_templates from '../lib/platform-routes/studio/templates.js';
import studio_update_quiz from '../lib/platform-routes/studio/update-quiz.js';
import public_quiz from '../lib/platform-routes/public/quiz.js';
import { json } from '../lib/server.js';
const routes={'studio/access-codes':studio_access_codes,'studio/extend-code':studio_extend_code,'studio/generate-template':studio_generate_template,'studio/login':studio_login,'studio/logout':studio_logout,'studio/overview':studio_overview,'studio/qr':studio_qr,'studio/quizzes':studio_quizzes,'studio/responses':studio_responses,'studio/revoke-code':studio_revoke_code,'studio/session':studio_session,'studio/templates':studio_templates,'studio/update-quiz':studio_update_quiz,'public/quiz':public_quiz};
export default async function handler(req,res){const group=String(req.query?.group||''),endpoint=String(req.query?.endpoint||''),route=routes[group+'/'+endpoint];if(!route)return json(res,404,{error:'route_not_found'});return route(req,res)}
