import { LADO_DO_BLOCO, forcaParaBlocagem, removerBlocagem } from '../core/deblock';
import { redimensionarLanczos } from '../core/resample';
import { NITIDEZ_PARA_IMPRESSAO, mascaraDeNitidez, type OpcoesNitidez } from '../core/sharpen';
import { HALO_DA_REDE } from '../core/superres';
import type { Melhoria, Rect, Size } from '../core/types';
import type { FabricaDeSuperficie } from './pdf';

/**
 * Aplica o filtro escolhido a uma folha: Lanczos e máscara de nitidez (item 14.1.2), ou
 * uma passada de rede neural antes disso (item 14.1.4).
 *
 * O ponto delicado é a emenda. Convolução aplicada folha a folha produz resultado
 * diferente nas bordas, porque o filtro não encontra vizinhos além do limite do
 * recorte — e a diferença apareceria exatamente onde as folhas se encontram na parede.
 * A solução é extrair a região com sangria, filtrar, e só então descartar a sangria:
 * cada pixel que sobrevive foi calculado com todos os vizinhos que ele teria numa
 * imagem inteira.
 */

/** Lóbulos do núcleo de Lanczos, que definem quantos vizinhos ele consulta. */
const LOBOS = 3;

/** Abaixo desta diferença de escala, reamostrar é trabalho jogado fora. */
const TOLERANCIA_DE_ESCALA = 0.02;

/**
 * Abaixo desta ampliação a rede neural não é chamada.
 *
 * Ela amplia 4× fixos. Quando a folha já sai reduzida — imagem grande num pôster
 * pequeno —, ampliar 4× para depois reduzir 8× custaria dezenas de segundos por folha
 * para entregar menos detalhe do que simplesmente reduzir com Lanczos.
 */
const AMPLIACAO_MINIMA_PARA_REDE = 1.05;

export interface OpcoesDeMelhoria {
  melhoria: Melhoria;
  nitidez?: OpcoesNitidez;
  /** Blocagem medida na imagem inteira; zero desliga o filtro de artefato. */
  blocagem?: number;
  aoProgredir?: (feitos: number, total: number) => void;
}

export async function melhorarFolha(
  bitmap: ImageBitmap,
  origem: Rect,
  imagem: Size,
  larguraSaida: number,
  alturaSaida: number,
  criarSuperficie: FabricaDeSuperficie,
  opcoes: OpcoesDeMelhoria,
): Promise<ImageData> {
  const nitidez = opcoes.nitidez ?? NITIDEZ_PARA_IMPRESSAO;
  const blocagem = opcoes.blocagem ?? 1;

  const escalaX = larguraSaida / origem.width;
  const escalaY = alturaSaida / origem.height;

  /*
    A rede só entra quando a folha realmente amplia. E quando entra, a sangria cresce:
    ela precisa dos 34 px de campo receptivo (`HALO_DA_REDE`) **somados** ao que Lanczos
    e nitidez já pediam, porque as três convoluções acontecem em sequência e cada uma
    consome vizinhança da anterior. Somar é folgado de propósito — a conta exata
    economizaria alguns pixels por folha e custaria a garantia de emenda invisível, que
    é o motivo de este arquivo existir.
  */
  const usarRede =
    opcoes.melhoria === 'rede' &&
    Math.min(escalaX, escalaY) >= AMPLIACAO_MINIMA_PARA_REDE;

  const haloDaRede = usarRede ? HALO_DA_REDE : 0;
  const sangriaX = haloDaRede + sangriaEmPixelsDeOrigem(escalaX, nitidez.raio);
  const sangriaY = haloDaRede + sangriaEmPixelsDeOrigem(escalaY, nitidez.raio);

  // Região expandida, presa aos limites da imagem: nas bordas do pôster não há
  // vizinho para pegar, e aí a sangria simplesmente é menor.
  const x0 = Math.max(0, Math.floor(origem.x - sangriaX));
  const y0 = Math.max(0, Math.floor(origem.y - sangriaY));
  const x1 = Math.min(imagem.width, Math.ceil(origem.x + origem.width + sangriaX));
  const y1 = Math.min(imagem.height, Math.ceil(origem.y + origem.height + sangriaY));

  const larguraOrigem = Math.max(1, x1 - x0);
  const alturaOrigem = Math.max(1, y1 - y0);

  // Extração em 1:1: sem reamostragem aqui, para o Lanczos receber os pixels originais.
  const extracao = criarSuperficie(larguraOrigem, alturaOrigem);
  extracao.ctx.drawImage(
    bitmap,
    x0,
    y0,
    larguraOrigem,
    alturaOrigem,
    0,
    0,
    larguraOrigem,
    alturaOrigem,
  );
  let dadosOrigem: Uint8ClampedArray = extracao.ctx.getImageData(
    0,
    0,
    larguraOrigem,
    alturaOrigem,
  ).data;

  /*
    A blocagem é removida aqui, na resolução original, porque é só nela que a grade de
    8 × 8 existe. Depois da ampliação os degraus já viraram rampas de vários pixels e não
    há mais fronteira para reconhecer.

    A sangria entra nesta conta de graça: ela tem pelo menos 3 pixels, então os pixels
    que sobrevivem ao recorte foram filtrados com os vizinhos completos.
  */
  /*
    Com a rede ligada o filtro de blocagem sai do caminho. Não é economia de tempo: é
    que ele vira redundante. Medido num recorte comprimido a JPEG de qualidade 5, com
    blocagem 2,58 na origem, a rede sozinha entrega blocagem 1,08 — o mesmo valor que
    deblock + rede, e com a mesma acutância (13,93 contra 13,97). A rede foi treinada
    justamente sobre imagens comprimidas; o filtro anterior existe para o caminho em que
    ela não roda.
  */
  const forca = usarRede ? 0 : forcaParaBlocagem(blocagem);
  if (forca > 0) {
    // O recorte quase nunca começa alinhado ao bloco; a fase diz onde cai a primeira
    // fronteira dentro deste buffer.
    const faseX = (LADO_DO_BLOCO - (x0 % LADO_DO_BLOCO)) % LADO_DO_BLOCO;
    const faseY = (LADO_DO_BLOCO - (y0 % LADO_DO_BLOCO)) % LADO_DO_BLOCO;
    dadosOrigem = removerBlocagem(dadosOrigem, larguraOrigem, alturaOrigem, faseX, faseY, forca);
  }

  /*
    Passada da rede: ela amplia 4× fixos sobre os pixels originais, e o Lanczos logo
    abaixo acerta o que falta para a escala real da folha — que quase nunca é 4. Fazer o
    contrário (Lanczos primeiro, rede depois) daria à rede pixels já interpolados, que é
    o oposto do que ela foi treinada para receber.
  */
  let larguraFiltrada = larguraOrigem;
  let alturaFiltrada = alturaOrigem;

  if (usarRede) {
    const { ampliarComRede } = await import('./superres');
    const ampliada = await ampliarComRede(
      dadosOrigem,
      larguraOrigem,
      alturaOrigem,
      opcoes.aoProgredir,
    );
    dadosOrigem = ampliada.dados;
    larguraFiltrada = ampliada.largura;
    alturaFiltrada = ampliada.altura;
  }

  const larguraExpandida = Math.max(1, Math.round(larguraOrigem * escalaX));
  const alturaExpandida = Math.max(1, Math.round(alturaOrigem * escalaY));

  const escalaRestanteX = larguraExpandida / larguraFiltrada;
  const escalaRestanteY = alturaExpandida / alturaFiltrada;
  const semMudancaDeEscala =
    Math.abs(escalaRestanteX - 1) < TOLERANCIA_DE_ESCALA &&
    Math.abs(escalaRestanteY - 1) < TOLERANCIA_DE_ESCALA &&
    larguraExpandida === larguraFiltrada &&
    alturaExpandida === alturaFiltrada;

  const redimensionada = semMudancaDeEscala
    ? dadosOrigem
    : redimensionarLanczos(
        dadosOrigem,
        larguraFiltrada,
        alturaFiltrada,
        larguraExpandida,
        alturaExpandida,
        LOBOS,
        // A extração vem de um contexto sem alfa: todo pixel é opaco.
        true,
      );

  const nitida = mascaraDeNitidez(redimensionada, larguraExpandida, alturaExpandida, nitidez);

  return recortarSangria(
    nitida,
    larguraExpandida,
    alturaExpandida,
    Math.round((origem.x - x0) * escalaX),
    Math.round((origem.y - y0) * escalaY),
    larguraSaida,
    alturaSaida,
  );
}

/**
 * Quantos pixels de origem precisam entrar além do recorte.
 *
 * São duas contas somadas: o suporte do Lanczos, que se alarga quando a imagem é
 * reduzida, e o raio do borrão da máscara de nitidez, que é medido em pixels de saída
 * e por isso volta para a escala da origem dividido pela ampliação.
 */
function sangriaEmPixelsDeOrigem(escala: number, raioDaNitidez: number): number {
  const suporteDoLanczos = Math.ceil(LOBOS / Math.min(1, escala));
  const alcanceDaNitidez = Math.ceil((raioDaNitidez * 3 + 1) / escala);
  return suporteDoLanczos + alcanceDaNitidez;
}

function recortarSangria(
  dados: Uint8ClampedArray,
  largura: number,
  altura: number,
  deslocamentoX: number,
  deslocamentoY: number,
  larguraFinal: number,
  alturaFinal: number,
): ImageData {
  // Arredondamentos podem empurrar o recorte um pixel para fora; prende-se aqui.
  const x = Math.min(Math.max(0, deslocamentoX), Math.max(0, largura - larguraFinal));
  const y = Math.min(Math.max(0, deslocamentoY), Math.max(0, altura - alturaFinal));
  const destino = new Uint8ClampedArray(larguraFinal * alturaFinal * 4);

  for (let linha = 0; linha < alturaFinal; linha++) {
    const origemInicio = ((y + linha) * largura + x) * 4;
    destino.set(
      dados.subarray(origemInicio, origemInicio + larguraFinal * 4),
      linha * larguraFinal * 4,
    );
  }

  return new ImageData(destino, larguraFinal, alturaFinal);
}
