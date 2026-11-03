import { blobToDataUrl } from '../persistence/images';

/** Rasterize a board SVG. Photos are inlined so the canvas is not tainted by blob URLs. */
export async function svgMarkupToPng(markup: string, pixelWidth: number, pixelHeight: number): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (svg.tagName === 'parsererror' || svg.querySelector('parsererror')) {
    throw new Error('Could not draw the board.');
  }
  const images = [...svg.querySelectorAll('image')];
  await Promise.all(
    images.map(async (image) => {
      const href = image.getAttribute('href') || image.getAttribute('xlink:href');
      if (!href || href.startsWith('data:')) return;
      const response = await fetch(href);
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      image.setAttribute('href', dataUrl);
      image.setAttribute('xlink:href', dataUrl);
    }),
  );
  svg.setAttribute('width', String(pixelWidth));
  svg.setAttribute('height', String(pixelHeight));
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not draw the board.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not draw the board.');
    context.fillStyle = '#171814';
    context.fillRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Could not create the PNG.');
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}
