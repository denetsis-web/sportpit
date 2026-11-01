// Пространство reports: отчёты администратора, выгрузка в Excel и страница «События системы».
// Ошибки сервера — `reports.error.*`, заголовки столбцов выгрузки — `reports.csv.*`.
const ru = {
  // ---- ошибки сервера ----
  'error.date': 'Дата должна быть в формате ГГГГ-ММ-ДД.',
  'error.page': 'Номер страницы — целое число от 1.',
  'error.range': 'Период указан неверно: начало не позже конца, не больше года.',
  'error.kind': 'Такого отчёта нет.',

  // ---- меню админки ----
  'nav.reports': 'Отчёты',
  'nav.events': 'События системы',

  // ---- отчёты: общее ----
  title: 'Отчёты',
  lead: 'Продажи, выдача и списания, рейтинг блюд, доля зала, активные клиенты и отток за выбранный период. Учитываются боксы, выданные клиентам.',
  'period.from': 'С',
  'period.to': 'По',
  'period.apply': 'Показать',
  'period.shown': 'Период: {from} — {to}',
  'tabs.label': 'Вид отчёта',
  'tab.sales': 'Продажи',
  'tab.waste': 'Выдано и списано',
  'tab.ratings': 'Рейтинг блюд',
  'tab.share': 'Доля зала',
  'tab.retention': 'Клиенты и отток',
  download: 'Скачать для Excel (CSV)',
  loadError: 'Не удалось загрузить отчёт.',
  empty: 'За этот период данных нет.',
  'table.total': 'Итого',
  'page.label': 'Страницы таблицы',
  'page.prev': 'Назад',
  'page.next': 'Вперёд',
  'page.of': 'Страница {page} из {pages}',
  'chart.noData': 'Нет данных для графика.',

  // ---- продажи ----
  'sales.lead':
    'Выручка считается по выданным боксам: цена кредита лота на момент выдачи. Невыданные, списанные и отменённые боксы в неё не входят.',
  'sales.totals': 'Выдано боксов: {boxes}, заказов: {orders}. Выручка: {revenue}.',
  'sales.col.gym': 'Зал',
  'sales.col.package': 'Пакет',
  'sales.col.boxes': 'Боксов',
  'sales.col.revenue': 'Выручка',
  'sales.package': '{count} боксов',
  'sales.noPackage': 'Без пакета',
  'sales.chart': 'Выручка по дням',
  'sales.purchases.title': 'Проданные пакеты за период',
  'sales.purchases.row': 'Пакет на {boxes}: оплачено {count}, на сумму {total}',
  'sales.purchases.empty': 'Пакеты за период не продавались.',

  // ---- выдано и списано ----
  'waste.lead':
    'Процент списаний = списано ÷ приготовлено × 100. В списанное входят невыданные боксы и лишние боксы без заказа.',
  'waste.totals':
    'Приготовлено: {cooked}, выдано: {delivered}, списано: {writtenOff}, списания: {percent}.',
  'waste.col.dish': 'Блюдо',
  'waste.col.cooked': 'Приготовлено',
  'waste.col.delivered': 'Выдано',
  'waste.col.writtenOff': 'Списано',
  'waste.col.percent': 'Списания',
  'waste.noDish': 'Лишний бокс без заказа',
  'waste.chart': 'Выдано и списано по дням',
  'waste.legend.delivered': 'Выдано',
  'waste.legend.writtenOff': 'Списано',
  'waste.byFridge.title': 'По холодильникам',
  'waste.byFridge.row':
    '{gym}, {fridge}: приготовлено {cooked}, выдано {delivered}, списано {writtenOff} ({percent})',
  'waste.byFridge.reserve': 'Запас на брак: приготовлено {cooked}',
  'waste.byReason.title': 'Причины списания',
  'waste.byReason.row': '{reason}: {qty}',
  'waste.percent.none': 'нет данных',

  // ---- рейтинг блюд ----
  'ratings.lead':
    'Оценки, поставленные за период. Рядом — рейтинг блюда за всё время, который клиенты видят в меню.',
  'ratings.totals': 'Оценок за период: {count}, средняя: {avg}.',
  'ratings.col.dish': 'Блюдо',
  'ratings.col.count': 'Оценок',
  'ratings.col.avg': 'Средняя',
  'ratings.col.allTime': 'За всё время',
  'ratings.allTime': '{avg} ({count})',
  'ratings.chart': 'Средняя оценка блюд',

  // ---- доля зала ----
  'share.lead':
    'Доля зала = процент зала × выручка выданных боксов за период. Выручка бокса — цена кредита лота на момент выдачи; невыданные и списанные боксы не входят.',
  'share.totals': 'Выручка выданных боксов: {revenue}. Доли залов: {share}.',
  'share.col.gym': 'Зал',
  'share.col.percent': 'Процент зала',
  'share.col.boxes': 'Боксов',
  'share.col.revenue': 'Выручка',
  'share.col.share': 'Доля зала',
  'share.col.formula': 'Формула',
  'share.formula': '{percent}% × {revenue} = {share}',
  'share.chart': 'Доля зала, лей',

  // ---- клиенты и отток ----
  'retention.lead':
    'Активный клиент — тот, у кого за период выдан хотя бы один заказ. Отток — клиенты, бравшие боксы в предыдущем периоде той же длины и не бравшие в этом.',
  'retention.previous': 'Предыдущий период: {from} — {to}',
  'retention.card.active': 'Активные клиенты',
  'retention.card.previousActive': 'Активные в прошлом периоде',
  'retention.card.retained': 'Остались',
  'retention.card.fresh': 'Новые в периоде',
  'retention.card.churned': 'Отток',
  'retention.card.churnPercent': 'Доля оттока',
  'retention.col.gym': 'Зал',
  'retention.col.active': 'Активные',
  'retention.col.previous': 'В прошлом периоде',
  'retention.col.churned': 'Отток',
  'retention.chart': 'Клиенты по периодам',

  // ---- события системы ----
  'events.title': 'События системы',
  'events.lead':
    'Сбои оплаты и SMS, ошибки сервера и служебные записи. Счётчики показывают последние 24 часа.',
  'events.loadError': 'Не удалось загрузить события.',
  'events.counts.title': 'За последние 24 часа',
  'events.counts.row': '{kind}: {count}',
  'events.counts.none': 'За последние 24 часа событий не было.',
  'events.alert':
    'Если за час случится {count} и более сбоев оплаты или SMS, администраторам придёт уведомление в колокольчик.',
  'events.missed': 'Пропущено замеров температуры за последние дни: {count}.',
  'events.missed.link': 'Открыть раздел «Температура»',
  'events.filter': 'Вид события',
  'events.filter.all': 'Все',
  'events.col.time': 'Время',
  'events.col.kind': 'Вид',
  'events.col.detail': 'Подробности',
  'events.empty': 'Событий нет.',
  'events.kind.sms_failed': 'Сбой SMS',
  'events.kind.payment_failed': 'Сбой оплаты',
  'events.kind.server_error': 'Ошибка сервера',
  'events.kind.job_failed': 'Сбой фоновой задачи',
  'events.kind.backup_done': 'Резервная копия',
  'events.kind.temperature_out_of_range': 'Температура вне нормы',

  // ---- заголовки столбцов выгрузки в Excel ----
  'csv.total': 'Итого',
  'csv.gym': 'Зал',
  'csv.package': 'Пакет, боксов',
  'csv.noPackage': 'Без пакета',
  'csv.boxes': 'Выдано боксов',
  'csv.revenue': 'Выручка, лей',
  'csv.dish': 'Блюдо',
  'csv.noDish': 'Лишний бокс без заказа',
  'csv.cooked': 'Приготовлено',
  'csv.delivered': 'Выдано',
  'csv.writtenOff': 'Списано',
  'csv.wastePercent': 'Списания, %',
  'csv.ratings': 'Оценок за период',
  'csv.avg': 'Средняя оценка',
  'csv.allTimeAvg': 'Средняя за всё время',
  'csv.allTimeCount': 'Оценок за всё время',
  'csv.sharePercent': 'Процент зала, %',
  'csv.share': 'Доля зала, лей',
  'csv.formula': 'Формула: процент × выручка выданных боксов',
  'csv.formulaValue': '{percent}% × {revenue} лей = {share} лей',
  'csv.active': 'Активные клиенты',
  'csv.previousActive': 'Активные в прошлом периоде',
  'csv.churned': 'Отток',
};

export default ru;
