import { useEffect, useState } from "react";
import { api } from "./api.js";
import { LogoMark } from "./LogoMark.jsx";

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
  menu: "fi-rr-menu-burger",
  close: "fi-rr-cross",
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
  const [navOpen, setNavOpen] = useState(false);
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

  useEffect(() => {
    setNavOpen(false);
    setOpenNotes(false);
  }, [page]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    document.body.classList.toggle("nav-locked", navOpen);
    return () => document.body.classList.remove("nav-locked");
  }, [navOpen]);

  const unread = notes.filter((note) => !note.read).length;
  const elapsed = running ? Math.max(0, Math.floor((Date.now() - new Date(running.started_at).getTime()) / 1000)) : 0;
  void clock;

  const go = (id) => {
    setPage(id);
    setNavOpen(false);
  };

  return (
    <div className={`app${navOpen ? " nav-open" : ""}`}>
      <button
        type="button"
        className="nav-scrim"
        aria-label="Fechar menu"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <aside className="sidebar" id="app-sidebar" aria-label="Navegação principal">
        <div className="brand">
          <LogoMark size={38} />
          <div>
            <strong>idônea</strong>
            <span>Projetos, horas e vendas</span>
          </div>
          <button
            type="button"
            className="nav-close"
            aria-label="Fechar menu"
            onClick={() => setNavOpen(false)}
          >
            <i className={`fi ${ICONS.close}`} />
          </button>
        </div>
        <nav className="nav">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-tone={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
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
            <button type="button" className="logout" onClick={onLogout}>Sair</button>
          </div>
        </div>
      </aside>
      <section className="main">
        <header className="topbar">
          <button
            type="button"
            className="nav-toggle"
            aria-label={navOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpen((v) => !v)}
          >
            <i className={`fi ${navOpen ? ICONS.close : ICONS.menu}`} />
          </button>
          <div className="search">
            <i className={`fi ${ICONS.search} search-ico`} />
            <input
              placeholder="Buscar tarefas, projetos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar"
            />
            {results.length > 0 && (
              <div className="results">
                {results.map((task) => (
                  <button key={task.id} type="button" onClick={() => { onOpenTask(task.id); setQuery(""); }}>
                    {task.title}
                    <div className="muted">{task.project_name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bell">
            <button type="button" onClick={() => setOpenNotes((value) => !value)} aria-label="Avisos">
              <i className={`fi ${ICONS.bell}`} />
              <span className="bell-label">Avisos</span>
            </button>
            {unread > 0 && <span className="badge">{unread}</span>}
            {openNotes && (
              <div className="dropdown">
                <button type="button" className="textish" onClick={() => api("/api/notifications/read-all", { method: "POST" }).then(() => setNotes(notes.map((note) => ({ ...note, read: 1 }))))}>
                  Marcar como lidos
                </button>
                {notes.length === 0 && <p className="empty-state">Nenhum aviso por agora.</p>}
                {notes.map((note) => (
                  <button key={note.id} type="button" className={`note ${note.read ? "" : "unread"}`} onClick={() => {
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
            <span>Timer · {running.title}</span>
            <strong>{formatClock(elapsed)}</strong>
            <button type="button" className="primary" onClick={() => api("/api/time/stop", { method: "POST" }).then(() => setRunning(null))}>
              Parar e salvar
            </button>
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
