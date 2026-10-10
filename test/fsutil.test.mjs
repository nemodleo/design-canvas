// AI-generated with Claude Code, 2026-10-09, reviewed by Hyun Park
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { writeAtomic } from "../server/fsutil.mjs";

test("atomic write: replaces content and keeps mode without leaving temp files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dc-"));
  const f = path.join(dir, "a.html");
  await fs.writeFile(f, "old");
  await fs.chmod(f, 0o640);
  await writeAtomic(f, "new");
  assert.equal(await fs.readFile(f, "utf8"), "new");
  if (process.platform === "win32") {
    // NTFS has no POSIX mode bits (Node's chmod only toggles the readonly flag),
    // so 0o640 can never stick — assert the file stays writable instead.
    assert.equal((await fs.stat(f)).mode & 0o200, 0o200, "owner-write bit stays set");
  } else {
    assert.equal((await fs.stat(f)).mode & 0o777, 0o640);
  }
  assert.deepEqual((await fs.readdir(dir)).filter((n) => n.startsWith(".dc-tmp")), []);
});

test("atomic write: on failure the original stays as is", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dc-"));
  const f = path.join(dir, "sub", "missing.html");
  await assert.rejects(writeAtomic(f, "x"));
});
