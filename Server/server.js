// Server/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { MongoClient } = require("mongodb");

console.log("SERVER.JS LOADED ✅", __filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Render'a koyduğun ENV
const MONGODB_URI = process.env.MONGODB_URI;

// İstersen Render ENV'e bunu da ekle: MONGODB_DB=odevteslimportal
const DB_NAME = process.env.MONGODB_DB || "odevteslimportal";

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI env yok! Render -> Environment'a ekle.");
}

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

// ============================
// MongoDB bağlantısı (tek sefer)
// ============================
const client = new MongoClient(MONGODB_URI);
let db, usersCol;

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}
function safeName(v) {
  return String(v || "").trim();
}
function isValidRole(role) {
  return ["student", "teacher"].includes(role);
}
function makeId(prefix = "u") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

// REGISTER (email varsa rol ekler)
app.post("/api/auth/register", async (req, res) => {
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

    const existing = await usersCol.findOne({ email: mail });

    // yoksa yeni kullanıcı
    if (!existing) {
      const newUser = {
        id: makeId("usr"),
        name: safeName(name) || "(İsimsiz)",
        email: mail,
        password: pass, // şimdilik düz (istersen sonra bcrypt)
        roles: [role],
        createdAt: new Date().toISOString(),
      };

      await usersCol.insertOne(newUser);

      return res.json({
        ok: true,
        user: { id: newUser.id, name: newUser.name, email: newUser.email, roles: newUser.roles },
      });
    }

    // email var -> şifre kontrol
    if (String(existing.password) !== pass) {
      return res.status(409).json({
        ok: false,
        message: "Bu e-posta zaten kayıtlı. Şifre yanlışsa rol eklenemez.",
      });
    }

    // rol ekle
    const roles = Array.isArray(existing.roles) ? existing.roles : [];
    if (!roles.includes(role)) roles.push(role);

    const incomingName = safeName(name);
    const updatedName = incomingName || existing.name || "(İsimsiz)";

    await usersCol.updateOne(
      { _id: existing._id },
      { $set: { roles, name: updatedName } }
    );

    return res.json({
      ok: true,
      user: { id: existing.id, name: updatedName, email: existing.email, roles },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
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

    const user = await usersCol.findOne({ email: mail });

    if (!user || String(user.password) !== pass) {
      return res.status(401).json({ ok: false, message: "E-posta/şifre hatalı." });
    }

    if (!user.roles?.includes(role)) {
      return res.status(403).json({ ok: false, message: "Bu hesap bu role sahip değil." });
    }

    const token = "t_" + Math.random().toString(16).slice(2);

    return res.json({
      ok: true,
      token,
      selectedRole: role,
      user: { id: user.id, name: user.name, email: user.email, roles: user.roles },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Debug (isteğe bağlı)
app.get("/api/debug/users-count", async (req, res) => {
  const count = await usersCol.countDocuments({});
  res.json({ ok: true, count });
});
app.get("/api/debug/users", async (req, res) => {
  const users = await usersCol
    .find({}, { projection: { _id: 0, id: 1, email: 1, roles: 1, name: 1 } })
    .toArray();
  res.json({ ok: true, users });
});

// ===== FALLBACK =====
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

// ===== START (MongoDB bağlan, sonra server aç) =====
async function start() {
  try {
    console.log("🔌 MongoDB bağlanıyor...");
    await client.connect();
    db = client.db(DB_NAME);
    usersCol = db.collection("users");

    // email tekil olsun (ilk çalışmada kurar)
    await usersCol.createIndex({ email: 1 }, { unique: true });

    console.log("✅ MongoDB connected. DB:", DB_NAME);

    app.listen(PORT, () => {
      console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}
const connectDB = require("./db");

start();
