import { all, get, run, uid, nowIso, day, httpError } from "./db.js";
import { broadcast } from "./events.js";

const PRIORITY = new Set(["baixa", "media", "alta", "urgente"]);

export function touch() {
  broadcast("update");
}

export function logActivity({ projectId = null, taskId = null, dealId = null, userId = null, action, detail }) {
  run(
    `INSERT INTO activities (id, project_id, task_id, deal_id, user_id, action, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    uid(),
    projectId,
    taskId,
    dealId,
    userId,
    action,
    detail,
    nowIso()
  );
}

export function notify(userId, title, body, href = "") {
  if (!userId) return;
  run(
    `INSERT INTO notifications (id, user_id, title, body, href, read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    uid(),
    userId,
    title,
    body,
    href,
    nowIso()
  );
}

function mentions(body, exceptUserId) {
  const users = all("SELECT id, name FROM users").sort((a, b) => b.name.length - a.name.length);
  const lower = body.toLowerCase();
  const found = [];
  for (const user of users) {
    if (user.id === exceptUserId) continue;
    if (lower.includes(`@${user.name.toLowerCase()}`)) found.push(user);
  }
  return found;
}

export function findUserByName(name) {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  const users = all("SELECT * FROM users");
  return (
    users.find((user) => user.name.toLowerCase() === needle) ||
    users.find((user) => user.name.toLowerCase().startsWith(needle)) ||
    users.find((user) => user.name.toLowerCase().includes(needle)) ||
    null
  );
}

export function findProjectByName(name) {
  if (!name) return null;
  const needle = `%${name.trim()}%`;
  return get("SELECT * FROM projects WHERE name LIKE ? ORDER BY created_at DESC", needle);
}

export function findTaskByTitle(title, projectId = null) {
  const needle = `%${title.trim()}%`;
  if (projectId) {
    return get(
      "SELECT * FROM tasks WHERE project_id = ? AND parent_id IS NULL AND title LIKE ? ORDER BY created_at DESC",
      projectId,
      needle
    );
  }
  return get(
    "SELECT * FROM tasks WHERE parent_id IS NULL AND title LIKE ? ORDER BY created_at DESC",
    needle
  );
}

function memberOf(projectId, userId) {
  return get("SELECT 1 AS ok FROM project_members WHERE project_id = ? AND user_id = ?", projectId, userId);
}

export function assertProjectAccess(projectId, user) {
  const project = get("SELECT * FROM projects WHERE id = ?", projectId);
  if (!project) throw httpError(404, "Projeto não encontrado.");
  if (user.role !== "admin" && !memberOf(projectId, user.id)) {
    throw httpError(403, "Você não participa deste projeto.");
  }
  return project;
}

export function taskCardSql(where, ...params) {
  return all(
    `SELECT t.*,
        u.name AS assignee_name, u.color AS assignee_color,
        p.name AS project_name, p.color AS project_color,
        s.name AS section_name,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM tasks ch WHERE ch.parent_id = t.id) AS subtask_count,
        (SELECT COUNT(*) FROM tasks ch WHERE ch.parent_id = t.id AND ch.status = 'concluido') AS subtask_done,
        (SELECT COALESCE(SUM(minutes), 0) FROM time_entries te WHERE te.task_id = t.id) AS minutes,
        (SELECT COUNT(*) FROM attachments a WHERE a.task_id = t.id) AS attachment_count
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN sections s ON s.id = t.section_id
     ${where}
     ORDER BY t.position, t.created_at`,
    ...params
  );
}

export function listProjects(user) {
  if (user.role === "admin") {
    return all(
      `SELECT p.*,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL AND t.status = 'aberto') AS open_tasks,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL AND t.status = 'aberto' AND t.due_date IS NOT NULL AND t.due_date < ?) AS overdue_tasks
       FROM projects p ORDER BY p.created_at DESC`,
      day(0)
    );
  }
  return all(
    `SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL AND t.status = 'aberto') AS open_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL AND t.status = 'aberto' AND t.due_date IS NOT NULL AND t.due_date < ?) AS overdue_tasks
     FROM projects p
     JOIN project_members m ON m.project_id = p.id
     WHERE m.user_id = ?
     ORDER BY p.created_at DESC`,
    day(0),
    user.id
  );
}

export function createProject(user, { name, description = "", color = "#c45c26", memberIds = [] }) {
  if (!name || !name.trim()) throw httpError(400, "Dê um nome ao projeto.");
  const id = uid();
  run(
    `INSERT INTO projects (id, name, description, color, owner_id, source, created_at)
     VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
    id,
    name.trim(),
    description.trim(),
    color,
    user.id,
    nowIso()
  );
  const ids = new Set([user.id, ...memberIds, ...all("SELECT id FROM users").map((person) => person.id)]);
  for (const memberId of ids) {
    if (!get("SELECT id FROM users WHERE id = ?", memberId)) continue;
    run(
      "INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)",
      id,
      memberId,
      memberId === user.id ? "owner" : "member"
    );
  }
  ["A fazer", "Em andamento", "Revisão", "Concluído"].forEach((section, index) => {
    run("INSERT INTO sections (id, project_id, name, position) VALUES (?, ?, ?, ?)", uid(), id, section, index);
  });
  logActivity({
    projectId: id,
    userId: user.id,
    action: "criou",
    detail: `${user.name} criou o projeto ${name.trim()}`,
  });
  touch();
  return get("SELECT * FROM projects WHERE id = ?", id);
}

export function deleteProject(user, projectId) {
  const project = assertProjectAccess(projectId, user);
  if (user.role !== "admin" && project.owner_id !== user.id) {
    throw httpError(403, "Só o dono do projeto, ou um administrador, pode excluí-lo.");
  }
  run("UPDATE deals SET project_id = NULL WHERE project_id = ?", projectId);
  run("DELETE FROM activities WHERE project_id = ?", projectId);
  run("DELETE FROM projects WHERE id = ?", projectId);
  logActivity({
    userId: user.id,
    action: "excluiu",
    detail: `${user.name} excluiu o projeto ${project.name}`,
  });
  touch();
  return { ok: true, id: projectId };
}

export function board(projectId, user) {
  const project = assertProjectAccess(projectId, user);
  const sections = all("SELECT * FROM sections WHERE project_id = ? ORDER BY position", projectId);
  const tasks = taskCardSql("WHERE t.project_id = ? AND t.parent_id IS NULL", projectId);
  const members = all(
    `SELECT u.id, u.name, u.email, u.color, u.role, m.role AS member_role
     FROM project_members m JOIN users u ON u.id = m.user_id
     WHERE m.project_id = ? ORDER BY u.name`,
    projectId
  );
  return {
    project,
    members,
    sections: sections.map((section) => ({
      ...section,
      tasks: tasks.filter((task) => task.section_id === section.id),
    })),
  };
}

export function createTask(user, input) {
  const title = (input.title || "").trim();
  if (!title) throw httpError(400, "A tarefa precisa de um título.");
  const project = assertProjectAccess(input.project_id, user);
  let sectionId = input.section_id;
  if (!sectionId) {
    const first = get("SELECT id FROM sections WHERE project_id = ? ORDER BY position LIMIT 1", project.id);
    sectionId = first?.id || null;
  }
  if (input.parent_id) {
    const parent = get("SELECT * FROM tasks WHERE id = ?", input.parent_id);
    if (!parent || parent.project_id !== project.id) throw httpError(400, "Subtarefa inválida.");
  }
  const priority = PRIORITY.has(input.priority) ? input.priority : "media";
  const positionRow = get(
    "SELECT COALESCE(MAX(position), -1) AS max_pos FROM tasks WHERE section_id IS ? AND parent_id IS ?",
    sectionId,
    input.parent_id || null
  );
  const id = uid();
  run(
    `INSERT INTO tasks (id, project_id, section_id, parent_id, title, description, priority, assignee_id, due_date, status, position, estimate_hours, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberto', ?, ?, ?, ?)`,
    id,
    project.id,
    sectionId,
    input.parent_id || null,
    title,
    (input.description || "").trim(),
    priority,
    input.assignee_id || null,
    input.due_date || null,
    (positionRow?.max_pos ?? -1) + 1,
    input.estimate_hours || null,
    user.id,
    nowIso()
  );
  if (input.assignee_id && input.assignee_id !== user.id) {
    notify(input.assignee_id, "Nova tarefa", `${user.name} atribuiu “${title}” a você.`, `task:${id}`);
  }
  logActivity({
    projectId: project.id,
    taskId: id,
    userId: user.id,
    action: "criou",
    detail: `${user.name} criou a tarefa ${title}`,
  });
  touch();
  return taskDetail(id, user);
}

export function updateTask(user, id, input) {
  const task = get("SELECT * FROM tasks WHERE id = ?", id);
  if (!task) throw httpError(404, "Tarefa não encontrada.");
  assertProjectAccess(task.project_id, user);
  const next = {
    title: input.title !== undefined ? String(input.title).trim() : task.title,
    description: input.description !== undefined ? String(input.description) : task.description,
    priority: input.priority && PRIORITY.has(input.priority) ? input.priority : task.priority,
    assignee_id: input.assignee_id !== undefined ? input.assignee_id || null : task.assignee_id,
    due_date: input.due_date !== undefined ? input.due_date || null : task.due_date,
    estimate_hours: input.estimate_hours !== undefined ? input.estimate_hours : task.estimate_hours,
    status: input.status === "concluido" || input.status === "aberto" ? input.status : task.status,
  };
  if (!next.title) throw httpError(400, "A tarefa precisa de um título.");
  let completedAt = task.completed_at;
  if (next.status === "concluido" && task.status !== "concluido") completedAt = nowIso();
  if (next.status === "aberto" && task.status === "concluido") completedAt = null;
  if (next.status === "concluido") {
    const doneSection = get(
      "SELECT id FROM sections WHERE project_id = ? AND name = 'Concluído'",
      task.project_id
    );
    if (doneSection && !task.parent_id) next.sectionMove = doneSection.id;
  }
  run(
    `UPDATE tasks SET title = ?, description = ?, priority = ?, assignee_id = ?, due_date = ?, estimate_hours = ?, status = ?, completed_at = ?
     WHERE id = ?`,
    next.title,
    next.description,
    next.priority,
    next.assignee_id,
    next.due_date,
    next.estimate_hours,
    next.status,
    completedAt,
    id
  );
  if (next.sectionMove && next.sectionMove !== task.section_id) {
    moveTask(user, id, { section_id: next.sectionMove, index: 0, silent: true });
  }
  if (next.assignee_id && next.assignee_id !== task.assignee_id && next.assignee_id !== user.id) {
    notify(next.assignee_id, "Tarefa atribuída", `${user.name} atribuiu “${next.title}” a você.`, `task:${id}`);
  }
  logActivity({
    projectId: task.project_id,
    taskId: id,
    userId: user.id,
    action: "atualizou",
    detail: `${user.name} atualizou a tarefa ${next.title}`,
  });
  touch();
  return taskDetail(id, user);
}

export function moveTask(user, id, { section_id, index = 0, silent = false }) {
  const task = get("SELECT * FROM tasks WHERE id = ?", id);
  if (!task) throw httpError(404, "Tarefa não encontrada.");
  assertProjectAccess(task.project_id, user);
  const section = get("SELECT * FROM sections WHERE id = ? AND project_id = ?", section_id, task.project_id);
  if (!section) throw httpError(400, "Coluna inválida.");
  run("UPDATE tasks SET section_id = ? WHERE id = ?", section.id, id);
  if (section.name === "Concluído") {
    run("UPDATE tasks SET status = 'concluido', completed_at = COALESCE(completed_at, ?) WHERE id = ?", nowIso(), id);
  } else if (task.status === "concluido") {
    run("UPDATE tasks SET status = 'aberto', completed_at = NULL WHERE id = ?", id);
  }
  const siblings = all(
    "SELECT id FROM tasks WHERE section_id = ? AND parent_id IS NULL ORDER BY position, created_at",
    section.id
  ).map((row) => row.id);
  const ordered = siblings.filter((taskId) => taskId !== id);
  const at = Math.max(0, Math.min(index, ordered.length));
  ordered.splice(at, 0, id);
  ordered.forEach((taskId, position) => run("UPDATE tasks SET position = ? WHERE id = ?", position, taskId));
  if (!silent) {
    logActivity({
      projectId: task.project_id,
      taskId: id,
      userId: user.id,
      action: "moveu",
      detail: `${user.name} moveu “${task.title}” para ${section.name}`,
    });
    touch();
  }
  return get("SELECT * FROM tasks WHERE id = ?", id);
}

export function deleteTask(user, id) {
  const task = get("SELECT * FROM tasks WHERE id = ?", id);
  if (!task) throw httpError(404, "Tarefa não encontrada.");
  assertProjectAccess(task.project_id, user);
  if (user.role !== "admin" && task.created_by !== user.id) {
    throw httpError(403, "Só quem criou a tarefa, ou um administrador, pode excluí-la.");
  }
  run("DELETE FROM tasks WHERE id = ?", id);
  logActivity({
    projectId: task.project_id,
    userId: user.id,
    action: "excluiu",
    detail: `${user.name} excluiu a tarefa ${task.title}`,
  });
  touch();
  return { ok: true };
}

export function taskDetail(id, user) {
  const rows = taskCardSql("WHERE t.id = ?", id);
  const task = rows[0];
  if (!task) throw httpError(404, "Tarefa não encontrada.");
  assertProjectAccess(task.project_id, user);
  const subtasks = all(
    `SELECT t.*, u.name AS assignee_name, u.color AS assignee_color
     FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.parent_id = ? ORDER BY t.position, t.created_at`,
    id
  );
  const comments = all(
    `SELECT c.*, u.name AS user_name, u.color AS user_color
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.task_id = ? ORDER BY c.created_at`,
    id
  );
  const attachments = all(
    "SELECT id, filename, size, created_at, user_id FROM attachments WHERE task_id = ? ORDER BY created_at DESC",
    id
  );
  const timeEntries = all(
    `SELECT te.*, u.name AS user_name FROM time_entries te JOIN users u ON u.id = te.user_id
     WHERE te.task_id = ? ORDER BY te.work_date DESC, te.created_at DESC`,
    id
  );
  return { ...task, subtasks, comments, attachments, timeEntries, estimate: estimateFor(task) };
}

export function addComment(user, taskId, body) {
  const text = (body || "").trim();
  if (!text) throw httpError(400, "Escreva um comentário.");
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) throw httpError(404, "Tarefa não encontrada.");
  assertProjectAccess(task.project_id, user);
  const id = uid();
  run(
    "INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    taskId,
    user.id,
    text,
    nowIso()
  );
  const people = mentions(text, user.id);
  for (const person of people) {
    notify(person.id, "Menção", `${user.name} mencionou você em “${task.title}”.`, `task:${taskId}`);
  }
  if (task.assignee_id && task.assignee_id !== user.id && !people.some((person) => person.id === task.assignee_id)) {
    notify(task.assignee_id, "Novo comentário", `${user.name} comentou em “${task.title}”.`, `task:${taskId}`);
  }
  logActivity({
    projectId: task.project_id,
    taskId,
    userId: user.id,
    action: "comentou",
    detail: `${user.name} comentou em ${task.title}`,
  });
  touch();
  return all(
    `SELECT c.*, u.name AS user_name, u.color AS user_color FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    id
  )[0];
}

export function saveAttachment(user, taskId, file) {
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) throw httpError(404, "Tarefa não encontrada.");
  assertProjectAccess(task.project_id, user);
  const id = uid();
  run(
    `INSERT INTO attachments (id, task_id, user_id, filename, stored_name, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    taskId,
    user.id,
    file.originalname,
    file.filename,
    file.size,
    nowIso()
  );
  logActivity({
    projectId: task.project_id,
    taskId,
    userId: user.id,
    action: "anexou",
    detail: `${user.name} anexou ${file.originalname}`,
  });
  touch();
  return get("SELECT id, filename, size, created_at FROM attachments WHERE id = ?", id);
}

export function startTimer(user, taskId) {
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) throw httpError(404, "Tarefa não encontrada.");
  assertProjectAccess(task.project_id, user);
  const running = get("SELECT * FROM timers WHERE user_id = ?", user.id);
  if (running) stopTimer(user);
  run("INSERT INTO timers (user_id, task_id, started_at) VALUES (?, ?, ?)", user.id, taskId, nowIso());
  touch();
  return runningTimer(user);
}

export function stopTimer(user) {
  const running = get("SELECT * FROM timers WHERE user_id = ?", user.id);
  if (!running) return null;
  const started = new Date(running.started_at).getTime();
  const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
  run("DELETE FROM timers WHERE user_id = ?", user.id);
  const id = uid();
  run(
    `INSERT INTO time_entries (id, task_id, user_id, minutes, note, source, work_date, created_at)
     VALUES (?, ?, ?, ?, '', 'timer', ?, ?)`,
    id,
    running.task_id,
    user.id,
    minutes,
    day(0),
    nowIso()
  );
  const task = get("SELECT title, project_id FROM tasks WHERE id = ?", running.task_id);
  logActivity({
    projectId: task?.project_id,
    taskId: running.task_id,
    userId: user.id,
    action: "tempo",
    detail: `${user.name} registrou ${formatMinutes(minutes)} em ${task?.title || "uma tarefa"}`,
  });
  touch();
  return get("SELECT * FROM time_entries WHERE id = ?", id);
}

export function runningTimer(user) {
  const row = get(
    `SELECT tm.*, t.title, t.project_id, p.name AS project_name
     FROM timers tm JOIN tasks t ON t.id = tm.task_id JOIN projects p ON p.id = t.project_id
     WHERE tm.user_id = ?`,
    user.id
  );
  return row || null;
}

export function manualTime(user, { task_id, minutes, note = "", work_date }) {
  const task = get("SELECT * FROM tasks WHERE id = ?", task_id);
  if (!task) throw httpError(404, "Tarefa não encontrada.");
  assertProjectAccess(task.project_id, user);
  const amount = Math.round(Number(minutes));
  if (!amount || amount < 1 || amount > 24 * 60) throw httpError(400, "Informe os minutos, entre 1 e 1440.");
  const id = uid();
  run(
    `INSERT INTO time_entries (id, task_id, user_id, minutes, note, source, work_date, created_at)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
    id,
    task.id,
    user.id,
    amount,
    note.trim(),
    work_date || day(0),
    nowIso()
  );
  logActivity({
    projectId: task.project_id,
    taskId: task.id,
    userId: user.id,
    action: "tempo",
    detail: `${user.name} lançou ${formatMinutes(amount)} em ${task.title}`,
  });
  touch();
  return get("SELECT * FROM time_entries WHERE id = ?", id);
}

export function timeReport(query = {}) {
  const from = query.from;
  const to = query.to;
  const userId = query.userId || query.user_id;
  const projectId = query.projectId || query.project_id;
  const start = from || day(-30);
  const end = to || day(0);
  const filters = ["te.work_date >= ?", "te.work_date <= ?"];
  const params = [start, end];
  if (userId) {
    filters.push("te.user_id = ?");
    params.push(userId);
  }
  if (projectId) {
    filters.push("t.project_id = ?");
    params.push(projectId);
  }
  const where = filters.join(" AND ");
  const entries = all(
    `SELECT te.*, u.name AS user_name, t.title AS task_title, p.name AS project_name, p.id AS project_id
     FROM time_entries te
     JOIN users u ON u.id = te.user_id
     JOIN tasks t ON t.id = te.task_id
     JOIN projects p ON p.id = t.project_id
     WHERE ${where}
     ORDER BY te.work_date DESC, te.created_at DESC`,
    ...params
  );
  const byUser = all(
    `SELECT u.id, u.name, COALESCE(SUM(te.minutes), 0) AS minutes
     FROM time_entries te JOIN users u ON u.id = te.user_id JOIN tasks t ON t.id = te.task_id
     WHERE ${where} GROUP BY u.id ORDER BY minutes DESC`,
    ...params
  );
  const byProject = all(
    `SELECT p.id, p.name, COALESCE(SUM(te.minutes), 0) AS minutes
     FROM time_entries te JOIN tasks t ON t.id = te.task_id JOIN projects p ON p.id = t.project_id
     WHERE ${where} GROUP BY p.id ORDER BY minutes DESC`,
    ...params
  );
  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  return { from: start, to: end, total, entries, byUser, byProject };
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}min`;
}

export function estimateFor(task) {
  const samples = all(
    `SELECT SUM(te.minutes) AS minutes
     FROM tasks t JOIN time_entries te ON te.task_id = t.id
     WHERE t.project_id = ? AND t.status = 'concluido' AND t.parent_id IS NULL AND t.id != ?
     GROUP BY t.id`,
    task.project_id,
    task.id
  ).map((row) => row.minutes).filter((value) => value > 0);
  if (!samples.length) {
    return { hours: task.estimate_hours || 4, source: task.estimate_hours ? "informada" : "padrão" };
  }
  samples.sort((a, b) => a - b);
  const mid = samples[Math.floor(samples.length / 2)];
  return { hours: Math.round((mid / 60) * 10) / 10, source: "histórico", samples: samples.length };
}

export function risks(user) {
  const projects = listProjects(user).map((project) => project.id);
  if (!projects.length) return [];
  const placeholders = projects.map(() => "?").join(",");
  const tasks = taskCardSql(
    `WHERE t.parent_id IS NULL AND t.status = 'aberto' AND t.project_id IN (${placeholders})`,
    ...projects
  );
  const today = day(0);
  const soon = day(3);
  const items = [];
  for (const task of tasks) {
    let level = null;
    let reason = "";
    if (task.due_date && task.due_date < today) {
      level = "alto";
      reason = "O prazo já passou e a tarefa continua aberta.";
    } else if (task.due_date && task.due_date <= soon && task.minutes === 0) {
      level = "medio";
      reason = "O prazo está perto e ainda não há hora lançada.";
    } else if (!task.assignee_id && task.due_date) {
      level = "medio";
      reason = "Tem prazo, mas ninguém foi designado.";
    }
    if (level) items.push({ ...task, level, reason, estimate: estimateFor(task) });
  }
  const rank = { alto: 0, medio: 1 };
  items.sort((a, b) => rank[a.level] - rank[b.level] || String(a.due_date).localeCompare(String(b.due_date)));
  return items;
}

export function projectSummary(projectId, user) {
  const project = assertProjectAccess(projectId, user);
  const tasks = all("SELECT * FROM tasks WHERE project_id = ? AND parent_id IS NULL", projectId);
  const open = tasks.filter((task) => task.status === "aberto");
  const done = tasks.filter((task) => task.status === "concluido");
  const overdue = open.filter((task) => task.due_date && task.due_date < day(0));
  const minutes = get(
    `SELECT COALESCE(SUM(te.minutes), 0) AS minutes
     FROM time_entries te JOIN tasks t ON t.id = te.task_id WHERE t.project_id = ?`,
    projectId
  ).minutes;
  const text = [
    `${project.name}: ${done.length} de ${tasks.length} tarefas concluídas.`,
    overdue.length ? `${overdue.length} atrasada${overdue.length > 1 ? "s" : ""}.` : "Nenhuma tarefa atrasada.",
    `${formatMinutes(minutes)} registradas no projeto.`,
    open.length ? `Em aberto: ${open.slice(0, 4).map((task) => task.title).join("; ")}.` : "Nada em aberto.",
  ].join(" ");
  return { project, open: open.length, done: done.length, overdue: overdue.length, minutes, text };
}

export function dashboard(user) {
  const projects = listProjects(user);
  const ids = projects.map((project) => project.id);
  let myTasks = [];
  let overdue = 0;
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    myTasks = taskCardSql(
      `WHERE t.assignee_id = ? AND t.status = 'aberto' AND t.parent_id IS NULL AND t.project_id IN (${placeholders})`,
      user.id,
      ...ids
    ).slice(0, 8);
    overdue = get(
      `SELECT COUNT(*) AS n FROM tasks WHERE status = 'aberto' AND parent_id IS NULL AND due_date IS NOT NULL AND due_date < ? AND project_id IN (${placeholders})`,
      day(0),
      ...ids
    ).n;
  }
  const hoursWeek = get(
    "SELECT COALESCE(SUM(minutes), 0) AS minutes FROM time_entries WHERE user_id = ? AND work_date >= ?",
    user.id,
    day(-6)
  ).minutes;
  const openDeals = get(
    "SELECT COALESCE(SUM(value_cents), 0) AS cents, COUNT(*) AS n FROM deals WHERE status = 'open'"
  );
  return {
    projects,
    myTasks,
    overdue,
    hoursWeek,
    openDeals,
    risks: risks(user).slice(0, 5),
    activity: all(
      `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 10`
    ),
  };
}

function ensureSection(projectId, name) {
  let section = get("SELECT * FROM sections WHERE project_id = ? AND name = ?", projectId, name);
  if (section) return section;
  const pos = get("SELECT COALESCE(MAX(position), -1) AS p FROM sections WHERE project_id = ?", projectId).p + 1;
  const id = uid();
  run("INSERT INTO sections (id, project_id, name, position) VALUES (?, ?, ?, ?)", id, projectId, name, pos);
  return get("SELECT * FROM sections WHERE id = ?", id);
}

function addImportedTask(user, projectId, sectionId, item, source) {
  const assignee = item.assignee ? findUserByName(item.assignee) : null;
  const id = uid();
  const status = item.completed ? "concluido" : "aberto";
  const position = get(
    "SELECT COALESCE(MAX(position), -1) AS p FROM tasks WHERE section_id = ? AND parent_id IS NULL",
    sectionId
  ).p + 1;
  run(
    `INSERT INTO tasks (id, project_id, section_id, title, description, priority, assignee_id, due_date, status, position, created_by, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    projectId,
    sectionId,
    item.title,
    item.description || `Importado de ${source}.`,
    PRIORITY.has(item.priority) ? item.priority : "media",
    assignee?.id || null,
    item.due_date || null,
    status,
    position,
    user.id,
    nowIso(),
    status === "concluido" ? nowIso() : null
  );
  for (const [index, sub] of (item.subtasks || []).entries()) {
    const subId = uid();
    run(
      `INSERT INTO tasks (id, project_id, section_id, parent_id, title, description, priority, status, position, created_by, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, '', 'media', ?, ?, ?, ?, ?)`,
      subId,
      projectId,
      sectionId,
      id,
      typeof sub === "string" ? sub : sub.title,
      sub.completed ? "concluido" : "aberto",
      index,
      user.id,
      nowIso(),
      sub.completed ? nowIso() : null
    );
  }
  return id;
}

export function importAsanaPayload(user, payload) {
  const projects = payload.projects || [];
  if (!projects.length) throw httpError(400, "O arquivo do Asana não tem projetos.");
  let taskCount = 0;
  const created = [];
  for (const item of projects) {
    const existing = get("SELECT * FROM projects WHERE name = ? AND source = 'asana'", item.name || "Projeto Asana");
    if (existing) {
      created.push(existing.name);
      continue;
    }
    const project = createProject(user, {
      name: item.name || "Projeto Asana",
      description: item.notes || "Importado do Asana.",
      color: "#c45c26",
    });
    run("UPDATE projects SET source = 'asana' WHERE id = ?", project.id);
    if (item.sections?.length) {
      run("DELETE FROM sections WHERE project_id = ?", project.id);
      item.sections.forEach((name, index) => {
        run(
          "INSERT INTO sections (id, project_id, name, position) VALUES (?, ?, ?, ?)",
          uid(),
          project.id,
          name,
          index
        );
      });
    }
    for (const task of item.tasks || []) {
      const sectionName = task.section || (task.completed ? "Concluído" : "A fazer");
      const section = ensureSection(project.id, sectionName);
      addImportedTask(user, project.id, section.id, task, "Asana");
      taskCount += 1;
    }
    created.push(project.name);
  }
  logActivity({
    userId: user.id,
    action: "importou",
    detail: `${user.name} importou ${created.length} projeto(s) do Asana`,
  });
  touch();
  return { projects: created.length, tasks: taskCount, names: created };
}

export function importClockifyPayload(user, payload) {
  const entries = payload.entries || [];
  if (!entries.length) throw httpError(400, "O arquivo do Clockify não tem horas.");
  let linked = 0;
  let createdTasks = 0;
  let skipped = 0;
  for (const entry of entries) {
    const person = findUserByName(entry.user) || user;
    let project = entry.project ? findProjectByName(entry.project) : null;
    if (!project) {
      project = createProject(user, {
        name: entry.project || "Horas importadas do Clockify",
        description: "Projeto criado na importação do Clockify.",
        color: "#2457c5",
      });
      run("UPDATE projects SET source = 'clockify' WHERE id = ?", project.id);
    }
    let task = entry.description ? findTaskByTitle(entry.description, project.id) : null;
    if (!task) {
      const section = ensureSection(project.id, "Importado");
      const id = addImportedTask(
        user,
        project.id,
        section.id,
        { title: entry.description || "Hora sem descrição", assignee: person.name },
        "Clockify"
      );
      task = get("SELECT * FROM tasks WHERE id = ?", id);
      createdTasks += 1;
    }
    const minutes = Math.max(1, Math.round(Number(entry.minutes || entry.durationHours * 60 || 0)));
    const workDate = (entry.date || nowIso()).slice(0, 10);
    const duplicate = get(
      `SELECT id FROM time_entries
       WHERE task_id = ? AND user_id = ? AND minutes = ? AND work_date = ? AND source = 'clockify'`,
      task.id,
      person.id,
      minutes,
      workDate
    );
    if (duplicate) {
      skipped += 1;
      continue;
    }
    run(
      `INSERT INTO time_entries (id, task_id, user_id, minutes, note, source, work_date, created_at)
       VALUES (?, ?, ?, ?, ?, 'clockify', ?, ?)`,
      uid(),
      task.id,
      person.id,
      minutes,
      entry.note || "Importado do Clockify",
      workDate,
      nowIso()
    );
    linked += 1;
  }
  logActivity({
    userId: user.id,
    action: "importou",
    detail: `${user.name} importou ${linked} lançamento(s) do Clockify`,
  });
  touch();
  return { entries: linked, tasksCreated: createdTasks, skipped };
}

async function asanaFetch(token, path) {
  const url = path.startsWith("http")
    ? path
    : `https://app.asana.com/api/1.0${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.errors?.[0]?.message || "Não foi possível falar com o Asana.";
    throw httpError(response.status === 401 ? 401 : 502, message);
  }
  return body;
}

async function asanaGet(token, path) {
  const body = await asanaFetch(token, path);
  return body.data;
}

async function asanaGetAll(token, path) {
  const rows = [];
  let next = path.includes("?") ? `${path}&limit=100` : `${path}?limit=100`;
  let guard = 0;
  while (next && guard < 200) {
    guard += 1;
    const body = await asanaFetch(token, next);
    rows.push(...(body.data || []));
    next = body.next_page?.path || null;
  }
  return rows;
}

export async function importAsanaToken(user, token) {
  if (!token) throw httpError(400, "Informe o token do Asana.");
  const workspaces = await asanaGet(token, "/workspaces?limit=100");
  if (!workspaces.length) throw httpError(400, "O token não enxerga nenhum workspace do Asana.");
  const projects = await asanaGetAll(
    token,
    `/projects?workspace=${workspaces[0].gid}&opt_fields=name,notes`
  );
  const payload = { projects: [] };
  for (const project of projects) {
    const sections = await asanaGetAll(token, `/projects/${project.gid}/sections`);
    const tasks = await asanaGetAll(
      token,
      `/tasks?project=${project.gid}&opt_fields=name,notes,due_on,completed,assignee.name,memberships.section.name`
    );
    payload.projects.push({
      name: project.name,
      notes: project.notes || "",
      sections: sections.map((section) => section.name),
      tasks: tasks.map((task) => ({
        title: task.name,
        description: task.notes || "",
        due_date: task.due_on,
        completed: Boolean(task.completed),
        assignee: task.assignee?.name || "",
        section: task.memberships?.[0]?.section?.name || sections[0]?.name || "A fazer",
      })),
    });
  }
  return importAsanaPayload(user, payload);
}

function clockifyMinutes(duration) {
  if (!duration) return 0;
  const match = String(duration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return Number(match[1] || 0) * 60 + Number(match[2] || 0) + Math.round(Number(match[3] || 0) / 60);
}

async function clockifyGet(apiKey, path) {
  const response = await fetch(`https://api.clockify.me/api/v1${path}`, {
    headers: { "X-Api-Key": apiKey },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || "Não foi possível falar com o Clockify.";
    throw httpError(response.status === 401 ? 401 : 502, message);
  }
  return body;
}

async function clockifyGetAllPages(apiKey, basePath) {
  const rows = [];
  let page = 1;
  const pageSize = 200;
  let guard = 0;
  while (guard < 250) {
    guard += 1;
    const sep = basePath.includes("?") ? "&" : "?";
    const chunk = await clockifyGet(apiKey, `${basePath}${sep}page=${page}&page-size=${pageSize}`);
    const list = Array.isArray(chunk) ? chunk : [];
    rows.push(...list);
    if (list.length < pageSize) break;
    page += 1;
  }
  return rows;
}

export async function importClockifyKey(user, apiKey) {
  if (!apiKey) throw httpError(400, "Informe a chave do Clockify.");
  const me = await clockifyGet(apiKey, "/user");
  const workspaces = await clockifyGet(apiKey, "/workspaces");
  if (!workspaces.length) throw httpError(400, "A chave não enxerga nenhum workspace do Clockify.");
  const workspace = workspaces[0];
  const projects = await clockifyGetAllPages(apiKey, `/workspaces/${workspace.id}/projects`);
  const projectName = Object.fromEntries(projects.map((project) => [project.id, project.name]));
  let members = [];
  try {
    members = await clockifyGetAllPages(apiKey, `/workspaces/${workspace.id}/users`);
  } catch {
    members = [{ id: me.id, name: me.name }];
  }
  if (!members.length) members = [{ id: me.id, name: me.name }];

  const entries = [];
  for (const member of members) {
    const memberEntries = await clockifyGetAllPages(
      apiKey,
      `/workspaces/${workspace.id}/user/${member.id}/time-entries`
    );
    for (const entry of memberEntries) {
      const minutes = clockifyMinutes(entry.timeInterval?.duration);
      if (minutes <= 0) continue;
      entries.push({
        description: entry.description || "Hora sem descrição",
        project: projectName[entry.projectId] || "Clockify",
        user: member.name || me.name,
        minutes,
        date: entry.timeInterval?.start,
        note: "Importado da API do Clockify",
      });
    }
  }
  if (!entries.length) throw httpError(400, "Não há horas lançadas nesse usuário do Clockify.");
  return importClockifyPayload(user, { entries });
}

export const sampleAsana = {
  projects: [
    {
      name: "Histórico Asana — Redesign",
      notes: "Projeto trazido do histórico do Asana para não perder o trabalho anterior.",
      sections: ["Backlog", "Fazendo", "Feito"],
      tasks: [
        {
          title: "Mapear páginas do site antigo",
          section: "Feito",
          completed: true,
          assignee: "Ana Ribeiro",
          due_date: null,
          description: "Inventário das páginas que ainda recebem visita.",
          subtasks: ["Home", "Serviços", "Contato"],
        },
        {
          title: "Migrar depoimentos",
          section: "Fazendo",
          assignee: "Marcelo Santos",
          description: "Copiar os depoimentos aprovados.",
        },
        {
          title: "Revisar SEO das páginas principais",
          section: "Backlog",
          assignee: "Carolina Santos",
          priority: "alta",
        },
      ],
    },
  ],
};

export const sampleClockify = {
  entries: [
    {
      description: "Mapear páginas do site antigo",
      project: "Histórico Asana — Redesign",
      user: "Ana Ribeiro",
      durationHours: 3.5,
      date: day(-12),
      note: "Histórico preservado do Clockify",
    },
    {
      description: "Migrar depoimentos",
      project: "Histórico Asana — Redesign",
      user: "Marcelo Santos",
      durationHours: 2,
      date: day(-4),
      note: "Histórico preservado do Clockify",
    },
    {
      description: "Revisar SEO das páginas principais",
      project: "Histórico Asana — Redesign",
      user: "Carolina Santos",
      durationHours: 1.5,
      date: day(-1),
      note: "Histórico preservado do Clockify",
    },
  ],
};

function resolveDue(word) {
  if (!word) return null;
  const value = word.toLowerCase();
  if (value === "hoje") return day(0);
  if (value.startsWith("amanh")) return day(1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

export function localParse(text) {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  if (/^(tarefas? em risco|riscos?|quem pode atrasar)/.test(lower)) return { action: "risks" };
  const summary = raw.match(/^resumo(?:\s+do\s+projeto)?(?:\s+(.+))?$/i);
  if (summary) return { action: "summarize", project: (summary[1] || "").trim() };
  const hours = raw.match(/registrar\s+(\d+(?:[.,]\d+)?)\s+horas?\s+na\s+tarefa\s+(.+)/i);
  if (hours) return { action: "log_time", hours: Number(hours[1].replace(",", ".")), task: hours[2].trim() };
  const comment = raw.match(/comentar\s+na\s+tarefa\s+(.+?):\s*(.+)/i);
  if (comment) return { action: "add_comment", task: comment[1].trim(), comment: comment[2].trim() };
  const done = raw.match(/(?:concluir|finalizar|completar)\s+(?:a\s+)?tarefa\s+(.+)/i);
  if (done) return { action: "update_task", task: done[1].trim(), status: "concluido" };
  const move = raw.match(/(?:atualizar|mover)\s+(?:a\s+)?tarefa\s+(.+?)\s+para\s+(.+)/i);
  if (move) return { action: "update_task", task: move[1].trim(), target: move[2].trim() };
  const create = raw.match(/criar\s+tarefa\s+(.+)/i);
  if (create) {
    let rest = create[1];
    const pull = (regex) => {
      const match = rest.match(regex);
      if (!match) return null;
      rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
      return match[1];
    };
    const priority = pull(/prioridade\s+(baixa|m[eé]dia|media|alta|urgente)/i);
    const due = pull(/(?:até|ate)\s+(hoje|amanh[aã]|\d{4}-\d{2}-\d{2})/i);
    const assignee = pull(/para\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i);
    const project = pull(/no\s+projeto\s+(.+?)(?=\s+para\s+|\s+at[eé]\s+|\s+prioridade\s+|$)/i);
    return {
      action: "create_task",
      title: rest.replace(/^["“]|["”]$/g, "").trim(),
      project,
      assignee,
      due,
      priority: priority ? priority.toLowerCase().replace("média", "media").replace("média", "media") : "media",
    };
  }
  return null;
}

async function interpret(text) {
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Converta o pedido em JSON com as chaves action (create_task, update_task, add_comment, log_time, summarize, risks), title, project, assignee, due (YYYY-MM-DD, hoje ou amanhã), priority (baixa, media, alta, urgente), task, status (aberto ou concluido), comment, hours. Use null no que não existir.",
            },
            { role: "user", content: text },
          ],
        }),
      });
      const body = await response.json();
      const parsed = JSON.parse(body.choices?.[0]?.message?.content || "null");
      if (parsed?.action) return parsed;
    } catch {
      /* segue no interpretador local */
    }
  }
  return localParse(text);
}

export async function aiCommand(user, body) {
  const parsed = body.action ? body : await interpret(body.text || "");
  if (!parsed?.action) {
    throw httpError(
      400,
      "Não entendi o pedido. Exemplos: criar tarefa, concluir tarefa, comentar na tarefa, registrar horas, resumo do projeto."
    );
  }
  if (parsed.priority) parsed.priority = String(parsed.priority).toLowerCase().replace("média", "media");
  if (parsed.action === "risks") {
    const items = risks(user).slice(0, 6);
    return {
      message: items.length
        ? items.map((item) => `${item.level === "alto" ? "Alto" : "Médio"}: ${item.title} — ${item.reason}`).join(" ")
        : "Nenhuma tarefa em risco agora.",
      result: items,
    };
  }
  if (parsed.action === "summarize") {
    const project = parsed.project ? findProjectByName(parsed.project) : listProjects(user)[0];
    if (!project) throw httpError(404, "Não encontrei esse projeto.");
    const summary = projectSummary(project.id, user);
    return { message: summary.text, result: summary };
  }
  if (parsed.action === "create_task") {
    const project = parsed.project ? findProjectByName(parsed.project) : null;
    if (!project) throw httpError(400, "Diga em qual projeto a tarefa entra. Exemplo: no projeto Site institucional.");
    const assignee = parsed.assignee ? findUserByName(parsed.assignee) : null;
    const task = createTask(user, {
      project_id: project.id,
      title: parsed.title,
      description: parsed.description || "",
      priority: parsed.priority || "media",
      assignee_id: assignee?.id,
      due_date: resolveDue(parsed.due),
    });
    return {
      message: `Tarefa criada: ${task.title}, no projeto ${project.name}.${assignee ? ` Responsável: ${assignee.name}.` : ""}`,
      result: { id: task.id, title: task.title, project: project.name },
    };
  }
  if (parsed.action === "update_task") {
    const task = findTaskByTitle(parsed.task || parsed.title || "");
    if (!task) throw httpError(404, "Não encontrei essa tarefa.");
    if (parsed.status === "concluido" || /conclu|feito/.test(String(parsed.target || "").toLowerCase())) {
      updateTask(user, task.id, { status: "concluido" });
      return { message: `Tarefa concluída: ${task.title}.`, result: { id: task.id } };
    }
    const target = parsed.target || parsed.section || "";
    const section = get(
      "SELECT * FROM sections WHERE project_id = ? AND name LIKE ?",
      task.project_id,
      `%${target}%`
    );
    if (!section) throw httpError(400, "Não encontrei essa coluna. Use A fazer, Em andamento, Revisão ou Concluído.");
    moveTask(user, task.id, { section_id: section.id, index: 0 });
    return { message: `“${task.title}” foi para ${section.name}.`, result: { id: task.id, section: section.name } };
  }
  if (parsed.action === "add_comment") {
    const task = findTaskByTitle(parsed.task || "");
    if (!task) throw httpError(404, "Não encontrei essa tarefa.");
    addComment(user, task.id, parsed.comment || parsed.body || "");
    return { message: `Comentário registrado em ${task.title}.`, result: { id: task.id } };
  }
  if (parsed.action === "log_time") {
    const task = findTaskByTitle(parsed.task || "");
    if (!task) throw httpError(404, "Não encontrei essa tarefa.");
    const amount = parsed.minutes && !parsed.hours ? Number(parsed.minutes) : Math.round(Number(parsed.hours) * 60);
    manualTime(user, { task_id: task.id, minutes: amount, note: parsed.note || "Lançado pelo comando" });
    return { message: `${formatMinutes(amount)} registradas em ${task.title}.`, result: { id: task.id, minutes: amount } };
  }
  throw httpError(400, "Ação não reconhecida.");
}

export function crmBoard() {
  const stages = all("SELECT * FROM stages WHERE kind = 'open' ORDER BY position");
  const deals = all(
    `SELECT d.*, s.name AS stage_name, c.name AS contact_name, co.name AS company_name,
        u.name AS owner_name, u.color AS owner_color
     FROM deals d
     JOIN stages s ON s.id = d.stage_id
     LEFT JOIN contacts c ON c.id = d.contact_id
     LEFT JOIN companies co ON co.id = d.company_id
     LEFT JOIN users u ON u.id = d.owner_id
     WHERE d.status = 'open'
     ORDER BY d.position, d.created_at`
  );
  const activities = all("SELECT * FROM crm_activities");
  return {
    stages: stages.map((stage) => ({
      ...stage,
      deals: deals
        .filter((deal) => deal.stage_id === stage.id)
        .map((deal) => ({ ...deal, prediction: predict(deal, stage, activities) })),
    })),
  };
}

export function predict(deal, stage, activities) {
  const weights = { Prospecção: 18, Qualificação: 36, Proposta: 58, Negociação: 78 };
  let score = weights[stage.name] ?? 40;
  const related = activities.filter((item) => item.deal_id === deal.id);
  const overdue = related.filter((item) => !item.done && item.due_at && item.due_at < day(0));
  const done = related.filter((item) => item.done).length;
  if (overdue.length) score -= 12;
  score += Math.min(12, done * 4);
  if (deal.expected_close && deal.expected_close < day(0)) score -= 10;
  score = Math.max(8, Math.min(92, score));
  const reason = overdue.length
    ? "Há follow-up atrasado, então a chance cai."
    : done
      ? "As atividades feitas sustentam essa chance."
      : "A chance segue a etapa do funil.";
  return { score, reason };
}

export function createDeal(user, input) {
  const title = (input.title || "").trim();
  if (!title) throw httpError(400, "O negócio precisa de um título.");
  const stage = input.stage_id
    ? get("SELECT * FROM stages WHERE id = ?", input.stage_id)
    : get("SELECT * FROM stages WHERE kind = 'open' ORDER BY position LIMIT 1");
  if (!stage) throw httpError(400, "Crie uma etapa antes.");
  const id = uid();
  run(
    `INSERT INTO deals (id, title, value_cents, stage_id, contact_id, company_id, owner_id, expected_close, status, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    id,
    title,
    Math.round(Number(input.value_cents || 0)),
    stage.id,
    input.contact_id || null,
    input.company_id || null,
    input.owner_id || user.id,
    input.expected_close || null,
    get("SELECT COALESCE(MAX(position), -1) AS p FROM deals WHERE stage_id = ?", stage.id).p + 1,
    nowIso()
  );
  logActivity({ dealId: id, userId: user.id, action: "criou", detail: `${user.name} abriu o negócio ${title}` });
  touch();
  return get("SELECT * FROM deals WHERE id = ?", id);
}

export function moveDeal(user, id, stageId, index = 0) {
  const deal = get("SELECT * FROM deals WHERE id = ?", id);
  if (!deal) throw httpError(404, "Negócio não encontrado.");
  if (deal.status !== "open") throw httpError(400, "Esse negócio já foi encerrado.");
  const stage = get("SELECT * FROM stages WHERE id = ? AND kind = 'open'", stageId);
  if (!stage) throw httpError(400, "Etapa inválida.");
  run("UPDATE deals SET stage_id = ? WHERE id = ?", stage.id, id);
  const siblings = all("SELECT id FROM deals WHERE stage_id = ? AND status = 'open' ORDER BY position", stage.id)
    .map((row) => row.id)
    .filter((dealId) => dealId !== id);
  const at = Math.max(0, Math.min(index, siblings.length));
  siblings.splice(at, 0, id);
  siblings.forEach((dealId, position) => run("UPDATE deals SET position = ? WHERE id = ?", position, dealId));
  logActivity({
    dealId: id,
    userId: user.id,
    action: "moveu",
    detail: `${user.name} moveu “${deal.title}” para ${stage.name}`,
  });
  touch();
  return get("SELECT * FROM deals WHERE id = ?", id);
}

export function winDeal(user, id) {
  const deal = get("SELECT * FROM deals WHERE id = ?", id);
  if (!deal) throw httpError(404, "Negócio não encontrado.");
  if (deal.project_id) {
    run("UPDATE deals SET status = 'won' WHERE id = ?", id);
    return { deal: get("SELECT * FROM deals WHERE id = ?", id), project_id: deal.project_id, created: false };
  }
  const project = createProject(user, {
    name: deal.title,
    description: "Projeto criado automaticamente quando o negócio foi ganho.",
    color: "#1f8a70",
    memberIds: deal.owner_id ? [deal.owner_id] : [],
  });
  run("UPDATE projects SET source = 'crm', deal_id = ? WHERE id = ?", id, project.id);
  const sections = all("SELECT * FROM sections WHERE project_id = ? ORDER BY position", project.id);
  const first = sections[0];
  for (const [index, title] of ["Kickoff com o cliente", "Levantar requisitos", "Cronograma inicial", "Primeira entrega"].entries()) {
    run(
      `INSERT INTO tasks (id, project_id, section_id, title, description, priority, assignee_id, status, position, created_by, created_at)
       VALUES (?, ?, ?, ?, '', 'alta', ?, 'aberto', ?, ?, ?)`,
      uid(),
      project.id,
      first.id,
      title,
      deal.owner_id,
      index,
      user.id,
      nowIso()
    );
  }
  run("UPDATE deals SET status = 'won', project_id = ? WHERE id = ?", project.id, id);
  notify(deal.owner_id, "Negócio ganho", `${deal.title} virou um projeto.`, `project:${project.id}`);
  logActivity({
    projectId: project.id,
    dealId: id,
    userId: user.id,
    action: "ganhou",
    detail: `${user.name} ganhou “${deal.title}” e abriu o projeto`,
  });
  touch();
  return { deal: get("SELECT * FROM deals WHERE id = ?", id), project_id: project.id, created: true };
}

export function loseDeal(user, id) {
  const deal = get("SELECT * FROM deals WHERE id = ?", id);
  if (!deal) throw httpError(404, "Negócio não encontrado.");
  run("UPDATE deals SET status = 'lost' WHERE id = ?", id);
  logActivity({ dealId: id, userId: user.id, action: "perdeu", detail: `${user.name} marcou “${deal.title}” como perdido` });
  touch();
  return get("SELECT * FROM deals WHERE id = ?", id);
}

export function crmReports() {
  const byStage = all(
    `SELECT s.name, COUNT(d.id) AS count, COALESCE(SUM(d.value_cents), 0) AS value_cents
     FROM stages s LEFT JOIN deals d ON d.stage_id = s.id AND d.status = 'open'
     WHERE s.kind = 'open' GROUP BY s.id ORDER BY s.position`
  );
  const byOwner = all(
    `SELECT u.name,
        SUM(CASE WHEN d.status = 'open' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN d.status = 'won' THEN 1 ELSE 0 END) AS won_count,
        SUM(CASE WHEN d.status = 'lost' THEN 1 ELSE 0 END) AS lost_count,
        SUM(CASE WHEN d.status = 'won' THEN d.value_cents ELSE 0 END) AS won_cents
     FROM deals d JOIN users u ON u.id = d.owner_id
     GROUP BY u.id ORDER BY won_cents DESC`
  );
  const totals = get(
    `SELECT
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost,
        SUM(CASE WHEN status = 'open' THEN value_cents ELSE 0 END) AS open_cents
     FROM deals`
  );
  const closed = (totals.won || 0) + (totals.lost || 0);
  const activities = all("SELECT * FROM crm_activities");
  const openDeals = all(
    `SELECT d.*, s.name AS stage_name FROM deals d JOIN stages s ON s.id = d.stage_id WHERE d.status = 'open'`
  );
  return {
    byStage,
    byOwner,
    conversion: closed ? Math.round((totals.won / closed) * 100) : 0,
    won: totals.won || 0,
    lost: totals.lost || 0,
    openCents: totals.open_cents || 0,
    predictions: openDeals.map((deal) => {
      const stage = { name: deal.stage_name };
      const prediction = predict(deal, stage, activities);
      return { id: deal.id, title: deal.title, stage: deal.stage_name, ...prediction };
    }),
  };
}

export function createCompany(input) {
  const name = (input.name || "").trim();
  if (!name) throw httpError(400, "A empresa precisa de um nome.");
  const id = uid();
  run(
    "INSERT INTO companies (id, name, website, created_at) VALUES (?, ?, ?, ?)",
    id,
    name,
    (input.website || "").trim(),
    nowIso()
  );
  touch();
  return get("SELECT * FROM companies WHERE id = ?", id);
}

export function createContact(input) {
  const name = (input.name || "").trim();
  if (!name) throw httpError(400, "O contato precisa de um nome.");
  const id = uid();
  run(
    "INSERT INTO contacts (id, company_id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    input.company_id || null,
    name,
    (input.email || "").trim(),
    (input.phone || "").trim(),
    nowIso()
  );
  touch();
  return get(
    `SELECT c.*, co.name AS company_name FROM contacts c LEFT JOIN companies co ON co.id = c.company_id WHERE c.id = ?`,
    id
  );
}

export function createActivity(user, input) {
  const title = (input.title || "").trim();
  if (!title) throw httpError(400, "A atividade precisa de um título.");
  const id = uid();
  run(
    `INSERT INTO crm_activities (id, deal_id, contact_id, user_id, type, title, due_at, done, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    id,
    input.deal_id || null,
    input.contact_id || null,
    user.id,
    input.type || "tarefa",
    title,
    input.due_at || null,
    (input.note || "").trim(),
    nowIso()
  );
  touch();
  return get("SELECT * FROM crm_activities WHERE id = ?", id);
}

export function toggleActivity(id) {
  const row = get("SELECT * FROM crm_activities WHERE id = ?", id);
  if (!row) throw httpError(404, "Atividade não encontrada.");
  run("UPDATE crm_activities SET done = ? WHERE id = ?", row.done ? 0 : 1, id);
  touch();
  return get("SELECT * FROM crm_activities WHERE id = ?", id);
}

export function createSection(user, projectId, name) {
  assertProjectAccess(projectId, user);
  const clean = (name || "").trim();
  if (!clean) throw httpError(400, "Dê um nome à coluna.");
  const id = uid();
  const position = get("SELECT COALESCE(MAX(position), -1) AS p FROM sections WHERE project_id = ?", projectId).p + 1;
  run("INSERT INTO sections (id, project_id, name, position) VALUES (?, ?, ?, ?)", id, projectId, clean, position);
  touch();
  return get("SELECT * FROM sections WHERE id = ?", id);
}

export function searchTasks(user, q) {
  const term = (q || "").trim();
  const projects = listProjects(user).map((project) => project.id);
  if (!term || !projects.length) return [];
  const placeholders = projects.map(() => "?").join(",");
  return taskCardSql(
    `WHERE t.parent_id IS NULL AND t.project_id IN (${placeholders}) AND (t.title LIKE ? OR t.description LIKE ?)`,
    ...projects,
    `%${term}%`,
    `%${term}%`
  ).slice(0, 20);
}

export function renameStage(user, id, name) {
  if (user.role !== "admin") throw httpError(403, "Só um administrador muda as etapas.");
  const clean = (name || "").trim();
  if (!clean) throw httpError(400, "A etapa precisa de um nome.");
  run("UPDATE stages SET name = ? WHERE id = ?", clean, id);
  touch();
  return get("SELECT * FROM stages WHERE id = ?", id);
}

export function createStage(user, name) {
  if (user.role !== "admin") throw httpError(403, "Só um administrador cria etapas.");
  const clean = (name || "").trim();
  if (!clean) throw httpError(400, "A etapa precisa de um nome.");
  const id = uid();
  const position = get("SELECT COALESCE(MAX(position), -1) AS p FROM stages WHERE kind = 'open'").p + 1;
  run("INSERT INTO stages (id, name, position, kind) VALUES (?, ?, ?, 'open')", id, clean, position);
  touch();
  return get("SELECT * FROM stages WHERE id = ?", id);
}
