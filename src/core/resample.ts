/**
 * Reamostragem Lanczos (item 14.1.2 dos requisitos).
 *
 * A imagem já era ampliada antes disto: quando a folha sai a 200 dpi e a origem só tem
 * 90 dpi, o `drawImage` interpola de qualquer jeito, com o filtro interno do navegador.
 * A escolha aqui não é ampliar ou não — é com qual filtro. Lanczos preserva bordas
 * bem melhor que a bilinear/bicúbica padrão no mesmo fator de ampliação.
 *
 * Sem DOM: recebe e devolve pixels RGBA crus, e por isso é testável.
 */

const RAIO_PADRAO = 3;

/** Núcleo de Lanczos com `a` lóbulos. */
function lanczos(x: number, a: number): number {
  if (x === 0) return 1;
  if (x <= -a || x >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

interface Contribuicao {
  inicio: number;
  pesos: Float32Array;
}

/**
 * Para cada pixel de saída, quais pixels de entrada o formam e com que peso.
 *
 * Ao reduzir, o suporte do filtro precisa se alargar na mesma proporção — senão o
 * resultado vira subamostragem e aparece serrilhado. Ao ampliar, o suporte é fixo.
 */
function contribuicoes(origem: number, destino: number, a: number): Contribuicao[] {
  const escala = destino / origem;
  const escalaDoFiltro = escala >= 1 ? 1 : escala;
  const suporte = a / escalaDoFiltro;
  const linhas: Contribuicao[] = [];

  for (let i = 0; i < destino; i++) {
    const centro = (i + 0.5) / escala - 0.5;
    const inicio = Math.max(0, Math.ceil(centro - suporte));
    const fim = Math.min(origem - 1, Math.floor(centro + suporte));
    const quantos = Math.max(1, fim - inicio + 1);
    const pesos = new Float32Array(quantos);

    let soma = 0;
    for (let j = 0; j < quantos; j++) {
      const peso = lanczos((inicio + j - centro) * escalaDoFiltro, a);
      pesos[j] = peso;
      soma += peso;
    }
    // Normalizar mantém o brilho médio: sem isso as bordas escurecem.
    if (soma !== 0) {
      for (let j = 0; j < quantos; j++) pesos[j] /= soma;
    }

    linhas.push({ inicio, pesos });
  }

  return linhas;
}

/**
 * Redimensiona pixels RGBA de `origemLargura × origemAltura` para `destinoLargura ×
 * destinoAltura`.
 *
 * O passe é separável: primeiro horizontal, depois vertical. O intermediário fica em
 * 8 bits em vez de ponto flutuante — a perda de precisão é irrelevante em fotografia e
 * corta o pico de memória pela metade, o que importa num celular montando folhas de
 * quase 4 megapixels.
 */
export function redimensionarLanczos(
  origem: Uint8ClampedArray,
  origemLargura: number,
  origemAltura: number,
  destinoLargura: number,
  destinoAltura: number,
  loboS: number = RAIO_PADRAO,
  /**
   * Quando a origem é sabidamente opaca, filtrar o canal alfa é trabalho jogado fora:
   * é um quarto de todo o custo para reproduzir 255 em todo pixel. As folhas vêm de um
   * contexto sem alfa, então isso vale sempre no caminho de impressão.
   */
  opaco: boolean = false,
): Uint8ClampedArray {
  if (origemLargura <= 0 || origemAltura <= 0 || destinoLargura <= 0 || destinoAltura <= 0) {
    throw new RangeError('Dimensões de reamostragem precisam ser positivas.');
  }

  const horizontais = contribuicoes(origemLargura, destinoLargura, loboS);
  const intermediario = new Uint8ClampedArray(destinoLargura * origemAltura * 4);

  for (let y = 0; y < origemAltura; y++) {
    const linhaOrigem = y * origemLargura * 4;
    const linhaDestino = y * destinoLargura * 4;

    for (let x = 0; x < destinoLargura; x++) {
      const { inicio, pesos } = horizontais[x];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let j = 0; j < pesos.length; j++) {
        const peso = pesos[j];
        const p = linhaOrigem + (inicio + j) * 4;
        r += origem[p] * peso;
        g += origem[p + 1] * peso;
        b += origem[p + 2] * peso;
        if (!opaco) a += origem[p + 3] * peso;
      }

      const d = linhaDestino + x * 4;
      intermediario[d] = r;
      intermediario[d + 1] = g;
      intermediario[d + 2] = b;
      intermediario[d + 3] = opaco ? 255 : a;
    }
  }

  const verticais = contribuicoes(origemAltura, destinoAltura, loboS);
  const destino = new Uint8ClampedArray(destinoLargura * destinoAltura * 4);

  for (let y = 0; y < destinoAltura; y++) {
    const { inicio, pesos } = verticais[y];
    const linhaDestino = y * destinoLargura * 4;

    for (let x = 0; x < destinoLargura; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let j = 0; j < pesos.length; j++) {
        const peso = pesos[j];
        const p = ((inicio + j) * destinoLargura + x) * 4;
        r += intermediario[p] * peso;
        g += intermediario[p + 1] * peso;
        b += intermediario[p + 2] * peso;
        if (!opaco) a += intermediario[p + 3] * peso;
      }

      const d = linhaDestino + x * 4;
      destino[d] = r;
      destino[d + 1] = g;
      destino[d + 2] = b;
      destino[d + 3] = opaco ? 255 : a;
    }
  }

  return destino;
}
