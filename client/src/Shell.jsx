import { useEffect, useState } from "react";
import { api } from "./api.js";

const ICONS = {
  inicio: "fi-rr-home",
  projeto: "fi-rr-apps",
  tempo: "fi-rr-clock",
  crm: "fi-rr-chart-line-up",
  importar: "fi-rr-cloud-download",
  ia: "fi-rr-magic-wand",
  equipe: "fi-rr-users",
  search: "fi-rr-search",
  bell: "fi-rr-bell",
};

const NAV = [
  ["inicio", "Início"],
  ["projeto", "Projetos"],
  ["tempo", "Horas"],
  ["crm", "Vendas"],
  ["importar", "Importar"],
  ["ia", "Comandos"],
  ["equipe", "Equipe"],
];

export function Shell({ user, page, setPage, onLogout, onOpenTask, onOpenProject, tick, children }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [notes, setNotes] = useState([]);
  const [openNotes, setOpenNotes] = useState(false);
  const [running, setRunning] = useState(null);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    api("/api/notifications").then(setNotes).catch(() => {});
    api("/api/time/running").then(setRunning).catch(() => {});
  }, [tick]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setClock((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    const id = setTimeout(() => {
      api(`/api/search?q=${encodeURIComponent(query)}`).then(setResults).catch(() => {});
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const unread = notes.filter((note) => !note.read).length;
  const elapsed = running ? Math.max(0, Math.floor((Date.now() - new Date(running.started_at).getTime()) / 1000)) : 0;
  void clock;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i className="fi fi-rr-apps" />
          </span>
          <div>
            <strong>idônea</strong>
            <span>Projetos e vendas</span>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              data-tone={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <span className="nav-ico" aria-hidden="true">
                <i className={`fi ${ICONS[id]}`} />
              </span>
              {label}
            </button>
          ))}
        </nav>
        <div className="userbox">
          <span className="avatar" style={{ background: user.color }}>{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role === "admin" ? "Administração" : "Equipe"}</small>
            <button className="logout" onClick={onLogout}>Sair</button>
          </div>
        </div>
      </aside>
      <section className="main">
        <header className="topbar">
          <div className="search">
            <i className={`fi ${ICONS.search} search-ico`} />
            <input placeholder="Pesquise" value={query} onChange={(e) => setQuery(e.target.value)} />
            {results.length > 0 && (
              <div className="results">
                {results.map((task) => (
                  <button key={task.id} onClick={() => { onOpenTask(task.id); setQuery(""); }}>
                    {task.title}
                    <div className="muted">{task.project_name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bell">
            <button onClick={() => setOpenNotes((value) => !value)}>
              <i className={`fi ${ICONS.bell}`} />
              Avisos{unread > 0 ? ` (${unread})` : ""}
            </button>
            {unread > 0 && <span className="badge">{unread}</span>}
            {openNotes && (
              <div className="dropdown">
                <button className="textish" onClick={() => api("/api/notifications/read-all", { method: "POST" }).then(() => setNotes(notes.map((note) => ({ ...note, read: 1 }))))}>
                  Marcar como lidos
                </button>
                {notes.length === 0 && <p className="muted">Nenhum aviso.</p>}
                {notes.map((note) => (
                  <button key={note.id} className={`note ${note.read ? "" : "unread"}`} onClick={() => {
                    api(`/api/notifications/${note.id}/read`, { method: "POST" });
                    if (note.href?.startsWith("task:")) onOpenTask(note.href.slice(5));
                    if (note.href?.startsWith("project:") && onOpenProject) onOpenProject(note.href.slice(8));
                    setOpenNotes(false);
                  }}>
                    <strong>{note.title}</strong>
                    <div className="muted">{note.body}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
        <div className="content">{children}</div>
        {running && (
          <div className="timerbar">
            <span>Contando em {running.title}</span>
            <strong>{formatClock(elapsed)}</strong>
            <button className="primary" onClick={() => api("/api/time/stop", { method: "POST" }).then(() => setRunning(null))}>Parar e salvar</button>
          </div>
        )}
      </section>
    </div>
  );
}

function formatClock(total) {
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
