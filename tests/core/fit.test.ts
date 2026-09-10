import { describe, expect, it } from 'vitest';
import { ZOOM_MAXIMO, ZOOM_MINIMO, project } from '../../src/core/fit';

const poster = { width: 580, height: 1118 };

describe('project', () => {
  it('preencher cobre o pôster inteiro', () => {
    const p = project({ width: 4000, height: 3000 }, poster, 'preencher');
    expect(p.destination).toEqual({ x: 0, y: 0, width: 580, height: 1118 });
  });

  it('preencher recorta o eixo que sobra, sem distorcer', () => {
    // Imagem 4:3 num pôster estreito e alto: sobra largura.
    const p = project({ width: 4000, height: 3000 }, poster, 'preencher');
    expect(p.source.height).toBe(3000);
    expect(p.source.width).toBeLessThan(4000);
    expect(p.source.width / p.source.height).toBeCloseTo(poster.width / poster.height, 10);
  });

  it('preencher centraliza o recorte por padrão e obedece ao ponto de interesse', () => {
    const image = { width: 4000, height: 3000 };
    const centro = project(image, poster, 'preencher');
    const esquerda = project(image, poster, 'preencher', { x: 0, y: 0.5 });
    const direita = project(image, poster, 'preencher', { x: 1, y: 0.5 });

    expect(centro.source.x).toBeCloseTo((4000 - centro.source.width) / 2, 10);
    expect(esquerda.source.x).toBe(0);
    expect(direita.source.x).toBeCloseTo(4000 - direita.source.width, 10);
  });

  it('ajustar mantém a imagem inteira e centraliza a sobra', () => {
    const p = project({ width: 4000, height: 3000 }, poster, 'ajustar');
    expect(p.source).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
    expect(p.destination.width).toBeLessThanOrEqual(poster.width + 1e-9);
    expect(p.destination.height).toBeLessThanOrEqual(poster.height + 1e-9);
    expect(p.destination.x).toBeCloseTo((poster.width - p.destination.width) / 2, 10);
    expect(p.destination.y).toBeCloseTo((poster.height - p.destination.height) / 2, 10);
  });

  it('nenhum dos modos distorce: a escala é igual nos dois eixos', () => {
    for (const image of [
      { width: 4000, height: 3000 },
      { width: 1000, height: 4000 },
      { width: 2500, height: 2500 },
    ]) {
      for (const mode of ['preencher', 'ajustar'] as const) {
        const p = project(image, poster, mode);
        const escalaX = p.destination.width / p.source.width;
        const escalaY = p.destination.height / p.source.height;
        expect(escalaX).toBeCloseTo(escalaY, 9);
      }
    }
  });

  it('zoom encolhe a área de origem na mesma medida nos dois eixos', () => {
    const image = { width: 4000, height: 3000 };
    const sem = project(image, poster, 'preencher');
    const dobro = project(image, poster, 'preencher', undefined, 2);

    expect(dobro.source.width).toBeCloseTo(sem.source.width / 2, 8);
    expect(dobro.source.height).toBeCloseTo(sem.source.height / 2, 8);
    expect(dobro.destination).toEqual(sem.destination);
  });

  it('zoom não distorce', () => {
    const image = { width: 4000, height: 3000 };
    for (const zoom of [1, 1.5, 2.75, 4]) {
      const p = project(image, poster, 'preencher', undefined, zoom);
      const escalaX = p.destination.width / p.source.width;
      const escalaY = p.destination.height / p.source.height;
      expect(escalaX).toBeCloseTo(escalaY, 9);
    }
  });

  it('zoom fica preso entre o mínimo e o máximo', () => {
    const image = { width: 4000, height: 3000 };
    const abaixo = project(image, poster, 'preencher', undefined, 0.2);
    const acima = project(image, poster, 'preencher', undefined, 99);

    expect(abaixo.source).toEqual(project(image, poster, 'preencher', undefined, ZOOM_MINIMO).source);
    expect(acima.source).toEqual(project(image, poster, 'preencher', undefined, ZOOM_MAXIMO).source);
  });

  it('com zoom o recorte alcança as bordas da imagem', () => {
    const image = { width: 4000, height: 3000 };
    const canto = project(image, poster, 'preencher', { x: 0, y: 0 }, 2);
    const oposto = project(image, poster, 'preencher', { x: 1, y: 1 }, 2);

    expect(canto.source.x).toBe(0);
    expect(canto.source.y).toBe(0);
    expect(oposto.source.x + oposto.source.width).toBeCloseTo(image.width, 8);
    expect(oposto.source.y + oposto.source.height).toBeCloseTo(image.height, 8);
  });

  it('o recorte nunca sai da imagem, em nenhum zoom', () => {
    const image = { width: 4000, height: 3000 };
    for (const zoom of [1, 2, 4]) {
      for (const foco of [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]) {
        const p = project(image, poster, 'preencher', foco, zoom);
        expect(p.source.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.source.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.source.x + p.source.width).toBeLessThanOrEqual(image.width + 1e-9);
        expect(p.source.y + p.source.height).toBeLessThanOrEqual(image.height + 1e-9);
      }
    }
  });

  it('ajustar ignora o zoom, em vez de começar a cortar a imagem', () => {
    const image = { width: 4000, height: 3000 };
    const sem = project(image, poster, 'ajustar');
    const com = project(image, poster, 'ajustar', undefined, 3);
    expect(com).toEqual(sem);
    expect(com.source).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
  });

  it('imagem com a mesma proporção do pôster não perde nada em nenhum modo', () => {
    const image = { width: 580 * 4, height: 1118 * 4 };
    const preencher = project(image, poster, 'preencher');
    const ajustar = project(image, poster, 'ajustar');
    expect(preencher.source).toEqual({ x: 0, y: 0, width: image.width, height: image.height });
    expect(ajustar.destination.width).toBeCloseTo(poster.width, 8);
    expect(ajustar.destination.height).toBeCloseTo(poster.height, 8);
  });
});
