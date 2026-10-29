import type { DictionaryOf } from '../../i18n.ts';
import type ru from './ru.ts';

const ro: DictionaryOf<typeof ru> = {
  'nav.menu': 'Meniu',
  'menu.title': 'Meniu',
  'menu.noMatches':
    'Niciun fel de mâncare nu corespunde filtrelor. Schimbați sau resetați filtrele.',

  'day.label': 'Alegeți ziua',
  'day.today': 'Astăzi',
  'day.tomorrow': 'Mâine',

  'later.title': 'Meniul va apărea mai târziu',
  'later.body': 'Meniul pentru {date} nu a fost încă publicat.',
  'later.next': 'Cea mai apropiată zi cu meniu: {date}.',
  'later.show': 'Arată meniul pentru {date}',
  'later.noNext': 'Data următoare nu este încă cunoscută.',

  'fridge.selected': 'Frigiderul dvs.: {gym}, {name}',

  'filter.title': 'Filtre meniu',
  'filter.goal': 'Obiectiv',
  'filter.goal.any': 'Oricare',
  'filter.goal.lose': 'Slăbire',
  'filter.goal.maintain': 'Menținere',
  'filter.goal.gain': 'Creștere în masă',
  'filter.protein': 'Proteine de la, g',
  'filter.glutenFree': 'Fără gluten',
  'filter.lactoseFree': 'Fără lactoză',
  'filter.vegetarian': 'Vegetarian',
  'filter.reset': 'Resetează filtrele',
  'filter.count': 'Feluri găsite: {count}',

  'unit.kcal': '{value} kcal',
  'unit.grams': '{value} g',
  'nutrition.protein': 'Proteine',
  'nutrition.fat': 'Grăsimi',
  'nutrition.carbs': 'Carbohidrați',
  'nutrition.fiber': 'Fibre',

  vegetarian: 'Vegetarian',
  'allergens.title': 'Alergeni',
  'allergens.none': 'nu sunt',
  'allergen.gluten': 'gluten',
  'allergen.lactose': 'lactoză',
  'allergen.eggs': 'ouă',
  'allergen.nuts': 'nuci',
  'allergen.peanuts': 'arahide',
  'allergen.fish': 'pește',
  'allergen.shellfish': 'fructe de mare',
  'allergen.soy': 'soia',
  'allergen.sesame': 'susan',
  'allergen.celery': 'țelină',
  'allergen.mustard': 'muștar',

  'cooked.later': 'Vom găti în seara dinainte',
  'cooked.at': 'Gătit pe {date} la {time}',
  'cooked.eatBy': 'a se consuma până la {datetime}',

  'rating.none': 'fără evaluări',
  'rating.value': '{avg} din 5 · evaluări: {count}',

  soldOut: 'Epuizat',
  left: 'Porții rămase: {count}',
  add: 'În comandă',

  'dish.back': 'Înapoi la meniu',
  'dish.composition': 'Compoziție',
  'dish.weight': 'Greutatea porției: {value} g',
  'dish.nutrition': 'KBJU pe porție',
  'dish.reviews': 'Recenzii',
  'dish.reviews.empty': 'Nu există încă recenzii.',
  'dish.notOnMenu': 'Acest fel nu este în meniul zilei alese.',
  'review.stars': '{stars} din 5',
  'tag.taste': 'Gust',
  'tag.freshness': 'Prospețime',
  'tag.portion': 'Porție',
  'tag.kbzhu': 'KBJU',

  'error.date': 'Indicați data în formatul AAAA-LL-ZZ.',
  'error.name': 'Denumirea este obligatorie, cel mult 120 de caractere.',
  'error.composition': 'Compoziția este obligatorie, cel mult 1000 de caractere.',
  'error.nutrition': 'Valoarea trebuie să fie un număr de la 0 până la limita superioară.',
  'error.weight': 'Greutatea porției este un număr întreg de grame, de la 1 la 3000.',
  'error.shelfLife': 'Termenul de păstrare este un număr întreg de ore, de la 1 la 720.',
  'error.portionLimit': 'Limita de porții este un număr întreg de la 0 la 1000.',
  'error.menuSize': 'Meniul zilei poate avea cel mult 30 de feluri.',
  'error.menuDuplicate': 'Felul a fost adăugat în meniu de două ori.',
  'error.menuDish': 'În meniu se pot adăuga doar feluri existente și active.',
  'error.menuPast': 'Meniul unei zile trecute nu poate fi modificat.',
  'error.menuEmpty': 'Un meniu gol nu poate fi publicat: adăugați cel puțin un fel.',
  'error.menuNotFound': 'Meniul pentru această dată nu a fost găsit.',
  'error.menuPublished':
    'Meniul pentru această dată este deja publicat, copierea nu îl înlocuiește.',
  'error.portionsReserved':
    'O parte din porții sunt deja comandate ({reserved}): felul nu poate fi scos, iar limita nu poate fi redusă.',
  'error.dishNotFound': 'Felul nu a fost găsit.',
  'error.photoType': 'Fotografia trebuie să fie JPEG sau PNG.',
  'error.photoTooLarge': 'Fotografia depășește 5 MB.',
  'error.photoMissing': 'Alegeți un fișier cu fotografia.',
};

export default ro;
