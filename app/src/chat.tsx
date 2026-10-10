// AI-generated with Claude Code, 2026-10-09, reviewed by Hyun Park
// In-canvas chat: agent choice (Claude Code, Codex), attaching selection, boards, comments and references, streaming and cancel, N variants.
import { useEffect, useRef, useState } from "react";

import { api } from "./api";
import { Icon } from "./icons";
import { strings } from "./strings";

export type ChatEvent =
  | { kind: "start"; agent: string; prompt: string; variants?: string[] }
  | { kind: "session"; id: string }
  | { kind: "delta"; text: string }
  | { kind: "break" }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; detail?: string }
  | { kind: "error"; text: string }
  | { kind: "log"; text: string }
  | { kind: "done"; cost?: number }
  | { kind: "end"; status: "done" | "error" | "cancelled" };

export type Ref = { kind: "url" | "image" | "file"; value: string; name?: string };
export type Attach = { comments: { id: string; text: string; file: string }[]; refs: Ref[] };

type Msg =
  | { role: "user"; text: string; chips: string[] }
  | { role: "ai"; id: string; agent: string; parts: ({ t: "text"; text: string } | { t: "tool"; name: string; detail?: string } | { t: "error"; text: string })[]; status: "running" | "done" | "error" | "cancelled"; cost?: number; variants?: string[] };

const AGENT_LABEL: Record<string, string> = { claude: "Claude Code", codex: "Codex" };

export function ChatPanel(p: {
  selection: { file: string; path: string; tag: string; text: string } | null;
  boards: string[];
  visibleCount: number;
  titleOf: (f: string) => string;
  attach: Attach;
  setAttach: (fn: (a: Attach) => Attach) => void;
  draft: string;
  setDraft: (s: string) => void;
  subscribe: (fn: (id: string, ev: ChatEvent) => void) => () => void;
  onLocate: (files: string[]) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [agents, setAgents] = useState<{ id: string; label: string; ok: boolean }[]>([]);
  const [agent, setAgent] = useState<string>(() => {
    try {
      return localStorage.getItem("design-canvas:agent") ?? "claude";
    } catch {
      return "claude";
    }
  });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, string>>({});
  const [useSel, setUseSel] = useState(true);
  const [useBoards, setUseBoards] = useState(true);
  const [useVisible, setUseVisible] = useState(true);
  const [variants, setVariants] = useState(1);
  const [urlInput, setUrlInput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef<string | null>(null);
  runningRef.current = running;

  useEffect(() => {
    api.get<{ agents: typeof agents }>("/api/agents").then((r) => setAgents(r.agents)).catch(() => {});
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("design-canvas:agent", agent);
    } catch {
      /* ignore */
    }
  }, [agent]);

  // Server events → messages. Events that arrive before the send response are buffered and attached later
  const known = useRef(new Set<string>());
  const pending = useRef(new Map<string, ChatEvent[]>());
  const applyRef = useRef<(id: string, ev: ChatEvent) => void>(() => {});
  useEffect(
    () =>
      p.subscribe((id, ev) => {
        if (!known.current.has(id)) {
          pending.current.set(id, [...(pending.current.get(id) ?? []), ev]);
          return;
        }
        applyRef.current(id, ev);
      }),
    [p.subscribe],
  );
  applyRef.current = (id: string, ev: ChatEvent) => {
        setMsgs((list) => {
          const i = list.findIndex((m) => m.role === "ai" && m.id === id);
          if (i < 0) return list;
          const m = { ...(list[i] as Extract<Msg, { role: "ai" }>) };
          const parts = [...m.parts];
          const last = parts[parts.length - 1];
          if (ev.kind === "delta") {
            if (last?.t === "text") parts[parts.length - 1] = { t: "text", text: last.text + ev.text };
            else parts.push({ t: "text", text: ev.text });
          } else if (ev.kind === "break") {
            if (last?.t === "text" && last.text) parts.push({ t: "text", text: "" });
          } else if (ev.kind === "text") parts.push({ t: "text", text: ev.text });
          else if (ev.kind === "tool") parts.push({ t: "tool", name: ev.name, detail: ev.detail });
          else if (ev.kind === "error") parts.push({ t: "error", text: ev.text });
          else if (ev.kind === "done") m.cost = ev.cost;
          else if (ev.kind === "start") m.variants = ev.variants;
          else if (ev.kind === "end") m.status = ev.status;
          else if (ev.kind === "session") setSessions((s) => ({ ...s, [m.agent]: ev.id }));
          m.parts = parts.filter((x) => x.t !== "text" || x.text);
          const next = [...list];
          next[i] = m;
          return next;
        });
        if (ev.kind === "end") setRunning((cur) => (cur === id ? null : cur));
  };
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const sel = useSel ? p.selection : null;
  const boards = useBoards ? p.boards : [];
  const canVariants = boards.length === 1 || (!boards.length && !!sel);

  const send = async () => {
    const text = p.draft.trim();
    if (!text || running) return;
    setError(null);
    const chips = [
      ...(sel ? [strings.chat.chipElement(sel.tag)] : []),
      ...boards.map((f) => p.titleOf(f)),
      ...(useVisible && p.visibleCount ? [strings.chat.chipVisible(p.visibleCount)] : []),
      ...p.attach.comments.map((c) => strings.chat.chipComment(c.text.slice(0, 16))),
      ...p.attach.refs.map((r) => r.name ?? r.value),
      ...(variants > 1 ? [strings.chat.variants(variants)] : []),
    ];
    try {
      const r = await api.post<{ id: string; variants: string[] }>("/api/chat", {
        agent,
        text,
        resume: sessions[agent],
        variants: canVariants ? variants : 0,
        attach: { selection: !!sel, boards, visible: useVisible, comments: p.attach.comments.map((c) => c.id), refs: p.attach.refs },
      });
      setMsgs((l) => [...l, { role: "user", text, chips }, { role: "ai", id: r.id, agent, parts: [], status: "running" }]);
      setRunning(r.id);
      known.current.add(r.id);
      for (const ev of pending.current.get(r.id) ?? []) applyRef.current(r.id, ev);
      pending.current.delete(r.id);
      p.setDraft("");
      p.setAttach(() => ({ comments: [], refs: [] }));
      setVariants(1);
      if (r.variants.length) p.onLocate(r.variants);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const cancel = () => running && api.post("/api/chat/cancel", { id: running }).catch(() => {});

  const upload = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (f.size > 15 * 1024 * 1024) {
        setError(strings.chat.tooBig(f.name));
        continue;
      }
      const data = await new Promise<string>((res) => {
        const rd = new FileReader();
        rd.onload = () => res(String(rd.result).split(",")[1] ?? "");
        rd.readAsDataURL(f);
      });
      try {
        const r = await api.post<Ref>("/api/refs", { name: f.name || strings.defaults.pastedImage, data });
        p.setAttach((a) => ({ ...a, refs: [...a.refs, r] }));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const current = agents.find((a) => a.id === agent);
  return (
    <section className="chat" aria-label={strings.chat.aria}>
      <div className="chat-head">
        <label className="agent-pick" title={strings.chat.agentHint}>
          <span className="agent-label muted small">{strings.chat.agent}</span>
          {agents.filter((a) => a.ok).length <= 1 && agents.length > 0 ? (
            <span className="agent-name">{current?.label ?? agent}</span>
          ) : (
            <select value={agent} onChange={(e) => setAgent(e.target.value)} disabled={!!running} aria-label={strings.chat.agent}>
              {(agents.length ? agents : [{ id: "claude", label: "Claude Code", ok: true }, { id: "codex", label: "Codex", ok: true }]).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.ok ? "" : strings.chat.notInstalled}
                </option>
              ))}
            </select>
          )}
        </label>
        {sessions[agent] && <span className="muted small">{strings.chat.continuing}</span>}
        <div className="spacer" />
        <button
          className="icon-btn sm new-chat"
          aria-label={strings.chat.newChat}
          title={strings.chat.newChat}
          disabled={!!running || (!msgs.length && !sessions[agent])}
          onClick={() => {
            setMsgs([]);
            setSessions({});
          }}
        >
          <Icon name="plus" size={14} /> <span>{strings.chat.newChat}</span>
        </button>
      </div>
      <div className="chat-list" ref={listRef} aria-live="polite">
        {msgs.length === 0 ? (
          <div className="chat-empty">
            <Icon name="comment" size={28} />
            <p>
              {strings.chat.intro(AGENT_LABEL[agent] ?? agent)}
            </p>
            <div className="chat-suggest">
              {strings.chat.suggestions.map((x) => (
                <button
                  key={x.label}
                  onClick={() => {
                    p.setDraft(x.text);
                    setVariants(x.n);
                  }}
                >
                  {x.label}
                </button>
              ))}
            </div>
            {current && !current.ok && <p className="warn">{strings.chat.notFound(current.label)}</p>}
          </div>
        ) : (
          msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="msg user">
                {m.chips.length > 0 && (
                  <div className="chips">
                    {m.chips.map((c, j) => (
                      <span key={j} className="chip">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <div className="bubble">{m.text}</div>
              </div>
            ) : (
              <div key={i} className={`msg ai ${m.status}`}>
                <div className="msg-head">
                  <strong>{AGENT_LABEL[m.agent] ?? m.agent}</strong>
                  {m.status === "running" && <span className="spinner" aria-label={strings.chat.running} />}
                  {m.status === "cancelled" && <span className="muted">{strings.chat.cancelled}</span>}
                  {m.status === "done" && m.cost != null && <span className="muted small">${m.cost.toFixed(3)}</span>}
                </div>
                {m.variants?.length ? (
                  <button className="link" onClick={() => p.onLocate(m.variants!)}>
                    {strings.chat.madeVariants(m.variants.length)}
                  </button>
                ) : null}
                {m.parts.map((x, j) =>
                  x.t === "text" ? (
                    <div key={j} className="ai-text">
                      {x.text}
                    </div>
                  ) : x.t === "tool" ? (
                    <div key={j} className="ai-tool">
                      <Icon name="edit" size={12} />
                      <span>{x.name}</span>
                      {x.detail && <code>{x.detail}</code>}
                    </div>
                  ) : (
                    <div key={j} className="ai-error">
                      <Icon name="warn" size={14} /> {x.text}
                    </div>
                  ),
                )}
                {m.status === "running" && !m.parts.length && <div className="muted">{strings.chat.thinking}</div>}
              </div>
            ),
          )
        )}
      </div>
      <div
        className="composer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
      >
        <div className="chips">
          {p.selection && (
            <Chip on={useSel} onToggle={() => setUseSel((v) => !v)} icon="select" label={strings.chat.chipElementText(p.selection.tag, p.selection.text.slice(0, 14))} />
          )}
          {p.boards.length > 0 && <Chip on={useBoards} onToggle={() => setUseBoards((v) => !v)} icon="board" label={p.boards.length === 1 ? p.titleOf(p.boards[0]) : strings.chat.chipBoards(p.boards.length)} />}
          {p.visibleCount > 0 && <Chip on={useVisible} onToggle={() => setUseVisible((v) => !v)} icon="fit" label={strings.chat.chipVisible(p.visibleCount)} />}
          {p.attach.comments.map((c) => (
            <Chip key={c.id} on icon="comment" label={strings.chat.chipComment(c.text.slice(0, 14))} onRemove={() => p.setAttach((a) => ({ ...a, comments: a.comments.filter((x) => x.id !== c.id) }))} />
          ))}
          {p.attach.refs.map((r, i) => (
            <Chip key={i} on icon={r.kind === "url" ? "link" : "page"} label={r.name ?? r.value} onRemove={() => p.setAttach((a) => ({ ...a, refs: a.refs.filter((_, j) => j !== i) }))} />
          ))}
        </div>
        {urlInput != null && (
          <div className="url-row">
            <input
              autoFocus
              value={urlInput}
              placeholder="https://"
              aria-label={strings.chat.refLink}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && /^https?:\/\/\S+$/.test(urlInput.trim())) {
                  p.setAttach((a) => ({ ...a, refs: [...a.refs, { kind: "url", value: urlInput.trim() }] }));
                  setUrlInput(null);
                }
                if (e.key === "Escape") setUrlInput(null);
              }}
            />
          </div>
        )}
        <textarea
          ref={p.inputRef}
          value={p.draft}
          rows={3}
          placeholder={running ? strings.chat.placeholderRunning : strings.chat.placeholder}
          aria-label={strings.chat.input}
          onChange={(e) => p.setDraft(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              void upload(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return; // Enter during IME composition commits the character
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
            if (e.key === "Escape") {
              if (running) cancel();
              else (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />
        {error && <p className="warn small">{error}</p>}
        <div className="composer-bar">
          <button className="icon-btn sm" aria-label={strings.chat.attach} title={strings.chat.attachTitle} onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={14} />
          </button>
          <button className="icon-btn sm" aria-label={strings.chat.addLink} title={strings.chat.addLink} onClick={() => setUrlInput("")}>
            <Icon name="link" size={14} />
          </button>
          <input ref={fileRef} type="file" multiple hidden accept="image/*,.pdf,.md,.txt,.html,.csv,.json" onChange={(e) => e.target.files && void upload(e.target.files)} />
          <label className="variants" title={canVariants ? strings.chat.variantsTitle : strings.chat.variantsDisabledTitle}>
            <select value={variants} disabled={!canVariants || !!running} onChange={(e) => setVariants(Number(e.target.value))} aria-label={strings.chat.variantsAria}>
              <option value={1}>{strings.chat.variants(1)}</option>
              <option value={2}>{strings.chat.variants(2)}</option>
              <option value={3}>{strings.chat.variants(3)}</option>
              <option value={4}>{strings.chat.variants(4)}</option>
            </select>
          </label>
          <div className="spacer" />
          {running ? (
            <button className="danger" onClick={cancel}>
              <Icon name="close" size={14} /> {strings.chat.cancel}
            </button>
          ) : (
            <button className="primary" disabled={!p.draft.trim()} onClick={() => void send()}>
              {strings.chat.send}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Chip({ on, onToggle, onRemove, icon, label }: { on: boolean; onToggle?: () => void; onRemove?: () => void; icon: Parameters<typeof Icon>[0]["name"]; label: string }) {
  return (
    <span className={`chip ${on ? "on" : "off"}`}>
      <button className="chip-main" onClick={onToggle} disabled={!onToggle} aria-pressed={onToggle ? on : undefined} title={onToggle ? (on ? strings.chat.chipRemoveTitle : strings.chat.chipAddTitle) : undefined}>
        <Icon name={icon} size={12} />
        <span>{label}</span>
      </button>
      {onRemove && (
        <button className="chip-x" aria-label={strings.chat.remove(label)} onClick={onRemove}>
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
}
