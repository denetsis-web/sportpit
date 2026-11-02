import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  // ---- navigare ----
  'nav.packages': 'Pachete',
  'admin.nav.packages': 'Pachete și prețuri',
  'admin.nav.promos': 'Coduri promoționale',
  'admin.nav.refunds': 'Rambursări',

  // ---- ecranul „Pachete” ----
  title: 'Pachete de boxuri',
  lead: 'Pachete preplătite: plătiți o singură dată, banii nu se retrag singuri. Creditele sunt valabile 45 de zile, un credit este egal cu un box.',
  loadError: 'Nu am putut încărca pachetele.',
  'balance.title': 'Creditele dvs.',
  'balance.value': 'Credite disponibile: {count}',
  'balance.empty': 'Încă nu aveți credite. Alegeți un pachet mai jos.',
  'balance.lot': 'Expiră la {date}: {count}',
  'balance.lotsLabel': 'Termenul de valabilitate al creditelor',
  'carryover.hint':
    'Dacă v-au expirat credite, la cumpărarea unui pachet nou până la 4 dintre ele se transferă în el (expirate în ultimele 45 de zile).',

  'package.single': 'Un singur box',
  'package.title': 'Pachet: {count}',
  'package.boxes': 'Boxuri: {count}',
  'package.perBox': 'Pe box: {price}',
  'package.total': 'Total: {price}',
  'package.totalWithDiscount': 'Total cu reducere: {price}',
  'package.validity': 'Valabil {days} zile de la plată',
  'package.buy': 'Cumpără',
  'package.buyLabel': 'Cumpără: {name}',
  'package.choose': 'Alege',
  'package.selected': 'Ales',
  'packages.none': 'Pachetele vor apărea în curând.',

  'method.label': 'Metoda de plată',
  'method.card': 'Card bancar',
  'method.mia': 'MIA',
  'method.note':
    'Datele cardului se introduc doar pe pagina gateway-ului de plată: aplicația nu le primește și nu le păstrează.',

  'promo.label': 'Cod promoțional',
  'promo.hint': 'Dacă aveți un cod promoțional, introduceți-l înainte de plată.',
  'promo.apply': 'Aplică',
  'promo.applied': 'Codul {code} a fost aplicat: reducere {price}.',
  'promo.appliedNoPackage':
    'Codul {code} a fost acceptat. Alegeți un pachet ca să vedeți reducerea.',
  'promo.freeCredits': 'Codul {code}: în cont au fost adăugate credite — {count}.',
  'promo.remove': 'Elimină codul',

  'purchase.starting': 'Pregătim plata…',
  'purchase.failed': 'Nu am putut începe plata.',
  'history.title': 'Ultimele achiziții',
  'history.empty': 'Încă nu aveți achiziții.',
  'history.item': 'Achiziția nr. {id}: boxuri {count}, {price}',
  'history.open': 'Deschide achiziția nr. {id}',

  'status.pending': 'Așteptăm plata',
  'status.paid': 'Plătit',
  'status.failed': 'Neplătit',

  // ---- ecranul de plată ----
  'pay.title': 'Plata',
  'pay.loadError': 'Nu am putut afla starea plății.',
  'pay.summary': 'Pachet: boxuri {count}, de plată {price}.',
  'pay.pending.title': 'Așteptăm confirmarea plății',
  'pay.pending.body':
    'Pagina se va actualiza singură când răspunde banca. Nu este nevoie să o închideți.',
  'pay.pending.continue': 'Mergi la pagina de plată',
  'pay.cancel': 'Anulează plata',
  'pay.paid.title': 'Plata a reușit',
  'pay.paid.body': 'Credite adăugate: {count}. Sunt valabile până la {date}.',
  'pay.paid.carried': 'Transferate din creditele expirate: {count}.',
  'pay.failed.title': 'Plata nu a reușit',
  'pay.failed.declined':
    'Banca a respins plata. Banii nu au fost retrași, creditele nu au fost adăugate.',
  'pay.failed.cancelled':
    'Plata a fost anulată. Banii nu au fost retrași, creditele nu au fost adăugate.',
  'pay.failed.expired': 'Timpul de așteptare a plății a expirat. Creditele nu au fost adăugate.',
  'pay.failed.error':
    'Serviciul de plată nu este disponibil momentan. Banii nu au fost retrași, încercați din nou.',
  'pay.failed.reason': 'Răspunsul gateway-ului: {reason}',
  'pay.retry': 'Repetă plata',
  'pay.toPackages': 'La pachete',
  'pay.toMenu': 'Alege felurile',

  'stub.title': 'Plata (pagină de test a gateway-ului)',
  'stub.note':
    'Aceasta este o pagină de test a gateway-ului de plată. Plata reală cu cardul sau MIA se conectează mai târziu; datele cardului nu sunt necesare aici.',
  'stub.amount': 'De plată: {price}',
  'stub.pay': 'Plătește',
  'stub.decline': 'Respinge',
  'stub.unavailable': 'Pagina de test nu este disponibilă: este conectat gateway-ul real de plată.',
  'stub.done': 'Răspunsul gateway-ului a fost primit.',

  // ---- administrare: pachete ----
  'admin.packages.title': 'Pachete și prețuri',
  'admin.packages.lead':
    'Modificările sunt vizibile clienților imediat. Pachetele deja cumpărate păstrează prețul de achiziție.',
  'admin.packages.boxes': 'Boxuri în pachet',
  'admin.packages.price': 'Preț pe box, lei',
  'admin.packages.priceHint': 'De exemplu 119 sau 119,50',
  'admin.packages.sort': 'Ordine',
  'admin.packages.active': 'Se vinde',
  'admin.packages.save': 'Salvează',
  'admin.packages.add': 'Adaugă pachet',
  'admin.packages.saved': 'Salvat.',
  'admin.packages.row': 'Pachet de {count} boxuri',
  'admin.packages.newTitle': 'Pachet nou',
  'admin.loadError': 'Nu am putut încărca datele.',
  'admin.saveError': 'Nu am putut salva.',

  // ---- administrare: coduri promoționale ----
  'admin.promos.title': 'Coduri promoționale',
  'admin.promos.code': 'Cod',
  'admin.promos.kind': 'Tip',
  'admin.promos.kind.percent': 'Reducere în procente',
  'admin.promos.kind.fixed': 'Reducere în sumă',
  'admin.promos.kind.free_credits': 'Credite gratuite',
  'admin.promos.value.percent': 'Procent de reducere (1–100)',
  'admin.promos.value.fixed': 'Reducere, lei',
  'admin.promos.value.free_credits': 'Număr de credite',
  'admin.promos.owner': 'Proprietar (antrenor, campanie)',
  'admin.promos.validFrom': 'Valabil de la',
  'admin.promos.validUntil': 'Valabil până la',
  'admin.promos.maxUses': 'Limită de utilizări',
  'admin.promos.maxUsesHint': 'Gol — fără limită',
  'admin.promos.oncePerUser': 'O dată pe client',
  'admin.promos.active': 'Activ',
  'admin.promos.used': 'Utilizat: {count}',
  'admin.promos.create': 'Creează cod',
  'admin.promos.created': 'Codul a fost creat.',
  'admin.promos.toggleOn': 'Activează {code}',
  'admin.promos.toggleOff': 'Dezactivează {code}',
  'admin.promos.empty': 'Încă nu există coduri promoționale.',
  'admin.promos.valueShort.percent': '{value}%',
  'admin.promos.valueShort.fixed': '{value}',
  'admin.promos.valueShort.free_credits': '{value} cr.',

  // ---- administrare: rambursări ----
  'admin.refunds.title': 'Rambursări',
  'admin.refunds.lead':
    'Rambursarea este egală cu creditele neutilizate × prețul creditului din achiziție. Creditele se scad imediat, iar gateway-ului i se trimite comanda de rambursare.',
  'admin.refunds.search': 'Căutare după telefon sau numărul achiziției',
  'admin.refunds.purchases': 'Achiziții plătite',
  'admin.refunds.purchase': 'Achiziția nr. {id}, {phone}: boxuri {count}, plătit {price}',
  'admin.refunds.unused': 'Neutilizate: {count}',
  'admin.refunds.refundable': 'De rambursat: {price}',
  'admin.refunds.refunded': 'Deja rambursat: {price}',
  'admin.refunds.open': 'Emite rambursare',
  'admin.refunds.credits': 'Câte credite se rambursează',
  'admin.refunds.creditsHint': 'Cel mult cele neutilizate',
  'admin.refunds.reason': 'Motivul rambursării',
  'admin.refunds.amount': 'Suma rambursării: {price}',
  'admin.refunds.submit': 'Rambursează banii',
  'admin.refunds.done': 'Rambursarea a fost emisă.',
  'admin.refunds.history': 'Rambursări emise',
  'admin.refunds.historyEmpty': 'Încă nu există rambursări.',
  'admin.refunds.row': 'Rambursarea nr. {id}: achiziția nr. {purchaseId}, credite {count}, {price}',
  'admin.refunds.status.pending': 'Așteaptă răspunsul gateway-ului',
  'admin.refunds.status.done': 'Efectuată',
  'admin.refunds.status.failed': 'Gateway-ul a refuzat, creditele au fost returnate clientului',
  'admin.refunds.retry': 'Repetă pentru rambursarea nr. {id}',
  'admin.refunds.none': 'Nu există achiziții potrivite.',

  // ---- erori de server ----
  'error.insufficientCredits': 'Credite insuficiente: disponibile {available}, necesare {needed}.',
  'error.orderConflict': 'Rezervarea de credite pentru această comandă este într-o altă stare.',
  'error.packageUnavailable': 'Acest pachet nu se vinde momentan.',
  'error.packageNotFound': 'Pachetul nu a fost găsit.',
  'error.purchaseNotFound': 'Achiziția nu a fost găsită.',
  'error.idempotencyConflict': 'Această cheie de achiziție a fost deja folosită pentru alt pachet.',
  'error.invalidCallback': 'Răspunsul gateway-ului de plată nu a fost acceptat.',
  'error.paymentUnknown': 'Plata nu a fost găsită încă.',
  'error.promoNotFound': 'Nu există un asemenea cod promoțional.',
  'error.promoInactive': 'Acest cod promoțional este dezactivat.',
  'error.promoNotStarted': 'Codul promoțional va fi valabil de la {date}.',
  'error.promoExpired': 'Codul promoțional a expirat la {date}.',
  'error.promoLimit': 'Codul promoțional a fost deja folosit de numărul maxim de ori.',
  'error.promoUsed': 'Ați folosit deja acest cod promoțional.',
  'error.promoFreeCredits':
    'Acesta este un cod pentru credite gratuite: apăsați „Aplică” și creditele se adaugă imediat.',
  'error.promoCodeTaken': 'Un cod promoțional cu acest nume există deja.',
  'error.promoCodeFormat': 'Codul: de la 3 până la 40 de litere latine, cifre, „-” sau „_”.',
  'error.promoValue': 'Valoarea nu se potrivește acestui tip de cod promoțional.',
  'error.promoUnlimited':
    'Creditele gratuite fără „o dată pe client” trebuie limitate prin numărul de utilizări.',
  'error.promoDates': 'Verificați datele de valabilitate ale codului promoțional.',
  'error.refundNotFound': 'Rambursarea nu a fost găsită.',
  'error.refundNotPossible': 'Pentru această achiziție rambursarea nu este posibilă.',
  'error.nothingToRefund': 'Nu există credite neutilizate, nu este nimic de rambursat.',
  'error.refundExceedsUnused':
    'Nu se pot rambursa mai multe credite decât cele neutilizate: au rămas {unused}.',
  'error.refundReason': 'Indicați motivul rambursării (cel puțin 3 caractere).',
};

export default ro;
