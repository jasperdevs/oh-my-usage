import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export function readJsonFile<T>(path: string): T | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function* walkFiles(root: string, extensions: string[], maxFiles = 10000): Generator<string> {
  if (!existsSync(root)) return;

  const wanted = new Set(extensions.map((item) => item.toLowerCase()));
  const stack = [root];
  let seen = 0;

  while (stack.length > 0 && seen < maxFiles) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile() && wanted.has(extname(entry.name).toLowerCase())) {
        seen += 1;
        yield path;
        if (seen >= maxFiles) return;
      }
    }
  }
}

export function fileMtimeIso(path: string): string | undefined {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return undefined;
  }
}
