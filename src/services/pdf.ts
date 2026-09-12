import { jsPDF } from 'jspdf';
import type { Melhoria, PosterLayout, Tile } from '../core/types';
import { tileLabel } from '../core/tiles';
import { melhorarFolha } from './enhance';

/** Geração do PDF (req. 3.7 a 3.11). */

export interface PdfOptions {
  renderDpi: number;
  jpegQuality: number;
  cropMarks: boolean;
  pageLabels: boolean;
  coverSheet: boolean;
  fileName: string;
  /** Com que filtro a imagem é ampliada até o dpi de impressão (item 14.1). */
  melhoria: Melhoria;
  /** Dimensões da imagem original, necessárias para a sangria da melhoria. */
  imageSize: { width: number; height: number };
  /** Blocagem de JPEG medida na imagem inteira (item 14.1.3). */
  blocagem: number;
}

export interface PdfProgress {
  done: number;
  total: number;
  /**
   * O que está acontecendo dentro da folha atual, quando isso demora o bastante para a
   * barra parecer travada. A ampliação por rede neural leva segundos por folha.
   */
  etapa?: string;
}

/**
 * Superfície de desenho de uma folha.
 *
 * Existe para o mesmo código rodar na thread principal (canvas do DOM) e dentro de um
 * Web Worker (`OffscreenCanvas`), sem duplicar a lógica de montagem das folhas.
 */
export interface Superficie {
  ctx: CanvasRenderingContext2D;
  paraJpeg(qualidade: number): Promise<string>;
}

export type FabricaDeSuperficie = (largura: number, altura: number) => Superficie;

export function superficieDom(largura: number, altura: number): Superficie {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('O navegador não disponibilizou um contexto 2D para montar as folhas.');
  }
  return {
    ctx,
    paraJpeg: async (qualidade) => canvas.toDataURL('image/jpeg', qualidade),
  };
}

export function superficieOffscreen(largura: number, altura: number): Superficie {
  const canvas = new OffscreenCanvas(largura, altura);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('O worker não disponibilizou um contexto 2D para montar as folhas.');
  }
  return {
    // As duas interfaces de contexto 2D são idênticas no que usamos aqui.
    ctx: ctx as unknown as CanvasRenderingContext2D,
    paraJpeg: async (qualidade) => {
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: qualidade });
      return new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result as string);
        leitor.onerror = () => reject(leitor.error);
        leitor.readAsDataURL(blob);
      });
    },
  };
}

const MM_PER_INCH = 25.4;
const INK = 20; // cinza escuro para textos auxiliares

export async function generatePoster(
  bitmap: ImageBitmap,
  layout: PosterLayout,
  tiles: Tile[],
  options: PdfOptions,
  onProgress?: (progress: PdfProgress) => void,
  criarSuperficie: FabricaDeSuperficie = superficieDom,
): Promise<Blob> {
  const { page, usable, margin } = layout;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [page.width, page.height],
    compress: true,
  });
  doc.setFont('helvetica', 'normal');

  const total = tiles.length + (options.coverSheet ? 1 : 0);
  let done = 0;

  if (options.coverSheet) {
    drawCoverSheet(doc, layout, options);
    done += 1;
    onProgress?.({ done, total });
  }

  const pxPerMm = options.renderDpi / MM_PER_INCH;
  const tileWidthPx = Math.round(usable.width * pxPerMm);
  const tileHeightPx = Math.round(usable.height * pxPerMm);

  const superficie = criarSuperficie(tileWidthPx, tileHeightPx);
  const ctx = superficie.ctx;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const tile of tiles) {
    // A página 1 já existe: só criamos uma nova a partir da segunda folha desenhada.
    if (done > 0) doc.addPage([page.width, page.height], 'portrait');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tileWidthPx, tileHeightPx);

    if (tile.source && tile.dest) {
      // Bordas em inteiros, calculadas dos dois extremos: arredondar largura e posição
      // separadamente deixaria uma fresta de um pixel entre a imagem e a margem.
      const x0 = Math.round(tile.dest.x * pxPerMm);
      const y0 = Math.round(tile.dest.y * pxPerMm);
      const larguraSaida = Math.round((tile.dest.x + tile.dest.width) * pxPerMm) - x0;
      const alturaSaida = Math.round((tile.dest.y + tile.dest.height) * pxPerMm) - y0;

      if (options.melhoria !== 'navegador') {
        const melhorada = await melhorarFolha(
          bitmap,
          tile.source,
          options.imageSize,
          larguraSaida,
          alturaSaida,
          criarSuperficie,
          {
            melhoria: options.melhoria,
            blocagem: options.blocagem,
            // A rede leva segundos por folha; sem este detalhe a barra fica parada e o
            // usuário não tem como saber se travou.
            aoProgredir: (feitos, totalDeRetalhos) =>
              onProgress?.({
                done,
                total,
                etapa: `ampliando ${feitos}/${totalDeRetalhos}`,
              }),
          },
        );
        ctx.putImageData(melhorada, x0, y0);
      } else {
        ctx.drawImage(
          bitmap,
          tile.source.x,
          tile.source.y,
          tile.source.width,
          tile.source.height,
          x0,
          y0,
          larguraSaida,
          alturaSaida,
        );
      }
    }

    // JPEG, não PNG: a 200 dpi um PNG produz arquivos de centenas de MB (req. 3.7).
    const data = await superficie.paraJpeg(options.jpegQuality);
    doc.addImage(data, 'JPEG', margin, margin, usable.width, usable.height, undefined, 'FAST');

    if (options.cropMarks) drawCropMarks(doc, layout);
    if (options.pageLabels) drawTileLabel(doc, layout, tile);

    done += 1;
    onProgress?.({ done, total });

    // Cede o controle entre folhas. Num worker isso é só higiene; na thread principal
    // (navegador sem OffscreenCanvas) é o que mantém a barra de progresso andando.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return doc.output('blob');
}

/**
 * Folha de montagem (req. 3.10 e 3.11). Vem antes das folhas da imagem e carrega a
 * régua de calibração: sem ela o usuário não tem como verificar se imprimiu em 100 %.
 */
function drawCoverSheet(doc: jsPDF, layout: PosterLayout, options: PdfOptions): void {
  const { page, margin, cols, rows, poster, pages, overlap } = layout;
  const contentWidth = page.width - 2 * margin;
  let y = margin + 8;

  doc.setTextColor(INK);
  doc.setFontSize(20);
  doc.text('Folha de montagem', margin, y);

  y += 8;
  doc.setFontSize(10);
  doc.text(
    `Pôster de ${formatMm(poster.width)} × ${formatMm(poster.height)} cm, montado com ` +
      `${pages} folhas em ${cols} × ${rows}.`,
    margin,
    y,
  );
  y += 5;
  doc.text(
    overlap > 0
      ? `Cada folha traz uma faixa branca de ${overlap} mm na borda esquerda e no topo: ` +
          'é a aba de cola, que entra por baixo da folha vizinha.'
      : 'As folhas se encostam sem repetir nada: recorte com precisão.',
    margin,
    y,
  );

  y += 10;
  doc.setDrawColor(INK);
  doc.setLineWidth(0.3);
  doc.line(margin, y, page.width - margin, y);

  // Mapa da grade: mostra em que posição cada folha entra.
  y += 10;
  const mapMaxWidth = Math.min(contentWidth, 90);
  const mapMaxHeight = 80;
  const scale = Math.min(mapMaxWidth / poster.width, mapMaxHeight / poster.height);
  const mapWidth = poster.width * scale;
  const mapHeight = poster.height * scale;
  const cellWidth = mapWidth / cols;
  const cellHeight = mapHeight / rows;

  doc.setLineWidth(0.2);
  doc.setFontSize(7);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = margin + col * cellWidth;
      const top = y + row * cellHeight;
      doc.rect(x, top, cellWidth, cellHeight);
      doc.text(String(row * cols + col + 1), x + cellWidth / 2, top + cellHeight / 2 + 1, {
        align: 'center',
      });
    }
  }

  // Instruções ao lado do mapa, quando couber; senão, abaixo dele.
  const instructions = [
    'Imprima em escala de 100 %.',
    'Desligue "Ajustar à página".',
    'Confira a régua abaixo antes de imprimir tudo.',
    'Recorte pelas marcas de corte.',
    overlap > 0
      ? `Deslize a faixa branca de ${overlap} mm por baixo da vizinha até a arte encostar.`
      : 'Encoste as folhas sem sobrepor.',
    'Monte na ordem numerada, da esquerda para a direita.',
  ];

  const sideX = margin + mapWidth + 8;
  const sideAvailable = page.width - margin - sideX;
  const aoLado = sideAvailable >= 45;
  const colunaX = aoLado ? sideX : margin;
  const colunaLargura = aoLado ? sideAvailable : contentWidth;

  doc.setFontSize(9);
  let ty = aoLado ? y + 4 : y + mapHeight + 10;
  for (const line of instructions) {
    for (const wrapped of doc.splitTextToSize(line, colunaLargura) as string[]) {
      doc.text(wrapped, colunaX, ty);
      ty += 4.6;
    }
    ty += 1.2;
  }

  // A régua fica logo abaixo do bloco, não solta no rodapé: é a última etapa da
  // leitura desta folha, não um rodapé de página.
  drawCalibrationRuler(doc, margin, Math.max(y + mapHeight, ty) + 18);

  doc.setFontSize(8);
  doc.text(options.fileName, margin, page.height - margin - 1);
}

/**
 * Régua de 50 mm (req. 3.10). Se medir 50 mm com uma régua física, a impressão saiu
 * em escala real — é o único teste objetivo do critério de aceite.
 */
function drawCalibrationRuler(doc: jsPDF, x: number, y: number): void {
  doc.setDrawColor(INK);
  doc.setTextColor(INK);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + 50, y);

  for (let mm = 0; mm <= 50; mm += 10) {
    doc.setLineWidth(mm % 50 === 0 ? 0.4 : 0.25);
    doc.line(x + mm, y, x + mm, y - 3);
  }
  for (let mm = 5; mm < 50; mm += 10) {
    doc.setLineWidth(0.15);
    doc.line(x + mm, y, x + mm, y - 1.6);
  }

  doc.setFontSize(8);
  doc.text('0', x, y + 3.5);
  doc.text('50 mm', x + 50, y + 3.5, { align: 'right' });
  doc.setFontSize(9);
  doc.text('Meça esta régua: se der 50 mm, a escala está correta.', x, y - 6);
}

/** Marcas de corte nos quatro cantos da área imprimível (req. 3.9). */
function drawCropMarks(doc: jsPDF, layout: PosterLayout): void {
  const { page, margin } = layout;
  const length = Math.min(4, margin - 1);
  if (length <= 0) return;

  const left = margin;
  const right = page.width - margin;
  const top = margin;
  const bottom = page.height - margin;

  doc.setDrawColor(INK);
  doc.setLineWidth(0.2);

  const corners: Array<[number, number, number, number]> = [
    [left, top, -1, -1],
    [right, top, 1, -1],
    [left, bottom, -1, 1],
    [right, bottom, 1, 1],
  ];

  for (const [x, y, dx, dy] of corners) {
    doc.line(x + dx * 0.8, y, x + dx * length, y);
    doc.line(x, y + dy * 0.8, x, y + dy * length);
  }
}

/** Identificação discreta, impressa na margem para poder ser recortada (req. 3.8). */
function drawTileLabel(doc: jsPDF, layout: PosterLayout, tile: Tile): void {
  const { page, margin } = layout;
  if (margin < 4) return;

  doc.setTextColor(INK);
  doc.setFontSize(7);
  doc.text(tileLabel(tile, layout), margin, page.height - margin + 3.2);
}

function formatMm(mm: number): string {
  return (mm / 10).toFixed(1).replace('.', ',');
}
