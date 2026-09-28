import { useEffect, useState } from "react";
import { DndContext, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { api, formatDate, hoursLabel, money, priorityLabel, today } from "./api.js";
import { priorityLabels, localizeApiError, useI18n, useT, useTx } from "./i18n.jsx";
import { Loader } from "./Loader.jsx";

export function Dashboard({ tick, onOpenProject, onOpenTask }) {
  const t = useT();
  const tx = useTx();
  const { locale } = useI18n();
  const [data, setData] = useState(null);
  useEffect(() => { api("/api/dashboard").then(setData).catch(() => {}); }, [tick]);
  if (!data) return <Loader />;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t("dash.title")}</h1>
          <p className="muted">{t("dash.lead")}</p>
        </div>
      </div>
      <div className="grid stats">
        <div className="stat"><span className="muted">{t("dash.overdue")}</span><b>{data.overdue}</b></div>
        <div className="stat"><span className="muted">{t("dash.hoursWeek")}</span><b>{hoursLabel(data.hoursWeek, t)}</b></div>
        <div className="stat"><span className="muted">{t("dash.openDeals")}</span><b>{money(data.openDeals.cents, locale)}</b></div>
        <div className="stat"><span className="muted">{t("dash.projects")}</span><b>{data.projects.length}</b></div>
      </div>
      <div className="split">
        <section className="panel">
          <h2>{t("dash.myTasks")}</h2>
          {data.myTasks.length === 0 && <p className="empty-state">{t("dash.noTasks")}</p>}
          {data.myTasks.map((task) => (
            <button key={task.id} className="taskline" onClick={() => onOpenTask(task.id)}>
              <span>{tx(task.title)}</span>
              <span className={task.due_date && task.due_date < today() ? "pill late" : "muted"}>{task.due_date ? formatDate(task.due_date, locale) : tx(task.project_name)}</span>
            </button>
          ))}
          <h2 style={{ marginTop: 22 }}>{t("dash.projects")}</h2>
          {data.projects.map((project) => (
            <button key={project.id} className="taskline" onClick={() => onOpenProject(project.id)}>
              <span><i className="dot" style={{ background: project.color, display: "inline-block", width: 10, height: 10, marginRight: 8 }} />{tx(project.name)}</span>
              <span className="muted">{t("dash.openCount", { n: project.open_tasks })}{project.overdue_tasks ? t("dash.overdueCount", { n: project.overdue_tasks }) : ""}</span>
            </button>
          ))}
        </section>
        <section className="panel">
          <h2>{t("dash.risk")}</h2>
          {data.risks.length === 0 && <p className="empty-state">{t("dash.noRisk")}</p>}
          {data.risks.map((task) => (
            <button key={task.id} className="taskline" onClick={() => onOpenTask(task.id)}>
              <span>{tx(task.title)}</span>
              <span className={`pill ${task.level === "alto" ? "urgente" : "alta"}`}>{task.level === "alto" ? t("dash.high") : t("dash.medium")}</span>
            </button>
          ))}
          <h2 style={{ marginTop: 22 }}>{t("dash.activity")}</h2>
          {data.activity.length === 0 && <p className="empty-state">{t("dash.noActivity")}</p>}
          {data.activity.map((item) => (
            <p key={item.id} className="muted" style={{ marginTop: 10, lineHeight: 1.45 }}>{tx(item.detail)}</p>
          ))}
        </section>
      </div>
    </div>
  );
}

export function ProjectView({ projectId, tick, onOpenTask, onOpenProject }) {
  const t = useT();
  const tx = useTx();
  const { locale } = useI18n();
  const labels = priorityLabels(t);
  const [projects, setProjects] = useState([]);
  const [board, setBoard] = useState(null);
  const [mode, setMode] = useState("quadro");
  const [query, setQuery] = useState({ priority: "", assignee: "", status: "" });
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [activity, setActivity] = useState([]);
  const [showActivity, setShowActivity] = useState(false);
  const [error, setError] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    let cancelled = false;
    api("/api/projects")
      .then((list) => { if (!cancelled) setProjects(list); })
      .catch((err) => { if (!cancelled) setError(localizeApiError(err.message, t)); });
    return () => { cancelled = true; };
  }, [tick, t]);

  useEffect(() => {
    if (!projects.length) return;
    if (!projectId || !projects.some((project) => project.id === projectId)) {
      onOpenProject(projects[0].id);
    }
  }, [projects, projectId, onOpenProject]);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    setError("");
    api(`/api/projects/${projectId}/board`)
      .then((data) => {
        if (cancelled) return;
        setBoard(data);
        setError("");
      })
      .catch(async (err) => {
        if (cancelled) return;
        const missing = /não encontrad|not found/i.test(err.message || "");
        if (missing) {
          try {
            const fresh = await api("/api/projects");
            if (cancelled) return;
            setProjects(fresh);
            if (!fresh.some((project) => project.id === projectId)) {
              if (fresh[0]) onOpenProject(fresh[0].id);
              else {
                setBoard(null);
                setError(localizeApiError(err.message, t));
              }
              return;
            }
            // Same id listed but board failed (stale instance): retry once.
            const retry = await api(`/api/projects/${projectId}/board`);
            if (cancelled) return;
            setBoard(retry);
            setError("");
            return;
          } catch {
            if (cancelled) return;
          }
        }
        setBoard(null);
        setError(localizeApiError(err.message, t));
      });
    api(`/api/activity?project_id=${projectId}`).then((rows) => {
      if (!cancelled) setActivity(rows);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId, tick, t, onOpenProject]);

  async function deleteProject() {
    if (!board?.project) return;
    const name = tx(board.project.name);
    if (!window.confirm(t("projects.deleteConfirm", { name }))) return;
    setError("");
    try {
      await api(`/api/projects/${projectId}`, { method: "DELETE" });
      const remaining = await api("/api/projects");
      setProjects(remaining);
      setBoard(null);
      if (remaining[0]) onOpenProject(remaining[0].id);
      else onOpenProject(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!projectId) {
    return (
      <div>
        <h1>{t("projects.title")}</h1>
        <ProjectForm draft={draft} setDraft={setDraft} onCreate={async () => {
          const project = await api("/api/projects", { method: "POST", body: draft });
          setDraft({ name: "", description: "" });
          onOpenProject(project.id);
        }} />
      </div>
    );
  }
  if (!board) {
    return (
      <div>
        {error && <div className="alert">{error}</div>}
        {projects.length > 0 ? (
          <div className="page-head">
            <div>
              <h1>{t("projects.title")}</h1>
              {!error && <p className="muted">{t("common.loading")}</p>}
            </div>
            <div className="row">
              <select
                className="project-select"
                value={projectId || ""}
                onChange={(e) => onOpenProject(e.target.value)}
                aria-label={t("common.project")}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{tx(project.name)}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          !error && <p>{t("common.loading")}</p>
        )}
      </div>
    );
  }

  const tasks = board.sections.flatMap((section) => section.tasks).filter((task) => {
    if (query.priority && task.priority !== query.priority) return false;
    if (query.assignee && task.assignee_id !== query.assignee) return false;
    if (query.status && task.status !== query.status) return false;
    return true;
  });

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    let sectionId = overId.startsWith("col:") ? overId.slice(4) : null;
    let index = 0;
    if (!sectionId) {
      for (const section of board.sections) {
        const found = section.tasks.findIndex((task) => task.id === overId);
        if (found >= 0) {
          sectionId = section.id;
          index = found;
        }
      }
    } else {
      index = board.sections.find((section) => section.id === sectionId)?.tasks.length || 0;
    }
    if (!sectionId) return;
    await api(`/api/tasks/${active.id}/move`, { method: "POST", body: { section_id: sectionId, index } });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{tx(board.project.name)}</h1>
          <p className="muted">{tx(board.project.description)}</p>
        </div>
        <div className="row">
          <select className="project-select" value={projectId} onChange={(e) => onOpenProject(e.target.value)} aria-label={t("common.project")}>
            {projects.map((project) => <option key={project.id} value={project.id}>{tx(project.name)}</option>)}
          </select>
          <button className={mode === "quadro" ? "primary" : "ghost"} onClick={() => setMode("quadro")}>{t("projects.board")}</button>
          <button className={mode === "lista" ? "primary" : "ghost"} onClick={() => setMode("lista")}>{t("projects.list")}</button>
          <button className="ghost" onClick={() => setShowActivity((value) => !value)}>{t("projects.history")}</button>
          <button className="ghost" onClick={() => setCreating((value) => !value)}>{t("projects.new")}</button>
          <button type="button" className="danger" onClick={deleteProject}>{t("projects.delete")}</button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      {creating && <ProjectForm draft={draft} setDraft={setDraft} onCreate={async () => {
        const project = await api("/api/projects", { method: "POST", body: draft });
        setCreating(false);
        setDraft({ name: "", description: "" });
        onOpenProject(project.id);
      }} />}
      <div className="filters">
        <select value={query.priority} onChange={(e) => setQuery({ ...query, priority: e.target.value })}>
          <option value="">{t("common.priority")}</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={query.assignee} onChange={(e) => setQuery({ ...query, assignee: e.target.value })}>
          <option value="">{t("common.assignee")}</option>
          {board.members.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <select value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value })}>
          <option value="">{t("common.status")}</option>
          <option value="aberto">{t("common.open")}</option>
          <option value="concluido">{t("common.done")}</option>
        </select>
        <span className="people">{board.members.map((person) => <span key={person.id} className="dot" title={person.name} style={{ background: person.color }}>{person.name.slice(0, 1)}</span>)}</span>
      </div>
      {mode === "quadro" ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <div className="board">
            {board.sections.map((section) => (
              <Column key={section.id} section={section} tasks={section.tasks.filter((task) => tasks.includes(task))} onOpenTask={onOpenTask} projectId={projectId} />
            ))}
            <NewColumn projectId={projectId} />
          </div>
        </DndContext>
      ) : (
        <div className="table-scroll"><table className="table">
          <thead><tr><th>{t("projects.task")}</th><th>{t("common.assignee")}</th><th>{t("common.due")}</th><th>{t("common.priority")}</th><th>{t("projects.hours")}</th></tr></thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td><button className="link" onClick={() => onOpenTask(task.id)}>{tx(task.title)}</button><div className="muted">{tx(task.section_name)}</div></td>
                <td>{task.assignee_name || "—"}</td>
                <td className={task.due_date && task.due_date < today() && task.status !== "concluido" ? "pill late" : ""}>{formatDate(task.due_date, locale) || "—"}</td>
                <td><span className={`pill ${task.priority}`}>{labels[task.priority] || priorityLabel[task.priority]}</span></td>
                <td>{hoursLabel(task.minutes, t)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {showActivity && (
        <section className="panel" style={{ marginTop: 14 }}>
          <h2>{t("projects.history")}</h2>
          {activity.map((item) => <p key={item.id} style={{ marginTop: 8 }}>{tx(item.detail)}</p>)}
        </section>
      )}
    </div>
  );
}

function ProjectForm({ draft, setDraft, onCreate }) {
  const t = useT();
  return (
    <form className="panel" style={{ marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); onCreate(); }}>
      <div className="field inline">
        <label className="field">{t("common.name")}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
        <label className="field">{t("common.description")}<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      </div>
      <button className="primary">{t("projects.create")}</button>
    </form>
  );
}

function Column({ section, tasks, onOpenTask, projectId }) {
  const t = useT();
  const tx = useTx();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${section.id}` });
  const [title, setTitle] = useState("");
  const tone = columnTone(section.name);
  return (
    <div className="column" ref={setNodeRef} style={{ outline: isOver ? `2px solid ${tone}` : "none" }}>
      <header>
        <span className="col-title" style={{ color: tone }}>
          <span className="col-dot" style={{ background: tone }} />
          {tx(section.name)}
        </span>
        <span className="count">{tasks.length}</span>
      </header>
      <div className="lane-cards">
        {tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)}
      </div>
      <form className="composer" onSubmit={(e) => {
        e.preventDefault();
        const next = e.currentTarget.elements.namedItem("title").value.trim();
        if (!next) return;
        api("/api/tasks", { method: "POST", body: { project_id: projectId, section_id: section.id, title: next } }).then(() => setTitle(""));
      }}>
        <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("projects.newTask")} />
        <button className="ghost" type="submit">{t("common.add")}</button>
      </form>
    </div>
  );
}

function columnTone(name = "") {
  const value = name.toLowerCase();
  if (value.includes("conclu") || value.includes("feito") || value.includes("ganho") || value.includes("done") || value.includes("hecho") || value.includes("terminé")) return "#28a745";
  if (value.includes("andamento") || value.includes("fazendo") || value.includes("negocia") || value.includes("progress") || value.includes("curso") || value.includes("cours")) return "#007bff";
  if (value.includes("revis") || value.includes("proposta") || value.includes("review") || value.includes("revue")) return "#8229f9";
  if (value.includes("qualifica") || value.includes("qualification")) return "#f98f03";
  return "#00aec7";
}

function TaskCard({ task, onOpen }) {
  const t = useT();
  const tx = useTx();
  const { locale } = useI18n();
  const labels = priorityLabels(t);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };
  const late = task.due_date && task.due_date < today() && task.status !== "concluido";
  const dateClass = late ? "late" : task.status === "concluido" ? "date-ok" : "date-warn";
  return (
    <article ref={setNodeRef} className="tcard" style={style} onClick={() => onOpen(task.id)}>
      <button className="handle" {...listeners} {...attributes} onClick={(e) => e.stopPropagation()} aria-label="Drag">⠿</button>
      <div>
        <h3>{tx(task.title)}</h3>
        {task.project_name && <div className="project-label">{tx(task.project_name)}</div>}
        <div className="meta">
          <span className={`pill ${task.priority}`}>{labels[task.priority] || priorityLabel[task.priority]}</span>
          {task.due_date && <span className={`pill ${dateClass}`}>{formatDate(task.due_date, locale)}</span>}
          {task.assignee_name && <span className="dot" title={task.assignee_name} style={{ background: task.assignee_color }}>{task.assignee_name.slice(0, 1)}</span>}
          {task.subtask_count > 0 && <span className="muted">{task.subtask_done}/{task.subtask_count}</span>}
          {task.comment_count > 0 && <span className="muted">{task.comment_count}</span>}
        </div>
      </div>
    </article>
  );
}

function NewColumn({ projectId }) {
  const t = useT();
  const [name, setName] = useState("");
  return (
    <form className="column new-lane-form" onSubmit={(e) => {
      e.preventDefault();
      api(`/api/projects/${projectId}/sections`, { method: "POST", body: { name } }).then(() => setName(""));
    }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("projects.newColumn")}
        style={{ width: "100%", border: "1px solid #d9e3ec", borderRadius: 10, padding: 10, background: "white" }}
      />
    </form>
  );
}

export function TimeView({ tick, onOpenTask }) {
  const t = useT();
  const tx = useTx();
  const [running, setRunning] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({ task_id: "", hours: "1", note: "", work_date: today() });
  const [filters, setFilters] = useState({ from: "", to: "", user_id: "", project_id: "" });
  const [error, setError] = useState("");

  function load() {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    api(`/api/time/report?${params}`).then(setReport).catch((err) => setError(err.message));
    api("/api/time/running").then(setRunning).catch(() => {});
  }
  useEffect(() => { load(); }, [tick, filters]);
  useEffect(() => {
    api("/api/tasks").then(setTasks);
    api("/api/users").then(setUsers);
    api("/api/projects").then(setProjects);
  }, [tick]);

  return (
    <div>
      <div className="page-head"><div><h1>{t("time.title")}</h1><p className="muted">{t("time.manual")}</p></div></div>
      {error && <div className="alert">{error}</div>}
      <div className="split">
        <section className="panel">
          <h2>{t("time.log")}</h2>
          <form onSubmit={(e) => {
            e.preventDefault();
            api("/api/time/manual", { method: "POST", body: { task_id: form.task_id, minutes: Math.round(Number(form.hours) * 60), note: form.note, work_date: form.work_date } })
              .then(() => setForm({ ...form, note: "" }))
              .catch((err) => setError(err.message));
          }}>
            <label className="field">{t("time.task")}
              <select value={form.task_id} onChange={(e) => setForm({ ...form, task_id: e.target.value })} required>
                <option value="">{t("time.choose")}</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{tx(task.project_name)} — {tx(task.title)}</option>)}
              </select>
            </label>
            <div className="field inline">
              <label className="field">{t("time.hours")}<input type="number" min="0.25" step="0.25" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></label>
              <label className="field">{t("time.date")}<input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} /></label>
            </div>
            <label className="field">{t("time.note")}<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            <button className="primary">{t("time.submit")}</button>
          </form>
          {running && <p style={{ marginTop: 12 }}>{t("time.running", { title: tx(running.title) })}</p>}
        </section>
        <section className="panel">
          <h2>{t("time.filter")}</h2>
          <div className="field inline">
            <label className="field">{t("time.from")}<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
            <label className="field">{t("time.to")}<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          </div>
          <label className="field">{t("time.user")}
            <select value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}>
              <option value="">{t("time.allUsers")}</option>
              {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label className="field">{t("common.project")}
            <select value={filters.project_id} onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}>
              <option value="">{t("time.allProjects")}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{tx(project.name)}</option>)}
            </select>
          </label>
        </section>
      </div>
      {report && (
        <>
          <div className="grid stats" style={{ marginTop: 14 }}>
            <div className="stat"><span className="muted">{t("time.total")}</span><b>{hoursLabel(report.total, t)}</b></div>
            {report.byUser.slice(0, 3).map((row) => <div key={row.id} className="stat"><span className="muted">{row.name}</span><b>{hoursLabel(row.minutes, t)}</b></div>)}
          </div>
          <div className="table-scroll"><table className="table">
            <thead><tr><th>{t("time.date")}</th><th>{t("time.user")}</th><th>{t("common.project")}</th><th>{t("time.task")}</th><th>{t("time.title")}</th><th>{t("time.source")}</th></tr></thead>
            <tbody>
              {report.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.work_date)}</td>
                  <td>{entry.user_name}</td>
                  <td>{tx(entry.project_name)}</td>
                  <td><button className="link" onClick={() => onOpenTask(entry.task_id)}>{tx(entry.task_title)}</button></td>
                  <td>{hoursLabel(entry.minutes, t)}</td>
                  <td>{entry.source}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

export function CrmView({ tick, onOpenProject }) {
  const t = useT();
  const tx = useTx();
  const [tab, setTab] = useState("funil");
  const [board, setBoard] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [activities, setActivities] = useState([]);
  const [reports, setReports] = useState(null);
  const [users, setUsers] = useState([]);
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function load() {
    api("/api/crm/board").then(setBoard).catch((err) => setError(err.message));
    api("/api/crm/contacts").then(setContacts);
    api("/api/crm/companies").then(setCompanies);
    api("/api/crm/activities").then(setActivities);
    api("/api/crm/reports").then(setReports);
    api("/api/users").then(setUsers);
  }
  useEffect(() => { load(); }, [tick]);

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const stageId = overId.startsWith("stage:") ? overId.slice(6) : board.stages.find((stage) => stage.deals.some((item) => item.id === overId))?.id;
    if (!stageId) return;
    await api(`/api/crm/deals/${active.id}/move`, { method: "POST", body: { stage_id: stageId } });
  }

  return (
    <div>
      <div className="page-head"><div><h1>{t("crm.title")}</h1><p className="muted">{t("crm.funnel")}</p></div></div>
      {error && <div className="alert">{error}</div>}
      <div className="tabs">
        {[["funil", t("crm.funnel")], ["contatos", t("crm.contacts")], ["empresas", t("crm.companies")], ["atividades", t("crm.activities")], ["relatorios", t("crm.reports")]].map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "funil" && board && (
        <>
          <DealForm users={users} contacts={contacts} companies={companies} stages={board.stages} />
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <div className="board">
              {board.stages.map((stage) => <StageColumn key={stage.id} stage={stage} onOpen={setDeal} />)}
            </div>
          </DndContext>
          <StageEditor />
        </>
      )}
      {tab === "contatos" && <Contacts companies={companies} contacts={contacts} />}
      {tab === "empresas" && <Companies companies={companies} />}
      {tab === "atividades" && <Activities activities={activities} />}
      {tab === "relatorios" && reports && <Reports reports={reports} />}
      {deal && (
        <div className="drawer-back" onClick={() => setDeal(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between" }}><h2>{tx(deal.title)}</h2><button className="ghost" onClick={() => setDeal(null)}>{t("common.close")}</button></div>
            <p>{money(deal.value_cents)} · {deal.company_name || t("crm.noCompany")}</p>
            <p className="score">{deal.prediction.score}% · {tx(deal.prediction.reason)}</p>
            <p className="muted">{deal.contact_name || t("crm.noContact")} · {t("crm.owner")} {deal.owner_name}</p>
            <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={() => api(`/api/crm/deals/${deal.id}/win`, { method: "POST" }).then((result) => { setDeal(null); if (result.project_id) onOpenProject(result.project_id); })}>
              {deal.project_id ? t("crm.openLinked") : t("crm.win")}
            </button>
              <button className="danger" onClick={() => api(`/api/crm/deals/${deal.id}/lose`, { method: "POST" }).then(() => setDeal(null))}>{t("crm.lost")}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function DealForm({ users, contacts, companies, stages }) {
  const t = useT();
  const tx = useTx();
  const [form, setForm] = useState({ title: "", value: "", stage_id: stages[0]?.id || "", contact_id: "", company_id: "", owner_id: "", expected_close: "" });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!form.stage_id && stages[0]?.id) setForm((current) => ({ ...current, stage_id: stages[0].id }));
  }, [stages, form.stage_id]);
  return (
    <form className="panel" style={{ marginBottom: 12 }} onSubmit={(e) => {
      e.preventDefault();
      setError("");
      api("/api/crm/deals", { method: "POST", body: { ...form, value_cents: Math.round(Number(form.value || 0) * 100) } })
        .then(() => setForm({ title: "", value: "", stage_id: stages[0]?.id || "", contact_id: "", company_id: "", owner_id: "", expected_close: "" }))
        .catch((err) => setError(err.message));
    }}>
      {error && <div className="alert">{error}</div>}
      <div className="field inline">
        <label className="field">{t("crm.newDeal")}<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label className="field">{t("crm.value")}<input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
      </div>
      <div className="field inline">
        <label className="field">{t("crm.stage")}<select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{tx(stage.name)}</option>)}</select></label>
        <label className="field">{t("common.due")}<input type="date" value={form.expected_close} onChange={(e) => setForm({ ...form, expected_close: e.target.value })} /></label>
      </div>
      <div className="field inline">
        <label className="field">{t("crm.company")}<select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="">—</option>{companies.map((company) => <option key={company.id} value={company.id}>{tx(company.name)}</option>)}</select></label>
        <label className="field">{t("crm.contact")}<select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}><option value="">—</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
      </div>
      <label className="field">{t("crm.seller")}<select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}><option value="">{t("crm.me")}</option>{users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <button className="primary">{t("crm.newDeal")}</button>
    </form>
  );
}

function StageColumn({ stage, onOpen }) {
  const tx = useTx();
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  const total = stage.deals.reduce((sum, deal) => sum + deal.value_cents, 0);
  const tone = columnTone(stage.name) === "#00aec7" ? "#00bebe" : columnTone(stage.name);
  return (
    <div className="column" ref={setNodeRef} style={{ outline: isOver ? "2px solid #00bebe" : "none" }}>
      <header>
        <span className="col-title" style={{ color: tone }}>
          <span className="col-dot" style={{ background: tone }} />
          {tx(stage.name)}
        </span>
        <span className="count">{money(total)}</span>
      </header>
      <div className="lane-cards">
        {stage.deals.map((deal) => <DealCard key={deal.id} deal={deal} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function DealCard({ deal, onOpen }) {
  const t = useT();
  const tx = useTx();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  return (
    <article ref={setNodeRef} className="deal" style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }} onClick={() => onOpen(deal)}>
      <button className="handle" {...listeners} {...attributes} onClick={(e) => e.stopPropagation()} aria-label="Drag">⠿</button>
      <div>
        <strong>{tx(deal.title)}</strong>
        <div className="muted">{deal.company_name || t("crm.noCompany")}</div>
        <div className="meta">
          <span>{money(deal.value_cents)}</span>
          <span className="score">{deal.prediction.score}%</span>
        </div>
      </div>
    </article>
  );
}

function StageEditor() {
  const t = useT();
  const [name, setName] = useState("");
  return (
    <form className="composer" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); api("/api/crm/stages", { method: "POST", body: { name } }).then(() => setName("")); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("crm.newStage")} />
      <button className="ghost">{t("common.add")}</button>
    </form>
  );
}

function Contacts({ contacts, companies }) {
  const t = useT();
  const tx = useTx();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company_id: "" });
  return (
    <div className="split">
      <div className="table-scroll"><table className="table">
        <thead><tr><th>{t("common.name")}</th><th>{t("crm.company")}</th><th>{t("team.email")}</th><th>{t("crm.contact")}</th></tr></thead>
        <tbody>{contacts.map((contact) => <tr key={contact.id}><td>{contact.name}</td><td>{tx(contact.company_name) || "—"}</td><td>{contact.email}</td><td>{contact.phone}</td></tr>)}</tbody>
      </table></div>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); api("/api/crm/contacts", { method: "POST", body: form }); setForm({ name: "", email: "", phone: "", company_id: "" }); }}>
        <h2>{t("crm.contacts")}</h2>
        <label className="field">{t("common.name")}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label className="field">{t("team.email")}<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="field">{t("crm.company")}<select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="">—</option>{companies.map((company) => <option key={company.id} value={company.id}>{tx(company.name)}</option>)}</select></label>
        <button className="primary">{t("common.save")}</button>
      </form>
    </div>
  );
}

function Companies({ companies }) {
  const t = useT();
  const tx = useTx();
  const [form, setForm] = useState({ name: "", website: "" });
  return (
    <div className="split">
      <div className="table-scroll"><table className="table">
        <thead><tr><th>{t("crm.company")}</th><th>Web</th></tr></thead>
        <tbody>{companies.map((company) => <tr key={company.id}><td>{tx(company.name)}</td><td>{company.website}</td></tr>)}</tbody>
      </table></div>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); api("/api/crm/companies", { method: "POST", body: form }); setForm({ name: "", website: "" }); }}>
        <h2>{t("crm.companies")}</h2>
        <label className="field">{t("common.name")}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label className="field">Web<input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
        <button className="primary">{t("common.save")}</button>
      </form>
    </div>
  );
}

function Activities({ activities }) {
  const t = useT();
  const tx = useTx();
  const { locale } = useI18n();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today());
  return (
    <div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); api("/api/crm/activities", { method: "POST", body: { title, due_at: due, type: "tarefa" } }).then(() => setTitle("")); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("crm.newFollow")} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="primary">{t("common.add")}</button>
      </form>
      {activities.map((item) => (
        <label key={item.id} className="check">
          <input type="checkbox" checked={!!item.done} onChange={() => api(`/api/crm/activities/${item.id}/toggle`, { method: "POST" })} />
          <span>
            <strong>{tx(item.title)}</strong>
            <div className="muted">{item.type}{item.deal_title ? ` · ${tx(item.deal_title)}` : ""}{item.due_at ? ` · ${formatDate(item.due_at, locale)}` : ""}{item.due_at && item.due_at < today() && !item.done ? ` · ${tx("atrasado")}` : ""}</div>
          </span>
        </label>
      ))}
    </div>
  );
}

function Reports({ reports }) {
  const t = useT();
  const tx = useTx();
  const max = Math.max(...reports.byStage.map((row) => row.value_cents), 1);
  return (
    <div className="split">
      <section className="panel">
        <h2>{t("crm.reports")}</h2>
        <p><b>{reports.conversion}%</b></p>
        <p className="muted">{money(reports.openCents)}</p>
        <h3 style={{ marginTop: 16 }}>{t("crm.stage")}</h3>
        {reports.byStage.map((row) => (
          <div key={row.name} style={{ marginTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><span>{tx(row.name)}</span><span>{row.count} · {money(row.value_cents)}</span></div>
            <div className="bar"><span style={{ width: `${(row.value_cents / max) * 100}%` }} /></div>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{t("crm.seller")}</h2>
        <div className="table-scroll"><table className="table">
          <thead><tr><th>{t("common.name")}</th><th>{t("common.open")}</th><th>{t("crm.win")}</th><th>{t("crm.value")}</th></tr></thead>
          <tbody>{reports.byOwner.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.open_count}</td><td>{row.won_count}</td><td>{money(row.won_cents)}</td></tr>)}</tbody>
        </table></div>
        <h3 style={{ marginTop: 16 }}>{t("crm.reports")}</h3>
        {reports.predictions.map((item) => <p key={item.id} style={{ marginTop: 8 }}>{tx(item.title)}: {item.score}% · {tx(item.reason)}</p>)}
      </section>
    </div>
  );
}

export function ImportView() {
  const t = useT();
  const [asanaToken, setAsanaToken] = useState("");
  const [clockifyKey, setClockifyKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(path, body) {
    setError("");
    setMessage("");
    try {
      const result = await api(path, { method: "POST", body });
      if (path.includes("asana")) {
        setMessage(
          result.tasks
            ? `Importação do Asana concluída: ${result.projects} projeto(s) e ${result.tasks} tarefa(s). ${result.names?.join(", ") || ""}`
            : `Os projetos do Asana já estavam na plataforma: ${result.names?.join(", ") || ""}.`
        );
      } else {
        setMessage(
          `Importação do Clockify concluída: ${result.entries} lançamento(s)${result.tasksCreated ? `, ${result.tasksCreated} tarefa(s) criada(s)` : ""}${result.skipped ? `, ${result.skipped} já existente(s)` : ""}.`
        );
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-head"><div><h1>{t("import.title")}</h1><p className="muted">{t("import.asana")} · {t("import.clockify")}</p></div></div>
      {error && <div className="alert">{error}</div>}
      {message && <div className="ok">{message}</div>}
      <div className="split">
        <section className="panel">
          <h2>Asana</h2>
          <p className="muted">Use um token pessoal de administrador, ou carregue o exemplo para ver a importação funcionando.</p>
          <label className="field">Token<input value={asanaToken} onChange={(e) => setAsanaToken(e.target.value)} placeholder="Token do Asana" /></label>
          <div className="row">
            <button className="primary" onClick={() => run("/api/import/asana", { token: asanaToken })}>Importar do Asana</button>
            <button className="ghost" onClick={() => run("/api/import/asana", { sample: true })}>Importar exemplo</button>
          </div>
        </section>
        <section className="panel">
          <h2>Clockify</h2>
          <p className="muted">A chave fica no perfil do Clockify. Importe o Asana antes se quiser que as horas encontrem as mesmas tarefas.</p>
          <label className="field">Chave de API<input value={clockifyKey} onChange={(e) => setClockifyKey(e.target.value)} placeholder="Chave do Clockify" /></label>
          <div className="row">
            <button className="primary" onClick={() => run("/api/import/clockify", { apiKey: clockifyKey })}>Importar do Clockify</button>
            <button className="ghost" onClick={() => run("/api/import/clockify", { sample: true })}>Importar exemplo</button>
          </div>
        </section>
      </div>
    </div>
  );
}

const COMMAND_EXAMPLES = [
  { label: "Criar tarefa", text: "criar tarefa Revisar proposta no projeto Site institucional para Ana até amanhã prioridade alta" },
  { label: "Resumo do projeto", text: "resumo do projeto Site institucional" },
  { label: "Tarefas em risco", text: "tarefas em risco" },
  { label: "Concluir tarefa", text: "concluir tarefa Configurar domínio e SSL" },
  { label: "Registrar horas", text: "registrar 1,5 horas na tarefa Redigir página Sobre" },
];

export function AiView({ gptKey, onOpenProject }) {
  const t = useT();
  const tx = useTx();
  const [text, setText] = useState(COMMAND_EXAMPLES[0].text);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    api("/api/projects").then((rows) => {
      setProjects(rows);
      setProjectId(rows[0]?.id || "");
    });
  }, []);

  async function send(value) {
    const command = (value || text).trim();
    if (!command) return;
    setError("");
    setBusy(true);
    try {
      const result = await api("/api/ai/command", { method: "POST", body: { text: command } });
      setAnswer(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function generateSummary() {
    if (!projectId) return;
    setSummaryBusy(true);
    setError("");
    try {
      const data = await api(`/api/ai/summary?project_id=${projectId}`);
      setSummary(data.text);
    } catch (err) {
      setError(err.message);
    } finally {
      setSummaryBusy(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <div className="ai-page">
      <div className="page-head">
        <div>
          <h1>{t("ai.title")}</h1>
          <p className="muted">Escreva em português o que precisa — criar tarefa, horas, status ou resumo. A mesma API serve para o GPT.</p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="ai-layout">
        <section className="ai-console panel">
          <div className="ai-console-head">
            <div>
              <h2>Console de comandos</h2>
              <p className="muted">Digite o pedido completo ou escolha um atalho abaixo.</p>
            </div>
          </div>

          <div className="ai-chips" role="list">
            {COMMAND_EXAMPLES.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`ai-chip ${text === item.text ? "active" : ""}`}
                onClick={() => setText(item.text)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="ai-composer">
            <span className="ai-composer-label">Seu comando</span>
            <textarea
              rows={4}
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ex.: criar tarefa Revisar proposta no projeto Site institucional para Ana até amanhã"
            />
            <div className="ai-composer-foot">
              <span className="muted">Ctrl + Enter para enviar</span>
              <button className="primary" type="button" disabled={busy || !text.trim()} onClick={() => send()}>
                {busy ? "Enviando…" : "Executar comando"}
              </button>
            </div>
          </label>

          {answer && (
            <div className="ai-result">
              <span className="ai-result-label">Resposta</span>
              <p>{answer}</p>
            </div>
          )}
        </section>

        <aside className="ai-side">
          <section className="panel ai-summary-card">
            <h2>{t("ai.ex.summary")}</h2>
            <p className="muted">{t("ai.lead")}</p>
            <label className="field">
              {t("common.project")}
              <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setSummary(""); }}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{tx(project.name)}</option>
                ))}
              </select>
            </label>
            <div className="ai-summary-actions">
              <button className="primary" type="button" disabled={!projectId || summaryBusy} onClick={generateSummary}>
                {summaryBusy ? t("ai.generating") : t("ai.summary")}
              </button>
              <button className="ghost" type="button" disabled={!projectId} onClick={() => onOpenProject(projectId)}>
                {t("projects.title")}
              </button>
            </div>
            {summary ? (
              <div className="ai-summary-body">
                <strong>{tx(selectedProject?.name)}</strong>
                <p>{summary}</p>
              </div>
            ) : (
              <p className="empty-state">O resumo aparece aqui depois de gerar.</p>
            )}
          </section>

          <section className="panel ai-api-card">
            <h2>API para o GPT</h2>
            <p className="muted">Use a mesma lógica por HTTP a partir do ChatGPT ou automações.</p>
            <div className="ai-code">
              <div><span>POST</span> /api/gpt</div>
              <div><span>Header</span> X-Api-Key</div>
              {gptKey ? <div><span>Key</span> {gptKey}</div> : <div className="muted">Chave visível só para administradores.</div>}
            </div>
            <p className="muted ai-api-hint">Actions: create_task, update_task, add_comment, log_time, summarize, risks.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function TeamView({ user }) {
  const t = useT();
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" });
  const [error, setError] = useState("");
  useEffect(() => { api("/api/users").then(setPeople); }, []);
  return (
    <div>
      <div className="page-head"><div><h1>{t("team.title")}</h1><p className="muted">{t("brand.tagline")}</p></div></div>
      {error && <div className="alert">{error}</div>}
      <div className="split">
        <div className="table-scroll"><table className="table">
          <thead><tr><th>{t("common.name")}</th><th>{t("team.email")}</th><th>{t("team.role")}</th></tr></thead>
          <tbody>{people.map((person) => <tr key={person.id}><td>{person.name}</td><td>{person.email}</td><td>{person.role === "admin" ? t("user.admin") : t("user.member")}</td></tr>)}</tbody>
        </table></div>
        {user.role === "admin" && (
          <form className="panel" onSubmit={(e) => {
            e.preventDefault();
            api("/api/users", { method: "POST", body: form }).then((person) => { setPeople([...people, person]); setForm({ name: "", email: "", password: "", role: "member" }); }).catch((err) => setError(err.message));
          }}>
            <h2>{t("team.invite")}</h2>
            <label className="field">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label className="field">E-mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label className="field">Senha<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            <label className="field">Papel<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="member">Equipe</option><option value="admin">Administração</option></select></label>
            <button className="primary">Adicionar</button>
          </form>
        )}
      </div>
    </div>
  );
}
