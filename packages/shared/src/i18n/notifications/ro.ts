import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  title: 'Notificări',
  'nav.label': 'Notificări',
  'bell.label': 'Notificări',
  'bell.labelUnread': 'Notificări, necitite: {count}',
  empty: 'Nu aveți încă notificări.',
  loadError: 'Nu am putut încărca notificările.',
  markRead: 'Marchează ca citită',
  markAll: 'Citește-le pe toate',
  open: 'Deschide',
  unread: 'Nou',
  'unread.summary': 'Necitite: {count}',

  'type.credits_expiring.title': 'Creditele expiră în curând',
  'type.credits_expiring.body':
    'Verificați valabilitatea pachetelor și comandați boxurile din timp.',
  'type.credits_expiring.detail': 'Credite care expiră: {count}',
  'type.rate_dish.title': 'Cum a fost preparatul?',
  'type.rate_dish.body': 'Evaluați preparatul din comanda dvs.',
  'type.complaint_resolved.title': 'Reclamația a fost examinată',
  'type.complaint_resolved.body': 'S-a luat o decizie cu privire la solicitarea dvs.',
  'type.system_alert.title': 'Defecțiuni în sistem',
  'type.system_alert.body': 'În ultima oră: {count} defecțiuni. Sursa: {kind}.',
  'alert.kind.sms_failed': 'trimiterea SMS',
  'alert.kind.payment_failed': 'plata',
};

export default ro;
