import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  // ---- erori de server ----
  'error.consent': 'Fără acordul pentru prelucrarea datelor nu te putem adăuga pe listă.',
  'error.waitlistLimit': 'Prea multe încercări de înscriere. Încearcă mai târziu.',
  'error.notFound': 'O astfel de înregistrare nu există.',
  'error.date': 'Data trebuie să fie în formatul AAAA-LL-ZZ.',
  'error.page': 'Numărul paginii este un număr întreg de la 1.',
  'error.range': 'Perioada este indicată greșit: începutul nu poate fi după sfârșit.',

  // ---- meniul administrării ----
  'nav.waitlist': 'Lista de așteptare',
  'nav.funnel': 'Pâlnia',

  // ---- dicționare de valori ----
  'goal.lose': 'Slăbire',
  'goal.maintain': 'Menținere',
  'goal.gain': 'Creștere în masă',
  'lang.ru': 'Rusă',
  'lang.ro': 'Română',
  'source.gym': 'QR sau afiș în sală',
  'source.trainer': 'Antrenor',
  'source.tg': 'Telegram',
  'source.ig': 'Instagram',
  'source.direct': 'Acces direct',
  'source.other': 'Altele',

  // ---- lista de așteptare: pagina ----
  'waitlist.title': 'Lista de așteptare',
  'waitlist.lead':
    'Persoanele care și-au lăsat telefonul pe site cât timp nu există frigidere. Datele sunt vizibile doar administratorului.',
  'waitlist.total': 'Înregistrări: {total}',
  'waitlist.page': 'Pagina {page} din {pages}',
  'waitlist.prev': 'Înapoi',
  'waitlist.next': 'Înainte',

  // ---- lista de așteptare: filtre ----
  'waitlist.filter.label': 'Filtrele listei',
  'waitlist.filter.q': 'Număr sau nume',
  'waitlist.filter.gym': 'Sală sau sector',
  'waitlist.filter.goal': 'Obiectiv',
  'waitlist.filter.lang': 'Limba',
  'waitlist.filter.source': 'Sursa',
  'waitlist.filter.from': 'De la',
  'waitlist.filter.to': 'Până la',
  'waitlist.filter.any': 'Oricare',
  'waitlist.filter.apply': 'Arată',
  'waitlist.filter.reset': 'Resetează',

  // ---- lista de așteptare: coloane ----
  'waitlist.col.createdAt': 'Când',
  'waitlist.col.phone': 'Telefon',
  'waitlist.col.name': 'Nume',
  'waitlist.col.gym': 'Sală sau sector',
  'waitlist.col.goal': 'Obiectiv',
  'waitlist.col.lang': 'Limba',
  'waitlist.col.source': 'Sursa',
  'waitlist.col.ref': 'Marcaj (ref)',
  'waitlist.col.campaign': 'Campania',
  'waitlist.col.path': 'Parcurs',
  'waitlist.col.actions': 'Acțiuni',
  'waitlist.empty.value': '—',

  // ---- semne de parcurs ----
  'waitlist.path.usedCalc': 'A calculat necesarul',
  'waitlist.path.signedUp': 'S-a înregistrat',
  'waitlist.path.purchased': 'A cumpărat un pachet',
  'waitlist.path.none': 'Fără date: persoana nu a acceptat analitica',
  'waitlist.path.hint':
    'Semnele se văd doar la cei care au acceptat analitica: după numărul anonim al browserului.',

  // ---- lista de așteptare: stări ----
  'waitlist.empty': 'Lista de așteptare este încă goală.',
  'waitlist.emptyFiltered': 'Nu am găsit pe nimeni după aceste condiții.',
  'waitlist.loadError': 'Nu am putut încărca lista de așteptare.',
  'waitlist.retry': 'Încearcă din nou',

  // ---- export ----
  'waitlist.download': 'Descarcă pentru Excel (CSV)',
  'waitlist.csvNote':
    'În fișier, înaintea telefonului apare un apostrof. Este necesar ca Excel să nu ia numărul drept formulă și nu face parte din număr.',

  // ---- ștergerea unei înregistrări ----
  'waitlist.delete': 'Șterge',
  'waitlist.delete.row': 'Șterge înregistrarea {phone}',
  'waitlist.delete.title': 'Ștergi înregistrarea?',
  'waitlist.delete.text':
    'Înregistrarea {phone} va fi ștearsă fără posibilitate de recuperare. Acțiunea va fi trecută în jurnalul acțiunilor administratorului.',
  'waitlist.delete.confirm': 'Șterge înregistrarea',
  'waitlist.delete.cancel': 'Nu șterge',
  'waitlist.delete.done': 'Înregistrarea a fost ștearsă.',
  'waitlist.delete.error': 'Nu am putut șterge înregistrarea.',

  // ---- pâlnia: pagina ----
  'funnel.title': 'Pâlnia',
  'funnel.lead':
    'Câți oameni au ajuns de la vizionarea site-ului până la prima achiziție, pe surse. Fără contoare externe și fără cookie-uri.',
  'funnel.period.from': 'De la',
  'funnel.period.to': 'Până la',
  'funnel.period.apply': 'Arată',
  'funnel.period.shown': 'Perioada: {from} — {to}',

  // ---- pâlnia: coloane și etape ----
  'funnel.col.source': 'Sursa',
  'funnel.col.landingViews': 'Vizionări ale site-ului',
  'funnel.col.calcUsed': 'Au calculat necesarul',
  'funnel.col.waitlistJoins': 'S-au înscris pe listă',
  'funnel.col.signups': 'S-au înregistrat',
  'funnel.col.firstPurchases': 'Prima achiziție',
  'funnel.row.total': 'Total',
  'funnel.conv.title': 'Pondere din pasul anterior',
  'funnel.conv.value': '{percent} %',
  'funnel.conv.none': '—',

  // ---- pâlnia: persoane unice ----
  'funnel.unique.title': 'Persoane unice',
  'funnel.unique.visitors': 'Vizitatori',
  'funnel.unique.calc': 'Au calculat necesarul',
  'funnel.unique.waitlist': 'S-au înscris pe listă',
  'funnel.unique.signups': 'S-au înregistrat',
  'funnel.unique.purchases': 'Au cumpărat',
  'funnel.unique.note':
    'Persoanele unice se numără după numărul anonim al browserului, iar acesta există doar la cei care au acceptat analitica. Ceilalți apar doar în contoarele generale.',
  'funnel.note.firstPurchase':
    'Prima achiziție se atribuie sursei de la care s-a înregistrat persoana; dacă nu există sursă, este „Acces direct”.',

  // ---- pâlnia: stări ----
  'funnel.empty': 'Pentru această perioadă nu există încă evenimente.',
  'funnel.loadError': 'Nu am putut încărca pâlnia.',
  'funnel.retry': 'Încearcă din nou',

  // ---- antete de coloane CSV ----
  'csv.createdAt': 'Când',
  'csv.phone': 'Telefon',
  'csv.name': 'Nume',
  'csv.gym': 'Sală sau sector',
  'csv.goal': 'Obiectiv',
  'csv.lang': 'Limba',
  'csv.source': 'Sursa',
  'csv.ref': 'Marcaj',
  'csv.campaign': 'Campania',
};

export default ro;
