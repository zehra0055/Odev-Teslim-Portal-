"use strict";

/**
 * ✅ ÖĞRETMEN PANEL JS (FULL BACKEND)
 * - Auth: token/role/user localStorage
 * - Classes: BACKEND (mine/create)
 * - Members: BACKEND (by class)
 * - Assignments: BACKEND (create/list by class)
 * - Submissions: BACKEND (list by class + review)
 */

// ========= AUTH GUARD =========
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");
let me = null;

try {
  me = JSON.parse(localStorage.getItem("user") || "null");
} catch {
  me = null;
}

if (!token || role !== "teacher" || !me) {
  window.location.replace("/Ogretmen/ogretmen-giris.html");
}

// ========= HELPERS =========
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return iso;
  }
}

function fmtOnlyDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("tr-TR");
  } catch {
    return iso;
  }
}

function setAlert(el, type, text) {
  if (!el) return;
  el.hidden = false;
  el.classList.remove("ok", "err");
  el.classList.add(type);
  el.textContent = text;
}

function clearAlert(el) {
  if (!el) return;
  el.hidden = true;
  el.classList.remove("ok", "err");
  el.textContent = "";
}

function pillForStatus(s) {
  if (s === "graded") return `<span class="pill ok">Notlandırıldı</span>`;
  return `<span class="pill warn">Bekliyor</span>`;
}

// ========= API =========
const API_BASE = ""; // aynı origin
async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  // GET isteklerinde Content-Type koymak bazen gereksiz; ama JSON göndereceksek koyalım
  const method = (options.method || "GET").toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;

  if (hasBody) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, method, headers });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = data?.message || `İstek başarısız: ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ========= DOM =========
const who = document.getElementById("who");
const logoutBtn = document.getElementById("logoutBtn");

const navBtns = document.querySelectorAll(".navbtn");
const views = {
  dashboard: document.getElementById("view-dashboard"),
  assignments: document.getElementById("view-assignments"),
  submissions: document.getElementById("view-submissions"),
  students: document.getElementById("view-students"),
};

const classSelect = document.getElementById("classSelect");
const activeClassChip = document.getElementById("activeClassChip");
const assignClassChip = document.getElementById("assignClassChip");
const subClassChip = document.getElementById("subClassChip");
const studClassChip = document.getElementById("studClassChip");

// KPIs
const kpiStudents = document.getElementById("kpiStudents");
const kpiAssignments = document.getElementById("kpiAssignments");
const kpiSubmissions = document.getElementById("kpiSubmissions");
const kpiPending = document.getElementById("kpiPending");

// Dashboard lists
const lastSubmissions = document.getElementById("lastSubmissions");
const emptyLast = document.getElementById("emptyLast");
const goSubmissions = document.getElementById("goSubmissions");

// Assignment forms
const quickAssignmentForm = document.getElementById("quickAssignmentForm");
const qaCourse = document.getElementById("qaCourse");
const qaDue = document.getElementById("qaDue");
const qaTitle = document.getElementById("qaTitle");
const qaDesc = document.getElementById("qaDesc");
const qaAlert = document.getElementById("qaAlert");

const assignmentForm = document.getElementById("assignmentForm");
const aCourse = document.getElementById("aCourse");
const aDue = document.getElementById("aDue");
const aTitle = document.getElementById("aTitle");
const aDesc = document.getElementById("aDesc");
const aAlert = document.getElementById("aAlert");

const assignmentList = document.getElementById("assignmentList");
const emptyAssignments = document.getElementById("emptyAssignments");

// Submissions
const submissionList = document.getElementById("submissionList");
const emptySubmissions = document.getElementById("emptySubmissions");
const filterCourse = document.getElementById("filterCourse");
const filterStatus = document.getElementById("filterStatus");

// Detail
const detailEmpty = document.getElementById("detailEmpty");
const detailBox = document.getElementById("detailBox");
const dTitle = document.getElementById("dTitle");
const dSub = document.getElementById("dSub");
const dStatus = document.getElementById("dStatus");
const dStudent = document.getElementById("dStudent");
const dCourse = document.getElementById("dCourse");
const dFile = document.getElementById("dFile");
const dDate = document.getElementById("dDate");
const gradeInput = document.getElementById("gradeInput");
const statusInput = document.getElementById("statusInput");
const feedbackInput = document.getElementById("feedbackInput");
const saveReviewBtn = document.getElementById("saveReviewBtn");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const reviewAlert = document.getElementById("reviewAlert");

// Students list
const studentList = document.getElementById("studentList");
const emptyStudents = document.getElementById("emptyStudents");

// Modals
const openCreateClass = document.getElementById("openCreateClass");
const openClassInfo = document.getElementById("openClassInfo");

const createClassModal = document.getElementById("createClassModal");
const createClassForm = document.getElementById("createClassForm");
const className = document.getElementById("className");
const classDesc = document.getElementById("classDesc");
const classCreateAlert = document.getElementById("classCreateAlert");

const classInfoModal = document.getElementById("classInfoModal");
const infoClassName = document.getElementById("infoClassName");
const infoClassCode = document.getElementById("infoClassCode");
const infoClassDesc = document.getElementById("infoClassDesc");
const copyClassCode = document.getElementById("copyClassCode");
const copyAlert = document.getElementById("copyAlert");

// ========= STATE =========
let activeClassId = null;
let selectedSubmissionId = null;

let classesCache = [];
let membersCache = [];
let assignmentsCache = [];
let submissionsCache = [];

// ========= DATA LAYER (BACKEND) =========
async function getClasses() {
  const data = await apiFetch(`/api/classes/mine?teacherId=${encodeURIComponent(me.id)}`);
  return Array.isArray(data?.classes) ? data.classes : [];
}

async function getMembersByClass(classId) {
  const data = await apiFetch(`/api/classes/members?classId=${encodeURIComponent(classId)}`);
  return Array.isArray(data?.members) ? data.members : [];
}

async function getAssignmentsByClass(classId) {
  const data = await apiFetch(`/api/assignments/byClass?classId=${encodeURIComponent(classId)}`);
  return Array.isArray(data?.assignments) ? data.assignments : [];
}

async function createAssignmentApi({ classId, course, title, desc, due }) {
  const body = {
    classId,
    teacherId: me.id,
    teacherName: me.name || "Öğretmen",
    course: (course || "").trim(),
    title: (title || "").trim(),
    desc: (desc || "").trim(),
    due: due ? new Date(due).toISOString() : "",
    clientId: uid("ass"), // idyi backend üretse bile debug için iyi
  };

  const data = await apiFetch(`/api/assignments/create`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return data?.assignment || null;
}

async function getSubmissionsByClass(classId) {
  const data = await apiFetch(`/api/submissions/byClass?classId=${encodeURIComponent(classId)}`);
  return Array.isArray(data?.submissions) ? data.submissions : [];
}

async function reviewSubmissionApi({ submissionId, grade, status, feedback }) {
  const body = {
    submissionId,
    grade, // "" veya sayı
    status,
    feedback,
  };

  const data = await apiFetch(`/api/submissions/review`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return data?.submission || null;
}

// ========= UI / NAV =========
function setView(name) {
  navBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === name));
}

function setActiveClassChip() {
  const cls = classesCache.find((c) => c.id === activeClassId);
  const label = cls ? `Sınıf: ${cls.name}` : "Sınıf: —";
  activeClassChip.textContent = label;
  assignClassChip.textContent = label;
  subClassChip.textContent = label;
  studClassChip.textContent = label;
}

async function fillClassSelect() {
  classSelect.innerHTML = "";

  try {
    classesCache = (await getClasses()).sort((a, b) =>
      (a.createdAt || "").localeCompare(b.createdAt || "")
    );
  } catch (err) {
    console.error(err);
    classesCache = [];
  }

  if (!classesCache.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Önce sınıf oluştur";
    classSelect.appendChild(opt);
    classSelect.disabled = true;
    activeClassId = null;
    setActiveClassChip();
    return;
  }

  classSelect.disabled = false;

  classesCache.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.code})`;
    classSelect.appendChild(opt);
  });

  if (!activeClassId || !classesCache.some((c) => c.id === activeClassId)) {
    activeClassId = classesCache[0].id;
  }

  classSelect.value = activeClassId;
  setActiveClassChip();
}

function requireActiveClass() {
  if (!activeClassId) {
    alert("Önce bir sınıf oluşturmalısın.");
    return false;
  }
  return true;
}

// ========= RENDER =========
function renderKPIs() {
  if (!activeClassId) {
    kpiStudents.textContent = "0";
    kpiAssignments.textContent = "0";
    kpiSubmissions.textContent = "0";
    kpiPending.textContent = "0";
    return;
  }

  const members = membersCache;
  const as = assignmentsCache;
  const subs = submissionsCache;
  const pending = subs.filter((s) => s.status !== "graded").length;

  kpiStudents.textContent = members.length.toLocaleString("tr-TR");
  kpiAssignments.textContent = as.length.toLocaleString("tr-TR");
  kpiSubmissions.textContent = subs.length.toLocaleString("tr-TR");
  kpiPending.textContent = pending.toLocaleString("tr-TR");
}

function renderAssignmentList() {
  assignmentList.innerHTML = "";

  if (!activeClassId) {
    emptyAssignments.hidden = false;
    return;
  }

  const as = (assignmentsCache || []).slice().sort((x, y) =>
    (y.createdAt || "").localeCompare(x.createdAt || "")
  );

  if (!as.length) {
    emptyAssignments.hidden = false;
    return;
  }

  emptyAssignments.hidden = true;

  as.forEach((a) => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${a.course} — ${a.title}</div>
        <div class="subline">
          Son: ${a.due ? fmtOnlyDate(a.due) : "—"} • ${
      a.desc ? a.desc.slice(0, 72) + (a.desc.length > 72 ? "…" : "") : ""
    }
        </div>
      </div>
      <span class="pill">Ödev</span>
    `;
    assignmentList.appendChild(el);
  });
}

function renderLastSubmissions() {
  lastSubmissions.innerHTML = "";

  if (!activeClassId) {
    emptyLast.hidden = false;
    return;
  }

  const subs = (submissionsCache || [])
    .slice()
    .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))
    .slice(0, 4);

  if (!subs.length) {
    emptyLast.hidden = false;
    return;
  }

  emptyLast.hidden = true;

  subs.forEach((s) => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${s.studentName} • ${s.course}</div>
        <div class="subline">${s.fileName} • ${fmtDate(s.submittedAt)}</div>
      </div>
      ${pillForStatus(s.status)}
    `;
    el.addEventListener("click", () => {
      setView("submissions");
      selectSubmission(s.id);
    });
    lastSubmissions.appendChild(el);
  });
}

function applySubmissionFilters(list) {
  const c = (filterCourse.value || "").trim().toLowerCase();
  const st = filterStatus.value;

  return list.filter((s) => {
    const courseOk = !c || (s.course || "").toLowerCase().includes(c);
    const statusOk = st === "all" ? true : s.status === st;
    return courseOk && statusOk;
  });
}

function renderSubmissionList() {
  submissionList.innerHTML = "";

  if (!activeClassId) {
    emptySubmissions.hidden = false;
    return;
  }

  const all = (submissionsCache || [])
    .slice()
    .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));

  const subs = applySubmissionFilters(all);

  if (!subs.length) {
    emptySubmissions.hidden = false;
    return;
  }

  emptySubmissions.hidden = true;

  subs.forEach((s) => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${s.studentName} • ${s.course}</div>
        <div class="subline">${s.title} • ${s.fileName}</div>
        <div class="subline">Teslim: ${fmtDate(s.submittedAt)}</div>
      </div>
      ${pillForStatus(s.status)}
    `;
    el.addEventListener("click", () => selectSubmission(s.id));
    submissionList.appendChild(el);
  });
}

function renderStudentList() {
  studentList.innerHTML = "";

  if (!activeClassId) {
    emptyStudents.hidden = false;
    return;
  }

  const members = (membersCache || [])
    .slice()
    .sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));

  if (!members.length) {
    emptyStudents.hidden = false;
    return;
  }

  emptyStudents.hidden = true;

  members.forEach((m) => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.style.cursor = "default";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${m.studentName}</div>
        <div class="subline">Katılım: ${fmtDate(m.joinedAt)}</div>
      </div>
      <span class="pill">Üye</span>
    `;
    studentList.appendChild(el);
  });
}

// ========= DETAIL =========
function clearSelection() {
  selectedSubmissionId = null;
  detailBox.hidden = true;
  detailEmpty.hidden = false;
  clearAlert(reviewAlert);
}

function selectSubmission(id) {
  if (!activeClassId) return;

  const s = (submissionsCache || []).find((x) => x.id === id);
  if (!s) return;

  selectedSubmissionId = id;

  detailEmpty.hidden = true;
  detailBox.hidden = false;

  dTitle.textContent = `${s.course} — ${s.title}`;
  dSub.textContent = `${s.fileName}`;
  dStudent.textContent = s.studentName;
  dCourse.textContent = s.course;
  dFile.textContent = s.fileName;
  dDate.textContent = fmtDate(s.submittedAt);

  if (s.status === "graded") {
    dStatus.textContent = "Notlandırıldı";
    dStatus.className = "pill ok";
  } else {
    dStatus.textContent = "Bekliyor";
    dStatus.className = "pill warn";
  }

  gradeInput.value = (s.grade ?? "") === "" ? "" : String(s.grade);
  statusInput.value = s.status || "pending";
  feedbackInput.value = s.feedback || "";

  clearAlert(reviewAlert);
}

async function saveReview() {
  if (!activeClassId || !selectedSubmissionId) return;

  clearAlert(reviewAlert);

  const gradeRaw = gradeInput.value.trim();
  const status = statusInput.value;
  const feedback = feedbackInput.value.trim();

  let grade = "";
  if (gradeRaw !== "") {
    const n = Number(gradeRaw);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      setAlert(reviewAlert, "err", "Not 0-100 arasında olmalı.");
      return;
    }
    grade = Math.round(n);
  }

  try {
    await reviewSubmissionApi({
      submissionId: selectedSubmissionId,
      grade,
      status,
      feedback,
    });

    setAlert(reviewAlert, "ok", "Değerlendirme kaydedildi.");

    // cache refresh
    await refreshAll(true);
    selectSubmission(selectedSubmissionId);
  } catch (err) {
    console.error(err);
    setAlert(reviewAlert, "err", err.message || "Kaydedilemedi.");
  }
}

// ========= MODALS =========
function openModal(modalEl) {
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden", "false");
}
function closeModal(modalEl) {
  modalEl.classList.remove("open");
  modalEl.setAttribute("aria-hidden", "true");
}
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-close");
    const el = document.getElementById(id);
    if (el) closeModal(el);
  });
});
[createClassModal, classInfoModal].forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) closeModal(m);
  });
});

// ========= CLASS ACTIONS =========
openCreateClass?.addEventListener("click", () => {
  clearAlert(classCreateAlert);
  className.value = "";
  classDesc.value = "";
  openModal(createClassModal);
});

createClassForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAlert(classCreateAlert);

  const name = className.value.trim();
  const desc = classDesc.value.trim();

  if (!name) {
    setAlert(classCreateAlert, "err", "Sınıf adı zorunlu.");
    return;
  }

  try {
    const data = await apiFetch("/api/classes/create", {
      method: "POST",
      body: JSON.stringify({
        name,
        desc,
        teacherId: me.id,
        teacherName: me.name || "Öğretmen",
      }),
    });

    const newClass = data?.class;
    if (!newClass?.id) {
      setAlert(classCreateAlert, "err", "Sınıf oluşturuldu ama veri dönmedi.");
      return;
    }

    setAlert(classCreateAlert, "ok", `Sınıf oluşturuldu. Kod: ${newClass.code}`);

    await fillClassSelect();
    activeClassId = newClass.id;
    classSelect.value = activeClassId;
    setActiveClassChip();

    setTimeout(() => closeModal(createClassModal), 600);
    await refreshAll(true);
  } catch (err) {
    console.error(err);
    setAlert(classCreateAlert, "err", err.message || "Sınıf oluşturulamadı.");
  }
});

openClassInfo?.addEventListener("click", () => {
  if (!requireActiveClass()) return;

  const cls = classesCache.find((c) => c.id === activeClassId);
  if (!cls) return;

  infoClassName.textContent = cls.name;
  infoClassCode.textContent = cls.code;
  infoClassDesc.textContent = cls.desc || "—";
  clearAlert(copyAlert);

  openModal(classInfoModal);
});

copyClassCode?.addEventListener("click", async () => {
  const code = infoClassCode.textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    setAlert(copyAlert, "ok", "Kod kopyalandı.");
  } catch {
    setAlert(copyAlert, "err", "Kopyalanamadı. Kodu manuel kopyala.");
  }
});

// ========= ASSIGNMENT CREATE =========
async function onCreateAssignment(course, title, desc, due, alertEl, resetFn) {
  clearAlert(alertEl);
  if (!requireActiveClass()) return;

  if (!course.trim() || !title.trim() || !due) {
    setAlert(alertEl, "err", "Ders, başlık ve son tarih zorunlu.");
    return;
  }

  try {
    await createAssignmentApi({
      classId: activeClassId,
      course,
      title,
      desc,
      due,
    });

    setAlert(alertEl, "ok", "Ödev oluşturuldu.");
    resetFn?.();

    await refreshAll(true);
  } catch (err) {
    console.error(err);
    setAlert(alertEl, "err", err.message || "Ödev oluşturulamadı.");
  }
}

quickAssignmentForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  onCreateAssignment(
    qaCourse.value,
    qaTitle.value,
    qaDesc.value,
    qaDue.value,
    qaAlert,
    () => {
      qaCourse.value = "";
      qaTitle.value = "";
      qaDesc.value = "";
      qaDue.value = "";
    }
  );
});

assignmentForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  onCreateAssignment(
    aCourse.value,
    aTitle.value,
    aDesc.value,
    aDue.value,
    aAlert,
    () => {
      aCourse.value = "";
      aTitle.value = "";
      aDesc.value = "";
      aDue.value = "";
    }
  );
});

// ========= EVENTS =========
who.textContent = me?.name ? `👨‍🏫 ${me.name}` : "👨‍🏫 Öğretmen";

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");
  window.location.replace("/Ogretmen/ogretmen-giris.html");
});

navBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

classSelect?.addEventListener("change", async () => {
  activeClassId = classSelect.value || null;
  setActiveClassChip();
  clearSelection();
  await refreshAll(true);
});

goSubmissions?.addEventListener("click", () => setView("submissions"));

filterCourse?.addEventListener("input", () => renderSubmissionList());
filterStatus?.addEventListener("change", () => renderSubmissionList());

clearSelectionBtn?.addEventListener("click", clearSelection);
saveReviewBtn?.addEventListener("click", saveReview);

// ========= REFRESH =========
async function refreshAll(fetchFresh = false) {
  if (!activeClassId) {
    membersCache = [];
    assignmentsCache = [];
    submissionsCache = [];
    setActiveClassChip();
    renderKPIs();
    renderAssignmentList();
    renderSubmissionList();
    renderLastSubmissions();
    renderStudentList();
    return;
  }

  setActiveClassChip();

  if (fetchFresh) {
    // paralel çek
    const [members, assignments, submissions] = await Promise.allSettled([
      getMembersByClass(activeClassId),
      getAssignmentsByClass(activeClassId),
      getSubmissionsByClass(activeClassId),
    ]);

    membersCache = members.status === "fulfilled" ? members.value : [];
    assignmentsCache = assignments.status === "fulfilled" ? assignments.value : [];
    submissionsCache = submissions.status === "fulfilled" ? submissions.value : [];
  }

  renderKPIs();
  renderAssignmentList();
  renderSubmissionList();
  renderLastSubmissions();
  renderStudentList();
}

// ========= BOOT =========
(async function boot() {
  try {
    await fillClassSelect();
  } catch (e) {
    console.error(e);
  }

  setActiveClassChip();
  setView("dashboard");
  clearSelection();

  // İlk yüklemede aktif class varsa dataları çek
  await refreshAll(true);
})();
