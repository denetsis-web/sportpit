import { useEffect, useState } from 'react';

/** Что зашифровано в QR заказа: холодильник, дата и код получения. */
export function pickupQrText(fridgeId: string, date: string, code: string): string {
  return `sportpit:pickup:${fridgeId}:${date}:${code}`;
}

/** QR-код в виде SVG-картинки (data URI); библиотека грузится отдельным чанком только здесь. */
export function useQrImage(text: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!text) {
      setSrc(null);
      return;
    }
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
