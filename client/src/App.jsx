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
      <div className="login-main">
        <form className="login-form" onSubmit={submit}>
          <div className="login-brand">
            <LogoMark size={32} />
            <span className="login-brand-name">idônea</span>
          </div>
          <h1 className="login-title">{mode === "conta" ? "Criar conta" : "Entrar"}</h1>
          <p className="login-lead">Gestão de projetos, horas e vendas em uma única plataforma.</p>
          {error && <div className="alert">{error}</div>}
          {mode === "conta" && (
            <label className="field">Nome<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          )}
          <label className="field">E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="Digite seu e-mail" /></label>
          <label className="field">Senha<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="Digite sua senha" /></label>
          <button className="login-submit" type="submit">{mode === "conta" ? "Criar conta" : "Entrar"}</button>
          <div className="login-demos">
            <button type="button" className="ghost" onClick={() => onEnter("carolina@idonea.com", "demo123")}>Carolina</button>
            <button type="button" className="ghost" onClick={() => onEnter("marcelo@idonea.com", "demo123")}>Marcelo</button>
            <button type="button" className="ghost" onClick={() => onEnter("ana@idonea.com", "demo123")}>Ana</button>
          </div>
          <p className="login-hint">Demonstração · senha demo123</p>
          <button type="button" className="login-switch" onClick={() => setMode(mode === "conta" ? "login" : "conta")}>
            {mode === "conta" ? "Já tenho conta" : "Criar uma conta"}
          </button>
        </form>
      </div>
      <aside className="login-side" aria-hidden="true">
        <div className="login-preview">
          <div className="login-preview-rail">
            <span style={{ background: "#00bebe" }} />
            <span style={{ background: "#5dade2" }} />
            <span style={{ background: "#f1c40f" }} />
            <span style={{ background: "#e74c3c" }} />
            <span style={{ background: "#9b59b6" }} />
            <span style={{ background: "#8229f9" }} />
          </div>
          <div className="login-preview-body">
            <div className="login-preview-top">
              <strong>Analytics</strong>
              <span>Esta semana</span>
            </div>
            <div className="login-preview-stat">
              <span>Horas apontadas</span>
              <b>49:32</b>
            </div>
            <div className="login-preview-bars">
              <span style={{ height: "42%" }} />
              <span style={{ height: "68%" }} />
              <span style={{ height: "54%" }} />
              <span style={{ height: "86%" }} />
              <span style={{ height: "61%" }} />
              <span style={{ height: "74%" }} />
            </div>
            <div className="login-preview-list">
              <div><i className="dot-mark" /><span>Campanha primavera</span><small>Em andamento</small></div>
              <div><i className="dot-mark" /><span>Site institucional</span><small>3 atrasadas</small></div>
              <div><i className="dot-mark" /><span>Clínica Vale</span><small>No prazo</small></div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
