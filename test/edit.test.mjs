// AI-generated with Claude Code, 2026-10-09, reviewed by Hyun Park
// Checks that source patches touch only the changed span (PLAN.md M5/M6 done criteria)
import assert from "node:assert/strict";
import { test } from "node:test";

import { applyEdit, setDecl } from "../server/edit.mjs";
import { inspect } from "../server/html.mjs";
import { ko } from "./fixtures/ko-strings.mjs";

const SRC = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"></head>
<body>
<div class="x-dc">
  <h1 class='t34' style="margin:0;font-size:34px">${ko.titleAmp}</h1>
  <p>${ko.body}</p>
  <a href="scr-16.html" class="btn">${ko.sendInquiry}</a>
  <span></span>
</div>
</body>
</html>
`;
const h = (p) => inspect(SRC, p).hash;
const diffLines = (a, b) => {
  const A = a.split("\n");
  const B = b.split("\n");
  return B.filter((l, i) => l !== A[i]).length + Math.abs(A.length - B.length);
};

test("setText: only the text changes, other lines stay as is", () => {
  const out = applyEdit(SRC, { op: "setText", path: "0/2", hash: h("0/2"), text: ko.sendConfirm });
  assert.ok(out.includes(`<a href="scr-16.html" class="btn">${ko.sendConfirmEscaped}</a>`));
  assert.equal(diffLines(SRC, out), 1);
});

test("setText: puts text into an empty element", () => {
  const out = applyEdit(SRC, { op: "setText", path: "0/3", hash: h("0/3"), text: ko.newText });
  assert.ok(out.includes(`<span>${ko.newText}</span>`));
});

test("setText: rejects elements with child elements", () => {
  assert.throws(() => applyEdit(SRC, { op: "setText", path: "0", text: "x" }), /single text node/);
});

test("rejects a mismatched hash (concurrent edit)", () => {
  assert.throws(() => applyEdit(SRC, { op: "setText", path: "0/1", hash: "deadbeef0000", text: "x" }), /changed this file first/);
});

test("setStyle: replaces one declaration, keeps quotes and other declarations", () => {
  const out = applyEdit(SRC, { op: "setStyle", path: "0/0", hash: h("0/0"), prop: "font-size", value: "22px" });
  assert.match(out, /<h1 class='t34' style="margin:0;font-size:22px">/);
  assert.equal(diffLines(SRC, out), 1);
});

test("setStyle: adds and removes declarations, creates style when missing", () => {
  let out = applyEdit(SRC, { op: "setStyle", path: "0/0", hash: h("0/0"), prop: "color", value: "#C94F0C" });
  assert.match(out, /style="margin:0;font-size:34px;color:#C94F0C"/);
  out = applyEdit(SRC, { op: "setStyle", path: "0/0", hash: h("0/0"), prop: "margin", value: "" });
  assert.match(out, /style="font-size:34px"/);
  out = applyEdit(SRC, { op: "setStyle", path: "0/1", hash: h("0/1"), prop: "gap", value: "8px" });
  assert.ok(out.includes(`<p style="gap:8px">${ko.body}</p>`));
});

test("setDecl: does not split on ; inside url()", () => {
  assert.equal(setDecl("background:url(a;b.png);color:red", "color", "blue"), "background:url(a;b.png);color:blue");
  assert.equal(setDecl("margin: 0; padding: 4px", "padding", "8px"), "margin: 0; padding: 8px");
});

test("setAttr: change, add, remove", () => {
  let out = applyEdit(SRC, { op: "setAttr", path: "0/2", hash: h("0/2"), name: "href", value: "scr-17.html" });
  assert.match(out, /<a href="scr-17.html" class="btn">/);
  out = applyEdit(SRC, { op: "setAttr", path: "0/2", hash: h("0/2"), name: "aria-label", value: ko.inquiry });
  assert.ok(out.includes(`class="btn" aria-label="${ko.inquiry}">`));
  out = applyEdit(SRC, { op: "setAttr", path: "0/2", hash: h("0/2"), name: "class", value: null });
  assert.ok(out.includes(`<a href="scr-16.html">${ko.sendInquiry}`));
});

test("delete/duplicate: work line by line and keep formatting", () => {
  let out = applyEdit(SRC, { op: "delete", path: "0/1", hash: h("0/1") });
  assert.ok(!out.includes(`<p>${ko.body}</p>`));
  assert.ok(out.includes("  <a href"));
  out = applyEdit(SRC, { op: "duplicate", path: "0/1", hash: h("0/1") });
  assert.ok(out.includes(`  <p>${ko.body}</p>\n  <p>${ko.body}</p>\n`));
});

test("move: reorder within the same parent", () => {
  const out = applyEdit(SRC, { op: "move", path: "0/2", hash: h("0/2"), toParentPath: "0", index: 0 });
  const i = out.indexOf("<a href");
  const j = out.indexOf("<h1");
  assert.ok(i < j);
  assert.ok(out.includes(`\n  <a href="scr-16.html" class="btn">${ko.sendInquiry}</a>\n  <h1`));
  assert.equal(out.split("\n").length, SRC.split("\n").length);
});

test("wrap: wraps consecutive siblings in a flex div", () => {
  const out = applyEdit(SRC, { op: "wrap", paths: ["0/1", "0/2"], display: "flex" });
  assert.match(out, new RegExp(`<div style="display:flex;gap:8px"><p>${ko.body}</p>\\n  <a|<div style="display:flex;gap:8px">\\n`));
  assert.ok(inspect(out, "0/1").tag === "div");
  assert.ok(inspect(out, "0/1/0").tag === "p");
  assert.ok(inspect(out, "0/1/1").tag === "a");
  assert.throws(() => applyEdit(SRC, { op: "wrap", paths: ["0/0", "0/2"] }), /consecutive/);
});

test("wrap: indents multi-line elements one level and leaves blank lines without spaces", () => {
  const src = `<body>\n<div>\n  <section>\n    <p>a</p>\n  </section>\n\n  <p>b</p>\n</div>\n</body>`;
  const ha = inspect(src, "0/0").hash;
  const hb = inspect(src, "0/1").hash;
  const out = applyEdit(src, { op: "wrap", paths: ["0/0", "0/1"], hashes: [ha, hb], display: "grid" });
  assert.ok(!/ +\n/.test(out), "no trailing spaces");
  assert.match(out, /\n  <div style="display:grid;gap:8px">\n    <section>\n      <p>a<\/p>\n    <\/section>\n\n    <p>b<\/p>\n  <\/div>\n/);
});
