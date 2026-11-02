import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  'nav.users': 'Utilizatori',

  title: 'Utilizatori',
  lead: 'Rolurile personalului și frigiderele operatorilor de eliberare. Persoana apare în listă după prima autentificare prin SMS.',
  empty: 'Încă nu există utilizatori.',
  loadError: 'Nu am putut încărca utilizatorii.',
  you: 'dvs.',

  'role.label': 'Rol: {phone}',
  'role.saved': 'Rolul a fost schimbat.',
  'confirm.title': 'Schimbați rolul?',
  'confirm.body': 'Utilizator {phone}: {from} → {to}. Drepturile se schimbă imediat.',
  'confirm.yes': 'Schimbă rolul',

  'fridges.legend': 'Frigiderele operatorului {phone}',
  'fridges.hint': 'Operatorul vede și deservește doar frigiderele bifate.',
  'fridges.none': 'Încă nu există frigidere: adăugați-le în secțiunea „Frigidere”.',
  'fridges.option': '{gym} · {name}',
  'fridges.unknown': 'Frigider necunoscut: {id}',
  'fridges.save': 'Salvează frigiderele: {phone}',
  'fridges.saved': 'Frigiderele au fost salvate.',
};

export default ro;
