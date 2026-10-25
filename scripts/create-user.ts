// npm run create-user -- --phone +373XXXXXXXX --role admin
// Создаёт пользователя с ролью (или меняет роль существующему). Первый администратор появляется так.
import { createSystemClock } from '../apps/server/src/modules/clock/index.ts';
import { runCreateUser } from '../apps/server/src/modules/auth/cli.ts';
import { openDb } from '../apps/server/src/modules/db/index.ts';
import { loadConfig, loadDotEnv } from '../apps/server/src/modules/system/index.ts';

loadDotEnv();
const config = loadConfig();
const db = openDb(config.databasePath);
let code = 1;
try {
  code = runCreateUser(process.argv.slice(2), {
    db,
    clock: createSystemClock(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
} finally {
  db.close();
}
process.exit(code);
