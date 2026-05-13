const runtimeEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export function getEnv(name: string): string {
  return runtimeEnv[`VITE_${name}`] ?? runtimeEnv[name] ?? processEnv[name] ?? '';
}
