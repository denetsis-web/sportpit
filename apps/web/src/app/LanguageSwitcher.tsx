import { LANGS, type Lang } from '@sportpit/shared/i18n';
import { Button, Dialog } from '../ui/index.ts';
import { useI18n } from './i18n.tsx';

/** Переключатель RU / RO в шапке: выбранный язык отмечен, весь интерфейс меняется сразу. */
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="segmented" role="group" aria-label={t('core.language.label')}>
      {LANGS.map((code: Lang) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={lang === code}
          aria-label={t('core.language.switchTo', { language: t(`core.language.${code}`) })}
          onClick={() => setLang(code)}
        >
          {t(`core.language.short.${code}`)}
        </button>
      ))}
    </div>
  );
}

/** Выбор языка при первом запуске (до этого язык определяется по браузеру). */
export function LanguageChoiceDialog() {
  const { needsChoice, setLang, t } = useI18n();
  return (
    <Dialog
      open={needsChoice}
      onClose={() => undefined}
      dismissible={false}
      hideClose
      title={t('core.language.chooseTitle')}
      closeLabel={t('core.action.close')}
      actions={LANGS.map((code: Lang) => (
        <Button key={code} lang={code} onClick={() => setLang(code)}>
          {t(`core.language.${code}`)}
        </Button>
      ))}
    />
  );
}
