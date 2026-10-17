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
