import { medirBlocagem } from '../core/deblock';

/** Carregamento e validação da imagem enviada (req. 3.1, 4.1, 4.2). */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export const PREVIEW_MAX_SIDE = 1200;

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED.join(',');

export interface LoadedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Cópia reduzida usada pelo preview — a original nunca vai para a tela (req. 4.1). */
  preview: ImageBitmap;
  fileName: string;
  /**
   * Quanto a imagem sofre de blocagem de JPEG (item 14.1.3).
   *
   * Medido uma vez, na imagem inteira. Medir por folha faria folhas vizinhas receberem
   * tratamentos diferentes — um trecho de céu liso mediria diferente de um trecho com
   * detalhe —, e a diferença apareceria exatamente na emenda.
   */
  blocagem: number;
}

export class ImageError extends Error {}

/**
 * Lê os primeiros bytes do arquivo para conferir o tipo real, em vez de confiar na
 * extensão ou no `type` declarado pelo navegador (req. 3.1, 10).
 */
async function sniffType(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);

  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (startsWith(0x52, 0x49, 0x46, 0x46) && startsWith2(head, 8, 'WEBP')) return 'image/webp';
  return null;
}

function startsWith2(bytes: Uint8Array, offset: number, ascii: string): boolean {
  return [...ascii].every((ch, i) => bytes[offset + i] === ch.charCodeAt(0));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function loadImage(file: File): Promise<LoadedImage> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageError(
      `O arquivo tem ${formatBytes(file.size)}. O limite é ${formatBytes(MAX_FILE_BYTES)}.`,
    );
  }

  const type = await sniffType(file);
  if (!type) {
    throw new ImageError(
      'Formato não suportado. Envie um JPG, PNG ou WebP. Arquivos SVG não são aceitos.',
    );
  }

  let bitmap: ImageBitmap;
  try {
    // `from-image` aplica a rotação gravada no EXIF. Sem isso, fotos de celular
    // chegam deitadas (req. 3.1).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('Não foi possível abrir esta imagem. O arquivo pode estar corrompido.');
  }

  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    bitmap.close();
    throw new ImageError(
      `A imagem tem ${(bitmap.width * bitmap.height / 1e6).toFixed(0)} megapixels. ` +
        `O limite é ${MAX_PIXELS / 1e6} MP para o processamento caber na memória do navegador.`,
    );
  }

  const preview = await buildPreview(bitmap);

  return {
    bitmap,
    preview,
    blocagem: await medirBlocagemDaImagem(bitmap),
    width: bitmap.width,
    height: bitmap.height,
    fileName: sanitizeFileName(file.name),
  };
}

/** Lado da amostra usada para medir blocagem. */
const AMOSTRA_PX = 512;

/**
 * Mede a blocagem numa amostra central, em escala 1:1.
 *
 * Precisa ser 1:1 porque os blocos têm 8 pixels de lado: qualquer redução os apagaria.
 * A amostra começa num múltiplo de 8 para que a grade caia na fase esperada.
 */
async function medirBlocagemDaImagem(bitmap: ImageBitmap): Promise<number> {
  const largura = Math.min(AMOSTRA_PX, bitmap.width);
  const altura = Math.min(AMOSTRA_PX, bitmap.height);
  const x0 = Math.floor((bitmap.width - largura) / 2 / 8) * 8;
  const y0 = Math.floor((bitmap.height - altura) / 2 / 8) * 8;

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return 1;

  ctx.drawImage(bitmap, x0, y0, largura, altura, 0, 0, largura, altura);
  return medirBlocagem(ctx.getImageData(0, 0, largura, altura).data, largura, altura);
}

async function buildPreview(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return createImageBitmap(bitmap);
  return createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: 'high',
  });
}

/**
 * Nome seguro para o PDF (req. 10).
 *
 * Este é o único texto controlado pelo usuário que chega ao arquivo gerado — vai para o
 * nome do download e é impresso na folha de montagem. Além dos separadores de caminho,
 * saem os parênteses e a barra invertida, que delimitam e escapam strings dentro de um
 * PDF, e os caracteres de controle. A biblioteca já escapa por conta própria; isto é a
 * segunda tranca.
 */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  const clean = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\u005c?%*:|"<>()[\]{}]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^[.\-]+/, '')
    .slice(0, 60);
  return clean || 'poster';
}

/** Converte um ImageBitmap em elemento desenhável e libera memória quando descartado. */
export function drawBitmapToCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('O navegador não disponibilizou um contexto 2D.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}
