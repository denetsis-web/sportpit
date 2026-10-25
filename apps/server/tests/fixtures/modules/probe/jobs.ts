import type { AppDeps } from '../../../../src/app.ts';
import type { Scheduler } from '../../../../src/modules/system/index.ts';

export const probeRuns: string[] = [];

export function registerJobs(scheduler: Scheduler, deps: AppDeps): void {
  scheduler.register('probe-job', '* * * * *', () => {
    probeRuns.push(deps.clock.now().toISOString());
  });
}
