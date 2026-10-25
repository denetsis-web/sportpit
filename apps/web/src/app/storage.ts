// localStorage без исключений: в приватном режиме и при заблокированных данных сайта он может быть недоступен.
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // хранилище недоступно: настройка живёт до перезагрузки страницы
  }
}
