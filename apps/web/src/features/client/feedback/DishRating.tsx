// Оценка одного блюда: 1–5 звёзд и быстрый тег (R26). Правка возможна 24 часа, дальше — только просмотр.
import { useState, type FormEvent } from 'react';
import { REVIEW_TAGS, type RateInput, type RatingDto } from '@sportpit/shared/schemas/feedback';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { rateDish } from './api.ts';

export interface DishRatingProps {
  orderId: string;
  dishId: number;
  dishName: string;
  rating: RatingDto | null;
  onSaved: (rating: RatingDto) => void;
}

export function DishRating({ orderId, dishId, dishName, rating, onSaved }: DishRatingProps) {
  const { t, dateTime } = useI18n();
  const [stars, setStars] = useState(rating?.stars ?? 0);
  const [tag, setTag] = useState<string>(rating?.tag ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const locked = rating !== null && !rating.canEdit;
  const name = `${orderId}-${dishId}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || busy) return;
    if (stars < 1) {
      setError(t('feedback.rate.pickStars'));
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await rateDish({
        orderId,
        dishId,
        stars,
        tag: tag === '' ? null : (tag as RateInput['tag']),
      });
      setSaved(true);
      onSaved(result.rating);
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dish-rating" onSubmit={(event) => void submit(event)} noValidate>
      <fieldset className="dish-rating__stars" disabled={locked}>
        <legend>{t('feedback.rate.stars.legend', { name: dishName })}</legend>
        <div className="dish-rating__row">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="star" data-on={value <= stars ? 'true' : 'false'}>
              <input
                type="radio"
                name={`stars-${name}`}
                value={value}
                checked={stars === value}
                onChange={() => setStars(value)}
              />
              <span aria-hidden="true" className="star__glyph">
                ★
              </span>
              <span className="sr-only">{t('feedback.rate.star', { count: value })}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="dish-rating__tags" disabled={locked}>
        <legend>{t('feedback.rate.tag.legend', { name: dishName })}</legend>
        <div className="dish-rating__row">
          {['', ...REVIEW_TAGS].map((value) => (
            <label
              key={value || 'none'}
              className="chip"
              data-on={tag === value ? 'true' : 'false'}
            >
              <input
                type="radio"
                name={`tag-${name}`}
                value={value}
                checked={tag === value}
                onChange={() => setTag(value)}
              />
              <span>{value === '' ? t('feedback.rate.tag.none') : t(`feedback.tag.${value}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {rating && !locked ? (
        <p className="dish-rating__note">
          {t('feedback.rate.editUntil', { time: dateTime(rating.editableUntil) })}
        </p>
      ) : null}
      {locked ? <p className="dish-rating__note">{t('feedback.rate.locked')}</p> : null}
      {error ? <Banner variant="error">{error}</Banner> : null}
      {saved && !error ? <Banner variant="success">{t('feedback.rate.saved')}</Banner> : null}
      {!locked ? (
        <Button type="submit" loading={busy}>
          {t('feedback.rate.save')}
        </Button>
      ) : null}
    </form>
  );
}
