// npm run backup — резервная копия базы по команде (то же делает задача планировщика в 03:00).
import { createSystemClock } from '../apps/server/src/modules/clock/index.ts';
import { openDb } from '../apps/server/src/modules/db/index.ts';
import { createBackup, loadConfig, loadDotEnv } from '../apps/server/src/modules/system/index.ts';

loadDotEnv();
const config = loadConfig();
const db = openDb(config.databasePath);
try {
  const result = createBackup(db, {
    dir: config.backupDir,
    clock: createSystemClock(),
    keep: config.backup.keep,
  });
  console.log(`Копия создана: ${result.path}`);
  if (result.removed.length > 0) {
    console.log(`Удалено старых копий: ${result.removed.length} (хранится ${config.backup.keep})`);
  }
} finally {
  db.close();
}
