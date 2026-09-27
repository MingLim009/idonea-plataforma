import { useEffect, useState } from "react";
import { DndContext, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { api, formatDate, hoursLabel, money, priorityLabel, today } from "./api.js";

export function Dashboard({ tick, onOpenProject, onOpenTask }) {
  const [data, setData] = useState(null);
  useEffect(() => { api("/api/dashboard").then(setData).catch(() => {}); }, [tick]);
  if (!data) return <p className="loading-line">Carregando o painel…</p>;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Início</h1>
          <p className="muted">Prioridades, horas e riscos do dia — tudo em um olhar.</p>
        </div>
      </div>
      <div className="grid stats">
        <div className="stat"><span className="muted">Atrasadas</span><b>{data.overdue}</b></div>
        <div className="stat"><span className="muted">Horas na semana</span><b>{hoursLabel(data.hoursWeek)}</b></div>
        <div className="stat"><span className="muted">Negócios abertos</span><b>{money(data.openDeals.cents)}</b></div>
        <div className="stat"><span className="muted">Projetos</span><b>{data.projects.length}</b></div>
      </div>
      <div className="split">
        <section className="panel">
          <h2>Minhas tarefas</h2>
          {data.myTasks.length === 0 && <p className="empty-state">Nada atribuído a você agora.</p>}
          {data.myTasks.map((task) => (
            <button key={task.id} className="taskline" onClick={() => onOpenTask(task.id)}>
              <span>{task.title}</span>
              <span className={task.due_date && task.due_date < today() ? "pill late" : "muted"}>{task.due_date ? formatDate(task.due_date) : task.project_name}</span>
            </button>
          ))}
          <h2 style={{ marginTop: 22 }}>Projetos</h2>
          {data.projects.map((project) => (
            <button key={project.id} className="taskline" onClick={() => onOpenProject(project.id)}>
              <span><i className="dot" style={{ background: project.color, display: "inline-block", width: 10, height: 10, marginRight: 8 }} />{project.name}</span>
              <span className="muted">{project.open_tasks} abertas{project.overdue_tasks ? ` · ${project.overdue_tasks} atrasadas` : ""}</span>
            </button>
          ))}
        </section>
        <section className="panel">
          <h2>Risco de atraso</h2>
          {data.risks.length === 0 && <p className="empty-state">Nenhuma tarefa em risco.</p>}
          {data.risks.map((task) => (
            <button key={task.id} className="taskline" onClick={() => onOpenTask(task.id)}>
              <span>{task.title}</span>
              <span className={`pill ${task.level === "alto" ? "urgente" : "alta"}`}>{task.level === "alto" ? "Alto" : "Médio"}</span>
            </button>
          ))}
          <h2 style={{ marginTop: 22 }}>Atividade</h2>
          {data.activity.length === 0 && <p className="empty-state">Sem atividade recente.</p>}
          {data.activity.map((item) => (
            <p key={item.id} className="muted" style={{ marginTop: 10, lineHeight: 1.45 }}>{item.detail}</p>
          ))}
        </section>
      </div>
    </div>
  );
}

export function ProjectView({ projectId, tick, onOpenTask, onOpenProject }) {
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

  useEffect(() => { api("/api/projects").then(setProjects).catch((err) => setError(err.message)); }, [tick]);
  useEffect(() => {
    if (!projectId && projects[0]) onOpenProject(projects[0].id);
  }, [projects, projectId]);
  useEffect(() => {
    if (!projectId) return;
    api(`/api/projects/${projectId}/board`).then(setBoard).catch((err) => setError(err.message));
    api(`/api/activity?project_id=${projectId}`).then(setActivity).catch(() => {});
  }, [projectId, tick]);

  if (!projectId) {
    return (
      <div>
        <h1>Projetos</h1>
        <ProjectForm draft={draft} setDraft={setDraft} onCreate={async () => {
          const project = await api("/api/projects", { method: "POST", body: draft });
          setDraft({ name: "", description: "" });
          onOpenProject(project.id);
        }} />
      </div>
    );
  }
  if (!board) return <p>{error || "Carregando…"}</p>;

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
          <h1>{board.project.name}</h1>
          <p className="muted">{board.project.description}</p>
        </div>
        <div className="row">
          <select value={projectId} onChange={(e) => onOpenProject(e.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button className={mode === "quadro" ? "primary" : "ghost"} onClick={() => setMode("quadro")}>Quadro</button>
          <button className={mode === "lista" ? "primary" : "ghost"} onClick={() => setMode("lista")}>Lista</button>
          <button className="ghost" onClick={() => setShowActivity((value) => !value)}>Histórico</button>
          <button className="ghost" onClick={() => setCreating((value) => !value)}>Novo projeto</button>
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
          <option value="">Prioridade</option>
          {Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={query.assignee} onChange={(e) => setQuery({ ...query, assignee: e.target.value })}>
          <option value="">Responsável</option>
          {board.members.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <select value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value })}>
          <option value="">Situação</option>
          <option value="aberto">Abertas</option>
          <option value="concluido">Concluídas</option>
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
        <table className="table">
          <thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Horas</th></tr></thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td><button className="link" onClick={() => onOpenTask(task.id)}>{task.title}</button><div className="muted">{task.section_name}</div></td>
                <td>{task.assignee_name || "—"}</td>
                <td className={task.due_date && task.due_date < today() && task.status !== "concluido" ? "pill late" : ""}>{formatDate(task.due_date) || "—"}</td>
                <td><span className={`pill ${task.priority}`}>{priorityLabel[task.priority]}</span></td>
                <td>{hoursLabel(task.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showActivity && (
        <section className="panel" style={{ marginTop: 14 }}>
          <h2>Histórico</h2>
          {activity.map((item) => <p key={item.id} style={{ marginTop: 8 }}>{item.detail}</p>)}
        </section>
      )}
    </div>
  );
}

function ProjectForm({ draft, setDraft, onCreate }) {
  return (
    <form className="panel" style={{ marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); onCreate(); }}>
      <div className="field inline">
        <label className="field">Nome<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
        <label className="field">Descrição<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      </div>
      <button className="primary">Criar projeto</button>
    </form>
  );
}

function Column({ section, tasks, onOpenTask, projectId }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${section.id}` });
  const [title, setTitle] = useState("");
  const tone = columnTone(section.name);
  return (
    <div className="column" ref={setNodeRef} style={{ outline: isOver ? `2px solid ${tone}` : "none" }}>
      <header>
        <span className="col-title" style={{ color: tone }}>
          <span className="col-dot" style={{ background: tone }} />
          {section.name}
        </span>
        <span className="count">{tasks.length}</span>
      </header>
      {tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)}
      <form className="composer" onSubmit={(e) => {
        e.preventDefault();
        const next = e.currentTarget.elements.namedItem("title").value.trim();
        if (!next) return;
        api("/api/tasks", { method: "POST", body: { project_id: projectId, section_id: section.id, title: next } }).then(() => setTitle(""));
      }}>
        <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa" />
        <button className="ghost" type="submit">Adicionar</button>
      </form>
    </div>
  );
}

function columnTone(name = "") {
  const value = name.toLowerCase();
  if (value.includes("conclu") || value.includes("feito") || value.includes("ganho")) return "#28a745";
  if (value.includes("andamento") || value.includes("fazendo") || value.includes("negocia")) return "#007bff";
  if (value.includes("revis") || value.includes("proposta")) return "#8229f9";
  if (value.includes("qualifica")) return "#f98f03";
  return "#00aec7";
}

function TaskCard({ task, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };
  const late = task.due_date && task.due_date < today() && task.status !== "concluido";
  const dateClass = late ? "late" : task.status === "concluido" ? "date-ok" : "date-warn";
  return (
    <article ref={setNodeRef} className="tcard" style={style} onClick={() => onOpen(task.id)}>
      <button className="handle" {...listeners} {...attributes} onClick={(e) => e.stopPropagation()} aria-label="Arrastar">⠿</button>
      <div>
        <h3>{task.title}</h3>
        {task.project_name && <div className="project-label">{task.project_name}</div>}
        <div className="meta">
          <span className={`pill ${task.priority}`}>{priorityLabel[task.priority]}</span>
          {task.due_date && <span className={`pill ${dateClass}`}>{formatDate(task.due_date)}</span>}
          {task.assignee_name && <span className="dot" title={task.assignee_name} style={{ background: task.assignee_color }}>{task.assignee_name.slice(0, 1)}</span>}
          {task.subtask_count > 0 && <span className="muted">{task.subtask_done}/{task.subtask_count}</span>}
          {task.comment_count > 0 && <span className="muted">{task.comment_count} coment.</span>}
        </div>
      </div>
    </article>
  );
}

function NewColumn({ projectId }) {
  const [name, setName] = useState("");
  return (
    <form className="column" onSubmit={(e) => {
      e.preventDefault();
      api(`/api/projects/${projectId}/sections`, { method: "POST", body: { name } }).then(() => setName(""));
    }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nova coluna"
        style={{ width: "100%", border: "1px solid #d9e3ec", borderRadius: 10, padding: 10, background: "white" }}
      />
    </form>
  );
}

export function TimeView({ tick, onOpenTask }) {
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
      <div className="page-head"><div><h1>Horas</h1><p className="muted">Timer na tarefa, lançamento manual e relatório por pessoa, projeto e período.</p></div></div>
      {error && <div className="alert">{error}</div>}
      <div className="split">
        <section className="panel">
          <h2>Lançar horas</h2>
          <form onSubmit={(e) => {
            e.preventDefault();
            api("/api/time/manual", { method: "POST", body: { task_id: form.task_id, minutes: Math.round(Number(form.hours) * 60), note: form.note, work_date: form.work_date } })
              .then(() => setForm({ ...form, note: "" }))
              .catch((err) => setError(err.message));
          }}>
            <label className="field">Tarefa
              <select value={form.task_id} onChange={(e) => setForm({ ...form, task_id: e.target.value })} required>
                <option value="">Escolha</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.project_name} — {task.title}</option>)}
              </select>
            </label>
            <div className="field inline">
              <label className="field">Horas<input type="number" min="0.25" step="0.25" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></label>
              <label className="field">Data<input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} /></label>
            </div>
            <label className="field">Nota<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            <button className="primary">Lançar</button>
          </form>
          {running && <p style={{ marginTop: 12 }}>Timer aberto em {running.title}. Use a barra de baixo para parar.</p>}
        </section>
        <section className="panel">
          <h2>Filtro do relatório</h2>
          <div className="field inline">
            <label className="field">De<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
            <label className="field">Até<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          </div>
          <label className="field">Pessoa
            <select value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}>
              <option value="">Todas</option>
              {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label className="field">Projeto
            <select value={filters.project_id} onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}>
              <option value="">Todos</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
        </section>
      </div>
      {report && (
        <>
          <div className="grid stats" style={{ marginTop: 14 }}>
            <div className="stat"><span className="muted">Total</span><b>{hoursLabel(report.total)}</b></div>
            {report.byUser.slice(0, 3).map((row) => <div key={row.id} className="stat"><span className="muted">{row.name}</span><b>{hoursLabel(row.minutes)}</b></div>)}
          </div>
          <table className="table">
            <thead><tr><th>Data</th><th>Pessoa</th><th>Projeto</th><th>Tarefa</th><th>Tempo</th><th>Origem</th></tr></thead>
            <tbody>
              {report.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.work_date)}</td>
                  <td>{entry.user_name}</td>
                  <td>{entry.project_name}</td>
                  <td><button className="link" onClick={() => onOpenTask(entry.task_id)}>{entry.task_title}</button></td>
                  <td>{hoursLabel(entry.minutes)}</td>
                  <td>{entry.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function CrmView({ tick, onOpenProject }) {
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
      <div className="page-head"><div><h1>Vendas</h1><p className="muted">Funil, contatos e o caminho do negócio até o projeto.</p></div></div>
      {error && <div className="alert">{error}</div>}
      <div className="tabs">
        {[["funil", "Funil"], ["contatos", "Contatos"], ["empresas", "Empresas"], ["atividades", "Atividades"], ["relatorios", "Relatórios"]].map(([id, label]) => (
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
            <div className="row" style={{ justifyContent: "space-between" }}><h2>{deal.title}</h2><button className="ghost" onClick={() => setDeal(null)}>Fechar</button></div>
            <p>{money(deal.value_cents)} · {deal.company_name || "Sem empresa"}</p>
            <p className="score">Chance de fechar: {deal.prediction.score}%. {deal.prediction.reason}</p>
            <p className="muted">{deal.contact_name || "Sem contato"} · responsável {deal.owner_name}</p>
            <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={() => api(`/api/crm/deals/${deal.id}/win`, { method: "POST" }).then((result) => { setDeal(null); if (result.project_id) onOpenProject(result.project_id); })}>
              {deal.project_id ? "Abrir projeto ligado" : "Ganho — abrir projeto"}
            </button>
              <button className="danger" onClick={() => api(`/api/crm/deals/${deal.id}/lose`, { method: "POST" }).then(() => setDeal(null))}>Perdido</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function DealForm({ users, contacts, companies, stages }) {
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
        <label className="field">Negócio<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label className="field">Valor (R$)<input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
      </div>
      <div className="field inline">
        <label className="field">Etapa<select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
        <label className="field">Previsão<input type="date" value={form.expected_close} onChange={(e) => setForm({ ...form, expected_close: e.target.value })} /></label>
      </div>
      <div className="field inline">
        <label className="field">Empresa<select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="">—</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label className="field">Contato<select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}><option value="">—</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
      </div>
      <label className="field">Vendedor<select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}><option value="">Eu</option>{users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <button className="primary">Adicionar negócio</button>
    </form>
  );
}

function StageColumn({ stage, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  const total = stage.deals.reduce((sum, deal) => sum + deal.value_cents, 0);
  const tone = columnTone(stage.name) === "#00aec7" ? "#00bebe" : columnTone(stage.name);
  return (
    <div className="column" ref={setNodeRef} style={{ outline: isOver ? "2px solid #00bebe" : "none" }}>
      <header>
        <span className="col-title" style={{ color: tone }}>
          <span className="col-dot" style={{ background: tone }} />
          {stage.name}
        </span>
        <span className="count">{money(total)}</span>
      </header>
      {stage.deals.map((deal) => <DealCard key={deal.id} deal={deal} onOpen={onOpen} />)}
    </div>
  );
}

function DealCard({ deal, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  return (
    <article ref={setNodeRef} className="deal" style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }} onClick={() => onOpen(deal)}>
      <button className="handle" {...listeners} {...attributes} onClick={(e) => e.stopPropagation()} aria-label="Arrastar">⠿</button>
      <div>
        <strong>{deal.title}</strong>
        <div className="muted">{deal.company_name || "Sem empresa"}</div>
        <div className="meta">
          <span>{money(deal.value_cents)}</span>
          <span className="score">{deal.prediction.score}% de chance</span>
        </div>
      </div>
    </article>
  );
}

function StageEditor() {
  const [name, setName] = useState("");
  return (
    <form className="composer" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); api("/api/crm/stages", { method: "POST", body: { name } }).then(() => setName("")); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova etapa do funil" />
      <button className="ghost">Adicionar etapa</button>
    </form>
  );
}

function Contacts({ contacts, companies }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company_id: "" });
  return (
    <div className="split">
      <table className="table">
        <thead><tr><th>Nome</th><th>Empresa</th><th>E-mail</th><th>Telefone</th></tr></thead>
        <tbody>{contacts.map((contact) => <tr key={contact.id}><td>{contact.name}</td><td>{contact.company_name || "—"}</td><td>{contact.email}</td><td>{contact.phone}</td></tr>)}</tbody>
      </table>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); api("/api/crm/contacts", { method: "POST", body: form }); setForm({ name: "", email: "", phone: "", company_id: "" }); }}>
        <h2>Novo contato</h2>
        <label className="field">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label className="field">E-mail<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="field">Telefone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="field">Empresa<select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="">—</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <button className="primary">Salvar</button>
      </form>
    </div>
  );
}

function Companies({ companies }) {
  const [form, setForm] = useState({ name: "", website: "" });
  return (
    <div className="split">
      <table className="table">
        <thead><tr><th>Empresa</th><th>Site</th></tr></thead>
        <tbody>{companies.map((company) => <tr key={company.id}><td>{company.name}</td><td>{company.website}</td></tr>)}</tbody>
      </table>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); api("/api/crm/companies", { method: "POST", body: form }); setForm({ name: "", website: "" }); }}>
        <h2>Nova empresa</h2>
        <label className="field">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label className="field">Site<input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
        <button className="primary">Salvar</button>
      </form>
    </div>
  );
}

function Activities({ activities }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today());
  return (
    <div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); api("/api/crm/activities", { method: "POST", body: { title, due_at: due, type: "tarefa" } }).then(() => setTitle("")); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Novo follow-up" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="primary">Agendar</button>
      </form>
      {activities.map((item) => (
        <label key={item.id} className="check">
          <input type="checkbox" checked={!!item.done} onChange={() => api(`/api/crm/activities/${item.id}/toggle`, { method: "POST" })} />
          <span>
            <strong>{item.title}</strong>
            <div className="muted">{item.type}{item.deal_title ? ` · ${item.deal_title}` : ""}{item.due_at ? ` · ${formatDate(item.due_at)}` : ""}{item.due_at && item.due_at < today() && !item.done ? " · atrasado" : ""}</div>
          </span>
        </label>
      ))}
    </div>
  );
}

function Reports({ reports }) {
  const max = Math.max(...reports.byStage.map((row) => row.value_cents), 1);
  return (
    <div className="split">
      <section className="panel">
        <h2>Conversão</h2>
        <p><b>{reports.conversion}%</b> dos negócios encerrados foram ganhos ({reports.won} ganhos, {reports.lost} perdidos).</p>
        <p className="muted">Em aberto: {money(reports.openCents)}</p>
        <h3 style={{ marginTop: 16 }}>Por etapa</h3>
        {reports.byStage.map((row) => (
          <div key={row.name} style={{ marginTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><span>{row.name}</span><span>{row.count} · {money(row.value_cents)}</span></div>
            <div className="bar"><span style={{ width: `${(row.value_cents / max) * 100}%` }} /></div>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Por vendedor</h2>
        <table className="table">
          <thead><tr><th>Pessoa</th><th>Abertos</th><th>Ganhos</th><th>Valor ganho</th></tr></thead>
          <tbody>{reports.byOwner.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.open_count}</td><td>{row.won_count}</td><td>{money(row.won_cents)}</td></tr>)}</tbody>
        </table>
        <h3 style={{ marginTop: 16 }}>Previsão de fechamento</h3>
        {reports.predictions.map((item) => <p key={item.id} style={{ marginTop: 8 }}>{item.title}: {item.score}% · {item.reason}</p>)}
      </section>
    </div>
  );
}

export function ImportView() {
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
      <div className="page-head"><div><h1>Importar histórico</h1><p className="muted">Traga projetos e tarefas do Asana e as horas do Clockify, ligadas a cada tarefa.</p></div></div>
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

export function AiView({ gptKey, onOpenProject }) {
  const [text, setText] = useState("criar tarefa Revisar proposta no projeto Site institucional para Ana até amanhã prioridade alta");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState("");
  const [projectId, setProjectId] = useState("");

  useEffect(() => { api("/api/projects").then((rows) => { setProjects(rows); setProjectId(rows[0]?.id || ""); }); }, []);

  async function send(value) {
    setError("");
    try {
      const result = await api("/api/ai/command", { method: "POST", body: { text: value || text } });
      setAnswer(result.message);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-head"><div><h1>Comandos</h1><p className="muted">Crie tarefas, atualize status, comente e lance horas em texto. A mesma porta serve para o GPT.</p></div></div>
      {error && <div className="alert">{error}</div>}
      <section className="panel">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => send()}>Enviar</button>
          {["resumo do projeto Site institucional", "tarefas em risco", "concluir tarefa Configurar domínio e SSL", "registrar 1,5 horas na tarefa Redigir página Sobre"].map((example) => (
            <button key={example} className="ghost" onClick={() => { setText(example); send(example); }}>{example}</button>
          ))}
        </div>
        {answer && <p className="ok">{answer}</p>}
      </section>
      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Resumo de um projeto</h2>
        <div className="row">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button className="ghost" onClick={() => api(`/api/ai/summary?project_id=${projectId}`).then((data) => setSummary(data.text))}>Gerar resumo</button>
          <button className="textish" onClick={() => onOpenProject(projectId)}>Abrir projeto</button>
        </div>
        {summary && <p style={{ marginTop: 8 }}>{summary}</p>}
      </section>
      <section className="panel" style={{ marginTop: 12 }}>
        <h2>API para o GPT</h2>
        <p>Envie POST para <b>/api/gpt</b> com o cabeçalho <b>X-Api-Key</b>.</p>
        {gptKey ? <p>Chave: <b>{gptKey}</b></p> : <p className="muted">A chave aparece para administradores.</p>}
        <p className="muted">Também aceita JSON direto: action create_task, update_task, add_comment, log_time, summarize ou risks.</p>
      </section>
    </div>
  );
}

export function TeamView({ user }) {
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" });
  const [error, setError] = useState("");
  useEffect(() => { api("/api/users").then(setPeople); }, []);
  return (
    <div>
      <div className="page-head"><div><h1>Equipe</h1><p className="muted">Quem entra no workspace enxerga os projetos.</p></div></div>
      {error && <div className="alert">{error}</div>}
      <div className="split">
        <table className="table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th></tr></thead>
          <tbody>{people.map((person) => <tr key={person.id}><td>{person.name}</td><td>{person.email}</td><td>{person.role === "admin" ? "Administração" : "Equipe"}</td></tr>)}</tbody>
        </table>
        {user.role === "admin" && (
          <form className="panel" onSubmit={(e) => {
            e.preventDefault();
            api("/api/users", { method: "POST", body: form }).then((person) => { setPeople([...people, person]); setForm({ name: "", email: "", password: "", role: "member" }); }).catch((err) => setError(err.message));
          }}>
            <h2>Adicionar pessoa</h2>
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
