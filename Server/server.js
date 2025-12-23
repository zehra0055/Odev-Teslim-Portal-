// Server/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const multer = require("multer");

console.log("SERVER.JS LOADED ✅", __filename);

const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "odevteslimportal";

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI yok! .env / Render Environment'a ekle.");
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
// MongoDB bağlantısı
// ============================
const client = new MongoClient(MONGODB_URI);
let db;

// collections helper
const col = (name) => db.collection(name);

// ============================
// Helpers
// ============================
function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}
function safeName(v) {
  return String(v || "").trim();
}
function isValidRole(role) {
  return ["student", "teacher"].includes(role);
}
function makeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function genToken() {
  return crypto.randomBytes(24).toString("hex");
}
function nowPlusMinutes(min) {
  return new Date(Date.now() + min * 60 * 1000);
}
function gen6DigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function isBcryptHash(s) {
  return typeof s === "string" && (s.startsWith("$2a$") || s.startsWith("$2b$") || s.startsWith("$2y$"));
}

// ============================
// Simple token store (demo)
// PROD’da JWT yapılır ama şimdilik yeterli
// ============================
const sessions = new Map(); // token -> { userId, role, exp }
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24);

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ ok: false, message: "Token yok." });

  const s = sessions.get(token);
  if (!s) return res.status(401).json({ ok: false, message: "Token geçersiz." });

  if (s.exp && new Date(s.exp) < new Date()) {
    sessions.delete(token);
    return res.status(401).json({ ok: false, message: "Token süresi dolmuş." });
  }

  req.auth = s; // {userId, role}
  req.token = token;
  next();
}

// ============================
// Mail transporter (OTP reset için)
// ============================
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const mailEnabled = SMTP_HOST && SMTP_USER && SMTP_PASS;

const transporter = mailEnabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

const RESET_CODE_TTL_MIN = Number(process.env.RESET_CODE_TTL_MIN || 10);
const RESET_TOKEN_TTL_MIN = Number(process.env.RESET_TOKEN_TTL_MIN || 15);

// ============================
// Uploads (PDF/ZIP)
// ============================
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]+/g, "_")
      .slice(0, 60);
    const unique = `sub_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    cb(null, `${unique}_${safeBase}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = [".pdf", ".zip"];
  if (!allowed.includes(ext)) return cb(new Error("Sadece PDF veya ZIP yükleyebilirsin."));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ============================
// AUTH
// ============================

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  try {
    const { role, name, email, password } = req.body || {};

    if (!role || !email || !password) return res.status(400).json({ ok: false, message: "Eksik alan var." });
    if (!isValidRole(role)) return res.status(400).json({ ok: false, message: "Geçersiz rol." });

    const mail = normEmail(email);
    const pass = String(password);

    if (!mail.includes("@")) return res.status(400).json({ ok: false, message: "Geçerli bir e-posta gir." });
    if (pass.length < 6) return res.status(400).json({ ok: false, message: "Şifre en az 6 karakter olmalı." });

    const users = col("users");
    const existing = await users.findOne({ email: mail });

    if (!existing) {
      const hash = await bcrypt.hash(pass, 10);
      const newUser = {
        id: makeId("usr"),
        name: safeName(name) || "(İsimsiz)",
        email: mail,
        password: hash,
        roles: [role],
        createdAt: new Date().toISOString(),
      };

      await users.insertOne(newUser);
      return res.json({
        ok: true,
        user: { id: newUser.id, name: newUser.name, email: newUser.email, roles: newUser.roles },
      });
    }

    const stored = existing.password || "";
    const okPass = isBcryptHash(stored) ? await bcrypt.compare(pass, stored) : String(stored) === pass;

    if (!okPass) {
      return res.status(409).json({ ok: false, message: "Bu e-posta zaten kayıtlı. Şifre yanlışsa rol eklenemez." });
    }

    if (!isBcryptHash(stored)) {
      const hash = await bcrypt.hash(pass, 10);
      await users.updateOne({ _id: existing._id }, { $set: { password: hash } });
    }

    const roles = Array.isArray(existing.roles) ? existing.roles : [];
    if (!roles.includes(role)) roles.push(role);

    const incomingName = safeName(name);
    const updatedName = incomingName || existing.name || "(İsimsiz)";

    await users.updateOne({ _id: existing._id }, { $set: { roles, name: updatedName } });

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

    if (!role || !email || !password) return res.status(400).json({ ok: false, message: "Eksik alan var." });
    if (!isValidRole(role)) return res.status(400).json({ ok: false, message: "Geçersiz rol." });

    const mail = normEmail(email);
    const pass = String(password);

    const users = col("users");
    const user = await users.findOne({ email: mail });

    if (!user) return res.status(401).json({ ok: false, message: "E-posta/şifre hatalı." });

    const stored = user.password || "";
    const okPass = isBcryptHash(stored) ? await bcrypt.compare(pass, stored) : String(stored) === pass;
    if (!okPass) return res.status(401).json({ ok: false, message: "E-posta/şifre hatalı." });

    if (!isBcryptHash(stored)) {
      const hash = await bcrypt.hash(pass, 10);
      await users.updateOne({ _id: user._id }, { $set: { password: hash } });
    }

    if (!Array.isArray(user.roles) || !user.roles.includes(role)) {
      return res.status(403).json({ ok: false, message: "Bu hesap bu role sahip değil." });
    }

    const token = "t_" + genToken();
    sessions.set(token, {
      userId: user.id,
      role,
      exp: nowPlusMinutes(SESSION_TTL_HOURS * 60).toISOString(),
    });

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

// LOGOUT (client çağırmasa bile olur, ama düzenli)
app.post("/api/auth/logout", authRequired, async (req, res) => {
  try {
    if (req.token) sessions.delete(req.token);
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ====== FORGOT: kod gönder ======
app.post("/api/auth/forgot", async (req, res) => {
  try {
    const { role, email } = req.body || {};
    const emailNorm = normEmail(email);

    if (!emailNorm || !isValidRole(role)) return res.json({ ok: true });

    const users = col("users");
    const user = await users.findOne({ email: emailNorm });

    if (!user || !Array.isArray(user.roles) || !user.roles.includes(role)) {
      return res.json({ ok: true });
    }

    const code = gen6DigitCode();
    const codeHash = await bcrypt.hash(code, 10);

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          resetCodeHash: codeHash,
          resetCodeExp: nowPlusMinutes(RESET_CODE_TTL_MIN).toISOString(),
          resetCodeTries: 0,
          resetRole: role,
        },
        $unset: { resetToken: "", resetTokenExp: "" },
      }
    );

    if (mailEnabled && transporter) {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: emailNorm,
        subject: "Şifre Sıfırlama Kodu",
        text:
          `Şifre sıfırlama kodun: ${code}\n` +
          `Bu kod ${RESET_CODE_TTL_MIN} dakika geçerlidir.\n` +
          `Eğer bu işlemi sen yapmadıysan bu maili yok say.`,
      });
    } else {
      console.log("⚠️ SMTP yok. Reset kodu:", code, "email:", emailNorm);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("FORGOT ERROR:", err);
    return res.json({ ok: true });
  }
});

// ====== VERIFY: kod doğrula -> resetToken ======
app.post("/api/auth/reset/verify", async (req, res) => {
  try {
    const { role, email, code } = req.body || {};
    const emailNorm = normEmail(email);
    const codeStr = String(code || "").trim();

    if (!emailNorm || !codeStr || !isValidRole(role)) {
      return res.status(400).json({ ok: false, message: "E-posta, rol ve kod gerekli." });
    }

    const users = col("users");
    const user = await users.findOne({ email: emailNorm });

    if (!user || user.resetRole !== role || !user.resetCodeHash || !user.resetCodeExp) {
      return res.status(400).json({ ok: false, message: "Kod geçersiz veya süresi dolmuş." });
    }

    if (new Date(user.resetCodeExp) < new Date()) {
      return res.status(400).json({ ok: false, message: "Kodun süresi dolmuş." });
    }

    const tries = Number(user.resetCodeTries || 0);
    if (tries >= 5) {
      return res.status(429).json({ ok: false, message: "Çok fazla deneme. Yeni kod iste." });
    }

    const ok = await bcrypt.compare(codeStr, user.resetCodeHash);
    if (!ok) {
      await users.updateOne({ _id: user._id }, { $inc: { resetCodeTries: 1 } });
      return res.status(400).json({ ok: false, message: "Kod yanlış." });
    }

    const token = genToken();
    await users.updateOne(
      { _id: user._id },
      { $set: { resetToken: token, resetTokenExp: nowPlusMinutes(RESET_TOKEN_TTL_MIN).toISOString() } }
    );

    return res.json({ ok: true, resetToken: token });
  } catch (err) {
    console.error("VERIFY ERROR:", err);
    return res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// ====== RESET: token ile şifreyi değiştir ======
app.post("/api/auth/reset", async (req, res) => {
  try {
    const { role, email, resetToken, newPassword } = req.body || {};
    const emailNorm = normEmail(email);
    const token = String(resetToken || "").trim();
    const pw = String(newPassword || "");

    if (!emailNorm || !token || !pw || !isValidRole(role)) {
      return res.status(400).json({ ok: false, message: "Eksik bilgi." });
    }
    if (pw.length < 6) {
      return res.status(400).json({ ok: false, message: "Şifre en az 6 karakter olmalı." });
    }

    const users = col("users");
    const user = await users.findOne({ email: emailNorm });

    if (!user || user.resetRole !== role || user.resetToken !== token || !user.resetTokenExp) {
      return res.status(400).json({ ok: false, message: "Yetkisiz veya süresi dolmuş." });
    }

    if (new Date(user.resetTokenExp) < new Date()) {
      return res.status(400).json({ ok: false, message: "Sıfırlama oturumu süresi dolmuş." });
    }

    const passwordHash = await bcrypt.hash(pw, 10);

    await users.updateOne(
      { _id: user._id },
      {
        $set: { password: passwordHash },
        $unset: {
          resetCodeHash: "",
          resetCodeExp: "",
          resetCodeTries: "",
          resetToken: "",
          resetTokenExp: "",
          resetRole: "",
        },
      }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("RESET ERROR:", err);
    return res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// ============================
// CLASSES + JOIN (classes, class_members)
// ============================

// Teacher: sınıf oluştur
app.post("/api/classes/create", authRequired, async (req, res) => {
  try {
    if (req.auth.role !== "teacher") {
      return res.status(403).json({ ok: false, message: "Sadece öğretmen." });
    }
    const { name, desc } = req.body || {};
    const n = safeName(name);
    if (!n) return res.status(400).json({ ok: false, message: "Sınıf adı zorunlu." });

    const classes = col("classes");

    // 6 haneli kod benzersiz
    let code = "";
    for (let i = 0; i < 15; i++) {
      code = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        .split("")
        .sort(() => 0.5 - Math.random())
        .slice(0, 6)
        .join("");
      const exists = await classes.findOne({ code });
      if (!exists) break;
    }

    const item = {
      id: makeId("cls"),
      teacherId: req.auth.userId,
      name: n,
      desc: safeName(desc),
      code,
      createdAt: new Date().toISOString(),
    };

    await classes.insertOne(item);
    res.json({ ok: true, class: item });
  } catch (err) {
    console.error("CLASS CREATE ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Teacher: kendi sınıfları
app.get("/api/classes/mine", authRequired, async (req, res) => {
  try {
    if (req.auth.role !== "teacher") return res.status(403).json({ ok: false, message: "Sadece öğretmen." });
    const teacherId = String(req.query.teacherId || "").trim() || req.auth.userId;

    if (teacherId !== req.auth.userId) return res.status(403).json({ ok: false, message: "Yetkisiz." });

    const classes = await col("classes")
      .find({ teacherId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ ok: true, classes });
  } catch (err) {
    console.error("MINE CLASSES ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Code ile sınıf bul
app.get("/api/classes/search", async (req, res) => {
  try {
    const code = String(req.query.code || "").trim().toUpperCase();
    if (code.length !== 6) return res.status(400).json({ ok: false, message: "Kod 6 haneli olmalı." });

    const cls = await col("classes").findOne({ code }, { projection: { _id: 0 } });
    if (!cls) return res.status(404).json({ ok: false, message: "Sınıf bulunamadı." });

    const teacher = await col("users").findOne({ id: cls.teacherId }, { projection: { _id: 0, name: 1 } });
    res.json({ ok: true, class: { ...cls, teacherName: teacher?.name || "" } });
  } catch (err) {
    console.error("CLASS SEARCH ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Öğretmen adına göre sınıf ara
app.get("/api/classes/search-by-teacher", async (req, res) => {
  try {
    const q = String(req.query.teacher || "").trim().toLowerCase();
    if (!q) return res.json({ ok: true, classes: [] });

    const teachers = await col("users")
      .find({ name: { $regex: q, $options: "i" }, roles: "teacher" }, { projection: { _id: 0, id: 1, name: 1 } })
      .limit(20)
      .toArray();

    const teacherIds = teachers.map((t) => t.id);
    if (!teacherIds.length) return res.json({ ok: true, classes: [] });

    const classes = await col("classes")
      .find({ teacherId: { $in: teacherIds } }, { projection: { _id: 0 } })
      .limit(50)
      .toArray();

    const nameMap = new Map(teachers.map((t) => [t.id, t.name]));
    const out = classes.map((c) => ({ ...c, teacherName: nameMap.get(c.teacherId) || "" }));

    res.json({ ok: true, classes: out });
  } catch (err) {
    console.error("SEARCH BY TEACHER ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Sınıfa katıl (student)
app.post("/api/classes/join", authRequired, async (req, res) => {
  try {
    if (req.auth.role !== "student") {
      return res.status(403).json({ ok: false, message: "Sadece öğrenci katılabilir." });
    }

    const { classId, studentName } = req.body || {};
    if (!classId) return res.status(400).json({ ok: false, message: "classId gerekli." });

    const cls = await col("classes").findOne({ id: classId }, { projection: { _id: 0 } });
    if (!cls) return res.status(404).json({ ok: false, message: "Sınıf bulunamadı." });

    const members = col("class_members");
    const exists = await members.findOne({ classId, studentId: req.auth.userId });
    if (exists) return res.json({ ok: true, message: "Zaten üyesin." });

    const mem = {
      id: makeId("mem"),
      classId,
      studentId: req.auth.userId,
      studentName: safeName(studentName) || "Öğrenci",
      joinedAt: new Date().toISOString(),
    };

    await members.insertOne(mem);
    res.json({ ok: true, membership: mem });
  } catch (err) {
    console.error("JOIN ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Öğrencinin katıldığı sınıflar
app.get("/api/classes/my", async (req, res) => {
  try {
    const studentId = String(req.query.studentId || "").trim();
    if (!studentId) return res.json({ ok: true, classes: [] });

    const mems = await col("class_members")
      .find({ studentId }, { projection: { _id: 0, classId: 1 } })
      .toArray();

    const ids = mems.map((m) => m.classId);
    if (!ids.length) return res.json({ ok: true, classes: [] });

    const classes = await col("classes")
      .find({ id: { $in: ids } }, { projection: { _id: 0 } })
      .toArray();

    res.json({ ok: true, classes });
  } catch (err) {
    console.error("MY CLASSES ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// ============================
// ASSIGNMENTS (API)
// ============================

// Teacher: create assignment
app.post("/api/assignments/create", authRequired, async (req, res) => {
  try {
    if (req.auth.role !== "teacher") return res.status(403).json({ ok: false, message: "Sadece öğretmen." });

    const { classId, course, title, desc, due } = req.body || {};
    if (!classId || !course || !title || !due) return res.status(400).json({ ok: false, message: "Eksik alan var." });

    // öğretmen bu sınıfın sahibi mi?
    const cls = await col("classes").findOne({ id: classId }, { projection: { _id: 0 } });
    if (!cls) return res.status(404).json({ ok: false, message: "Sınıf bulunamadı." });
    if (cls.teacherId !== req.auth.userId) return res.status(403).json({ ok: false, message: "Yetkisiz." });

    const item = {
      id: makeId("ass"),
      classId,
      teacherId: req.auth.userId,
      course: safeName(course),
      title: safeName(title),
      desc: safeName(desc),
      due: new Date(due).toISOString(),
      createdAt: new Date().toISOString(),
    };

    await col("assignments").insertOne(item);
    res.json({ ok: true, assignment: item });
  } catch (err) {
    console.error("ASSIGN CREATE ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Student/Teacher: get assignments by class
app.get("/api/assignments/by-class", authRequired, async (req, res) => {
  try {
    const classId = String(req.query.classId || "").trim();
    if (!classId) return res.json({ ok: true, assignments: [] });

    const list = await col("assignments")
      .find({ classId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ ok: true, assignments: list });
  } catch (err) {
    console.error("ASSIGN BY CLASS ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// ============================
// SUBMISSIONS (Upload + Lists + Review)
// ============================

// Student: upload submission
app.post("/api/submissions/upload", authRequired, upload.single("file"), async (req, res) => {
  try {
    if (req.auth.role !== "student") {
      return res.status(403).json({ ok: false, message: "Sadece öğrenci teslim edebilir." });
    }

    const { classId, assignmentId, teacherId, studentName, course, title, studentNote } = req.body || {};
    if (!req.file) return res.status(400).json({ ok: false, message: "Dosya zorunlu." });
    if (!classId || !assignmentId || !teacherId) {
      return res.status(400).json({ ok: false, message: "Eksik alan var." });
    }

    // tekrar teslim engeli (isteğe bağlı)
    const exists = await col("submissions").findOne({
      classId,
      assignmentId,
      studentId: req.auth.userId,
    });
    if (exists) {
      // dosyayı da çöpe at (boşuna dolmasın)
      try { fs.unlinkSync(path.join(uploadDir, req.file.filename)); } catch {}
      return res.status(409).json({ ok: false, message: "Bu ödeve zaten teslim yaptın." });
    }

    const item = {
      id: makeId("sub"),
      classId,
      assignmentId,
      teacherId,
      studentId: req.auth.userId,
      studentName: safeName(studentName) || "Öğrenci",
      course: course || "",
      title: title || "",
      studentNote: studentNote || "",
      submittedAt: new Date().toISOString(),
      status: "pending",
      grade: "",
      feedback: "",

      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      filePath: `/uploads/${req.file.filename}`, // ✅ frontend bunu linkte kullanıyor
      size: req.file.size,
      mimeType: req.file.mimetype,
    };

    await col("submissions").insertOne(item);
    res.json({ ok: true, submission: item });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ ok: false, message: err.message || "Upload başarısız." });
  }
});

// Teacher: class submissions
app.get("/api/teacher/submissions", authRequired, async (req, res) => {
  try {
    if (req.auth.role !== "teacher") {
      return res.status(403).json({ ok: false, message: "Sadece öğretmen." });
    }
    const classId = String(req.query.classId || "").trim();
    if (!classId) return res.json({ ok: true, submissions: [] });

    const subs = await col("submissions")
      .find({ classId, teacherId: req.auth.userId }, { projection: { _id: 0 } })
      .sort({ submittedAt: -1 })
      .toArray();

    res.json({ ok: true, submissions: subs });
  } catch (err) {
    console.error("TEACHER SUBS ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Student: my submissions by class
app.get("/api/student/submissions", authRequired, async (req, res) => {
  try {
    if (req.auth.role !== "student") return res.status(403).json({ ok: false, message: "Sadece öğrenci." });

    const classId = String(req.query.classId || "").trim();
    if (!classId) return res.json({ ok: true, submissions: [] });

    const subs = await col("submissions")
      .find({ classId, studentId: req.auth.userId }, { projection: { _id: 0 } })
      .sort({ submittedAt: -1 })
      .toArray();

    res.json({ ok: true, submissions: subs });
  } catch (err) {
    console.error("STUDENT SUBS ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// Teacher: grade/review submission
app.post("/api/teacher/submissions/review", authRequired, async (req, res) => {
  try {
    if (req.auth.role !== "teacher") return res.status(403).json({ ok: false, message: "Sadece öğretmen." });

    const { submissionId, status, grade, feedback } = req.body || {};
    if (!submissionId) return res.status(400).json({ ok: false, message: "submissionId gerekli." });

    const sub = await col("submissions").findOne({ id: submissionId });
    if (!sub) return res.status(404).json({ ok: false, message: "Teslim bulunamadı." });

    if (sub.teacherId !== req.auth.userId) return res.status(403).json({ ok: false, message: "Yetkisiz." });

    let gradeVal = "";
    if (grade !== "" && grade !== null && typeof grade !== "undefined") {
      const n = Number(grade);
      if (Number.isNaN(n) || n < 0 || n > 100) return res.status(400).json({ ok: false, message: "Not 0-100 olmalı." });
      gradeVal = Math.round(n);
    }

    const st = status === "graded" ? "graded" : "pending";
    const fb = safeName(feedback);

    await col("submissions").updateOne(
      { id: submissionId },
      { $set: { status: st, grade: gradeVal, feedback: fb } }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("REVIEW ERROR:", err);
    res.status(500).json({ ok: false, message: "Sunucu hatası." });
  }
});

// ===== FALLBACK =====
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

// ============================
// START
// ============================
async function start() {
  try {
    console.log("🔌 MongoDB bağlanıyor...");
    await client.connect();
    db = client.db(DB_NAME);
    app.locals.db = db;

    // indexes
    await col("users").createIndex({ email: 1 }, { unique: true });
    await col("classes").createIndex({ code: 1 }, { unique: true });
    await col("class_members").createIndex({ classId: 1, studentId: 1 }, { unique: true });
    await col("assignments").createIndex({ classId: 1, teacherId: 1, createdAt: -1 });
    await col("submissions").createIndex({ classId: 1, teacherId: 1, submittedAt: -1 });
    await col("submissions").createIndex({ classId: 1, assignmentId: 1, studentId: 1 }, { unique: true });

    console.log("✅ MongoDB connected. DB:", DB_NAME);

    app.listen(PORT, () => {
      console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
      console.log(`📁 Uploads: http://localhost:${PORT}/uploads/<dosya>`);
    });
  } catch (err) {
    console.error("❌ START ERROR:", err);
    process.exit(1);
  }
}

start();
