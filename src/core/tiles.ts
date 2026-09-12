import type { PosterLayout, Projection, Rect, Tile } from './types';

/**
 * Divide o pôster em folhas (req. 3.6).
 *
 * Cada folha ocupa uma janela `uW × uH` do pôster, avançando `sX`/`sY` — o que é menor
 * que a janela sempre que há sobreposição.
 *
 * Essa diferença vira uma **aba de cola**: na borda esquerda de toda folha que não é da
 * primeira coluna, e no topo de toda folha que não é da primeira linha, os `o` mm
 * iniciais saem em branco. A arte que cairia ali já está impressa na folha vizinha, de
 * modo que nada aparece duas vezes no papel — a aba entra por baixo da vizinha e some.
 * Sem ela, quem recortasse pelas marcas de corte e encostasse as folhas veria a imagem
 * repetida em `o` mm de emenda, com letras ganhando traços a mais.
 *
 * A região de origem sai da interseção entre a área de arte da folha e o retângulo onde
 * a imagem foi projetada. No modo "ajustar" a interseção pode ser vazia: a folha é
 * branca e `source` vem como `null`.
 */
export function buildTiles(layout: PosterLayout, projection: Projection): Tile[] {
  const tiles: Tile[] = [];
  const { destination, source } = projection;
  const scaleX = source.width / destination.width;
  const scaleY = source.height / destination.height;

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const posterRect: Rect = {
        x: col * layout.step.x,
        y: row * layout.step.y,
        width: layout.usable.width,
        height: layout.usable.height,
      };

      // A primeira coluna e a primeira linha encostam na borda do pôster: não há folha
      // atrás delas para receber a aba, e nenhum milímetro é sacrificado.
      const aba = {
        x: col > 0 ? layout.overlap : 0,
        y: row > 0 ? layout.overlap : 0,
      };

      const arte: Rect = {
        x: posterRect.x + aba.x,
        y: posterRect.y + aba.y,
        width: posterRect.width - aba.x,
        height: posterRect.height - aba.y,
      };

      const visivel = intersect(arte, destination);

      tiles.push({
        index: row * layout.cols + col,
        col,
        row,
        posterRect,
        aba,
        source: visivel
          ? {
              x: source.x + (visivel.x - destination.x) * scaleX,
              y: source.y + (visivel.y - destination.y) * scaleY,
              width: visivel.width * scaleX,
              height: visivel.height * scaleY,
            }
          : null,
        dest: visivel
          ? {
              x: visivel.x - posterRect.x,
              y: visivel.y - posterRect.y,
              width: visivel.width,
              height: visivel.height,
            }
          : null,
      });
    }
  }

  return tiles;
}

/** Identificação impressa na folha (req. 3.8). */
export function tileLabel(tile: Tile, layout: PosterLayout): string {
  return `${tile.index + 1} / ${layout.pages}   Linha ${tile.row + 1} — Coluna ${tile.col + 1}`;
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}
