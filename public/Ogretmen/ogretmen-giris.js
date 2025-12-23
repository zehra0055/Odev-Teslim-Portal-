"use strict";
console.count("PAGE JS INIT");

// ==========================
//  Öğretmen Auth + Password Reset (OTP)
//  - POST /api/auth/register
//  - POST /api/auth/login
//  - POST /api/auth/forgot
//  - POST /api/auth/reset/verify
//  - POST /api/auth/reset
//  - relative URL kullanır (fetch hatası olmaz)
// ==========================

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

// strength UI
const strengthBar = document.getElementById("strengthBar");
const strengthText = document.getElementById("strengthText");
const regPasswordInput = document.getElementById("regPassword");
const terms = document.getElementById("terms");

// ===== Forgot/Reset Modal DOM (3 STEP) =====
const forgotForm = document.getElementById("forgotForm");
const forgotEmail = document.getElementById("forgotEmail");
const forgotMsg = document.getElementById("forgotMsg");
const forgotSubmit = document.getElementById("forgotSubmit");
const forgotAlert = document.getElementById("forgotAlert");

const codeForm = document.getElementById("codeForm");
const resetCode = document.getElementById("resetCode");
const codeMsg = document.getElementById("codeMsg");
const codeSubmit = document.getElementById("codeSubmit");
const codeAlert = document.getElementById("codeAlert");
const resendCodeBtn = document.getElementById("resendCodeBtn");

const resetForm = document.getElementById("resetForm");
const newPassword = document.getElementById("newPassword");
const resetMsg = document.getElementById("resetMsg");
const resetSubmit = document.getElementById("resetSubmit");
const resetAlert = document.getElementById("resetAlert");

const backToLoginBtn = document.getElementById("backToLoginBtn");

let busy = false;

console.log("ogretmen-giris.js yüklendi ✅");

// ---- helpers ----
function setAlert(el, type, text) {
  if (!el) {
    console.warn("Alert elementi yok:", type, text);
    alert(text);
    return;
  }
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

function v(id) {
  return (document.getElementById(id)?.value || "").trim();
}
function vRaw(id) {
  return (document.getElementById(id)?.value || "");
}
function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}
async function safeJson(res) {
  try { return await res.json(); }
  catch { return {}; }
}
function setInlineMsg(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

// ---- UI EVENTS (TAB / JUMP) ----
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".tab");
  if (tabBtn) return setTab(tabBtn.dataset.tab);

  const jumpBtn = e.target.closest("[data-jump]");
  if (jumpBtn) return setTab(jumpBtn.dataset.jump);
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
(() => {
  if (location.search.includes("noredirect=1")) return;

  try {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (token && role === ROLE) {
      if (window.location.pathname !== PANEL_URL) {
        window.location.replace(PANEL_URL);
      }
    }
  } catch (e) {
    console.warn("Auto redirect iptal edildi:", e);
  }
})();

// ==========================
// LOGIN
// ==========================
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  clearAlert(loginAlert);
  busy = true;
  setLoading(loginSubmit, true);

  try {
    const email = normalizeEmail(v("loginEmail"));
    const password = vRaw("loginPassword");

    if (!email || !password) {
      throw new Error("E-posta ve şifre zorunlu.");
    }

    const res = await fetch(`/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: ROLE, email, password }),
    });

    const data = await safeJson(res);
    console.log("LOGIN RES:", res.status, data);

    if (!res.ok || !data.ok) {
      throw new Error(data.message || `Giriş başarısız (HTTP ${res.status})`);
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("role", ROLE);
    localStorage.setItem("user", JSON.stringify(data.user || {}));

    window.location.replace(PANEL_URL);
  } catch (err) {
    console.error("LOGIN ERR:", err);
    setAlert(loginAlert, "err", err?.message || "Giriş başarısız");
  } finally {
    busy = false;
    setLoading(loginSubmit, false);
  }
});

// ==========================
// REGISTER
// ==========================
registerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  clearAlert(regAlert);

  if (terms && !terms.checked) {
    setAlert(regAlert, "err", "Devam etmek için şartları kabul etmelisin.");
    return;
  }

  busy = true;
  setLoading(regSubmit, true);

  try {
    const first = v("regFirstName");
    const last = v("regLastName");
    const name = `${first} ${last}`.trim();

    const email = normalizeEmail(v("regEmail"));
    const password = vRaw("regPassword");

    if (!name || !email || !password) {
      throw new Error("Lütfen tüm alanları doldur (Ad, Soyad, Email, Şifre).");
    }

    const res = await fetch(`/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: ROLE, name, email, password }),
    });

    const data = await safeJson(res);
    console.log("REGISTER RES:", res.status, data);

    if (!res.ok || !data.ok) {
      throw new Error(data.message || `Kayıt başarısız (HTTP ${res.status})`);
    }

    setAlert(regAlert, "ok", "Kayıt başarılı. Giriş yapabilirsin.");
    setTab("login");
  } catch (err) {
    console.error("REGISTER ERR:", err);
    setAlert(regAlert, "err", err?.message || "Kayıt başarısız");
  } finally {
    busy = false;
    setLoading(regSubmit, false);
  }
});



