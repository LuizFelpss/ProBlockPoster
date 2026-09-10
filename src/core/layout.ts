import { MIN_MARGIN_MM, PAPER_IDS, paperSize } from './paper';
import type { Orientation, PaperId, PosterLayout, PosterSettings, Size } from './types';

/**
 * Fórmulas normativas da seção 3.3 do documento de requisitos.
 *
 *   uW = pW - 2m          uH = pH - 2m
 *   sX = uW - o           sY = uH - o
 *   W  = c × uW - (c-1) × o
 *   H  = r × uH - (r-1) × o
 *
 * Qualquer divergência entre preview, número exibido e PDF é defeito.
 */
export function computeLayout(settings: PosterSettings): PosterLayout {
  const { margin, overlap, cols, rows } = settings;
  const page = paperSize(settings.paper, settings.orientation);

  if (margin < MIN_MARGIN_MM) {
    throw new RangeError(`Margem de ${margin} mm é menor que o mínimo de ${MIN_MARGIN_MM} mm.`);
  }

  const usable = { width: page.width - 2 * margin, height: page.height - 2 * margin };

  if (usable.width <= 0 || usable.height <= 0) {
    throw new RangeError('A margem consome a folha inteira.');
  }
  if (overlap < 0) {
    throw new RangeError('A sobreposição não pode ser negativa.');
  }
  if (overlap >= usable.width || overlap >= usable.height) {
    throw new RangeError('A sobreposição não pode ser maior que a área imprimível da folha.');
  }
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new RangeError('A grade precisa de pelo menos uma coluna e uma linha inteiras.');
  }

  const step = { x: usable.width - overlap, y: usable.height - overlap };

  return {
    page,
    usable,
    step,
    cols,
    rows,
    pages: cols * rows,
    poster: {
      width: cols * usable.width - (cols - 1) * overlap,
      height: rows * usable.height - (rows - 1) * overlap,
    },
    margin,
    overlap,
  };
}

/** Largura do pôster para um dado número de colunas, em mm. */
export function posterWidthFor(cols: number, usableWidth: number, overlap: number): number {
  return cols * usableWidth - (cols - 1) * overlap;
}

/** Altura do pôster para um dado número de linhas, em mm. */
export function posterHeightFor(rows: number, usableHeight: number, overlap: number): number {
  return rows * usableHeight - (rows - 1) * overlap;
}

/**
 * Modo A (req. 3.3): o usuário informa a largura desejada e a grade é derivada dela
 * e da proporção da imagem.
 *
 * O número de folhas é inteiro, então a largura pedida quase nunca é atingível
 * exatamente. Arredondamos para a grade mais próxima em vez de para cima: subir de
 * 60 cm pedidos para 77 cm seria uma diferença grande demais para ser silenciosa.
 * A largura real resultante é devolvida por `computeLayout` e exibida na interface.
 */
export function gridForWidth(
  desiredWidthMm: number,
  image: { width: number; height: number },
  base: Pick<PosterSettings, 'paper' | 'orientation' | 'margin' | 'overlap'>,
): { cols: number; rows: number } {
  const page = paperSize(base.paper, base.orientation);
  const usable = { width: page.width - 2 * base.margin, height: page.height - 2 * base.margin };
  const step = { x: usable.width - base.overlap, y: usable.height - base.overlap };

  const cols = Math.max(1, Math.round((desiredWidthMm - base.overlap) / step.x));
  const realWidth = posterWidthFor(cols, usable.width, base.overlap);
  const targetHeight = realWidth * (image.height / image.width);
  const rows = Math.max(1, Math.round((targetHeight - base.overlap) / step.y));

  return { cols, rows };
}

/** Tamanho de pôster pedido pelo usuário, em mm. */
export interface AlvoDeTamanho {
  largura: number;
  altura: number;
}

type BaseDeGrade = Pick<PosterSettings, 'paper' | 'orientation' | 'margin' | 'overlap'>;

/**
 * Modo C: o usuário informa largura **e** altura, e a grade sai das duas.
 *
 * Diferente do Modo A, aqui a proporção do pôster deixa de ser ditada pela imagem e
 * passa a ser escolhida — é o que permite um banner de 200 × 42 cm a partir de uma foto
 * qualquer. A imagem se acomoda pelo enquadramento de 3.4: recorta em "preencher" ou
 * sobra papel em "ajustar". A conta é a mesma do Modo A, aplicada nos dois eixos.
 */
export function gridParaTamanho(alvo: AlvoDeTamanho, base: BaseDeGrade): {
  cols: number;
  rows: number;
} {
  const page = paperSize(base.paper, base.orientation);
  const usavel = {
    width: page.width - 2 * base.margin,
    height: page.height - 2 * base.margin,
  };

  return {
    cols: Math.max(1, Math.round((alvo.largura - base.overlap) / (usavel.width - base.overlap))),
    rows: Math.max(1, Math.round((alvo.altura - base.overlap) / (usavel.height - base.overlap))),
  };
}

export interface Encaixe {
  paper: PaperId;
  orientation: Orientation;
  cols: number;
  rows: number;
  poster: Size;
  pages: number;
  /** Maior desvio relativo entre os dois eixos: 0,05 são 5% de diferença. */
  erro: number;
}

/**
 * Margem de erro dentro da qual duas opções são consideradas igualmente boas.
 *
 * Sem ela, a busca escolheria sempre o menor desvio, ainda que custasse o dobro de
 * folhas por meio ponto percentual. Ninguém prefere 40 folhas a 8 para ganhar 1% de
 * precisão num pôster que vai para a parede.
 */
const EMPATE_TECNICO = 0.03;

/** Todos os encaixes possíveis para um alvo, do melhor para o pior. */
export function encaixesParaTamanho(
  alvo: AlvoDeTamanho,
  opcoes: Pick<PosterSettings, 'margin' | 'overlap'>,
): Encaixe[] {
  const encaixes: Encaixe[] = [];

  for (const paper of PAPER_IDS) {
    for (const orientation of ['retrato', 'paisagem'] as Orientation[]) {
      const base = { ...opcoes, paper, orientation };
      const grade = gridParaTamanho(alvo, base);
      const layout = computeLayout({ ...base, ...grade });

      encaixes.push({
        paper,
        orientation,
        cols: grade.cols,
        rows: grade.rows,
        poster: layout.poster,
        pages: layout.pages,
        erro: Math.max(
          Math.abs(layout.poster.width - alvo.largura) / alvo.largura,
          Math.abs(layout.poster.height - alvo.altura) / alvo.altura,
        ),
      });
    }
  }

  const menorErro = Math.min(...encaixes.map((e) => e.erro));

  return encaixes.sort((a, b) => {
    const aEmpatado = a.erro <= menorErro + EMPATE_TECNICO;
    const bEmpatado = b.erro <= menorErro + EMPATE_TECNICO;
    // Entre os que chegam igualmente perto, ganha quem gasta menos papel.
    if (aEmpatado && bEmpatado) return a.pages - b.pages || a.erro - b.erro;
    if (aEmpatado !== bEmpatado) return aEmpatado ? -1 : 1;
    return a.erro - b.erro || a.pages - b.pages;
  });
}

/**
 * O encaixe recomendado para um alvo.
 *
 * Existe porque a escolha certa de papel e orientação não é intuitiva: um banner de
 * 200 × 42 cm sai em 7 folhas A3 em paisagem e em 14 folhas A4 em retrato, e a versão
 * com metade das folhas ainda por cima chega mais perto do tamanho pedido.
 */
export function melhorEncaixe(
  alvo: AlvoDeTamanho,
  opcoes: Pick<PosterSettings, 'margin' | 'overlap'>,
): Encaixe {
  return encaixesParaTamanho(alvo, opcoes)[0];
}
