CREATE TABLE IF NOT EXISTS chemistry_questions (
  position integer PRIMARY KEY CHECK (position > 0),
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 500),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4),
  correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemistry_attempts (
  attempt_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  student_name text NOT NULL,
  grade text NOT NULL,
  section text NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress','completed','expired')),
  score integer,
  total integer NOT NULL CHECK (total > 0),
  duration_sec integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS chemistry_attempts_started_at_idx ON chemistry_attempts (started_at DESC);
CREATE INDEX IF NOT EXISTS chemistry_attempts_admin_page_idx ON chemistry_attempts (started_at DESC, attempt_id DESC);

CREATE TABLE IF NOT EXISTS chemistry_visits (
  visitor_id uuid PRIMARY KEY,
  visited_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemistry_admin_login_limits (
  ip_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);

INSERT INTO chemistry_questions (position, question, options, correct_index) VALUES
(1, 'ما الجسيم الذي يحدد العدد الذري للعنصر؟', '["النيوترون","البروتون","الإلكترون","الفوتون"]'::jsonb, 1),
(2, 'ما قيمة الرقم الهيدروجيني لمحلول متعادل عند 25°م؟', '["0","5","7","14"]'::jsonb, 2),
(3, 'أي الغازات الآتية ينتج غالبًا عند تفاعل فلز نشط مع حمض مخفف؟', '["الأكسجين","النيتروجين","الهيدروجين","الكلور"]'::jsonb, 2),
(4, 'ما الصيغة الكيميائية للماء؟', '["H₂O","HO₂","H₂O₂","OH"]'::jsonb, 0),
(5, 'أي الروابط تنشأ من مشاركة الذرات بالإلكترونات؟', '["أيونية","فلزية","تساهمية","هيدروجينية"]'::jsonb, 2),
(6, 'ما عدد مولات المادة في 18 غرامًا من الماء؟ (الكتلة المولية = 18 غ/مول)', '["0.5 مول","1 مول","2 مول","18 مول"]'::jsonb, 1),
(7, 'أي التغيرات الآتية يُعد تغيرًا كيميائيًا؟', '["انصهار الثلج","تبخر الماء","صدأ الحديد","تقطيع الورق"]'::jsonb, 2),
(8, 'في التفاعل الطارد للحرارة، تنتقل الطاقة الحرارية عادةً…', '["من الوسط إلى النظام","من النظام إلى الوسط","لا تنتقل","تتحول إلى كتلة فقط"]'::jsonb, 1),
(9, 'ما اسم العملية التي يتحول فيها السائل إلى غاز من سطحه؟', '["التكاثف","التجمد","التسامي","التبخر"]'::jsonb, 3),
(10, 'أي مما يأتي يُستخدم عادةً لزيادة سرعة التفاعل الكيميائي دون أن يُستهلك؟', '["المذيب","العامل الحفاز","الناتج","المتفاعل المحدد"]'::jsonb, 1)
ON CONFLICT (position) DO NOTHING;

-- Extensible private quiz studio and database-backed access code sessions.
CREATE TABLE IF NOT EXISTS studio_access_codes (
  access_code_id uuid PRIMARY KEY,
  code_hash bytea NOT NULL UNIQUE,
  code_hint text NOT NULL,
  role text NOT NULL CHECK (role IN ('viewer','quiz_creator','manager','superadmin')),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES studio_access_codes(access_code_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS studio_access_codes_status_idx ON studio_access_codes (revoked_at, expires_at, created_at DESC);

CREATE TABLE IF NOT EXISTS studio_profiles (
  profile_key text PRIMARY KEY,
  display_name text NOT NULL DEFAULT '' CHECK (length(display_name) <= 80),
  account_slug text UNIQUE CHECK (account_slug IS NULL OR length(account_slug) BETWEEN 2 AND 28),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_sessions (
  session_id uuid PRIMARY KEY,
  token_hash bytea NOT NULL UNIQUE,
  access_code_id uuid REFERENCES studio_access_codes(access_code_id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer','quiz_creator','manager','superadmin')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS studio_sessions_expiry_idx ON studio_sessions (expires_at);

CREATE TABLE IF NOT EXISTS studio_quizzes (
  quiz_id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '',
  duration_sec integer NOT NULL DEFAULT 600 CHECK (duration_sec BETWEEN 30 AND 86400),
  passing_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (passing_score BETWEEN 0 AND 100),
  starts_at timestamptz,
  ends_at timestamptz,
  password_hash bytea,
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 20),
  completion_message text NOT NULL DEFAULT 'تم تسليم إجاباتك بنجاح.',
  published boolean NOT NULL DEFAULT false,
  integrity_settings jsonb NOT NULL DEFAULT '{"tabSwitchLimit":0,"disableCopy":true,"shuffleQuestions":true,"shuffleOptions":true,"perQuestionSec":0}'::jsonb CHECK (jsonb_typeof(integrity_settings) = 'object'),
  registration_fields jsonb NOT NULL DEFAULT '[{"id":"name","label":"اسم الطالب الثلاثي","type":"text","required":true},{"id":"email","label":"البريد الإلكتروني","type":"email","required":true},{"id":"honor","label":"أقر أن البيانات المدخلة تخصني وأنني سأجيب بنفسي","type":"checkbox","required":true}]'::jsonb CHECK (jsonb_typeof(registration_fields) = 'array' AND jsonb_array_length(registration_fields) <= 12),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) <= 100),
  created_by_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_quizzes_published_idx ON studio_quizzes (published, starts_at, ends_at);
ALTER TABLE studio_quizzes ADD COLUMN IF NOT EXISTS public_slug text;
ALTER TABLE studio_quizzes ADD COLUMN IF NOT EXISTS owner_profile_key text REFERENCES studio_profiles(profile_key) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS studio_quizzes_public_slug_idx ON studio_quizzes (public_slug) WHERE public_slug IS NOT NULL;
UPDATE studio_quizzes SET public_slug=slug WHERE public_slug IS NULL;
UPDATE studio_quizzes q SET owner_profile_key='superadmin' WHERE q.owner_profile_key IS NULL AND q.created_by_role='superadmin' AND EXISTS (SELECT 1 FROM studio_profiles p WHERE p.profile_key='superadmin');
UPDATE studio_quizzes q SET public_slug=p.account_slug||'-'||replace(q.quiz_id::text,'-','') FROM studio_profiles p WHERE q.owner_profile_key=p.profile_key AND p.account_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS studio_quiz_responses (
  response_id uuid PRIMARY KEY,
  quiz_id uuid NOT NULL REFERENCES studio_quizzes(quiz_id) ON DELETE CASCADE,
  participant_hash bytea NOT NULL,
  participant_name text NOT NULL CHECK (length(participant_name) BETWEEN 2 AND 100),
  participant_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(participant_data) = 'object'),
  integrity_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(integrity_summary) = 'object'),
  ai_feedback jsonb,
  verification_code text UNIQUE,
  issued_at timestamptz,
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'array'),
  score numeric(7,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  duration_sec integer NOT NULL CHECK (duration_sec >= 0),
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_responses_quiz_date_idx ON studio_quiz_responses (quiz_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS studio_responses_participant_idx ON studio_quiz_responses (quiz_id, participant_hash, completed_at DESC);

CREATE TABLE IF NOT EXISTS studio_quiz_attempts (
  attempt_id uuid PRIMARY KEY,
  quiz_id uuid NOT NULL REFERENCES studio_quizzes(quiz_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  participant_hash bytea NOT NULL,
  participant_name text NOT NULL CHECK (length(participant_name) BETWEEN 2 AND 100),
  participant_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(participant_data) = 'object'),
  question_order jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(question_order) = 'array'),
  option_orders jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(option_orders) = 'object'),
  integrity_events jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(integrity_events) = 'array'),
  violation_count integer NOT NULL DEFAULT 0 CHECK (violation_count >= 0),
  locked_at timestamptz,
  current_question integer NOT NULL DEFAULT 0 CHECK (current_question >= 0),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz
);
CREATE INDEX IF NOT EXISTS studio_quiz_attempts_participant_idx ON studio_quiz_attempts (quiz_id, participant_hash, started_at DESC);

CREATE TABLE IF NOT EXISTS studio_quiz_participants (
  quiz_id uuid NOT NULL REFERENCES studio_quizzes(quiz_id) ON DELETE CASCADE,
  participant_hash bytea NOT NULL,
  attempts_started integer NOT NULL DEFAULT 0 CHECK (attempts_started >= 0),
  PRIMARY KEY (quiz_id, participant_hash)
);

CREATE TABLE IF NOT EXISTS studio_pdf_templates (
  template_id uuid PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  document_type text NOT NULL CHECK (document_type IN ('certificate','results','grades','summary')),
  prompt text NOT NULL DEFAULT '',
  html_template text NOT NULL CHECK (length(html_template) <= 100000),
  created_by_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_ai_limits (
  session_id uuid PRIMARY KEY REFERENCES studio_sessions(session_id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE studio_quiz_responses ALTER COLUMN score DROP NOT NULL;
ALTER TABLE studio_quizzes ADD COLUMN IF NOT EXISTS registration_fields jsonb NOT NULL DEFAULT '[{"id":"name","label":"اسم الطالب الثلاثي","type":"text","required":true},{"id":"email","label":"البريد الإلكتروني","type":"email","required":true},{"id":"honor","label":"أقر أن البيانات المدخلة تخصني وأنني سأجيب بنفسي","type":"checkbox","required":true}]'::jsonb;
ALTER TABLE studio_quizzes ADD COLUMN IF NOT EXISTS integrity_settings jsonb NOT NULL DEFAULT '{"tabSwitchLimit":0,"disableCopy":true,"shuffleQuestions":true,"shuffleOptions":true,"perQuestionSec":0}'::jsonb;
ALTER TABLE studio_quiz_attempts ADD COLUMN IF NOT EXISTS participant_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE studio_quiz_attempts ADD COLUMN IF NOT EXISTS question_order jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE studio_quiz_attempts ADD COLUMN IF NOT EXISTS option_orders jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE studio_quiz_attempts ADD COLUMN IF NOT EXISTS integrity_events jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE studio_quiz_attempts ADD COLUMN IF NOT EXISTS violation_count integer NOT NULL DEFAULT 0;
ALTER TABLE studio_quiz_attempts ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE studio_quiz_attempts ADD COLUMN IF NOT EXISTS current_question integer NOT NULL DEFAULT 0;
ALTER TABLE studio_quiz_attempts ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE studio_quiz_responses ADD COLUMN IF NOT EXISTS participant_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE studio_quiz_responses ADD COLUMN IF NOT EXISTS integrity_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE studio_quiz_responses ADD COLUMN IF NOT EXISTS ai_feedback jsonb;
ALTER TABLE studio_quiz_responses ADD COLUMN IF NOT EXISTS verification_code text;
CREATE UNIQUE INDEX IF NOT EXISTS studio_responses_verification_idx ON studio_quiz_responses (verification_code) WHERE verification_code IS NOT NULL;
ALTER TABLE studio_quiz_responses ADD COLUMN IF NOT EXISTS issued_at timestamptz;
ALTER TABLE studio_quiz_responses ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'submitted'
  CHECK (review_status IN ('submitted','needs_review','graded'));
