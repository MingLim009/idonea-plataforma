import { useEffect, useState } from "react";
import { api, formatDate, getToken, hoursLabel, today } from "./api.js";
import { priorityLabels, useI18n, useT } from "./i18n.jsx";

export function TaskDrawer({ taskId, tick, onClose }) {
  const t = useT();
  const { locale } = useI18n();
  const labels = priorityLabels(t);
  const [task, setTask] = useState(null);
  const [users, setUsers] = useState([]);
  const [comment, setComment] = useState("");
  const [subtask, setSubtask] = useState("");
  const [error, setError] = useState("");

  function load() {
    api(`/api/tasks/${taskId}`).then(setTask).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    api("/api/users").then(setUsers).catch(() => {});
  }, [taskId, tick]);

  if (!task) {
    return (
      <div className="drawer-back" onClick={onClose}>
        <aside className="drawer" onClick={(e) => e.stopPropagation()}>{error || t("common.loading")}</aside>
      </div>
    );
  }

  function save(patch) {
    api(`/api/tasks/${task.id}`, { method: "PATCH", body: patch }).then(setTask).catch((err) => setError(err.message));
  }

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">{task.project_name} · {task.section_name}</span>
          <button className="ghost" onClick={onClose}>{t("common.close")}</button>
        </div>
        {error && <div className="alert">{error}</div>}
        <h2>
          <input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} onBlur={() => save({ title: task.title })} />
        </h2>
        <div className="field inline">
          <label className="field">{t("common.priority")}
            <select value={task.priority} onChange={(e) => save({ priority: e.target.value })}>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">{t("common.due")}
            <input type="date" value={task.due_date || ""} onChange={(e) => save({ due_date: e.target.value })} />
          </label>
        </div>
        <label className="field">{t("common.assignee")}
          <select value={task.assignee_id || ""} onChange={(e) => save({ assignee_id: e.target.value || null })}>
            <option value="">{t("drawer.unassigned")}</option>
            {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label className="field">{t("common.description")}
          <textarea rows={4} value={task.description || ""} onChange={(e) => setTask({ ...task, description: e.target.value })} onBlur={() => save({ description: task.description })} />
        </label>
        <div className="row">
          <button className="primary" onClick={() => api("/api/time/start", { method: "POST", body: { task_id: task.id } })}>{t("drawer.startTimer")}</button>
          <button className="ghost" onClick={() => save({ status: task.status === "concluido" ? "aberto" : "concluido" })}>
            {task.status === "concluido" ? t("drawer.reopen") : t("drawer.complete")}
          </button>
          <button className="danger" onClick={() => api(`/api/tasks/${task.id}`, { method: "DELETE" }).then(onClose).catch((err) => setError(err.message))}>{t("common.delete")}</button>
        </div>
        <p className="muted" style={{ margin: "10px 0" }}>
          {t("drawer.estimate", {
            h: task.estimate?.hours,
            source: task.estimate?.source,
            logged: hoursLabel(task.minutes, t),
            overdue: task.due_date && task.due_date < today() && task.status !== "concluido" ? t("drawer.overdue") : "",
          })}
        </p>
        <h3>{t("drawer.subtasks")}</h3>
        {task.subtasks.map((item) => (
          <label key={item.id} className="subtask">
            <input type="checkbox" checked={item.status === "concluido"} onChange={() => api(`/api/tasks/${item.id}`, { method: "PATCH", body: { status: item.status === "concluido" ? "aberto" : "concluido" } }).then(load)} />
            {item.title}
          </label>
        ))}
        <form className="composer" onSubmit={(e) => {
          e.preventDefault();
          api("/api/tasks", { method: "POST", body: { project_id: task.project_id, parent_id: task.id, title: subtask, section_id: task.section_id } })
            .then(() => { setSubtask(""); load(); });
        }}>
          <input value={subtask} onChange={(e) => setSubtask(e.target.value)} placeholder={t("drawer.newSubtask")} />
          <button className="ghost">{t("common.add")}</button>
        </form>
        <h3 style={{ marginTop: 16 }}>{t("drawer.attachments")}</h3>
        {task.attachments.map((file) => (
          <div key={file.id}>
            <button className="textish" onClick={async () => {
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
        <h3 style={{ marginTop: 16 }}>{t("drawer.hours")}</h3>
        {task.timeEntries.map((entry) => (
          <div key={entry.id} className="comment">
            <strong>{hoursLabel(entry.minutes, t)}</strong> · {entry.user_name} · {formatDate(entry.work_date, locale)}
            <div className="muted">{entry.note} · {entry.source}</div>
          </div>
        ))}
        <h3 style={{ marginTop: 16 }}>{t("drawer.comments")}</h3>
        {task.comments.map((item) => (
          <div key={item.id} className="comment">
            <strong>{item.user_name}</strong>
            <div>{item.body}</div>
          </div>
        ))}
        <form className="composer" onSubmit={(e) => {
          e.preventDefault();
          api(`/api/tasks/${task.id}/comments`, { method: "POST", body: { body: comment } }).then(() => { setComment(""); load(); });
        }}>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("drawer.commentPh")} />
          <button className="primary">{t("common.save")}</button>
        </form>
      </aside>
    </div>
  );
}
