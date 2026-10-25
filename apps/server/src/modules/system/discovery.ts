// Автообнаружение модулей: каждая папка src/modules/<name> может содержать
//   routes.ts — экспорт `registerRoutes(app, deps)`; маршруты монтируются под /api/v1;
//   jobs.ts   — экспорт `registerJobs(scheduler, deps)`; фоновые задачи через scheduler.register.
// Общие реестры не правятся: достаточно положить файл в свою папку.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MODULES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface DiscoveredModule {
  name: string;
  dir: string;
  routesFile: string | undefined;
  jobsFile: string | undefined;
}

function findFile(dir: string, base: string): string | undefined {
  for (const ext of ['ts', 'js']) {
    const file = join(dir, `${base}.${ext}`);
    if (existsSync(file)) return file;
  }
  return undefined;
}

/** Модули из нескольких папок, по алфавиту; одно имя в двух папках — ошибка. */
export function discoverModules(dirs: string[]): DiscoveredModule[] {
  const found = new Map<string, DiscoveredModule>();
  for (const root of dirs) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(root, entry.name);
      const routesFile = findFile(dir, 'routes');
      const jobsFile = findFile(dir, 'jobs');
      if (!routesFile && !jobsFile) continue;
      if (found.has(entry.name)) throw new Error(`Модуль «${entry.name}» найден в двух папках.`);
      found.set(entry.name, { name: entry.name, dir, routesFile, jobsFile });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadExport<T>(file: string, exportName: string): Promise<T> {
  const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<
    string,
    unknown
  >;
  const fn = mod[exportName];
  if (typeof fn !== 'function') {
    throw new Error(`${file}: нет экспорта-функции «${exportName}».`);
  }
  return fn as T;
}
