// Графики отчётов на CSS: столбики по дням и горизонтальные полосы. Тексты приходят параметрами.
// Цифры графика дублируются таблицей на странице, а сам график читается экранным диктором по подписи.

export interface ColumnPoint {
  key: string;
  /** Значения серий для этого дня. */
  values: number[];
  /** Подпись столбика для всплывающей подсказки. */
  title: string;
}

export interface ColumnChartProps {
  label: string;
  points: readonly ColumnPoint[];
  /** Названия серий для легенды; одна серия — без легенды. */
  legend?: readonly string[];
}

export function ColumnChart({ label, points, legend }: ColumnChartProps) {
  const max = Math.max(1, ...points.flatMap((p) => p.values));
  return (
    <figure className="chart">
      <div className="chart__columns" role="img" aria-label={label}>
        {points.map((point) => (
          <div key={point.key} className="chart__group" title={point.title}>
            {point.values.map((value, index) => (
              <span
                key={index}
                className={`chart__column chart__column--${index}`}
                style={{ height: `${Math.round((value / max) * 100)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
      {legend && legend.length > 1 ? (
        <figcaption className="chart__legend">
          {legend.map((name, index) => (
            <span key={name} className="chart__legend-item">
              <span className={`chart__swatch chart__column--${index}`} aria-hidden="true" />
              {name}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Подпись справа от полосы: уже отформатированное значение. */
  text: string;
}

export interface BarListProps {
  label: string;
  items: readonly BarItem[];
  /** Значение, которому соответствует вся ширина; по умолчанию — наибольшее. */
  scaleMax?: number;
}

export function BarList({ label, items, scaleMax }: BarListProps) {
  const max = Math.max(1, scaleMax ?? 0, ...items.map((i) => i.value));
  return (
    <ul className="chart__bars" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className="chart__bar-row">
          <span className="chart__bar-label">{item.label}</span>
          <span className="chart__bar-track" aria-hidden="true">
            <span
              className="chart__bar-fill"
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </span>
          <span className="chart__bar-value">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
