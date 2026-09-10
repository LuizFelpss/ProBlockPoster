import type { Projection } from './types';

export type QualityLevel = 'adequada' | 'aceitavel' | 'baixa';

export interface QualityReport {
  dpi: number;
  level: QualityLevel;
  message: string;
}

const MM_PER_INCH = 25.4;

export const DPI_ADEQUADO = 150;
export const DPI_ACEITAVEL = 100;

/** Resolução efetiva sem arredondar, em dpi. */
export function effectiveDpi(projection: Projection): number {
  const { source, destination } = projection;
  const dpiX = source.width / (destination.width / MM_PER_INCH);
  const dpiY = source.height / (destination.height / MM_PER_INCH);
  return Math.min(dpiX, dpiY);
}

/**
 * Maior largura de pôster que ainda mantém a imagem em boa qualidade, em mm.
 *
 * O dpi é inversamente proporcional ao tamanho impresso, então basta encolher o pôster
 * na mesma razão que falta para o alvo. Serve para o alerta de 3.12 parar de só reclamar
 * e passar a dizer o que fazer.
 */
export function larguraParaDpi(
  projection: Projection,
  larguraAtualMm: number,
  dpiAlvo: number = DPI_ADEQUADO,
): number {
  return larguraAtualMm * (effectiveDpi(projection) / dpiAlvo);
}

/**
 * Resolução efetiva no tamanho final (req. 3.12).
 *
 * Os limiares são calibrados para pôster, visto a mais de 1 m: exigir 300 dpi
 * reprovaria praticamente qualquer imagem. O alerta nunca bloqueia a geração.
 */
export function assessQuality(projection: Projection): QualityReport {
  const dpi = Math.round(effectiveDpi(projection));

  if (dpi >= DPI_ADEQUADO) {
    return {
      dpi,
      level: 'adequada',
      message: 'A resolução da imagem é adequada para o tamanho selecionado.',
    };
  }
  if (dpi >= DPI_ACEITAVEL) {
    return {
      dpi,
      level: 'aceitavel',
      message: 'Resolução aceitável. O pôster fica bom visto a mais de 1 m de distância.',
    };
  }
  return {
    dpi,
    level: 'baixa',
    message: 'A imagem tem baixa resolução para este tamanho. O pôster pode perder nitidez.',
  };
}

/** Área máxima de canvas aceita com folga pelo Safari (~16,7 Mpx). Req. 4.1. */
export const MAX_CANVAS_AREA_PX = 16_000_000;

export const DEFAULT_RENDER_DPI = 200;
export const MIN_RENDER_DPI = 150;
export const MAX_RENDER_DPI = 300;

/**
 * Maior DPI de saída que mantém uma folha dentro do limite de canvas do navegador.
 * Um tile A4 a 200 dpi ocupa ~3,9 Mpx, com folga confortável.
 */
export function maxRenderDpi(usableMm: { width: number; height: number }): number {
  const areaInSquareInches =
    (usableMm.width / MM_PER_INCH) * (usableMm.height / MM_PER_INCH);
  return Math.floor(Math.sqrt(MAX_CANVAS_AREA_PX / areaInSquareInches));
}

export function clampRenderDpi(dpi: number, usableMm: { width: number; height: number }): number {
  return Math.min(Math.max(dpi, MIN_RENDER_DPI), Math.min(MAX_RENDER_DPI, maxRenderDpi(usableMm)));
}

/**
 * Estimativa grosseira do PDF final (req. 3.7), para avisar antes de gerar.
 * ~0,11 byte por pixel é o que JPEG qualidade 0,92 costuma render em fotografia.
 */
export function estimatePdfBytes(
  pages: number,
  usableMm: { width: number; height: number },
  dpi: number,
): number {
  const pixelsPerPage =
    (usableMm.width / MM_PER_INCH) * dpi * ((usableMm.height / MM_PER_INCH) * dpi);
  return Math.round(pages * pixelsPerPage * 0.11);
}
