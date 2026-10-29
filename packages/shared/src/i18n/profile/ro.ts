import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  'nav.profile': 'Profil',
  title: 'Profil',

  // ---- chestionar ----
  'onboarding.title': 'Chestionarul obiectivului',
  'onboarding.lead':
    'Răspundeți la câteva întrebări și vom calcula necesarul de calorii și macronutrienți. Chestionarul poate fi omis și completat mai târziu în profil.',
  'onboarding.skip': 'Omite',
  'onboarding.skipHint': 'Meniul și comanda sunt disponibile și fără chestionar.',
  'onboarding.consentStep': 'Pasul 1. Acordul pentru datele despre sănătate',
  'onboarding.consentLead':
    'Parametrii corpului se salvează doar cu acordul dvs. separat. Fără el puteți vedea calculul, dar nu se salvează.',
  'onboarding.formStep': 'Pasul 2. Parametrii dvs.',
  'onboarding.resultStep': 'Necesarul dvs.',
  'onboarding.toMenu': 'La meniu',
  'onboarding.toProfile': 'La profil',
  'onboarding.loading': 'Se încarcă chestionarul…',

  'form.sex': 'Sex',
  'form.sex.female': 'Feminin',
  'form.sex.male': 'Masculin',
  'form.age': 'Vârsta, ani',
  'form.height': 'Înălțimea, cm',
  'form.weight': 'Greutatea, kg',
  'form.goal': 'Obiectiv',
  'form.goal.lose': 'Slăbire',
  'form.goal.maintain': 'Menținere',
  'form.goal.gain': 'Creștere în masă',
  'form.activity': 'Activitate',
  'form.activity.sedentary': 'Sedentar: aproape fără antrenamente',
  'form.activity.light': 'Ușoară: 1–3 antrenamente pe săptămână',
  'form.activity.moderate': 'Moderată: 3–5 antrenamente pe săptămână',
  'form.activity.active': 'Ridicată: 6–7 antrenamente pe săptămână',
  'form.condition':
    'Am diabet, sarcină sau altă afecțiune pentru care alimentația este stabilită de medic',
  'form.submit': 'Calculează necesarul',
  'form.select': 'Alegeți',
  'form.notSaved': 'Parametrii nu au fost salvați: lipsește acordul pentru datele despre sănătate.',
  'form.saved': 'Chestionarul a fost salvat.',
  'form.saveError': 'Nu am putut salva chestionarul.',
  'form.error.required': 'Completați câmpul.',
  'form.error.range': 'Introduceți un număr între {min} și {max}.',
  'form.error.integer': 'Introduceți un număr întreg.',

  // ---- necesar ----
  'targets.title': 'Necesarul dvs. zilnic',
  'targets.kcal': 'Calorii',
  'targets.protein': 'Proteine',
  'targets.fat': 'Grăsimi',
  'targets.carb': 'Carbohidrați',
  'targets.fiber': 'Fibre',
  'targets.kcalValue': '{value} kcal',
  'targets.gramsValue': '{value} g',
  'targets.proteinRange':
    'Intervalul de proteine 1,6–2,2 g la kg de greutate: {min}–{max} g pe zi.',
  'targets.floorNote': 'Minimul nivelului sigur: calculul nu coboară sub {kcal} kcal pe zi.',
  'targets.disclaimer':
    'Aceasta nu este o recomandare medicală. Necesarul este calculat după formula Mifflin-St Jeor și are caracter orientativ.',
  'targets.blocked.title': 'Adresați-vă medicului',
  'targets.blocked.medical_condition':
    'În caz de diabet, sarcină și alte afecțiuni, necesarul alimentar îl stabilește medicul, de aceea nu îl calculăm.',
  'targets.blocked.age_out_of_range':
    'Pentru vârsta sub 18 și peste 80 de ani, necesarul alimentar îl stabilește medicul, de aceea nu îl calculăm.',
  'targets.blocked.menuStays': 'Meniul și comanda boxurilor rămân disponibile.',

  // ---- profil ----
  'goal.title': 'Datele obiectivului',
  'goal.empty': 'Chestionarul nu este completat.',
  'goal.fill': 'Completează chestionarul',
  'goal.edit': 'Modifică chestionarul',
  'goal.needConsent':
    'Pentru a păstra chestionarul este nevoie de acordul pentru datele despre sănătate. Bifați-l în secțiunea „Acorduri” sau la completarea chestionarului.',
  'goal.summary': '{sex}, {age} ani, {height} cm, {weight} kg',

  'lang.title': 'Limba',
  'lang.lead': 'Limba interfeței se păstrează în profilul dvs.',

  'phone.title': 'Telefon',
  'phone.current': 'Numărul curent: {phone}',
  'phone.change': 'Schimbă numărul',
  'phone.new': 'Număr nou',
  'phone.newHint': 'Format +373XXXXXXXX. Pe el va veni codul din SMS.',
  'phone.sendCode': 'Primește codul',
  'phone.code': 'Codul din SMS',
  'phone.sent': 'Am trimis codul la {phone}. Numărul se schimbă după confirmare.',
  'phone.confirm': 'Confirmă',
  'phone.cancel': 'Anulează',
  'phone.changed': 'Numărul a fost schimbat: {phone}.',

  'consents.title': 'Acorduri',
  'consents.lead':
    'Condițiile, politica și acordul pentru datele despre sănătate pot fi revăzute aici.',
  'consents.healthRevoked':
    'Acordul pentru datele despre sănătate a fost retras, chestionarul salvat a fost șters.',

  'export.title': 'Datele mele',
  'export.lead': 'Fișier JSON cu profilul, acordurile, comenzile și evaluările dvs.',
  'export.action': 'Descarcă datele',
  'export.done': 'Fișierul este pregătit.',
  'export.fileName': 'sportpit-datele-mele.json',

  'delete.title': 'Ștergerea contului',
  'delete.lead':
    'Telefonul și chestionarul vor fi șterse, sesiunile închise. Comenzile și jurnalul de credite rămân fără legătură cu dvs.',
  'delete.action': 'Șterge contul',
  'delete.confirmTitle': 'Ștergeți contul?',
  'delete.confirmBody':
    'Acțiunea nu poate fi anulată. O nouă autentificare cu acest număr creează un cont nou, gol.',
  'delete.confirm': 'Da, șterge',
  'delete.done': 'Contul a fost șters.',

  'error.confirmRequired': 'Confirmați ștergerea contului.',
  'error.phoneSame': 'Acesta este numărul dvs. curent.',
  'error.loadFailed': 'Nu am putut încărca profilul.',
};

export default ro;
