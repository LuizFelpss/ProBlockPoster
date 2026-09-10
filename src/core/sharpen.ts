/**
 * Máscara de nitidez (item 14.1.2 dos requisitos).
 *
 * Papel e tinta borram: a gota de tinta espalha e o contorno perde definição. Por isso
 * dar nitidez antes de imprimir é prática padrão de produção gráfica, e não um truque
 * para disfarçar imagem ruim. O efeito é subtrair da imagem uma versão borrada dela
 * mesma e devolver a diferença amplificada, que é exatamente o contorno.
 *
 * Os padrões são conservadores de propósito: numa imagem já muito ampliada não há
 * detalhe para realçar, e exagerar produz halos ao redor das bordas — que ficam bem
 * mais feios no papel do que a suavidade que tentavam corrigir.
 */

export interface OpcoesNitidez {
  /** Quanto da diferença é devolvida à imagem. */
  intensidade: number;
  /** Raio do borrão, em pixels de saída. */
  raio: number;
  /** Diferenças abaixo disto são ignoradas, para não realçar ruído e grão. */
  limiar: number;
}

export const NITIDEZ_PARA_IMPRESSAO: OpcoesNitidez = {
  intensidade: 0.55,
  raio: 0.9,
  limiar: 4,
};

/**
 * Núcleo gaussiano normalizado.
 *
 * O suporte para em dois desvios em vez de três: com raio abaixo de 1 pixel a cauda
 * que sobra pesa menos de 5% e não muda nada visível, mas cada passo a mais custa uma
 * varredura inteira da folha. É a diferença entre 7 e 5 amostras por eixo.
 */
function nucleoGaussiano(raio: number): Float32Array {
  const alcance = Math.max(1, Math.round(raio * 2));
  const nucleo = new Float32Array(alcance * 2 + 1);
  const doisSigmaAoQuadrado = 2 * raio * raio;
  let soma = 0;

  for (let i = -alcance; i <= alcance; i++) {
    const peso = Math.exp(-(i * i) / doisSigmaAoQuadrado);
    nucleo[i + alcance] = peso;
    soma += peso;
  }
  for (let i = 0; i < nucleo.length; i++) nucleo[i] /= soma;

  return nucleo;
}

/**
 * Aplica a máscara em duas varreduras, e não em três.
 *
 * A versão ingênua borra na horizontal, borra na vertical e depois mistura — três
 * passagens sobre a folha inteira e duas alocações de vários megabytes. Aqui o borrão
 * vertical e a mistura acontecem no mesmo laço, então o valor borrado de cada pixel é
 * consumido no instante em que é calculado e nunca precisa ser guardado.
 *
 * O intermediário horizontal é `Uint8Array` e não `Uint8ClampedArray`: média ponderada
 * de valores entre 0 e 255 com pesos positivos jamais sai da faixa, então o custo de
 * checar o limite a cada escrita seria pago à toa.
 */
export function mascaraDeNitidez(
  origem: Uint8ClampedArray,
  largura: number,
  altura: number,
  opcoes: OpcoesNitidez = NITIDEZ_PARA_IMPRESSAO,
): Uint8ClampedArray {
  const { intensidade, raio, limiar } = opcoes;
  if (intensidade <= 0) return origem;

  const nucleo = nucleoGaussiano(raio);
  const alcance = (nucleo.length - 1) / 2;
  const intermediario = new Uint8Array(origem.length);

  for (let y = 0; y < altura; y++) {
    const linha = y * largura;
    for (let x = 0; x < largura; x++) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let k = -alcance; k <= alcance; k++) {
        const xi = x + k < 0 ? 0 : x + k > largura - 1 ? largura - 1 : x + k;
        const p = (linha + xi) * 4;
        const peso = nucleo[k + alcance];
        r += origem[p] * peso;
        g += origem[p + 1] * peso;
        b += origem[p + 2] * peso;
      }

      const d = (linha + x) * 4;
      intermediario[d] = (r + 0.5) | 0;
      intermediario[d + 1] = (g + 0.5) | 0;
      intermediario[d + 2] = (b + 0.5) | 0;
    }
  }

  const destino = new Uint8ClampedArray(origem.length);

  for (let y = 0; y < altura; y++) {
    const linha = y * largura;
    for (let x = 0; x < largura; x++) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let k = -alcance; k <= alcance; k++) {
        const yi = y + k < 0 ? 0 : y + k > altura - 1 ? altura - 1 : y + k;
        const p = (yi * largura + x) * 4;
        const peso = nucleo[k + alcance];
        r += intermediario[p] * peso;
        g += intermediario[p + 1] * peso;
        b += intermediario[p + 2] * peso;
      }

      const d = (linha + x) * 4;
      destino[d] = misturar(origem[d], r, intensidade, limiar);
      destino[d + 1] = misturar(origem[d + 1], g, intensidade, limiar);
      destino[d + 2] = misturar(origem[d + 2], b, intensidade, limiar);
      destino[d + 3] = origem[d + 3];
    }
  }

  return destino;
}

function misturar(
  original: number,
  borrado: number,
  intensidade: number,
  limiar: number,
): number {
  const diferenca = original - borrado;
  // Diferenças fracas são ruído e grão: realçá-las piora a impressão.
  return Math.abs(diferenca) < limiar ? original : original + intensidade * diferenca;
}
