import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  // ---- erori de server ----
  'error.date': 'Data trebuie să fie în formatul AAAA-LL-ZZ.',
  'error.fridge': 'Frigiderul este indicat greșit.',
  'error.fridgeNotFound': 'Frigiderul nu a fost găsit.',
  'error.orderNotFound': 'Comanda nu a fost găsită.',
  'error.slot': 'Măsurarea este de dimineață sau de seară.',
  'error.celsius': 'Introduceți temperatura ca număr între -40 și +60 °C.',
  'error.codeFormat': 'Codul are patru cifre.',
  'error.invalidCode': 'Cod greșit. Verificați cele patru cifre și data ridicării.',
  'error.reason': 'Alegeți un motiv din listă.',
  'error.qty': 'Cantitatea este un număr întreg de la 1 la 999.',
  'error.dish': 'Preparatul este indicat greșit.',
  'error.remaining': 'Stocul este un număr întreg de boxuri, de la 0.',
  'error.range': 'Perioada este indicată greșit: începutul nu după sfârșit, cel mult un an.',
  'error.loadDate': 'Frigiderul poate fi încărcat doar pentru azi și pentru mâine.',
  'error.cutoffNotPassed':
    'Primirea comenzilor pentru această dată este încă deschisă până la {time}: e prea devreme pentru încărcare, pot apărea comenzi noi.',
  'error.batchesNotCooked':
    'Nu toate preparatele sunt gata: {dishes}. Așteptați ca bucătăria să marcheze loturile ca pregătite.',
  'error.dayClosed': 'Ziua pentru acest frigider este deja închisă.',
  'error.notToday': 'Ridicarea este posibilă doar în ziua comenzii.',
  'error.notLoaded':
    'Boxul nu este încă încărcat în frigider. Ridicarea se deschide după marcajul operatorului.',
  'error.window':
    'Boxul poate fi ridicat de la {from} până la {to}. Acum fereastra de ridicare este închisă.',
  'error.alreadyPickedUp': 'Această comandă a fost deja ridicată.',
  'error.writtenOff':
    'Comanda este casată și nu poate fi ridicată. Dacă problema ține de serviciu, scrieți la suport.',
  'error.cancelled': 'Comanda este anulată.',
  'error.unknownOrder': 'Această comandă nu se află printre comenzile neridicate ale frigiderului.',
  'error.extrasMismatch':
    'Boxurile în plus fără comandă trebuie să fie exact {surplus}: suma casărilor nu coincide.',
  'error.closeDate': 'Ziua nu a sosit încă: se pot închide ziua de azi și zilele trecute.',
  'error.windowOpen':
    'Fereastra de ridicare durează până la {time}: clienții încă pot ridica boxuri. Închideți ziua mai târziu.',

  // ---- motive de casare ----
  'reason.not_picked_up': 'Neridicat',
  'reason.defect': 'Defect',
  'reason.expired': 'Expirat',
  'reason.other': 'Altele',

  // ---- măsurători de temperatură ----
  'slot.morning': 'Dimineața',
  'slot.evening': 'Seara',

  // ---- client: ridicarea boxului ----
  'nav.pickup': 'Ridică',
  'pickup.title': 'Ridicarea boxului',
  'pickup.lead':
    'Arătați codul operatorului sau spuneți-l. Butonul «Am ridicat» se deschide când boxul este încărcat și fereastra de ridicare este activă.',
  'pickup.loadError': 'Nu am putut încărca comenzile.',
  'pickup.empty': 'Pentru azi nu aveți comenzi.',
  'pickup.empty.action': 'Comenzile mele',
  'pickup.card.title': 'Comanda pentru {date}',
  'pickup.card.where': '{gym}, {fridge}',
  'pickup.card.window': 'Fereastra de ridicare: {from}–{to}',
  'pickup.card.code': 'Cod de ridicare',
  'pickup.card.qr': 'Codul QR al comenzii cu codul de ridicare {code}',
  'pickup.card.lock': 'Codul lacătului frigiderului',
  'pickup.card.lockHint': 'Introduceți-l pe lacătul frigiderului.',
  'pickup.card.items': 'Conținutul comenzii',
  'pickup.card.line': '{qty} × {name}',
  'pickup.button': 'Am ridicat',
  'pickup.buttonLabel': 'Am ridicat comanda pentru {date}',
  'pickup.done': 'Comanda a fost predată. Poftă bună!',
  'pickup.status.confirmed': 'Confirmată',
  'pickup.status.loaded': 'Încărcată în frigider',
  'pickup.status.picked_up': 'Ridicată',
  'pickup.status.written_off': 'Casată',
  'pickup.status.cancelled': 'Anulată',
  'pickup.blocked.not_today': 'Boxul poate fi ridicat în ziua comenzii.',
  'pickup.blocked.not_loaded':
    'Boxul nu este încă încărcat în frigider. Butonul apare după încărcare.',
  'pickup.blocked.before_window': 'Fereastra de ridicare nu s-a deschis încă: de la {from}.',
  'pickup.blocked.after_window': 'Fereastra de ridicare este închisă: a durat până la {to}.',
  'pickup.blocked.picked_up': 'Comanda a fost ridicată.',
  'pickup.blocked.written_off':
    'Comanda este casată. Dacă problema ține de serviciu, scrieți la suport.',
  'pickup.blocked.cancelled': 'Comanda este anulată.',

  // ---- operator ----
  'operator.nav.operator': 'Ridicare',
  'operator.nav.temperature': 'Temperatură',
  'operator.title': 'Ridicare: frigidere',
  'operator.lead': 'Ce de pus în frigider, cui de predat boxul, stocul de seară și temperatura.',
  'operator.loadError': 'Nu am putut încărca datele.',
  'operator.noFridges': 'Nu aveți niciun frigider atribuit. Adresați-vă administratorului.',
  'operator.fridge.label': 'Frigider',
  'operator.fridge.option': '{gym} · {name}',
  'operator.date.label': 'Ziua ridicării',
  'operator.window': 'Fereastra de ridicare: {from}–{to}',

  'operator.load.title': 'Ce de pus în frigider',
  'operator.load.empty': 'Pentru această dată nu sunt comenzi.',
  'operator.load.line': '{qty} × {name}',
  'operator.load.batch': 'Lot {code}: {status}',
  'operator.load.noBatch': 'Încă nu există lot: bucătăria nu a închis primirea comenzilor.',
  'operator.load.cooked': 'pregătit',
  'operator.load.notCooked': 'încă nepregătit',
  'operator.load.totals':
    'Boxuri: {boxes}, așteaptă ridicarea: {waiting}, ridicate: {pickedUp}, casate: {writtenOff}.',
  'operator.load.cutoffOpen':
    'Primirea comenzilor pentru această dată este încă deschisă: e prea devreme pentru încărcare.',
  'operator.load.blocked': 'Încă nepregătite: {dishes}.',
  'operator.load.button': 'Marchează «încărcat»',
  'operator.load.done':
    'Încărcat la {time}. Clienții pot ridica boxurile în fereastra de ridicare.',
  'operator.load.success': 'Frigiderul este marcat ca încărcat.',

  'operator.pickup.title': 'Predare după codul clientului',
  'operator.pickup.code': 'Codul clientului (4 cifre)',
  'operator.pickup.submit': 'Predă',
  'operator.pickup.ok': 'Boxuri predate: {boxes}. Comanda este marcată ca ridicată.',
  'operator.pickup.again': 'Această comandă fusese predată deja, statusul nu s-a schimbat.',
  'operator.pickup.items': 'Conținut: {items}',

  'operator.orders.title': 'Comenzile zilei',
  'operator.orders.row': 'Boxuri: {boxes} · {items}',

  'operator.close.title': 'Închiderea zilei',
  'operator.close.lead':
    'Indicați câte boxuri au rămas de fapt în frigider. Comenzile neridicate vor fi casate, creditele pentru ele nu se returnează.',
  'operator.close.remaining': 'Stoc în frigider, boxuri',
  'operator.close.reason': 'Motivul casării comenzilor neridicate',
  'operator.close.dish': 'Preparatul boxurilor în plus (fără comandă)',
  'operator.close.dish.unknown': 'Nu știu',
  'operator.close.submit': 'Închide ziua',
  'operator.close.done':
    'Ziua este închisă. Comenzi casate: {orders}, boxuri fără comandă: {extra}.',
  'operator.close.system': 'Ziua a fost închisă automat la {time}. Stocul nu a fost introdus.',
  'operator.close.byOperator': 'Ziua a fost închisă la {time}. Stoc: {remaining}.',

  'operator.temp.title': 'Temperatură',
  'operator.temp.lead': 'Două măsurători pe zi: dimineața și seara. Admis între 0 și +5 °C.',
  'operator.temp.value': 'Temperatura, °C',
  'operator.temp.slot': 'Măsurare',
  'operator.temp.save': 'Înregistrează',
  'operator.temp.saved': 'Măsurarea este înregistrată.',
  'operator.temp.warn':
    'În afara intervalului 0…+5 °C. Verificați frigiderul; înregistrarea a ajuns în evenimentele sistemului.',
  'operator.temp.row': '{slot}: {value} °C',
  'operator.temp.none': 'neintrodusă',
  'operator.temp.out': 'în afara intervalului',

  // ---- administrator: măsurători ratate ----
  'missed.title': 'Temperatură: măsurători ratate',
  'missed.lead':
    'Măsurători al căror termen a trecut, dar fără înregistrare. Cea de dimineață se așteaptă până la {morning}, cea de seară până la {evening}.',
  'missed.empty': 'Nu sunt măsurători ratate.',
  'missed.row': '{date} · {slot} · {gym}, {fridge}',
  'missed.from': 'De la',
  'missed.to': 'Până la',
  'missed.loadError': 'Nu am putut încărca măsurătorile ratate.',
};

export default ro;
