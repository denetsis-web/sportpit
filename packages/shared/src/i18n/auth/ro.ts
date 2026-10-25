import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  title: 'Autentificare',
  'nav.account': 'Cont',

  'phone.label': 'Număr de telefon',
  'phone.hint': 'Format +373XXXXXXXX',
  'code.label': 'Codul din SMS',
  'code.hint': '6 cifre, valabil 5 minute',
  'code.sent': 'Am trimis codul la {phone}.',

  'action.sendCode': 'Primește codul',
  'action.resend': 'Trimite codul din nou',
  'action.changePhone': 'Schimbă numărul',
  'action.verify': 'Intră',
  'action.logout': 'Ieșire',

  'account.title': 'Cont',
  'account.signedInAs': 'Sunteți autentificat ca {phone}',
  'account.role': 'Rol: {role}',
  'account.loading': 'Verificăm autentificarea…',

  'role.client': 'client',
  'role.kitchen': 'bucătărie',
  'role.operator': 'operator de eliberare',
  'role.admin': 'administrator',

  'error.phone': 'Introduceți numărul în formatul +373XXXXXXXX.',
  'error.codeFormat': 'Codul are 6 cifre.',
  'error.codeWrong': 'Cod greșit. Încercări rămase: {attemptsLeft}.',
  'error.codeExpired': 'Codul nu a fost găsit sau a expirat. Cereți unul nou.',
  'error.codeAttempts': 'Prea multe încercări greșite. Cereți un cod nou.',
  'error.rateLimited': 'Codul a fost deja cerut, așteptați {seconds} sec și încercați din nou.',
  'error.smsFailed': 'Nu am putut trimite codul, încercați din nou',
  'error.consentRequired': 'Este nevoie de acordul dvs. Bifați-l și repetați.',
  'error.consentVersion': 'Textul acordului s-a schimbat. Deschideți-l din nou și confirmați.',
  'error.userNotFound': 'Utilizatorul nu a fost găsit.',
  'error.ownRole': 'Nu vă puteți schimba propriul rol: rugați alt administrator.',
  'error.phoneTaken': 'Acest număr aparține deja altui cont.',

  'sms.text': 'SportPit: codul de autentificare {code}. Valabil 5 minute. Nu îl spuneți nimănui.',

  'consent.title': 'Acorduri',
  'consent.lead': 'Bifați acordurile separat. Le puteți retrage în profil.',
  'consent.terms.label': 'Accept condițiile de utilizare',
  'consent.terms.text':
    '[ВПИШИ] Textul condițiilor de utilizare: prestator, comandă, plată și rambursare.',
  'consent.privacy.label': 'Accept politica de confidențialitate',
  'consent.privacy.text':
    '[ВПИШИ] Textul politicii de confidențialitate: operatorul de date, scopuri, termene, drepturile persoanei.',
  'consent.health_data.label':
    'Îmi dau acordul separat pentru prelucrarea datelor despre sănătate (sex, vârstă, înălțime, greutate, obiectiv)',
  'consent.health_data.text':
    '[ВПИШИ] Textul acordului pentru prelucrarea datelor despre sănătate în vederea calculării necesarului de calorii și macro.',
  'consent.version': 'Versiunea textului: {version}',
  'consent.decided': 'Decizie din {date}',
  'consent.save': 'Continuă',
  'consent.saveError': 'Nu am putut salva acordurile.',
  'consent.needed': 'Bifați condițiile și politica pentru a continua.',

  'admin.menu.label': 'Secțiunile administrării',
  'admin.home.lead': 'Alegeți o secțiune.',
  'admin.home.empty': 'Pentru rolul dvs. nu există încă secțiuni.',
  'admin.home.loginNeeded': 'Autentificați-vă pentru a deschide administrarea.',
  'admin.home.goLogin': 'Mergi la autentificare',
};

export default ro;
