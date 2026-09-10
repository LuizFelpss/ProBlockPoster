import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  encaixesParaTamanho,
  gridForWidth,
  gridParaTamanho,
  melhorEncaixe,
} from '../../src/core/layout';
import { PAPERS, paperSize } from '../../src/core/paper';
import type { PosterSettings } from '../../src/core/types';

const base: PosterSettings = {
  paper: 'A4',
  orientation: 'retrato',
  margin: 5,
  overlap: 10,
  cols: 3,
  rows: 4,
};

describe('computeLayout', () => {
  it('reproduz o exemplo da seção 3.3 do documento de requisitos', () => {
    const layout = computeLayout(base);

    expect(layout.usable).toEqual({ width: 200, height: 287 });
    expect(layout.step).toEqual({ x: 190, y: 277 });
    expect(layout.poster.width).toBe(580);
    expect(layout.poster.height).toBe(1118);
    expect(layout.pages).toBe(12);
  });

  it('sem margem nem sobreposição, o pôster é a soma das folhas', () => {
    const layout = computeLayout({ ...base, margin: 5, overlap: 0 });
    expect(layout.poster.width).toBe(3 * 200);
    expect(layout.poster.height).toBe(4 * 287);
  });

  it('a orientação troca largura e altura da folha', () => {
    for (const paper of ['A4', 'A3', 'CARTA'] as const) {
      const retrato = paperSize(paper, 'retrato');
      const paisagem = paperSize(paper, 'paisagem');
      expect(paisagem.width).toBe(retrato.height);
      expect(paisagem.height).toBe(retrato.width);
      expect(retrato.width).toBe(PAPERS[paper].width);
    }
  });

  it('vale a fórmula W = c×uW - (c-1)×o para toda combinação de papel e orientação', () => {
    for (const paper of ['A4', 'A3', 'CARTA'] as const) {
      for (const orientation of ['retrato', 'paisagem'] as const) {
        for (const overlap of [0, 5, 10, 15, 20]) {
          for (const cols of [1, 2, 5]) {
            const layout = computeLayout({ ...base, paper, orientation, overlap, cols, rows: 1 });
            const page = paperSize(paper, orientation);
            const usable = page.width - 2 * base.margin;
            expect(layout.poster.width).toBeCloseTo(cols * usable - (cols - 1) * overlap, 10);
          }
        }
      }
    }
  });

  it('uma folha única equivale à área imprimível', () => {
    const layout = computeLayout({ ...base, cols: 1, rows: 1 });
    expect(layout.poster).toEqual(layout.usable);
  });

  it('rejeita margem abaixo do mínimo de impressora', () => {
    expect(() => computeLayout({ ...base, margin: 0 })).toThrow(/mínimo/);
    expect(() => computeLayout({ ...base, margin: 4.9 })).toThrow(/mínimo/);
  });

  it('rejeita sobreposição maior que a área imprimível', () => {
    expect(() => computeLayout({ ...base, overlap: 300 })).toThrow(/sobreposição/i);
    expect(() => computeLayout({ ...base, overlap: -1 })).toThrow(/negativa/i);
  });

  it('rejeita grade não inteira ou vazia', () => {
    expect(() => computeLayout({ ...base, cols: 0 })).toThrow(/grade/i);
    expect(() => computeLayout({ ...base, rows: 2.5 })).toThrow(/grade/i);
  });
});

describe('gridForWidth (Modo A)', () => {
  it('deriva 3 × 4 folhas para 60 cm a partir de uma imagem 2000 × 4000', () => {
    const grid = gridForWidth(600, { width: 2000, height: 4000 }, base);
    expect(grid).toEqual({ cols: 3, rows: 4 });

    const layout = computeLayout({ ...base, ...grid });
    expect(layout.poster.width).toBe(580);
    expect(layout.poster.height).toBe(1118);
  });

  it('arredonda para a grade mais próxima, não para cima', () => {
    // 600 mm fica entre 3 folhas (580 mm) e 4 folhas (770 mm); 580 está mais perto.
    expect(gridForWidth(600, { width: 1000, height: 1000 }, base).cols).toBe(3);
    // 700 mm já está mais perto de 4 folhas.
    expect(gridForWidth(700, { width: 1000, height: 1000 }, base).cols).toBe(4);
  });

  it('a proporção da imagem determina a altura, não a largura', () => {
    const paisagem = gridForWidth(600, { width: 4000, height: 2000 }, base);
    const retrato = gridForWidth(600, { width: 2000, height: 4000 }, base);
    expect(paisagem.cols).toBe(retrato.cols);
    expect(paisagem.rows).toBeLessThan(retrato.rows);
  });

  it('nunca devolve grade vazia, mesmo para larguras minúsculas', () => {
    expect(gridForWidth(1, { width: 4000, height: 2000 }, base)).toEqual({ cols: 1, rows: 1 });
  });
});

describe('gridParaTamanho (Modo C)', () => {
  it('deriva a grade dos dois eixos, e não da proporção da imagem', () => {
    const grade = gridParaTamanho({ largura: 420, altura: 2000 }, { ...base, margin: 8 });
    const layout = computeLayout({ ...base, margin: 8, ...grade });

    expect(grade).toEqual({ cols: 2, rows: 7 });
    expect(layout.poster.width).toBe(378);
    expect(layout.poster.height).toBe(1907);
  });

  it('a proporção pedida sobrevive ao arredondamento, dentro do razoável', () => {
    const alvo = { largura: 420, altura: 2000 };
    const grade = gridParaTamanho(alvo, { ...base, margin: 8 });
    const layout = computeLayout({ ...base, margin: 8, ...grade });

    const proporcaoPedida = alvo.altura / alvo.largura;
    const proporcaoObtida = layout.poster.height / layout.poster.width;
    expect(Math.abs(proporcaoObtida - proporcaoPedida) / proporcaoPedida).toBeLessThan(0.1);
  });

  it('nunca devolve grade vazia', () => {
    expect(gridParaTamanho({ largura: 1, altura: 1 }, base)).toEqual({ cols: 1, rows: 1 });
  });

  it('alvo gigante gera muitas folhas, sem estourar', () => {
    const grade = gridParaTamanho({ largura: 5000, altura: 3000 }, base);
    expect(grade.cols).toBeGreaterThan(20);
    expect(grade.rows).toBeGreaterThan(9);
  });
});

describe('encaixesParaTamanho', () => {
  const alvo = { largura: 420, altura: 2000 };
  const opcoes = { margin: 8, overlap: 10 };

  it('avalia as seis combinações de papel e orientação', () => {
    const encaixes = encaixesParaTamanho(alvo, opcoes);
    expect(encaixes).toHaveLength(6);
    expect(new Set(encaixes.map((e) => `${e.paper}-${e.orientation}`)).size).toBe(6);
  });

  it('recomenda A3 em paisagem para um banner de 200 × 42 cm', () => {
    // O caminho intuitivo seria A4 em retrato, que gasta o dobro de folhas e ainda
    // fica mais longe do tamanho pedido.
    const melhor = melhorEncaixe(alvo, opcoes);
    expect(melhor.paper).toBe('A3');
    expect(melhor.orientation).toBe('paisagem');
    expect(melhor.pages).toBe(7);

    const a4Retrato = encaixesParaTamanho(alvo, opcoes).find(
      (e) => e.paper === 'A4' && e.orientation === 'retrato',
    )!;
    expect(a4Retrato.pages).toBe(14);
    expect(melhor.erro).toBeLessThan(a4Retrato.erro);
  });

  it('ordena do melhor para o pior', () => {
    const encaixes = encaixesParaTamanho(alvo, opcoes);
    const pior = encaixes[encaixes.length - 1];
    expect(pior.erro).toBeGreaterThan(encaixes[0].erro);
  });

  it('entre encaixes igualmente precisos, prefere o que gasta menos papel', () => {
    // Alvo que várias combinações atingem com folga: vence a de menos folhas.
    const melhor = melhorEncaixe({ largura: 1000, altura: 1000 }, opcoes);
    const todos = encaixesParaTamanho({ largura: 1000, altura: 1000 }, opcoes);
    const igualmenteBons = todos.filter((e) => e.erro <= melhor.erro + 0.03);
    expect(melhor.pages).toBe(Math.min(...igualmenteBons.map((e) => e.pages)));
  });

  it('o erro relatado bate com o tamanho real do encaixe', () => {
    for (const e of encaixesParaTamanho(alvo, opcoes)) {
      const esperado = Math.max(
        Math.abs(e.poster.width - alvo.largura) / alvo.largura,
        Math.abs(e.poster.height - alvo.altura) / alvo.altura,
      );
      expect(e.erro).toBeCloseTo(esperado, 10);
    }
  });
});
