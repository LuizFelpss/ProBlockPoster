/**
 * Medição e remoção de blocagem de JPEG (item 14.1.3 dos requisitos).
 *
 * "Imagem de baixa qualidade" são dois problemas distintos. Imagem *pequena* é falta de
 * pixels, e para isso serve a reamostragem. Imagem *muito comprimida* é outra coisa: o
 * JPEG divide a imagem em blocos de 8 × 8 e quantiza cada um separadamente, então em
 * qualidade baixa aparecem degraus nas fronteiras entre blocos.
 *
 * Ampliar não cria esses degraus, mas também não os remove — e os torna maiores no
 * papel. Um bloco de 8 px ampliado 3 vezes vira 3 mm de quadrado na parede a 200 dpi.
 *
 * Sem DOM: recebe e devolve pixels RGBA crus.
 */

/** Lado do bloco de transformada do JPEG. */
export const LADO_DO_BLOCO = 8;

/**
 * Quanto a imagem sofre de blocagem.
 *
 * Compara o degrau médio entre pixels vizinhos **sobre** as fronteiras de bloco com o
 * degrau médio **dentro** dos blocos. Numa imagem sem compressão com perda a razão fica
 * perto de 1, porque não há nada de especial nas colunas múltiplas de 8. Quanto mais
 * agressiva a compressão, mais as fronteiras se destacam.
 *
 * Medido numa cena de teste: 0,9 sem compressão, 1,5 em JPEG de qualidade 92, 2,6 em
 * qualidade 70 e 3,4 em qualidade 30.
 */
export function medirBlocagem(
  dados: Uint8ClampedArray,
  largura: number,
  altura: number,
  faseX: number = 0,
): number {
  let sobre = 0;
  let nSobre = 0;
  let dentro = 0;
  let nDentro = 0;

  // Uma linha a cada duas basta: a estatística já converge e custa metade.
  for (let y = 0; y < altura; y += 2) {
    const linha = y * largura;
    for (let x = 1; x < largura; x++) {
      const p = (linha + x) * 4;
      const degrau =
        Math.abs(dados[p] - dados[p - 4]) +
        Math.abs(dados[p + 1] - dados[p - 3]) +
        Math.abs(dados[p + 2] - dados[p - 2]);

      if ((x - faseX) % LADO_DO_BLOCO === 0) {
        sobre += degrau;
        nSobre++;
      } else {
        dentro += degrau;
        nDentro++;
      }
    }
  }

  if (nSobre === 0 || nDentro === 0 || dentro === 0) return 1;
  return sobre / nSobre / (dentro / nDentro);
}

/** Acima disto vale a pena filtrar; abaixo, o filtro só tiraria detalhe legítimo. */
export const BLOCAGEM_MINIMA = 1.8;

/**
 * Força do filtro para uma dada medição, em níveis de intensidade.
 *
 * É o degrau máximo que ainda será tratado como artefato. Muito baixo não corrige nada;
 * muito alto começa a comer bordas reais que por acaso caem numa fronteira de bloco.
 */
export function forcaParaBlocagem(blocagem: number): number {
  if (blocagem < BLOCAGEM_MINIMA) return 0;
  return Math.min(20, Math.max(6, Math.round((blocagem - 1) * 6)));
}

/**
 * Suaviza os degraus nas fronteiras de bloco, sem tocar no resto.
 *
 * Só age onde os dois lados da fronteira já estão lisos e o degrau é pequeno — a
 * assinatura de um artefato. Uma borda de verdade que caia sobre a fronteira produz um
 * degrau grande e é deixada em paz, que é a diferença entre isto e simplesmente borrar
 * a imagem.
 *
 * `faseX` e `faseY` dizem em que índice do buffer cai a primeira fronteira, porque um
 * recorte raramente começa alinhado ao bloco.
 */
export function removerBlocagem(
  dados: Uint8ClampedArray,
  largura: number,
  altura: number,
  faseX: number,
  faseY: number,
  forca: number,
): Uint8ClampedArray {
  if (forca <= 0) return dados;

  const saida = new Uint8ClampedArray(dados);
  const limite = Math.round(forca / 2);

  // Fronteiras verticais: corrige na horizontal.
  for (let x = 2; x < largura - 2; x++) {
    if ((x - faseX) % LADO_DO_BLOCO !== 0) continue;
    for (let y = 0; y < altura; y++) {
      suavizar(dados, saida, (y * largura + x) * 4, 4, forca, limite);
    }
  }

  // Fronteiras horizontais: corrige na vertical.
  for (let y = 2; y < altura - 2; y++) {
    if ((y - faseY) % LADO_DO_BLOCO !== 0) continue;
    for (let x = 0; x < largura; x++) {
      suavizar(dados, saida, (y * largura + x) * 4, largura * 4, forca, limite);
    }
  }

  return saida;
}

/**
 * Aproxima os dois pixels que se encostam na fronteira, um quarto do caminho cada.
 *
 * `passo` é a distância em bytes até o vizinho na direção analisada, o que faz a mesma
 * função servir para fronteiras verticais e horizontais.
 */
function suavizar(
  origem: Uint8ClampedArray,
  saida: Uint8ClampedArray,
  q0: number,
  passo: number,
  forca: number,
  limite: number,
): void {
  const p0 = q0 - passo;
  const p1 = q0 - 2 * passo;
  const q1 = q0 + passo;

  for (let c = 0; c < 3; c++) {
    const degrau = origem[q0 + c] - origem[p0 + c];
    if (Math.abs(degrau) >= forca) continue;
    // Os dois lados precisam estar lisos: num gradiente real o degrau é legítimo.
    if (Math.abs(origem[p1 + c] - origem[p0 + c]) >= forca) continue;
    if (Math.abs(origem[q1 + c] - origem[q0 + c]) >= forca) continue;

    const ajuste = Math.max(-limite, Math.min(limite, Math.round(degrau / 4)));
    saida[p0 + c] = origem[p0 + c] + ajuste;
    saida[q0 + c] = origem[q0 + c] - ajuste;
  }
}
