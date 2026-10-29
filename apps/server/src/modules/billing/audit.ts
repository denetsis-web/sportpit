// Шов журнала действий администратора (R55). `admin.audit` живёт в другом модуле,
// поэтому billing вызывает его через необязательный приёмник: по умолчанию он пустой,
// подключается одной строкой `setAuditSink(deps, (userId, action, target, detail) => ...)`.
import type { AppDeps } from '../../app.ts';

export type AuditSink = (
  userId: number | null,
  action: string,
  target: string,
  detail?: Record<string, unknown>,
) => void;

const noop: AuditSink = () => undefined;
const sinks = new WeakMap<object, AuditSink>();

export function setAuditSink(deps: Pick<AppDeps, 'db'>, sink: AuditSink | null): void {
  if (sink) sinks.set(deps.db, sink);
  else sinks.delete(deps.db);
}

export function auditFor(deps: Pick<AppDeps, 'db'>): AuditSink {
  return sinks.get(deps.db) ?? noop;
}
