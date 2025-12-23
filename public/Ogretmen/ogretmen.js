"use strict";

/**
 * ✅ FIX: Sınıflar localStorage yerine BACKEND'de tutuluyor.
 * Böylece öğrenci kodla arayınca sınıf görünecek.
 *
 * Gerekli endpointler:
 *  - POST /api/classes/create   body: { name, desc, teacherId, teacherName }
 *  - GET  /api/classes/mine?teacherId=...
 *
 * Diğer datalar (ödev/teslim/üyeler) şimdilik localStorage'da kaldı.
 * İstersen onları da API’ye taşırız.
 */

// ========= STORAGE KEYS =========
const KEY_CLASS_MEMBERS = "otp_class_members";   // {id, classId, studentId, studentName, joinedAt}
const KEY_ASSIGNMENTS = "otp_assignments";       // {id, classId, teacherId, course, title, desc, due, createdAt}
const KEY_SUBMISSIONS = "otp_submissions";       // {id, classId, assignmentId, teacherId, studentId, studentName, course, title, fileName, submittedAt, status, grade, feedback}

// ========= helpers =========
function load(key, fallback){
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function uid(prefix="id"){
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function fmtDate(iso){
  try { return new Date(iso).toLocaleString("tr-TR"); } catch { return iso; }
}
function fmtOnlyDate(iso){
  try { return new Date(iso).toLocaleDateString("tr-TR"); } catch { return iso; }
}

function setAlert(el, type, text){
  el.hidden = false;
  el.classList.remove("ok","err");
  el.classList.add(type);
  el.textContent = text;
}
function clearAlert(el){
  el.hidden = true;
  el.classList.remove("ok","err");
  el.textContent = "";
}

function pillForStatus(s){
  if (s === "graded") return `<span class="pill ok">Notlandırıldı</span>`;
  return `<span class="pill warn">Bekliyor</span>`;
}

// ========= auth guard (NEW SYSTEM) =========
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

// ========= API =========
const API_BASE = ""; // aynı origin
async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  // token varsa gönder (server kontrol etmese bile sorun değil)
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }

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

// state
let activeClassId = null;
let selectedSubmissionId = null;

// ✅ sınıfları artık API'den çekiyoruz (cache)
let classesCache = [];

// ========= DATA LAYER =========
async function getClasses(){
  // teacher'ın sınıflarını backend'den çek
  const data = await apiFetch(`/api/classes/mine?teacherId=${encodeURIComponent(me.id)}`);
  const list = Array.isArray(data?.classes) ? data.classes : [];
  return list;
}

function getMembersByClass(classId){
  const all = load(KEY_CLASS_MEMBERS, []);
  return all.filter(m => m.classId === classId);
}

function getAssignmentsByClass(classId){
  const all = load(KEY_ASSIGNMENTS, []);
  return all.filter(a => a.classId === classId && a.teacherId === me.id);
}
function saveAssignments(listForTeacher){
  const all = load(KEY_ASSIGNMENTS, []);
  const rest = all.filter(a => a.teacherId !== me.id);
  save(KEY_ASSIGNMENTS, [...listForTeacher, ...rest]);
}

function getSubmissionsByClass(classId){
  const all = load(KEY_SUBMISSIONS, []);
  return all.filter(s => s.classId === classId && s.teacherId === me.id);
}
function saveSubmissions(listForTeacher){
  const all = load(KEY_SUBMISSIONS, []);
  const rest = all.filter(s => s.teacherId !== me.id);
  save(KEY_SUBMISSIONS, [...listForTeacher, ...rest]);
}

// ========= UI / NAV =========
function setView(name){
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === name));
}

function setActiveClassChip(){
  const cls = classesCache.find(c => c.id === activeClassId);
  const label = cls ? `Sınıf: ${cls.name}` : "Sınıf: —";
  activeClassChip.textContent = label;
  assignClassChip.textContent = label;
  subClassChip.textContent = label;
  studClassChip.textContent = label;
}

async function fillClassSelect(){
  classSelect.innerHTML = "";
  try {
    classesCache = (await getClasses()).sort((a,b)=> (a.createdAt||"").localeCompare(b.createdAt||""));
  } catch (err) {
    classesCache = [];
    console.error(err);
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
  classesCache.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.code})`;
    classSelect.appendChild(opt);
  });

  if (!activeClassId || !classesCache.some(c => c.id === activeClassId)) {
    activeClassId = classesCache[0].id;
  }
  classSelect.value = activeClassId;
  setActiveClassChip();
}

function requireActiveClass(){
  if (!activeClassId) {
    alert("Önce bir sınıf oluşturmalısın.");
    return false;
  }
  return true;
}

// ========= RENDER =========
function renderKPIs(){
  if (!activeClassId) {
    kpiStudents.textContent = "0";
    kpiAssignments.textContent = "0";
    kpiSubmissions.textContent = "0";
    kpiPending.textContent = "0";
    return;
  }

  const members = getMembersByClass(activeClassId);
  const as = getAssignmentsByClass(activeClassId);
  const subs = getSubmissionsByClass(activeClassId);
  const pending = subs.filter(s => s.status !== "graded").length;

  kpiStudents.textContent = members.length.toLocaleString("tr-TR");
  kpiAssignments.textContent = as.length.toLocaleString("tr-TR");
  kpiSubmissions.textContent = subs.length.toLocaleString("tr-TR");
  kpiPending.textContent = pending.toLocaleString("tr-TR");
}

function renderAssignmentList(){
  assignmentList.innerHTML = "";
  if (!activeClassId) {
    emptyAssignments.hidden = false;
    return;
  }

  const as = getAssignmentsByClass(activeClassId)
    .sort((x,y)=> (y.createdAt||"").localeCompare(x.createdAt||""));

  if (!as.length) {
    emptyAssignments.hidden = false;
    return;
  }
  emptyAssignments.hidden = true;

  as.forEach(a => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${a.course} — ${a.title}</div>
        <div class="subline">Son: ${a.due ? fmtOnlyDate(a.due) : "—"} • ${a.desc ? a.desc.slice(0, 72) + (a.desc.length>72 ? "…" : "") : ""}</div>
      </div>
      <span class="pill">Ödev</span>
    `;
    assignmentList.appendChild(el);
  });
}

function renderLastSubmissions(){
  lastSubmissions.innerHTML = "";
  if (!activeClassId) {
    emptyLast.hidden = false;
    return;
  }

  const subs = getSubmissionsByClass(activeClassId)
    .sort((a,b)=> (b.submittedAt||"").localeCompare(a.submittedAt||""))
    .slice(0, 4);

  if (!subs.length) {
    emptyLast.hidden = false;
    return;
  }
  emptyLast.hidden = true;

  subs.forEach(s => {
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

function applySubmissionFilters(list){
  const c = (filterCourse.value || "").trim().toLowerCase();
  const st = filterStatus.value;

  return list.filter(s => {
    const courseOk = !c || (s.course || "").toLowerCase().includes(c);
    const statusOk = st === "all" ? true : (s.status === st);
    return courseOk && statusOk;
  });
}

function renderSubmissionList(){
  submissionList.innerHTML = "";
  if (!activeClassId) {
    emptySubmissions.hidden = false;
    return;
  }

  const all = getSubmissionsByClass(activeClassId)
    .sort((a,b)=> (b.submittedAt||"").localeCompare(a.submittedAt||""));
  const subs = applySubmissionFilters(all);

  if (!subs.length) {
    emptySubmissions.hidden = false;
    return;
  }
  emptySubmissions.hidden = true;

  subs.forEach(s => {
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

function renderStudentList(){
  studentList.innerHTML = "";
  if (!activeClassId) {
    emptyStudents.hidden = false;
    return;
  }

  const members = getMembersByClass(activeClassId)
    .sort((a,b)=> (a.studentName||"").localeCompare(b.studentName||""));

  if (!members.length) {
    emptyStudents.hidden = false;
    return;
  }
  emptyStudents.hidden = true;

  members.forEach(m => {
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
function clearSelection(){
  selectedSubmissionId = null;
  detailBox.hidden = true;
  detailEmpty.hidden = false;
  clearAlert(reviewAlert);
}

function selectSubmission(id){
  if (!activeClassId) return;
  const subs = getSubmissionsByClass(activeClassId);
  const s = subs.find(x => x.id === id);
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

function saveReview(){
  if (!activeClassId || !selectedSubmissionId) return;

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

  const allTeacherSubs = load(KEY_SUBMISSIONS, []).filter(s => s.teacherId === me.id);
  const idx = allTeacherSubs.findIndex(x => x.id === selectedSubmissionId);
  if (idx === -1) return;

  allTeacherSubs[idx] = { ...allTeacherSubs[idx], grade, status, feedback };
  saveSubmissions(allTeacherSubs);

  setAlert(reviewAlert, "ok", "Değerlendirme kaydedildi.");
  refreshAll();
  selectSubmission(selectedSubmissionId);
}

// ========= CREATE ASSIGNMENT =========
function createAssignment(course, title, desc, due){
  const allTeacherAssignments = load(KEY_ASSIGNMENTS, []).filter(a => a.teacherId === me.id);

  const item = {
    id: uid("ass"),
    classId: activeClassId,
    teacherId: me.id,
    course: course.trim(),
    title: title.trim(),
    desc: (desc || "").trim(),
    due: due ? new Date(due).toISOString() : "",
    createdAt: new Date().toISOString()
  };

  allTeacherAssignments.unshift(item);
  saveAssignments(allTeacherAssignments);
}

// ========= CLASS MODALS =========
function openModal(modalEl){
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden","false");
}
function closeModal(modalEl){
  modalEl.classList.remove("open");
  modalEl.setAttribute("aria-hidden","true");
}
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-close");
    const el = document.getElementById(id);
    if (el) closeModal(el);
  });
});
[createClassModal, classInfoModal].forEach(m => {
  m.addEventListener("click", (e) => { if (e.target === m) closeModal(m); });
});

// ========= CLASS ACTIONS =========
openCreateClass.addEventListener("click", () => {
  clearAlert(classCreateAlert);
  className.value = "";
  classDesc.value = "";
  openModal(createClassModal);
});

createClassForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAlert(classCreateAlert);

  const name = className.value.trim();
  const desc = classDesc.value.trim();

  if (!name) {
    setAlert(classCreateAlert, "err", "Sınıf adı zorunlu.");
    return;
  }

  try {
    // ✅ backend'e kaydet (öğrenci buradan görecek)
    const data = await apiFetch("/api/classes/create", {
      method: "POST",
      body: JSON.stringify({
        name,
        desc,
        teacherId: me.id,
        teacherName: me.name || "Öğretmen"
      })
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
    refreshAll();
  } catch (err) {
    console.error(err);
    setAlert(classCreateAlert, "err", err.message || "Sınıf oluşturulamadı.");
  }
});

openClassInfo.addEventListener("click", () => {
  if (!requireActiveClass()) return;

  const cls = classesCache.find(c => c.id === activeClassId);
  if (!cls) return;

  infoClassName.textContent = cls.name;
  infoClassCode.textContent = cls.code;
  infoClassDesc.textContent = cls.desc || "—";
  clearAlert(copyAlert);

  openModal(classInfoModal);
});

copyClassCode.addEventListener("click", async () => {
  const code = infoClassCode.textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    setAlert(copyAlert, "ok", "Kod kopyalandı.");
  } catch {
    setAlert(copyAlert, "err", "Kopyalanamadı. Kodu manuel kopyala.");
  }
});

// ========= EVENTS =========
who.textContent = me?.name ? `👨‍🏫 ${me.name}` : "👨‍🏫 Öğretmen";

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");
  window.location.replace("/Ogretmen/ogretmen-giris.html");
});

navBtns.forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

classSelect.addEventListener("change", () => {
  activeClassId = classSelect.value || null;
  setActiveClassChip();
  clearSelection();
  refreshAll();
});

goSubmissions.addEventListener("click", () => setView("submissions"));

filterCourse.addEventListener("input", () => renderSubmissionList());
filterStatus.addEventListener("change", () => renderSubmissionList());

clearSelectionBtn.addEventListener("click", clearSelection);
saveReviewBtn.addEventListener("click", saveReview);

quickAssignmentForm.addEventListener("submit", (e) => {
  e.preventDefault();
  clearAlert(qaAlert);
  if (!requireActiveClass()) return;

  const course = qaCourse.value;
  const title = qaTitle.value;
  const desc = qaDesc.value;
  const due = qaDue.value;

  if (!course.trim() || !title.trim() || !due) {
    setAlert(qaAlert, "err", "Ders, başlık ve son tarih zorunlu.");
    return;
  }

  createAssignment(course, title, desc, due);
  setAlert(qaAlert, "ok", "Ödev oluşturuldu.");

  qaCourse.value = "";
  qaTitle.value = "";
  qaDesc.value = "";
  qaDue.value = "";

  refreshAll();
});

assignmentForm.addEventListener("submit", (e) => {
  e.preventDefault();
  clearAlert(aAlert);
  if (!requireActiveClass()) return;

  const course = aCourse.value;
  const title = aTitle.value;
  const desc = aDesc.value;
  const due = aDue.value;

  if (!course.trim() || !title.trim() || !due) {
    setAlert(aAlert, "err", "Ders, başlık ve son tarih zorunlu.");
    return;
  }

  createAssignment(course, title, desc, due);
  setAlert(aAlert, "ok", "Ödev kaydedildi.");

  aCourse.value = "";
  aTitle.value = "";
  aDesc.value = "";
  aDue.value = "";

  refreshAll();
});

// ========= DEMO: seed teslim (istersen kaldırırız) =========
function seedDemoIfEmpty(){
  if (!activeClassId) return;

  const subs = getSubmissionsByClass(activeClassId);
  if (subs.length) return;

  const as = getAssignmentsByClass(activeClassId);
  let aId = as[0]?.id;

  if (!aId) {
    const allTeacherAssignments = load(KEY_ASSIGNMENTS, []).filter(a => a.teacherId === me.id);
    const demoA = {
      id: uid("ass"),
      classId: activeClassId,
      teacherId: me.id,
      course: "Matematik",
      title: "Kareler ve Dikdörtgenler",
      desc: "Soruları çöz, PDF yükle.",
      due: new Date(Date.now() + 3*86400000).toISOString(),
      createdAt: new Date().toISOString()
    };
    allTeacherAssignments.unshift(demoA);
    saveAssignments(allTeacherAssignments);
    aId = demoA.id;
  }

  const demoSubs = load(KEY_SUBMISSIONS, []).filter(s => s.teacherId === me.id);
  demoSubs.unshift(
    {
      id: uid("sub"),
      classId: activeClassId,
      assignmentId: aId,
      teacherId: me.id,
      studentId: "demo_st_1",
      studentName: "Ali Yılmaz",
      course: "Matematik",
      title: "Kareler ve Dikdörtgenler",
      fileName: "AliYilmaz_Mat_Odev1.pdf",
      submittedAt: new Date().toISOString(),
      status: "pending",
      grade: "",
      feedback: ""
    },
    {
      id: uid("sub"),
      classId: activeClassId,
      assignmentId: aId,
      teacherId: me.id,
      studentId: "demo_st_2",
      studentName: "Ayşe Demir",
      course: "Matematik",
      title: "Kareler ve Dikdörtgenler",
      fileName: "AyseDemir_Mat_Odev1.pdf",
      submittedAt: new Date(Date.now()-3600*1000).toISOString(),
      status: "graded",
      grade: 92,
      feedback: "Gayet iyi. 3. soruda çözümü biraz daha açıklayabilirsin."
    }
  );

  saveSubmissions(demoSubs);
}

// ========= REFRESH =========
function refreshAll(){
  setActiveClassChip();
  renderKPIs();
  renderAssignmentList();
  renderSubmissionList();
  renderLastSubmissions();
  renderStudentList();
}

// ========= BOOT =========
(async function boot(){
  try {
    await fillClassSelect();
  } catch (e) {
    console.error(e);
  }
  setActiveClassChip();
  setView("dashboard");
  clearSelection();

  seedDemoIfEmpty();
  refreshAll();
})();
