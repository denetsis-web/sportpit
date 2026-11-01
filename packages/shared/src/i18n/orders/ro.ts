import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  'nav.orders': 'Comenzile mele',

  // ---- ecranul comenzii ----
  'order.titleTomorrow': 'Comandă pentru mâine',
  'order.titleDate': 'Comandă pentru {date}',
  'order.lead':
    'Alegeți frigiderul și data, adăugați preparatele și confirmați comanda. Boxul îl ridicați din frigiderul sălii.',
  'order.loadError': 'Nu am putut încărca datele pentru comandă.',
  'order.fridge.label': 'Frigider',
  'order.fridge.option': '{gym} · {name}',
  'order.fridge.choose': 'Alegeți frigiderul',
  'order.date.label': 'Data ridicării',
  'order.date.option': '{date}',
  'order.date.tomorrow': 'Mâine, {date}',
  'order.cutoff': 'Comenzile pentru această zi se primesc până la {time}, {date}.',

  'order.menu.title': 'Preparate',
  'order.menu.empty': 'Meniul pentru această zi nu a fost încă publicat.',
  'order.menu.later': 'Reveniți mai târziu: meniul pentru ziua aleasă va apărea.',
  'order.dish.add': 'Adaugă',
  'order.dish.addLabel': 'Adaugă în comandă: {name}',
  'order.dish.remove': 'Scoate',
  'order.dish.removeLabel': 'Scoate din comandă: {name}',
  'order.dish.inOrder': 'În comandă: {count}',
  'order.dish.soldOut': 'Epuizat',
  'order.dish.left': 'Porții rămase: {count}',

  'order.cart.title': 'Comanda dvs.',
  'order.cart.empty': 'Comanda este goală. Adăugați preparate din meniu.',
  'order.cart.boxes': 'Boxuri în comandă: {count}',
  'order.cart.line': '{qty} × {name}',

  'order.totals.title': 'Totalul KBJU al comenzii',
  'order.totals.kcal': 'Calorii',
  'order.totals.of': '{value} din {target}',
  'order.totals.noTarget': 'Completați chestionarul de obiectiv ca să vedeți norma zilei.',
  'order.totals.fillProfile': 'Completează chestionarul',
  'order.totals.blocked': 'Pentru norma zilnică adresați-vă medicului.',

  'order.credits.balance': 'Credite în cont: {count}',
  'order.credits.after': 'După comandă rămân: {count}',
  'order.credits.short': 'Nu ajung credite: sunt necesare {need}, aveți {have}.',
  'order.credits.buy': 'Cumpără un pachet',

  'order.limit': 'Pe zi se pot comanda cel mult {max} boxuri. Aveți deja comandate: {used}.',
  'order.closed.date': 'Se poate comanda doar în ajun: alegeți ziua de mâine sau o zi ulterioară.',
  'order.closed.cutoff':
    'Primirea comenzilor pentru această zi s-a închis: dura până la {time} în ajun.',
  'order.closed.paused': 'Pentru această zi pachetul este în pauză, nu se poate comanda.',
  'order.seats.none': 'Nu mai sunt locuri',
  'order.seats.left': 'Boxuri libere: {count}',

  'order.confirm': 'Confirmă comanda',
  'order.confirmMove': 'Mută comanda',
  'order.notSent':
    'Nu există conexiune, comanda nu a fost trimisă. Preparatele alese sunt păstrate, încercați din nou mai târziu.',

  'order.move.title': 'Mutarea comenzii',
  'order.move.hint':
    'Comanda veche va fi anulată, iar creditele se vor scădea din nou pentru cea nouă. Este o singură acțiune: dacă noua comandă nu trece, cea veche rămâne.',
  'order.move.notFound': 'Comanda pentru mutare nu a fost găsită sau nu mai poate fi modificată.',

  'order.done.title': 'Comandă confirmată',
  'order.done.moved': 'Comandă mutată',
  'order.done.code': 'Cod de ridicare',
  'order.done.hint':
    'Spuneți sau introduceți acest cod la ridicarea boxului. Codul este valabil o singură dată.',
  'order.done.where': '{gym} · {fridge}, {date}',
  'order.done.window': 'Ridicare: {from}–{to}',
  'order.done.my': 'Comenzile mele',
  'order.done.more': 'Comandă încă una',

  // ---- „Comenzile mele” ----
  'my.title': 'Comenzile mele',
  'my.loadError': 'Nu am putut încărca comenzile.',
  'my.upcoming': 'Viitoare',
  'my.past': 'Trecute',
  'my.noUpcoming': 'Nu aveți comenzi viitoare.',
  'my.noPast': 'Nu aveți comenzi trecute.',
  'my.empty.title': 'Încă nu aveți comenzi',
  'my.empty.body': 'Alegeți preparatele pentru mâine, iar comanda va apărea aici.',
  'my.empty.action': 'Alege preparate',
  'my.card.title': 'Comandă pentru {date}',
  'my.card.where': '{gym} · {fridge}',
  'my.card.window': 'Ridicare: {from}–{to}',
  'my.card.code': 'Cod de ridicare',
  'my.changeUntil': 'Puteți anula sau muta comanda până la {time}, {date}.',
  'my.changeClosed': 'Termenul de anulare și mutare a trecut.',
  'my.cancel': 'Anulează',
  'my.cancelLabel': 'Anulează comanda pentru {date}',
  'my.move': 'Mută',
  'my.moveLabel': 'Mută comanda pentru {date}',
  'my.cancel.title': 'Anulați comanda?',
  'my.cancel.body': 'Creditele se întorc în cont: {count}.',
  'my.cancel.yes': 'Da, anulează',
  'my.cancel.keep': 'Nu anula',
  'my.cancelled': 'Comanda a fost anulată, creditele s-au întors în cont.',
  'status.confirmed': 'Confirmată',
  'status.loaded': 'Este în frigider',
  'status.picked_up': 'Ridicată',
  'status.written_off': 'Casată',
  'status.cancelled': 'Anulată',

  // ---- pauza pachetului ----
  'pause.title': 'Pauza pachetului',
  'pause.lead':
    'Pachetul poate fi pus în pauză până la 14 zile, o singură dată: termenul creditelor se mută cu zilele de pauză. Cât timp există comenzi confirmate pentru aceste zile, pauza nu este disponibilă.',
  'pause.none': 'Nu există pachete cu credite care pot fi puse în pauză.',
  'pause.lot': 'Credite: {count}, valabile până la {date}',
  'pause.from': 'Prima zi de pauză',
  'pause.days': 'Zile de pauză (1–14)',
  'pause.submit': 'Pune în pauză',
  'pause.submitLabel': 'Pune în pauză pachetul valabil până la {date}',
  'pause.done': 'Pauză de la {from} până la {until}. Noul termen al creditelor: {date}.',
  'pause.active':
    'Pauză de la {from} până la {until}, creditele sunt valabile acum până la {date}.',

  // ---- erori de validare ----
  'error.fridge': 'Alegeți frigiderul.',
  'error.date': 'Indicați data.',
  'error.dish': 'Preparat incorect.',
  'error.qty': 'Numărul de porții este de la 1 la 10.',
  'error.empty': 'Adăugați în comandă de la 1 la 10 preparate.',
  'error.key': 'Nu am putut pregăti comanda. Reîncărcați pagina și încercați din nou.',
  'error.pauseLot': 'Alegeți pachetul.',
  'error.pauseDays': 'Pauza este de la 1 la 14 zile.',

  // ---- refuzuri ale serverului ----
  'error.fridgeUnavailable': 'Acest frigider nu este disponibil acum.',
  'error.dateNotFuture':
    'Se poate comanda doar în ajun: alegeți ziua de mâine sau o zi ulterioară.',
  'error.cutoffPassed':
    'Primirea comenzilor pentru această zi s-a închis: dura până la {time} în ajun.',
  'error.dishUnavailable': 'Preparatul „{dish}” nu este în meniu în ziua aleasă.',
  'error.dishSoldOut': 'Nu au ajuns porții din preparatul „{dish}”. Comanda nu a fost creată.',
  'error.noSeats': 'Nu mai sunt locuri: boxuri libere {left}.',
  'error.boxLimit': 'Pe zi se pot comanda cel mult {max} boxuri. Deja comandate: {used}.',
  'error.pausedDay': 'Pentru această zi pachetul este în pauză, nu se poate comanda.',
  'error.orderNotFound': 'Comanda nu a fost găsită.',
  'error.cancelCutoff': 'Comanda poate fi anulată sau mutată doar până la {time} în ajun.',
  'error.notChangeable': 'Această comandă nu mai poate fi modificată.',
  'error.transition': 'Statutul comenzii nu poate fi schimbat astfel.',
  'error.codeUnavailable': 'Nu am putut emite codul de ridicare. Încercați din nou.',
  'error.pauseLotNotFound': 'Pachetul nu a fost găsit.',
  'error.pauseUsed': 'Pauza pentru acest pachet a fost deja folosită.',
  'error.pauseHasOrders':
    'Pentru zilele de pauză există comenzi confirmate. Anulați-le sau alegeți alte zile.',
  'error.pauseExpired': 'Termenul acestui pachet a expirat sau nu au mai rămas credite.',
  'error.pauseStart':
    'Pauza începe nu mai devreme de ziua de azi și nu după sfârșitul termenului pachetului.',
};

export default ro;
