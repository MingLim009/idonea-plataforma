import { useCallback, useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api.js";
import { localizeApiError, useT } from "./i18n.jsx";
import { Loader } from "./Loader.jsx";
import { Shell } from "./Shell.jsx";
import { LogoMark } from "./LogoMark.jsx";
import { AiView, Dashboard, ImportView, ProjectView, TeamView, TimeView } from "./views.jsx";
import { TaskDrawer } from "./TaskDrawer.jsx";

export default function App() {
  const t = useT();
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
      .catch((err) => {
        if (/login|não autorizado|unauthorized|401/i.test(err.message || "")) {
          clearToken();
        }
      })
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
    setPage("inicio");
  }

  function leave() {
    api("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearToken();
    setUser(null);
  }

  const openProject = useCallback((id) => {
    setProjectId(id);
    setPage("projeto");
  }, []);

  if (booting) return <Loader label={t("common.loading")} />;
  if (!user) return <Login onEnter={enter} />;

  return (
    <Shell user={user} page={page} setPage={setPage} onLogout={leave} onOpenTask={setTaskId} onOpenProject={openProject} tick={tick}>
      {page === "inicio" && <Dashboard tick={tick} onOpenProject={openProject} onOpenTask={setTaskId} />}
      {page === "projeto" && (
        <ProjectView projectId={projectId} tick={tick} onOpenTask={setTaskId} onOpenProject={openProject} />
      )}
      {page === "tempo" && <TimeView tick={tick} onOpenTask={setTaskId} />}
      {page === "importar" && <ImportView />}
      {page === "ia" && <AiView gptKey={gptKey} onOpenTask={setTaskId} onOpenProject={openProject} />}
      {page === "equipe" && <TeamView user={user} />}
      {taskId && <TaskDrawer taskId={taskId} tick={tick} onClose={() => setTaskId(null)} onOpenProject={openProject} />}
    </Shell>
  );
}

function Login({ onEnter }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function showError(err) {
    setError(localizeApiError(err?.message || err, t));
  }

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
      showError(err);
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
          <h1 className="login-title">{mode === "conta" ? t("login.signupTitle") : t("login.title")}</h1>
          <p className="login-lead">{t("login.lead")}</p>
          {error && <div className="alert">{error}</div>}
          {mode === "conta" && (
            <label className="field">{t("login.name")}<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
          )}
          <label className="field">{t("login.email")}<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder={t("login.emailPh")} autoFocus={mode !== "conta"} /></label>
          <label className="field">{t("login.password")}<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder={t("login.passwordPh")} /></label>
          <button className="login-submit" type="submit">{mode === "conta" ? t("login.create") : t("login.submit")}</button>
          <p className="login-hint">{t("login.hint")}</p>
          <button type="button" className="login-switch" onClick={() => { setMode(mode === "conta" ? "login" : "conta"); setError(""); }}>
            {mode === "conta" ? t("login.haveAccount") : t("login.createAccount")}
          </button>
        </form>
      </div>
      <aside className="login-side" aria-hidden="true">
        <div className="login-hero">
          <div className="login-hero-kicker">{t("login.hero.kicker")}</div>
          <h2>{t("login.hero.title")}</h2>
          <p>{t("login.hero.body")}</p>
          <div className="login-hero-points">
            <span>{t("login.hero.p1")}</span>
            <span>{t("login.hero.p2")}</span>
            <span>{t("login.hero.p3")}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
