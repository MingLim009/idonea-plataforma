import { useEffect, useState } from "react";
import { api, formatDate, getToken, hoursLabel, today } from "./api.js";
import { priorityLabels, localizeApiError, useI18n, useT, useTx } from "./i18n.jsx";
import { Loader } from "./Loader.jsx";
import { CommentBody, CommentComposer } from "./CommentComposer.jsx";

export function TaskDrawer({ taskId, tick, onClose, onOpenProject }) {
  const t = useT();
  const tx = useTx();
  const { locale } = useI18n();
  const labels = priorityLabels(t);
  const [task, setTask] = useState(null);
  const [users, setUsers] = useState([]);
  const [subtask, setSubtask] = useState("");
  const [error, setError] = useState("");

  function showError(err) {
    setError(localizeApiError(err?.message || err, t));
  }

  function load() {
    return api(`/api/tasks/${taskId}`).then(setTask).catch(showError);
  }

  useEffect(() => {
    setError("");
    setTask(null);
    load();
    api("/api/users").then(setUsers).catch(() => {});
  }, [taskId, tick]);

  if (!task) {
    if (error) {
      return (
        <div className="drawer-back" onClick={onClose}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted">{t("errors.taskNotFound")}</span>
              <button className="ghost" onClick={onClose}>{t("common.close")}</button>
            </div>
            <div className="alert">{error}</div>
          </aside>
        </div>
      );
    }
    return <Loader label={t("common.loading")} />;
  }

  function save(patch) {
    api(`/api/tasks/${task.id}`, { method: "PATCH", body: patch }).then(setTask).catch(showError);
  }

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer asana-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-top">
          <button
            type="button"
            className="drawer-crumb"
            onClick={() => {
              if (onOpenProject) onOpenProject(task.project_id);
              onClose();
            }}
          >
            {tx(task.project_name)}
          </button>
          <span className="muted">· {tx(task.section_name)}</span>
          <button type="button" className="ghost drawer-close" onClick={onClose}>{t("common.close")}</button>
        </header>

        {error && <div className="alert">{error}</div>}

        <div className="drawer-title-row">
          <button
            type="button"
            className={`tcard-check${task.status === "concluido" ? " done" : ""}`}
            aria-label={t("drawer.complete")}
            onClick={() => save({ status: task.status === "concluido" ? "aberto" : "concluido" })}
          />
          <input
            className="drawer-title"
            value={task.title}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
            onBlur={() => save({ title: task.title })}
          />
        </div>

        <div className="drawer-props">
          <label className="drawer-prop">
            <span>{t("common.assignee")}</span>
            <select value={task.assignee_id || ""} onChange={(e) => save({ assignee_id: e.target.value || null })}>
              <option value="">{t("drawer.unassigned")}</option>
              {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label className="drawer-prop">
            <span>{t("common.due")}</span>
            <input type="date" value={task.due_date || ""} onChange={(e) => save({ due_date: e.target.value })} />
          </label>
          <label className="drawer-prop">
            <span>{t("common.priority")}</span>
            <select value={task.priority} onChange={(e) => save({ priority: e.target.value })}>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <label className="field drawer-desc">
          {t("common.description")}
          <textarea
            rows={4}
            value={task.description || ""}
            onChange={(e) => setTask({ ...task, description: e.target.value })}
            onBlur={() => save({ description: task.description })}
            placeholder={t("common.description")}
          />
        </label>

        <div className="row drawer-actions">
          <button className="primary" onClick={() => api("/api/time/start", { method: "POST", body: { task_id: task.id } })}>{t("drawer.startTimer")}</button>
          <button className="ghost" onClick={() => save({ status: task.status === "concluido" ? "aberto" : "concluido" })}>
            {task.status === "concluido" ? t("drawer.reopen") : t("drawer.complete")}
          </button>
          <button className="danger" onClick={() => api(`/api/tasks/${task.id}`, { method: "DELETE" }).then(onClose).catch(showError)}>{t("common.delete")}</button>
        </div>

        <p className="muted drawer-estimate">
          {t("drawer.estimate", {
            h: task.estimate?.hours,
            source: task.estimate?.source,
            logged: hoursLabel(task.minutes, t),
            overdue: task.due_date && task.due_date < today() && task.status !== "concluido" ? t("drawer.overdue") : "",
          })}
        </p>

        <section className="drawer-section">
          <h3>{t("drawer.subtasks")}</h3>
          {task.subtasks.map((item) => (
            <label key={item.id} className="subtask">
              <input
                type="checkbox"
                checked={item.status === "concluido"}
                onChange={() => api(`/api/tasks/${item.id}`, { method: "PATCH", body: { status: item.status === "concluido" ? "aberto" : "concluido" } }).then(load)}
              />
              {tx(item.title)}
            </label>
          ))}
          <form className="composer" onSubmit={(e) => {
            e.preventDefault();
            api("/api/tasks", { method: "POST", body: { project_id: task.project_id, parent_id: task.id, title: subtask, section_id: task.section_id } })
              .then(() => { setSubtask(""); load(); });
          }}>
            <input value={subtask} onChange={(e) => setSubtask(e.target.value)} placeholder={t("drawer.newSubtask")} />
            <button className="ghost" type="submit">{t("common.add")}</button>
          </form>
        </section>

        <section className="drawer-section">
          <h3>{t("drawer.attachments")}</h3>
          {task.attachments.map((file) => (
            <div key={file.id}>
              <button className="textish" type="button" onClick={async () => {
                const response = await fetch(`/api/attachments/${file.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = file.filename;
                link.click();
                URL.revokeObjectURL(url);
              }}>{file.filename}</button>
            </div>
          ))}
          <label className="file-btn">
            <input type="file" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const body = new FormData();
              body.append("file", file);
              api(`/api/tasks/${task.id}/attachments`, { method: "POST", body }).then(load);
              e.target.value = "";
            }} />
            {t("drawer.chooseFile")}
          </label>
        </section>

        <section className="drawer-section">
          <h3>{t("drawer.hours")}</h3>
          {task.timeEntries.map((entry) => (
            <div key={entry.id} className="comment">
              <strong>{hoursLabel(entry.minutes, t)}</strong> · {entry.user_name} · {formatDate(entry.work_date, locale)}
              <div className="muted">{tx(entry.note)} · {entry.source}</div>
            </div>
          ))}
        </section>

        <section className="drawer-section drawer-comments">
          <h3>{t("drawer.comments")}</h3>
          <div className="comment-list">
            {task.comments.map((item) => (
              <div key={item.id} className="comment comment-card">
                <div className="comment-meta">
                  <span className="dot" style={{ background: item.user_color || "#00bebe" }}>{(item.user_name || "?").slice(0, 1)}</span>
                  <strong>{item.user_name}</strong>
                </div>
                <CommentBody html={item.body} />
              </div>
            ))}
          </div>
          <CommentComposer
            onSubmit={async (html) => {
              await api(`/api/tasks/${task.id}/comments`, { method: "POST", body: { body: html } });
              await load();
            }}
          />
        </section>
      </aside>
    </div>
  );
}
