import { describe, expect, it } from 'vitest';
import { CSV_BOM, leiCell, toCsv } from '../../src/modules/reports/index.ts';
import { insertDelivered, makeReportsDay, report, reportCsv, addGymWithFridge } from './helpers.ts';

describe('CSV для Excel: формат файла', () => {
  it('UTF-8 с BOM, разделитель «;», строки через CRLF, числа с десятичной запятой', () => {
    const csv = toCsv(
      ['Зал', 'Доля, %', 'Сумма'],
      [
        ['Тест', 12.5, leiCell(129050)],
        ['Север', 10, leiCell(5)],
      ],
    );
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM).toBe('﻿');
    expect(csv.slice(1)).toBe('Зал;Доля, %;Сумма\r\nТест;12,5;1290,50\r\nСевер;10;0,05\r\n');
  });

  it('текст с «;», кавычкой или переводом строки берётся в кавычки, кавычки удваиваются', () => {
    const csv = toCsv(['a'], [['Зал; «Центр»'], ['Он сказал "да"'], ['две\nстроки']]);
    expect(csv.slice(1)).toBe('a\r\n"Зал; «Центр»"\r\n"Он сказал ""да"""\r\n"две\nстроки"\r\n');
  });

  it('текст, который Excel принял бы за формулу, получает апостроф; числа не затрагиваются', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['=SUM(A1:A9)', -5],
        ['+1', leiCell(-1250)],
        ['@cmd', null],
      ],
    );
    expect(csv.slice(1)).toBe("a;b\r\n'=SUM(A1:A9);-5\r\n'+1;-12,50\r\n'@cmd;\r\n");
  });
});

describe('выгрузка отчётов (R37.1)', () => {
  it('продажи: файл-вложение с BOM, заголовок на языке запроса, все строки и итог', async () => {
    const day = await makeReportsDay();
    const res = await reportCsv(day, 'sales');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="sportpit-sales-2026-03-01_2026-03-31.csv"',
    );
    expect(res.body.startsWith('﻿')).toBe(true);
    expect(res.body.slice(1).split('\r\n')).toEqual([
      'Зал;Пакет, боксов;Выдано боксов;Выручка, лей',
      'Зал «Север»;30;2;198,00',
      'Зал «Тест»;12;3;357,00',
      'Зал «Тест»;20;1;109,00',
      'Итого;;6;664,00',
      '',
    ]);
  });

  it('заголовок и подписи на румынском по Accept-Language', async () => {
    const day = await makeReportsDay();
    const res = await reportCsv(day, 'sales', undefined, undefined, 'ro');
    expect(res.body.slice(1).split('\r\n')[0]).toBe(
      'Sala;Pachet, boxuri;Boxuri ridicate;Venit, lei',
    );
    expect(res.body).toContain('Total;;6;664,00');
    // язык можно задать и параметром ?lang= (так просит ссылка на скачивание в админке)
    const byParam = await reportCsv(day, 'sales', 'from=2026-03-01&to=2026-03-31&lang=ro');
    expect(byParam.body.slice(1).split('\r\n')[0]).toBe(
      'Sala;Pachet, boxuri;Boxuri ridicate;Venit, lei',
    );
  });

  it('доля зала: формула есть в выгрузке', async () => {
    const day = await makeReportsDay();
    const lines = (await reportCsv(day, 'share')).body.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Зал;Процент зала, %;Выдано боксов;Выручка, лей;Доля зала, лей;Формула: процент × выручка выданных боксов',
    );
    expect(lines[1]).toBe('Зал «Север»;10;2;198,00;19,80;10% × 198,00 лей = 19,80 лей');
    expect(lines[2]).toBe('Зал «Тест»;12,5;4;466,00;58,25;12,5% × 466,00 лей = 58,25 лей');
    expect(lines[3]).toBe('Итого;;6;664,00;78,05;');
  });

  it('выдано и списано, рейтинг и клиенты выгружаются целиком', async () => {
    const day = await makeReportsDay();
    const waste = (await reportCsv(day, 'waste')).body.slice(1).split('\r\n');
    expect(waste[0]).toBe('Блюдо;Приготовлено;Выдано;Списано;Списания, %');
    expect(waste).toContain('Лосось с овощами;3;3;1;33,3');
    expect(waste).toContain('Итого;7;6;2;28,6');
    const ratings = (await reportCsv(day, 'ratings')).body.slice(1).split('\r\n');
    expect(ratings).toEqual([
      'Блюдо;Оценок за период;Средняя оценка;Средняя за всё время;Оценок за всё время',
      'Итого;0;;;',
      '',
    ]);
    const retention = (await reportCsv(day, 'retention', 'from=2026-03-11&to=2026-03-17')).body
      .slice(1)
      .split('\r\n');
    expect(retention).toContain('Итого;3;0;0');
  });

  it('в файле все строки, а не одна страница таблицы', async () => {
    const day = await makeReportsDay();
    for (let n = 1; n <= 55; n += 1) {
      const gym = await addGymWithFridge(day, `Зал ${String(n).padStart(2, '0')}`);
      insertDelivered(day, {
        userId: day.clients.first,
        date: '2026-03-11',
        fridgeId: gym.fridgeId,
      });
    }
    const page = (await report(day, 'sales')).json();
    expect(page.rows).toHaveLength(50);
    expect(page.page.total).toBe(58);
    const lines = (await reportCsv(day, 'sales')).body.slice(1).split('\r\n');
    // заголовок + 58 строк + итог + пустая строка после последнего CRLF
    expect(lines).toHaveLength(1 + 58 + 1 + 1);
  });

  it('доступ только у администратора', async () => {
    const day = await makeReportsDay();
    expect((await reportCsv(day, 'sales', '', day.client)).statusCode).toBe(403);
    expect((await reportCsv(day, 'sales', '', day.kitchen)).statusCode).toBe(403);
    expect((await reportCsv(day, 'nope')).statusCode).toBe(404);
  });
});
