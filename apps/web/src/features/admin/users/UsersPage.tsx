import { useState } from 'react';
import { fridgeListSchema, type FridgeDto } from '@sportpit/shared/schemas/admin';
import {
  userListResponseSchema,
  verifyResponseSchema,
  type AuthUserDto,
} from '@sportpit/shared/schemas/auth';
import { ROLES, type Role } from '@sportpit/shared/types';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Dialog, useResource } from '../../../ui/index.ts';
import { useSession } from '../../client/auth/session.ts';
import { AdminOnly, CheckField, SelectField, errorText } from '../gyms/common.tsx';

interface PendingRole {
  user: AuthUserDto;
  role: Role;
}

type Notice = { kind: 'ok' | 'error'; userId: number; text: string };

function FridgePicker({
  user,
  fridges,
  onNotice,
  onSaved,
}: {
  user: AuthUserDto;
  fridges: FridgeDto[];
  onNotice: (notice: Notice) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<string[]>(user.fridgeIds);
  const [saving, setSaving] = useState(false);
  const known = new Set(fridges.map((f) => f.id));
  const unknown = user.fridgeIds.filter((id) => !known.has(id));

  const toggle = (id: string, on: boolean) =>
    setChosen((list) => (on ? [...list, id] : list.filter((x) => x !== id)));

  async function save() {
    setSaving(true);
    try {
      await api.put(`/auth/users/${user.id}/fridges`, {
        body: { fridgeIds: chosen },
        schema: verifyResponseSchema,
      });
      onNotice({ kind: 'ok', userId: user.id, text: t('users.fridges.saved') });
      onSaved();
    } catch (error) {
      onNotice({ kind: 'error', userId: user.id, text: errorText(error, t) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="admin-fieldset">
      <legend>{t('users.fridges.legend', { phone: user.phone })}</legend>
      <p className="admin-list__meta">{t('users.fridges.hint')}</p>
      {fridges.length === 0 && unknown.length === 0 ? <p>{t('users.fridges.none')}</p> : null}
      {fridges.map((fridge) => (
        <CheckField
          key={fridge.id}
          label={t('users.fridges.option', { gym: fridge.gymName, name: fridge.name })}
          checked={chosen.includes(fridge.id)}
          onChange={(on) => toggle(fridge.id, on)}
        />
      ))}
      {unknown.map((id) => (
        <CheckField
          key={id}
          label={t('users.fridges.unknown', { id })}
          checked={chosen.includes(id)}
          onChange={(on) => toggle(id, on)}
        />
      ))}
      <div className="admin-actions">
        <Button loading={saving} onClick={() => void save()}>
          {t('users.fridges.save', { phone: user.phone })}
        </Button>
      </div>
    </fieldset>
  );
}

export function UsersPage() {
  const { t } = useI18n();
  const { user: me } = useSession();
  const users = useResource(() => api.get('/auth/users', { schema: userListResponseSchema }));
  const fridges = useResource(() => api.get('/admin/fridges', { schema: fridgeListSchema }));
  const [pending, setPending] = useState<PendingRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const roleName = (role: Role) => t(`auth.role.${role}`);

  async function confirmRole() {
    if (!pending) return;
    setSaving(true);
    try {
      await api.put(`/auth/users/${pending.user.id}/role`, {
        body: { role: pending.role },
        schema: verifyResponseSchema,
      });
      setNotice({ kind: 'ok', userId: pending.user.id, text: t('users.role.saved') });
      users.reload();
    } catch (error) {
      setNotice({ kind: 'error', userId: pending.user.id, text: errorText(error, t) });
    } finally {
      setSaving(false);
      setPending(null);
    }
  }

  const noticeFor = (id: number) =>
    notice?.userId === id ? (
      <Banner variant={notice.kind === 'ok' ? 'success' : 'error'}>{notice.text}</Banner>
    ) : null;

  return (
    <AdminOnly>
      <h2>{t('users.title')}</h2>
      <p>{t('users.lead')}</p>
      {users.error ? <Banner variant="error">{errorText(users.error, t)}</Banner> : null}
      {fridges.error ? <Banner variant="error">{errorText(fridges.error, t)}</Banner> : null}
      {users.data && users.data.items.length === 0 ? <p>{t('users.empty')}</p> : null}
      <ul className="admin-list">
        {users.data?.items.map((person) => (
          <li key={person.id} className="admin-list__item">
            <div className="admin-list__main">
              <p className="admin-list__title">{person.phone}</p>
              {me?.id === person.id ? <span className="admin-badge">{t('users.you')}</span> : null}
              {noticeFor(person.id)}
              <SelectField
                label={t('users.role.label', { phone: person.phone })}
                value={person.role}
                options={ROLES.map((role) => ({ value: role, label: roleName(role) }))}
                onChange={(role) => {
                  setNotice(null);
                  setPending({ user: person, role: role as Role });
                }}
              />
              {person.role === 'operator' && fridges.data ? (
                <FridgePicker
                  key={`${person.id}:${person.fridgeIds.join(',')}`}
                  user={person}
                  fridges={fridges.data.items}
                  onNotice={setNotice}
                  onSaved={users.reload}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t('users.confirm.title')}
        closeLabel={t('core.action.cancel')}
        hideClose
        actions={
          <>
            <Button loading={saving} onClick={() => void confirmRole()}>
              {t('users.confirm.yes')}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t('core.action.cancel')}
            </Button>
          </>
        }
      >
        {pending ? (
          <p>
            {t('users.confirm.body', {
              phone: pending.user.phone,
              from: roleName(pending.user.role),
              to: roleName(pending.role),
            })}
          </p>
        ) : null}
      </Dialog>
    </AdminOnly>
  );
}
