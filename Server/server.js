// Server/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

console.log("SERVER.JS LOADED ✅", __filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== STATIC =====
app.use(express.static(path.join(__dirname, "..", "public")));

// ===== HEALTH =====
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ======================================================
// AUTH DEMO (RAM) - UPDATED
// - Single user by email
// - roles: ["student","teacher"]
// - server kapanınca users sıfırlanır (demo)
// ======================================================
let users = []; 
// { id, name, email, password, roles:[], createdAt }

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function makeId(prefix = "u") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function safeName(v) {
  return String(v || "").trim();
}

function isValidRole(role) {
  return ["student", "teacher"].includes(role);
}

// REGISTER (email varsa rol ekler)
app.post("/api/auth/register", (req, res) => {
  try {
    const { role, name, email, password } = req.body || {};

    if (!role || !email || !password) {
      return res.status(400).json({ ok: false, message: "Eksik alan var." });
    }
    if (!isValidRole(role)) {
      return res.status(400).json({ ok: false, message: "Geçersiz rol." });
    }

    const mail = normEmail(email);
    const pass = String(password);

    if (!mail.includes("@")) {
      return res.status(400).json({ ok: false, message: "Geçerli bir e-posta gir." });
    }
    if (pass.length < 6) {
      return res.status(400).json({ ok: false, message: "Şifre en az 6 karakter olmalı." });
    }

    const existing = users.find(u => normEmail(u.email) === mail);

    // yoksa yeni kullanıcı oluştur
    if (!existing) {
      const newUser = {
        id: makeId("usr"),
        name: safeName(name) || "(İsimsiz)",
        email: mail,
        password: pass, // demo amaçlı (sonra hash)
        roles: [role],
        createdAt: new Date().toISOString(),
      };

      users.unshift(newUser);

      return res.json({
        ok: true,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          roles: newUser.roles,
        },
      });
    }

    // email zaten var -> şifre kontrolü (hesabın sahibi misin?)
    if (String(existing.password) !== pass) {
      return res.status(409).json({
        ok: false,
        message: "Bu e-posta zaten kayıtlı. Şifre yanlışsa rol eklenemez.",
      });
    }

    // rol ekle (yoksa)
    if (!Array.isArray(existing.roles)) existing.roles = [];
    if (!existing.roles.includes(role)) {
      existing.roles.push(role);
    }

    // isim boş gelirse eskiyi koru, dolu gelirse güncelle (opsiyonel)
    const incomingName = safeName(name);
    if (incomingName) existing.name = incomingName;

    return res.json({
      ok: true,
      user: {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        roles: existing.roles,
      },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// LOGIN (email+şifre doğru, rol var mı kontrol)
app.post("/api/auth/login", (req, res) => {
  try {
    const { role, email, password } = req.body || {};

    if (!role || !email || !password) {
      return res.status(400).json({ ok: false, message: "Eksik alan var." });
    }
    if (!isValidRole(role)) {
      return res.status(400).json({ ok: false, message: "Geçersiz rol." });
    }

    const mail = normEmail(email);
    const pass = String(password);

    const user = users.find(u => normEmail(u.email) === mail);

    if (!user || String(user.password) !== pass) {
      return res.status(401).json({ ok: false, message: "E-posta/şifre hatalı." });
    }

    if (!user.roles?.includes(role)) {
      return res.status(403).json({ ok: false, message: "Bu hesap bu role sahip değil." });
    }

    // demo token
    const token = "t_" + Math.random().toString(16).slice(2);

    return res.json({
      ok: true,
      token,
      // Frontend senin eski mantıkta role saklıyor, sorun değil.
      // İstersen seçilen rolü ayrıca da döndürüyorum:
      selectedRole: role,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Debug: kullanıcı listesi + sayısı (isteğe bağlı)
app.get("/api/debug/users-count", (req, res) => {
  res.json({ ok: true, count: users.length });
});
app.get("/api/debug/users", (req, res) => {
  res.json({
    ok: true,
    users: users.map(u => ({ id: u.id, email: u.email, roles: u.roles, name: u.name })),
  });
});

// ===== FALLBACK =====
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
});
