// Карточка заказа в «Моих заказах»: дата, холодильник, блюда, статус, код получения, отмена и перенос.
import { Link } from 'react-router-dom';
import type { OrderDto } from '@sportpit/shared/schemas/orders';
import { useI18n } from '../../../app/i18n.tsx';
import { Button } from '../../../ui/index.ts';

export function OrderCard({
  order,
  onCancel,
}: {
  order: OrderDto;
  onCancel: (order: OrderDto) => void;
}) {
  const { t, lang, date, time } = useI18n();
  const headingId = `my-order-${order.id}`;
  const day = date(order.date);
  return (
    <article className="ui-card my-order" aria-labelledby={headingId}>
      <h3 id={headingId}>{t('orders.my.card.title', { date: day })}</h3>
      <p className={`my-order__status my-order__status--${order.status}`}>
        {t(`orders.status.${order.status}`)}
      </p>
      <p>{t('orders.my.card.where', { gym: order.gymName, fridge: order.fridgeName })}</p>
      <ul className="my-order__items">
        {order.items.map((item) => (
          <li key={item.dishId}>
            {t('orders.order.cart.line', { qty: item.qty, name: item.name[lang] })}
          </li>
        ))}
      </ul>
      <p>{t('orders.my.card.window', { from: order.pickupFrom, to: order.pickupTo })}</p>
      {order.code ? (
        <>
          <p className="my-order__label">{t('orders.my.card.code')}</p>
          <p className="my-order__code">{order.code}</p>
        </>
      ) : null}
      {order.status === 'confirmed' ? (
        order.canChange ? (
          <>
            <p>
              {t('orders.my.changeUntil', {
                time: time(order.cutoffAt),
                date: date(order.cutoffAt),
              })}
            </p>
            <div className="my-order__actions">
              <Link
                className="ui-button ui-button--secondary"
                to={`/order?move=${encodeURIComponent(order.id)}`}
                aria-label={t('orders.my.moveLabel', { date: day })}
              >
                {t('orders.my.move')}
              </Link>
              <Button
                variant="danger"
                onClick={() => onCancel(order)}
                aria-label={t('orders.my.cancelLabel', { date: day })}
              >
                {t('orders.my.cancel')}
              </Button>
            </div>
          </>
        ) : (
          <p>{t('orders.my.changeClosed')}</p>
        )
      ) : null}
    </article>
  );
}
