// Пространство core: оболочка приложения, общие действия и ошибки.
const ru = {
  appName: 'SportPit',
  slogan: 'Вкусно. Свежо. Чётко по КБЖУ',
  skipToContent: 'К основному содержимому',
  loading: 'Загрузка…',

  'nav.label': 'Основная навигация',
  'nav.home': 'Главная',

  'language.label': 'Язык',
  'language.ru': 'Русский',
  'language.ro': 'Română',
  'language.switchTo': 'Переключить язык: {language}',
  'language.chooseTitle': 'Выберите язык · Alegeți limba',
  'language.short.ru': 'RU',
  'language.short.ro': 'RO',

  'theme.label': 'Тема оформления',
  'theme.system': 'Как в системе',
  'theme.light': 'Светлая',
  'theme.dark': 'Тёмная',

  'offline.banner': 'Нет связи. Показываем сохранённые данные, заказ без интернета не отправить.',

  'install.title': 'Установите приложение',
  'install.androidBody':
    'Добавьте SportPit на главный экран: приложение открывается быстрее и работает без сети.',
  'install.iosBody': 'Нажмите «Поделиться» в Safari и выберите «На экран “Домой”».',
  'install.action': 'Установить',
  'install.dismiss': 'Не сейчас',
  'install.gotIt': 'Понятно',

  'home.welcome': 'Добро пожаловать',
  'home.lead':
    'Здесь вы закажете сбалансированные боксы с точным КБЖУ и заберёте их в холодильнике вашего зала.',
  'home.stub': 'Разделы появятся по мере готовности приложения.',

  'notFound.title': 'Страница не найдена',
  'notFound.body': 'Такой страницы нет. Вернитесь на главную.',
  'notFound.home': 'На главную',

  'noAccess.title': 'Нет доступа',
  'noAccess.body': 'У вас нет прав для просмотра этого раздела.',

  'admin.title': 'Админка',
  'admin.nav.label': 'Навигация админки',
  'admin.empty': 'Разделов пока нет.',

  'action.retry': 'Повторить',
  'action.cancel': 'Отмена',
  'action.confirm': 'Подтвердить',
  'action.close': 'Закрыть',
  'action.back': 'Назад',

  'error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
  'error.network': 'Нет связи с сервером. Проверьте интернет и повторите.',
  'error.unauthorized': 'Войдите, чтобы продолжить.',
  'error.forbidden': 'Нет доступа.',
  'error.notFound': 'Не найдено.',
  'error.validation': 'Проверьте введённые данные.',
  'error.rateLimited': 'Слишком часто. Подождите {seconds} сек.',
  'error.badRequest': 'Запрос отклонён.',
} as const;

export default ru;
