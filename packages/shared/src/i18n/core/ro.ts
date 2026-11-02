import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  appName: 'SportPit',
  slogan: 'Gustos. Proaspăt. Exact pe calorii și macro',
  skipToContent: 'Treci la conținutul principal',
  loading: 'Se încarcă…',

  'nav.label': 'Navigare principală',
  'nav.home': 'Acasă',

  'language.label': 'Limba',
  'language.ru': 'Русский',
  'language.ro': 'Română',
  'language.switchTo': 'Schimbă limba: {language}',
  'language.chooseTitle': 'Выберите язык · Alegeți limba',
  'language.short.ru': 'RU',
  'language.short.ro': 'RO',

  'theme.label': 'Tema aplicației',
  'theme.system': 'Ca în sistem',
  'theme.light': 'Luminoasă',
  'theme.dark': 'Întunecată',

  'offline.banner':
    'Fără conexiune. Afișăm datele salvate; comanda nu poate fi trimisă fără internet.',

  'install.title': 'Instalați aplicația',
  'install.androidBody':
    'Adăugați SportPit pe ecranul principal: aplicația se deschide mai repede și funcționează și fără internet.',
  'install.iosBody': 'Apăsați «Distribuie» în Safari și alegeți «Adaugă pe ecranul principal».',
  'install.action': 'Instalează',
  'install.dismiss': 'Nu acum',
  'install.gotIt': 'Am înțeles',

  'home.welcome': 'Bun venit',
  'home.lead':
    'Aici comandați boxuri echilibrate, cu calorii și macro exacte, și le ridicați din frigiderul sălii dvs.',
  'home.sections': 'Secțiunile aplicației',
  'home.login': 'Autentificare',
  'home.loginHint':
    'Cu numărul de telefon și codul din SMS: este necesară pentru a comanda boxuri.',
  'home.menu': 'Feluri cu calorii și macro, compoziție și alergeni.',
  'home.packages': 'Pachete de boxuri și plata.',
  'home.orders': 'Comenzile dvs., mutare și anulare până la termen.',
  'home.pickup': 'Ce și când ridicați din frigider.',
  'home.tracker': 'Ce ați mâncat pe zi și pe săptămână, față de norma dvs.',
  'home.profile': 'Chestionar, norma nutrițională, limba și acorduri.',
  'home.support': 'Reclamație despre un box și răspunsurile suportului.',
  'home.admin': 'Bucătărie, eliberare și administrare.',

  'notFound.title': 'Pagina nu a fost găsită',
  'notFound.body': 'Această pagină nu există. Reveniți la pagina principală.',
  'notFound.home': 'Acasă',

  'noAccess.title': 'Acces interzis',
  'noAccess.body': 'Nu aveți drepturi pentru a vedea această secțiune.',

  'admin.title': 'Administrare',
  'admin.nav.label': 'Navigare administrare',
  'admin.empty': 'Deocamdată nu există secțiuni.',

  'action.retry': 'Încearcă din nou',
  'action.cancel': 'Anulează',
  'action.confirm': 'Confirmă',
  'action.close': 'Închide',
  'action.back': 'Înapoi',

  'error.generic': 'Ceva nu a mers bine. Încercați din nou.',
  'error.network': 'Fără conexiune la server. Verificați internetul și încercați din nou.',
  'error.unauthorized': 'Autentificați-vă pentru a continua.',
  'error.forbidden': 'Acces interzis.',
  'error.notFound': 'Nu a fost găsit.',
  'error.validation': 'Verificați datele introduse.',
  'error.rateLimited': 'Prea des. Așteptați {seconds} sec.',
  'error.badRequest': 'Cerere respinsă.',
};

export default ro;
