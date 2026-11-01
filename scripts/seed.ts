// npm run seed — стартовые данные: демо-зал, два холодильника, 10 блюд «ДЕМО», меню на ближайшие 3 дня.
// Безопасно запускать повторно: уже созданное не дублируется, чужие правки меню не затираются.
// Логика и тесты — apps/server/src/modules/reports/seed.ts. Секреты не читаются и не печатаются.
import { buildApp } from '../apps/server/src/app.ts';
import { runSeed } from '../apps/server/src/modules/reports/seed.ts';
import { loadConfig, loadDotEnv } from '../apps/server/src/modules/system/index.ts';

loadDotEnv();
const config = loadConfig();
const app = await buildApp({ config, databasePath: config.databasePath, logger: false });
let code = 0;
try {
  runSeed(app.deps, (line) => console.log(line));
} catch (error) {
  console.error(
    'seed: не удалось создать стартовые данные:',
    error instanceof Error ? error.message : error,
  );
  code = 1;
} finally {
  await app.close();
}
process.exit(code);
