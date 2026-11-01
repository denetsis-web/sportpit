// Пространство orders: заказ на завтра, «Мои заказы», пауза пакета и ошибки заказа.
// Кредиты и сроки в текстах подставляются параметрами ({count}, {time}, {date}).
const ru = {
  'nav.orders': 'Мои заказы',

  // ---- экран заказа ----
  'order.titleTomorrow': 'Заказ на завтра',
  'order.titleDate': 'Заказ на {date}',
  'order.lead':
    'Выберите холодильник и дату, добавьте блюда и подтвердите заказ. Бокс вы забираете в холодильнике зала.',
  'order.loadError': 'Не удалось загрузить данные для заказа.',
  'order.fridge.label': 'Холодильник',
  'order.fridge.option': '{gym} · {name}',
  'order.fridge.choose': 'Выберите холодильник',
  'order.date.label': 'Дата выдачи',
  'order.date.option': '{date}',
  'order.date.tomorrow': 'Завтра, {date}',
  'order.cutoff': 'Заказы на этот день принимаются до {time}, {date}.',

  'order.menu.title': 'Блюда',
  'order.menu.empty': 'Меню на этот день ещё не опубликовано.',
  'order.menu.later': 'Загляните позже: меню на выбранный день появится.',
  'order.dish.add': 'Добавить',
  'order.dish.addLabel': 'Добавить в заказ: {name}',
  'order.dish.remove': 'Убрать',
  'order.dish.removeLabel': 'Убрать из заказа: {name}',
  'order.dish.inOrder': 'В заказе: {count}',
  'order.dish.soldOut': 'Закончилось',
  'order.dish.left': 'Осталось порций: {count}',

  'order.cart.title': 'Ваш заказ',
  'order.cart.empty': 'Заказ пуст. Добавьте блюда из меню.',
  'order.cart.boxes': 'Боксов в заказе: {count}',
  'order.cart.line': '{qty} × {name}',

  'order.totals.title': 'Итоги КБЖУ заказа',
  'order.totals.kcal': 'Калории',
  'order.totals.of': '{value} из {target}',
  'order.totals.noTarget': 'Заполните анкету цели, чтобы видеть норму дня.',
  'order.totals.fillProfile': 'Заполнить анкету',
  'order.totals.blocked': 'Для нормы дня обратитесь к врачу.',

  'order.credits.balance': 'Кредитов на счёте: {count}',
  'order.credits.after': 'После заказа останется: {count}',
  'order.credits.short': 'Не хватает кредитов: нужно {need}, есть {have}.',
  'order.credits.buy': 'Купить пакет',

  'order.limit': 'В день можно заказать не больше {max} боксов. У вас уже заказано: {used}.',
  'order.closed.date':
    'Заказать можно только накануне: выберите завтрашний или более поздний день.',
  'order.closed.cutoff': 'Приём заказов на этот день закрыт: он шёл до {time} накануне.',
  'order.closed.paused': 'На этот день стоит пауза пакета, заказать нельзя.',
  'order.seats.none': 'Мест нет',
  'order.seats.left': 'Свободно боксов: {count}',

  'order.confirm': 'Подтвердить заказ',
  'order.confirmMove': 'Перенести заказ',
  'order.notSent': 'Нет связи, заказ не отправлен. Выбранные блюда сохранены, повторите позже.',

  'order.move.title': 'Перенос заказа',
  'order.move.hint':
    'Прежний заказ будет отменён, а кредиты спишутся заново под новый. Это одно действие: если новый заказ не пройдёт, прежний останется.',
  'order.move.notFound': 'Заказ для переноса не найден или его уже нельзя изменить.',

  'order.done.title': 'Заказ подтверждён',
  'order.done.moved': 'Заказ перенесён',
  'order.done.code': 'Код получения',
  'order.done.hint': 'Назовите или введите этот код при получении бокса. Код действует один раз.',
  'order.done.where': '{gym} · {fridge}, {date}',
  'order.done.window': 'Выдача: {from}–{to}',
  'order.done.my': 'Мои заказы',
  'order.done.more': 'Заказать ещё',

  // ---- «Мои заказы» ----
  'my.title': 'Мои заказы',
  'my.loadError': 'Не удалось загрузить заказы.',
  'my.upcoming': 'Предстоящие',
  'my.past': 'Прошлые',
  'my.noUpcoming': 'Предстоящих заказов нет.',
  'my.noPast': 'Прошлых заказов нет.',
  'my.empty.title': 'Заказов пока нет',
  'my.empty.body': 'Выберите блюда на завтра, и заказ появится здесь.',
  'my.empty.action': 'Выбрать блюда',
  'my.card.title': 'Заказ на {date}',
  'my.card.where': '{gym} · {fridge}',
  'my.card.window': 'Выдача: {from}–{to}',
  'my.card.code': 'Код получения',
  'my.changeUntil': 'Отменить или перенести можно до {time}, {date}.',
  'my.changeClosed': 'Срок отмены и переноса вышел.',
  'my.cancel': 'Отменить',
  'my.cancelLabel': 'Отменить заказ на {date}',
  'my.move': 'Перенести',
  'my.moveLabel': 'Перенести заказ на {date}',
  'my.cancel.title': 'Отменить заказ?',
  'my.cancel.body': 'Кредиты вернутся на счёт: {count}.',
  'my.cancel.yes': 'Да, отменить',
  'my.cancel.keep': 'Не отменять',
  'my.cancelled': 'Заказ отменён, кредиты вернулись на счёт.',
  'status.confirmed': 'Подтверждён',
  'status.loaded': 'Лежит в холодильнике',
  'status.picked_up': 'Выдан',
  'status.written_off': 'Списан',
  'status.cancelled': 'Отменён',

  // ---- пауза пакета ----
  'pause.title': 'Пауза пакета',
  'pause.lead':
    'Пакет можно поставить на паузу до 14 дней, один раз: срок кредитов сдвинется на дни паузы. Пока есть подтверждённые заказы на эти дни, пауза недоступна.',
  'pause.none': 'Нет пакетов с кредитами, которые можно поставить на паузу.',
  'pause.lot': 'Кредитов: {count}, срок до {date}',
  'pause.from': 'Первый день паузы',
  'pause.days': 'Дней паузы (1–14)',
  'pause.submit': 'Поставить на паузу',
  'pause.submitLabel': 'Поставить на паузу пакет со сроком до {date}',
  'pause.done': 'Пауза с {from} по {until}. Новый срок кредитов: {date}.',
  'pause.active': 'Пауза с {from} по {until}, срок кредитов теперь до {date}.',

  // ---- ошибки проверки запроса ----
  'error.fridge': 'Выберите холодильник.',
  'error.date': 'Укажите дату.',
  'error.dish': 'Неверное блюдо.',
  'error.qty': 'Число порций — от 1 до 10.',
  'error.empty': 'Добавьте в заказ от 1 до 10 блюд.',
  'error.key': 'Не удалось подготовить заказ. Обновите страницу и повторите.',
  'error.pauseLot': 'Выберите пакет.',
  'error.pauseDays': 'Пауза — от 1 до 14 дней.',

  // ---- отказы сервера ----
  'error.fridgeUnavailable': 'Этот холодильник сейчас недоступен.',
  'error.dateNotFuture':
    'Заказать можно только накануне: выберите завтрашний или более поздний день.',
  'error.cutoffPassed': 'Приём заказов на этот день закрыт: он шёл до {time} накануне.',
  'error.dishUnavailable': 'Блюда «{dish}» нет в меню на выбранный день.',
  'error.dishSoldOut': 'Не хватило порций блюда «{dish}». Заказ не создан.',
  'error.noSeats': 'Мест нет: свободно боксов {left}.',
  'error.boxLimit': 'В день можно заказать не больше {max} боксов. Уже заказано: {used}.',
  'error.pausedDay': 'На этот день стоит пауза пакета, заказать нельзя.',
  'error.orderNotFound': 'Заказ не найден.',
  'error.cancelCutoff': 'Отменить или перенести заказ можно только до {time} накануне.',
  'error.notChangeable': 'Этот заказ уже нельзя изменить.',
  'error.transition': 'Статус заказа так изменить нельзя.',
  'error.codeUnavailable': 'Не удалось выдать код получения. Повторите.',
  'error.pauseLotNotFound': 'Пакет не найден.',
  'error.pauseUsed': 'Пауза для этого пакета уже использована.',
  'error.pauseHasOrders':
    'На дни паузы есть подтверждённые заказы. Отмените их или выберите другие дни.',
  'error.pauseExpired': 'Срок этого пакета уже вышел или кредитов не осталось.',
  'error.pauseStart': 'Пауза начинается не раньше сегодняшнего дня и до конца срока пакета.',
} as const;

export default ru;
