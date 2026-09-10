import { DEFAULT_MARGIN_MM, DEFAULT_OVERLAP_MM } from './core/paper';
import { DEFAULT_RENDER_DPI } from './core/quality';
import type { FitMode, Orientation, PaperId } from './core/types';

/** Modo de entrada do tamanho do pôster (req. 3.2). */
export type ModoTamanho = 'largura' | 'tamanho' | 'grade';

export interface Config {
  paper: PaperId;
  orientation: Orientation;
  margin: number;
  overlap: number;
  modo: ModoTamanho;
  /** Largura final desejada em cm, usada nos modos A e C. */
  larguraCm: number;
  /** Altura final desejada em cm, usada só no modo C. */
  alturaCm: number;
  cols: number;
  rows: number;
  fit: FitMode;
  renderDpi: number;
  cropMarks: boolean;
  pageLabels: boolean;
  coverSheet: boolean;
  /** Lanczos + nitidez no lugar da interpolação do navegador (item 14.1). */
  enhance: boolean;
}

export const CONFIG_PADRAO: Config = {
  paper: 'A4',
  orientation: 'retrato',
  margin: DEFAULT_MARGIN_MM,
  overlap: DEFAULT_OVERLAP_MM,
  modo: 'largura',
  larguraCm: 60,
  alturaCm: 90,
  cols: 3,
  rows: 4,
  fit: 'preencher',
  renderDpi: DEFAULT_RENDER_DPI,
  cropMarks: true,
  pageLabels: true,
  coverSheet: true,
  enhance: true,
};

export const MARGEM_MAXIMA_MM = 25;
export const LARGURA_MAXIMA_CM = 600;
export const ALTURA_MAXIMA_CM = 600;
