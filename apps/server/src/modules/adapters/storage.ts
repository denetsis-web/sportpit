// Хранилище файлов (фото жалоб, фото блюд): интерфейс, папка на диске и память для тестов.
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export const FILES_URL_PREFIX = '/api/v1/files/';

export interface StoredFile {
  key: string;
  size: number;
  contentType: string;
  /** Путь для клиента: GET отдаёт файл (маршрут в модуле adapters). */
  url: string;
}

export interface FileStorage {
  readonly provider: string;
  /** Ключ вида `complaints/<uuid>.jpg`: латиница, цифры, `.`, `_`, `-`, разделитель `/`. */
  put(key: string, data: Uint8Array): Promise<StoredFile>;
  get(key: string): Promise<{ data: Uint8Array; contentType: string } | undefined>;
  delete(key: string): Promise<boolean>;
  urlFor(key: string): string;
}

const SEGMENT = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

export function assertValidKey(key: string): void {
  const segments = key.split('/');
  const ok =
    key.length > 0 &&
    key.length <= 200 &&
    segments.every((s) => SEGMENT.test(s) && !s.includes('..'));
  if (!ok) throw new RangeError(`Недопустимый ключ файла: ${JSON.stringify(key)}`);
}

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

export function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

export class LocalFileStorage implements FileStorage {
  readonly provider = 'local';
  private readonly root: string;

  constructor(options: { rootDir: string }) {
    this.root = resolve(options.rootDir);
  }

  urlFor(key: string): string {
    assertValidKey(key);
    return `${FILES_URL_PREFIX}${key}`;
  }

  private pathFor(key: string): string {
    assertValidKey(key);
    const path = resolve(join(this.root, ...key.split('/')));
    if (!path.startsWith(this.root + sep)) throw new RangeError('Ключ выходит за папку хранилища');
    return path;
  }

  async put(key: string, data: Uint8Array): Promise<StoredFile> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { key, size: data.byteLength, contentType: contentTypeFor(key), url: this.urlFor(key) };
  }

  async get(key: string) {
    const path = this.pathFor(key);
    try {
      if (!(await stat(path)).isFile()) return undefined;
      return { data: new Uint8Array(await readFile(path)), contentType: contentTypeFor(key) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    const path = this.pathFor(key);
    try {
      await stat(path);
    } catch {
      return false;
    }
    await rm(path, { force: true });
    return true;
  }
}

export class MemoryFileStorage implements FileStorage {
  readonly provider = 'memory';
  private readonly files = new Map<string, Uint8Array>();

  urlFor(key: string): string {
    assertValidKey(key);
    return `${FILES_URL_PREFIX}${key}`;
  }

  async put(key: string, data: Uint8Array): Promise<StoredFile> {
    assertValidKey(key);
    this.files.set(key, new Uint8Array(data));
    return { key, size: data.byteLength, contentType: contentTypeFor(key), url: this.urlFor(key) };
  }

  async get(key: string) {
    assertValidKey(key);
    const data = this.files.get(key);
    return data ? { data: new Uint8Array(data), contentType: contentTypeFor(key) } : undefined;
  }

  async delete(key: string): Promise<boolean> {
    assertValidKey(key);
    return this.files.delete(key);
  }
}
