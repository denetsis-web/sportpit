// Планировщик внутри процесса. Выражения cron в формате «минута час день месяц день_недели»
// считаются по времени Кишинёва. Внешних библиотек нет.
import { localParts } from '@sportpit/shared/time';
import type { Clock } from '../clock/index.ts';
import { errorDetail, EVENT_KINDS, type EventLog } from './events.ts';

type JobFn = () => void | Promise<void>;

interface FieldSpec {
  name: string;
  min: number;
  max: number;
}

const FIELDS: FieldSpec[] = [
  { name: 'минута', min: 0, max: 59 },
  { name: 'час', min: 0, max: 23 },
  { name: 'день месяца', min: 1, max: 31 },
  { name: 'месяц', min: 1, max: 12 },
  { name: 'день недели', min: 0, max: 7 },
];

function cronError(expr: string, why: string): Error {
  return new Error(`Неверное выражение cron «${expr}»: ${why}`);
}

function parseField(
  expr: string,
  text: string,
  spec: FieldSpec,
): { values: Set<number>; any: boolean } {
  const values = new Set<number>();
  let any = false;
  for (const part of text.split(',')) {
    const [range = '', stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw cronError(expr, `шаг в поле «${spec.name}»`);
    let from: number;
    let to: number;
    if (range === '*') {
      from = spec.min;
      to = spec.name === 'день недели' ? 6 : spec.max;
      if (stepText === undefined) any = true;
    } else if (/^\d+-\d+$/.test(range)) {
      [from, to] = range.split('-').map(Number) as [number, number];
    } else if (/^\d+$/.test(range)) {
      from = Number(range);
      to = stepText === undefined ? from : spec.max;
    } else {
      throw cronError(expr, `поле «${spec.name}» (${part})`);
    }
    if (from < spec.min || to > spec.max || from > to) {
      throw cronError(expr, `значение вне диапазона в поле «${spec.name}»`);
    }
    for (let v = from; v <= to; v += step)
      values.add(spec.name === 'день недели' && v === 7 ? 0 : v);
  }
  return { values, any };
}

interface ParsedCron {
  minute: Set<number>;
  hour: Set<number>;
  dom: { values: Set<number>; any: boolean };
  month: Set<number>;
  dow: { values: Set<number>; any: boolean };
}

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw cronError(expr, 'нужно пять полей');
  const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(expr, p, FIELDS[i]!));
  return {
    minute: minute!.values,
    hour: hour!.values,
    dom: dom!,
    month: month!.values,
    dow: dow!,
  };
}

function matchesParsed(cron: ParsedCron, at: Date): boolean {
  const p = localParts(at);
  // День недели по календарной дате Кишинёва: 0 — воскресенье.
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  if (!cron.minute.has(p.minute) || !cron.hour.has(p.hour) || !cron.month.has(p.month))
    return false;
  const domOk = cron.dom.values.has(p.day);
  const dowOk = cron.dow.values.has(weekday);
  // Как в классическом cron: если ограничены оба поля — достаточно любого.
  if (!cron.dom.any && !cron.dow.any) return domOk || dowOk;
  return domOk && dowOk;
}

/** Попадает ли момент `at` (с точностью до минуты, по Кишинёву) под выражение cron. */
export function matchesCron(expr: string, at: Date): boolean {
  return matchesParsed(parseCron(expr), at);
}

export interface Scheduler {
  register(name: string, cron: string, fn: JobFn): void;
  list(): Array<{ name: string; cron: string }>;
  /** Запускает задачи, чья минута наступила; за одну минуту каждая — не более одного раза. */
  tick(at?: Date): Promise<void>;
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** Запускает задачу немедленно (команды вроде `npm run backup`, ручные проверки). */
  runNow(name: string): Promise<void>;
}

export interface SchedulerOptions {
  clock: Clock;
  events: EventLog;
  /** Как часто проверять расписание, мс. */
  intervalMs?: number;
}

interface Job {
  name: string;
  cron: string;
  parsed: ParsedCron;
  fn: JobFn;
  lastMinuteKey: string | undefined;
  busy: boolean;
}

export function createScheduler({
  clock,
  events,
  intervalMs = 15_000,
}: SchedulerOptions): Scheduler {
  const jobs = new Map<string, Job>();
  let timer: ReturnType<typeof setInterval> | undefined;

  async function execute(job: Job): Promise<void> {
    if (job.busy) return;
    job.busy = true;
    try {
      await job.fn();
    } catch (error) {
      events.log(EVENT_KINDS.jobFailed, { job: job.name, ...errorDetail(error) });
    } finally {
      job.busy = false;
    }
  }

  const scheduler: Scheduler = {
    register(name, cron, fn) {
      if (jobs.has(name)) throw new Error(`Задача «${name}» уже зарегистрирована.`);
      jobs.set(name, {
        name,
        cron,
        parsed: parseCron(cron),
        fn,
        lastMinuteKey: undefined,
        busy: false,
      });
    },
    list: () => [...jobs.values()].map(({ name, cron }) => ({ name, cron })),
    async tick(at = clock.now()) {
      const key = Math.floor(at.getTime() / 60_000).toString();
      const due = [...jobs.values()].filter(
        (job) => job.lastMinuteKey !== key && matchesParsed(job.parsed, at),
      );
      for (const job of due) job.lastMinuteKey = key;
      await Promise.all(due.map(execute));
    },
    start() {
      if (timer) return;
      timer = setInterval(() => void scheduler.tick(), intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    get running() {
      return timer !== undefined;
    },
    async runNow(name) {
      const job = jobs.get(name);
      if (!job) throw new Error(`Задача «${name}» не найдена.`);
      await execute(job);
    },
  };
  return scheduler;
}
