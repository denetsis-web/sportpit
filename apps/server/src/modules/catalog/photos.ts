// Проверка фото блюда по содержимому: только JPEG и PNG (по первым байтам, а не по заявленному типу).
export interface PhotoKind {
  ext: 'jpg' | 'png';
  contentType: 'image/jpeg' | 'image/png';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffPhoto(data: Uint8Array): PhotoKind | undefined {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (data.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => data[i] === b)) {
    return { ext: 'png', contentType: 'image/png' };
  }
  return undefined;
}
