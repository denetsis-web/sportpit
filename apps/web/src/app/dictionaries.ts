// Все пространства словарей из packages/shared/src/i18n/<пространство>/{ru,ro}.ts.
// Новое пространство подхватывается без правки этого файла.
import { registerDictionaries, type DictionaryModule } from '@sportpit/shared/i18n';

const modules = import.meta.glob<DictionaryModule>(
  '../../../../packages/shared/src/i18n/*/{ru,ro}.ts',
  {
    eager: true,
  },
);

registerDictionaries(modules);
