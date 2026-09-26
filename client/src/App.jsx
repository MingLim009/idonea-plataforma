import { useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api.js";
import { Shell } from "./Shell.jsx";
import { LogoMark } from "./LogoMark.jsx";
import { AiView, CrmView, Dashboard, ImportView, ProjectView, TeamView, TimeView } from "./views.jsx";
import { TaskDrawer } from "./TaskDrawer.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [gptKey, setGptKey] = useState("");
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState("inicio");
  const [projectId, setProjectId] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api("/api/me")
      .then((data) => {
        setUser(data.user);
        setGptKey(data.gptKey || "");
      })
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const source = new EventSource(`/api/events?token=${getToken()}`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "update") setTick((value) => value + 1);
    };
    return () => source.close();
  }, [user]);

  async function enter(email, password) {
    const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
    setToken(data.token);
    const me = await api("/api/me");
    setUser(me.user);
    setGptKey(me.gptKey || "");
  }

  function leave() {
    api("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearToken();
    setUser(null);
  }

  function openProject(id) {
    setProjectId(id);
    setPage("projeto");
  }

  if (booting) return <div className="content">Carregando…</div>;
  if (!user) return <Login onEnter={enter} />;

  return (
    <Shell user={user} page={page} setPage={setPage} onLogout={leave} onOpenTask={setTaskId} onOpenProject={openProject} tick={tick}>
      {page === "inicio" && <Dashboard tick={tick} onOpenProject={openProject} onOpenTask={setTaskId} />}
      {page === "projeto" && (
        <ProjectView projectId={projectId} tick={tick} onOpenTask={setTaskId} onOpenProject={openProject} />
      )}
      {page === "tempo" && <TimeView tick={tick} onOpenTask={setTaskId} />}
      {page === "crm" && <CrmView tick={tick} onOpenProject={openProject} />}
      {page === "importar" && <ImportView />}
      {page === "ia" && <AiView gptKey={gptKey} onOpenTask={setTaskId} onOpenProject={openProject} />}
      {page === "equipe" && <TeamView user={user} />}
      {taskId && <TaskDrawer taskId={taskId} tick={tick} onClose={() => setTaskId(null)} />}
    </Shell>
  );
}

function Login({ onEnter }) {
  const [email, setEmail] = useState("carolina@idonea.com");
  const [password, setPassword] = useState("demo123");
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (mode === "conta") {
        const data = await api("/api/auth/register", { method: "POST", body: { name, email, password } });
        setToken(data.token);
        window.location.reload();
        return;
      }
      await onEnter(email, password);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <div className="brand-row">
          <LogoMark size={40} />
          <h1>idônea</h1>
        </div>
        <h2 style={{ fontFamily: "Lexend, sans-serif", fontWeight: 600, fontSize: 20, marginBottom: 4 }}>
          {mode === "conta" ? "Criar conta" : "Entrar"}
        </h2>
        <p className="muted">Gestão de projetos, horas e vendas em uma única plataforma.</p>
        <div style={{ height: 16 }} />
        {error && <div className="alert">{error}</div>}
        {mode === "conta" && (
          <label className="field">Nome<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        )}
        <label className="field">E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
        <label className="field">Senha<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
        <button className="primary" type="submit">{mode === "conta" ? "Criar conta" : "Entrar"}</button>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="ghost" onClick={() => onEnter("carolina@idonea.com", "demo123")}>Carolina</button>
          <button type="button" className="ghost" onClick={() => onEnter("marcelo@idonea.com", "demo123")}>Marcelo</button>
          <button type="button" className="ghost" onClick={() => onEnter("ana@idonea.com", "demo123")}>Ana</button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>Demonstração · senha demo123</p>
        <button type="button" className="textish" style={{ marginTop: 8 }} onClick={() => setMode(mode === "conta" ? "login" : "conta")}>
          {mode === "conta" ? "Já tenho conta" : "Criar uma conta"}
        </button>
      </form>
      <aside className="login-side" aria-hidden="true">
        <div className="login-side-card">
          <strong>Horas apontadas</strong>
          <b>49:32</b>
        </div>
      </aside>
    </div>
  );
}
