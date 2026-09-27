import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.VERCEL
  ? path.join("/tmp", "idonea-data")
  : path.join(__dirname, "data");
const uploadDir = process.env.VERCEL
  ? path.join("/tmp", "idonea-uploads")
  : path.join(__dirname, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

export const uploadDirPath = uploadDir;
export const db = new DatabaseSync(path.join(dataDir, "app.sqlite"));

db.exec("PRAGMA foreign_keys = ON");

export const uid = () => randomUUID();

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    color: user.color,
  };
}

export function day(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function nowIso() {
  return new Date().toISOString();
}

function schema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      source TEXT NOT NULL DEFAULT 'manual',
      deal_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
      parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'media',
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'aberto',
      position INTEGER NOT NULL DEFAULT 0,
      estimate_hours REAL,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      task_id TEXT,
      deal_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      href TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      minutes INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      work_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS timers (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      value_cents INTEGER NOT NULL DEFAULT 0,
      stage_id TEXT NOT NULL REFERENCES stages(id),
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      expected_close TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      project_id TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS crm_activities (
      id TEXT PRIMARY KEY,
      deal_id TEXT REFERENCES deals(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      user_id TEXT REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      due_at TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function seed() {
  const existing = get("SELECT COUNT(*) AS n FROM users");
  if (existing.n > 0) return;

  const password = bcrypt.hashSync("demo123", 8);
  const created = nowIso();
  // Stable IDs so signed tokens survive Vercel /tmp DB resets
  const carolina = "11111111-1111-4111-8111-111111111111";
  const marcelo = "22222222-2222-4222-8222-222222222222";
  const ana = "33333333-3333-4333-8333-333333333333";

  const people = [
    [carolina, "Carolina Santos", "carolina@idonea.com", "admin", "#c45c26"],
    [marcelo, "Marcelo Santos", "marcelo@idonea.com", "admin", "#2457c5"],
    [ana, "Ana Ribeiro", "ana@idonea.com", "member", "#1f8a70"],
  ];
  for (const [id, name, email, role, color] of people) {
    run(
      "INSERT INTO users (id, name, email, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id,
      name,
      email,
      password,
      role,
      color,
      created
    );
  }

  const gptKey = "idonea-demo-gpt-key-6c4ae275eb2a114a";
  run("INSERT INTO settings (key, value) VALUES ('gpt_api_key', ?)", gptKey);

  const stageNames = [
    ["Prospecção", "open"],
    ["Qualificação", "open"],
    ["Proposta", "open"],
    ["Negociação", "open"],
  ];
  const stages = {};
  stageNames.forEach(([name, kind], index) => {
    const id = uid();
    stages[name] = id;
    run(
      "INSERT INTO stages (id, name, position, kind) VALUES (?, ?, ?, ?)",
      id,
      name,
      index,
      kind
    );
  });

  const companies = {
    aurora: insertCompany("Aurora Alimentos", "https://aurora.exemplo"),
    norte: insertCompany("Norte Solar", "https://nortesolar.exemplo"),
    leme: insertCompany("Oficina Leme", "https://leme.exemplo"),
    vale: insertCompany("Clínica Vale", "https://clinicavale.exemplo"),
    bruma: insertCompany("Estúdio Bruma", "https://bruma.exemplo"),
  };

  const contacts = {
    lia: insertContact(companies.aurora, "Lia Andrade", "lia@aurora.exemplo", "(11) 98801-2201"),
    caio: insertContact(companies.norte, "Caio Mendes", "caio@nortesolar.exemplo", "(11) 97720-4410"),
    rui: insertContact(companies.leme, "Rui Pacheco", "rui@leme.exemplo", "(21) 99610-1188"),
    helena: insertContact(companies.vale, "Helena Prado", "helena@clinicavale.exemplo", "(31) 98440-7721"),
    nina: insertContact(companies.bruma, "Nina Costa", "nina@bruma.exemplo", "(11) 99102-3344"),
  };

  const site = createProject({
    name: "Site institucional",
    description: "Novo site da Idônea, com páginas, conteúdo e publicação.",
    color: "#c45c26",
    ownerId: carolina,
    source: "manual",
  });
  const campanha = createProject({
    name: "Campanha primavera",
    description: "Peças, mídia e aprovação da campanha de primavera.",
    color: "#2457c5",
    ownerId: marcelo,
    source: "manual",
  });
  const vale = createProject({
    name: "Presença digital — Clínica Vale",
    description: "Projeto aberto a partir do negócio ganho com a Clínica Vale.",
    color: "#1f8a70",
    ownerId: ana,
    source: "crm",
  });

  const siteSections = sectionsOf(site.id);
  const campSections = sectionsOf(campanha.id);
  const valeSections = sectionsOf(vale.id);

  const arquitetura = addTask({
    projectId: site.id,
    sectionId: siteSections["Em andamento"],
    title: "Definir arquitetura do site",
    description: "Mapa de páginas, navegação e o que entra na primeira versão.",
    priority: "alta",
    assigneeId: ana,
    due: day(4),
    by: carolina,
    position: 0,
  });
  addTask({
    projectId: site.id,
    sectionId: siteSections["Em andamento"],
    parentId: arquitetura,
    title: "Mapa do site",
    priority: "media",
    assigneeId: ana,
    by: ana,
    status: "concluido",
    position: 0,
  });
  addTask({
    projectId: site.id,
    sectionId: siteSections["Em andamento"],
    parentId: arquitetura,
    title: "Wireframe da home",
    priority: "alta",
    assigneeId: ana,
    due: day(2),
    by: ana,
    position: 1,
  });
  addComment(arquitetura, marcelo, "Ana, consegue incluir a página de cases no mapa? @Ana Ribeiro");
  addComment(arquitetura, ana, "Incluí. Sigo no wireframe da home amanhã.");

  addTask({
    projectId: site.id,
    sectionId: siteSections["A fazer"],
    title: "Redigir página Sobre",
    description: "Texto institucional, equipe e forma de contato.",
    priority: "media",
    assigneeId: marcelo,
    due: day(2),
    by: carolina,
    position: 0,
  });
  addTask({
    projectId: site.id,
    sectionId: siteSections["A fazer"],
    title: "Revisar identidade visual",
    description: "A paleta antiga não funciona no fundo claro. Precisa de decisão antes da home.",
    priority: "urgente",
    assigneeId: carolina,
    due: day(-2),
    by: marcelo,
    position: 1,
  });
  addTask({
    projectId: site.id,
    sectionId: siteSections["A fazer"],
    title: "Publicar política de privacidade",
    description: "Texto jurídico já chegou. Falta responsável e data.",
    priority: "baixa",
    due: day(1),
    by: carolina,
    position: 2,
  });
  const dominio = addTask({
    projectId: site.id,
    sectionId: siteSections["Concluído"],
    title: "Configurar domínio e SSL",
    description: "Domínio apontado e certificado ativo.",
    priority: "alta",
    assigneeId: ana,
    due: day(-10),
    by: carolina,
    status: "concluido",
    position: 0,
  });
  addTime(dominio, ana, 180, "Configuração do DNS e do certificado", "timer", day(-12));
  addTime(dominio, ana, 90, "Teste de renovação", "manual", day(-10));
  const fotos = addTask({
    projectId: site.id,
    sectionId: siteSections["Concluído"],
    title: "Fotografar equipe",
    priority: "media",
    assigneeId: marcelo,
    due: day(-8),
    by: marcelo,
    status: "concluido",
    position: 1,
  });
  addTime(fotos, marcelo, 120, "Sessão no estúdio", "manual", day(-8));

  addTask({
    projectId: campanha.id,
    sectionId: campSections["Em andamento"],
    title: "Planejar peças para Instagram",
    description: "Sequência de 8 peças, com legenda e data de publicação.",
    priority: "alta",
    assigneeId: ana,
    due: day(0),
    by: marcelo,
    position: 0,
  });
  addTask({
    projectId: campanha.id,
    sectionId: campSections["A fazer"],
    title: "Aprovar orçamento de mídia",
    description: "O fornecedor segurou a reserva até o fim do dia.",
    priority: "urgente",
    assigneeId: marcelo,
    due: day(-1),
    by: carolina,
    position: 0,
  });
  const relatorio = addTask({
    projectId: campanha.id,
    sectionId: campSections["Concluído"],
    title: "Relatório da campanha anterior",
    priority: "media",
    assigneeId: carolina,
    due: day(-15),
    by: carolina,
    status: "concluido",
    position: 0,
  });
  addTime(relatorio, carolina, 150, "Leitura dos números", "manual", day(-16));
  addTime(relatorio, carolina, 90, "Versão final do relatório", "timer", day(-15));
  addTask({
    projectId: campanha.id,
    sectionId: campSections["Revisão"],
    title: "Briefing do cliente Aurora",
    description: "Esperando a Lia confirmar o tom de voz.",
    priority: "alta",
    assigneeId: ana,
    due: day(6),
    by: ana,
    position: 0,
  });

  addTask({
    projectId: vale.id,
    sectionId: valeSections["Concluído"],
    title: "Kickoff com o cliente",
    priority: "alta",
    assigneeId: ana,
    due: day(-6),
    by: ana,
    status: "concluido",
    position: 0,
  });
  addTask({
    projectId: vale.id,
    sectionId: valeSections["Em andamento"],
    title: "Levantar requisitos",
    priority: "alta",
    assigneeId: carolina,
    due: day(3),
    by: ana,
    position: 0,
  });
  addTask({
    projectId: vale.id,
    sectionId: valeSections["A fazer"],
    title: "Cronograma inicial",
    priority: "media",
    assigneeId: marcelo,
    due: day(7),
    by: ana,
    position: 0,
  });
  addTask({
    projectId: vale.id,
    sectionId: valeSections["A fazer"],
    title: "Primeira entrega",
    priority: "alta",
    assigneeId: ana,
    due: day(14),
    by: ana,
    position: 1,
  });

  const dealWon = uid();
  run(
    `INSERT INTO deals (id, title, value_cents, stage_id, contact_id, company_id, owner_id, expected_close, status, project_id, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'won', ?, 0, ?)`,
    dealWon,
    "Presença digital — Clínica Vale",
    2800000,
    stages["Negociação"],
    contacts.helena,
    companies.vale,
    ana,
    day(-7),
    vale.id,
    created
  );
  run("UPDATE projects SET deal_id = ? WHERE id = ?", dealWon, vale.id);

  insertDeal({
    title: "Site e conteúdo — Aurora Alimentos",
    cents: 4600000,
    stage: stages["Negociação"],
    contact: contacts.lia,
    company: companies.aurora,
    owner: marcelo,
    close: day(10),
    position: 0,
  });
  insertDeal({
    title: "Campanha de lançamento — Norte Solar",
    cents: 1850000,
    stage: stages["Proposta"],
    contact: contacts.caio,
    company: companies.norte,
    owner: carolina,
    close: day(18),
    position: 0,
  });
  insertDeal({
    title: "Identidade e redes — Oficina Leme",
    cents: 920000,
    stage: stages["Qualificação"],
    contact: contacts.rui,
    company: companies.leme,
    owner: ana,
    close: day(25),
    position: 0,
  });
  insertDeal({
    title: "Catálogo digital — Estúdio Bruma",
    cents: 640000,
    stage: stages["Prospecção"],
    contact: contacts.nina,
    company: companies.bruma,
    owner: marcelo,
    close: day(-1),
    position: 0,
  });
  const lost = insertDeal({
    title: "Anúncios de inverno — Norte Solar",
    cents: 700000,
    stage: stages["Proposta"],
    contact: contacts.caio,
    company: companies.norte,
    owner: carolina,
    close: day(-20),
    position: 1,
    status: "lost",
  });

  const followAurora = uid();
  run(
    `INSERT INTO crm_activities (id, deal_id, contact_id, user_id, type, title, due_at, done, note, created_at)
     VALUES (?, ?, ?, ?, 'reuniao', ?, ?, 0, ?, ?)`,
    followAurora,
    get("SELECT id FROM deals WHERE title = ?", "Site e conteúdo — Aurora Alimentos").id,
    contacts.lia,
    marcelo,
    "Reunião de fechamento com a Lia",
    day(1),
    "Levar a proposta revisada e o cronograma.",
    created
  );
  run(
    `INSERT INTO crm_activities (id, deal_id, contact_id, user_id, type, title, due_at, done, note, created_at)
     VALUES (?, ?, ?, ?, 'ligacao', ?, ?, 0, '', ?)`,
    uid(),
    get("SELECT id FROM deals WHERE title = ?", "Catálogo digital — Estúdio Bruma").id,
    contacts.nina,
    marcelo,
    "Retornar ligação da Nina",
    day(-1),
    created
  );
  run(
    `INSERT INTO crm_activities (id, deal_id, contact_id, user_id, type, title, due_at, done, note, created_at)
     VALUES (?, ?, ?, ?, 'email', ?, ?, 1, ?, ?)`,
    uid(),
    get("SELECT id FROM deals WHERE title = ?", "Campanha de lançamento — Norte Solar").id,
    contacts.caio,
    carolina,
    "Enviar proposta comercial",
    day(-2),
    "Proposta enviada com três cenários de mídia.",
    created
  );

  run(
    `INSERT INTO activities (id, project_id, task_id, user_id, action, detail, created_at)
     VALUES (?, ?, ?, ?, 'criou', ?, ?)`,
    uid(),
    site.id,
    arquitetura,
    carolina,
    "Carolina criou a tarefa Definir arquitetura do site",
    created
  );
  run(
    `INSERT INTO notifications (id, user_id, title, body, href, read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    uid(),
    carolina,
    "Tarefa atrasada",
    "Revisar identidade visual passou do prazo.",
    `project:${site.id}`,
    created
  );
  run(
    `INSERT INTO notifications (id, user_id, title, body, href, read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    uid(),
    carolina,
    "Menção",
    "Marcelo comentou em Definir arquitetura do site.",
    `task:${arquitetura}`,
    created
  );

  void lost;
}

function insertCompany(name, website) {
  const id = uid();
  run(
    "INSERT INTO companies (id, name, website, created_at) VALUES (?, ?, ?, ?)",
    id,
    name,
    website,
    nowIso()
  );
  return id;
}

function insertContact(companyId, name, email, phone) {
  const id = uid();
  run(
    "INSERT INTO contacts (id, company_id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    companyId,
    name,
    email,
    phone,
    nowIso()
  );
  return id;
}

function createProject({ name, description, color, ownerId, source, dealId = null }) {
  const id = uid();
  run(
    `INSERT INTO projects (id, name, description, color, owner_id, source, deal_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    description,
    color,
    ownerId,
    source,
    dealId,
    nowIso()
  );
  const users = all("SELECT id FROM users");
  for (const user of users) {
    run(
      "INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)",
      id,
      user.id,
      user.id === ownerId ? "owner" : "member"
    );
  }
  ["A fazer", "Em andamento", "Revisão", "Concluído"].forEach((section, index) => {
    run(
      "INSERT INTO sections (id, project_id, name, position) VALUES (?, ?, ?, ?)",
      uid(),
      id,
      section,
      index
    );
  });
  return { id };
}

function sectionsOf(projectId) {
  const rows = all("SELECT id, name FROM sections WHERE project_id = ?", projectId);
  return Object.fromEntries(rows.map((row) => [row.name, row.id]));
}

function addTask({
  projectId,
  sectionId,
  parentId = null,
  title,
  description = "",
  priority = "media",
  assigneeId = null,
  due = null,
  by,
  status = "aberto",
  position = 0,
}) {
  const id = uid();
  run(
    `INSERT INTO tasks (id, project_id, section_id, parent_id, title, description, priority, assignee_id, due_date, status, position, created_by, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    projectId,
    sectionId,
    parentId,
    title,
    description,
    priority,
    assigneeId,
    due,
    status,
    position,
    by,
    nowIso(),
    status === "concluido" ? nowIso() : null
  );
  return id;
}

function addComment(taskId, userId, body) {
  run(
    "INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    uid(),
    taskId,
    userId,
    body,
    nowIso()
  );
}

function addTime(taskId, userId, minutes, note, source, workDate) {
  run(
    `INSERT INTO time_entries (id, task_id, user_id, minutes, note, source, work_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    uid(),
    taskId,
    userId,
    minutes,
    note,
    source,
    workDate,
    nowIso()
  );
}

function insertDeal({ title, cents, stage, contact, company, owner, close, position, status = "open" }) {
  const id = uid();
  run(
    `INSERT INTO deals (id, title, value_cents, stage_id, contact_id, company_id, owner_id, expected_close, status, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    title,
    cents,
    stage,
    contact,
    company,
    owner,
    close,
    status,
    position,
    nowIso()
  );
  return id;
}

schema();
seed();
