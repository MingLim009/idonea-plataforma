import { useEffect, useState } from "react";
import { api } from "./api.js";
import { useT, useTx } from "./i18n.jsx";
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

const NAV_IDS = ["inicio", "projeto", "tempo", "crm", "importar", "ia", "equipe"];

export function Shell({ user, page, setPage, onLogout, onOpenTask, onOpenProject, tick, children }) {
  const t = useT();
  const tx = useTx();
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

  const goHome = () => {
    setPage("inicio");
    setNavOpen(false);
  };

  return (
    <div className={`app${navOpen ? " nav-open" : ""}`}>
      {navOpen && (
        <button
          type="button"
          className="nav-scrim"
          aria-label={t("nav.close")}
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className="sidebar"
        id="app-sidebar"
        aria-label={t("nav.aria")}
        data-open={navOpen ? "true" : "false"}
      >
        <div className="brand">
          <button type="button" className="brand-home" onClick={goHome} aria-label={t("brand.home")} title={t("brand.home")}>
            <LogoMark size={38} />
            <div>
              <strong>idônea</strong>
              <span>{t("brand.tagline")}</span>
            </div>
          </button>
          <button
            type="button"
            className="nav-close"
            aria-label={t("nav.close")}
            onClick={() => setNavOpen(false)}
          >
            <i className={`fi ${ICONS.close}`} />
          </button>
        </div>
        <nav className="nav">
          {NAV_IDS.map((id) => (
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
              {t(`nav.${id}`)}
            </button>
          ))}
        </nav>
        <div className="userbox">
          <span className="avatar" style={{ background: user.color }}>{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role === "admin" ? t("user.admin") : t("user.member")}</small>
            <button type="button" className="logout" onClick={onLogout}>{t("user.logout")}</button>
          </div>
        </div>
      </aside>
      <section className="main">
        <div className="canvas-motif" aria-hidden="true">
          <svg className="canvas-motif-ring canvas-motif-ring-tl" viewBox="0 0 360 360" fill="none">
            <circle cx="180" cy="180" r="150" stroke="currentColor" strokeWidth="1.2" opacity="0.28" />
            <circle cx="180" cy="180" r="118" stroke="currentColor" strokeWidth="1" opacity="0.16" />
            <path d="M30 180c0-82.8 67.2-150 150-150" stroke="#00bebe" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M330 180c0 82.8-67.2 150-150 150" stroke="#f98f03" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
          </svg>
          <svg className="canvas-motif-ring canvas-motif-ring-br" viewBox="0 0 300 300" fill="none">
            <circle cx="150" cy="150" r="122" stroke="currentColor" strokeWidth="1" opacity="0.2" />
            <path d="M28 150c0-67.4 54.6-122 122-122" stroke="#5ee0e0" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
            <path d="M150 28c67.4 0 122 54.6 122 122" stroke="#00aec7" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
          </svg>
          <span className="canvas-orb canvas-orb-a" />
          <span className="canvas-orb canvas-orb-b" />
        </div>
        <header className="topbar">
          <button
            type="button"
            className="nav-toggle"
            aria-label={navOpen ? t("nav.close") : t("nav.open")}
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpen((v) => !v)}
          >
            <i className={`fi ${navOpen ? ICONS.close : ICONS.menu}`} />
          </button>
          <div className="search">
            <i className={`fi ${ICONS.search} search-ico`} />
            <input
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("search.aria")}
            />
            {results.length > 0 && (
              <div className="results">
                {results.map((task) => (
                  <button key={task.id} type="button" onClick={() => { onOpenTask(task.id); setQuery(""); }}>
                    {tx(task.title)}
                    <div className="muted">{tx(task.project_name)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bell">
            <button type="button" onClick={() => setOpenNotes((value) => !value)} aria-label={t("notes.label")}>
              <i className={`fi ${ICONS.bell}`} />
            </button>
            {unread > 0 && <span className="badge">{unread}</span>}
            {openNotes && (
              <div className="dropdown">
                <button type="button" className="textish" onClick={() => api("/api/notifications/read-all", { method: "POST" }).then(() => setNotes(notes.map((note) => ({ ...note, read: 1 }))))}>
                  {t("notes.markRead")}
                </button>
                {notes.length === 0 && <p className="empty-state">{t("notes.empty")}</p>}
                {notes.map((note) => (
                  <button key={note.id} type="button" className={`note ${note.read ? "" : "unread"}`} onClick={() => {
                    api(`/api/notifications/${note.id}/read`, { method: "POST" });
                    if (note.href?.startsWith("task:")) onOpenTask(note.href.slice(5));
                    if (note.href?.startsWith("project:") && onOpenProject) onOpenProject(note.href.slice(8));
                    setOpenNotes(false);
                  }}>
                    <strong>{tx(note.title)}</strong>
                    <div className="muted">{tx(note.body)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
        <div className="content">{children}</div>
        {running && (
          <div className="timerbar">
            <span>{t("timer.label")} · {tx(running.title)}</span>
            <strong>{formatClock(elapsed)}</strong>
            <button type="button" className="primary" onClick={() => api("/api/time/stop", { method: "POST" }).then(() => setRunning(null))}>
              {t("timer.stop")}
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
