import { describe, expect, it } from 'vitest';
import { redimensionarLanczos } from '../../src/core/resample';

/** Imagem RGBA de cor sólida. */
function solida(largura: number, altura: number, r: number, g: number, b: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < dados.length; i += 4) {
    dados[i] = r;
    dados[i + 1] = g;
    dados[i + 2] = b;
    dados[i + 3] = 255;
  }
  return dados;
}

/** Metade esquerda preta, metade direita branca. */
function meioAMeio(largura: number, altura: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = (y * largura + x) * 4;
      const v = x < largura / 2 ? 0 : 255;
      dados[p] = v;
      dados[p + 1] = v;
      dados[p + 2] = v;
      dados[p + 3] = 255;
    }
  }
  return dados;
}

function pixel(dados: Uint8ClampedArray, largura: number, x: number, y: number) {
  const p = (y * largura + x) * 4;
  return [dados[p], dados[p + 1], dados[p + 2], dados[p + 3]];
}

describe('redimensionarLanczos', () => {
  it('devolve exatamente o tamanho pedido', () => {
    const saida = redimensionarLanczos(solida(10, 8, 10, 20, 30), 10, 8, 25, 17);
    expect(saida.length).toBe(25 * 17 * 4);
  });

  it('preserva cor sólida, ampliando ou reduzindo', () => {
    for (const [dw, dh] of [
      [40, 40],
      [5, 5],
      [37, 11],
    ]) {
      const saida = redimensionarLanczos(solida(20, 20, 120, 60, 200), 20, 20, dw, dh);
      for (let i = 0; i < saida.length; i += 4) {
        expect(saida[i]).toBe(120);
        expect(saida[i + 1]).toBe(60);
        expect(saida[i + 2]).toBe(200);
        expect(saida[i + 3]).toBe(255);
      }
    }
  });

  it('não inventa nem estoura valores fora de 0 a 255', () => {
    const saida = redimensionarLanczos(meioAMeio(16, 16), 16, 16, 64, 64);
    for (const v of saida) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('mantém a imagem praticamente igual quando não há mudança de tamanho', () => {
    const origem = meioAMeio(16, 16);
    const saida = redimensionarLanczos(origem, 16, 16, 16, 16);
    for (let i = 0; i < origem.length; i++) {
      expect(Math.abs(saida[i] - origem[i])).toBeLessThanOrEqual(1);
    }
  });

  it('mantém a borda no lugar ao ampliar', () => {
    // Borda no meio da imagem de origem continua no meio da ampliada.
    const saida = redimensionarLanczos(meioAMeio(16, 16), 16, 16, 64, 64);
    expect(pixel(saida, 64, 2, 32)[0]).toBeLessThan(40);
    expect(pixel(saida, 64, 61, 32)[0]).toBeGreaterThan(215);
  });

  it('preserva a média geral ao reduzir, em vez de escurecer as bordas', () => {
    const origem = meioAMeio(64, 64);
    const saida = redimensionarLanczos(origem, 64, 64, 16, 16);
    let soma = 0;
    for (let i = 0; i < saida.length; i += 4) soma += saida[i];
    const media = soma / (16 * 16);
    expect(media).toBeGreaterThan(110);
    expect(media).toBeLessThan(145);
  });

  it('rejeita dimensões inválidas', () => {
    expect(() => redimensionarLanczos(solida(4, 4, 0, 0, 0), 4, 4, 0, 4)).toThrow(/positivas/);
    expect(() => redimensionarLanczos(solida(4, 4, 0, 0, 0), 0, 4, 4, 4)).toThrow(/positivas/);
  });
});
