import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { useT } from "./i18n.jsx";

/** Keep only safe formatting tags for comment HTML. */
export function sanitizeCommentHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html || "";
  const walk = (node) => {
    const children = [...node.childNodes];
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }
      const tag = child.tagName;
      if (tag === "A") {
        const href = child.getAttribute("href") || "";
        if (!/^https?:\/\//i.test(href)) child.removeAttribute("href");
        else child.setAttribute("href", href);
        child.setAttribute("rel", "noopener noreferrer");
        child.setAttribute("target", "_blank");
        [...child.attributes].forEach((attr) => {
          if (!["href", "rel", "target"].includes(attr.name)) child.removeAttribute(attr.name);
        });
      } else if (["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "CODE", "BR", "UL", "OL", "LI", "P", "DIV", "SPAN"].includes(tag)) {
        [...child.attributes].forEach((attr) => {
          if (attr.name === "class" && attr.value === "mention") return;
          if (attr.name === "data-type" || attr.name === "data-id" || attr.name === "data-label") return;
          child.removeAttribute(attr.name);
        });
      } else {
        const text = document.createTextNode(child.textContent || "");
        child.replaceWith(text);
        continue;
      }
      walk(child);
    }
  };
  walk(template.content);
  return template.innerHTML;
}

function plainFromHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").trim();
}

export function CommentBody({ html }) {
  if (!html) return null;
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return <div className="comment-body">{html}</div>;
  }
  return <div className="comment-body" dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(html) }} />;
}

export function CommentComposer({ onSubmit, disabled }) {
  const t = useT();
  const editorRef = useRef(null);
  const [empty, setEmpty] = useState(true);
  const [mention, setMention] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mention?.query && mention?.query !== "") return undefined;
    let cancelled = false;
    const id = setTimeout(() => {
      api(`/api/mentions?q=${encodeURIComponent(mention.query || "")}`)
        .then((rows) => { if (!cancelled) setSuggestions(rows); })
        .catch(() => { if (!cancelled) setSuggestions([]); });
    }, 120);
    return () => { cancelled = true; clearTimeout(id); };
  }, [mention?.query]);

  function focusEditor() {
    editorRef.current?.focus();
  }

  function syncEmpty() {
    const text = plainFromHtml(editorRef.current?.innerHTML || "");
    setEmpty(!text);
  }

  function runFormat(command, value = null) {
    focusEditor();
    document.execCommand(command, false, value);
    syncEmpty();
  }

  function insertLink() {
    const url = window.prompt(t("composer.linkPrompt"), "https://");
    if (!url) return;
    runFormat("createLink", url);
  }

  function getCaretMention() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current?.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent || "";
    const before = text.slice(0, range.startOffset);
    const match = before.match(/(^|[\s([{])@([^@\s]*)$/);
    if (!match) return null;
    return {
      query: match[2] || "",
      node,
      start: range.startOffset - match[2].length - 1,
      end: range.startOffset,
    };
  }

  function getCaretSlash() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current?.contains(sel.anchorNode)) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    const before = (node.textContent || "").slice(0, range.startOffset);
    return /(^|[\s])\/$/.test(before);
  }

  function onInput() {
    syncEmpty();
    const found = getCaretMention();
    if (found) {
      setMention(found);
      setSlashOpen(false);
      return;
    }
    setMention(null);
    setSuggestions([]);
    setSlashOpen(getCaretSlash());
  }

  function replaceRange(node, start, end, element) {
    const text = node.textContent || "";
    const before = text.slice(0, start);
    const after = text.slice(end);
    const parent = node.parentNode;
    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(element);
    frag.appendChild(document.createTextNode("\u00a0"));
    if (after) frag.appendChild(document.createTextNode(after));
    parent.replaceChild(frag, node);
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStartAfter(element.nextSibling || element);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertMention(item) {
    if (!mention) return;
    const chip = document.createElement("span");
    chip.className = "mention";
    chip.contentEditable = "false";
    chip.dataset.type = item.type;
    chip.dataset.id = item.id;
    chip.dataset.label = item.label;
    chip.textContent = `@${item.label}`;
    replaceRange(mention.node, mention.start, mention.end, chip);
    setMention(null);
    setSuggestions([]);
    syncEmpty();
    focusEditor();
  }

  function applySlash(command) {
    // remove trailing "/"
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        if (text.endsWith("/") || text[range.startOffset - 1] === "/") {
          node.textContent = text.slice(0, range.startOffset - 1) + text.slice(range.startOffset);
          const next = document.createRange();
          next.setStart(node, Math.max(0, range.startOffset - 1));
          next.collapse(true);
          sel.removeAllRanges();
          sel.addRange(next);
        }
      }
    }
    setSlashOpen(false);
    if (command === "ul") runFormat("insertUnorderedList");
    else if (command === "ol") runFormat("insertOrderedList");
    else if (command === "code") runFormat("formatBlock", "pre");
    else runFormat(command);
  }

  async function submit() {
    const html = sanitizeCommentHtml(editorRef.current?.innerHTML || "");
    const text = plainFromHtml(html);
    if (!text || busy || disabled) return;
    setBusy(true);
    try {
      await onSubmit(html);
      if (editorRef.current) editorRef.current.innerHTML = "";
      setEmpty(true);
      setMention(null);
      setSlashOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (mention && suggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Tab")) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(suggestions[0]);
      }
    }
    if (e.key === "Escape") {
      setMention(null);
      setSlashOpen(false);
    }
  }

  const tools = [
    ["bold", "B", t("composer.bold")],
    ["italic", "I", t("composer.italic")],
    ["strikeThrough", "S", t("composer.strike")],
    ["underline", "U", t("composer.underline")],
  ];

  return (
    <div className="asana-composer">
      <div className="asana-composer-toolbar" role="toolbar" aria-label={t("composer.toolbar")}>
        <span className="asana-composer-style">{t("composer.normalText")}</span>
        {tools.map(([cmd, label, title]) => (
          <button key={cmd} type="button" className="asana-tool" title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat(cmd)}>
            {label}
          </button>
        ))}
        <button type="button" className="asana-tool" title={t("composer.link")} onMouseDown={(e) => e.preventDefault()} onClick={insertLink}>🔗</button>
        <button type="button" className="asana-tool" title={t("composer.code")} onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("formatBlock", "pre")}>{"</>"}</button>
        <button type="button" className="asana-tool" title={t("composer.list")} onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("insertUnorderedList")}>≡</button>
      </div>

      <div className="asana-composer-body">
        {empty && <div className="asana-composer-placeholder" onClick={focusEditor}>{t("composer.placeholder")}</div>}
        <div
          ref={editorRef}
          className="asana-composer-editor"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={t("drawer.comments")}
          data-placeholder={t("composer.placeholder")}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onBlur={syncEmpty}
          suppressContentEditableWarning
        />
        {mention && (
          <div className="mention-menu" role="listbox">
            <div className="mention-menu-head">{t("composer.mentionHead")}</div>
            {suggestions.length === 0 && <p className="muted mention-empty">{t("composer.mentionEmpty")}</p>}
            {suggestions.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                className="mention-item"
                onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
              >
                <span className={`mention-badge ${item.type}`}>{item.type === "user" ? "P" : item.type === "project" ? "J" : "T"}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            ))}
          </div>
        )}
        {slashOpen && (
          <div className="mention-menu slash-menu" role="menu">
            <div className="mention-menu-head">{t("composer.slashHead")}</div>
            {[
              ["bold", t("composer.bold")],
              ["italic", t("composer.italic")],
              ["ul", t("composer.list")],
              ["code", t("composer.code")],
            ].map(([cmd, label]) => (
              <button key={cmd} type="button" className="mention-item" onMouseDown={(e) => { e.preventDefault(); applySlash(cmd); }}>
                <span className="mention-badge">{cmd === "ul" ? "≡" : cmd[0].toUpperCase()}</span>
                <span><strong>{label}</strong></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="asana-composer-footer">
        <div className="asana-composer-actions">
          <button type="button" className="asana-tool" title="@" onMouseDown={(e) => e.preventDefault()} onClick={() => {
            focusEditor();
            document.execCommand("insertText", false, "@");
            onInput();
          }}>@</button>
          <button type="button" className="asana-tool" title="/" onMouseDown={(e) => e.preventDefault()} onClick={() => {
            focusEditor();
            document.execCommand("insertText", false, "/");
            onInput();
          }}>/</button>
        </div>
        <button type="button" className="asana-send" disabled={empty || busy || disabled} onClick={submit} aria-label={t("composer.send")}>
          ↑
        </button>
      </div>
    </div>
  );
}
