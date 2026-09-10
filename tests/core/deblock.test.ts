import { describe, expect, it } from 'vitest';
import {
  BLOCAGEM_MINIMA,
  forcaParaBlocagem,
  medirBlocagem,
  removerBlocagem,
} from '../../src/core/deblock';

function cinza(largura: number, altura: number, valorEm: (x: number, y: number) => number) {
  const d = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = (y * largura + x) * 4;
      const v = valorEm(x, y);
      d[p] = v;
      d[p + 1] = v;
      d[p + 2] = v;
      d[p + 3] = 255;
    }
  }
  return d;
}

/**
 * Rampa monotônica, como uma foto sem compressão com perda.
 *
 * Sem periodicidade: uma rampa com período múltiplo de 8 criaria blocagem artificial e
 * o teste mediria a própria fixture em vez do filtro.
 */
const suave = (largura: number, altura: number) =>
  cinza(largura, altura, (x, y) => 60 + Math.round((x + y) * 0.35));

/**
 * A mesma rampa com blocos de 8 alternando um deslocamento.
 *
 * É assim que a blocagem se manifesta de verdade: cada bloco é quantizado por conta
 * própria, então o que aparece na fronteira é um **degrau** entre dois patamares — não
 * um pico numa única coluna.
 */
const comBlocagem = (largura: number, altura: number, degrau: number, fase = 0) =>
  cinza(largura, altura, (x, y) => {
    const base = 60 + Math.round((x + y) * 0.15);
    const bloco = Math.floor((x - fase) / 8);
    return base + (Math.abs(bloco) % 2 === 0 ? 0 : degrau);
  });

describe('medirBlocagem', () => {
  it('fica perto de 1 numa imagem sem fronteiras de bloco', () => {
    const m = medirBlocagem(suave(128, 64), 128, 64);
    expect(m).toBeGreaterThan(0.6);
    expect(m).toBeLessThan(1.6);
  });

  it('sobe quando há degraus nas colunas múltiplas de 8', () => {
    const leve = medirBlocagem(comBlocagem(128, 64, 6), 128, 64);
    const forte = medirBlocagem(comBlocagem(128, 64, 24), 128, 64);
    expect(leve).toBeGreaterThan(1.6);
    expect(forte).toBeGreaterThan(leve);
  });

  it('respeita a fase: um recorte desalinhado ainda é detectado', () => {
    const dados = comBlocagem(128, 64, 24, 3);
    expect(medirBlocagem(dados, 128, 64, 3)).toBeGreaterThan(medirBlocagem(dados, 128, 64, 0));
  });

  it('não divide por zero numa imagem de cor sólida', () => {
    expect(medirBlocagem(cinza(32, 32, () => 128), 32, 32)).toBe(1);
  });
});

describe('forcaParaBlocagem', () => {
  it('não filtra imagem que não precisa', () => {
    expect(forcaParaBlocagem(1)).toBe(0);
    expect(forcaParaBlocagem(BLOCAGEM_MINIMA - 0.01)).toBe(0);
  });

  it('cresce com a gravidade, dentro de limites', () => {
    const leve = forcaParaBlocagem(2);
    const grave = forcaParaBlocagem(3.8);
    expect(leve).toBeGreaterThanOrEqual(6);
    expect(grave).toBeGreaterThan(leve);
    expect(forcaParaBlocagem(50)).toBeLessThanOrEqual(20);
  });
});

describe('removerBlocagem', () => {
  it('reduz a blocagem medida', () => {
    const dados = comBlocagem(160, 80, 10);
    const antes = medirBlocagem(dados, 160, 80);
    const depois = medirBlocagem(removerBlocagem(dados, 160, 80, 0, 0, 16), 160, 80);
    expect(depois).toBeLessThan(antes);
  });

  it('força zero devolve a imagem intacta, sem copiar à toa', () => {
    const dados = comBlocagem(64, 32, 10);
    expect(removerBlocagem(dados, 64, 32, 0, 0, 0)).toBe(dados);
  });

  it('preserva uma borda de verdade que caia sobre a fronteira', () => {
    // Degrau de 120 níveis na coluna 64, que é múltipla de 8.
    const dados = cinza(128, 32, (x) => (x < 64 ? 40 : 160));
    const saida = removerBlocagem(dados, 128, 32, 0, 0, 14);
    const p = (10 * 128 + 63) * 4;
    expect(saida[p]).toBe(40);
    expect(saida[p + 4]).toBe(160);
  });

  it('não mexe em pixels longe das fronteiras', () => {
    const dados = comBlocagem(128, 64, 12);
    const saida = removerBlocagem(dados, 128, 64, 0, 0, 18);
    for (let x = 3; x < 6; x++) {
      const p = (20 * 128 + x) * 4;
      expect(saida[p]).toBe(dados[p]);
    }
  });

  it('preserva o alfa e não estoura a faixa', () => {
    const dados = comBlocagem(96, 48, 12);
    const saida = removerBlocagem(dados, 96, 48, 0, 0, 18);
    for (let i = 0; i < saida.length; i += 4) {
      expect(saida[i + 3]).toBe(255);
      expect(saida[i]).toBeGreaterThanOrEqual(0);
      expect(saida[i]).toBeLessThanOrEqual(255);
    }
  });
});
