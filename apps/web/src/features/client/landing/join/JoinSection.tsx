// Каркас секции «Лист ожидания» (`#join`): заголовок и текст из словаря. Форму добавляет сборка формы.
// Обёртка `<section id="join">` с фокусом и фоном — в LandingEntry; здесь только содержимое и заголовок с id `lp-join-title`.
import { useT } from '../../../../app/i18n.tsx';

export default function JoinSection() {
  const t = useT();
  return (
    <>
      <p className="lp-label">{t('landing.join.label')}</p>
      <h2 id="lp-join-title" className="lp-headline">
        {t('landing.join.title')}
      </h2>
      <p className="lp-lead">{t('landing.join.text')}</p>
    </>
  );
}

export { JoinSection };
