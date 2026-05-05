import { homedir } from "node:os";
import { join, normalize } from "node:path";

export function homePath(...parts: string[]): string {
  return normalize(join(homedir(), ...parts));
}

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME || homePath(".config");
  return join(base, "oh-my-usage");
}

export function stateDir(): string {
  const base = process.env.XDG_STATE_HOME || homePath(".local", "state");
  return join(base, "oh-my-usage");
}

export function resolveUserPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return normalize(join(homedir(), path.slice(2)));
  }
  return normalize(path);
}
