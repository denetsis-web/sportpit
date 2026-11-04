// Каркас секции «Калькулятор нормы» (`#calc`): заголовок и текст из словаря. Форму и расчёт добавляет сборка калькулятора.
// Обёртка `<section id="calc">` с фокусом и фоном — в LandingEntry; здесь только содержимое и заголовок с id `lp-calc-title`.
import { useT } from '../../../../app/i18n.tsx';

export default function CalculatorSection() {
  const t = useT();
  return (
    <>
      <p className="lp-label">{t('landing.calc.label')}</p>
      <h2 id="lp-calc-title" className="lp-headline">
        {t('landing.calc.title')}
      </h2>
      <p className="lp-lead">{t('landing.calc.text')}</p>
      <p className="lp-muted">{t('landing.calc.disclaimer')}</p>
    </>
  );
}

export { CalculatorSection };
