// Spațiul landing: pagina publică, calculatorul de normă, formularul listei de așteptare, banner-ul de analiză,
// pagina „Politică și acorduri” și textele meta (`meta.*`, le inserează serverul în HTML).
// Textele sunt un proiect scris fără vorbitor nativ: de verificat înainte de lansare.
// Ce nu a scris proprietarul (răspunsuri, texte juridice, linkuri, acord) rămâne `[ВПИШИ]`.
import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  // ---- brand ----
  'brand.name': 'SportPit',
  'brand.tagline': 'Iubește-te prin fapte.',
  'brand.logoAlt': 'Simbolul brandului',
  'links.telegram': '[ВПИШИ]',
  'links.instagram': '[ВПИШИ]',
  'links.telegram.label': 'Telegram',
  'links.instagram.label': 'Instagram',

  // ---- meta ----
  'meta.title': 'SportPit: boxuri gata făcute, cu calorii și macro, în frigiderul sălii tale',
  'meta.description':
    'Boxuri proaspete și echilibrate, cu calorii și macro exacte, în frigiderul sălii tale din Chișinău. Precomandă, pachete de boxuri. Înscrie-te pe lista de așteptare.',
  'meta.legal.title': 'SportPit: politică și acorduri',
  'meta.legal.description':
    'Condiții, politica de confidențialitate, analiză și lista de așteptare SportPit.',

  // ---- general ----
  'skip.label': 'La conținutul principal',
  loading: 'Se încarcă…',
  retry: 'Încearcă din nou',
  'nav.label': 'Secțiunile paginii',
  'nav.how': 'Cum funcționează',
  'nav.boxes': 'Boxuri',
  'nav.faq': 'Întrebări',
  'nav.login': 'Intră',
  'cta.join': 'Înscrie-te',
  'lang.label': 'Limba paginii',
  'lang.ru.short': 'RU',
  'lang.ro.short': 'RO',
  'lang.ru.name': 'Русский',
  'lang.ro.name': 'Română',
  'lang.switchTo': 'Schimbă limba: {language}',

  // ---- primul ecran ----
  'hero.eyebrow': 'Iubirea de sine înseamnă fapte',
  'hero.title': 'Iubește-te prin fapte',
  'hero.lead':
    'Boxuri gata făcute, cu cifre exacte, în frigiderul sălii tale. Noi am numărat, tu doar mănânci.',
  'hero.ctaJoin': 'Înscrie-te pe lista de așteptare',
  'hero.ctaCalc': 'Calculează-ți norma',
  'hero.perks': 'Pe scurt, despre esențial',
  'hero.perk1': 'Cifre exacte pe fiecare box',
  'hero.perk2': 'Frigider în sala ta',
  'hero.perk3': 'Comandă din ajun, proaspăt',
  'hero.perk4': 'Pachete, nu abonament pe zi',

  // ---- cum funcționează ----
  'how.label': 'Cum funcționează',
  'how.title': 'Patru pași. Calculul e treaba noastră.',
  'how.s1.title': 'Alege boxurile',
  'how.s1.text': 'Din meniul pentru mâine și mai departe, până seara din ajun.',
  'how.s2.title': 'Plătește pachetul',
  'how.s2.text': 'Iei câte boxuri îți trebuie.',
  'how.s3.title': 'Ridică-l din sală',
  'how.s3.text': 'Din frigider, cu cod, pe drumul de la antrenament.',
  'how.s4.title': 'Mănâncă și trăiește',
  'how.s4.text': 'Cifrele sunt deja calculate, știi ce pui în tine.',

  // ---- feluri ----
  'boxes.label': 'Boxuri',
  'boxes.title': 'Alege ce ai nevoie',
  'boxes.date': 'Meniul pentru {date}',
  'boxes.list': 'Felurile din cel mai apropiat meniu',
  'boxes.weight': '{weight} g',
  'boxes.emptyTitle': 'Meniul apare curând',
  'boxes.emptyText':
    'Cel mai apropiat meniu nu este încă publicat. Revino mai târziu sau înscrie-te pe lista de așteptare.',
  'boxes.error': 'Nu am putut încărca felurile. Verifică conexiunea și încearcă din nou.',
  'macro.kcal': 'kcal',
  'macro.protein': 'proteine',
  'macro.carbs': 'carbohidr.',
  'macro.fat': 'grăsimi',
  'macro.unit': 'g',
  'photo.placeholder': 'Loc pentru fotografia reală a boxului',

  // ---- pachete ----
  'packs.label': 'Pachete',
  'packs.title': 'Plătești pentru boxuri, nu pentru abonament',
  'packs.list': 'Pachete de boxuri',
  'packs.boxes.one': 'box',
  'packs.boxes.few': 'boxuri',
  'packs.boxes.many': 'de boxuri',
  'packs.perBox': '{price} pe box',
  'packs.total': 'Total {total}',
  'packs.days.one': 'Valabil {days} zi',
  'packs.days.few': 'Valabil {days} zile',
  'packs.days.many': 'Valabil {days} de zile',
  'packs.emptyTitle': 'Prețurile apar curând',
  'packs.emptyText': 'Pachetele nu sunt încă publicate.',
  'packs.error': 'Nu am putut încărca pachetele. Verifică conexiunea și încearcă din nou.',

  // ---- banda ----
  'band.title': 'Ce pui în tine, se vede pe tine',
  'band.cta': 'Spre lista de așteptare',

  // ---- calculator ----
  'calc.label': 'Calculator de normă',
  'calc.title': 'Află-ți cifrele',
  'calc.text': 'Două minute, fără înregistrare. Îți arătăm o orientare pe zi.',
  'calc.button': 'Calculează',
  'calc.disclaimer': 'Orientativ, nu este o recomandare medicală.',

  // ---- întrebări ----
  'faq.label': 'Întrebări și răspunsuri',
  'faq.title': 'Pe scurt, despre esențial',
  'faq.q1': 'Cum comand un box?',
  'faq.q2': 'De unde vin cifrele de nutrienți?',
  'faq.q3': 'Este o recomandare medicală?',
  'faq.q4': 'Ce se întâmplă dacă nu am apucat să-l ridic?',
  'faq.a1': '[ВПИШИ]',
  'faq.a2': '[ВПИШИ]',
  'faq.a3': '[ВПИШИ]',
  'faq.a4': '[ВПИШИ]',

  // ---- lista de așteptare ----
  'join.label': 'Lista de așteptare',
  'join.title': 'Fii primul din sala ta',
  'join.text': 'Lasă telefonul: îți scriem când apare frigiderul în sala ta.',
  'join.phone': 'Telefon',
  'join.phone.hint': 'Format: +373XXXXXXXX',
  'join.name': 'Nume (opțional)',
  'join.gym': 'Sală sau cartier',
  'join.goal': 'Scop (opțional)',
  'join.goal.none': 'Neales',
  'join.goal.lose': 'Să scad în greutate',
  'join.goal.maintain': 'Să-mi mențin forma',
  'join.goal.gain': 'Să cresc masa musculară',
  'join.website': 'Site',
  'join.consent': '[ВПИШИ]',
  'join.consent.link': 'Politică și acorduri',
  'join.submit': 'Înscrie-te',
  'join.sending': 'Se trimite…',
  'join.error.phone': 'Verifică numărul: formatul este +373XXXXXXXX.',
  'join.error.consent': 'Fără acord nu te putem adăuga pe listă.',
  'join.error.network': 'Nu s-a trimis. Verifică conexiunea și încearcă din nou.',
  'join.error.rate': 'Prea multe încercări. Încearcă mai târziu.',
  'join.error.generic': 'Ceva nu a mers. Încearcă din nou.',
  'join.success.title': 'Te-am înscris',
  'join.success.text': 'Îți scriem când apare frigiderul în sala ta.',

  // ---- banner analiză ----
  'consent.region': 'Analiză',
  'consent.title': 'Analiză fără cookies',
  'consent.text':
    'Numărăm vizitele fără cookies și fără urmăritori externi. Dacă accepți, reținem un număr anonim al browserului, ca să vedem drumul vizitatorului. Fără acord numărăm doar vizite anonime.',
  'consent.accept': 'Acceptă',
  'consent.necessary': 'Doar ce e necesar',
  'consent.more': 'Detalii',

  // ---- subsol ----
  'footer.social': 'Ne găsești aici',
  'footer.contacts': 'Contacte',
  'footer.legal': 'Politică și acorduri',
  'footer.note': 'Pagina nu oferă recomandări medicale.',

  // ---- politică și acorduri ----
  'legal.title': 'Politică și acorduri',
  'legal.lead': 'Pagină-schiță. Textele le scriu proprietarul și juristul.',
  'legal.back': 'Pagina principală',
  'legal.terms.title': 'Condiții',
  'legal.terms.text': '[ВПИШИ]',
  'legal.privacy.title': 'Politica de confidențialitate',
  'legal.privacy.text': '[ВПИШИ]',
  'legal.analytics.title': 'Analiză',
  'legal.analytics.text': '[ВПИШИ]',
  'legal.analytics.choice': 'Alegerea ta',
  'legal.analytics.state.yes': 'Acum: acceptat',
  'legal.analytics.state.no': 'Acum: doar ce e necesar',
  'legal.analytics.state.unset': 'Alegerea nu a fost făcută',
  'legal.waitlist.title': 'Lista de așteptare',
  'legal.waitlist.text': '[ВПИШИ]',
};

export default ro;
