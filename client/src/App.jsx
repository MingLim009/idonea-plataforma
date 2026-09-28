import { useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api.js";
import { LanguageSwitcher, useT } from "./i18n.jsx";
import { Loader } from "./Loader.jsx";
import { Shell } from "./Shell.jsx";
import { LogoMark } from "./LogoMark.jsx";
import { AiView, CrmView, Dashboard, ImportView, ProjectView, TeamView, TimeView } from "./views.jsx";
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

  async function enterSocial(provider) {
    const data = await api("/api/auth/social", { method: "POST", body: { provider } });
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

  function openProject(id) {
    setProjectId(id);
    setPage("projeto");
  }

  if (booting) return <Loader />;
  if (!user) return <Login onEnter={enter} onSocial={enterSocial} />;

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

function Login({ onEnter, onSocial }) {
  const t = useT();
  const [email, setEmail] = useState("carolina@idonea.com");
  const [password, setPassword] = useState("demo123");
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [socialBusy, setSocialBusy] = useState("");

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

  async function social(provider) {
    setError("");
    setSocialBusy(provider);
    try {
      await onSocial(provider);
    } catch (err) {
      setError(err.message);
    } finally {
      setSocialBusy("");
    }
  }

  return (
    <div className="login">
      <div className="login-lang-bar">
        <LanguageSwitcher />
      </div>
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
            <label className="field">{t("login.name")}<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          )}
          <label className="field">{t("login.email")}<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder={t("login.emailPh")} /></label>
          <label className="field">{t("login.password")}<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder={t("login.passwordPh")} /></label>
          <button className="login-submit" type="submit">{mode === "conta" ? t("login.create") : t("login.submit")}</button>

          <div className="social-divider"><span>{t("login.or")}</span></div>
          <div className="social-auth">
            <button type="button" className="social-btn google" disabled={!!socialBusy} onClick={() => social("google")}>
              <SocialIcon provider="google" />
              {socialBusy === "google" ? t("login.socialBusy") : t("login.google")}
            </button>
            <button type="button" className="social-btn facebook" disabled={!!socialBusy} onClick={() => social("facebook")}>
              <SocialIcon provider="facebook" />
              {socialBusy === "facebook" ? t("login.socialBusy") : t("login.facebook")}
            </button>
            <button type="button" className="social-btn linkedin" disabled={!!socialBusy} onClick={() => social("linkedin")}>
              <SocialIcon provider="linkedin" />
              {socialBusy === "linkedin" ? t("login.socialBusy") : t("login.linkedin")}
            </button>
          </div>

          <div className="login-demos">
            <button type="button" className="ghost" onClick={() => onEnter("carolina@idonea.com", "demo123")}>Carolina</button>
            <button type="button" className="ghost" onClick={() => onEnter("marcelo@idonea.com", "demo123")}>Marcelo</button>
            <button type="button" className="ghost" onClick={() => onEnter("ana@idonea.com", "demo123")}>Ana</button>
          </div>
          <p className="login-hint">{t("login.hint")}</p>
          <button type="button" className="login-switch" onClick={() => setMode(mode === "conta" ? "login" : "conta")}>
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

function SocialIcon({ provider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.4 14.7 2.4 12 2.4 6.9 2.4 2.7 6.6 2.7 11.7S6.9 21 12 21c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.5H12z" />
        <path fill="#34A853" d="M3.1 7.4l3.2 2.4C7.2 7.6 9.4 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.4 14.7 2.4 12 2.4 8.1 2.4 4.8 4.6 3.1 7.4z" />
        <path fill="#FBBC05" d="M12 21c2.6 0 4.8-.9 6.4-2.4l-3.1-2.4c-.9.6-2 1-3.3 1-2.5 0-4.6-1.7-5.4-4l-3.2 2.5C5 18.8 8.2 21 12 21z" />
        <path fill="#4285F4" d="M20.6 12.3c0-.6-.1-1-.2-1.5H12v3.9h5.5c-.3 1.3-1.1 2.3-2.2 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7.8z" />
      </svg>
    );
  }
  if (provider === "facebook") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#1877F2" d="M24 12.1C24 5.4 18.6 0 12 0S0 5.4 0 12.1C0 18.1 4.4 23.1 10.1 24v-8.4H7.1v-3.5h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.9v2.3h3.3l-.5 3.5h-2.8V24C19.6 23.1 24 18.1 24 12.1z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#0A66C2" d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.3A1.8 1.8 0 116.5 4.8a1.8 1.8 0 010 3.5zM19 19h-3v-4.8c0-1.3-.5-2.1-1.6-2.1-.9 0-1.4.6-1.6 1.2-.1.2-.1.5-.1.8V19h-3s.0-8.2 0-9h3v1.3c.4-.6 1.1-1.5 2.8-1.5 2 0 3.5 1.3 3.5 4.2z" />
    </svg>
  );
}
