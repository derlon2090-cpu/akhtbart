let role = "viewer",
  quizIndex = 0,
  quizCatalog = [],
  draftHtml = "",
  currentStatsReport = null;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const roleText = (r) =>
  ({
    viewer: "عرض فقط",
    quiz_creator: "منشئ اختبارات",
    manager: "مدير",
    superadmin: "مدير أعلى",
  })[r] || "جلسة محمية";
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {}
  return { r: response, p: payload };
}
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const EXAM_ORIGIN = "https://www.ikhtibarati.com/exam/";
const quizLink = (value) => (typeof value === "object" && value?.link ? value.link : EXAM_ORIGIN + encodeURIComponent(typeof value === "object" ? value.slug : value));
async function init() {
  try {
    const { r, p } = await api("/api/studio/session");
    if (r.ok && p.authenticated) {
      role = p.role;
      showWorkspace();
      return;
    }
  } catch {}
  $("#gate").classList.remove("hidden");
}
function showWorkspace() {
  $("#gate").classList.add("hidden");
  $("#workspace").classList.remove("hidden");
  $("#roleLabel").textContent = roleText(role);
  $$('[data-view="codes"],#newCode,[data-view="pdf"]').forEach((e) => e.classList.toggle("hidden", !["manager", "superadmin"].includes(role)));
  $("#quizForm").classList.toggle("hidden", role === "viewer");
  go("overview");
  void loadOverview();
  void loadQuizzes();
}
function go(view) {
  $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$("[data-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== view));
  $("#pageTitle").textContent = {
    overview: "نظرة عامة",
    codes: "أكواد الوصول",
    quizzes: "إنشاء الاختبارات",
    links: "روابط الاختبارات والإحصائيات",
    settings: "إعدادات الحساب",
    pdf: "استوديو PDF الذكي",
  }[view];
  if (view === "codes") void loadCodes();
  if (view === "links") void loadQuizzes();
  if (view === "settings") void loadProfile();
  if (view === "pdf") void loadTemplates();
}
$$("[data-view]").forEach((b) => (b.onclick = () => go(b.dataset.view)));
const profileSlug = (value) => {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .trim()
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (/^[a-z0-9-]+$/.test(normalized)) return normalized.slice(0, 16);
  const titles = new Set(["المعلم", "معلم", "الأستاذ", "استاذ", "الدكتور", "دكتور"]),
    word = normalized.split("-").find((item) => item && !titles.has(item)) || "user",
    common = { إبراهيم: "ibrahim", ابراهيم: "ibrahim", محمد: "mohammed", أحمد: "ahmad", احمد: "ahmad", عبدالله: "abdullah" };
  return common[word] || "user";
};
function updateProfilePreview() {
  const prefix = profileSlug($("#profileDisplayName").value),
    sample = "X7k2P9qL0A";
  $("#profileLinkPreview").textContent = EXAM_ORIGIN + (prefix ? `${prefix}-` : "") + sample;
}
async function loadProfile() {
  const feedback = $("#profileFeedback");
  feedback.textContent = "جارٍ تحميل الإعدادات…";
  const { r, p } = await api("/api/studio/profile");
  if (!r.ok) return (feedback.textContent = "تعذّر تحميل إعدادات الحساب.");
  $("#profileDisplayName").value = p.profile?.displayName || "";
  updateProfilePreview();
  feedback.textContent = "";
}
$("#profileDisplayName").addEventListener("input", (event) => {
  event.currentTarget.value = event.currentTarget.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16);
  updateProfilePreview();
});
$("#profileForm").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("#saveProfile"),
    feedback = $("#profileFeedback");
  button.disabled = true;
  feedback.textContent = "جارٍ الحفظ…";
  const { r, p } = await api("/api/studio/profile", {
    method: "POST",
    body: JSON.stringify({ displayName: $("#profileDisplayName").value }),
  });
  button.disabled = false;
  if (!r.ok) return (feedback.textContent = p.error === "account_name_taken" ? "اسم الحساب مستخدم؛ اختر اسمًا آخر." : "اكتب اسمًا إنجليزيًا من خانتين إلى 16 خانة.");
  $("#profileDisplayName").value = p.profile.displayName || "";
  updateProfilePreview();
  feedback.textContent = `تم حفظ الهوية وتحديث ${p.updatedLinks || 0} من روابط اختباراتك ✓`;
  await loadQuizzes();
};
$$("[data-placeholder]").forEach(
  (b) =>
    (b.onclick = () => {
      const input = $("#pdfPrompt"),
        start = input.selectionStart,
        end = input.selectionEnd,
        token = b.dataset.placeholder;
      input.setRangeText(token, start, end, "end");
      input.focus();
    }),
);
let zoom = 1;
$("#zoomIn").onclick = () => {
  zoom = Math.min(1.35, zoom + 0.1);
  $("#pdfPreview").style.zoom = zoom;
  $("#zoomLabel").textContent = Math.round(zoom * 100) + "%";
};
$("#zoomOut").onclick = () => {
  zoom = Math.max(0.65, zoom - 0.1);
  $("#pdfPreview").style.zoom = zoom;
  $("#zoomLabel").textContent = Math.round(zoom * 100) + "%";
};
$("#previewDesktop").onclick = () => $("#pdfPreview").classList.remove("mobile-preview");
$("#previewMobile").onclick = () => $("#pdfPreview").classList.add("mobile-preview");
$$("[data-goto]").forEach((b) => (b.onclick = () => go(b.dataset.goto)));
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const b = $("#loginBtn");
  b.disabled = true;
  $("#loginError").textContent = "جارٍ التحقق من الكود…";
  try {
    const { r, p } = await api("/api/studio/login", {
      method: "POST",
      body: JSON.stringify({ code: $("#accessCode").value }),
    });
    if (!r.ok) throw Error(p.error);
    $("#accessCode").value = "";
    role = p.role;
    showWorkspace();
  } catch (x) {
    $("#loginError").textContent = x.message === "login_rate_limited" ? "تجاوزت عدد المحاولات؛ حاول بعد ١٥ دقيقة." : "الكود غير صحيح أو منتهي أو مستهلك.";
  } finally {
    b.disabled = false;
  }
};
$("#logoutBtn").onclick = async () => {
  await api("/api/studio/logout", { method: "POST", body: "{}" });
  location.reload();
};
async function loadOverview() {
  void loadActiveQuizLinks();
  try {
    const { r, p } = await api("/api/studio/overview");
    if (!r.ok) throw Error();
    $("#activeQuizzes").textContent = `${p.quizzes.active} / ${p.quizzes.total}`;
    $("#responses").textContent = p.responses.total;
    $("#activeCodes").textContent = p.codes.active;
    $("#usedCodes").textContent = p.codes.used;
  } catch {
    ["activeQuizzes", "responses", "activeCodes", "usedCodes"].forEach((id) => ($("#" + id).textContent = "—"));
  }
}
const quizIsActive = (quiz, now = Date.now()) => quiz.published && (!quiz.startsAt || new Date(quiz.startsAt).getTime() <= now) && (!quiz.endsAt || new Date(quiz.endsAt).getTime() > now);
function activeQuizAvailability(quiz) {
  if (!quiz.endsAt) return "متاح دون تاريخ انتهاء";
  return (
    "متاح حتى " +
    new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(quiz.endsAt))
  );
}
function renderActiveQuizLinks(source) {
  const root = $("#activeQuizLinks"),
    count = $("#activeLinksCount");
  if (!root || !count) return;
  if (!Array.isArray(source)) {
    count.textContent = "تعذّر التحميل";
    root.innerHTML = '<div class="active-links-empty">تعذّر تحميل روابط الاختبارات. حاول تحديث الصفحة.</div>';
    return;
  }
  const active = source.filter(quizIsActive).sort((a, b) => (a.endsAt ? new Date(a.endsAt).getTime() : Infinity) - (b.endsAt ? new Date(b.endsAt).getTime() : Infinity));
  count.textContent = active.length ? `${active.length} ${active.length === 1 ? "اختبار نشط" : "اختبارات نشطة"}` : "لا توجد روابط نشطة";
  root.innerHTML = active.map((q) => `<article class="active-link-card ${["manager", "superadmin"].includes(role) ? "is-clickable" : ""}"><div class="active-link-top">${["manager", "superadmin"].includes(role) ? `<button class="active-link-title active-link-title-button open-quiz-stats" type="button" data-id="${esc(q.quizId)}">${esc(q.title)}</button>` : `<b class="active-link-title">${esc(q.title)}</b>`}<span class="live-badge">متاح الآن</span></div><div class="active-link-meta"><span>${q.questionCount} سؤال</span><span>${Math.ceil(q.durationSec / 60)} دقيقة</span><span>${esc(activeQuizAvailability(q))}</span></div><div class="active-link-url" title="${esc(quizLink(q))}"><span aria-hidden="true">↗</span><code>${esc(quizLink(q))}</code></div><div class="active-link-actions">${["manager", "superadmin"].includes(role) ? `<button class="btn stats-link-btn open-quiz-stats" type="button" data-id="${esc(q.quizId)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></svg>الإحصائيات</button>` : `<a class="btn" href="${esc(quizLink(q))}" target="_blank" rel="noopener">فتح الاختبار</a>`}<a class="btn secondary" href="${esc(quizLink(q))}" target="_blank" rel="noopener">فتح</a><button class="btn secondary copy-active-link" type="button" data-slug="${esc(q.slug)}">نسخ</button></div></article>`).join("") || '<div class="active-links-empty"><b>لا توجد اختبارات متاحة الآن</b><br><span>ستظهر هنا تلقائيًا عند نشر اختبار وبدء موعده.</span></div>';
  root.querySelectorAll(".copy-active-link").forEach(
    (button) =>
      (button.onclick = async () => {
        try {
          await navigator.clipboard.writeText(quizLink(button.dataset.slug));
          button.textContent = "تم النسخ ✓";
          button.classList.add("is-copied");
          setTimeout(() => {
            button.textContent = "نسخ الرابط";
            button.classList.remove("is-copied");
          }, 1800);
        } catch {
          button.textContent = "تعذّر النسخ";
        }
      }),
  );
  root.querySelectorAll(".open-quiz-stats").forEach((button) => (button.onclick = () => openQuizStatistics(button.dataset.id)));
}
async function loadActiveQuizLinks() {
  try {
    const { r, p } = await api("/api/studio/quizzes");
    if (!r.ok) throw Error();
    renderActiveQuizLinks(p.quizzes);
  } catch {
    renderActiveQuizLinks(null);
  }
}
const formatDuration = (seconds) => {
  if (!Number.isFinite(Number(seconds))) return "—";
  const value = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(value / 3600),
    minutes = Math.floor((value % 3600) / 60),
    secs = value % 60;
  return hours ? `${hours} س ${String(minutes).padStart(2, "0")} د` : `${minutes}:${String(secs).padStart(2, "0")} د`;
};
const formatStatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const participantStatus = (status) =>
  ({
    completed: "مكتمل",
    active: "يؤدي الآن",
    incomplete: "غير مكتمل",
    locked: "مقفل",
  })[status] || status;
const scoreNumber = (value) => (Number.isInteger(Number(value)) ? String(Number(value)) : String(Math.round(Number(value) * 100) / 100));
const scoreLabel = (value, totalPoints = 100) => (Number.isFinite(Number(value)) ? `${scoreNumber((Number(value) * Number(totalPoints)) / 100)} / ${scoreNumber(totalPoints)}` : "—");
function scoreDistribution(report) {
  const scores = report.participants.filter((row) => row.status === "completed" && Number.isFinite(row.score)).map((row) => Number(row.score));
  const ranges = [
    { label: "90 - 100", count: scores.filter((x) => x >= 90).length },
    { label: "80 - 89", count: scores.filter((x) => x >= 80 && x < 90).length },
    { label: "60 - 79", count: scores.filter((x) => x >= 60 && x < 80).length },
    { label: "أقل من 60", count: scores.filter((x) => x < 60).length },
  ];
  const max = Math.max(1, ...ranges.map((range) => range.count));
  return ranges.map((range, index) => `<div class="distribution-row"><span>${range.label}</span><div class="distribution-track"><div class="distribution-fill ${index === 0 ? "success" : index === 3 ? "warning" : ""}" style="width:${Math.round((range.count / max) * 100)}%"></div></div><b>${range.count}</b></div>`).join("");
}
function renderQuizStatistics(report) {
  const s = report.summary,
    passing = Number(report.quiz.passingScore);
  $("#statsModalTitle").textContent = report.quiz.title;
  $("#statsModalSubtitle").textContent = `تقرير مفصّل · ${report.quiz.questionCount} سؤال · المجموع ${scoreNumber(report.quiz.totalPoints)} · درجة النجاح ${scoreLabel(passing, report.quiz.totalPoints)} (${passing}%) · حُدّث ${formatStatDate(report.generatedAt)}`;
  $("#statsModalBody").innerHTML = `<div class="report-note">يشمل «إجمالي الدخول» كل محاولة بدأت، بينما يمثل «المشاركون» الأشخاص الفريدين. تُحسب نسبة النجاح من المحاولات المكتملة ذات الدرجة.</div><div class="stats-summary-grid">${[
    ["إجمالي الدخول", s.attempts, `${s.uniqueParticipants} مشاركًا فريدًا`],
    ["المكتملون", s.completed, `${s.active} يؤدون الآن`],
    ["نسبة النجاح", s.passRate === null ? "—" : `${s.passRate}%`, `${s.passed} ناجح · ${s.failed} دون النجاح`],
    ["متوسط الدرجة", scoreLabel(s.averageScore, report.quiz.totalPoints), `الأعلى ${scoreLabel(s.highestScore, report.quiz.totalPoints)} · الأدنى ${scoreLabel(s.lowestScore, report.quiz.totalPoints)}`],
    ["متوسط الزمن", formatDuration(s.averageDurationSec), `الأسرع ${formatDuration(s.fastestDurationSec)}`],
    ["أطول زمن", formatDuration(s.slowestDurationSec), `الحد ${formatDuration(report.quiz.durationSec)}`],
    ["محاولات نشطة", s.active, "تتحدث عند إعادة الفتح"],
    ["غير مكتملة", s.incomplete, "منتهية أو مقفلة"],
  ]
    .map(([label, value, note]) => `<article class="stats-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`)
    .join("")}</div><div class="stats-detail-grid"><section class="stats-panel"><div class="stats-panel-head"><h3>توزيع الدرجات</h3><span class="muted">${s.completed} نتيجة</span></div><div class="stats-panel-body">${scoreDistribution(report)}</div></section><section class="stats-panel"><div class="stats-panel-head"><h3>تحليل الأسئلة</h3><span class="muted">نسبة الإجابة الصحيحة</span></div><div class="stats-panel-body question-analytics">${report.questionAnalytics.map((q) => `<article class="question-stat"><div class="question-stat-top"><span class="question-stat-title"><b>${q.index}.</b> ${esc(q.prompt)}</span><b class="question-stat-rate">${q.correctRate === null ? "يحتاج مراجعة" : `${q.correctRate}%`}</b></div><div class="distribution-track"><div class="distribution-fill" style="width:${q.correctRate ?? 0}%"></div></div><small class="muted">أجاب ${q.answered} مشارك${q.correct === null ? "" : ` · ${q.correct} إجابة صحيحة`}</small></article>`).join("") || '<div class="empty">لا توجد أسئلة.</div>'}</div></section></div><section class="stats-panel"><div class="stats-panel-head"><h3>سجل المشاركين والمحاولات</h3><span class="muted">${report.participants.length} سجل</span></div><div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>#</th><th>الاسم</th><th>التواصل / المعرف</th><th>الحالة</th><th>الدرجة</th><th>الزمن</th><th>بدء</th><th>الإكمال</th><th>مخالفات</th></tr></thead><tbody>${report.participants.map((row, index) => `<tr><td>${index + 1}</td><td><b>${esc(row.name)}</b></td><td dir="ltr">${esc(row.contact || "—")}</td><td><span class="status-pill ${esc(row.status)}">${participantStatus(row.status)}</span></td><td class="${row.score === null ? "" : row.score >= passing ? "score-good" : "score-low"}">${scoreLabel(row.score, report.quiz.totalPoints)}</td><td>${formatDuration(row.durationSec)}</td><td>${formatStatDate(row.startedAt)}</td><td>${formatStatDate(row.completedAt)}</td><td>${row.violations || 0}</td></tr>`).join("") || '<tr><td colspan="9" class="stats-empty-row">لا توجد محاولات بعد.</td></tr>'}</tbody></table></div></section>`;
}
async function openQuizStatistics(quizId) {
  const modal = $("#statsModal");
  currentStatsReport = null;
  $("#exportStatsWord").disabled = $("#exportStatsPdf").disabled = true;
  $("#statsModalTitle").textContent = "إحصائيات الاختبار";
  $("#statsModalSubtitle").textContent = "جارٍ جمع بيانات الدخول والنتائج…";
  $("#statsModalBody").innerHTML = '<div class="stats-loading"><div class="skeleton" style="margin:auto;max-width:520px"></div><p>جارٍ إعداد التقرير التفصيلي…</p></div>';
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  try {
    const { r, p } = await api("/api/studio/quiz-statistics?quizId=" + encodeURIComponent(quizId));
    if (!r.ok) throw Error(p.error || "statistics_failed");
    currentStatsReport = p;
    renderQuizStatistics(p);
    $("#exportStatsWord").disabled = $("#exportStatsPdf").disabled = false;
  } catch (error) {
    $("#statsModalBody").innerHTML = '<div class="stats-error"><b>تعذّر تحميل الإحصائيات.</b><br><span>تأكد من صلاحية المدير ثم حاول مجددًا.</span></div>';
  }
}
function closeQuizStatistics() {
  $("#statsModal").classList.add("hidden");
  document.body.style.overflow = "";
}
function reportDocument(report) {
  const s = report.summary,
    passing = Number(report.quiz.passingScore),
    rows = report.participants.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.name)}</td><td>${esc(row.contact || "—")}</td><td>${participantStatus(row.status)}</td><td>${scoreLabel(row.score, report.quiz.totalPoints)}</td><td>${formatDuration(row.durationSec)}</td><td>${formatStatDate(row.startedAt)}</td><td>${formatStatDate(row.completedAt)}</td><td>${row.violations || 0}</td></tr>`).join("");
  const questions = report.questionAnalytics.map((q) => `<tr><td>${q.index}</td><td>${esc(q.prompt)}</td><td>${q.answered}</td><td>${q.correct ?? "—"}</td><td>${q.correctRate === null ? "يحتاج مراجعة" : `${q.correctRate}%`}</td></tr>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير ${esc(report.quiz.title)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#172033;margin:0;direction:rtl;font-size:10px}header{background:#302b63;color:#fff;padding:22px;border-radius:14px;margin-bottom:16px}h1{margin:0 0 7px;font-size:23px}h2{font-size:15px;margin:22px 0 9px;color:#302b63}.meta{opacity:.82}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.kpi{border:1px solid #d9dfeb;border-radius:10px;padding:11px;background:#f8f9fc}.kpi span{display:block;color:#64748b;margin-bottom:6px}.kpi b{font-size:18px;color:#302b63}table{width:100%;border-collapse:collapse;table-layout:auto}th{background:#302b63;color:#fff}th,td{border:1px solid #d7dce6;padding:6px;text-align:right;vertical-align:top}tr:nth-child(even) td{background:#f6f7fa}.note{padding:10px;background:#eef2ff;border-radius:8px;color:#3f4c78;margin:12px 0}.footer{margin-top:14px;color:#64748b;text-align:center}@media print{header{-webkit-print-color-adjust:exact;print-color-adjust:exact}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}.kpi{break-inside:avoid}tr{break-inside:avoid}}</style></head><body><header><h1>${esc(report.quiz.title)}</h1><div class="meta">تقرير إحصائي مفصّل · المجموع ${scoreNumber(report.quiz.totalPoints)} · درجة النجاح ${scoreLabel(passing, report.quiz.totalPoints)} (${passing}%) · ${formatStatDate(report.generatedAt)}</div></header><div class="kpis">${[
    ["إجمالي الدخول", s.attempts],
    ["المشاركون", s.uniqueParticipants],
    ["المكتملون", s.completed],
    ["يؤدون الآن", s.active],
    ["نسبة النجاح", s.passRate === null ? "—" : `${s.passRate}%`],
    ["متوسط الدرجة", scoreLabel(s.averageScore, report.quiz.totalPoints)],
    ["متوسط الزمن", formatDuration(s.averageDurationSec)],
    ["غير مكتملة", s.incomplete],
  ]
    .map(([label, value]) => `<div class="kpi"><span>${label}</span><b>${value}</b></div>`)
    .join("")}</div><div class="note">أعلى درجة: ${scoreLabel(s.highestScore, report.quiz.totalPoints)} · أدنى درجة: ${scoreLabel(s.lowestScore, report.quiz.totalPoints)} · أسرع زمن: ${formatDuration(s.fastestDurationSec)} · أطول زمن: ${formatDuration(s.slowestDurationSec)}</div><h2>سجل المشاركين</h2><table><thead><tr><th>#</th><th>الاسم</th><th>التواصل/المعرف</th><th>الحالة</th><th>الدرجة</th><th>الزمن</th><th>بدء</th><th>الإكمال</th><th>مخالفات</th></tr></thead><tbody>${rows || '<tr><td colspan="9">لا توجد بيانات.</td></tr>'}</tbody></table><h2>تحليل الأسئلة</h2><table><thead><tr><th>#</th><th>السؤال</th><th>أجاب</th><th>إجابات صحيحة</th><th>نسبة الصحة</th></tr></thead><tbody>${questions}</tbody></table><div class="footer">منصة الاختبارات · تم إنشاء التقرير ${formatStatDate(report.generatedAt)}</div></body></html>`;
}
$("#closeStats").onclick = closeQuizStatistics;
$("#statsModal").onclick = (event) => {
  if (event.target === $("#statsModal")) closeQuizStatistics();
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#statsModal").classList.contains("hidden")) closeQuizStatistics();
});
$("#exportStatsPdf").onclick = () => {
  if (!currentStatsReport) return;
  const popup = open("", "_blank");
  if (!popup) return alert("اسمح بالنوافذ المنبثقة لتصدير PDF.");
  popup.document.write(reportDocument(currentStatsReport));
  popup.document.close();
  setTimeout(() => popup.print(), 450);
};
$("#exportStatsWord").onclick = () => {
  if (!currentStatsReport) return;
  const blob = new Blob(["\ufeff", reportDocument(currentStatsReport)], {
      type: "application/msword;charset=utf-8",
    }),
    link = document.createElement("a"),
    safeName = currentStatsReport.quiz.title.replace(/[\\/:*?"<>|]/g, "-");
  link.href = URL.createObjectURL(blob);
  link.download = `تقرير-${safeName}.doc`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
const modal = $("#codeModal");
$("#newCode").onclick = () => {
  modal.classList.remove("hidden");
  $("#newCodeValue").classList.add("hidden");
  $("#copyCode").classList.add("hidden");
  $("#createCode").classList.remove("hidden");
  $("#codeError").textContent = "";
};
$("#closeCode").onclick = () => modal.classList.add("hidden");
$("#createCode").onclick = async () => {
  const b = $("#createCode");
  b.disabled = true;
  try {
    const { r, p } = await api("/api/studio/access-codes", {
      method: "POST",
      body: JSON.stringify({
        role: $("#codeRole").value,
        maxUses: $("#codeUses").value || null,
        expiresAt: $("#codeExpiry").value ? new Date($("#codeExpiry").value).toISOString() : null,
      }),
    });
    if (!r.ok) throw Error(p.error);
    $("#newCodeValue").textContent = p.code;
    $("#newCodeValue").classList.remove("hidden");
    $("#copyCode").classList.remove("hidden");
    b.classList.add("hidden");
    await loadCodes();
    await loadOverview();
  } catch (x) {
    $("#codeError").textContent = x.message === "insufficient_permissions" ? "صلاحيتك لا تسمح بهذا الدور." : "تعذر إنشاء الكود.";
  } finally {
    b.disabled = false;
  }
};
$("#copyCode").onclick = async () => {
  await navigator.clipboard.writeText($("#newCodeValue").textContent);
  $("#copyCode").textContent = "نُسخ ✓";
};
async function loadCodes() {
  const body = $("#codesBody");
  try {
    const { r, p } = await api("/api/studio/access-codes");
    if (!r.ok) throw Error();
    body.innerHTML = p.codes.map((c) => `<tr><td dir="ltr">${esc(c.hint)}</td><td>${esc(c.roleLabel)}</td><td>${c.maxUses === null ? "متعدد" : `${c.usedCount} / ${c.maxUses}`}</td><td>${c.expiresAt ? new Date(c.expiresAt).toLocaleString("ar-SA") : "دون انتهاء"}</td><td><span class="badge ${c.status}">${{ active: "نشط", used: "مستهلك", expired: "منتهي", revoked: "ملغى" }[c.status]}</span></td><td>${c.status === "active" || c.status === "expired" ? `<div class="actions"><button class="btn secondary extend-code" data-id="${esc(c.id)}">تمديد 30 يومًا</button>${c.status === "active" ? `<button class="btn danger revoke" data-id="${esc(c.id)}">إلغاء</button>` : ""}</div>` : "—"}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">لا توجد أكواد.</td></tr>';
    $$(".revoke").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("إلغاء الكود وإنهاء جلساته؟")) return;
          const { r } = await api("/api/studio/revoke-code", {
            method: "POST",
            body: JSON.stringify({ id: b.dataset.id }),
          });
          if (r.ok) {
            await loadCodes();
            await loadOverview();
          }
        }),
    );
    $$(".extend-code").forEach(
      (b) =>
        (b.onclick = async () => {
          const { r } = await api("/api/studio/extend-code", {
            method: "POST",
            body: JSON.stringify({ id: b.dataset.id }),
          });
          if (r.ok) {
            await loadCodes();
            await loadOverview();
          } else alert("تعذر تمديد الكود؛ قد يكون ملغى أو مستهلكًا.");
        }),
    );
  } catch {
    body.innerHTML = '<tr><td colspan="6" class="empty">تعذر التحميل أو لا توجد صلاحية.</td></tr>';
  }
}
$("#addQuestion").onclick = () => addQuestion();
const optionLetter = (i) => "أبجدهوزح"[i] || String(i + 1);
function addQuestion(q = {}) {
  const card = document.createElement("article");
  card.className = "question-card";
  card.dataset.qindex = quizIndex++;
  card.innerHTML = `<div class="question-row"><textarea class="prompt" maxlength="1000" placeholder="نص السؤال">${esc(q.prompt || "")}</textarea><div class="actions"><select class="qtype"><option value="single">اختيار واحد</option><option value="multi">اختيارات متعددة</option><option value="boolean">صح أو خطأ</option><option value="text">إجابة نصية</option></select><button class="btn ghost up" type="button">↑</button><button class="btn ghost down" type="button">↓</button><button class="btn danger remove" type="button">حذف</button></div></div><div class="qfields"></div>`;
  $("#questions").append(card);
  card.querySelector(".qtype").value = q.type || "single";
  card.querySelector(".qtype").onchange = () => fields(card);
  card.querySelector(".remove").onclick = () => card.remove();
  card.querySelector(".up").onclick = () => {
    if (card.previousElementSibling) card.parentElement.insertBefore(card, card.previousElementSibling);
  };
  card.querySelector(".down").onclick = () => {
    if (card.nextElementSibling) card.parentElement.insertBefore(card.nextElementSibling, card);
  };
  fields(card, q);
}
function fields(card, q = {}) {
  const type = card.querySelector(".qtype").value,
    root = card.querySelector(".qfields");
  if (type === "boolean") {
    root.innerHTML = '<label>الإجابة الصحيحة <select class="correct-bool"><option value="true">صح</option><option value="false">خطأ</option></select></label>';
    root.querySelector("select").value = String(q.correct !== false);
  } else if (type === "text") {
    root.innerHTML = `<label>الإجابات المقبولة، افصل بفاصلة<input class="input accepted" value="${esc((q.accepted || []).join(", "))}"></label>`;
  } else {
    const opts = q.options || ["", "", "", ""];
    root.innerHTML = `<div class="options-grid">${opts.map((v, i) => `<label class="field">الخيار ${optionLetter(i)}<input class="input option" value="${esc(v)}" maxlength="300"></label>`).join("")}</div><div>${type === "multi" ? "الإجابات الصحيحة" : "الإجابة الصحيحة"} ${opts.map((_, i) => `<label style="margin-left:10px"><input class="correct" type="${type === "multi" ? "checkbox" : "radio"}" name="correct-${card.dataset.qindex}" value="${i}" ${(q.correct || []).includes(i) ? "checked" : ""}>${optionLetter(i)}</label>`).join("")}</div>`;
  }
}
function questionsValue() {
  return $$("#questions .question-card").map((c) => {
    const type = c.querySelector(".qtype").value,
      q = { type, prompt: c.querySelector(".prompt").value.trim() };
    if (type === "boolean") q.correct = c.querySelector(".correct-bool").value === "true";
    else if (type === "text") {
      const a = c
        .querySelector(".accepted")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (a.length) q.accepted = a;
    } else {
      q.options = [...c.querySelectorAll(".option")].map((x) => x.value.trim());
      q.correct = [...c.querySelectorAll(".correct:checked")].map((x) => Number(x.value));
    }
    return q;
  });
}
addQuestion({
  prompt: "ما العنصر الذي يحدد العدد الذري؟",
  options: ["النيوترون", "البروتون", "الإلكترون", "الفوتون"],
  correct: [1],
});
$("#quizForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.currentTarget,
    d = new FormData(f),
    b = f.querySelector("[type=submit]"),
    feedback = $("#quizFeedback");
  b.disabled = true;
  try {
    const quizId = f.dataset.quizId;
    const endpoint = quizId ? "/api/studio/update-quiz" : "/api/studio/quizzes";
    const request = {
      title: d.get("title"),
      description: d.get("description"),
      durationSec: Number(d.get("duration")) * 60,
      passingScore: Number(d.get("passing")),
      maxAttempts: Number(d.get("attempts")),
      startsAt: d.get("startsAt") ? new Date(d.get("startsAt")).toISOString() : null,
      endsAt: d.get("endsAt") ? new Date(d.get("endsAt")).toISOString() : null,
      password: d.get("password"),
      completionMessage: d.get("completion"),
      published: d.has("published"),
      questions: questionsValue(),
    };
    if (quizId) request.quizId = quizId;
    const { r, p } = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(request),
    });
    if (!r.ok) throw Error(p.error);
    delete f.dataset.quizId;
    feedback.classList.remove("hidden");
    feedback.textContent = quizId ? "تم تحديث الاختبار." : "تم حفظ الاختبار. ستجده في قسم روابط الاختبارات والإحصائيات.";
    await loadQuizzes();
    await loadOverview();
    if (!quizId) go("links");
  } catch (x) {
    feedback.classList.remove("hidden");
    feedback.textContent = x.message === "active_attempts" ? "توجد محاولة نشطة؛ انتظر انتهاءها قبل تعديل الأسئلة." : x.message === "ai_daily_limit" ? "بلغت الحد اليومي البالغ 20 مسودة. حاول غدًا." : x.message === "insufficient_permissions" ? "صلاحيتك للعرض فقط." : "تعذر الحفظ؛ راجع الأسئلة والإعدادات.";
  } finally {
    b.disabled = false;
  }
};
async function loadQuizzes() {
  try {
    const { r, p } = await api("/api/studio/quizzes");
    if (!r.ok) throw Error();
    quizCatalog = p.quizzes;
    $("#quizList").innerHTML = quizCatalog.map((q) => `<article class="card card-pad"><b>${esc(q.title)}</b><p class="muted">${q.questionCount} سؤال · ${Math.ceil(q.durationSec / 60)} دقيقة · ${q.published ? "منشور" : "مسودة"}</p><div class="actions"><code dir="ltr">${esc(quizLink(q))}</code><button class="btn secondary copyquiz" data-slug="${esc(q.slug)}">نسخ الرابط</button><button class="btn secondary showqr" data-slug="${esc(q.slug)}">رمز QR</button><a class="btn secondary" href="${esc(quizLink(q))}" target="_blank" rel="noopener">معاينة</a>${role === "viewer" ? "" : `<button class="btn secondary editquiz" data-id="${esc(q.quizId)}">تعديل</button><button class="btn secondary togglequiz" data-id="${esc(q.quizId)}" data-published="${!q.published}">${q.published ? "إيقاف النشر" : "نشر"}</button>`}${["manager", "superadmin"].includes(role) ? `<button class="btn secondary responses" data-id="${esc(q.quizId)}">النتائج والتصحيح</button>` : ""}</div><div id="qr-${esc(q.quizId)}" class="quiz-qr hidden"></div><div id="review-${esc(q.quizId)}"></div></article>`).join("") || '<div class="card empty">لم تنشئ اختبارات بعد.</div>';
    $$(".copyquiz").forEach((x) => (x.onclick = () => navigator.clipboard.writeText(quizLink(x.dataset.slug))));
    $$(".editquiz").forEach((x) => (x.onclick = () => editQuiz(x.dataset.id)));
    $$(".togglequiz").forEach((x) => (x.onclick = () => toggleQuiz(x.dataset.id, x.dataset.published === "true")));
    $$(".responses").forEach((x) => (x.onclick = () => loadResponses(x.dataset.id)));
    $$(".showqr").forEach((x) => (x.onclick = () => loadQr(x.dataset.slug, x.closest("article"))));
  } catch {
    $("#quizList").innerHTML = '<div class="card empty">تعذر تحميل الاختبارات.</div>';
  }
}
async function loadQr(slug, card) {
  const target = card.querySelector(".quiz-qr");
  target.classList.remove("hidden");
  target.innerHTML = "جارٍ إنشاء الرمز…";
  try {
    const { r, p } = await api("/api/studio/qr?slug=" + encodeURIComponent(slug));
    if (!r.ok) throw Error();
    target.innerHTML = '<img alt="رمز QR للرابط الخاص" width=160 height=160 src="data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(p.svg))) + '"><small dir="ltr">' + esc(p.link) + "</small>";
  } catch {
    target.textContent = "تعذر إنشاء رمز QR.";
  }
}
function editQuiz(id) {
  const q = quizCatalog.find((x) => x.quizId === id);
  if (!q) return;
  go("quizzes");
  const f = $("#quizForm");
  for (const [k, v] of Object.entries({
    title: q.title,
    description: q.description || "",
    duration: Math.ceil(q.durationSec / 60),
    passing: q.passingScore,
    attempts: q.maxAttempts,
    completion: q.completionMessage || "",
  }))
    f.elements.namedItem(k).value = v;
  f.elements.namedItem("published").checked = q.published;
  for (const key of ["startsAt", "endsAt"]) f.elements.namedItem(key).value = q[key] ? new Date(new Date(q[key]).getTime() - new Date(q[key]).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  f.dataset.quizId = q.quizId;
  $("#questions").innerHTML = "";
  quizIndex = 0;
  q.questions.forEach((x) => addQuestion(x));
  $("#quizFeedback").classList.add("hidden");
  $("#pageTitle").textContent = "تعديل الاختبار";
}
async function toggleQuiz(quizId, published) {
  const { r } = await api("/api/studio/update-quiz", {
    method: "POST",
    body: JSON.stringify({ quizId, action: "publish", published }),
  });
  if (!r.ok) {
    alert("تعذر تغيير حالة النشر.");
    return;
  }
  await loadQuizzes();
  await loadOverview();
}
async function loadResponses(quizId) {
  const root = $("#review-" + quizId);
  root.innerHTML = '<div class="skeleton" style="margin-top:14px"></div>';
  try {
    const { r, p } = await api("/api/studio/responses?quizId=" + encodeURIComponent(quizId));
    if (!r.ok) throw Error();
    root.innerHTML = p.responses.map((x) => `<article class="question-card"><b>${esc(x.name)}</b> <span class="badge ${x.reviewStatus === "needs_review" ? "wait" : ""}">${x.reviewStatus === "needs_review" ? "بانتظار التصحيح" : x.reviewStatus === "graded" ? "تم التصحيح" : "مصحح آليًا"}</span><p class="muted">${new Date(x.completedAt).toLocaleString("ar-SA")} · ${Math.floor(x.durationSec / 60)}:${String(x.durationSec % 60).padStart(2, "0")}</p><div>${x.questions.map((q, i) => `<p><b>${esc(q.prompt)}</b><br><span>إجابة الطالب: ${esc(Array.isArray(x.answers[i]) ? x.answers[i].map((a) => q.options?.[a] || a).join("، ") : q.type === "boolean" ? (x.answers[i] ? "صح" : "خطأ") : x.answers[i])}</span>${q.type === "text" && Array.isArray(q.accepted) ? `<br><small>إجابة مقبولة: ${esc(q.accepted.join("، "))}</small>` : ""}</p>`).join("")}</div><label class="field">الدرجة من 100<input class="input grade-value" type="number" min="0" max="100" step="0.01" value="${x.score ?? ""}" placeholder="أدخل الدرجة"></label><button class="btn save-grade" data-id="${esc(x.id)}">حفظ التصحيح</button></article>`).join("") || '<div class="empty">لا توجد إجابات لهذا الاختبار.</div>';
    root.querySelectorAll(".save-grade").forEach(
      (button) =>
        (button.onclick = async () => {
          const score = button.parentElement.querySelector(".grade-value").value,
            { r } = await api("/api/studio/responses", {
              method: "POST",
              body: JSON.stringify({ responseId: button.dataset.id, score }),
            });
          if (!r.ok) {
            alert("تعذر حفظ الدرجة.");
            return;
          }
          button.textContent = "تم الحفظ ✓";
          button.disabled = true;
        }),
    );
  } catch {
    root.innerHTML = '<div class="empty">تعذر تحميل النتائج.</div>';
  }
}
$("#refreshQuizzes").onclick = loadQuizzes;
function rendered(html) {
  return html
    .replaceAll("{{student_name}}", "طالب متميز")
    .replaceAll("{{quiz_title}}", "عباقرة الكيمياء")
    .replaceAll("{{score}}", "9 / 10")
    .replaceAll("{{date}}", new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date()))
    .replaceAll("{{qr_code}}", '<img src="/images/competition-qr.svg" alt="رمز QR للمسابقة" loading="lazy">');
}
$("#generatePdf").onclick = async () => {
  const b = $("#generatePdf");
  b.disabled = true;
  $("#pdfStatus").textContent = "جارٍ إنشاء المسودة…";
  try {
    const { r, p } = await api("/api/studio/generate-template", {
      method: "POST",
      body: JSON.stringify({
        prompt: $("#pdfPrompt").value,
        documentType: $("#pdfType").value,
      }),
    });
    if (!r.ok) throw Error(p.error);
    draftHtml = p.html;
    $("#pdfPreview").innerHTML = rendered(draftHtml);
    $("#pdfStatus").textContent = "تم إنشاء المسودة. راجع المعاينة ثم احفظها أو صدّرها.";
  } catch (x) {
    $("#pdfStatus").textContent = x.message === "ai_not_configured" ? "فعّل AI Gateway في مشروع Vercel أو أضف AI_GATEWAY_API_KEY." : x.message === "ai_daily_limit" ? "بلغت الحد اليومي البالغ 20 مسودة. حاول غدًا." : "تعذر التوليد. تحقق من إعدادات AI Gateway.";
  } finally {
    b.disabled = false;
  }
};
$("#saveTemplate").onclick = async () => {
  if (!draftHtml) return ($("#pdfStatus").textContent = "أنشئ مسودة أولًا.");
  const title = prompt("اسم القالب");
  if (!title) return;
  try {
    const { r } = await api("/api/studio/templates", {
      method: "POST",
      body: JSON.stringify({
        title,
        documentType: $("#pdfType").value,
        prompt: $("#pdfPrompt").value,
        html: draftHtml,
      }),
    });
    if (!r.ok) throw Error();
    $("#pdfStatus").textContent = "حُفظ القالب.";
    await loadTemplates();
  } catch {
    $("#pdfStatus").textContent = "تعذر حفظ القالب أو صلاحيتك لا تسمح بذلك.";
  }
};
$("#printPdf").onclick = () => {
  const w = open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>نموذج PDF</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font:14px Arial,Tahoma,sans-serif}.paper{width:210mm;min-height:297mm;padding:20mm;margin:auto}.paper header{border-bottom:4px solid #4f46e5}.paper section{margin:12mm 0}</style><body>${rendered(draftHtml || $("#pdfPreview").innerHTML)}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
};
async function loadTemplates() {
  try {
    const { r, p } = await api("/api/studio/templates");
    if (!r.ok) throw Error();
    $("#templateList").innerHTML = p.templates.map((t) => `<article class="card card-pad"><b>${esc(t.title)}</b><button class="btn secondary use-template" data-id="${esc(t.id)}">معاينة</button></article>`).join("") || '<div class="card empty">لا توجد قوالب محفوظة.</div>';
    $$(".use-template").forEach(
      (b) =>
        (b.onclick = () => {
          const t = p.templates.find((x) => x.id === b.dataset.id);
          draftHtml = t.html;
          $("#pdfType").value = t.documentType;
          $("#pdfPreview").innerHTML = rendered(t.html);
        }),
    );
  } catch {
    $("#templateList").innerHTML = '<div class="card empty">تعذر تحميل القوالب.</div>';
  }
}
const savedTheme = localStorage.getItem("studio-theme") === "light" ? "light" : "dark";
document.documentElement.dataset.theme = savedTheme;
$("#themeToggle").textContent = savedTheme === "dark" ? "☼ الوضع الفاتح" : "☾ الوضع الداكن";
$("#themeToggle").onclick = () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("studio-theme", next);
  $("#themeToggle").textContent = next === "dark" ? "☼ الوضع الفاتح" : "☾ الوضع الداكن";
};
$("#accessCode").focus();
void init();
