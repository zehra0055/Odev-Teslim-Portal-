// public/Ogrenci/ogrenci-panel.js
"use strict";

/**
 * ✅ ÖĞRENCİ PANEL (FULL BACKEND + GRIDFS UPLOAD)
 * - Auth: localStorage -> token, role, user
 * - Classes: API
 * - Assignments: API
 * - Submissions: API + Upload (pdf/zip/docx)
 *
 * ✅ Server uyumu (GridFS):
 * - POST /api/submissions/upload  (multipart/form-data)
 * - GET  /api/files/:fileId       (download)
 */

const API_BASE = "";

// ========= auth guard =========
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");
let me = null;
try { me = JSON.parse(localStorage.getItem("user") || "null"); } catch { me = null; }

if (!token || role !== "student" || !me) {
  window.location.replace("/Ogrenci/ogrenci-giris.html");
}

// ========= apiFetch (FormData safe + good error) =========
async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isFormData = (typeof FormData !== "undefined") && (options.body instanceof FormData);

  // FormData'da Content-Type set etmiyoruz
  if (!isFormData && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });

  // JSON olmayan response'lara karşı güvenli parse
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok || (data && data.ok === false)) {
    throw new Error((data && data.message) ? data.message : `İstek başarısız: ${res.status}`);
  }

  return data;
}

// ========= helpers =========
function fmtDate(iso){ try { return new Date(iso).toLocaleString("tr-TR"); } catch { return iso; } }
function fmtOnlyDate(iso){ try { return new Date(iso).toLocaleDateString("tr-TR"); } catch { return iso; } }
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
const fileInput = document.getElementById("fileInput");
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

let myClassesCache = [];
let assignmentsCache = [];
let mySubmissionsCache = [];

// ========= API data =========
async function fetchMyClasses(){
  const data = await apiFetch(`/api/classes/my?studentId=${encodeURIComponent(me.id)}`);
  return Array.isArray(data?.classes) ? data.classes : [];
}

async function fetchAssignments(classId){
  const data = await apiFetch(`/api/assignments/by-class?classId=${encodeURIComponent(classId)}`);
  return Array.isArray(data?.assignments) ? data.assignments : [];
}

async function fetchMySubmissions(classId){
  const data = await apiFetch(`/api/student/submissions?classId=${encodeURIComponent(classId)}`);
  return Array.isArray(data?.submissions) ? data.submissions : [];
}

// ========= UI =========
function setView(name){
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === name));
}

function setActiveClassChip(){
  const cls = myClassesCache.find(c => c.id === activeClassId);
  const label = cls ? `Sınıf: ${cls.name}` : "Sınıf: —";
  if (activeClassChip) activeClassChip.textContent = label;
  if (assClassChip) assClassChip.textContent = label;
  if (subClassChip) subClassChip.textContent = label;
  if (histClassChip) histClassChip.textContent = label;
}

async function fillClassSelect(){
  if (!classSelect) return;
  classSelect.innerHTML = "";

  try {
    myClassesCache = (await fetchMyClasses()).sort((a,b)=> (a.createdAt||"").localeCompare(b.createdAt||""));
  } catch (e) {
    console.error(e);
    myClassesCache = [];
  }

  if (!myClassesCache.length) {
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
  myClassesCache.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.code})`;
    classSelect.appendChild(opt);
  });

  if (!activeClassId || !myClassesCache.some(c => c.id === activeClassId)) {
    activeClassId = myClassesCache[0].id;
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

// ========= render =========
function renderKPIs(){
  if (kpiMyClasses) kpiMyClasses.textContent = myClassesCache.length.toLocaleString("tr-TR");

  if (!activeClassId) {
    if (kpiActiveAssignments) kpiActiveAssignments.textContent = "0";
    if (kpiMySubmissions) kpiMySubmissions.textContent = "0";
    if (kpiGraded) kpiGraded.textContent = "0";
    return;
  }

  const graded = mySubmissionsCache.filter(s => s.status === "graded").length;

  if (kpiActiveAssignments) kpiActiveAssignments.textContent = assignmentsCache.length.toLocaleString("tr-TR");
  if (kpiMySubmissions) kpiMySubmissions.textContent = mySubmissionsCache.length.toLocaleString("tr-TR");
  if (kpiGraded) kpiGraded.textContent = graded.toLocaleString("tr-TR");
}

function renderUpcoming(){
  if (!upcomingList || !emptyUpcoming) return;
  upcomingList.innerHTML = "";

  if (!activeClassId) { emptyUpcoming.hidden = false; return; }

  const as = [...assignmentsCache].sort((a,b)=> (a.due||"").localeCompare(b.due||"")).slice(0,5);
  if (!as.length) { emptyUpcoming.hidden = false; return; }
  emptyUpcoming.hidden = true;

  as.forEach(a => {
    const mySub = mySubmissionsCache.find(s => s.assignmentId === a.id);
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

  const subs = [...mySubmissionsCache].sort((a,b)=> (b.submittedAt||"").localeCompare(a.submittedAt||"")).slice(0,4);
  if (!subs.length) { emptyMyLast.hidden = false; return; }
  emptyMyLast.hidden = true;

  subs.forEach(s => {
    const shownName = s.originalFileName || s.fileName || "Dosya";
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${s.course} • ${s.title}</div>
        <div class="subline">${shownName} • ${fmtDate(s.submittedAt)}</div>
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

  const as = [...assignmentsCache].sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
  if (!as.length) { emptyAssignments.hidden = false; return; }
  emptyAssignments.hidden = true;

  as.forEach(a => {
    const mySub = mySubmissionsCache.find(s => s.assignmentId === a.id);
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

  const as = [...assignmentsCache].sort((a,b)=> (a.due||"").localeCompare(b.due||""));
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

  const prev = mySubmissionsCache.find(s => s.assignmentId === aId);
  if (prev) setAlert(submitAlert, "err", "Bu ödeve zaten teslim yaptın. (Tekrar teslim kapalı)");
}

function applyHistoryFilters(list){
  const c = (filterCourse?.value || "").trim().toLowerCase();
  const st = filterStatus?.value || "all";
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

  const subs = applyHistoryFilters([...mySubmissionsCache].sort((a,b)=> (b.submittedAt||"").localeCompare(a.submittedAt||"")));
  if (!subs.length) { emptyHistory.hidden = false; return; }
  emptyHistory.hidden = true;

  subs.forEach(s => {
    const shownName = s.originalFileName || s.fileName || "Dosya";
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${s.course} • ${s.title}</div>
        <div class="subline">${shownName} • ${fmtDate(s.submittedAt)}</div>
      </div>
      ${pillForStatus(s.status)}
    `;
    el.addEventListener("click", () => selectHistorySubmission(s.id));
    historyList.appendChild(el);
  });
}

// ========= detail =========
function clearSelection(){
  selectedSubmissionId = null;
  if (detailBox) detailBox.hidden = true;
  if (detailEmpty) detailEmpty.hidden = false;
}

function selectHistorySubmission(id){
  const s = mySubmissionsCache.find(x => x.id === id);
  if (!s) return;

  selectedSubmissionId = id;
  if (detailEmpty) detailEmpty.hidden = true;
  if (detailBox) detailBox.hidden = false;

  if (dTitle) dTitle.textContent = `${s.course} — ${s.title}`;
  if (dSub) dSub.textContent = `Durum: ${s.status === "graded" ? "Notlandırıldı" : "Bekliyor"}`;

  if (dStatus) {
    dStatus.textContent = s.status === "graded" ? "Notlandırıldı" : "Bekliyor";
    dStatus.className = s.status === "graded" ? "pill ok" : "pill warn";
  }

  // ✅ GridFS: fileUrl + originalFileName
  if (dFile) {
    if (s.fileUrl) {
      const text = s.originalFileName || "Dosyayı indir";
      dFile.innerHTML = `<a href="${s.fileUrl}" target="_blank" rel="noopener">${text}</a>`;
    } else {
      dFile.textContent = s.originalFileName || s.fileName || "—";
    }
  }

  if (dDate) dDate.textContent = fmtDate(s.submittedAt);
  if (dGrade) dGrade.textContent = (s.grade === "" || s.grade === null || typeof s.grade === "undefined") ? "—" : String(s.grade);
  if (dFeedback) dFeedback.textContent = s.feedback ? s.feedback : "—";
}

// ========= modals =========
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

// ========= join/search =========
async function joinByCode(codeRaw){
  const code = (codeRaw || "").trim().toUpperCase();
  if (code.length !== 6) return { ok:false, msg:"Kod 6 haneli olmalı." };

  try {
    const data = await apiFetch(`/api/classes/search?code=${encodeURIComponent(code)}`);
    const cls = data?.class;
    if (!cls?.id) return { ok:false, msg:"Bu kodla sınıf bulunamadı." };

    await apiFetch(`/api/classes/join`, {
      method: "POST",
      body: JSON.stringify({ classId: cls.id, studentName: me.name || "Öğrenci" })
    });

    return { ok:true, msg:`Katıldın: ${cls.name}` };
  } catch (err) {
    return { ok:false, msg: err.message || "Katılım başarısız." };
  }
}

async function searchClassesByTeacherName(q){
  const query = (q || "").trim();
  if (!query) return [];
  try {
    const data = await apiFetch(`/api/classes/search-by-teacher?teacher=${encodeURIComponent(query)}`);
    return Array.isArray(data?.classes) ? data.classes : [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

function renderFoundClasses(classes){
  if (!foundClassList || !emptyFound) return;

  foundClassList.innerHTML = "";
  if (!classes.length) { emptyFound.hidden = false; return; }
  emptyFound.hidden = true;

  classes.forEach(cls => {
    const el = document.createElement("div");
    el.className = "rowcard";
    el.innerHTML = `
      <div class="leftcol">
        <div class="titleline">${cls.name}</div>
        <div class="subline">Öğretmen: ${cls.teacherName || "—"}</div>
        <div class="subline">Kod: ${cls.code} • ${cls.desc ? cls.desc.slice(0, 80) : "—"}</div>
      </div>
      <span class="pill">Katıl</span>
    `;
    el.addEventListener("click", async () => {
      clearAlert(findAlert);
      const res = await joinByCode(cls.code);
      if (!res.ok) return setAlert(findAlert, "err", res.msg);

      setAlert(findAlert, "ok", res.msg);
      await fillClassSelect();

      const fresh = myClassesCache.find(x => x.id === cls.id);
      if (fresh) {
        activeClassId = fresh.id;
        if (classSelect) classSelect.value = activeClassId;
      }

      await refreshAll();
      setTimeout(() => closeModal(findModal), 500);
    });
    foundClassList.appendChild(el);
  });
}

async function submitAssignment() {
  clearAlert(submitAlert);
  if (!requireActiveClass()) return;

  const aId = assignmentSelect?.value;
  if (!aId) return setAlert(submitAlert, "err", "Ödev seçmelisin.");

  const a = assignmentsCache.find(x => x.id === aId);
  if (!a) return setAlert(submitAlert, "err", "Ödev bulunamadı.");

  // 🔴 İŞTE BU SATIR YOKTU → EKLİYORSUN
  const file = fileInput.files[0];

  if (!file) {
    return setAlert(submitAlert, "err", "Dosya seçmelisin (PDF/ZIP).");
  }

  const fd = new FormData();
  fd.append("file", file);

  // server’ın beklediği alanlar
  fd.append("classId", activeClassId);
  fd.append("assignmentId", a.id);
  fd.append("teacherId", a.teacherId);
  fd.append("studentName", me.name || "Öğrenci");
  fd.append("course", a.course || "");
  fd.append("title", a.title || "");
  fd.append("studentNote", (studentNote?.value || "").trim());
  
  try {
    await fetch("/health");buradaconst msg = data?.message || `İstek başarısız: ${res.status}`;

  } catch (e) {
    // uyku halindeyken 503 gelirse sorun etmiyoruz
  }
  
  await new Promise(r => setTimeout(r, 2500)); // ⬅️ 1.5s → 2.5s
  
  
  
  async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const isFormData = options.body instanceof FormData;
  
    if (!isFormData && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;
  
    let res;
    try {
      res = await fetch(API_BASE + path, { ...options, headers });
    } catch (err) {
      // ✅ Render uyku / ağ kopması / CORS gibi durumlar burada yakalanır
      throw new Error(
        "Sunucuya ulaşılamadı (Render uyku olabilir). 2-3 saniye bekleyip tekrar deneyin."
      );
    }
  
    let data = null;
    try { data = await res.json(); } catch {}
  
    if (!res.ok) {
      const msg =
  (data && typeof data === "object" && data.message)
    ? data.message
    : `İstek başarısız: ${res.status}`;

      // 503 ise direkt uyku mesajı
      if (res.status === 503) {
        throw new Error("Sunucu şu an uykuda (Render Free). 5 sn bekle, tekrar dene.");
      }
      throw new Error(msg);
    }
  
    return data;
  }
  
}


// ========= refresh =========
async function refreshAll(){
  if (activeClassId) {
    try {
      assignmentsCache = await fetchAssignments(activeClassId);
      mySubmissionsCache = await fetchMySubmissions(activeClassId);
    } catch (e) {
      console.error(e);
      assignmentsCache = [];
      mySubmissionsCache = [];
    }
  } else {
    assignmentsCache = [];
    mySubmissionsCache = [];
  }

  setActiveClassChip();
  renderKPIs();
  renderUpcoming();
  renderMyLastSubs();
  renderAssignments();
  fillAssignmentSelect();
  fillSubmitPanel();
  renderHistory();
}

// ========= events =========
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
  classSelect.addEventListener("change", async () => {
    activeClassId = classSelect.value || null;
    clearSelection();
    await refreshAll();
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
  joinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlert(joinAlert);

    const res = await joinByCode(classCode?.value);
    if (!res.ok) return setAlert(joinAlert, "err", res.msg);

    setAlert(joinAlert, "ok", res.msg);
    await fillClassSelect();

    const code = (classCode?.value || "").trim().toUpperCase();
    const joined = myClassesCache.find(c => (c.code || "").toUpperCase() === code);
    if (joined) {
      activeClassId = joined.id;
      if (classSelect) classSelect.value = activeClassId;
    }

    await refreshAll();
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
  searchTeacherBtn.addEventListener("click", async () => {
    clearAlert(findAlert);
    const q = teacherQuery?.value || "";
    if (!q.trim()) {
      setAlert(findAlert, "err", "Öğretmen adı yazmalısın.");
      return renderFoundClasses([]);
    }
    setAlert(findAlert, "ok", "Aranıyor...");
    const list = await searchClassesByTeacherName(q);
    if (!list.length) setAlert(findAlert, "err", "Sonuç bulunamadı.");
    else clearAlert(findAlert);
    renderFoundClasses(list);
  });
}

if (assignmentSelect) assignmentSelect.addEventListener("change", fillSubmitPanel);

if (submitForm) {
  submitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitAssignment();
  });
}

// ========= init =========
(async function boot(){
  await fillClassSelect();
  setView("dashboard");
  clearSelection();
  await refreshAll();
})();
