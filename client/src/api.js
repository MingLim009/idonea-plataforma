const TOKEN_KEY = "idonea_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(path, { ...options, headers, body });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

export function money(cents, locale = "pt-BR") {
  return (Number(cents || 0) / 100).toLocaleString(locale, { style: "currency", currency: "BRL" });
}

export function hoursLabel(minutes, t) {
  const total = Number(minutes || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (typeof t === "function") {
    if (!h) return t("hours.min", { n: m });
    if (!m) return t("hours.h", { n: h });
    return t("hours.hm", { h, m });
  }
  if (!h) return `${m} min`;
  if (!m) return `${h}h`;
  return `${h}h ${m}min`;
}

export function formatDate(value, locale = "pt-BR") {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return `${d}/${m}/${y}`;
  return date.toLocaleDateString(locale);
}

export function today() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export const priorityLabel = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};
