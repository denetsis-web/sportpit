// Лист ожидания (R19–R22): список записей с фильтрами, страницами по 50, выгрузкой CSV и удалением.
import { useState, type FormEvent } from 'react';
import {
  ATTRIBUTION_SOURCES,
  type WaitlistEntryDto,
  type WaitlistPath,
} from '@sportpit/shared/schemas/growth';
import { GOALS } from '@sportpit/shared/schemas/catalog';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Dialog, TextField, useResource } from '../../../ui/index.ts';
import { AdminOnly, SelectField, errorText } from '../gyms/common.tsx';
import '../gyms/admin-forms.css';
import {
  EMPTY_FILTERS,
  deleteWaitlistEntry,
  fetchWaitlist,
  hasFilters,
  waitlistCsvUrl,
  type WaitlistFilters,
} from './api.ts';
import './growth.css';

const PATH_MARKS: ReadonlyArray<[keyof WaitlistPath, string]> = [
  ['usedCalc', 'growth.waitlist.path.usedCalc'],
  ['signedUp', 'growth.waitlist.path.signedUp'],
  ['purchased', 'growth.waitlist.path.purchased'],
];

type Notice = { kind: 'ok' | 'error'; text: string };

function Waitlist() {
  const { t, lang, dateTime } = useI18n();
  const [draft, setDraft] = useState<WaitlistFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<WaitlistFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<WaitlistEntryDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const resource = useResource(() => fetchWaitlist(applied, page), [applied, page]);
  const data = resource.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const set = <K extends keyof WaitlistFilters>(name: K, value: WaitlistFilters[K]) =>
    setDraft((current) => ({ ...current, [name]: value }));

  function apply(event: FormEvent) {
    event.preventDefault();
    setApplied(draft);
    setPage(1);
  }

  function reset() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    try {
      await deleteWaitlistEntry(pending.id);
      setNotice({ kind: 'ok', text: t('growth.waitlist.delete.done') });
      // Удалили последнюю запись страницы — возвращаемся на предыдущую.
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else resource.reload();
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error, t) });
    } finally {
      setDeleting(false);
      setPending(null);
    }
  }

  const anyOption = { value: '', label: t('growth.waitlist.filter.any') };

  return (
    <div className="growth">
      <h2>{t('growth.waitlist.title')}</h2>
      <p className="growth__lead">{t('growth.waitlist.lead')}</p>

      <form
        className="growth__filters"
        aria-label={t('growth.waitlist.filter.label')}
        onSubmit={apply}
      >
        <TextField
          label={t('growth.waitlist.filter.q')}
          value={draft.q}
          onChange={(e) => set('q', e.target.value)}
        />
        <TextField
          label={t('growth.waitlist.filter.gym')}
          value={draft.gym}
          onChange={(e) => set('gym', e.target.value)}
        />
        <SelectField
          label={t('growth.waitlist.filter.goal')}
          value={draft.goal}
          onChange={(value) => set('goal', value)}
          options={[anyOption, ...GOALS.map((g) => ({ value: g, label: t(`growth.goal.${g}`) }))]}
        />
        <SelectField
          label={t('growth.waitlist.filter.lang')}
          value={draft.lang}
          onChange={(value) => set('lang', value)}
          options={[
            anyOption,
            ...(['ru', 'ro'] as const).map((l) => ({ value: l, label: t(`growth.lang.${l}`) })),
          ]}
        />
        <SelectField
          label={t('growth.waitlist.filter.source')}
          value={draft.source}
          onChange={(value) => set('source', value as WaitlistFilters['source'])}
          options={[
            anyOption,
            ...ATTRIBUTION_SOURCES.map((s) => ({ value: s, label: t(`growth.source.${s}`) })),
          ]}
        />
        <TextField
          type="date"
          label={t('growth.waitlist.filter.from')}
          value={draft.from}
          onChange={(e) => set('from', e.target.value)}
        />
        <TextField
          type="date"
          label={t('growth.waitlist.filter.to')}
          value={draft.to}
          onChange={(e) => set('to', e.target.value)}
        />
        <div className="growth__filter-actions">
          <Button type="submit">{t('growth.waitlist.filter.apply')}</Button>
          <Button variant="secondary" onClick={reset}>
            {t('growth.waitlist.filter.reset')}
          </Button>
        </div>
      </form>

      <div className="growth__actions">
        <a className="growth__download" href={waitlistCsvUrl(applied, lang)} download>
          {t('growth.waitlist.download')}
        </a>
        <p className="growth__lead">{t('growth.waitlist.csvNote')}</p>
      </div>

      {notice ? (
        <Banner variant={notice.kind === 'ok' ? 'success' : 'error'}>{notice.text}</Banner>
      ) : null}

      {resource.error ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={resource.reload}>
              {t('growth.waitlist.retry')}
            </Button>
          }
        >
          {t('growth.waitlist.loadError')} {errorText(resource.error, t)}
        </Banner>
      ) : null}
      {resource.loading && !data ? <p role="status">{t('core.loading')}</p> : null}

      {data && data.items.length === 0 ? (
        <p>
          {hasFilters(applied) ? t('growth.waitlist.emptyFiltered') : t('growth.waitlist.empty')}
        </p>
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <p className="growth__total">{t('growth.waitlist.total', { total: data.total })}</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="growth__sr">{t('growth.waitlist.title')}</caption>
              <thead>
                <tr>
                  {(
                    [
                      'createdAt',
                      'phone',
                      'name',
                      'gym',
                      'goal',
                      'lang',
                      'source',
                      'ref',
                      'campaign',
                      'path',
                      'actions',
                    ] as const
                  ).map((col) => (
                    <th key={col} scope="col">
                      {t(`growth.waitlist.col.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{dateTime(item.createdAt)}</td>
                    <td className="growth__nowrap">{item.phone}</td>
                    <Text value={item.name} />
                    <Text value={item.gym} />
                    <Text value={item.goal ? t(`growth.goal.${item.goal}`) : null} />
                    <td>{t(`growth.lang.${item.lang}`)}</td>
                    <td>{t(`growth.source.${item.source}`)}</td>
                    <Text value={item.ref} />
                    <Text value={item.campaign} />
                    <td>
                      <PathMarks path={item.path} />
                    </td>
                    <td>
                      <Button
                        variant="danger"
                        aria-label={t('growth.waitlist.delete.row', { phone: item.phone })}
                        onClick={() => {
                          setNotice(null);
                          setPending(item);
                        }}
                      >
                        {t('growth.waitlist.delete')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="growth__lead">{t('growth.waitlist.path.hint')}</p>
          <nav className="growth__pager">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('growth.waitlist.prev')}
            </Button>
            <span>{t('growth.waitlist.page', { page, pages })}</span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t('growth.waitlist.next')}
            </Button>
          </nav>
        </>
      ) : null}

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t('growth.waitlist.delete.title')}
        closeLabel={t('core.action.cancel')}
        hideClose
        actions={
          <>
            <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
              {t('growth.waitlist.delete.confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t('growth.waitlist.delete.cancel')}
            </Button>
          </>
        }
      >
        {pending ? <p>{t('growth.waitlist.delete.text', { phone: pending.phone })}</p> : null}
      </Dialog>
    </div>
  );
}

/** Ячейка с необязательным текстом: пусто — тире. */
function Text({ value }: { value: string | null }) {
  const { t } = useI18n();
  return <td>{value ?? t('growth.waitlist.empty.value')}</td>;
}

/** Отметки пути человека; у записи без анонимного номера (`path === null`) отметок нет. */
function PathMarks({ path }: { path: WaitlistPath | null }) {
  const { t } = useI18n();
  if (!path) {
    return (
      <>
        <span aria-hidden="true">{t('growth.waitlist.empty.value')}</span>
        <span className="growth__sr">{t('growth.waitlist.path.none')}</span>
      </>
    );
  }
  const marks = PATH_MARKS.filter(([key]) => path[key]);
  if (marks.length === 0) return <span>{t('growth.waitlist.empty.value')}</span>;
  return (
    <ul className="growth__marks">
      {marks.map(([key, label]) => (
        <li key={key} className="admin-badge">
          {t(label)}
        </li>
      ))}
    </ul>
  );
}

export function WaitlistPage() {
  return (
    <AdminOnly>
      <Waitlist />
    </AdminOnly>
  );
}
