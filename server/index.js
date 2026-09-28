import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { all, get, run, uid, nowIso, publicUser, uploadDirPath, httpError } from "./db.js";
import { issueToken, verifyToken } from "./authToken.js";
import { addClient, removeClient } from "./events.js";
import * as logic from "./logic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirPath,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\- ]+/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return req.query.token || "";
}

function auth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (apiKey) {
    const setting = get("SELECT value FROM settings WHERE key = 'gpt_api_key'");
    if (setting && setting.value === apiKey) {
      req.user = get("SELECT * FROM users WHERE role = 'admin' ORDER BY name LIMIT 1");
      req.viaGpt = true;
      return next();
    }
  }
  const token = tokenFrom(req);
  const claims = verifyToken(token);
  let user = null;
  if (claims) {
    user =
      get("SELECT * FROM users WHERE id = ?", claims.sub) ||
      get("SELECT * FROM users WHERE email = ?", claims.email);
  } else if (token) {
    // legacy DB session (local / older clients)
    user = get("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?", token);
  }
  if (!user) return res.status(401).json({ error: "Faça login para continuar." });
  req.user = user;
  next();
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get("/api/health", (_req, res) => {
  const users = get("SELECT COUNT(*) AS n FROM users");
  res.json({
    ok: true,
    service: "idonea",
    time: nowIso(),
    users: users?.n ?? 0,
    vercel: Boolean(process.env.VERCEL),
    dataDir: process.env.DATA_DIR || null,
  });
});

app.post("/api/auth/login", wrap((req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = get("SELECT * FROM users WHERE email = ?", email);
  if (!user || !bcrypt.compareSync(req.body.password || "", user.password_hash)) {
    throw httpError(401, "E-mail ou senha incorretos.");
  }
  const token = issueToken(user);
  run("INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, user.id, nowIso());
  res.json({ token, user: publicUser(user) });
}));

app.post("/api/auth/register", wrap((req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) throw httpError(400, "Informe o nome.");
  if (!email.includes("@")) throw httpError(400, "Informe um e-mail válido.");
  if (password.length < 6) throw httpError(400, "A senha precisa ter pelo menos 6 caracteres.");
  if (get("SELECT id FROM users WHERE email = ?", email)) throw httpError(400, "Esse e-mail já está em uso.");
  const id = uid();
  const colors = ["#c45c26", "#2457c5", "#1f8a70", "#7a4e2d", "#8a3d55"];
  run(
    "INSERT INTO users (id, name, email, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, 'member', ?, ?)",
    id,
    name,
    email,
    bcrypt.hashSync(password, 8),
    colors[Math.floor(Math.random() * colors.length)],
    nowIso()
  );
  const user = get("SELECT * FROM users WHERE id = ?", id);
  const token = issueToken(user);
  run("INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, id, nowIso());
  const projects = all("SELECT id, owner_id FROM projects");
  for (const project of projects) {
    run("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'member')", project.id, id);
  }
  res.json({ token, user: publicUser(user) });
}));

app.post("/api/auth/logout", (req, res) => {
  const token = tokenFrom(req);
  if (token) run("DELETE FROM sessions WHERE token = ?", token);
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => {
  const gpt = get("SELECT value FROM settings WHERE key = 'gpt_api_key'");
  res.json({
    user: publicUser(req.user),
    gptKey: req.user.role === "admin" ? gpt?.value : undefined,
  });
});

app.get("/api/users", auth, (_req, res) => {
  res.json(all("SELECT id, name, email, role, color FROM users ORDER BY name"));
});

app.post("/api/users", auth, wrap((req, res) => {
  if (req.user.role !== "admin") throw httpError(403, "Só um administrador adiciona pessoas.");
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = req.body.role === "admin" ? "admin" : "member";
  if (name.length < 2 || !email.includes("@") || password.length < 6) {
    throw httpError(400, "Informe nome, e-mail e uma senha com pelo menos 6 caracteres.");
  }
  if (get("SELECT id FROM users WHERE email = ?", email)) throw httpError(400, "Esse e-mail já está em uso.");
  const id = uid();
  run(
    "INSERT INTO users (id, name, email, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    name,
    email,
    bcrypt.hashSync(password, 8),
    role,
    "#7a4e2d",
    nowIso()
  );
  for (const project of all("SELECT id FROM projects")) {
    run("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'member')", project.id, id);
  }
  res.json(publicUser(get("SELECT * FROM users WHERE id = ?", id)));
}));

app.get("/api/dashboard", auth, wrap((req, res) => res.json(logic.dashboard(req.user))));
app.get("/api/search", auth, wrap((req, res) => res.json(logic.searchTasks(req.user, req.query.q || ""))));

app.get("/api/projects", auth, wrap((req, res) => res.json(logic.listProjects(req.user))));
app.post("/api/projects", auth, wrap((req, res) => res.json(logic.createProject(req.user, req.body))));
app.delete("/api/projects/:id", auth, wrap((req, res) => res.json(logic.deleteProject(req.user, req.params.id))));
app.get("/api/projects/:id/board", auth, wrap((req, res) => res.json(logic.board(req.params.id, req.user))));
app.post("/api/projects/:id/sections", auth, wrap((req, res) => {
  res.json(logic.createSection(req.user, req.params.id, req.body.name));
}));

app.get("/api/tasks", auth, wrap((req, res) => {
  const projects = logic.listProjects(req.user).map((project) => project.id);
  if (!projects.length) return res.json([]);
  const placeholders = projects.map(() => "?").join(",");
  const filters = [`t.parent_id IS NULL`, `t.project_id IN (${placeholders})`];
  const params = [...projects];
  if (req.query.project_id) {
    filters.push("t.project_id = ?");
    params.push(req.query.project_id);
  }
  if (req.query.mine === "1") {
    filters.push("t.assignee_id = ?");
    params.push(req.user.id);
  }
  res.json(logic.taskCardSql(`WHERE ${filters.join(" AND ")}`, ...params));
}));

app.post("/api/tasks", auth, wrap((req, res) => res.json(logic.createTask(req.user, req.body))));
app.get("/api/tasks/:id", auth, wrap((req, res) => res.json(logic.taskDetail(req.params.id, req.user))));
app.patch("/api/tasks/:id", auth, wrap((req, res) => res.json(logic.updateTask(req.user, req.params.id, req.body))));
app.delete("/api/tasks/:id", auth, wrap((req, res) => res.json(logic.deleteTask(req.user, req.params.id))));
app.post("/api/tasks/:id/move", auth, wrap((req, res) => {
  res.json(logic.moveTask(req.user, req.params.id, req.body));
}));
app.post("/api/tasks/:id/comments", auth, wrap((req, res) => {
  res.json(logic.addComment(req.user, req.params.id, req.body.body));
}));
app.post("/api/tasks/:id/attachments", auth, upload.single("file"), wrap((req, res) => {
  if (!req.file) throw httpError(400, "Escolha um arquivo.");
  res.json(logic.saveAttachment(req.user, req.params.id, req.file));
}));

app.get("/api/attachments/:id", auth, wrap((req, res) => {
  const file = get("SELECT * FROM attachments WHERE id = ?", req.params.id);
  if (!file) throw httpError(404, "Anexo não encontrado.");
  const task = get("SELECT project_id FROM tasks WHERE id = ?", file.task_id);
  logic.assertProjectAccess(task.project_id, req.user);
  res.download(path.join(uploadDirPath, file.stored_name), file.filename);
}));

app.get("/api/notifications", auth, (req, res) => {
  res.json(all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", req.user.id));
});
app.post("/api/notifications/read-all", auth, (req, res) => {
  run("UPDATE notifications SET read = 1 WHERE user_id = ?", req.user.id);
  res.json({ ok: true });
});
app.post("/api/notifications/:id/read", auth, (req, res) => {
  run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get("/api/activity", auth, wrap((req, res) => {
  if (req.query.project_id) {
    logic.assertProjectAccess(req.query.project_id, req.user);
    return res.json(all(
      `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.project_id = ? ORDER BY a.created_at DESC LIMIT 40`,
      req.query.project_id
    ));
  }
  res.json(all(
    `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 40`
  ));
}));

app.get("/api/time/running", auth, wrap((req, res) => res.json(logic.runningTimer(req.user))));
app.post("/api/time/start", auth, wrap((req, res) => res.json(logic.startTimer(req.user, req.body.task_id))));
app.post("/api/time/stop", auth, wrap((req, res) => res.json(logic.stopTimer(req.user))));
app.post("/api/time/manual", auth, wrap((req, res) => res.json(logic.manualTime(req.user, req.body))));
app.get("/api/time/report", auth, wrap((req, res) => res.json(logic.timeReport(req.query))));

app.post("/api/import/asana", auth, wrap(async (req, res) => {
  if (req.body.token) return res.json(await logic.importAsanaToken(req.user, req.body.token.trim()));
  if (req.body.sample) return res.json(logic.importAsanaPayload(req.user, logic.sampleAsana));
  res.json(logic.importAsanaPayload(req.user, req.body.payload || req.body));
}));
app.post("/api/import/clockify", auth, wrap(async (req, res) => {
  if (req.body.apiKey) return res.json(await logic.importClockifyKey(req.user, req.body.apiKey.trim()));
  if (req.body.sample) return res.json(logic.importClockifyPayload(req.user, logic.sampleClockify));
  res.json(logic.importClockifyPayload(req.user, req.body.payload || req.body));
}));

app.get("/api/ai/risks", auth, wrap((req, res) => res.json(logic.risks(req.user))));
app.get("/api/ai/summary", auth, wrap((req, res) => res.json(logic.projectSummary(req.query.project_id, req.user))));
app.post("/api/ai/command", auth, wrap(async (req, res) => res.json(await logic.aiCommand(req.user, req.body))));
app.post("/api/gpt", auth, wrap(async (req, res) => res.json(await logic.aiCommand(req.user, req.body))));

app.get("/api/crm/board", auth, wrap((_req, res) => res.json(logic.crmBoard())));
app.post("/api/crm/stages", auth, wrap((req, res) => res.json(logic.createStage(req.user, req.body.name))));
app.patch("/api/crm/stages/:id", auth, wrap((req, res) => res.json(logic.renameStage(req.user, req.params.id, req.body.name))));
app.post("/api/crm/deals", auth, wrap((req, res) => res.json(logic.createDeal(req.user, req.body))));
app.post("/api/crm/deals/:id/move", auth, wrap((req, res) => {
  res.json(logic.moveDeal(req.user, req.params.id, req.body.stage_id, req.body.index || 0));
}));
app.post("/api/crm/deals/:id/win", auth, wrap((req, res) => res.json(logic.winDeal(req.user, req.params.id))));
app.post("/api/crm/deals/:id/lose", auth, wrap((req, res) => res.json(logic.loseDeal(req.user, req.params.id))));
app.get("/api/crm/companies", auth, (_req, res) => res.json(all("SELECT * FROM companies ORDER BY name")));
app.post("/api/crm/companies", auth, wrap((req, res) => res.json(logic.createCompany(req.body))));
app.get("/api/crm/contacts", auth, (_req, res) => {
  res.json(all(
    `SELECT c.*, co.name AS company_name FROM contacts c LEFT JOIN companies co ON co.id = c.company_id ORDER BY c.name`
  ));
});
app.post("/api/crm/contacts", auth, wrap((req, res) => res.json(logic.createContact(req.body))));
app.get("/api/crm/activities", auth, (_req, res) => {
  res.json(all(
    `SELECT a.*, d.title AS deal_title, u.name AS user_name, c.name AS contact_name
     FROM crm_activities a
     LEFT JOIN deals d ON d.id = a.deal_id
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN contacts c ON c.id = a.contact_id
     ORDER BY a.done, a.due_at`
  ));
});
app.post("/api/crm/activities", auth, wrap((req, res) => res.json(logic.createActivity(req.user, req.body))));
app.post("/api/crm/activities/:id/toggle", auth, wrap((req, res) => res.json(logic.toggleActivity(req.params.id))));
app.get("/api/crm/reports", auth, wrap((_req, res) => res.json(logic.crmReports())));

app.get("/api/events", auth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);
  addClient(res);
  const beat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(beat); }
  }, 25000);
  req.on("close", () => {
    clearInterval(beat);
    removeClient(res);
  });
});

const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: error.message || "Erro interno." });
});

export default app;

if (!process.env.VERCEL) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`API em http://localhost:${port}`);
  });
}
