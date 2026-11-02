import { useState, type FormEvent } from 'react';
import { formatDecimal } from '@sportpit/shared/format';
import {
  adminDishListSchema,
  adminDishSchema,
  ALLERGENS,
  GOALS,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  type AdminDishDto,
  type Allergen,
  type Goal,
} from '@sportpit/shared/schemas/catalog';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField, useResource } from '../../../ui/index.ts';
import {
  AdminOnly,
  CheckField,
  errorText,
  fieldErrors,
  numberOrNull,
  TextAreaField,
  toNumber,
} from '../gyms/common.tsx';

interface Draft {
  id: number | null;
  nameRu: string;
  nameRo: string;
  compositionRu: string;
  compositionRo: string;
  calories: string;
  proteinG: string;
  fatG: string;
  carbsG: string;
  fiberG: string;
  weightG: string;
  shelfLifeHours: string;
  allergens: Allergen[];
  goals: Goal[];
  vegetarian: boolean;
  active: boolean;
  photoUrl: string | null;
}

const EMPTY: Draft = {
  id: null,
  nameRu: '',
  nameRo: '',
  compositionRu: '',
  compositionRo: '',
  calories: '',
  proteinG: '',
  fatG: '',
  carbsG: '',
  fiberG: '',
  weightG: '',
  shelfLifeHours: '72',
  allergens: [],
  goals: [],
  vegetarian: false,
  active: true,
  photoUrl: null,
};

const text = (n: number) => formatDecimal(n);

function toDraft(dish: AdminDishDto): Draft {
  return {
    id: dish.id,
    nameRu: dish.name.ru,
    nameRo: dish.name.ro,
    compositionRu: dish.composition.ru,
    compositionRo: dish.composition.ro,
    calories: text(dish.calories),
    proteinG: text(dish.proteinG),
    fatG: text(dish.fatG),
    carbsG: text(dish.carbsG),
    fiberG: text(dish.fiberG),
    weightG: text(dish.weightG),
    shelfLifeHours: text(dish.shelfLifeHours),
    allergens: dish.allergens,
    goals: dish.goals,
    vegetarian: dish.vegetarian,
    active: dish.active,
    photoUrl: dish.photoUrl,
  };
}

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  return on ? [...list.filter((x) => x !== value), value] : list.filter((x) => x !== value);
}

/** Фото блюда: JPEG и PNG до 5 МБ. Файл проверяется до отправки, сервер проверяет ещё раз по содержимому. */
function PhotoSection({
  dishId,
  photoUrl,
  onChanged,
}: {
  dishId: number;
  photoUrl: string | null;
  onChanged: (photoUrl: string | null) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setError(t('catalog.error.photoType'));
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError(t('catalog.error.photoTooLarge'));
      return;
    }
    const body = new FormData();
    body.append('photo', file);
    setBusy(true);
    try {
      const dish = await api.post(`/admin/dishes/${dishId}/photo`, {
        body,
        schema: adminDishSchema,
      });
      onChanged(dish.photoUrl);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const dish = await api.delete(`/admin/dishes/${dishId}/photo`, { schema: adminDishSchema });
      onChanged(dish.photoUrl);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="admin-fieldset">
      <legend>{t('admin.dishes.photo')}</legend>
      {photoUrl ? (
        <img className="admin-thumb" src={photoUrl} alt={t('admin.dishes.photo.current')} />
      ) : null}
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="dish-photo">
          {t('admin.dishes.photo.choose')}
        </label>
        <input
          id="dish-photo"
          className="ui-field__input"
          type="file"
          accept={PHOTO_TYPES.join(',')}
          disabled={busy}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="ui-field__hint">{t('admin.dishes.photo.hint')}</p>
        {error ? (
          <p className="ui-field__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {photoUrl ? (
        <Button variant="secondary" disabled={busy} onClick={() => void remove()}>
          {t('admin.dishes.photo.remove')}
        </Button>
      ) : null}
    </fieldset>
  );
}

function DishForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onCancel: () => void;
  onSaved: (dish: AdminDishDto) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setForm((prev) => ({ ...prev, ...patch }));
  const num = (key: keyof Draft) => numberOrNull(toNumber(String(form[key])));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFailure(null);
    const body = {
      nameRu: form.nameRu,
      nameRo: form.nameRo,
      compositionRu: form.compositionRu,
      compositionRo: form.compositionRo,
      calories: num('calories'),
      proteinG: num('proteinG'),
      fatG: num('fatG'),
      carbsG: num('carbsG'),
      fiberG: num('fiberG'),
      weightG: num('weightG'),
      shelfLifeHours: num('shelfLifeHours'),
      allergens: form.allergens,
      goals: form.goals,
      vegetarian: form.vegetarian,
      active: form.active,
    };
    try {
      const dish = form.id
        ? await api.patch(`/admin/dishes/${form.id}`, { body, schema: adminDishSchema })
        : await api.post('/admin/dishes', { body, schema: adminDishSchema });
      onSaved(dish);
    } catch (error) {
      const fields = fieldErrors(error, t);
      setErrors(fields);
      if (Object.keys(fields).length === 0) setFailure(errorText(error, t));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof Draft, label: string, hint?: string) => (
    <TextField
      label={label}
      hint={hint}
      inputMode="decimal"
      value={String(form[key])}
      error={errors[key]}
      onChange={(e) => set({ [key]: e.target.value })}
    />
  );

  return (
    <Card title={form.id ? t('admin.dishes.edit') : t('admin.dishes.add')}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        {failure ? <Banner variant="error">{failure}</Banner> : null}
        <TextField
          label={t('admin.dishes.nameRu')}
          value={form.nameRu}
          error={errors.nameRu}
          onChange={(e) => set({ nameRu: e.target.value })}
        />
        <TextField
          label={t('admin.dishes.nameRo')}
          value={form.nameRo}
          error={errors.nameRo}
          onChange={(e) => set({ nameRo: e.target.value })}
        />
        <TextAreaField
          label={t('admin.dishes.compositionRu')}
          value={form.compositionRu}
          error={errors.compositionRu}
          onChange={(compositionRu) => set({ compositionRu })}
        />
        <TextAreaField
          label={t('admin.dishes.compositionRo')}
          value={form.compositionRo}
          error={errors.compositionRo}
          onChange={(compositionRo) => set({ compositionRo })}
        />
        <div className="admin-grid">
          {field('calories', t('admin.dishes.calories'))}
          {field('proteinG', t('admin.dishes.protein'))}
          {field('fatG', t('admin.dishes.fat'))}
          {field('carbsG', t('admin.dishes.carbs'))}
          {field('fiberG', t('admin.dishes.fiber'))}
          {field('weightG', t('admin.dishes.weight'))}
          {field('shelfLifeHours', t('admin.dishes.shelfLife'), t('admin.dishes.shelfLife.hint'))}
        </div>
        <fieldset className="admin-fieldset">
          <legend>{t('admin.dishes.allergens')}</legend>
          {ALLERGENS.map((code) => (
            <CheckField
              key={code}
              label={t(`catalog.allergen.${code}`)}
              checked={form.allergens.includes(code)}
              onChange={(on) => set({ allergens: toggle(form.allergens, code, on) })}
            />
          ))}
        </fieldset>
        <fieldset className="admin-fieldset">
          <legend>{t('admin.dishes.goals')}</legend>
          {GOALS.map((goal) => (
            <CheckField
              key={goal}
              label={t(`catalog.filter.goal.${goal}`)}
              checked={form.goals.includes(goal)}
              onChange={(on) => set({ goals: toggle(form.goals, goal, on) })}
            />
          ))}
        </fieldset>
        <CheckField
          label={t('catalog.vegetarian')}
          checked={form.vegetarian}
          onChange={(vegetarian) => set({ vegetarian })}
        />
        <CheckField
          label={t('admin.active')}
          checked={form.active}
          onChange={(active) => set({ active })}
        />
        {form.id ? (
          <PhotoSection
            dishId={form.id}
            photoUrl={form.photoUrl}
            onChanged={(photoUrl) => set({ photoUrl })}
          />
        ) : (
          <p className="ui-field__hint">{t('admin.dishes.photo.afterSave')}</p>
        )}
        <div className="admin-actions">
          <Button type="submit" loading={saving}>
            {t('admin.save')}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {t('core.action.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function DishesPage() {
  const { t, lang } = useI18n();
  const dishes = useResource(() => api.get('/admin/dishes', { schema: adminDishListSchema }));
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <AdminOnly>
      <h2>{t('admin.dishes.title')}</h2>
      {dishes.error ? <Banner variant="error">{errorText(dishes.error, t)}</Banner> : null}
      {dishes.data && dishes.data.items.length === 0 ? <p>{t('admin.dishes.empty')}</p> : null}
      <ul className="admin-list">
        {dishes.data?.items.map((dish) => (
          <li key={dish.id} className="admin-list__item">
            {dish.photoUrl ? (
              <img className="admin-thumb" src={dish.photoUrl} aria-hidden="true" />
            ) : null}
            <div className="admin-list__main">
              <p className="admin-list__title">{dish.name[lang]}</p>
              <p className="admin-list__meta">
                {t('admin.dishes.summary', {
                  kcal: dish.calories,
                  protein: text(dish.proteinG),
                  fat: text(dish.fatG),
                  carbs: text(dish.carbsG),
                })}
              </p>
              {dish.active ? null : <span className="admin-badge">{t('admin.inactive')}</span>}
            </div>
            <Button variant="secondary" onClick={() => setDraft(toDraft(dish))}>
              {t('admin.edit')}
            </Button>
          </li>
        ))}
      </ul>
      {draft ? (
        <DishForm
          key={draft.id ?? 'new'}
          draft={draft}
          onCancel={() => setDraft(null)}
          onSaved={(dish) => {
            dishes.reload();
            // после создания форма остаётся открытой в режиме правки: теперь можно загрузить фото
            setDraft(toDraft(dish));
          }}
        />
      ) : (
        <Button onClick={() => setDraft(EMPTY)}>{t('admin.dishes.add')}</Button>
      )}
    </AdminOnly>
  );
}
