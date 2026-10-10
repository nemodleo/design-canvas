// AI-generated with Claude Code, 2026-10-09, reviewed by Hyun Park
// Shared UI: toasts, context menus, in-app prompt and confirm dialogs. Supports keyboard (Esc, Enter, arrows) and aria.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Icon, type IconName } from "./icons";
import { strings } from "./strings";

/* ---------------- Toasts ---------------- */
export type Toast = { id: number; text: string; tone?: "info" | "ok" | "error"; action?: { label: string; run: () => void } };
type ToastApi = (t: Omit<Toast, "id">) => void;
const ToastCtx = createContext<ToastApi>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback<ToastApi>((t) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.tone === "error" ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast ${t.tone ?? "info"}`}>
            {t.tone === "error" ? <Icon name="warn" /> : t.tone === "ok" ? <Icon name="check" /> : null}
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run();
                  setList((l) => l.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Context menu ---------------- */
export type MenuItem = { label: string; icon?: IconName; shortcut?: string; disabled?: boolean; danger?: boolean; /** Toggle state shown as a check mark */ check?: boolean; run: () => void } | "sep";
export type MenuState = { x: number; y: number; items: MenuItem[]; title?: string } | null;

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(-1);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
    setActive(-1);
    ref.current.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("blur", onClose);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  const items = menu.items;
  const enabled = items.map((it, i) => (it !== "sep" && !it.disabled ? i : -1)).filter((i) => i >= 0);
  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      tabIndex={-1}
      aria-label={menu.title ?? strings.dialog.menu}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const k = enabled.indexOf(active);
          const n = e.key === "ArrowDown" ? enabled[(k + 1) % enabled.length] : enabled[(k - 1 + enabled.length) % enabled.length];
          setActive(n);
        } else if (e.key === "Enter" && active >= 0) {
          const it = items[active];
          if (it !== "sep") {
            onClose();
            it.run();
          }
        }
      }}
    >
      {menu.title && <div className="menu-title">{menu.title}</div>}
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : (
          <button
            key={i}
            role={it.check === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={it.check === undefined ? undefined : it.check}
            className={`menu-item ${active === i ? "active" : ""} ${it.danger ? "danger" : ""}`}
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            <span className="menu-icon">{it.icon && <Icon name={it.icon} size={16} />}</span>
            <span className="menu-label">{it.label}</span>
            {it.check !== undefined && <span className={`menu-check ${it.check ? "on" : ""}`} aria-hidden="true"><Icon name="check" size={14} /></span>}
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

/* ---------------- Prompt and confirm dialogs ---------------- */
export type DialogState =
  | { kind: "prompt"; title: string; label?: string; value: string; hint?: string; ok: string; extra?: { label: string; checked: boolean }; resolve: (v: { value: string; extra: boolean } | null) => void }
  | { kind: "confirm"; title: string; body: string; ok: string; danger?: boolean; resolve: (ok: boolean) => void }
  | null;

export function Dialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [extra, setExtra] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.kind === "prompt") {
      setValue(state.value);
      setExtra(state.extra?.checked ?? false);
      setTimeout(() => inputRef.current?.select(), 0);
    } else setTimeout(() => okRef.current?.focus(), 0);
  }, [state]);
  if (!state) return null;
  const cancel = () => {
    if (state.kind === "prompt") state.resolve(null);
    else state.resolve(false);
    onClose();
  };
  const ok = () => {
    if (state.kind === "prompt") state.resolve({ value, extra });
    else state.resolve(true);
    onClose();
  };
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter" && !e.nativeEvent.isComposing) ok();
        }}
      >
        <h2>{state.title}</h2>
        {state.kind === "prompt" ? (
          <>
            <label className="dialog-field">
              {state.label && <span>{state.label}</span>}
              <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
            {state.hint && <p className="muted">{state.hint}</p>}
            {state.extra && (
              <label className="check">
                <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />
                {state.extra.label}
              </label>
            )}
          </>
        ) : (
          <p>{state.body}</p>
        )}
        <div className="dialog-actions">
          <button onClick={cancel}>{strings.dialog.cancel}</button>
          <button ref={okRef} className={state.kind === "confirm" && state.danger ? "danger primary" : "primary"} onClick={ok}>
            {state.ok}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Promise-based dialogs: const v = await ask.prompt({...}) */
export function useDialog() {
  const [state, setState] = useState<DialogState>(null);
  const prompt = (o: { title: string; label?: string; value?: string; hint?: string; ok?: string; extra?: { label: string; checked: boolean } }) =>
    new Promise<{ value: string; extra: boolean } | null>((resolve) => setState({ kind: "prompt", value: o.value ?? "", ok: o.ok ?? strings.dialog.ok, ...o, resolve }));
  const confirm = (o: { title: string; body: string; ok?: string; danger?: boolean }) => new Promise<boolean>((resolve) => setState({ kind: "confirm", ok: o.ok ?? strings.dialog.ok, ...o, resolve }));
  return { state, close: () => setState(null), prompt, confirm };
}
