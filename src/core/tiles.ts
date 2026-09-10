import type { PosterLayout, Projection, Rect, Tile } from './types';

/**
 * Divide o pôster em folhas (req. 3.6).
 *
 * Cada folha ocupa uma janela `uW × uH` do pôster, avançando `sX`/`sY` — o que é
 * menor que a janela sempre que há sobreposição, e é justamente essa diferença que
 * produz a faixa repetida usada para alinhar as folhas na montagem.
 *
 * A região de origem sai da interseção entre a janela da folha e o retângulo onde a
 * imagem foi projetada. No modo "ajustar" a interseção pode ser vazia: a folha é
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

      const overlapRect = intersect(posterRect, destination);

      tiles.push({
        index: row * layout.cols + col,
        col,
        row,
        posterRect,
        source: overlapRect
          ? {
              x: source.x + (overlapRect.x - destination.x) * scaleX,
              y: source.y + (overlapRect.y - destination.y) * scaleY,
              width: overlapRect.width * scaleX,
              height: overlapRect.height * scaleY,
            }
          : null,
        dest: overlapRect
          ? {
              x: overlapRect.x - posterRect.x,
              y: overlapRect.y - posterRect.y,
              width: overlapRect.width,
              height: overlapRect.height,
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
