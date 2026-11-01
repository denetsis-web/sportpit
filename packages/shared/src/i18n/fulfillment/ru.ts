// Пространство fulfillment: загрузка холодильника, получение бокса, закрытие дня, списания, температура.
// Ошибки сервера — `fulfillment.error.*`.
const ru = {
  // ---- ошибки сервера ----
  'error.date': 'Дата должна быть в формате ГГГГ-ММ-ДД.',
  'error.fridge': 'Холодильник указан неверно.',
  'error.fridgeNotFound': 'Холодильник не найден.',
  'error.orderNotFound': 'Заказ не найден.',
  'error.slot': 'Замер — утренний или вечерний.',
  'error.celsius': 'Введите температуру числом от -40 до +60 °C.',
  'error.codeFormat': 'Код — четыре цифры.',
  'error.invalidCode': 'Неверный код. Проверьте четыре цифры и дату выдачи.',
  'error.reason': 'Выберите причину из списка.',
  'error.qty': 'Количество — целое число от 1 до 999.',
  'error.dish': 'Блюдо указано неверно.',
  'error.remaining': 'Остаток — целое число боксов от 0.',
  'error.range': 'Период указан неверно: начало не позже конца, не больше года.',
  'error.loadDate': 'Холодильник можно загрузить только на сегодня и на завтра.',
  'error.cutoffNotPassed':
    'Приём заказов на эту дату ещё открыт до {time}: загружать рано, заказы могут добавиться.',
  'error.batchesNotCooked':
    'Не все блюда приготовлены: {dishes}. Дождитесь, пока кухня отметит партии приготовленными.',
  'error.dayClosed': 'День по этому холодильнику уже закрыт.',
  'error.notToday': 'Выдача возможна только в день заказа.',
  'error.notLoaded':
    'Бокс ещё не загружен в холодильник. Выдача откроется после отметки оператора.',
  'error.window': 'Забрать бокс можно с {from} до {to}. Сейчас окно выдачи закрыто.',
  'error.alreadyPickedUp': 'Этот заказ уже выдан.',
  'error.writtenOff':
    'Заказ списан, получить его нельзя. Если проблема на стороне сервиса, напишите в поддержку.',
  'error.cancelled': 'Заказ отменён.',
  'error.unknownOrder': 'Этого заказа нет среди невыданных заказов холодильника.',
  'error.extrasMismatch':
    'Лишних боксов без заказа должно быть ровно {surplus}: сумма списаний не совпадает.',
  'error.closeDate': 'День ещё не наступил: закрыть можно сегодняшний и прошедшие дни.',
  'error.windowOpen':
    'Окно выдачи идёт до {time}: клиенты ещё могут забрать боксы. Закройте день позже.',

  // ---- причины списания ----
  'reason.not_picked_up': 'Не забрали',
  'reason.defect': 'Брак',
  'reason.expired': 'Просрочка',
  'reason.other': 'Другое',

  // ---- слоты температуры ----
  'slot.morning': 'Утро',
  'slot.evening': 'Вечер',

  // ---- клиент: получение бокса ----
  'nav.pickup': 'Получить',
  'pickup.title': 'Получение бокса',
  'pickup.lead':
    'Покажите код оператору или назовите его. Кнопка «Забрал» откроется, когда бокс загружен и идёт окно выдачи.',
  'pickup.loadError': 'Не удалось загрузить заказы.',
  'pickup.empty': 'На сегодня заказов нет.',
  'pickup.empty.action': 'Мои заказы',
  'pickup.card.title': 'Заказ на {date}',
  'pickup.card.where': '{gym}, {fridge}',
  'pickup.card.window': 'Окно выдачи: {from}–{to}',
  'pickup.card.code': 'Код получения',
  'pickup.card.qr': 'QR-код заказа с кодом получения {code}',
  'pickup.card.lock': 'Код замка холодильника',
  'pickup.card.lockHint': 'Введите его на замке холодильника.',
  'pickup.card.items': 'Состав заказа',
  'pickup.card.line': '{qty} × {name}',
  'pickup.button': 'Забрал',
  'pickup.buttonLabel': 'Забрал заказ на {date}',
  'pickup.done': 'Заказ выдан. Приятного аппетита!',
  'pickup.status.confirmed': 'Подтверждён',
  'pickup.status.loaded': 'Загружен в холодильник',
  'pickup.status.picked_up': 'Выдан',
  'pickup.status.written_off': 'Списан',
  'pickup.status.cancelled': 'Отменён',
  'pickup.blocked.not_today': 'Получить бокс можно в день заказа.',
  'pickup.blocked.not_loaded':
    'Бокс ещё не загружен в холодильник. Кнопка появится после загрузки.',
  'pickup.blocked.before_window': 'Окно выдачи ещё не открылось: с {from}.',
  'pickup.blocked.after_window': 'Окно выдачи закрыто: оно было до {to}.',
  'pickup.blocked.picked_up': 'Заказ выдан.',
  'pickup.blocked.written_off':
    'Заказ списан. Если проблема на стороне сервиса, напишите в поддержку.',
  'pickup.blocked.cancelled': 'Заказ отменён.',

  // ---- оператор ----
  'operator.nav.operator': 'Выдача',
  'operator.nav.temperature': 'Температура',
  'operator.title': 'Выдача: холодильники',
  'operator.lead': 'Что положить в холодильник, кому выдать бокс, остаток вечером и температура.',
  'operator.loadError': 'Не удалось загрузить данные.',
  'operator.noFridges':
    'За вами не закреплено ни одного холодильника. Обратитесь к администратору.',
  'operator.fridge.label': 'Холодильник',
  'operator.fridge.option': '{gym} · {name}',
  'operator.date.label': 'День выдачи',
  'operator.window': 'Окно выдачи: {from}–{to}',

  'operator.load.title': 'Что положить',
  'operator.load.empty': 'На эту дату заказов нет.',
  'operator.load.line': '{qty} × {name}',
  'operator.load.batch': 'Партия {code}: {status}',
  'operator.load.noBatch': 'Партии ещё нет: кухня не закрыла приём заказов.',
  'operator.load.cooked': 'приготовлена',
  'operator.load.notCooked': 'ещё не приготовлена',
  'operator.load.totals':
    'Боксов: {boxes}, ждут выдачи: {waiting}, выдано: {pickedUp}, списано: {writtenOff}.',
  'operator.load.cutoffOpen': 'Приём заказов на эту дату ещё открыт: загружать рано.',
  'operator.load.blocked': 'Пока не приготовлено: {dishes}.',
  'operator.load.button': 'Отметить «загружено»',
  'operator.load.done': 'Загружено в {time}. Клиенты могут забирать боксы в окно выдачи.',
  'operator.load.success': 'Холодильник отмечен загруженным.',

  'operator.pickup.title': 'Выдача по коду клиента',
  'operator.pickup.code': 'Код клиента (4 цифры)',
  'operator.pickup.submit': 'Выдать',
  'operator.pickup.ok': 'Выдано боксов: {boxes}. Заказ отмечен выданным.',
  'operator.pickup.again': 'Этот заказ уже был выдан раньше, статус не изменён.',
  'operator.pickup.items': 'Состав: {items}',

  'operator.orders.title': 'Заказы дня',
  'operator.orders.row': 'Боксов: {boxes} · {items}',

  'operator.close.title': 'Закрытие дня',
  'operator.close.lead':
    'Укажите, сколько боксов реально осталось в холодильнике. Невыданные заказы будут списаны, кредиты за них не возвращаются.',
  'operator.close.remaining': 'Остаток в холодильнике, боксов',
  'operator.close.reason': 'Причина списания невыданных',
  'operator.close.dish': 'Блюдо лишних боксов (без заказа)',
  'operator.close.dish.unknown': 'Не знаю',
  'operator.close.submit': 'Закрыть день',
  'operator.close.done': 'День закрыт. Списано заказов: {orders}, боксов без заказа: {extra}.',
  'operator.close.system': 'День закрыт автоматически в {time}. Остаток не вводился.',
  'operator.close.byOperator': 'День закрыт в {time}. Остаток: {remaining}.',

  'operator.temp.title': 'Температура',
  'operator.temp.lead': 'Два замера в день: утром и вечером. Допустимо от 0 до +5 °C.',
  'operator.temp.value': 'Температура, °C',
  'operator.temp.slot': 'Замер',
  'operator.temp.save': 'Записать',
  'operator.temp.saved': 'Замер записан.',
  'operator.temp.warn':
    'Вне допустимых 0…+5 °C. Проверьте холодильник; запись попала в события системы.',
  'operator.temp.row': '{slot}: {value} °C',
  'operator.temp.none': 'не внесён',
  'operator.temp.out': 'вне диапазона',

  // ---- администратор: пропуски температуры ----
  'missed.title': 'Температура: пропущенные замеры',
  'missed.lead':
    'Замеры, срок которых прошёл, а записи нет. Утренний ждём до {morning}, вечерний до {evening}.',
  'missed.empty': 'Пропусков нет.',
  'missed.row': '{date} · {slot} · {gym}, {fridge}',
  'missed.from': 'С',
  'missed.to': 'По',
  'missed.loadError': 'Не удалось загрузить пропуски.',
};

export default ru;
