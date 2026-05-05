import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const bin = join(process.cwd(), "dist", "cli.js");

if (!existsSync(bin)) {
  throw new Error("dist/cli.js was not created");
}

const text = readFileSync(bin, "utf8");
if (!text.startsWith("#!/usr/bin/env bun")) {
  writeFileSync(bin, `#!/usr/bin/env bun\n${text}`);
}

chmodSync(bin, 0o755);
