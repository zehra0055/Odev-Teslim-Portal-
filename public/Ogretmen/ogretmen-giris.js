"use strict";
console.count("PAGE JS INIT");

const API_BASE = "http://localhost:3000";
const ROLE = "teacher";
const PANEL_URL = "/Ogretmen/ogretmen-panel.html";

// ---- DOM ----
const tabs = document.querySelectorAll(".tab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginAlert = document.getElementById("loginAlert");
const regAlert = document.getElementById("regAlert");
const loginSubmit = document.getElementById("loginSubmit");
const regSubmit = document.getElementById("regSubmit");

const modal = document.getElementById("modal");
const forgotBtn = document.getElementById("forgotBtn");
const closeModal = document.getElementById("closeModal");
const okModal = document.getElementById("okModal");

// strength UI
const strengthBar = document.getElementById("strengthBar");
const strengthText = document.getElementById("strengthText");
const regPasswordInput = document.getElementById("regPassword");
const terms = document.getElementById("terms");

let busy = false;

console.log("ogretmen-giris.js yüklendi ✅");

// ---- helpers ----
function setAlert(el, type, text) {
  if (!el) return;
  el.hidden = false;
  el.className = "alert " + type;
  el.textContent = text;
}
function clearAlert(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}
function setLoading(btn, v) {
  if (!btn) return;
  btn.disabled = v;
  btn.classList.toggle("loading", v);
}
function setTab(name) {
  tabs.forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });

  if (loginForm) loginForm.classList.toggle("active", name === "login");
  if (registerForm) registerForm.classList.toggle("active", name === "register");

  clearAlert(loginAlert);
  clearAlert(regAlert);
}

// ---- UI EVENTS (TAB / JUMP) ----
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".tab");
  if (tabBtn) {
    setTab(tabBtn.dataset.tab);
    return;
  }
  const jumpBtn = e.target.closest("[data-jump]");
  if (jumpBtn) {
    setTab(jumpBtn.dataset.jump);
    return;
  }
});

// ---- password toggle (👁️) ----
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-toggle-password]");
  if (!btn) return;

  const wrap = btn.closest(".input-wrap");
  const input = wrap ? wrap.querySelector("input") : null;
  if (!input) return;

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";

  // ikon değiştir (👁️ <-> 🙈)
  btn.textContent = isHidden ? "👁️" : "🙈";

  // aria-label güncelle
  btn.setAttribute("aria-label", isHidden ? "Şifreyi gizle" : "Şifreyi göster");
});


// ---- forgot modal (demo) ----
function openModal() {
  if (!modal) return;
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("open");
}
function closeModalFn() {
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("open");
}
if (forgotBtn) forgotBtn.addEventListener("click", openModal);
if (closeModal) closeModal.addEventListener("click", closeModalFn);
if (okModal) okModal.addEventListener("click", closeModalFn);
if (modal) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModalFn();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModalFn();
});

// ---- password strength ----
function calcStrength(pw) {
  let score = 0;
  if (!pw) return { label: "—", pct: 0 };

  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;

  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (/^(.)\1+$/.test(pw)) score = Math.max(0, score - 2);

  const pct = Math.min(100, Math.round((score / 6) * 100));

  let label = "Çok zayıf";
  if (score >= 5) label = "Çok güçlü";
  else if (score >= 4) label = "Güçlü";
  else if (score >= 3) label = "Orta";
  else if (score >= 2) label = "Zayıf";

  return { label, pct };
}
function updateStrengthUI(pw) {
  if (!strengthBar || !strengthText) return;
  const { label, pct } = calcStrength(pw);
  strengthBar.style.width = pct + "%";
  strengthText.textContent = `Şifre gücü: ${pw ? label : "—"}`;
}
if (regPasswordInput) {
  updateStrengthUI(regPasswordInput.value);
  regPasswordInput.addEventListener("input", () => updateStrengthUI(regPasswordInput.value));
}

// ---- auto redirect (SAFE) ----
// ✅ ARTIK "return" top-level yok. Hepsi IIFE içinde.
(() => {
  if (location.search.includes("noredirect=1")) return;

  try {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    // login sayfasındaysak ve token+rol uygunsa → panel
    if (token && role === ROLE) {
      // PANEL_URL absolute path ("/Ogretmen/...") olduğu için pathname ile kıyas OK
      if (window.location.pathname !== PANEL_URL) {
        window.location.replace(PANEL_URL);
      }
    }
  } catch (e) {
    console.warn("Auto redirect iptal edildi:", e);
  }
})();

// ---- LOGIN ----
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  clearAlert(loginAlert);
  busy = true;
  setLoading(loginSubmit, true);

  try {
    const email = loginForm.loginEmail.value.trim();
    const password = loginForm.loginPassword.value;

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: ROLE, email, password }),
    });

    let data = {};
    try { data = await res.json(); } catch {}

    if (!res.ok || !data.ok) throw new Error(data.message || "Giriş başarısız");

    localStorage.setItem("token", data.token);
    localStorage.setItem("role", ROLE);
    localStorage.setItem("user", JSON.stringify(data.user));

    window.location.replace(PANEL_URL);
  } catch (err) {
    console.error(err);
    setAlert(loginAlert, "err", err?.message || "Giriş başarısız");
  } finally {
    busy = false;
    setLoading(loginSubmit, false);
  }
});

// ---- REGISTER ----
registerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  clearAlert(regAlert);

  // ✅ Şartlar tiklenmediyse kayıt olmasın (istersen kaldırırım)
  if (terms && !terms.checked) {
    setAlert(regAlert, "err", "Devam etmek için şartları kabul etmelisin.");
    return;
  }

  busy = true;
  setLoading(regSubmit, true);

  try {
    const name = `${registerForm.regFirstName.value.trim()} ${registerForm.regLastName.value.trim()}`.trim();
    const email = registerForm.regEmail.value.trim();
    const password = registerForm.regPassword.value;

    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: ROLE, name, email, password }),
    });

    let data = {};
    try { data = await res.json(); } catch {}

    if (!res.ok || !data.ok) throw new Error(data.message || "Kayıt başarısız");

    setAlert(regAlert, "ok", "Kayıt başarılı. Giriş yapabilirsin.");
    setTab("login");
  } catch (err) {
    console.error(err);
    setAlert(regAlert, "err", err?.message || "Kayıt başarısız");
  } finally {
    busy = false;
    setLoading(regSubmit, false);
  }
});
