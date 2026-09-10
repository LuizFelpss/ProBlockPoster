import { describe, expect, it } from 'vitest';
import {
  assessQuality,
  clampRenderDpi,
  estimatePdfBytes,
  maxRenderDpi,
} from '../../src/core/quality';
import type { Projection } from '../../src/core/types';

/** Projeção com `dpi` de resolução efetiva sobre uma área de 100 × 100 mm. */
function projectionAt(dpi: number): Projection {
  const px = (100 / 25.4) * dpi;
  return {
    destination: { x: 0, y: 0, width: 100, height: 100 },
    source: { x: 0, y: 0, width: px, height: px },
  };
}

describe('assessQuality', () => {
  it('classifica pelos limiares de 150 e 100 dpi', () => {
    expect(assessQuality(projectionAt(300)).level).toBe('adequada');
    expect(assessQuality(projectionAt(150)).level).toBe('adequada');
    expect(assessQuality(projectionAt(149)).level).toBe('aceitavel');
    expect(assessQuality(projectionAt(100)).level).toBe('aceitavel');
    expect(assessQuality(projectionAt(99)).level).toBe('baixa');
  });

  it('usa o eixo de menor resolução', () => {
    const report = assessQuality({
      destination: { x: 0, y: 0, width: 100, height: 100 },
      source: { x: 0, y: 0, width: 2000, height: 200 },
    });
    expect(report.dpi).toBe(Math.round(200 / (100 / 25.4)));
    expect(report.level).toBe('baixa');
  });

  it('sempre acompanha uma mensagem para a interface', () => {
    for (const dpi of [400, 120, 40]) {
      expect(assessQuality(projectionAt(dpi)).message.length).toBeGreaterThan(10);
    }
  });
});

describe('limites de renderização', () => {
  const a4Usable = { width: 200, height: 287 };

  it('uma folha A4 a 200 dpi cabe folgada no limite de canvas', () => {
    expect(maxRenderDpi(a4Usable)).toBeGreaterThan(200);
  });

  it('o DPI fica preso entre 150 e 300', () => {
    expect(clampRenderDpi(50, a4Usable)).toBe(150);
    expect(clampRenderDpi(1000, a4Usable)).toBe(300);
    expect(clampRenderDpi(200, a4Usable)).toBe(200);
  });

  it('folhas gigantes derrubam o DPI máximo abaixo do teto nominal', () => {
    expect(maxRenderDpi({ width: 1000, height: 1400 })).toBeLessThan(300);
  });

  it('a estimativa do PDF cresce com páginas e DPI', () => {
    const base = estimatePdfBytes(12, a4Usable, 200);
    // A estimativa é arredondada para bytes inteiros, então comparamos em escala relativa.
    expect(estimatePdfBytes(24, a4Usable, 200) / base).toBeCloseTo(2, 6);
    expect(estimatePdfBytes(12, a4Usable, 300)).toBeGreaterThan(base);
    expect(base).toBeGreaterThan(0);
  });
});
