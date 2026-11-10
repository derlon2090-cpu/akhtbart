const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const slug =
  new URLSearchParams(location.search).get("slug") ||
  location.pathname.match(/^\/quiz\/([^/]+)/)?.[1] ||
  "";
let quiz = null,
  questions = [],
  answers = [],
  index = 0,
  startedAt = 0,
  timer = null,
  violations = 0,
  questionDeadline = 0,
  lastTimedIndex = -1,
  locked = false,
  lastBlurAt = 0;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const mmss = (n) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
const steps = (active) =>
  `<div class="steps"><span class="step ${active > 1 ? "done" : active === 1 ? "active" : ""}"><i>${active > 1 ? "✓" : "1"}</i><span>بيانات المشارك</span></span><b class="step-line"></b><span class="step ${active > 2 ? "done" : active === 2 ? "active" : ""}"><i>${active > 2 ? "✓" : "2"}</i><span>بدء الأسئلة</span></span><b class="step-line"></b><span class="step ${active === 3 ? "active" : ""}"><i>3</i><span>تسليم الإجابات</span></span></div>`;
function syncQuizChrome() {
  if (!quiz) return;
  $("#heroQuizTitle").textContent = quiz.title;
  $("#heroQuizDescription").textContent =
    quiz.description || "أجب عن الأسئلة بهدوء قبل انتهاء الوقت المحدد.";
  $("#quizDuration").textContent = `${Math.ceil(quiz.durationSec / 60)} دقيقة`;
  $("#quizAvailability").textContent = quiz.endsAt
    ? `متاح حتى ${new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(quiz.endsAt))}`
    : "متاح الآن";
  document.title = `${quiz.title} | منصة الاختبارات`;
}
async function api(body) {
  const r = await fetch("/api/public/quiz", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { r, p: await r.json() };
}
function stateKey() {
  return `private-quiz:${slug}`;
}
function saveState() {
  try {
    localStorage.setItem(
      stateKey(),
      JSON.stringify({ answers, index, questionDeadline }),
    );
  } catch {}
}
function clearState() {
  try {
    localStorage.removeItem(stateKey());
  } catch {}
}
async function load() {
  if (!/^[\p{L}\p{N}_-]{8,80}$/u.test(slug))
    return showError("رابط الاختبار غير صالح.");
  try {
    const r = await fetch("/api/public/quiz?slug=" + encodeURIComponent(slug), {
        cache: "no-store",
        credentials: "same-origin",
      }),
      p = await r.json();
    if (!r.ok) throw Error();
    if (p.unavailable) {
      if (p.title) $("#heroQuizTitle").textContent = p.title;
      return showError(
        p.reason === "not_started"
          ? "لم يبدأ وقت الاختبار بعد."
          : "انتهى وقت استقبال الإجابات.",
      );
    }
    quiz = p.quiz;
    syncQuizChrome();
    applyIntegrityPolicy();
    if (p.resume) {
      questions = p.resume.questions;
      startedAt = p.resume.startedAt;
      violations = p.resume.violationCount || 0;
      locked = p.resume.locked;
      answers = Array(questions.length).fill(null);
      index = Math.max(
        0,
        Math.min(questions.length - 1, Number(p.resume.currentQuestion) || 0),
      );
      if (quiz.integritySettings?.perQuestionSec) {
        lastTimedIndex = index;
        questionDeadline =
          Number(p.resume.lastActivityAt || Date.now()) +
          quiz.integritySettings.perQuestionSec * 1000;
      }
      try {
        const saved = JSON.parse(localStorage.getItem(stateKey()) || "null");
        if (
          saved &&
          Array.isArray(saved.answers) &&
          saved.answers.length === questions.length
        ) {
          answers = saved.answers;
          index = Math.max(
            index,
            Math.min(questions.length - 1, Number(saved.index) || 0),
          );
          if (Number(saved.questionDeadline) > 0)
            questionDeadline = Math.min(
              questionDeadline || Infinity,
              Number(saved.questionDeadline),
            );
        }
      } catch {}
      if (locked) return showLocked();
      $("#timerbox").classList.remove("hidden");
      render();
      tick();
      timer = setInterval(tick, 1000);
      return;
    }
    showGate();
  } catch {
    showError("تعذر تحميل الاختبار. تحقق من الرابط وحاول مجددًا.");
  }
}
function registrationControl(field) {
  const id = `participant_${field.id}`,
    required = field.required ? "required" : "";
  if (field.type === "checkbox")
    return `<label class="participant-check"><input id="${esc(id)}" data-participant="${esc(field.id)}" type="checkbox" ${required}><span>${esc(field.label)}${field.required ? " *" : ""}</span></label>`;
  if (field.type === "select")
    return `<div class="field"><label for="${esc(id)}">${esc(field.label)}${field.required ? " *" : ""}</label><select id="${esc(id)}" data-participant="${esc(field.id)}" ${required}><option value="">اختر…</option>${(field.options || []).map((x) => `<option>${esc(x)}</option>`).join("")}</select></div>`;
  return `<div class="field"><label for="${esc(id)}">${esc(field.label)}${field.required ? " *" : ""}</label><input id="${esc(id)}" data-participant="${esc(field.id)}" type="${field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}" maxlength="300" ${required} autocomplete="${field.id === "name" ? "name" : field.type === "email" ? "email" : "off"}" placeholder="اكتب ${esc(field.label)}"></div>`;
}
function showGate(error = "") {
  $("#content").innerHTML =
    `<div class="panel">${steps(1)}<div class="gate-heading"><div class="eyebrow">خطوة واحدة قبل البدء</div><h2>جاهز لبدء الاختبار؟</h2><p class="desc">أدخل بياناتك الصحيحة، ثم ابدأ الأسئلة.</p></div><div class="exam-summary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg><span>مدة الاختبار ${Math.ceil(quiz.durationSec / 60)} دقيقة. ستُرفق بياناتك بنتيجتك لدى المشرف، وتبقى جلستك محمية.</span></div><form id="startForm">${(quiz.registrationFields || [{ id: "name", label: "اسم المشارك", type: "text", required: true }]).map(registrationControl).join("")}${quiz.requiresPassword ? '<div class="field"><label for="quizPassword">كلمة مرور الاختبار</label><input id="quizPassword" type="password" required autocomplete="current-password" placeholder="أدخل كلمة المرور"></div>' : ""}<button class="btn full" id="startBtn">تأكيد البيانات وبدء الاختبار</button><div class="error" role="status">${esc(error)}</div></form></div>`;
  $("#startForm").onsubmit = start;
}
async function start(e) {
  e.preventDefault();
  const button = $("#startBtn"),
    participantData = {};
  $$("[data-participant]").forEach(
    (input) =>
      (participantData[input.dataset.participant] =
        input.type === "checkbox" ? input.checked : input.value),
  );
  button.disabled = true;
  button.textContent = "جارٍ التحقق من البيانات…";
  try {
    const { r, p } = await api({
      action: "start",
      slug,
      participantData,
      password: $("#quizPassword")?.value || "",
    });
    if (!r.ok) throw Error(p.error);
    questions = p.questions;
    answers = Array(questions.length).fill(null);
    index = 0;
    startedAt = Number(p.startedAt) || Date.now();
    quiz = { ...quiz, ...p };
    applyIntegrityPolicy();
    saveState();
    $("#timerbox").classList.remove("hidden");
    render();
    void integrity("heartbeat");
    tick();
    timer = setInterval(tick, 1000);
  } catch (error) {
    showGate(
      error.message === "attempt_limit_reached"
        ? "وصلت إلى الحد الأقصى للمحاولات لهذا المتصفح."
        : error.message === "quiz_password_required"
          ? "كلمة المرور غير صحيحة."
          : error.message === "invalid_participant"
            ? "تحقق من اكتمال بياناتك وصحة البريد الإلكتروني والموافقة على الإقرار."
            : "تعذر بدء الاختبار. حاول مجددًا.",
    );
  } finally {
    if ($("#startBtn")) $("#startBtn").disabled = false;
  }
}
function render() {
  if (locked) return showLocked();
  if (index >= questions.length) return submit();
  const q = questions[index],
    per = Number(quiz.integritySettings?.perQuestionSec) || 0;
  if (per && lastTimedIndex !== index) {
    lastTimedIndex = index;
    questionDeadline = Date.now() + per * 1000;
  }
  $("#content").innerHTML =
    `<div class="progress-card"><div class="progress-wrap"><span><b>السؤال ${index + 1}</b> من ${questions.length}</span><span>${per ? `وقت السؤال <b id="questionTimer">${mmss(per)}</b> · ` : ""}مؤشرات النزاهة ${violations}</span></div><div class="progress"><i style="width:${((index + 1) / questions.length) * 100}%"></i></div></div><div class="panel">${steps(2)}<div class="qnum">${q.type === "text" ? "إجابة قصيرة" : q.type === "multi" ? "اختر كل الإجابات الصحيحة" : q.type === "boolean" ? "صح أو خطأ" : "اختر إجابة واحدة"}</div><h1 class="question">${esc(q.prompt)}</h1><div class="answers">${
      q.type === "text"
        ? `<textarea id="textAnswer" class="answer-text" rows="4" placeholder="اكتب إجابتك هنا…">${esc(answers[index] || "")}</textarea>`
        : (q.type === "boolean" ? ["صح", "خطأ"] : q.options)
            .map((x, i) => {
              const v = q.type === "boolean" ? i === 0 : i,
                selected =
                  q.type === "multi"
                    ? (answers[index] || []).includes(i)
                    : answers[index] === v;
              return `<button class="answer ${selected ? "selected" : ""}" data-index="${i}"><span class="letter">${"أبجدهوزح"[i] || i + 1}</span><span>${esc(x)}</span></button>`;
            })
            .join("")
    }</div><div class="actions"><button class="btn secondary" id="prev" ${index === 0 || per ? "disabled" : ""}>السابق</button><button class="btn" id="next">${index === questions.length - 1 ? "تسليم الإجابات" : "التالي"}</button></div><div class="error" id="error"></div></div>`;
  if (q.type === "text")
    $("#textAnswer").oninput = (e) => {
      answers[index] = e.target.value;
      saveState();
    };
  $$(".answer").forEach(
    (b) =>
      (b.onclick = () => {
        const i = Number(b.dataset.index);
        if (q.type === "multi") {
          const a = answers[index] || [];
          answers[index] = a.includes(i) ? a.filter((x) => x !== i) : [...a, i];
        } else answers[index] = q.type === "boolean" ? i === 0 : i;
        saveState();
        render();
      }),
  );
  $("#prev").onclick = () => {
    index--;
    lastTimedIndex = -1;
    saveState();
    render();
  };
  $("#next").onclick = () => {
    const a = answers[index];
    if (
      a === null ||
      a === undefined ||
      (Array.isArray(a) && !a.length) ||
      (typeof a === "string" && !a.trim())
    ) {
      $("#error").textContent = "أجب عن السؤال للمتابعة.";
      return;
    }
    if (index < questions.length - 1) {
      index++;
      lastTimedIndex = -1;
      saveState();
      render();
      void integrity("heartbeat");
    } else submit();
  };
}
function tick() {
  const left = Math.max(
    0,
    Math.ceil((quiz.durationSec * 1000 - (Date.now() - startedAt)) / 1000),
  );
  $("#timer").textContent = mmss(left);
  $("#timerbox").classList.toggle("urgent", left < 60);
  const per = Number(quiz.integritySettings?.perQuestionSec) || 0;
  if (per && questionDeadline) {
    const qleft = Math.max(
      0,
      Math.ceil((questionDeadline - Date.now()) / 1000),
    );
    if ($("#questionTimer")) $("#questionTimer").textContent = mmss(qleft);
    if (qleft === 0) {
      questionDeadline = 0;
      void integrity("question_timeout");
      if (index < questions.length - 1) {
        index++;
        lastTimedIndex = -1;
        saveState();
        render();
      } else void submit();
    }
  }
  if (left === 0) {
    clearInterval(timer);
    void submit();
  }
}
async function submit() {
  if (!questions.length) return;
  $$("button").forEach((b) => (b.disabled = true));
  try {
    const { r, p } = await api({ action: "submit", slug, answers });
    if (!r.ok) throw Error(p.error);
    if (timer) clearInterval(timer);
    clearState();
    $("#timerbox").classList.add("hidden");
    $("#content").innerHTML =
      `<div class="panel success">${steps(3)}<div class="success-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12 4 4L19 6"/></svg></div><div class="eyebrow">تم استلام المشاركة بنجاح</div><div class="score">${p.needsReview ? "قيد المراجعة" : esc(p.earnedPoints)}${p.needsReview ? "" : `<span style="font-size:20px;color:var(--muted)"> / ${esc(p.totalPoints)}</span>`}</div><h1>${p.needsReview ? "تم استلام الإجابات" : p.passed ? "أحسنت، اجتزت الاختبار" : "تم حفظ إجاباتك"}</h1><p class="desc">${esc(quiz.completionMessage || p.message)} · زمن الحل ${mmss(p.durationSec)}${p.needsReview ? " · الدرجة قيد المراجعة" : ` · النسبة ${esc(p.score)}%`}</p></div>`;
  } catch (error) {
    showError(
      error.message === "attempt_expired_or_submitted"
        ? "انتهت الجلسة أو سبق تسليمها."
        : "تعذر حفظ الإجابات. تحقق من الاتصال وحاول مجددًا.",
    );
  }
}
async function integrity(event, detail = "") {
  if (!questions.length || locked) return;
  try {
    const { r, p } = await api({
      action: "integrity",
      slug,
      event,
      detail,
      currentQuestion: index,
    });
    if (r.ok) {
      violations = p.violationCount || 0;
      if (p.locked) {
        locked = true;
        showLocked();
      }
    }
  } catch {}
}
function applyIntegrityPolicy() {
  document.documentElement.classList.toggle(
    "integrity-lock",
    Boolean(quiz?.integritySettings?.disableCopy),
  );
}
function showLocked() {
  if (timer) clearInterval(timer);
  $("#timerbox").classList.add("hidden");
  $("#content").innerHTML =
    `<div class="panel">${steps(2)}<div class="eyebrow">تم إيقاف المحاولة</div><h1>تجاوزت حد مخالفات النزاهة</h1><p class="desc">تم قفل الاختبار تلقائيًا وتسجيل الحوادث للمشرف. تواصل مع مسؤول الاختبار إذا كنت تعتقد أن ذلك حدث بالخطأ.</p></div>`;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && questions.length && !locked)
    void integrity("tab_hidden", "غادر تبويب الاختبار");
});
window.addEventListener("blur", () => {
  if (!questions.length || locked || Date.now() - lastBlurAt < 1200) return;
  lastBlurAt = Date.now();
  void integrity("window_blur", "فقدت نافذة الاختبار التركيز");
});
for (const event of ["copy", "cut", "contextmenu"])
  document.addEventListener(event, (e) => {
    if (!questions.length || !quiz?.integritySettings?.disableCopy) return;
    e.preventDefault();
    void integrity(
      event === "contextmenu" ? "context_menu" : "copy_attempt",
      event,
    );
  });
document.addEventListener("keydown", (e) => {
  if (
    questions.length &&
    quiz?.integritySettings?.disableCopy &&
    (e.ctrlKey || e.metaKey) &&
    ["c", "x", "a", "u", "s"].includes(e.key.toLowerCase())
  ) {
    e.preventDefault();
    void integrity("copy_attempt", `shortcut:${e.key}`);
  }
});
function showError(message) {
  $("#content").innerHTML =
    `<div class="panel"><div class="gate-heading"><div class="eyebrow">تعذّر فتح الاختبار</div><h2>تحقق من الرابط</h2><p class="desc">${esc(message)}</p></div></div>`;
}
const savedQuizTheme =
  localStorage.getItem("quiz-theme") === "dark" ? "dark" : "light";
document.documentElement.dataset.theme = savedQuizTheme;
$("#quizThemeToggle").onclick = () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("quiz-theme", next);
};
void load();
