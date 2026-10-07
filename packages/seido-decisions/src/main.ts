#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalConsole:off cryptoRandomUUID:off
import { runCli } from "./cli.ts";
try {
  console.log(JSON.stringify(runCli(process.argv.slice(2)), null, 2));
} catch (error) {
  console.error(
    JSON.stringify({ error: error instanceof Error ? error.message : "Decision command failed" }),
  );
  process.exitCode = 1;
}
