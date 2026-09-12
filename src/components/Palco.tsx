import type { PosterLayout, Projection, Size, Tile } from '../core/types';

interface PalcoProps {
  layout: PosterLayout;
  tiles: Tile[];
  projection: Projection;
  image: Size;
  imageUrl: string;
  chave: string;
}

/**
 * Preview da divisão (req. 3.5).
 *
 * As folhas ficam exatamente onde estarão no pôster montado: quem sobrepõe, sobrepõe
 * de verdade, e a folha anterior cobre a aba de cola da seguinte como na montagem. Um
 * preview com espaçamento decorativo entre folhas mentiria sobre o resultado.
 */
export default function Palco({ layout, tiles, projection, image, imageUrl, chave }: PalcoProps) {
  const { poster, usable, overlap, step, cols, rows } = layout;

  // Onde a imagem inteira cairia no espaço do pôster, em mm — inclusive a parte
  // recortada, que fica fora dos limites das folhas e some no overflow.
  const mmPorPx = projection.destination.width / projection.source.width;
  const imagemNoPoster = {
    x: projection.destination.x - projection.source.x * mmPorPx,
    y: projection.destination.y - projection.source.y * mmPorPx,
    width: image.width * mmPorPx,
    height: image.height * mmPorPx,
  };

  const pct = (valor: number, total: number) => `${(valor / total) * 100}%`;

  // As faixas repetidas vivem acima de todas as folhas: desenhadas dentro do tile, a
  // folha seguinte as cobriria — que é exatamente o que acontece na montagem real.
  const faixasVerticais = Array.from({ length: cols - 1 }, (_, i) => (i + 1) * step.x);
  const faixasHorizontais = Array.from({ length: rows - 1 }, (_, i) => (i + 1) * step.y);

  return (
    <div
      key={chave}
      className="assenta relative mx-auto"
      style={{
        aspectRatio: `${poster.width} / ${poster.height}`,
        width: '100%',
        maxWidth: `min(100%, ${(poster.width / poster.height) * 62}vh)`,
      }}
      role="img"
      aria-label={`Pôster de ${(poster.width / 10).toFixed(1)} por ${(poster.height / 10).toFixed(1)} centímetros, dividido em ${cols} colunas e ${rows} linhas de folhas.`}
    >
      {tiles.map((tile) => (
        <div
          key={tile.index}
          className="folha folha-emenda absolute"
          style={{
            left: pct(tile.posterRect.x, poster.width),
            top: pct(tile.posterRect.y, poster.height),
            width: pct(usable.width, poster.width),
            height: pct(usable.height, poster.height),
            // Ordem invertida: a aba de cola de cada folha desaparece por baixo da
            // vizinha anterior, que é justamente como as folhas se encaixam no papel.
            zIndex: tiles.length - tile.index,
          }}
        >
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="absolute max-w-none select-none"
            style={{
              left: pct(imagemNoPoster.x - tile.posterRect.x, usable.width),
              top: pct(imagemNoPoster.y - tile.posterRect.y, usable.height),
              width: pct(imagemNoPoster.width, usable.width),
              height: pct(imagemNoPoster.height, usable.height),
            }}
          />
          {tile.aba.x > 0 && (
            <span
              className="aba absolute inset-y-0 left-0"
              style={{ width: pct(tile.aba.x, usable.width) }}
            />
          )}
          {tile.aba.y > 0 && (
            <span
              className="aba absolute inset-x-0 top-0"
              style={{ height: pct(tile.aba.y, usable.height) }}
            />
          )}
          <span className="folha-numero numero">{tile.index + 1}</span>
        </div>
      ))}

      {overlap > 0 && (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: tiles.length + 1 }}>
          {faixasVerticais.map((x) => (
            <span
              key={`v${x}`}
              className="registro registro-vertical inset-y-0"
              style={{ left: pct(x, poster.width), width: pct(overlap, poster.width) }}
            />
          ))}
          {faixasHorizontais.map((y) => (
            <span
              key={`h${y}`}
              className="registro registro-horizontal inset-x-0"
              style={{ top: pct(y, poster.height), height: pct(overlap, poster.height) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
