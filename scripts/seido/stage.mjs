import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const [official, destination] = process.argv.slice(2);
if (!official || !destination)
  throw Error("Usage: stage.mjs VERIFIED_OFFICIAL_RUNTIME NEW_RELEASE_DIRECTORY");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dest = path.resolve(destination);
if (fs.existsSync(dest))
  throw Error("Release directory already exists; stage a new immutable directory.");
for (const p of ["node_modules", "resource-monitor"])
  if (!fs.existsSync(path.join(official, p))) throw Error(`Official runtime missing ${p}`);
if (!fs.existsSync(path.join(root, "apps/server/dist/client/index.html")))
  throw Error("Build and copy the web client first.");
fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
fs.cpSync(path.join(root, "apps/server/dist"), dest, { recursive: true });
for (const p of ["node_modules", "resource-monitor"])
  fs.cpSync(path.join(official, p), path.join(dest, p), { recursive: true });
fs.writeFileSync(
  path.join(dest, "t3"),
  '#!/bin/sh\nexec /usr/bin/node "$(dirname "$(readlink -f "$0")")/bin.mjs" "$@"\n',
  { mode: 0o755 },
);
fs.writeFileSync(
  path.join(dest, "t3-decision"),
  '#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/t3" decision "$@"\n',
  { mode: 0o755 },
);
console.log(JSON.stringify({ staged: dest, activated: false }));
