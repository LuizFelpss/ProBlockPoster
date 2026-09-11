import type { Rect } from './types';

/**
 * Geometria da ampliação por rede neural (item 14.1.4 dos requisitos).
 *
 * Sem DOM e sem ONNX Runtime: só as contas que decidem o que entra em cada passada da
 * rede e o que sai. É aqui que mora a garantia de que folhas vizinhas não vão exibir uma
 * emenda, e por isso é código testável.
 */

/** A rede amplia exatamente 4×. Não é configurável: está nos pesos. */
export const FATOR_DA_REDE = 4;

/**
 * Raio do campo receptivo da rede, em pixels de origem.
 *
 * A arquitetura tem 34 convoluções 3 × 3 em sequência, cada uma enxergando um pixel para
 * cada lado, o que dá 34. Medido e não deduzido: com 34 px de sangria o miolo da saída é
 * idêntico ao da mesma região processada dentro de um contexto maior (diferença 0,000);
 * com 32 px sobra 0,0005 nível; sem sangria nenhuma a diferença chega a 15,5 níveis —
 * uma faixa visível justamente onde duas folhas se encontram na parede.
 *
 * Ou seja: qualquer pixel entregue precisa ter nascido com 34 px de vizinhança real.
 */
export const HALO_DA_REDE = 34;

/**
 * Maior lado de um retalho entregue à rede, em pixels de origem.
 *
 * A saída de um retalho quadrado deste tamanho ocupa 256 × 4 = 1024 px de lado, ou seja
 * 3 MB de float32 por canal. Subir muito além disso estoura a memória da GPU em celular
 * antes de ganhar velocidade, porque o custo é linear na área de qualquer jeito.
 */
export const LADO_DO_RETALHO = 256;

export interface Retalho {
  /** Região de origem a submeter à rede, já incluindo o halo. */
  entrada: Rect;
  /** Parte da saída ampliada que deve ser aproveitada, em pixels de saída. */
  aproveitar: Rect;
  /** Onde essa parte se encaixa no buffer ampliado final, em pixels de saída. */
  destino: { x: number; y: number };
}

/**
 * Divide uma imagem em retalhos que a rede consegue processar, com halo suficiente para
 * o resultado ser idêntico ao de processar a imagem inteira de uma vez.
 *
 * A imagem inteira não pode ir de uma vez porque a memória não acompanha: uma origem de
 * 4 Mpx viraria 64 Mpx de saída, e o tensor intermediário em float32 passaria de 750 MB.
 * Cada retalho leva `HALO_DA_REDE` pixels de vizinhança extra em cada lado — quando
 * existem, porque nas bordas da imagem não há vizinho para pegar, e aí a própria rede
 * está vendo o mesmo que veria processando tudo junto.
 */
export function planejarRetalhos(
  largura: number,
  altura: number,
  lado: number = LADO_DO_RETALHO,
  halo: number = HALO_DA_REDE,
): Retalho[] {
  if (largura <= 0 || altura <= 0) return [];
  if (lado < 1) throw new RangeError('O retalho precisa de pelo menos um pixel de lado.');

  const retalhos: Retalho[] = [];

  for (let y = 0; y < altura; y += lado) {
    for (let x = 0; x < largura; x += lado) {
      // Miolo: o pedaço que este retalho é responsável por entregar.
      const mioloLargura = Math.min(lado, largura - x);
      const mioloAltura = Math.min(lado, altura - y);

      // Halo preso aos limites da imagem.
      const x0 = Math.max(0, x - halo);
      const y0 = Math.max(0, y - halo);
      const x1 = Math.min(largura, x + mioloLargura + halo);
      const y1 = Math.min(altura, y + mioloAltura + halo);

      retalhos.push({
        entrada: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        aproveitar: {
          x: (x - x0) * FATOR_DA_REDE,
          y: (y - y0) * FATOR_DA_REDE,
          width: mioloLargura * FATOR_DA_REDE,
          height: mioloAltura * FATOR_DA_REDE,
        },
        destino: { x: x * FATOR_DA_REDE, y: y * FATOR_DA_REDE },
      });
    }
  }

  return retalhos;
}

/**
 * RGBA de 8 bits para o tensor NCHW em [0,1] que a rede espera.
 *
 * O alfa é descartado: o caminho de impressão vem de um contexto opaco, e a rede tem
 * três canais.
 */
export function paraTensorNCHW(
  rgba: Uint8ClampedArray,
  /** Largura da imagem de onde a região é recortada, para calcular o passo de linha. */
  largura: number,
  regiao: Rect,
): Float32Array {
  const pixels = regiao.width * regiao.height;
  const tensor = new Float32Array(3 * pixels);

  for (let y = 0; y < regiao.height; y++) {
    const linha = (regiao.y + y) * largura;
    for (let x = 0; x < regiao.width; x++) {
      const origem = (linha + regiao.x + x) * 4;
      const i = y * regiao.width + x;
      tensor[i] = rgba[origem] / 255;
      tensor[pixels + i] = rgba[origem + 1] / 255;
      tensor[2 * pixels + i] = rgba[origem + 2] / 255;
    }
  }

  return tensor;
}

/**
 * Escreve um pedaço do tensor de saída no buffer RGBA ampliado.
 *
 * O clamp acontece aqui porque a rede não limita a saída dentro do grafo: os valores
 * passeiam fora de [0,1] em bordas de alto contraste (medido: −0,227 a 1,230), e é o
 * consumidor que precisa decidir o que fazer com isso. Cortar é o certo — o pixel não
 * tem para onde ir além de preto e branco.
 */
export function escreverTensorNCHW(
  destino: Uint8ClampedArray,
  destinoLargura: number,
  tensor: Float32Array | Uint8Array | Int32Array | Float64Array,
  tensorLargura: number,
  tensorAltura: number,
  retalho: Retalho,
): void {
  const pixels = tensorLargura * tensorAltura;
  const { aproveitar, destino: canto } = retalho;

  for (let y = 0; y < aproveitar.height; y++) {
    const origemLinha = (aproveitar.y + y) * tensorLargura + aproveitar.x;
    let p = ((canto.y + y) * destinoLargura + canto.x) * 4;

    for (let x = 0; x < aproveitar.width; x++) {
      const i = origemLinha + x;
      // Uint8ClampedArray já satura em 0 e 255, então o clamp sai de graça na atribuição.
      destino[p] = (tensor[i] as number) * 255;
      destino[p + 1] = (tensor[pixels + i] as number) * 255;
      destino[p + 2] = (tensor[2 * pixels + i] as number) * 255;
      destino[p + 3] = 255;
      p += 4;
    }
  }
}
