"use strict";

/**
 * ÖĞRENCİ PANEL JS (NEW AUTH)
 * - Auth: localStorage -> token, role, user
 * - Data: localStorage -> otp_classes, otp_class_members, otp_assignments, otp_submissions
 */

// ========= STORAGE KEYS =========
const KEY_CLASSES = "otp_classes";               // {id, teacherId, name, desc, code, createdAt}
const KEY_CLASS_MEMBERS = "otp_class_members";   // {id, classId, studentId, studentName, joinedAt}
const KEY_ASSIGNMENTS = "otp_assignments";       // {id, classId, teacherId, course, title, desc, due, createdAt}
const KEY_SUBMISSIONS = "otp_submissions";       // {id, classId, assignmentId, teacherId, studentId, studentName, course, title, fileName, studentNote, submittedAt, status, grade, feedback}

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
  if (!el) return;
  el.hidden = false;
  el.classList.remove("ok","err");
  el.classList.add(type);
  el.textContent = text;
}
function clearAlert(el){
  if (!el) return;
  el.hidden = true;
  el.classList.remove("ok","err");
  el.textContent = "";
}
function pillForStatus(s){
  if (s === "graded") return `<span class="pill ok">Notlandırıldı</span>`;
  return `<span class="pill warn">Bekliyor</span>`;
}

// ========= auth guard (NEW) =========
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");
let me = null;

try {
  me = JSON.parse(localStorage.getItem("user") || "null");
} catch {
  me = null;
}

if (!token || role !== "student" || !me) {
  window.location.replace("/Ogrenci/ogrenci-giris.html");
}

// ========= DOM =========
const who = document.getElementById("who");
const logoutBtn = document.getElementById("logoutBtn");

const navBtns = document.querySelectorAll(".navbtn");
const views = {
  dashboard: document.getElementById("view-dashboard"),
  assignments: document.getElementById("view-assignments"),
  submit: document.getElementById("view-submit"),
  history: document.getElementById("view-history"),
};

const classSelect = document.getElementById("classSelect");
const activeClassChip = document.getElementById("activeClassChip");
const assClassChip = document.getElementById("assClassChip");
const subClassChip = document.getElementById("subClassChip");
const histClassChip = document.getElementById("histClassChip");

// KPIs
const kpiMyClasses = document.getElementById("kpiMyClasses");
const kpiActiveAssignments = document.getElementById("kpiActiveAssignments");
const kpiMySubmissions = document.getElementById("kpiMySubmissions");
const kpiGraded = document.getElementById("kpiGraded");

// Dashboard
const upcomingList = document.getElementById("upcomingList");
const emptyUpcoming = document.getElementById("emptyUpcoming");
const myLastSubs = document.getElementById("myLastSubs");
const emptyMyLast = document.getElementById("emptyMyLast");
const goAssignments = document.getElementById("goAssignments");
const goHistory = document.getElementById("goHistory");

// Assignments view
const assignmentList = document.getElementById("assignmentList");
const emptyAssignments = document.getElementById("emptyAssignments");

// Submit view
const assignmentSelect = document.getElementById("assignmentSelect");
const emptyAssignSelect = document.getElementById("emptyAssignSelect");
const submitForm = document.getElementById("submitForm");
const fileName = document.getElementById("fileName");
const studentNote = document.getElementById("studentNote");
const submitAlert = document.getElementById("submitAlert");

// History view
const filterCourse = document.getElementById("filterCourse");
const filterStatus = document.getElementById("filterStatus");
const historyList = document.getElementById("historyList");
const emptyHistory = document.getElementById("emptyHistory");

// Detail
const detailEmpty = document.getElementById("detailEmpty");
const detailBox = document.getElementById("detailBox");
const dTitle = document.getElementById("dTitle");
const dSub = document.getElementById("dSub");
const dStatus = document.getElementById("dStatus");
const dFile = document.getElementById("dFile");
const dDate = document.getElementById("dDate");
const dGrade = document.getElementById("dGrade");
const dFeedback = document.getElementById("dFeedback");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");

// Join modal
const openJoin = document.getElementById("openJoin");
const joinModal = document.getElementById("joinModal");
const joinForm = document.getElementById("joinForm");
const classCode = document.getElementById("classCode");
const joinAlert = document.getElementById("joinAlert");

// Find modal
const openFind = document.getElementById("openFind");
const findModal = document.getElementById("findModal");
const teacherQuery = document.getElementById("teacherQuery");
const searchTeacherBtn = document.getElementById("searchTeacherBtn");
const foundClassList = document.getElementById("foundClassList");
const emptyFound = document.getElementById("emptyFound");
const findAlert = document.getElementById("findAlert");

// state
let activeClassId = null;
let selectedSubmissionId = null;

// ========= DATA =========
function allClasses(){
  return load(KEY_CLASSES, []);
}
function allMembers(){
  return load(KEY_CLASS_MEMBERS, []);
}
function myMemberships(){
  return allMembers().filter(m => m.studentId === me.id);
}
function myClassIds(){
  return new Set(myMemberships().map(m => m.classId));
}
function myClasses(){
  const ids = myClassIds();
  return allClasses().filter(c => ids.has(c.id));
}

function getAssignmentsByClass(classId){
  const all = load(KEY_ASSIGNMENTS, []);
  return all.filter(a => a.classId === classId);
}
function getMySubmissionsByClass(classId){
  const all = load(KEY_SUBMISSIONS, []);
  return all.filter(s => s.classId === classId && s.studentId === me.id);
}
function getMySubmissionByAssignment(classId, assignmentId){
  const subs = getMySubmissionsByClass(classId);
  return subs.find(s => s.assignmentId === assignmentId);
}
function saveMembers(all){
  save(KEY_CLASS_MEMBERS, all);
}
function saveSubmissions(all){
  save(KEY_SUBMISSIONS, all);
}

// 🔸 Eskiden KEY_USERS ile teacher araması yapıyordun.
// Yeni backend sisteminde "tüm teacher user listesi" frontend'e verilmediği için
// bu fonksiyon şu an demo olarak kapalı.
function findTeacherUsersByName(_q){
  return []; // <-- şimdilik devre dışı
}

// ========= UI =========
function setView(name){
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === name));
}

function setActiveClassChip(){
  const cls = myClasses().find(c => c.id === activeClassId);
  const label = cls ? `Sınıf: ${cls.name}` : "Sınıf: —";
  if (activeClassChip) activeClassChip.textContent = label;
  if (assClassChip) assClassChip.textContent = label;
  if (subClassChip) subClassChip.textContent = label;
  if (histClassChip) histClassChip.textContent = label;
}

function fillClassSelect(){
  const classes = myClasses().sort((a,b)=> (a.createdAt||"").localeCompare(b.createdAt||""));
  if (!classSelect) return;

  classSelect.innerHTML = "";

  if (!classes.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Henüz sınıf yok";
    classSelect.appendChild(opt);
    classSelect.disabled = true;
    activeClassId = null;
    setActiveClassChip();
    return;
  }

  classSelect.disabled = false;
  classes.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.code})`;
    classSelect.appendChild(opt);
  });

  if (!activeClassId || !classes.some(c => c.id === activeClassId)) {
    activeClassId = classes[0].id;
  }
  classSelect.value = activeClassId;
  setActiveClassChip();
}

function requireActiveClass(){
  if (!activeClassId) {
    alert("Önce bir sınıfa katılmalısın.");
    return false;
  }
  return true;
}

// ========= RENDER =========
function renderKPIs(){
  const myCls = myClasses();
  if (kpiMyClasses) kpiMyClasses.textContent = myCls.length.toLocaleString("tr-TR");

  if (!activeClassId) {
    if (kpiActiveAssignments) kpiActiveAssignments.textContent = "0";
    if (kpiMySubmissions) kpiMySubmissions.textContent = "0";
    if (kpiGraded) kpiGraded.textContent = "0";
    return;
  }

  const as = getAssignmentsByClass(activeClassId);
  const subs = getMySubmissionsByClass(activeClassId);
  const graded = subs.filter(s => s.status === "graded").length;

  if (kpiActiveAssignments) kpiActiveAssignments.textContent = as.length.toLocaleString("tr-TR");
  if (kpiMySubmissions) kpiMySubmissions.textContent = subs.length.toLocaleString("tr-TR");
  if (kpiGraded) kpiGraded.textContent = graded.toLocaleString("tr-TR");
}

function renderUpcoming(){
  if (!upcomingList || !emptyUpcoming) return;

  upcomingList.innerHTML = "";
  if (!activeClassId) { emptyUpcoming.hidden = false; return; }

  const as = getAssignmentsByClass(activeClassId)
    .sort((a,b)=> (a.due||"").localeCompare(b.due||""))
    .slice(0, 5);

  if (!as.length) { emptyUpcoming.hidden = false; return; }
  emptyUpcoming.hidden = true;

  as.forEach(a => {
    const mySub = getMySubmissionByAssignment(activeClassId, a.id);
    const statusPill = mySub ? pillForStatus(mySub.status) : `<span class="pill">Teslim yok</span>`;

    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${a.course} — ${a.title}</div>
        <div class="subline">Son: ${a.due ? fmtOnlyDate(a.due) : "—"}</div>
        <div class="subline">${a.desc ? a.desc.slice(0, 80) + (a.desc.length>80 ? "…" : "") : ""}</div>
      </div>
      ${statusPill}
    `;
    el.addEventListener("click", () => {
      setView("submit");
      if (assignmentSelect) assignmentSelect.value = a.id;
      fillSubmitPanel();
    });
    upcomingList.appendChild(el);
  });
}

function renderMyLastSubs(){
  if (!myLastSubs || !emptyMyLast) return;

  myLastSubs.innerHTML = "";
  if (!activeClassId) { emptyMyLast.hidden = false; return; }

  const subs = getMySubmissionsByClass(activeClassId)
    .sort((a,b)=> (b.submittedAt||"").localeCompare(a.submittedAt||""))
    .slice(0, 4);

  if (!subs.length) { emptyMyLast.hidden = false; return; }
  emptyMyLast.hidden = true;

  subs.forEach(s => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${s.course} • ${s.title}</div>
        <div class="subline">${s.fileName} • ${fmtDate(s.submittedAt)}</div>
      </div>
      ${pillForStatus(s.status)}
    `;
    el.addEventListener("click", () => {
      setView("history");
      selectHistorySubmission(s.id);
    });
    myLastSubs.appendChild(el);
  });
}

function renderAssignments(){
  if (!assignmentList || !emptyAssignments) return;

  assignmentList.innerHTML = "";
  if (!activeClassId) { emptyAssignments.hidden = false; return; }

  const as = getAssignmentsByClass(activeClassId)
    .sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));

  if (!as.length) { emptyAssignments.hidden = false; return; }
  emptyAssignments.hidden = true;

  as.forEach(a => {
    const mySub = getMySubmissionByAssignment(activeClassId, a.id);
    const statusPill = mySub ? pillForStatus(mySub.status) : `<span class="pill">Teslim yok</span>`;

    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${a.course} — ${a.title}</div>
        <div class="subline">Son: ${a.due ? fmtOnlyDate(a.due) : "—"}</div>
        <div class="subline">${a.desc ? a.desc.slice(0, 120) + (a.desc.length>120 ? "…" : "") : ""}</div>
      </div>
      ${statusPill}
    `;
    el.addEventListener("click", () => {
      setView("submit");
      if (assignmentSelect) assignmentSelect.value = a.id;
      fillSubmitPanel();
    });
    assignmentList.appendChild(el);
  });
}

function fillAssignmentSelect(){
  if (!assignmentSelect || !emptyAssignSelect) return;

  assignmentSelect.innerHTML = "";
  if (!activeClassId) {
    emptyAssignSelect.hidden = false;
    assignmentSelect.disabled = true;
    return;
  }

  const as = getAssignmentsByClass(activeClassId)
    .sort((a,b)=> (a.due||"").localeCompare(b.due||""));

  if (!as.length) {
    emptyAssignSelect.hidden = false;
    assignmentSelect.disabled = true;
    return;
  }

  emptyAssignSelect.hidden = true;
  assignmentSelect.disabled = false;

  as.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.course} — ${a.title} (Son: ${a.due ? fmtOnlyDate(a.due) : "—"})`;
    assignmentSelect.appendChild(opt);
  });

  if (!assignmentSelect.value) assignmentSelect.value = as[0].id;
}

function fillSubmitPanel(){
  clearAlert(submitAlert);
  if (!activeClassId || !assignmentSelect) return;

  const aId = assignmentSelect.value;
  if (!aId) return;

  const as = getAssignmentsByClass(activeClassId);
  const a = as.find(x => x.id === aId);
  if (!a) return;

  const prev = getMySubmissionByAssignment(activeClassId, aId);
  if (prev) {
    setAlert(submitAlert, "err", "Bu ödeve zaten teslim yaptın. (Demo: tekrar teslim kapalı)");
  }
}

function applyHistoryFilters(list){
  const c = (filterCourse?.value || "").trim().toLowerCase();
  const st = filterStatus?.value;

  return list.filter(s => {
    const courseOk = !c || (s.course || "").toLowerCase().includes(c);
    const statusOk = st === "all" ? true : (s.status === st);
    return courseOk && statusOk;
  });
}

function renderHistory(){
  if (!historyList || !emptyHistory) return;

  historyList.innerHTML = "";
  if (!activeClassId) { emptyHistory.hidden = false; return; }

  const all = getMySubmissionsByClass(activeClassId)
    .sort((a,b)=> (b.submittedAt||"").localeCompare(a.submittedAt||""));
  const subs = applyHistoryFilters(all);

  if (!subs.length) { emptyHistory.hidden = false; return; }
  emptyHistory.hidden = true;

  subs.forEach(s => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${s.course} • ${s.title}</div>
        <div class="subline">${s.fileName} • ${fmtDate(s.submittedAt)}</div>
      </div>
      ${pillForStatus(s.status)}
    `;
    el.addEventListener("click", () => selectHistorySubmission(s.id));
    historyList.appendChild(el);
  });
}

// ========= DETAIL (History) =========
function clearSelection(){
  selectedSubmissionId = null;
  if (detailBox) detailBox.hidden = true;
  if (detailEmpty) detailEmpty.hidden = false;
}

function selectHistorySubmission(id){
  if (!activeClassId) return;
  const subs = getMySubmissionsByClass(activeClassId);
  const s = subs.find(x => x.id === id);
  if (!s) return;

  selectedSubmissionId = id;

  if (detailEmpty) detailEmpty.hidden = true;
  if (detailBox) detailBox.hidden = false;

  if (dTitle) dTitle.textContent = `${s.course} — ${s.title}`;
  if (dSub) dSub.textContent = `Durum: ${s.status === "graded" ? "Notlandırıldı" : "Bekliyor"}`;

  if (dStatus) {
    if (s.status === "graded") {
      dStatus.textContent = "Notlandırıldı";
      dStatus.className = "pill ok";
    } else {
      dStatus.textContent = "Bekliyor";
      dStatus.className = "pill warn";
    }
  }

  if (dFile) dFile.textContent = s.fileName;
  if (dDate) dDate.textContent = fmtDate(s.submittedAt);
  if (dGrade) dGrade.textContent = (s.grade === "" || s.grade === null || typeof s.grade === "undefined") ? "—" : String(s.grade);
  if (dFeedback) dFeedback.textContent = s.feedback ? s.feedback : "—";
}

// ========= MODALS =========
function openModal(modalEl){
  if (!modalEl) return;
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden","false");
}
function closeModal(modalEl){
  if (!modalEl) return;
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

[joinModal, findModal].forEach(m => {
  if (!m) return;
  m.addEventListener("click", (e) => { if (e.target === m) closeModal(m); });
});

// ========= JOIN CLASS =========
function alreadyMember(classId){
  return myMemberships().some(m => m.classId === classId);
}

function joinByClassId(classId){
  if (alreadyMember(classId)) return { ok:false, msg:"Bu sınıfa zaten katıldın." };

  const classes = allClasses();
  const cls = classes.find(c => c.id === classId);
  if (!cls) return { ok:false, msg:"Sınıf bulunamadı." };

  const members = allMembers();
  const m = {
    id: uid("mem"),
    classId: cls.id,
    studentId: me.id,
    studentName: me.name || "Öğrenci",
    joinedAt: new Date().toISOString()
  };
  members.unshift(m);
  saveMembers(members);

  return { ok:true, msg:`Katıldın: ${cls.name}` };
}

function joinByCode(codeRaw){
  const code = (codeRaw || "").trim().toUpperCase();
  if (code.length !== 6) return { ok:false, msg:"Kod 6 haneli olmalı." };

  const cls = allClasses().find(c => (c.code || "").toUpperCase() === code);
  if (!cls) return { ok:false, msg:"Bu kodla sınıf bulunamadı." };

  return joinByClassId(cls.id);
}

// ========= FIND TEACHER =========
function renderFoundClasses(classes){
  if (!foundClassList || !emptyFound) return;

  foundClassList.innerHTML = "";
  if (!classes.length) {
    emptyFound.hidden = false;
    return;
  }
  emptyFound.hidden = true;

  classes.forEach(cls => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${cls.name}</div>
        <div class="subline">Kod: ${cls.code} • ${cls.desc ? cls.desc.slice(0, 80) : "—"}</div>
      </div>
      <span class="pill">Katıl</span>
    `;
    el.addEventListener("click", () => {
      clearAlert(findAlert);
      const res = joinByClassId(cls.id);
      if (!res.ok) {
        setAlert(findAlert, "err", res.msg);
        return;
      }
      setAlert(findAlert, "ok", res.msg);

      fillClassSelect();
      activeClassId = cls.id;
      if (classSelect) classSelect.value = activeClassId;
      setActiveClassChip();
      refreshAll();

      setTimeout(() => closeModal(findModal), 500);
    });
    foundClassList.appendChild(el);
  });
}

// ========= SUBMIT =========
function submitAssignment(){
  clearAlert(submitAlert);
  if (!requireActiveClass()) return;

  const aId = assignmentSelect?.value;
  if (!aId) {
    setAlert(submitAlert, "err", "Ödev seçmelisin.");
    return;
  }

  const as = getAssignmentsByClass(activeClassId);
  const a = as.find(x => x.id === aId);
  if (!a) {
    setAlert(submitAlert, "err", "Ödev bulunamadı.");
    return;
  }

  // tekrar teslim kapalı (demo)
  const prev = getMySubmissionByAssignment(activeClassId, aId);
  if (prev) {
    setAlert(submitAlert, "err", "Bu ödeve zaten teslim yaptın. (Demo: tekrar teslim kapalı)");
    return;
  }

  const f = (fileName?.value || "").trim();
  const note = (studentNote?.value || "").trim();
  if (!f) {
    setAlert(submitAlert, "err", "Dosya adı zorunlu.");
    return;
  }

  const cls = allClasses().find(c => c.id === activeClassId);
  if (!cls) {
    setAlert(submitAlert, "err", "Sınıf bulunamadı.");
    return;
  }

  const allSubs = load(KEY_SUBMISSIONS, []);
  const item = {
    id: uid("sub"),
    classId: activeClassId,
    assignmentId: a.id,
    teacherId: cls.teacherId,
    studentId: me.id,
    studentName: me.name || "Öğrenci",
    course: a.course,
    title: a.title,
    fileName: f,
    studentNote: note,
    submittedAt: new Date().toISOString(),
    status: "pending",
    grade: "",
    feedback: ""
  };

  allSubs.unshift(item);
  saveSubmissions(allSubs);

  setAlert(submitAlert, "ok", "Teslim edildi! Öğretmenin paneline düştü.");

  if (fileName) fileName.value = "";
  if (studentNote) studentNote.value = "";

  refreshAll();
}

// ========= REFRESH =========
function refreshAll(){
  renderKPIs();
  renderUpcoming();
  renderMyLastSubs();
  renderAssignments();

  fillAssignmentSelect();
  fillSubmitPanel();

  renderHistory();
}

// ========= BOOT / EVENTS =========
if (who) who.textContent = me?.name ? `👩‍🎓 ${me.name}` : "👩‍🎓 Öğrenci";

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    window.location.replace("/Ogrenci/ogrenci-giris.html");
  });
}

navBtns.forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

if (classSelect) {
  classSelect.addEventListener("change", () => {
    activeClassId = classSelect.value || null;
    setActiveClassChip();
    clearSelection();
    refreshAll();
  });
}

if (goAssignments) goAssignments.addEventListener("click", () => setView("assignments"));
if (goHistory) goHistory.addEventListener("click", () => setView("history"));

if (filterCourse) filterCourse.addEventListener("input", () => renderHistory());
if (filterStatus) filterStatus.addEventListener("change", () => renderHistory());

if (clearSelectionBtn) clearSelectionBtn.addEventListener("click", clearSelection);

if (openJoin) {
  openJoin.addEventListener("click", () => {
    clearAlert(joinAlert);
    if (classCode) classCode.value = "";
    openModal(joinModal);
  });
}

if (joinForm) {
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearAlert(joinAlert);

    const res = joinByCode(classCode?.value);
    if (!res.ok) {
      setAlert(joinAlert, "err", res.msg);
      return;
    }
    setAlert(joinAlert, "ok", res.msg);

    fillClassSelect();
    const cls = allClasses().find(c => (c.code || "").toUpperCase() === (classCode?.value || "").trim().toUpperCase());
    if (cls) {
      activeClassId = cls.id;
      if (classSelect) classSelect.value = activeClassId;
    }
    setActiveClassChip();
    refreshAll();

    setTimeout(() => closeModal(joinModal), 500);
  });
}

if (openFind) {
  openFind.addEventListener("click", () => {
    clearAlert(findAlert);
    if (foundClassList) foundClassList.innerHTML = "";
    if (emptyFound) emptyFound.hidden = true;
    if (teacherQuery) teacherQuery.value = "";
    openModal(findModal);
  });
}

if (searchTeacherBtn) {
  searchTeacherBtn.addEventListener("click", () => {
    // Bu özellik eski KEY_USERS sistemine bağlıydı.
    // Yeni backend’de teacher listesi frontend’e verilmediği için demo olarak kapalı.
    setAlert(findAlert, "err", "Öğretmen arama (isimle) şu an kapalı. Sınıf koduyla katılmayı kullan.");
    renderFoundClasses([]);
  });
}

if (assignmentSelect) assignmentSelect.addEventListener("change", fillSubmitPanel);

if (submitForm) {
  submitForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitAssignment();
  });
}

// ========= INIT =========
fillClassSelect();
setActiveClassChip();
setView("dashboard");
clearSelection();
refreshAll();
