// Пространство profile: анкета цели, норма КБЖУ, профиль (язык, телефон, согласия, выгрузка, удаление).
// Тексты согласий лежат в пространстве auth (заглушки с [ВПИШИ]); здесь юридических формулировок нет.
const ru = {
  'nav.profile': 'Профиль',
  title: 'Профиль',

  // ---- анкета ----
  'onboarding.title': 'Анкета цели',
  'onboarding.lead':
    'Ответьте на несколько вопросов, и мы рассчитаем норму калорий и БЖУ. Анкету можно пропустить и заполнить позже в профиле.',
  'onboarding.skip': 'Пропустить',
  'onboarding.skipHint': 'Меню и заказ доступны и без анкеты.',
  'onboarding.consentStep': 'Шаг 1. Согласие на данные о здоровье',
  'onboarding.consentLead':
    'Параметры тела сохраняются только с вашего отдельного согласия. Без него можно посмотреть расчёт, но он не сохранится.',
  'onboarding.formStep': 'Шаг 2. Ваши параметры',
  'onboarding.resultStep': 'Ваша норма',
  'onboarding.toMenu': 'К меню',
  'onboarding.toProfile': 'В профиль',
  'onboarding.loading': 'Загружаем анкету…',

  'form.sex': 'Пол',
  'form.sex.female': 'Женский',
  'form.sex.male': 'Мужской',
  'form.age': 'Возраст, лет',
  'form.height': 'Рост, см',
  'form.weight': 'Вес, кг',
  'form.goal': 'Цель',
  'form.goal.lose': 'Похудение',
  'form.goal.maintain': 'Поддержание',
  'form.goal.gain': 'Набор массы',
  'form.activity': 'Активность',
  'form.activity.sedentary': 'Сидячая: почти нет тренировок',
  'form.activity.light': 'Лёгкая: 1–3 тренировки в неделю',
  'form.activity.moderate': 'Умеренная: 3–5 тренировок в неделю',
  'form.activity.active': 'Высокая: 6–7 тренировок в неделю',
  'form.condition':
    'У меня диабет, беременность или другое состояние здоровья, при котором питание подбирает врач',
  'form.submit': 'Рассчитать норму',
  'form.select': 'Выберите',
  'form.notSaved': 'Параметры не сохранены: нет согласия на данные о здоровье.',
  'form.saved': 'Анкета сохранена.',
  'form.saveError': 'Не удалось сохранить анкету.',
  'form.error.required': 'Заполните поле.',
  'form.error.range': 'Введите число от {min} до {max}.',
  'form.error.integer': 'Введите целое число.',

  // ---- норма ----
  'targets.title': 'Ваша норма на день',
  'targets.kcal': 'Калории',
  'targets.protein': 'Белки',
  'targets.fat': 'Жиры',
  'targets.carb': 'Углеводы',
  'targets.fiber': 'Клетчатка',
  'targets.kcalValue': '{value} ккал',
  'targets.gramsValue': '{value} г',
  'targets.proteinRange': 'Диапазон белка 1,6–2,2 г на кг массы тела: {min}–{max} г в день.',
  'targets.floorNote': 'Минимум безопасного уровня: расчёт не опускается ниже {kcal} ккал в сутки.',
  'targets.disclaimer':
    'Это не медицинская рекомендация. Норма рассчитана по формуле Миффлина-Сан Жеора и носит ориентировочный характер.',
  'targets.blocked.title': 'Обратитесь к врачу',
  'targets.blocked.medical_condition':
    'При диабете, беременности и других состояниях здоровья норму питания определяет врач, поэтому мы её не рассчитываем.',
  'targets.blocked.age_out_of_range':
    'Для возраста младше 18 и старше 80 лет норму питания определяет врач, поэтому мы её не рассчитываем.',
  'targets.blocked.menuStays': 'Меню и заказ боксов остаются доступны.',

  // ---- профиль ----
  'goal.title': 'Данные цели',
  'goal.empty': 'Анкета не заполнена.',
  'goal.fill': 'Заполнить анкету',
  'goal.edit': 'Изменить анкету',
  'goal.needConsent':
    'Чтобы хранить анкету, нужно согласие на данные о здоровье. Отметьте его в разделе «Согласия» или при заполнении анкеты.',
  'goal.summary': '{sex}, {age} лет, {height} см, {weight} кг',

  'lang.title': 'Язык',
  'lang.lead': 'Язык интерфейса сохраняется в вашем профиле.',

  'phone.title': 'Телефон',
  'phone.current': 'Текущий номер: {phone}',
  'phone.change': 'Изменить номер',
  'phone.new': 'Новый номер',
  'phone.newHint': 'Формат +373XXXXXXXX. На него придёт код из SMS.',
  'phone.sendCode': 'Получить код',
  'phone.code': 'Код из SMS',
  'phone.sent': 'Мы отправили код на {phone}. Номер изменится после подтверждения.',
  'phone.confirm': 'Подтвердить',
  'phone.cancel': 'Отмена',
  'phone.changed': 'Номер изменён: {phone}.',

  'consents.title': 'Согласия',
  'consents.lead': 'Условия, политику и согласие на данные о здоровье можно пересмотреть здесь.',
  'consents.healthRevoked': 'Согласие на данные о здоровье отозвано, сохранённая анкета удалена.',

  'export.title': 'Мои данные',
  'export.lead': 'Файл JSON с вашим профилем, согласиями, заказами и оценками.',
  'export.action': 'Выгрузить данные',
  'export.done': 'Файл подготовлен.',
  'export.fileName': 'sportpit-moi-dannye.json',

  'delete.title': 'Удаление аккаунта',
  'delete.lead':
    'Телефон и анкета будут стёрты, сессии закрыты. Заказы и журнал кредитов останутся без привязки к вам.',
  'delete.action': 'Удалить аккаунт',
  'delete.confirmTitle': 'Удалить аккаунт?',
  'delete.confirmBody':
    'Это нельзя отменить. Повторный вход по этому номеру создаст новый пустой аккаунт.',
  'delete.confirm': 'Да, удалить',
  'delete.done': 'Аккаунт удалён.',

  'error.confirmRequired': 'Подтвердите удаление аккаунта.',
  'error.phoneSame': 'Это ваш текущий номер.',
  'error.loadFailed': 'Не удалось загрузить профиль.',
} as const;

export default ru;
