import {
  FATOR_DA_REDE,
  escreverTensorNCHW,
  paraTensorNCHW,
  planejarRetalhos,
} from '../core/superres';

/**
 * Ampliação por rede neural (item 14.1.4 dos requisitos).
 *
 * Roda `realesr-general-x4v3` no ONNX Runtime Web, pela GPU. Tudo continua no navegador:
 * o modelo é servido pela própria origem do site — está em `public/modelos/` — e a
 * imagem não sai da máquina, como no resto do produto.
 *
 * Duas coisas que este módulo não faz de propósito:
 *
 * - **Não decide sozinho que vai rodar.** Quem chama precisa ter perguntado a
 *   `redeDisponivel()` antes, porque a resposta depende de WebGPU e o usuário tem de
 *   saber que caiu para o Lanczos em vez de descobrir pelo resultado.
 * - **Não mexe no dpi exibido.** O alerta de qualidade continua saindo dos pixels
 *   originais. Um número que subisse porque o filtro está ligado transformaria o único
 *   indicador honesto do produto em propaganda.
 */

/** Caminho do modelo dentro da própria origem — nunca um CDN de terceiro. */
const CAMINHO_DO_MODELO = '/modelos/realesr-general-x4v3.onnx';

/**
 * Peso aproximado da primeira ativação, para a interface poder avisar antes.
 *
 * São os pesos (4,87 MB) mais o wasm do runtime já comprimido (6,37 MB medidos no
 * build). O número é aproximado porque a compressão do runtime depende do que o
 * servidor negocia, e por isso a interface diz "cerca de".
 */
export const BYTES_DA_REDE = 4_866_417 + 6_368_500;

/**
 * Falha específica da rede, para a interface não culpar a memória por um problema de
 * download ou de GPU. A marca sobrevive à ida e volta pelo worker, onde só a mensagem
 * atravessa — o objeto de erro não é clonável.
 */
export const MARCA_DE_ERRO_DA_REDE = '[rede-neural]';

export class ErroDaRede extends Error {
  constructor(causa: unknown) {
    super(`${MARCA_DE_ERRO_DA_REDE} ${causa instanceof Error ? causa.message : String(causa)}`);
    this.name = 'ErroDaRede';
  }
}

type Ort = typeof import('onnxruntime-web/webgpu');
type Sessao = import('onnxruntime-web/webgpu').InferenceSession;

let carregando: Promise<Sessao> | null = null;

/**
 * A rede só é oferecida onde há WebGPU.
 *
 * O caminho de wasm em CPU existe no runtime e funciona, mas medido fora da GPU a
 * inferência leva cerca de 37 segundos por megapixel de origem — uma folha A4 comum
 * passaria de um minuto, e um pôster de seis folhas de dez. Oferecer isso seria empurrar
 * o usuário para uma espera que ele não tem como avaliar antes de começar.
 */
export function redeDisponivel(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

async function sessao(): Promise<Sessao> {
  if (carregando) return carregando;

  carregando = (async () => {
    const ort: Ort = await import('onnxruntime-web/webgpu');

    /*
      O caminho do wasm não é configurado de propósito. O Vite já resolve o
      `new URL(..., import.meta.url)` de dentro do runtime e emite o arquivo com hash
      junto dos outros assets, servido pela própria origem — que é o que o
      `connect-src 'self'` exige. Apontar `env.wasm.wasmPaths` para uma pasta fixa
      desfaria isso e quebraria na primeira troca de versão do pacote, porque o nome do
      arquivo muda entre builds do ONNX Runtime (o 1.29 usa o binário `asyncify`, e não
      o `jsep` das versões anteriores).
    */
    // A conta pesada é da GPU; threads de CPU só acrescentariam workers aninhados.
    ort.env.wasm.numThreads = 1;

    return ort.InferenceSession.create(CAMINHO_DO_MODELO, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
  })();

  try {
    return await carregando;
  } catch (erro) {
    // Sem isto, uma falha de rede na primeira tentativa condenaria a sessão inteira.
    carregando = null;
    throw new ErroDaRede(erro);
  }
}

/** Baixa e compila o modelo antes de ser preciso, para a espera não começar no clique. */
export async function prepararRede(): Promise<void> {
  try {
    await sessao();
  } catch {
    // Preparar é otimização; o erro de verdade aparece quando alguém pedir a ampliação.
  }
}

/**
 * Amplia pixels RGBA em exatamente 4×.
 *
 * A imagem é dividida em retalhos porque a memória não comporta a passada inteira, e
 * cada retalho vai com halo suficiente para o miolo sair idêntico ao que sairia de uma
 * passada única (ver `core/superres.ts`).
 */
export async function ampliarComRede(
  rgba: Uint8ClampedArray,
  largura: number,
  altura: number,
  aoProgredir?: (feitos: number, total: number) => void,
): Promise<{ dados: Uint8ClampedArray; largura: number; altura: number }> {
  const sessaoAtiva = await sessao();
  const { Tensor } = await import('onnxruntime-web/webgpu');

  const larguraFinal = largura * FATOR_DA_REDE;
  const alturaFinal = altura * FATOR_DA_REDE;
  const destino = new Uint8ClampedArray(larguraFinal * alturaFinal * 4);

  const retalhos = planejarRetalhos(largura, altura);
  const nomeDaEntrada = sessaoAtiva.inputNames[0];
  const nomeDaSaida = sessaoAtiva.outputNames[0];

  for (let i = 0; i < retalhos.length; i++) {
    const retalho = retalhos[i];
    const entrada = paraTensorNCHW(rgba, largura, retalho.entrada);

    const saida = await sessaoAtiva.run({
      [nomeDaEntrada]: new Tensor('float32', entrada, [
        1,
        3,
        retalho.entrada.height,
        retalho.entrada.width,
      ]),
    });

    const tensor = saida[nomeDaSaida];
    escreverTensorNCHW(
      destino,
      larguraFinal,
      tensor.data as Float32Array,
      retalho.entrada.width * FATOR_DA_REDE,
      retalho.entrada.height * FATOR_DA_REDE,
      retalho,
    );
    // O tensor de saída de um retalho 256² ocupa 12 MB; segurar todos até o fim seria
    // desnecessário e é exatamente o que estoura a memória num celular.
    tensor.dispose?.();

    aoProgredir?.(i + 1, retalhos.length);
  }

  return { dados: destino, largura: larguraFinal, altura: alturaFinal };
}
