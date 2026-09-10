import { describe, expect, it } from 'vitest';
import { NITIDEZ_PARA_IMPRESSAO, mascaraDeNitidez } from '../../src/core/sharpen';

function solida(largura: number, altura: number, v: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < dados.length; i += 4) {
    dados[i] = v;
    dados[i + 1] = v;
    dados[i + 2] = v;
    dados[i + 3] = 255;
  }
  return dados;
}

/** Rampa suave de preto a branco na horizontal: uma borda borrada. */
function rampa(largura: number, altura: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = (y * largura + x) * 4;
      const v = Math.round((x / (largura - 1)) * 255);
      dados[p] = v;
      dados[p + 1] = v;
      dados[p + 2] = v;
      dados[p + 3] = 255;
    }
  }
  return dados;
}

/** Degrau abrupto: preto até a metade, branco depois. */
function degrau(largura: number, altura: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = (y * largura + x) * 4;
      const v = x < largura / 2 ? 90 : 165;
      dados[p] = v;
      dados[p + 1] = v;
      dados[p + 2] = v;
      dados[p + 3] = 255;
    }
  }
  return dados;
}

describe('mascaraDeNitidez', () => {
  it('não altera uma área de cor sólida', () => {
    const origem = solida(12, 12, 128);
    const saida = mascaraDeNitidez(origem, 12, 12);
    for (let i = 0; i < origem.length; i++) {
      expect(saida[i]).toBe(origem[i]);
    }
  });

  it('aumenta o contraste nos dois lados de uma borda', () => {
    const largura = 24;
    const origem = degrau(largura, 8);
    const saida = mascaraDeNitidez(origem, largura, 8, {
      intensidade: 0.8,
      raio: 1.2,
      limiar: 0,
    });

    const meio = largura / 2;
    const antesEscuro = origem[(4 * largura + (meio - 1)) * 4];
    const depoisEscuro = saida[(4 * largura + (meio - 1)) * 4];
    const antesClaro = origem[(4 * largura + meio) * 4];
    const depoisClaro = saida[(4 * largura + meio) * 4];

    // O lado escuro escurece e o lado claro clareia: a borda fica mais marcada.
    expect(depoisEscuro).toBeLessThan(antesEscuro);
    expect(depoisClaro).toBeGreaterThan(antesClaro);
  });

  it('respeita o limiar, deixando variações fracas em paz', () => {
    const origem = rampa(40, 6);
    const saida = mascaraDeNitidez(origem, 40, 6, { intensidade: 1, raio: 1, limiar: 255 });
    for (let i = 0; i < origem.length; i++) {
      expect(saida[i]).toBe(origem[i]);
    }
  });

  it('intensidade zero devolve a imagem intacta', () => {
    const origem = degrau(16, 4);
    expect(mascaraDeNitidez(origem, 16, 4, { intensidade: 0, raio: 1, limiar: 0 })).toBe(origem);
  });

  it('nunca estoura a faixa de 0 a 255 e preserva o alfa', () => {
    const origem = degrau(20, 6);
    const saida = mascaraDeNitidez(origem, 20, 6, { intensidade: 3, raio: 2, limiar: 0 });
    for (let i = 0; i < saida.length; i += 4) {
      expect(saida[i]).toBeGreaterThanOrEqual(0);
      expect(saida[i]).toBeLessThanOrEqual(255);
      expect(saida[i + 3]).toBe(255);
    }
  });

  it('o padrão de impressão é conservador o bastante para não criar halo visível', () => {
    const largura = 24;
    const origem = degrau(largura, 8);
    const saida = mascaraDeNitidez(origem, largura, 8, NITIDEZ_PARA_IMPRESSAO);

    // Longe da borda, nada muda de forma perceptível.
    expect(Math.abs(saida[(4 * largura + 2) * 4] - origem[(4 * largura + 2) * 4])).toBeLessThan(3);
    expect(
      Math.abs(saida[(4 * largura + largura - 3) * 4] - origem[(4 * largura + largura - 3) * 4]),
    ).toBeLessThan(3);
  });
});
