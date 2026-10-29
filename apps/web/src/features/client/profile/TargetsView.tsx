import { isBlocked, type TargetsResult } from '@sportpit/shared/targets';
import { useT } from '../../../app/i18n.tsx';
import { Banner, Card } from '../../../ui/index.ts';
import './profile.css';

/**
 * Норма на день или «Обратитесь к врачу». Дисклеймер «не медицинская рекомендация» стоит рядом
 * с нормой всегда; при блоке норма не показывается, а меню остаётся доступным (R17, R17.1, R17.2).
 */
export function TargetsView({ result }: { result: TargetsResult }) {
  const t = useT();
  if (isBlocked(result)) {
    return (
      <Card title={t('profile.targets.blocked.title')} className="targets">
        <Banner variant="warning">
          <p>{t(`profile.targets.blocked.${result.blocked}`)}</p>
          <p>{t('profile.targets.blocked.menuStays')}</p>
        </Banner>
        <p className="targets__disclaimer">{t('profile.targets.disclaimer')}</p>
      </Card>
    );
  }
  const rows = [
    ['kcal', t('profile.targets.kcalValue', { value: result.kcal })],
    ['protein', t('profile.targets.gramsValue', { value: result.proteinG })],
    ['fat', t('profile.targets.gramsValue', { value: result.fatG })],
    ['carb', t('profile.targets.gramsValue', { value: result.carbG })],
    ['fiber', t('profile.targets.gramsValue', { value: result.fiberG })],
  ] as const;
  return (
    <Card title={t('profile.targets.title')} className="targets">
      <dl className="targets__list">
        {rows.map(([key, value]) => (
          <div key={key} className="targets__row">
            <dt>{t(`profile.targets.${key}`)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        {t('profile.targets.proteinRange', {
          min: result.proteinRangeG.min,
          max: result.proteinRangeG.max,
        })}
      </p>
      {result.floorApplied ? (
        <Banner variant="info">{t('profile.targets.floorNote', { kcal: result.kcal })}</Banner>
      ) : null}
      <p className="targets__disclaimer">{t('profile.targets.disclaimer')}</p>
    </Card>
  );
}
