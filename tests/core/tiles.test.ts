import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/core/layout';
import { project } from '../../src/core/fit';
import { buildTiles, tileLabel } from '../../src/core/tiles';
import type { PosterSettings } from '../../src/core/types';

const settings: PosterSettings = {
  paper: 'A4',
  orientation: 'retrato',
  margin: 5,
  overlap: 10,
  cols: 3,
  rows: 4,
};

const layout = computeLayout(settings);
const image = { width: 2000, height: 4000 };

describe('buildTiles', () => {
  const tiles = buildTiles(layout, project(image, layout.poster, 'preencher'));

  it('gera uma folha por célula da grade, na ordem de leitura', () => {
    expect(tiles).toHaveLength(12);
    expect(tiles.map((t) => t.index)).toEqual([...Array(12).keys()]);
    expect(tiles[1]).toMatchObject({ col: 1, row: 0 });
    expect(tiles[3]).toMatchObject({ col: 0, row: 1 });
  });

  it('as folhas cobrem o pôster inteiro, sem lacuna nas bordas', () => {
    const right = Math.max(...tiles.map((t) => t.posterRect.x + t.posterRect.width));
    const bottom = Math.max(...tiles.map((t) => t.posterRect.y + t.posterRect.height));
    expect(Math.min(...tiles.map((t) => t.posterRect.x))).toBe(0);
    expect(Math.min(...tiles.map((t) => t.posterRect.y))).toBe(0);
    expect(right).toBeCloseTo(layout.poster.width, 10);
    expect(bottom).toBeCloseTo(layout.poster.height, 10);
  });

  it('folhas vizinhas se sobrepõem exatamente pela sobreposição configurada', () => {
    const a = tiles[0];
    const b = tiles[1];
    const horizontal = a.posterRect.x + a.posterRect.width - b.posterRect.x;
    expect(horizontal).toBeCloseTo(settings.overlap, 10);

    const c = tiles[3];
    const vertical = a.posterRect.y + a.posterRect.height - c.posterRect.y;
    expect(vertical).toBeCloseTo(settings.overlap, 10);
  });

  it('sem sobreposição as folhas apenas se encostam', () => {
    const semSobra = computeLayout({ ...settings, overlap: 0 });
    const semSobraTiles = buildTiles(semSobra, project(image, semSobra.poster, 'preencher'));
    const a = semSobraTiles[0];
    const b = semSobraTiles[1];
    expect(b.posterRect.x).toBeCloseTo(a.posterRect.x + a.posterRect.width, 10);
  });

  it('a região de origem de cada folha respeita os limites da imagem', () => {
    for (const tile of tiles) {
      expect(tile.source).not.toBeNull();
      const s = tile.source!;
      expect(s.x).toBeGreaterThanOrEqual(-1e-9);
      expect(s.y).toBeGreaterThanOrEqual(-1e-9);
      expect(s.x + s.width).toBeLessThanOrEqual(image.width + 1e-9);
      expect(s.y + s.height).toBeLessThanOrEqual(image.height + 1e-9);
    }
  });

  it('as regiões de origem avançam na mesma proporção das folhas', () => {
    // A folha 0 não tem aba, então sua largura de origem cobre a área útil inteira.
    const pxPorMm = tiles[0].source!.width / layout.usable.width;
    // A folha 1 começa onde a 0 termina: o avanço é a área útil, não o passo da grade,
    // porque a aba de cola já comeu a sobreposição.
    const avancoEsperado = layout.usable.width * pxPorMm;
    expect(tiles[1].source!.x - tiles[0].source!.x).toBeCloseTo(avancoEsperado, 6);
  });

  it('a aba de cola só existe onde há folha vizinha atrás', () => {
    expect(tiles[0].aba).toEqual({ x: 0, y: 0 });
    expect(tiles[1].aba).toEqual({ x: settings.overlap, y: 0 });
    expect(tiles[3].aba).toEqual({ x: 0, y: settings.overlap });
    expect(tiles[4].aba).toEqual({ x: settings.overlap, y: settings.overlap });
  });

  it('sem sobreposição nenhuma folha reserva aba', () => {
    const semSobra = computeLayout({ ...settings, overlap: 0 });
    const semSobraTiles = buildTiles(semSobra, project(image, semSobra.poster, 'preencher'));
    expect(semSobraTiles.every((t) => t.aba.x === 0 && t.aba.y === 0)).toBe(true);
  });

  it('a arte das folhas reparte o pôster sem repetir nem deixar lacuna', () => {
    // O defeito que a aba resolve: com a arte indo até a borda dos dois lados, recortar
    // pelas marcas e encostar as folhas imprimia a mesma faixa duas vezes.
    const arte = (i: number) => ({
      x: tiles[i].posterRect.x + tiles[i].dest!.x,
      y: tiles[i].posterRect.y + tiles[i].dest!.y,
      width: tiles[i].dest!.width,
      height: tiles[i].dest!.height,
    });

    for (let row = 0; row < layout.rows; row++) {
      for (let col = 1; col < layout.cols; col++) {
        const esquerda = arte(row * layout.cols + col - 1);
        const direita = arte(row * layout.cols + col);
        expect(direita.x).toBeCloseTo(esquerda.x + esquerda.width, 10);
      }
    }

    for (let row = 1; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const acima = arte((row - 1) * layout.cols + col);
        const abaixo = arte(row * layout.cols + col);
        expect(abaixo.y).toBeCloseTo(acima.y + acima.height, 10);
      }
    }
  });

  it('no modo ajustar, folhas fora da imagem ficam em branco', () => {
    // Imagem bem mais larga que a grade: sobra papel em cima e embaixo.
    const largo = buildTiles(
      layout,
      project({ width: 4000, height: 1000 }, layout.poster, 'ajustar'),
    );
    const brancas = largo.filter((t) => t.source === null);
    expect(brancas.length).toBeGreaterThan(0);
    expect(brancas.every((t) => t.dest === null)).toBe(true);
    expect(largo.some((t) => t.source !== null)).toBe(true);
  });

  it('a identificação da folha usa numeração de 1 até o total', () => {
    expect(tileLabel(tiles[0], layout)).toBe('1 / 12   Linha 1 — Coluna 1');
    expect(tileLabel(tiles[11], layout)).toBe('12 / 12   Linha 4 — Coluna 3');
  });
});
