import type { Orientation, PaperId, Size } from './types';

/** Dimensões físicas em retrato, em mm (req. 3.2). */
export const PAPERS: Record<PaperId, { label: string; width: number; height: number }> = {
  A4: { label: 'A4', width: 210, height: 297 },
  A3: { label: 'A3', width: 297, height: 420 },
  CARTA: { label: 'Carta', width: 216, height: 279 },
};

export const PAPER_IDS: PaperId[] = ['A4', 'A3', 'CARTA'];

/** Margem mínima obrigatória: impressoras domésticas não imprimem até a borda (req. 3.2). */
export const MIN_MARGIN_MM = 5;
export const DEFAULT_MARGIN_MM = 8;

export const OVERLAP_OPTIONS_MM = [0, 5, 10, 15, 20];
export const DEFAULT_OVERLAP_MM = 10;

export function paperSize(paper: PaperId, orientation: Orientation): Size {
  const { width, height } = PAPERS[paper];
  return orientation === 'retrato' ? { width, height } : { width: height, height: width };
}
