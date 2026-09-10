import type { FitMode, Focus, Projection, Size } from './types';

const CENTER: Focus = { x: 0.5, y: 0.5 };

export const ZOOM_MINIMO = 1;
export const ZOOM_MAXIMO = 4;

/**
 * Resolve a incompatibilidade entre a proporção da imagem e a da grade (req. 3.4).
 *
 * Devolve o mapeamento entre um retângulo da imagem (px) e um retângulo do pôster (mm).
 * Nenhum dos dois modos distorce: a escala é sempre uniforme nos dois eixos.
 *
 *   preencher — a imagem cobre o pôster inteiro e o excedente é recortado.
 *   ajustar   — a imagem cabe inteira e sobra papel em branco.
 *
 * O zoom (RF-020) reduz a área de origem, aproximando o recorte. Só faz sentido em
 * "preencher": em "ajustar" a promessa é mostrar a imagem inteira, e ampliar
 * começaria a cortá-la — então lá o zoom é ignorado, não aplicado pela metade.
 */
export function project(
  image: Size,
  poster: Size,
  mode: FitMode,
  focus: Focus = CENTER,
  zoom: number = ZOOM_MINIMO,
): Projection {
  const imageRatio = image.width / image.height;
  const posterRatio = poster.width / poster.height;

  if (mode === 'ajustar') {
    const scale = Math.min(poster.width / image.width, poster.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    return {
      destination: {
        x: (poster.width - width) / 2,
        y: (poster.height - height) / 2,
        width,
        height,
      },
      source: { x: 0, y: 0, width: image.width, height: image.height },
    };
  }

  // preencher: recorta o eixo sobrando, posicionando pelo ponto de interesse.
  let sourceWidth: number;
  let sourceHeight: number;

  if (imageRatio > posterRatio) {
    sourceHeight = image.height;
    sourceWidth = image.height * posterRatio;
  } else {
    sourceWidth = image.width;
    sourceHeight = image.width / posterRatio;
  }

  // Aproximar o recorte é encolher a área de origem: menos pixels cobrindo o mesmo
  // pôster. A proporção é preservada porque os dois eixos encolhem juntos.
  const escala = clamp(zoom, ZOOM_MINIMO, ZOOM_MAXIMO);
  sourceWidth /= escala;
  sourceHeight /= escala;

  const x = clamp((image.width - sourceWidth) * focus.x, 0, image.width - sourceWidth);
  const y = clamp((image.height - sourceHeight) * focus.y, 0, image.height - sourceHeight);

  return {
    destination: { x: 0, y: 0, width: poster.width, height: poster.height },
    source: { x, y, width: sourceWidth, height: sourceHeight },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
