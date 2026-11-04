// Пространство growth: серверные сообщения листа ожидания и подписи админ-экранов «Лист ожидания» и «Воронка».
// Публичные тексты лендинга, формы и плашки согласия — в пространстве landing.
// Здесь нет медицинских обещаний: это служебные подписи для администратора.
const ru = {
  // ---- ошибки сервера ----
  'error.consent': 'Без согласия на обработку данных записать вас в список не получится.',
  'error.waitlistLimit': 'Слишком много попыток записаться. Попробуйте позже.',
  'error.notFound': 'Такой записи нет.',
  'error.date': 'Дата должна быть в формате ГГГГ-ММ-ДД.',
  'error.page': 'Номер страницы — целое число от 1.',
  'error.range': 'Период указан неверно: начало не позже конца.',

  // ---- меню админки ----
  'nav.waitlist': 'Лист ожидания',
  'nav.funnel': 'Воронка',

  // ---- словари значений ----
  'goal.lose': 'Похудение',
  'goal.maintain': 'Поддержание',
  'goal.gain': 'Набор массы',
  'lang.ru': 'Русский',
  'lang.ro': 'Румынский',
  'source.gym': 'QR или афиша в зале',
  'source.trainer': 'Тренер',
  'source.tg': 'Telegram',
  'source.ig': 'Instagram',
  'source.direct': 'Прямой заход',
  'source.other': 'Другое',

  // ---- лист ожидания: страница ----
  'waitlist.title': 'Лист ожидания',
  'waitlist.lead':
    'Люди, которые оставили телефон на сайте, пока холодильников нет. Данные видны только администратору.',
  'waitlist.total': 'Записей: {total}',
  'waitlist.page': 'Страница {page} из {pages}',
  'waitlist.prev': 'Назад',
  'waitlist.next': 'Вперёд',

  // ---- лист ожидания: фильтры ----
  'waitlist.filter.label': 'Фильтры списка',
  'waitlist.filter.q': 'Номер или имя',
  'waitlist.filter.gym': 'Зал или район',
  'waitlist.filter.goal': 'Цель',
  'waitlist.filter.lang': 'Язык',
  'waitlist.filter.source': 'Источник',
  'waitlist.filter.from': 'С',
  'waitlist.filter.to': 'По',
  'waitlist.filter.any': 'Любой',
  'waitlist.filter.apply': 'Показать',
  'waitlist.filter.reset': 'Сбросить',

  // ---- лист ожидания: столбцы ----
  'waitlist.col.createdAt': 'Когда',
  'waitlist.col.phone': 'Телефон',
  'waitlist.col.name': 'Имя',
  'waitlist.col.gym': 'Зал или район',
  'waitlist.col.goal': 'Цель',
  'waitlist.col.lang': 'Язык',
  'waitlist.col.source': 'Источник',
  'waitlist.col.ref': 'Метка (ref)',
  'waitlist.col.campaign': 'Кампания',
  'waitlist.col.path': 'Путь',
  'waitlist.col.actions': 'Действия',
  'waitlist.empty.value': '—',

  // ---- отметки пути ----
  'waitlist.path.usedCalc': 'Считал норму',
  'waitlist.path.signedUp': 'Зарегистрировался',
  'waitlist.path.purchased': 'Купил пакет',
  'waitlist.path.none': 'Нет данных: человек не принял аналитику',
  'waitlist.path.hint':
    'Отметки видны только у тех, кто принял аналитику: по анонимному номеру браузера.',

  // ---- лист ожидания: состояния ----
  'waitlist.empty': 'В листе ожидания пока никого нет.',
  'waitlist.emptyFiltered': 'По этим условиям никого не нашли.',
  'waitlist.loadError': 'Не удалось загрузить лист ожидания.',
  'waitlist.retry': 'Повторить',

  // ---- выгрузка ----
  'waitlist.download': 'Скачать для Excel (CSV)',
  'waitlist.csvNote':
    'В файле перед телефоном стоит апостроф. Он нужен, чтобы Excel не принял номер за формулу, и в номер не входит.',

  // ---- удаление записи ----
  'waitlist.delete': 'Удалить',
  'waitlist.delete.title': 'Удалить запись?',
  'waitlist.delete.text':
    'Запись {phone} будет удалена без возможности восстановления. Действие попадёт в журнал действий администратора.',
  'waitlist.delete.confirm': 'Удалить запись',
  'waitlist.delete.cancel': 'Не удалять',
  'waitlist.delete.done': 'Запись удалена.',
  'waitlist.delete.error': 'Не удалось удалить запись.',

  // ---- воронка: страница ----
  'funnel.title': 'Воронка',
  'funnel.lead':
    'Сколько людей дошло от просмотра сайта до первой покупки, в разрезе источников. Без сторонних счётчиков и без cookies.',
  'funnel.period.from': 'С',
  'funnel.period.to': 'По',
  'funnel.period.apply': 'Показать',
  'funnel.period.shown': 'Период: {from} — {to}',

  // ---- воронка: столбцы и этапы ----
  'funnel.col.source': 'Источник',
  'funnel.col.landingViews': 'Просмотры сайта',
  'funnel.col.calcUsed': 'Посчитали норму',
  'funnel.col.waitlistJoins': 'Записались в лист',
  'funnel.col.signups': 'Зарегистрировались',
  'funnel.col.firstPurchases': 'Первая покупка',
  'funnel.row.total': 'Всего',
  'funnel.conv.title': 'Доля от предыдущего шага',
  'funnel.conv.value': '{percent} %',
  'funnel.conv.none': '—',

  // ---- воронка: уникальные люди ----
  'funnel.unique.title': 'Уникальные люди',
  'funnel.unique.visitors': 'Посетители',
  'funnel.unique.calc': 'Посчитали норму',
  'funnel.unique.waitlist': 'Записались в лист',
  'funnel.unique.signups': 'Зарегистрировались',
  'funnel.unique.purchases': 'Купили',
  'funnel.unique.note':
    'Уникальные люди считаются по анонимному номеру браузера, а он есть только у тех, кто принял аналитику. Остальные видны лишь в общих счётчиках.',
  'funnel.note.firstPurchase':
    'Первая покупка относится к источнику, с которого человек зарегистрировался; если источника нет, это «Прямой заход».',

  // ---- воронка: состояния ----
  'funnel.empty': 'За этот период событий пока нет.',
  'funnel.loadError': 'Не удалось загрузить воронку.',
  'funnel.retry': 'Повторить',

  // ---- заголовки столбцов CSV ----
  'csv.createdAt': 'Когда',
  'csv.phone': 'Телефон',
  'csv.name': 'Имя',
  'csv.gym': 'Зал или район',
  'csv.goal': 'Цель',
  'csv.lang': 'Язык',
  'csv.source': 'Источник',
  'csv.ref': 'Метка',
  'csv.campaign': 'Кампания',
} as const;

export default ru;
