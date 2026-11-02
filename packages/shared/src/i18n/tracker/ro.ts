import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  'nav.tracker': 'Jurnal alimentar',

  'error.date': 'Indicați data în formatul AAAA-LL-ZZ.',
  'error.name': 'Introduceți denumirea (până la 100 de caractere).',
  'error.number': 'Introduceți un număr de la zero până la valoarea maximă admisă.',
  'error.empty': 'Nu există câmpuri de modificat.',
  'error.entryNotFound': 'Înregistrarea nu a fost găsită.',

  title: 'Jurnal alimentar',
  lead: 'Boxurile ridicate se adaugă singure. Ați mâncat altceva: adăugați o înregistrare manual.',
  loadError: 'Nu am putut încărca datele jurnalului.',

  'view.label': 'Perioadă',
  'view.day': 'Zi',
  'view.week': 'Săptămână',
  'date.label': 'Data',
  'date.prev': 'Precedenta',
  'date.next': 'Următoarea',
  'date.today': 'Astăzi',

  'nutrient.calories': 'Calorii',
  'nutrient.proteinG': 'Proteine',
  'nutrient.fatG': 'Grăsimi',
  'nutrient.carbsG': 'Carbohidrați',
  'nutrient.fiberG': 'Fibre',
  'unit.kcal': 'kcal',
  'unit.g': 'g',
  'value.kcal': '{value} kcal',
  'value.g': '{value} g',

  'progress.title': 'Progresul zilei',
  'progress.of': '{value} din {target}',
  'progress.label': '{name}: {value} din {target}',
  'progress.noTarget': '{name}: {value}',
  noTarget: 'Completați chestionarul de obiectiv ca să vedeți norma zilei.',
  fillProfile: 'Completează chestionarul',
  blocked: 'Pentru norma zilei adresați-vă unui medic.',

  'boxes.title': 'Boxuri ridicate',
  'boxes.none': 'În această zi nu există boxuri ridicate.',
  'boxes.line': '{name} × {count}',
  'boxes.summary': '{calories} kcal',

  'entries.title': 'Înregistrări manuale',
  'entries.none': 'Nu există înregistrări manuale.',
  'entry.add': 'Adaugă o înregistrare',
  'entry.edit': 'Modifică',
  'entry.editLabel': 'Modifică înregistrarea «{name}»',
  'entry.delete': 'Șterge',
  'entry.deleteLabel': 'Șterge înregistrarea «{name}»',
  'entry.deleteConfirm': 'Ștergeți înregistrarea «{name}»?',
  'entry.name': 'Denumire',
  'entry.calories': 'Calorii, kcal',
  'entry.proteinG': 'Proteine, g',
  'entry.fatG': 'Grăsimi, g',
  'entry.carbsG': 'Carbohidrați, g',
  'entry.fiberG': 'Fibre, g',
  'entry.save': 'Salvează',
  'entry.cancel': 'Anulează',
  'entry.saved': 'Înregistrarea a fost salvată.',
  'entry.deleted': 'Înregistrarea a fost ștearsă.',
  'entry.formTitleAdd': 'Înregistrare nouă',
  'entry.formTitleEdit': 'Modifică înregistrarea',
  'entry.invalidNumber': 'Introduceți un număr de la 0, fără minus.',
  'entry.invalidName': 'Introduceți denumirea.',

  'empty.title': 'Pentru această zi nu există încă nimic',
  'empty.body':
    'Alegeți preparate, comandați boxuri: cele ridicate se adaugă aici singure. Ați mâncat altceva: adăugați o înregistrare manual.',
  'empty.action': 'Alege preparate',

  'week.title': 'Săptămâna',
  'week.range': '{from} — {to}',
  'week.chart': 'Calorii pe zilele săptămânii',
  'week.target': 'Obiectiv: {value} kcal pe zi',
  'week.noTarget': 'Nu există obiectiv: completați chestionarul și aici va apărea norma.',
  'week.day': 'Ziua',
  'week.boxes': 'Boxuri',
  'week.entries': 'Înregistrări',
  'week.open': 'Deschide ziua {date}',
  'week.average': 'În medie pe zilele cu date: {value} kcal',
};

export default ro;
