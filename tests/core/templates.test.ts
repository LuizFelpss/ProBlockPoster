import { describe, expect, it } from 'vitest';
import { gridParaTamanho } from '../../src/core/layout';
import { TEMPLATES, alvoDoTemplate, templateDoAlvo } from '../../src/core/templates';
import type { Size } from '../../src/core/types';

const deitada: Size = { width: 4000, height: 3000 };
const emPe: Size = { width: 3000, height: 4000 };
const quadrada: Size = { width: 3000, height: 3000 };

const a0 = TEMPLATES.find((t) => t.id === 'a0')!;

describe('alvoDoTemplate', () => {
  it('põe o lado maior na largura quando a imagem é deitada', () => {
    expect(alvoDoTemplate(a0, deitada)).toEqual({ largura: 1189, altura: 841 });
  });

  it('põe o lado maior na altura quando a imagem está em pé', () => {
    expect(alvoDoTemplate(a0, emPe)).toEqual({ largura: 841, altura: 1189 });
  });

  it('trata a imagem quadrada como retrato', () => {
    expect(alvoDoTemplate(a0, quadrada)).toEqual({ largura: 841, altura: 1189 });
  });

  it('nunca distorce a proporção do tamanho, só a gira', () => {
    for (const template of TEMPLATES) {
      const a = alvoDoTemplate(template, deitada);
      const b = alvoDoTemplate(template, emPe);

      expect(a.largura).toBe(b.altura);
      expect(a.altura).toBe(b.largura);
      expect(Math.max(a.largura, a.altura)).toBe(template.maior);
      expect(Math.min(a.largura, a.altura)).toBe(template.menor);
    }
  });
});

describe('templateDoAlvo', () => {
  it('reconhece o atalho que acabou de ser aplicado, nas duas orientações', () => {
    for (const imagem of [deitada, emPe, quadrada]) {
      for (const template of TEMPLATES) {
        expect(templateDoAlvo(alvoDoTemplate(template, imagem), imagem)?.id).toBe(template.id);
      }
    }
  });

  it('sobrevive à ida e volta por centímetros, que é como a interface guarda o alvo', () => {
    for (const template of TEMPLATES) {
      const alvo = alvoDoTemplate(template, deitada);
      const comoNaFicha = { largura: (alvo.largura / 10) * 10, altura: (alvo.altura / 10) * 10 };

      expect(templateDoAlvo(comoNaFicha, deitada)?.id).toBe(template.id);
    }
  });

  it('não marca atalho nenhum para um tamanho digitado à mão', () => {
    expect(templateDoAlvo({ largura: 1000, altura: 700 }, deitada)).toBeNull();
  });

  it('não confunde um atalho com o mesmo par girado', () => {
    // A1 deitado são 84,1 × 59,4 cm. Em pé é outro pedido, e o reconhecimento
    // acompanha a imagem — senão a ficha marcaria um atalho que não foi clicado.
    expect(templateDoAlvo({ largura: 594, altura: 841 }, deitada)).toBeNull();
  });
});

describe('a lista de atalhos', () => {
  it('não repete ids', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('declara maior e menor coerentes', () => {
    for (const template of TEMPLATES) {
      expect(template.maior).toBeGreaterThanOrEqual(template.menor);
      expect(template.menor).toBeGreaterThan(0);
    }
  });

  it('cabe nos limites de tamanho da interface', () => {
    for (const template of TEMPLATES) {
      // LARGURA_MAXIMA_CM / ALTURA_MAXIMA_CM são 600 cm; abaixo de 1 cm o campo recusa.
      expect(template.maior).toBeLessThanOrEqual(6000);
      expect(template.menor).toBeGreaterThanOrEqual(10);
    }
  });

  it('gera uma grade válida em qualquer papel, sem folha fracionária', () => {
    for (const template of TEMPLATES) {
      for (const paper of ['A4', 'A3', 'CARTA'] as const) {
        for (const orientation of ['retrato', 'paisagem'] as const) {
          const grade = gridParaTamanho(alvoDoTemplate(template, deitada), {
            paper,
            orientation,
            margin: 8,
            overlap: 10,
          });

          expect(Number.isInteger(grade.cols)).toBe(true);
          expect(Number.isInteger(grade.rows)).toBe(true);
          expect(grade.cols).toBeGreaterThanOrEqual(1);
          expect(grade.rows).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('traz os tamanhos da série ISO corretos, que é a razão de o atalho existir', () => {
    const porId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

    expect([porId.a2.menor, porId.a2.maior]).toEqual([420, 594]);
    expect([porId.a1.menor, porId.a1.maior]).toEqual([594, 841]);
    expect([porId.a0.menor, porId.a0.maior]).toEqual([841, 1189]);
  });
});
