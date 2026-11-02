import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  // ---- erori de server ----
  'error.date': 'Data trebuie să fie în formatul AAAA-LL-ZZ.',
  'error.page': 'Numărul paginii este un număr întreg de la 1.',
  'error.range': 'Perioada este indicată greșit: începutul nu e după sfârșit, cel mult un an.',
  'error.kind': 'Un astfel de raport nu există.',

  // ---- meniul administrării ----
  'nav.reports': 'Rapoarte',
  'nav.events': 'Evenimentele sistemului',

  // ---- rapoarte: general ----
  title: 'Rapoarte',
  lead: 'Vânzări, ridicări și casări, clasamentul felurilor, cota sălii, clienți activi și pierderea clienților pentru perioada aleasă. Se iau în calcul boxurile ridicate de clienți.',
  'period.from': 'De la',
  'period.to': 'Până la',
  'period.apply': 'Arată',
  'period.shown': 'Perioada: {from} — {to}',
  'tabs.label': 'Tipul raportului',
  'tab.sales': 'Vânzări',
  'tab.waste': 'Ridicate și casate',
  'tab.ratings': 'Clasamentul felurilor',
  'tab.share': 'Cota sălii',
  'tab.retention': 'Clienți și pierderi',
  download: 'Descarcă pentru Excel (CSV)',
  loadError: 'Nu am putut încărca raportul.',
  empty: 'Pentru această perioadă nu sunt date.',
  'table.total': 'Total',
  'page.label': 'Paginile tabelului',
  'page.prev': 'Înapoi',
  'page.next': 'Înainte',
  'page.of': 'Pagina {page} din {pages}',
  'chart.noData': 'Nu sunt date pentru grafic.',

  // ---- vânzări ----
  'sales.lead':
    'Venitul se calculează după boxurile ridicate: prețul creditului din lot la momentul ridicării. Boxurile neridicate, casate și anulate nu intră.',
  'sales.totals': 'Boxuri ridicate: {boxes}, comenzi: {orders}. Venit: {revenue}.',
  'sales.col.gym': 'Sala',
  'sales.col.package': 'Pachet',
  'sales.col.boxes': 'Boxuri',
  'sales.col.revenue': 'Venit',
  'sales.package': '{count} boxuri',
  'sales.noPackage': 'Fără pachet',
  'sales.chart': 'Venit pe zile',
  'sales.purchases.title': 'Pachete vândute în perioadă',
  'sales.purchases.row': 'Pachet de {boxes}: plătite {count}, în sumă de {total}',
  'sales.purchases.empty': 'În perioadă nu s-au vândut pachete.',

  // ---- ridicate și casate ----
  'waste.lead':
    'Procentul de casări = casat ÷ preparat × 100. În casat intră boxurile neridicate și boxurile în plus, fără comandă.',
  'waste.totals':
    'Preparat: {cooked}, ridicat: {delivered}, casat: {writtenOff}, casări: {percent}.',
  'waste.col.dish': 'Felul',
  'waste.col.cooked': 'Preparat',
  'waste.col.delivered': 'Ridicat',
  'waste.col.writtenOff': 'Casat',
  'waste.col.percent': 'Casări',
  'waste.noDish': 'Box în plus, fără comandă',
  'waste.chart': 'Ridicat și casat pe zile',
  'waste.legend.delivered': 'Ridicat',
  'waste.legend.writtenOff': 'Casat',
  'waste.byFridge.title': 'Pe frigidere',
  'waste.byFridge.row':
    '{gym}, {fridge}: preparat {cooked}, ridicat {delivered}, casat {writtenOff} ({percent})',
  'waste.byFridge.reserve': 'Rezerva pentru defecte: preparat {cooked}',
  'waste.byReason.title': 'Motivele casării',
  'waste.byReason.row': '{reason}: {qty}',
  'waste.percent.none': 'fără date',

  // ---- clasamentul felurilor ----
  'ratings.lead':
    'Notele puse în perioadă. Alături este ratingul felului pe tot timpul, pe care clienții îl văd în meniu.',
  'ratings.totals': 'Note în perioadă: {count}, media: {avg}.',
  'ratings.col.dish': 'Felul',
  'ratings.col.count': 'Note',
  'ratings.col.avg': 'Media',
  'ratings.col.allTime': 'Pe tot timpul',
  'ratings.allTime': '{avg} ({count})',
  'ratings.chart': 'Nota medie a felurilor',

  // ---- cota sălii ----
  'share.lead':
    'Cota sălii = procentul sălii × venitul din boxurile ridicate în perioadă. Venitul unui box este prețul creditului din lot la momentul ridicării; boxurile neridicate și casate nu intră.',
  'share.totals': 'Venitul din boxurile ridicate: {revenue}. Cotele sălilor: {share}.',
  'share.col.gym': 'Sala',
  'share.col.percent': 'Procentul sălii',
  'share.col.boxes': 'Boxuri',
  'share.col.revenue': 'Venit',
  'share.col.share': 'Cota sălii',
  'share.col.formula': 'Formula',
  'share.formula': '{percent}% × {revenue} = {share}',
  'share.chart': 'Cota sălii, lei',

  // ---- clienți și pierderi ----
  'retention.lead':
    'Client activ este cel care a ridicat cel puțin o comandă în perioadă. Pierdere: clienții care au luat boxuri în perioada anterioară de aceeași lungime și nu au luat în aceasta.',
  'retention.previous': 'Perioada anterioară: {from} — {to}',
  'retention.card.active': 'Clienți activi',
  'retention.card.previousActive': 'Activi în perioada anterioară',
  'retention.card.retained': 'Au rămas',
  'retention.card.fresh': 'Noi în perioadă',
  'retention.card.churned': 'Pierderi',
  'retention.card.churnPercent': 'Ponderea pierderilor',
  'retention.col.gym': 'Sala',
  'retention.col.active': 'Activi',
  'retention.col.previous': 'În perioada anterioară',
  'retention.col.churned': 'Pierderi',
  'retention.chart': 'Clienți pe perioade',

  // ---- evenimentele sistemului ----
  'events.title': 'Evenimentele sistemului',
  'events.lead':
    'Defecțiuni la plată și SMS, erori de server și înregistrări de serviciu. Contoarele arată ultimele 24 de ore.',
  'events.loadError': 'Nu am putut încărca evenimentele.',
  'events.counts.title': 'În ultimele 24 de ore',
  'events.counts.row': '{kind}: {count}',
  'events.counts.none': 'În ultimele 24 de ore nu au fost evenimente.',
  'events.alert':
    'Dacă într-o oră apar {count} sau mai multe defecțiuni la plată sau SMS, administratorii primesc o notificare în clopoțel.',
  'events.missed': 'Măsurători de temperatură ratate în ultimele zile: {count}.',
  'events.missed.link': 'Deschide secțiunea «Temperatura»',
  'events.filter': 'Tipul evenimentului',
  'events.filter.all': 'Toate',
  'events.col.time': 'Ora',
  'events.col.kind': 'Tipul',
  'events.col.detail': 'Detalii',
  'events.empty': 'Nu sunt evenimente.',
  'events.kind.sms_failed': 'Defecțiune SMS',
  'events.kind.payment_failed': 'Defecțiune la plată',
  'events.kind.server_error': 'Eroare de server',
  'events.kind.job_failed': 'Defecțiune a sarcinii de fundal',
  'events.kind.backup_done': 'Copie de rezervă',
  'events.kind.temperature_out_of_range': 'Temperatură în afara normei',

  // ---- antete de coloane pentru Excel ----
  'csv.total': 'Total',
  'csv.gym': 'Sala',
  'csv.package': 'Pachet, boxuri',
  'csv.noPackage': 'Fără pachet',
  'csv.boxes': 'Boxuri ridicate',
  'csv.revenue': 'Venit, lei',
  'csv.purchasesCount': 'Pachete plătite',
  'csv.purchasesTotal': 'Sumă, lei',
  'csv.dish': 'Felul',
  'csv.noDish': 'Box în plus, fără comandă',
  'csv.cooked': 'Preparat',
  'csv.delivered': 'Ridicat',
  'csv.writtenOff': 'Casat',
  'csv.wastePercent': 'Casări, %',
  'csv.ratings': 'Note în perioadă',
  'csv.avg': 'Nota medie',
  'csv.allTimeAvg': 'Media pe tot timpul',
  'csv.allTimeCount': 'Note pe tot timpul',
  'csv.sharePercent': 'Procentul sălii, %',
  'csv.share': 'Cota sălii, lei',
  'csv.formula': 'Formula: procent × venitul din boxurile ridicate',
  'csv.formulaValue': '{percent}% × {revenue} lei = {share} lei',
  'csv.active': 'Clienți activi',
  'csv.previousActive': 'Activi în perioada anterioară',
  'csv.churned': 'Pierderi',
};

export default ro;
