import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  'nav.kitchen': 'Bucătărie',

  // ---- centralizator ----
  title: 'Bucătărie: ce de pregătit',
  lead: 'Comenzile pentru ziua aleasă pe preparate și pe frigidere. După termenul de primire a comenzilor centralizatorul se fixează și nu se mai schimbă.',
  loadError: 'Nu am putut încărca centralizatorul.',
  'date.label': 'Ziua ridicării',
  'state.open':
    'Primirea comenzilor este deschisă: centralizatorul se recalculează la fiecare comandă sau anulare.',
  'state.partial':
    'Primirea nu este închisă în toate frigiderele: loturile apar când se închid toate.',
  'state.closed': 'Primirea comenzilor este închisă, centralizatorul este fixat.',
  'buffer.note':
    'Rezervă pentru rebut: {percent}% (se schimbă în setări). Este adăugată la plan pe un rând separat și nu intră în comenzi.',
  empty: 'Pentru această zi nu sunt comenzi.',

  'dishes.title': 'Pe preparate',
  'dishes.dish': 'Preparat',
  'dishes.planned': 'După comenzi',
  'dishes.buffer': 'Rezervă',
  'dishes.total': 'De pregătit',
  'dishes.batch': 'Lot',
  'dishes.fridges': 'Pe frigidere',
  'dishes.fridgeQty': '{name}: {count}',
  'dishes.noBatch': 'Lotul apare după închiderea primirii comenzilor.',
  'totals.row': 'Total: după comenzi {planned}, rezervă {buffer}, de pregătit {total}.',

  'fridges.title': 'Pe frigidere',
  'fridges.row': '{gym} · {name}',
  'fridges.boxes': 'Porții: {count}',
  'fridges.open': 'Primire deschisă până la {time}',
  'fridges.closed': 'Închis la {time}',

  // ---- loturi ----
  'batch.code': 'Cod lot: {code}',
  'batch.status.planned': 'Planificat',
  'batch.status.confirmed': 'Producție confirmată',
  'batch.status.cooked': 'Pregătit',
  'batch.qty': 'Porții în lot: {count}',
  'batch.confirm': 'Confirmă producția',
  'batch.confirmLabel': 'Confirmă producția: {name}',
  'batch.cooked': 'Marchează ca pregătit',
  'batch.cookedLabel': 'Marchează ca pregătit: {name}',
  'batch.cookedAt': 'Pregătit: {time}',
  'batch.eatBy': 'De consumat până la: {time}',
  'batch.print': 'Tipărește etichetele',
  'batch.printLabel': 'Tipărește etichetele: {name}',
  'batch.done': 'Gata.',

  // ---- tipărirea etichetelor ----
  'label.title': 'Etichetele lotului {code}',
  'label.copies': 'Câte etichete',
  'label.copies.hint': 'Implicit — câte porții are lotul.',
  'label.size': 'Dimensiunea etichetei: {width}×{height} mm (se schimbă în setări).',
  'label.print': 'Tipărește',
  'label.back': 'Înapoi la centralizator',
  'label.loadError': 'Nu am putut încărca datele etichetei.',
  'label.kcal': 'kcal',
  'label.protein': 'P',
  'label.fat': 'G',
  'label.carbs': 'C',
  'label.fiber': 'Fibre',
  'label.perServing': 'într-o porție de {weight} g',
  'label.composition': 'Compoziție',
  'label.allergens': 'Alergeni',
  'label.allergensNone': 'nu sunt',
  'label.cooked': 'Preparat',
  'label.eatBy': 'De consumat până la',
  'label.batch': 'Lot',

  // ---- erori de server ----
  'error.date': 'Data trebuie să fie în formatul AAAA-LL-ZZ.',
  'error.range': 'Perioada este greșită: începutul nu după sfârșit, cel mult un an.',
  'error.batchNotFound': 'Lotul nu a fost găsit.',
  'error.notConfirmed': 'Mai întâi confirmați producția lotului.',
  'error.alreadyCooked': 'Lotul este deja pregătit.',
  'error.notCooked': 'Etichetele se tipăresc după ce lotul este marcat ca pregătit.',
};

export default ro;
