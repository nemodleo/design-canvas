// AI-generated with Claude Code, 2026-10-09, reviewed by Hyun Park
// Source HTML patching: replaces only the changed range as a string (no re-serialization). PLAN.md ch. 0 and 4.
import { elementChildren, inspect, isElement, nodeAtPath, parseHtml } from "./html.mjs";

export class EditError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const splice = (html, start, end, text) => html.slice(0, start) + text + html.slice(end);

/** Finds the target element and checks its hash. A mismatch means someone else or an AI edited the file in the meantime */
function target(html, path, hash) {
  const info = inspect(html, path);
  if (!info) throw new EditError(409, "That element is gone. Someone changed the file first; select it again");
  if (hash && info.hash !== hash) throw new EditError(409, "Someone changed this file first. Select the element again");
  return info;
}

/* ---------- Declarations inside the style attribute ---------- */

/** "a:1; b: url(x;y)" → [{prop, value, start, end}] (; inside parentheses or quotes is ignored) */
export function parseDecls(style) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  const push = (end) => {
    const seg = style.slice(start, end);
    const colon = seg.indexOf(":");
    if (colon > 0 && seg.trim()) out.push({ prop: seg.slice(0, colon).trim().toLowerCase(), value: seg.slice(colon + 1).trim(), start, end });
  };
  for (let i = 0; i < style.length; i++) {
    const ch = style[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(style.length);
  return out;
}

/** Changes a single declaration. An empty value removes it. The text of other declarations stays untouched */
export function setDecl(style, prop, value) {
  prop = prop.trim().toLowerCase();
  const decls = parseDecls(style);
  const d = decls.find((x) => x.prop === prop);
  const sep = /;\s/.test(style) ? "; " : ";";
  if (d) {
    if (value === "" || value == null) {
      // also remove the trailing ;
      let end = d.end;
      if (style[end] === ";") end++;
      while (style[end] === " ") end++;
      let s = style.slice(0, d.start) + style.slice(end);
      return s.replace(/;\s*$/, "").replace(/^\s+/, "");
    }
    const seg = style.slice(d.start, d.end);
    const colon = seg.indexOf(":");
    const lead = seg.slice(colon + 1).match(/^\s*/)[0];
    const trail = seg.match(/\s*$/)[0];
    const newSeg = seg.slice(0, colon + 1) + lead + value + trail;
    return style.slice(0, d.start) + newSeg + style.slice(d.end);
  }
  if (value === "" || value == null) return style;
  const base = style.replace(/\s*;?\s*$/, "");
  return base ? `${base}${sep}${prop}:${/:\s/.test(style) ? " " : ""}${value}` : `${prop}:${value}`;
}

/* ---------- Attribute ranges ---------- */
function startTagEnd(html, node) {
  const st = node.sourceCodeLocation?.startTag;
  if (!st) throw new EditError(422, "Start tag location is unknown");
  // insert right before '/>' or '>'
  let i = st.endOffset - 1;
  if (html[i - 1] === "/") i--;
  while (html[i - 1] === " " || html[i - 1] === "\n") i--;
  return i;
}

function setAttrRaw(html, node, name, value) {
  const attrLoc = node.sourceCodeLocation?.attrs?.[name.toLowerCase()];
  if (attrLoc) {
    if (value == null) {
      // also remove the leading whitespace
      let s = attrLoc.startOffset;
      while (s > 0 && /\s/.test(html[s - 1])) s--;
      return splice(html, s, attrLoc.endOffset, "");
    }
    return splice(html, attrLoc.startOffset, attrLoc.endOffset, `${name}="${escAttr(value)}"`);
  }
  if (value == null) return html;
  const at = startTagEnd(html, node);
  return splice(html, at, at, ` ${name}="${escAttr(value)}"`);
}

/* ---------- Edit operations ---------- */

export function applyEdit(html, req) {
  const { op, path, hash } = req;
  if (op === "setText") {
    const { node } = target(html, path, hash);
    const kids = node.childNodes ?? [];
    // Multi-line: for elements containing only text and <br>, replace the whole inside with "line<br>line"
    const onlyBr = elementChildren(node).every((k) => k.tagName === "br") && kids.every((k) => k.nodeName === "#text" || k.nodeName === "br" || k.nodeName === "#comment");
    if (onlyBr && (String(req.text).includes("\n") || elementChildren(node).length)) {
      const st = node.sourceCodeLocation?.startTag;
      const et = node.sourceCodeLocation?.endTag;
      if (!st || !et) throw new EditError(422, "Location is unknown");
      const inner = html.slice(st.endOffset, et.startOffset);
      const lead = inner.match(/^\s*/)[0];
      const trail = inner.match(/\s*$/)[0];
      return splice(html, st.endOffset, et.startOffset, lead + String(req.text).split("\n").map(escText).join("<br>") + trail);
    }
    if (elementChildren(node).length) throw new EditError(422, "Only elements with a single text node can be edited directly");
    const texts = kids.filter((k) => k.nodeName === "#text");
    if (texts.length > 1 || kids.some((k) => k.nodeName !== "#text" && k.nodeName !== "#comment")) throw new EditError(422, "Only elements with a single text node can be edited directly");
    const t = texts[0];
    if (t?.sourceCodeLocation) {
      const { startOffset, endOffset } = t.sourceCodeLocation;
      // keep leading/trailing whitespace (indentation)
      const orig = html.slice(startOffset, endOffset);
      const lead = orig.match(/^\s*/)[0];
      const trail = orig.match(/\s*$/)[0];
      return splice(html, startOffset, endOffset, lead + escText(req.text) + trail);
    }
    const st = node.sourceCodeLocation?.startTag;
    if (!st) throw new EditError(422, "Location is unknown");
    return splice(html, st.endOffset, st.endOffset, escText(req.text));
  }
  if (op === "setStyle") {
    const { node } = target(html, path, hash);
    const cur = node.attrs?.find((a) => a.name === "style")?.value ?? "";
    const next = setDecl(cur, String(req.prop), req.value == null ? "" : String(req.value));
    if (next === cur) return html;
    const loc = node.sourceCodeLocation?.attrs?.style;
    if (loc) {
      // keep the original quotes and change only the value
      const raw = html.slice(loc.startOffset, loc.endOffset);
      const m = raw.match(/^(style\s*=\s*)(["']?)([\s\S]*?)\2$/i);
      if (!m) throw new EditError(422, "Could not read the style attribute");
      const q = m[2] || '"';
      if (!next) {
        let s = loc.startOffset;
        while (s > 0 && /\s/.test(html[s - 1])) s--;
        return splice(html, s, loc.endOffset, "");
      }
      const val = q === '"' ? next.replace(/"/g, "&quot;") : next.replace(/'/g, "&#39;");
      return splice(html, loc.startOffset, loc.endOffset, `${m[1]}${q}${val}${q}`);
    }
    return setAttrRaw(html, node, "style", next);
  }
  if (op === "setAttr") {
    const { node } = target(html, path, hash);
    if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(String(req.name ?? ""))) throw new EditError(400, "Invalid attribute name");
    return setAttrRaw(html, node, req.name, req.value == null ? null : String(req.value));
  }
  if (op === "delete") {
    const { range } = target(html, path, hash);
    let { start, end } = range;
    // if the element fills a whole line, remove that line
    const lineStart = html.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = html.indexOf("\n", end);
    if (/^\s*$/.test(html.slice(lineStart, start)) && /^\s*$/.test(html.slice(end, lineEnd === -1 ? html.length : lineEnd))) {
      start = lineStart;
      end = lineEnd === -1 ? html.length : lineEnd + 1;
    }
    return splice(html, start, end, "");
  }
  if (op === "duplicate") {
    const { range, source } = target(html, path, hash);
    const lineStart = html.lastIndexOf("\n", range.start - 1) + 1;
    const indent = html.slice(lineStart, range.start);
    const sep = /^\s*$/.test(indent) ? "\n" + indent : "";
    return splice(html, range.end, range.end, sep + source);
  }
  if (op === "move") {
    // When dragging out of flex/grid: pin parent and sibling sizes first so other elements do not move (same single step)
    let h = html;
    for (const f of req.freeze ?? []) for (const [prop, value] of Object.entries(f.props ?? {})) h = applyEdit(h, { op: "setStyle", path: f.path, prop, value });
    return moveElement(h, req);
  }
  if (op === "insert") return insertElement(html, req);
  if (op === "setTweaks") return setTweaks(html, req.values ?? {});
  if (op === "batch") {
    // Multiple properties on the same element: only the first op checks the hash
    if (!Array.isArray(req.ops) || !req.ops.length) throw new EditError(400, "ops is required");
    return req.ops.reduce((h, o, i) => applyEdit(h, { ...o, hash: i === 0 ? o.hash : undefined }), html);
  }
  if (op === "wrap") return wrapElements(html, req);
  throw new EditError(400, `Unknown op: ${op}`);
}

/** Cuts the element range and pastes it at index in the target parent (within the same file) */
function moveElement(html, { path, hash, toParentPath, index }) {
  const { range, source } = target(html, path, hash);
  if (String(toParentPath) === path || String(toParentPath).startsWith(path + "/")) throw new EditError(422, "An element cannot be moved into itself");
  const doc = parseHtml(html);
  const parent = nodeAtPath(doc, toParentPath ?? "");
  if (!parent || !isElement(parent)) throw new EditError(409, "Move target not found");
  const siblings = elementChildren(parent);
  const self = nodeAtPath(doc, path);
  const others = siblings.filter((s) => s !== self);
  const i = Math.max(0, Math.min(Number(index) || 0, others.length));
  let at;
  let indent = "";
  if (i < others.length) {
    at = others[i].sourceCodeLocation.startOffset;
    const ls = html.lastIndexOf("\n", at - 1) + 1;
    if (/^\s*$/.test(html.slice(ls, at))) {
      indent = html.slice(ls, at);
      at = ls;
    }
  } else if (others.length) {
    at = others[others.length - 1].sourceCodeLocation.endOffset;
  } else {
    at = parent.sourceCodeLocation.startTag.endOffset;
  }
  // also clean up the blank line left where it was cut
  let cutStart = range.start;
  let cutEnd = range.end;
  const ls = html.lastIndexOf("\n", cutStart - 1) + 1;
  const le = html.indexOf("\n", cutEnd);
  const ownLine = /^\s*$/.test(html.slice(ls, cutStart)) && /^\s*$/.test(html.slice(cutEnd, le === -1 ? html.length : le));
  if (ownLine) {
    cutStart = ls;
    cutEnd = le === -1 ? html.length : le + 1;
  }
  const insert = indent && ownLine ? indent + source + "\n" : (i >= others.length && others.length && ownLine ? "\n" + html.slice(ls, range.start) + source : source);
  if (at >= cutEnd) {
    const shifted = at - (cutEnd - cutStart);
    const removed = html.slice(0, cutStart) + html.slice(cutEnd);
    return removed.slice(0, shifted) + insert + removed.slice(shifted);
  }
  if (at <= cutStart) {
    return html.slice(0, at) + insert + html.slice(at, cutStart) + html.slice(cutEnd);
  }
  throw new EditError(422, "Invalid move position");
}

/** Wraps consecutive siblings of the same parent in <div style="display:flex;gap:8px"> */
function wrapElements(html, { paths, hashes, display = "flex", direction }) {
  if (!Array.isArray(paths) || !paths.length) throw new EditError(400, "paths is required");
  const infos = paths.map((p, i) => target(html, p, hashes?.[i]));
  const parentOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const parent = parentOf(paths[0]);
  if (paths.some((p) => parentOf(p) !== parent)) throw new EditError(422, "Only elements under the same parent can be wrapped");
  const idx = paths.map((p) => Number(p.split("/").pop())).sort((a, b) => a - b);
  if (idx.some((v, i) => i && v !== idx[i - 1] + 1)) throw new EditError(422, "Only consecutive siblings can be wrapped");
  const start = Math.min(...infos.map((x) => x.range.start));
  const end = Math.max(...infos.map((x) => x.range.end));
  const style = display === "grid" ? "display:grid;gap:8px" : `display:flex;${direction === "column" ? "flex-direction:column;" : ""}gap:8px`;
  const ls = html.lastIndexOf("\n", start - 1) + 1;
  const indent = /^\s*$/.test(html.slice(ls, start)) ? html.slice(ls, start) : "";
  const inner = html.slice(start, end);
  if (indent && inner.includes("\n")) {
    const reindented = inner.replace(/\n(?=[^\n])/g, "\n  "); // do not indent blank lines (avoids trailing whitespace)
    return splice(html, start, end, `<div style="${style}">\n${indent}  ${reindented}\n${indent}</div>`);
  }
  return splice(html, start, end, `<div style="${style}">${inner}</div>`);
}

/** Pastes element source copied from another (or the same) board after, before, or at the end of (inside) the reference element */
function insertElement(html, { path, hash, position = "after", html: src }) {
  let code = String(src ?? "").trim();
  // strip the copied source's original indentation (based on the shallowest indent from the second line on)
  const rest = code.split("\n").slice(1).filter((l) => l.trim());
  const min = rest.length ? Math.min(...rest.map((l) => l.match(/^[ \t]*/)[0].length)) : 0;
  if (min) code = code.split("\n").map((l, i) => (i ? l.slice(Math.min(min, l.match(/^[ \t]*/)[0].length)) : l)).join("\n");
  if (!code || !/^<[a-zA-Z]/.test(code)) throw new EditError(400, "Nothing to paste");
  if (/<script\b/i.test(code)) throw new EditError(422, "script elements cannot be pasted");
  if (path == null || path === "") {
    const doc = parseHtml(html);
    const body = nodeAtPath(doc, "");
    const kids = elementChildren(body);
    const at = kids.length ? kids[kids.length - 1].sourceCodeLocation.endOffset : body.sourceCodeLocation.startTag.endOffset;
    return splice(html, at, at, "\n" + code);
  }
  const { node, range } = target(html, path, hash);
  const ls = html.lastIndexOf("\n", range.start - 1) + 1;
  const indent = /^\s*$/.test(html.slice(ls, range.start)) ? html.slice(ls, range.start) : "";
  const reindent = (ind) => code.replace(/\n(?=[^\n])/g, "\n" + ind);
  if (position === "before") return splice(html, range.start, range.start, reindent(indent) + (indent ? "\n" + indent : ""));
  if (position === "inside") {
    const kids = elementChildren(node);
    if (kids.length) {
      const last = kids[kids.length - 1];
      const l2 = html.lastIndexOf("\n", last.sourceCodeLocation.startOffset - 1) + 1;
      const ind2 = /^\s*$/.test(html.slice(l2, last.sourceCodeLocation.startOffset)) ? html.slice(l2, last.sourceCodeLocation.startOffset) : "";
      const at = last.sourceCodeLocation.endOffset;
      return splice(html, at, at, (ind2 ? "\n" + ind2 : "") + reindent(ind2));
    }
    const st = node.sourceCodeLocation?.startTag;
    if (!st || !node.sourceCodeLocation.endTag) throw new EditError(422, "Cannot paste inside this element");
    return splice(html, st.endOffset, st.endOffset, code);
  }
  return splice(html, range.end, range.end, (indent ? "\n" + indent : "") + reindent(indent));
}

/** Changes only value in <script type="application/json" id="board-tweaks"> (key order and everything else untouched) */
export function findTweaks(html) {
  const doc = parseHtml(html);
  const stack = [doc];
  while (stack.length) {
    const n = stack.pop();
    if (n.tagName === "script" && n.attrs?.some((a) => a.name === "id" && a.value === "board-tweaks")) return n;
    for (const c of n.childNodes ?? []) stack.push(c);
    if (n.content) stack.push(n.content);
  }
  return null;
}
function setTweaks(html, values) {
  const node = findTweaks(html);
  const text = node?.childNodes?.[0];
  if (!node || !text?.sourceCodeLocation) throw new EditError(404, "board-tweaks not found");
  let data;
  try {
    data = JSON.parse(text.value);
  } catch {
    throw new EditError(422, "Could not parse board-tweaks JSON");
  }
  for (const [k, v] of Object.entries(values)) if (data[k] && typeof data[k] === "object") data[k].value = v;
  const { startOffset, endOffset } = text.sourceCodeLocation;
  const orig = html.slice(startOffset, endOffset);
  const lead = orig.match(/^\s*/)[0];
  const trail = orig.match(/\s*$/)[0];
  const ind = (lead.match(/\n([ \t]*)$/) ?? [, ""])[1];
  const body = JSON.stringify(data, null, 2).replace(/\n/g, "\n" + ind);
  return splice(html, startOffset, endOffset, lead + body + trail);
}
