// Пространство notifications: колокольчик и список внутренних уведомлений.
const ru = {
  title: 'Уведомления',
  'nav.label': 'Уведомления',
  'bell.label': 'Уведомления',
  'bell.labelUnread': 'Уведомления, непрочитанных: {count}',
  empty: 'Уведомлений пока нет.',
  loadError: 'Не удалось загрузить уведомления.',
  markRead: 'Отметить прочитанным',
  markAll: 'Прочитать все',
  open: 'Открыть',
  unread: 'Новое',
  'unread.summary': 'Непрочитанных: {count}',

  'type.credits_expiring.title': 'Кредиты скоро сгорят',
  'type.credits_expiring.body': 'Проверьте срок пакетов и закажите боксы заранее.',
  'type.credits_expiring.detail': 'Сгорает кредитов: {count}',
  'type.rate_dish.title': 'Как блюдо?',
  'type.rate_dish.body': 'Оцените блюдо из вашего заказа.',
  'type.complaint_resolved.title': 'Жалоба рассмотрена',
  'type.complaint_resolved.body': 'По вашему обращению принято решение.',
  'type.system_alert.title': 'Сбои в системе',
  'type.system_alert.body': 'За последний час сбоев: {count}. Источник: {kind}.',
  'alert.kind.sms_failed': 'отправка SMS',
  'alert.kind.payment_failed': 'оплата',
} as const;

export default ru;
