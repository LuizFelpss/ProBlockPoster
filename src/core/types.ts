/** Tipos compartilhados pelo núcleo de cálculo. Sem dependência de DOM. */

export type PaperId = 'A4' | 'A3' | 'CARTA';
export type Orientation = 'retrato' | 'paisagem';

/** Como a imagem se acomoda na área do pôster quando as proporções não batem (req. 3.4). */
export type FitMode = 'preencher' | 'ajustar';

/**
 * Com que filtro a imagem é ampliada até o dpi de impressão (item 14.1).
 *
 * `navegador` deixa a interpolação interna do `drawImage` decidir; `lanczos` usa o
 * filtro do `core/` com máscara de nitidez; `rede` passa por uma rede neural de
 * super-resolução antes disso. Nenhum dos três muda o dpi efetivo exibido — ele
 * continua saindo dos pixels originais.
 */
export type Melhoria = 'navegador' | 'lanczos' | 'rede';

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ponto de interesse do recorte, em coordenadas normalizadas (0 = topo/esquerda, 1 = base/direita). */
export interface Focus {
  x: number;
  y: number;
}

export interface PosterSettings {
  paper: PaperId;
  orientation: Orientation;
  /** Margem de impressão em mm. Mínimo 5 (req. 3.2). */
  margin: number;
  /** Sobreposição entre folhas vizinhas, em mm. */
  overlap: number;
  cols: number;
  rows: number;
}

export interface PosterLayout {
  /** Folha física já orientada, em mm. */
  page: Size;
  /** Área imprimível de cada folha (uW × uH), em mm. */
  usable: Size;
  /** Avanço entre folhas vizinhas (sX, sY), em mm. */
  step: { x: number; y: number };
  cols: number;
  rows: number;
  pages: number;
  /** Dimensões do pôster montado (W × H), em mm. */
  poster: Size;
  margin: number;
  overlap: number;
}

/**
 * Mapeamento entre a imagem e a área do pôster.
 * `destination` está em mm no espaço do pôster; `source` em pixels da imagem.
 */
export interface Projection {
  destination: Rect;
  source: Rect;
}

export interface Tile {
  index: number;
  col: number;
  row: number;
  /** Posição desta folha dentro do pôster, em mm. */
  posterRect: Rect;
  /** Região da imagem a desenhar, em px. `null` quando a folha fica em branco (modo ajustar). */
  source: Rect | null;
  /** Onde desenhar dentro da área imprimível da folha, em mm a partir do canto da margem. */
  dest: Rect | null;
}
