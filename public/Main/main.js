// ========= Helpers =========
const $ = (q, p = document) => p.querySelector(q);
const $$ = (q, p = document) => Array.from(p.querySelectorAll(q));

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ========= Mobile Menu =========
const hamburger = $("#hamburger");
const menu = $("#menu");

function closeMenu() {
  if (!menu) return;
  menu.classList.remove("open");
  hamburger?.classList.remove("is-open");
}

function toggleMenu() {
  if (!menu) return;
  menu.classList.toggle("open");
  hamburger?.classList.toggle("is-open");
}

hamburger?.addEventListener("click", (e) => {
  e.preventDefault();
  toggleMenu();
});

// Menüden bir şeye basınca kapansın
$$(".menu a").forEach((a) => {
  a.addEventListener("click", () => closeMenu());
});

// dışarı tıklanınca kapansın
document.addEventListener("click", (e) => {
  if (!menu || !hamburger) return;
  const inside = menu.contains(e.target) || hamburger.contains(e.target);
  if (!inside) closeMenu();
});

// ========= Smooth Scroll (hash linkler) =========
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;

  const href = a.getAttribute("href");
  if (!href || href === "#") return;

  const target = document.querySelector(href);
  if (!target) return;

  e.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });

  // URL hash güncelle (geri/ileri doğru çalışsın)
  history.pushState(null, "", href);
});

// Tarayıcı geri/ileri ile hash değişince de düzgün kaydır
window.addEventListener("popstate", () => {
  const hash = location.hash;
  if (!hash) return;
  const target = document.querySelector(hash);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
});

// ========= Stats Counter =========
const stat1 = $("#stat1");
const stat2 = $("#stat2");
const stat3 = $("#stat3");

const targets = [
  { el: stat1, value: 128 }, // istediğin sayıyı yaz
  { el: stat2, value: 542 }, // istediğin sayıyı yaz
  { el: stat3, value: 4.8 }, // örnek ortalama
];

function animateNumber(el, to, duration = 900) {
  if (!el) return;

  const isFloat = String(to).includes(".");
  const start = performance.now();
  const from = 0;

  function tick(now) {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic

    const current = from + (to - from) * eased;

    el.textContent = isFloat ? current.toFixed(1) : Math.round(current).toString();

    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// Stats görünür olunca başlat
const statsWrap = document.querySelector(".hero-stats");
let statsPlayed = false;

if (statsWrap) {
  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !statsPlayed) {
        statsPlayed = true;
        targets.forEach((x) => animateNumber(x.el, x.value));
        io.disconnect();
      }
    },
    { threshold: 0.35 }
  );

  io.observe(statsWrap);
}

// ========= Contact Form (REAL: mailto) =========
const form = $("#contactForm");
const alertBox = $("#formAlert");

// mailin gideceği adres:
const SUPPORT_MAIL = "odevportaldestek@gmail.com";

function showAlert(msg, type = "ok") {
  if (!alertBox) return;
  alertBox.hidden = false;
  alertBox.textContent = msg;
  alertBox.className = "form-alert " + type;
}

function isValidEmail(email) {
  // basit ama sağlam bir kontrol
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = $("#name")?.value.trim() || "";
  const email = $("#email")?.value.trim() || "";
  const message = $("#message")?.value.trim() || "";

  if (!name || name.length < 3) {
    showAlert("Lütfen ad soyad alanını en az 3 karakter olacak şekilde doldur.", "err");
    return;
  }
  if (!email || !isValidEmail(email)) {
    showAlert("Lütfen geçerli bir e-posta gir.", "err");
    return;
  }
  if (!message || message.length < 10) {
    showAlert("Mesajın en az 10 karakter olsun.", "err");
    return;
  }

  // mailto içeriği
  const subject = encodeURIComponent("Ödev Teslim Portalı | Destek");
  const body = encodeURIComponent(
    `Ad Soyad: ${name}\nE-posta: ${email}\n\nMesaj:\n${message}\n`
  );

  // kullanıcıya bilgi
  showAlert("Mail uygulaman açılıyor… Gönder’e basınca mesajın bize ulaşacak ✅", "ok");

  // mail uygulamasını aç
  window.location.href = `mailto:${SUPPORT_MAIL}?subject=${subject}&body=${body}`;

  // formu temizle (istersen kaldırabiliriz)
  form.reset();

  setTimeout(() => {
    if (!alertBox) return;
    alertBox.hidden = true;
  }, 3500);
});
