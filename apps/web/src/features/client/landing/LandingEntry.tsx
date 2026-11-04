// Лендинг гостя на `/` и `/ro`. Грузится лениво (отдельный чанк); меню и пакеты берутся с сервера без входа.
import { useResource } from '../../../ui/index.ts';
import { BandSection } from './BandSection.tsx';
import { BoxesSection } from './BoxesSection.tsx';
import CalculatorSection from './calculator/CalculatorSection.tsx';
import { fetchMenu } from './data.ts';
import { FaqSection } from './FaqSection.tsx';
import { Hero } from './Hero.tsx';
import { HowSection } from './HowSection.tsx';
import JoinSection from './join/JoinSection.tsx';
import { LandingFrame } from './LandingFrame.tsx';
import { PacksSection } from './PacksSection.tsx';

export default function LandingEntry() {
  const menu = useResource(fetchMenu);
  const first = menu.data?.published ? menu.data.items[0] : undefined;
  return (
    <LandingFrame kind="home">
      <Hero macros={first ?? null} />
      <HowSection />
      <BoxesSection menu={menu} />
      <PacksSection />
      <BandSection />
      <section
        id="calc"
        className="lp-section lp-dark"
        tabIndex={-1}
        aria-labelledby="lp-calc-title"
      >
        <div className="lp-container">
          <CalculatorSection />
        </div>
      </section>
      <FaqSection />
      <section
        id="join"
        className="lp-section lp-berry"
        tabIndex={-1}
        aria-labelledby="lp-join-title"
      >
        <div className="lp-container">
          <JoinSection />
        </div>
      </section>
    </LandingFrame>
  );
}
