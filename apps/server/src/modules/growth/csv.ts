// Выгрузка листа ожидания в CSV для Excel: тот же формат, что у отчётов (`toCsv`: BOM, «;», защита от формул).
// Телефон начинается с «+», поэтому `toCsv` ставит перед ним апостроф — Excel не принимает номер за формулу.
import { t, type Lang } from '@sportpit/shared/i18n';
import type { WaitlistEntryDto } from '@sportpit/shared/schemas/growth';
import { formatDateTime } from '@sportpit/shared/format';
import { toCsv, type CsvFile } from '../reports/index.ts';

export function waitlistCsv(
  entries: readonly WaitlistEntryDto[],
  lang: Lang,
  today: string,
): CsvFile {
  const label = (key: string) => t(lang, `growth.csv.${key}`);
  const rows = entries.map((entry) => [
    formatDateTime(entry.createdAt, lang),
    entry.phone,
    entry.name,
    entry.gym,
    entry.goal ? t(lang, `growth.goal.${entry.goal}`) : null,
    entry.lang,
    entry.source,
    entry.ref,
    entry.campaign,
  ]);
  return {
    filename: `sportpit-waitlist-${today}.csv`,
    body: toCsv(
      [
        label('createdAt'),
        label('phone'),
        label('name'),
        label('gym'),
        label('goal'),
        label('lang'),
        label('source'),
        label('ref'),
        label('campaign'),
      ],
      rows,
    ),
  };
}
