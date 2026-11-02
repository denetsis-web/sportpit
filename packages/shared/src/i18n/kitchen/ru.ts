// Пространство kitchen: сводка производства, партии, этикетки. Ошибки сервера — `kitchen.error.*`.
// Слова этикетки (`label.*`) печатаются на двух языках сразу, поэтому ключи читаются явным языком.
const ru = {
  'nav.kitchen': 'Кухня',

  // ---- сводка ----
  title: 'Кухня: что готовить',
  lead: 'Заказы на выбранный день по блюдам и по холодильникам. После срока приёма заказов сводка фиксируется и больше не меняется.',
  loadError: 'Не удалось загрузить сводку.',
  'date.label': 'День выдачи',
  'state.open': 'Приём заказов открыт: сводка пересчитывается при каждом заказе или отмене.',
  'state.partial': 'Приём закрыт не во всех холодильниках: партии появятся, когда закроются все.',
  'state.closed': 'Приём заказов закрыт, сводка зафиксирована.',
  'buffer.note':
    'Запас на брак: {percent}% (меняется в настройках). Он добавлен к плану отдельной строкой и в заказы не входит.',
  empty: 'На этот день заказов нет.',

  'dishes.title': 'По блюдам',
  'dishes.dish': 'Блюдо',
  'dishes.planned': 'По заказам',
  'dishes.buffer': 'Запас',
  'dishes.total': 'Готовить',
  'dishes.batch': 'Партия',
  'dishes.fridges': 'По холодильникам',
  'dishes.fridgeQty': '{name}: {count}',
  'dishes.noBatch': 'Партия появится после закрытия приёма заказов.',
  'totals.row': 'Итого: по заказам {planned}, запас {buffer}, готовить {total}.',

  'fridges.title': 'По холодильникам',
  'fridges.row': '{gym} · {name}',
  'fridges.boxes': 'Порций: {count}',
  'fridges.open': 'Приём открыт до {time}',
  'fridges.closed': 'Закрыт в {time}',

  // ---- партии ----
  'batch.code': 'Код партии: {code}',
  'batch.status.planned': 'Запланирована',
  'batch.status.confirmed': 'Производство подтверждено',
  'batch.status.cooked': 'Приготовлена',
  'batch.qty': 'Порций в партии: {count}',
  'batch.confirm': 'Подтвердить производство',
  'batch.confirmLabel': 'Подтвердить производство: {name}',
  'batch.cooked': 'Отметить приготовленной',
  'batch.cookedLabel': 'Отметить приготовленной: {name}',
  'batch.cookedAt': 'Приготовлено: {time}',
  'batch.eatBy': 'Съесть до: {time}',
  'batch.print': 'Печать этикеток',
  'batch.printLabel': 'Печать этикеток: {name}',
  'batch.done': 'Готово.',

  // ---- печать этикеток ----
  'label.title': 'Этикетки партии {code}',
  'label.copies': 'Сколько этикеток',
  'label.copies.hint': 'По умолчанию столько, сколько порций в партии.',
  'label.size': 'Размер этикетки: {width}×{height} мм (меняется в настройках).',
  'label.print': 'Печатать',
  'label.back': 'К сводке',
  'label.loadError': 'Не удалось загрузить данные этикетки.',
  'label.kcal': 'ккал',
  'label.protein': 'Б',
  'label.fat': 'Ж',
  'label.carbs': 'У',
  'label.fiber': 'Клетч.',
  'label.perServing': 'в порции {weight} г',
  'label.composition': 'Состав',
  'label.allergens': 'Аллергены',
  'label.allergensNone': 'нет',
  'label.cooked': 'Приготовлено',
  'label.eatBy': 'Съесть до',
  'label.batch': 'Партия',

  // ---- ошибки сервера ----
  'error.date': 'Дата должна быть в формате ГГГГ-ММ-ДД.',
  'error.range': 'Период указан неверно: начало не позже конца, не больше года.',
  'error.batchNotFound': 'Партия не найдена.',
  'error.notConfirmed': 'Сначала подтвердите производство партии.',
  'error.alreadyCooked': 'Партия уже приготовлена.',
  'error.notCooked': 'Этикетки печатаются после того, как партия отмечена приготовленной.',
};

export default ru;
