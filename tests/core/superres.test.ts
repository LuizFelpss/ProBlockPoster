import { describe, expect, it } from 'vitest';
import {
  FATOR_DA_REDE,
  HALO_DA_REDE,
  escreverTensorNCHW,
  paraTensorNCHW,
  planejarRetalhos,
} from '../../src/core/superres';

describe('planejarRetalhos', () => {
  it('cobre a imagem inteira, sem lacuna nem sobreposição no que é aproveitado', () => {
    const largura = 700;
    const altura = 500;
    const cobertura = new Uint8Array(largura * FATOR_DA_REDE * altura * FATOR_DA_REDE);

    for (const retalho of planejarRetalhos(largura, altura, 256)) {
      for (let y = 0; y < retalho.aproveitar.height; y++) {
        for (let x = 0; x < retalho.aproveitar.width; x++) {
          const i =
            (retalho.destino.y + y) * largura * FATOR_DA_REDE + retalho.destino.x + x;
          cobertura[i] += 1;
        }
      }
    }

    // Todo pixel de saída foi escrito exatamente uma vez.
    expect(cobertura.every((v) => v === 1)).toBe(true);
  });

  it('dá halo completo a quem tem vizinho e halo truncado a quem está na borda', () => {
    const retalhos = planejarRetalhos(600, 600, 256);
    const primeiro = retalhos[0];

    // O canto superior esquerdo não tem de onde tirar vizinhança.
    expect(primeiro.entrada.x).toBe(0);
    expect(primeiro.entrada.y).toBe(0);
    expect(primeiro.aproveitar.x).toBe(0);

    // Um retalho do meio leva o halo inteiro dos dois lados.
    const meio = retalhos.find((r) => r.destino.x > 0 && r.destino.y > 0)!;
    expect(meio.entrada.x).toBe(meio.destino.x / FATOR_DA_REDE - HALO_DA_REDE);
    expect(meio.aproveitar.x).toBe(HALO_DA_REDE * FATOR_DA_REDE);
  });

  it('mantém cada entrada dentro da imagem', () => {
    for (const lado of [64, 128, 256]) {
      for (const retalho of planejarRetalhos(300, 210, lado)) {
        expect(retalho.entrada.x).toBeGreaterThanOrEqual(0);
        expect(retalho.entrada.y).toBeGreaterThanOrEqual(0);
        expect(retalho.entrada.x + retalho.entrada.width).toBeLessThanOrEqual(300);
        expect(retalho.entrada.y + retalho.entrada.height).toBeLessThanOrEqual(210);
      }
    }
  });

  it('aproveita só o miolo: o que sai é sempre menor que o que entra, exceto nas bordas', () => {
    for (const retalho of planejarRetalhos(800, 800, 256)) {
      expect(retalho.aproveitar.x + retalho.aproveitar.width).toBeLessThanOrEqual(
        retalho.entrada.width * FATOR_DA_REDE,
      );
      expect(retalho.aproveitar.y + retalho.aproveitar.height).toBeLessThanOrEqual(
        retalho.entrada.height * FATOR_DA_REDE,
      );
    }
  });

  it('uma imagem menor que o retalho vira uma passada só, sem halo', () => {
    const retalhos = planejarRetalhos(100, 80, 256);
    expect(retalhos).toHaveLength(1);
    expect(retalhos[0].entrada).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(retalhos[0].aproveitar).toEqual({ x: 0, y: 0, width: 400, height: 320 });
  });

  it('não devolve retalho para imagem vazia', () => {
    expect(planejarRetalhos(0, 10)).toEqual([]);
    expect(planejarRetalhos(10, 0)).toEqual([]);
  });

  it('recusa retalho de lado inválido em vez de entrar em laço infinito', () => {
    expect(() => planejarRetalhos(10, 10, 0)).toThrow(RangeError);
  });
});

describe('conversão de tensores', () => {
  const largura = 4;
  const altura = 3;
  const rgba = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) {
    rgba[i * 4] = i * 10;
    rgba[i * 4 + 1] = 255 - i * 10;
    rgba[i * 4 + 2] = 128;
    rgba[i * 4 + 3] = 255;
  }

  it('separa os canais em NCHW e normaliza para [0,1]', () => {
    const regiao = { x: 0, y: 0, width: largura, height: altura };
    const tensor = paraTensorNCHW(rgba, largura, regiao);
    const pixels = largura * altura;

    expect(tensor).toHaveLength(3 * pixels);
    expect(tensor[0]).toBeCloseTo(0, 6);
    expect(tensor[1]).toBeCloseTo(10 / 255, 6);
    expect(tensor[pixels]).toBeCloseTo(1, 6);
    expect(tensor[2 * pixels]).toBeCloseTo(128 / 255, 6);
  });

  it('recorta a região pedida, respeitando o passo de linha da imagem', () => {
    const regiao = { x: 1, y: 1, width: 2, height: 2 };
    const tensor = paraTensorNCHW(rgba, largura, regiao);

    // Pixel (1,1) é o índice 5 na imagem original.
    expect(tensor[0]).toBeCloseTo(50 / 255, 6);
    expect(tensor[1]).toBeCloseTo(60 / 255, 6);
  });

  it('escreve de volta o miolo no lugar certo do buffer final', () => {
    const retalho = {
      entrada: { x: 0, y: 0, width: 2, height: 2 },
      aproveitar: { x: 4, y: 4, width: 4, height: 4 },
      destino: { x: 8, y: 8 },
    };
    const tensorLado = 8;
    const tensor = new Float32Array(3 * tensorLado * tensorLado).fill(0.5);
    const destinoLargura = 16;
    const destino = new Uint8ClampedArray(destinoLargura * 16 * 4);

    escreverTensorNCHW(destino, destinoLargura, tensor, tensorLado, tensorLado, retalho);

    const dentro = (8 * destinoLargura + 8) * 4;
    expect(destino[dentro]).toBe(128);
    expect(destino[dentro + 3]).toBe(255);
    // Fora do destino o buffer continua intocado.
    expect(destino[0]).toBe(0);
  });

  it('satura valores fora de [0,1] em vez de estourar', () => {
    // A rede não limita a saída dentro do grafo: valores chegam a passar de 1 e a
    // ficar abaixo de 0 em bordas de alto contraste.
    const retalho = {
      entrada: { x: 0, y: 0, width: 1, height: 1 },
      aproveitar: { x: 0, y: 0, width: 2, height: 2 },
      destino: { x: 0, y: 0 },
    };
    const tensor = new Float32Array(3 * 4);
    tensor[0] = 1.23;
    tensor[4] = -0.227;
    const destino = new Uint8ClampedArray(2 * 2 * 4);

    escreverTensorNCHW(destino, 2, tensor, 2, 2, retalho);

    expect(destino[0]).toBe(255);
    expect(destino[1]).toBe(0);
  });
});
