import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fridgeSchema } from '@sportpit/shared/schemas/admin';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, useResource } from '../../../ui/index.ts';
import { fridgeLink } from '../../client/menu/fridge.ts';
import { AdminOnly, errorText } from '../gyms/common.tsx';

/** QR-код адреса в виде SVG-картинки (data URI); библиотека грузится только в админке и только здесь. */
export function useQrImage(text: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }),
      )
      .then((svg) => alive && setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [text]);
  return src;
}

function Poster({ id }: { id: string }) {
  const { t } = useI18n();
  const fridge = useResource(
    () => api.get(`/admin/fridges/${encodeURIComponent(id)}`, { schema: fridgeSchema }),
    [id],
  );
  const link = fridgeLink(window.location.origin, id);
  const qr = useQrImage(link);

  if (fridge.error) return <Banner variant="error">{errorText(fridge.error, t)}</Banner>;
  if (!fridge.data) return <p role="status">{t('core.loading')}</p>;
  return (
    <>
      <div className="poster" aria-labelledby="poster-title">
        <p>
          <strong>{t('core.slogan')}</strong>
        </p>
        <h2 id="poster-title">{fridge.data.gymName}</h2>
        <p>{fridge.data.name}</p>
        {qr ? (
          <img className="poster__qr" src={qr} alt={t('admin.fridges.poster.qrAlt', { link })} />
        ) : (
          <p role="status">{t('core.loading')}</p>
        )}
        <p>{t('admin.fridges.poster.scan')}</p>
        <p className="poster__link" data-testid="poster-link">
          {link}
        </p>
      </div>
      <div className="admin-actions no-print">
        <Button onClick={() => window.print()}>{t('admin.fridges.poster.print')}</Button>
        <Link className="ui-button ui-button--secondary" to="/admin/fridges">
          {t('core.action.back')}
        </Link>
      </div>
    </>
  );
}

/** QR-плакат холодильника: код ведёт на `/menu?fridge=<id>`, приложение запоминает этот холодильник. */
export function PosterPage() {
  const { id } = useParams();
  return <AdminOnly>{id ? <Poster id={id} /> : null}</AdminOnly>;
}
