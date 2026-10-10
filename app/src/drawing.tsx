// AI-generated with Claude Code, 2026-10-09, reviewed by Hyun Park
// Canvas drawing: draw, select, move and resize shapes (rectangle, oval, line, arrow, pen, image), note options, board layout guides.
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";

import { Icon } from "./icons";
import type { LayoutGuide, Note, Shape, ShapeKind, View } from "./types";
import { strings } from "./strings";

export const STICKY_COLORS: { id: string; label: string; bg: string }[] = [
  { id: "yellow", label: strings.shapes.stickyColors.yellow, bg: "#FFF1A8" },
  { id: "orange", label: strings.shapes.stickyColors.orange, bg: "#FFD9BC" },
  { id: "pink", label: strings.shapes.stickyColors.pink, bg: "#FFD6E2" },
  { id: "purple", label: strings.shapes.stickyColors.purple, bg: "#E5DAFF" },
  { id: "blue", label: strings.shapes.stickyColors.blue, bg: "#D2E4FF" },
  { id: "green", label: strings.shapes.stickyColors.green, bg: "#D5F0D3" },
  { id: "gray", label: strings.shapes.stickyColors.gray, bg: "#ECEBE7" },
  { id: "white", label: strings.shapes.stickyColors.white, bg: "#FFFFFF" },
];
export const stickyBg = (c?: string) => STICKY_COLORS.find((x) => x.id === c)?.bg ?? STICKY_COLORS[0].bg;
export const MAX_NOTES = 200;
export const MAX_GUIDES = 6;
const SHAPE_COLORS = ["#111111", "#6B6B6B", "#C94F0C", "#B42318", "#1E7A4C", "#2F6FDE", "#FFFFFF", "none"];

/* ---------------- Shape rendering ---------------- */
function ShapeSvg({ s, id }: { s: Shape; id: string }) {
  const sw = s.strokeWidth ?? 4;
  const stroke = s.stroke ?? "#111111";
  const fill = s.fill ?? "none";
  const pad = sw;
  const w = Math.max(1, s.w);
  const h = Math.max(1, s.h);
  const pts = (s.points ?? []).map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg width={w + pad * 2} height={h + pad * 2} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} style={{ position: "absolute", left: -pad, top: -pad, overflow: "visible" }}>
      {s.kind === "arrow" && (
        <defs>
          <marker id={`ah-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={stroke} />
          </marker>
        </defs>
      )}
      {s.kind === "rect" && <rect x={0} y={0} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={sw} />}
      {s.kind === "oval" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={sw} />}
      {(s.kind === "line" || s.kind === "arrow") && <polyline points={pts} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" markerEnd={s.kind === "arrow" ? `url(#ah-${id})` : undefined} />}
      {s.kind === "pen" && <polyline points={pts} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
      {s.kind === "image" && <image href={s.src?.replace(/^\.\.\//, "/")} x={0} y={0} width={w} height={h} preserveAspectRatio="xMidYMid slice" />}
    </svg>
  );
}

export function ShapesLayer(p: {
  shapes: Record<string, Shape>;
  ids: string[];
  zoom: number;
  selected: string[];
  interactive: boolean;
  onSelect: (id: string, add?: boolean) => void;
  onChange: (id: string, patch: Partial<Shape>, done: boolean) => void;
  onContext: (id: string, e: { clientX: number; clientY: number }) => void;
}) {
  const drag = useRef<null | { id: string; mode: "move" | "resize"; sx: number; sy: number; o: Shape; moved: boolean }>(null);
  const start = (id: string, mode: "move" | "resize") => (e: RPointerEvent) => {
    if (e.button !== 0 || !p.interactive) return;
    e.stopPropagation();
    p.onSelect(id, e.shiftKey);
    if (e.shiftKey) return;
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, o: p.shapes[id], moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent, done = false) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / p.zoom;
    const dy = (e.clientY - d.sy) / p.zoom;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2 / p.zoom) {
      if (done) drag.current = null;
      return;
    }
    d.moved = true;
    if (d.mode === "move") p.onChange(d.id, { x: Math.round(d.o.x + dx), y: Math.round(d.o.y + dy) }, done);
    else {
      const w = Math.max(8, d.o.w + dx);
      const h = Math.max(8, d.o.h + dy);
      const sx = w / Math.max(1, d.o.w);
      const sy = h / Math.max(1, d.o.h);
      const patch: Partial<Shape> = { w: Math.round(w), h: Math.round(h) };
      if (d.o.points) patch.points = d.o.points.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)]);
      p.onChange(d.id, patch, done);
    }
    if (done) drag.current = null;
  };
  return (
    <>
      {p.ids.map((id) => {
        const s = p.shapes[id];
        const sel = p.selected.includes(id);
        return (
          <div
            key={id}
            className={`shape ${sel ? "selected" : ""}`}
            data-shape={id}
            style={{ left: s.x, top: s.y, width: Math.max(1, s.w), height: Math.max(1, s.h), pointerEvents: p.interactive ? "auto" : "none" }}
            onPointerDown={start(id, "move")}
            onPointerMove={(e) => move(e)}
            onPointerUp={(e) => move(e, true)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!p.selected.includes(id)) p.onSelect(id);
              p.onContext(id, e);
            }}
          >
            <ShapeSvg s={s} id={id} />
            {sel && (
              <div
                className="shape-resize"
                role="slider"
                aria-label={strings.shapes.shapeSize}
                aria-valuetext={`${s.w} × ${s.h}`}
                style={{ width: 12 / p.zoom, height: 12 / p.zoom, right: -6 / p.zoom, bottom: -6 / p.zoom, borderWidth: 1.5 / p.zoom }}
                onPointerDown={start(id, "resize")}
                onPointerMove={(e) => move(e)}
                onPointerUp={(e) => move(e, true)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/* ---------------- Shape drawing (overlay on the canvas when a shape tool is active) ---------------- */
export function ShapeDrawer({ tool, view, onDone }: { tool: ShapeKind; view: View; onDone: (s: Shape) => void }) {
  const [draft, setDraft] = useState<Shape | null>(null);
  const st = useRef<{ x0: number; y0: number; pts: [number, number][] } | null>(null);
  const world = (e: RPointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.zoom, y: (e.clientY - r.top - view.y) / view.zoom };
  };
  const shapeOf = (x0: number, y0: number, x1: number, y1: number, pts: [number, number][], shift: boolean): Shape => {
    if (shift && (tool === "rect" || tool === "oval")) {
      const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      x1 = x0 + Math.sign(x1 - x0 || 1) * d;
      y1 = y0 + Math.sign(y1 - y0 || 1) * d;
    }
    if (tool === "pen") {
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { kind: "pen", x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, points: pts.map(([a, b]) => [Math.round(a - x), Math.round(b - y)]) };
    }
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    if (tool === "line" || tool === "arrow") return { kind: tool, x, y, w, h, points: [[Math.round(x0 - x), Math.round(y0 - y)], [Math.round(x1 - x), Math.round(y1 - y)]] };
    return { kind: tool, x, y, w, h };
  };
  return (
    <div
      className="shape-drawer"
      aria-label={strings.shapes.drawShape}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const w = world(e);
        st.current = { x0: w.x, y0: w.y, pts: [[w.x, w.y]] };
      }}
      onPointerMove={(e) => {
        const s = st.current;
        if (!s) return;
        const w = world(e);
        if (tool === "pen") s.pts.push([w.x, w.y]);
        setDraft(shapeOf(s.x0, s.y0, w.x, w.y, s.pts, e.shiftKey));
      }}
      onPointerUp={(e) => {
        const s = st.current;
        st.current = null;
        setDraft(null);
        if (!s) return;
        const w = world(e);
        let sh = shapeOf(s.x0, s.y0, w.x, w.y, s.pts, e.shiftKey);
        // A plain click uses the default size
        if (sh.w < 4 && sh.h < 4) {
          if (tool === "pen") return;
          sh = tool === "line" || tool === "arrow" ? { kind: tool, x: s.x0, y: s.y0, w: 200, h: 0, points: [[0, 0], [200, 0]] } : { kind: tool, x: s.x0, y: s.y0, w: 200, h: 140 };
        }
        onDone({ ...sh, x: Math.round(sh.x), y: Math.round(sh.y), w: Math.round(sh.w), h: Math.round(sh.h) });
      }}
    >
      {draft && (
        <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, pointerEvents: "none" }}>
          <div className="shape" style={{ left: draft.x, top: draft.y, width: Math.max(1, draft.w), height: Math.max(1, draft.h) }}>
            <ShapeSvg s={{ ...draft, strokeWidth: 4 }} id="draft" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Right panel: shape options ---------------- */
export function ShapeOptions({ shape, onPatch, onDelete, onFront, onBack }: { shape: Shape; onPatch: (p: Partial<Shape>) => void; onDelete: () => void; onFront: () => void; onBack: () => void }) {
  const KIND: Record<ShapeKind, string> = strings.shapes.kinds;
  const Swatches = ({ value, onPick, allowNone }: { value: string; onPick: (v: string) => void; allowNone?: boolean }) => (
    <span className="swatches">
      {SHAPE_COLORS.filter((c) => allowNone || c !== "none").map((c) => (
        <button key={c} className={`swatch ${value === c ? "on" : ""} ${c === "none" ? "none" : ""}`} title={c === "none" ? strings.shapes.none : c} aria-label={c === "none" ? strings.shapes.none : c} style={{ background: c === "none" ? undefined : c }} onClick={() => onPick(c)} />
      ))}
    </span>
  );
  return (
    <section className="board-opts" aria-label={strings.shapes.options}>
      <div className="sec-head">
        <span>{KIND[shape.kind]}</span>
      </div>
      {shape.kind !== "image" && (
        <>
          <div className="field-row">
            <span>{strings.shapes.strokeColor}</span>
            <Swatches value={shape.stroke ?? "#111111"} onPick={(v) => onPatch({ stroke: v })} />
          </div>
          {(shape.kind === "rect" || shape.kind === "oval") && (
            <div className="field-row">
              <span>{strings.shapes.fill}</span>
              <Swatches value={shape.fill ?? "none"} onPick={(v) => onPatch({ fill: v })} allowNone />
            </div>
          )}
          <label className="field-row">
            <span>{strings.shapes.weight}</span>
            <input type="range" min={1} max={24} value={shape.strokeWidth ?? 4} onChange={(e) => onPatch({ strokeWidth: Number(e.target.value) })} aria-label={strings.shapes.strokeWeight} />
          </label>
        </>
      )}
      <div className="muted small">
        {shape.w} × {shape.h} · ({shape.x}, {shape.y})
      </div>
      <div className="btn-row">
        <button className="icon-btn" aria-label={strings.shapes.front} title={strings.shapes.front} onClick={onFront}><Icon name="front" /></button>
        <button className="icon-btn" aria-label={strings.shapes.back} title={strings.shapes.back} onClick={onBack}><Icon name="back" /></button>
        <button className="icon-btn danger" aria-label={strings.shapes.deleteShape} title={strings.shapes.deleteTitle} onClick={onDelete}><Icon name="trash" /></button>
      </div>
    </section>
  );
}

/* ---------------- Right panel: note options ---------------- */
export function NoteOptions({ note, onPatch, onDelete }: { note: Note; onPatch: (p: Partial<Note>) => void; onDelete: () => void }) {
  const title = note.kind === "title";
  const def = title ? 72 : 22;
  return (
    <section className="board-opts" aria-label={strings.notes.options}>
      <div className="sec-head">
        <span>{title ? strings.notes.title : strings.notes.sticky}</span>
      </div>
      <label className="field-row">
        <span>{strings.notes.fontSize}</span>
        <select value={note.size ?? def} onChange={(e) => onPatch({ size: Number(e.target.value) === def ? undefined : Number(e.target.value) })} aria-label={strings.notes.fontSize}>
          {(title ? [32, 48, 56, 72, 96, 128] : [14, 18, 22, 28, 36]).map((n) => (
            <option key={n} value={n}>
              {n}px{n === def ? strings.notes.defaultSuffix : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="btn-row" role="group" aria-label={strings.notes.textStyle}>
        <button className={`icon-btn ${note.bold ?? title ? "on" : ""}`} aria-pressed={!!(note.bold ?? title)} aria-label={strings.notes.bold} title={strings.notes.bold} onClick={() => onPatch({ bold: !(note.bold ?? title) })}>
          <strong>B</strong>
        </button>
        <button className={`icon-btn ${note.italic ? "on" : ""}`} aria-pressed={!!note.italic} aria-label={strings.notes.italic} title={strings.notes.italic} onClick={() => onPatch({ italic: !note.italic || undefined })}>
          <em>I</em>
        </button>
      </div>
      {!title && (
        <div className="field-row">
          <span>{strings.notes.color}</span>
          <span className="swatches">
            {STICKY_COLORS.map((c) => (
              <button key={c.id} className={`swatch ${(note.color ?? "yellow") === c.id ? "on" : ""}`} title={c.label} aria-label={strings.notes.stickyColor(c.label)} style={{ background: c.bg }} onClick={() => onPatch({ color: c.id === "yellow" ? undefined : c.id })} />
            ))}
          </span>
        </div>
      )}
      {title ? (
        <div className="grid2">
          <NumIn label={strings.notes.maxWidth} value={note.maxW ?? 2000} onCommit={(v) => onPatch({ maxW: v })} />
          <NumIn label={strings.notes.maxHeight} value={note.maxH ?? 0} onCommit={(v) => onPatch({ maxH: v || undefined })} />
        </div>
      ) : (
        <div className="grid2">
          <NumIn label={strings.notes.width} value={note.w ?? 400} onCommit={(v) => onPatch({ w: v })} />
          <NumIn label={strings.notes.height} value={note.h ?? 0} onCommit={(v) => onPatch({ h: v || undefined })} />
        </div>
      )}
      <p className="muted small">{title ? strings.notes.titleHint : strings.notes.stickyHint}</p>
      <div className="btn-row">
        <button className="icon-btn danger" aria-label={strings.notes.deleteNote} title={strings.notes.deleteTitle} onClick={onDelete}><Icon name="trash" /></button>
      </div>
    </section>
  );
}

function NumIn({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input
        key={value}
        inputMode="numeric"
        defaultValue={value}
        onBlur={(e) => {
          const n = Math.max(0, Math.round(Number(e.target.value)));
          if (Number.isFinite(n) && n !== value) onCommit(n);
        }}
        onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

/* ---------------- Layout guides ---------------- */
export const newGuide = (type: LayoutGuide["type"]): LayoutGuide =>
  type === "grid" ? { type, count: 0, gutter: 0, margin: 0, align: "stretch", size: 8, color: "#C94F0C" } : { type, count: type === "columns" ? 4 : 6, gutter: 16, margin: 20, align: "stretch", size: 80, color: "#C94F0C" };

/** Track positions on one axis as [start, length][] */
export function tracks(total: number, g: LayoutGuide): [number, number][] {
  const n = Math.max(1, Math.round(g.count));
  if (g.align === "stretch") {
    const inner = total - g.margin * 2;
    const size = (inner - g.gutter * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => [g.margin + i * (size + g.gutter), size]);
  }
  const span = n * g.size + (n - 1) * g.gutter;
  const start = g.align === "start" ? g.margin : g.align === "end" ? total - g.margin - span : (total - span) / 2;
  return Array.from({ length: n }, (_, i) => [start + i * (g.size + g.gutter), g.size]);
}

export function GuidesOverlay({ guides, w, h }: { guides: LayoutGuide[]; w: number; h: number }) {
  return (
    <div className="layout-guides" aria-hidden="true">
      {guides
        .filter((g) => !g.hidden)
        .map((g, i) =>
          g.type === "grid" ? (
            <div key={i} className="lg-grid" style={{ backgroundImage: `linear-gradient(to right, ${g.color}55 1px, transparent 1px), linear-gradient(to bottom, ${g.color}55 1px, transparent 1px)`, backgroundSize: `${g.size}px ${g.size}px` }} />
          ) : (
            tracks(g.type === "columns" ? w : h, g).map(([a, len], j) => (
              <div key={`${i}-${j}`} className="lg-track" style={g.type === "columns" ? { left: a, top: 0, width: len, height: h, background: `${g.color}1f` } : { top: a, left: 0, height: len, width: w, background: `${g.color}1f` }} />
            ))
          ),
        )}
    </div>
  );
}

export function GuidesEditor({ guides, onChange }: { guides: LayoutGuide[]; onChange: (g: LayoutGuide[], label: string) => void }) {
  const set = (i: number, patch: Partial<LayoutGuide>) => onChange(guides.map((g, j) => (j === i ? { ...g, ...patch } : g)), strings.history.editGuide);
  const TYPE = strings.guides.types;
  return (
    <section className="board-opts guides-editor" aria-label={strings.guides.aria}>
      <div className="sec-head">
        <span>{strings.guides.heading(guides.length, MAX_GUIDES)}</span>
        <span className="btn-row">
          {(["columns", "rows", "grid"] as const).map((t) => (
            <button key={t} className="icon-btn sm" disabled={guides.length >= MAX_GUIDES} title={strings.guides.add[t]} aria-label={strings.guides.add[t]} onClick={() => onChange([...guides, newGuide(t)], strings.history.addGuide)}>
              <span className="small">{TYPE[t]}</span>
            </button>
          ))}
        </span>
      </div>
      {guides.length === 0 && <p className="muted small">{strings.guides.empty}</p>}
      {guides.map((g, i) => (
        <div key={i} className="guide-row">
          <div className="guide-head">
            <strong>{TYPE[g.type]}</strong>
            <input type="color" value={g.color} onChange={(e) => set(i, { color: e.target.value })} aria-label={strings.guides.color} />
            <div className="spacer" />
            <button className="icon-btn sm" aria-label={g.hidden ? strings.guides.show : strings.guides.hide} title={g.hidden ? strings.guides.show : strings.guides.hide} onClick={() => set(i, { hidden: !g.hidden || undefined })}>
              <Icon name={g.hidden ? "close" : "check"} size={14} />
            </button>
            <button className="icon-btn sm danger" aria-label={strings.guides.deleteGuide} title={strings.guides.delete} onClick={() => onChange(guides.filter((_, j) => j !== i), strings.history.deleteGuide)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
          {g.type === "grid" ? (
            <div className="grid2">
              <NumIn label={strings.guides.cell} value={g.size} onCommit={(v) => set(i, { size: Math.max(2, v) })} />
            </div>
          ) : (
            <div className="grid2">
              <NumIn label={strings.guides.count} value={g.count} onCommit={(v) => set(i, { count: Math.max(1, Math.min(48, v)) })} />
              <NumIn label={strings.guides.gutter} value={g.gutter} onCommit={(v) => set(i, { gutter: v })} />
              <NumIn label={strings.guides.margin} value={g.margin} onCommit={(v) => set(i, { margin: v })} />
              {g.align !== "stretch" && <NumIn label={strings.guides.cellSize} value={g.size} onCommit={(v) => set(i, { size: Math.max(1, v) })} />}
              <label className="field-row span2">
                <span>{strings.guides.align}</span>
                <select value={g.align} onChange={(e) => set(i, { align: e.target.value as LayoutGuide["align"] })} aria-label={strings.guides.alignAria}>
                  <option value="stretch">{strings.guides.stretch}</option>
                  <option value="start">{g.type === "columns" ? strings.guides.left : strings.guides.top}</option>
                  <option value="center">{strings.guides.center}</option>
                  <option value="end">{g.type === "columns" ? strings.guides.right : strings.guides.bottom}</option>
                </select>
              </label>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
