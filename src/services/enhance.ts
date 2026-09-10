import { LADO_DO_BLOCO, forcaParaBlocagem, removerBlocagem } from '../core/deblock';
import { redimensionarLanczos } from '../core/resample';
import { NITIDEZ_PARA_IMPRESSAO, mascaraDeNitidez, type OpcoesNitidez } from '../core/sharpen';
import type { Rect, Size } from '../core/types';
import type { FabricaDeSuperficie } from './pdf';

/**
 * Aplica Lanczos e máscara de nitidez a uma folha (item 14.1.2 dos requisitos).
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

export function melhorarFolha(
  bitmap: ImageBitmap,
  origem: Rect,
  imagem: Size,
  larguraSaida: number,
  alturaSaida: number,
  criarSuperficie: FabricaDeSuperficie,
  nitidez: OpcoesNitidez = NITIDEZ_PARA_IMPRESSAO,
  /** Blocagem medida na imagem inteira; zero desliga o filtro de artefato. */
  blocagem: number = 1,
): ImageData {
  const escalaX = larguraSaida / origem.width;
  const escalaY = alturaSaida / origem.height;

  const sangriaX = sangriaEmPixelsDeOrigem(escalaX, nitidez.raio);
  const sangriaY = sangriaEmPixelsDeOrigem(escalaY, nitidez.raio);

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
  const forca = forcaParaBlocagem(blocagem);
  if (forca > 0) {
    // O recorte quase nunca começa alinhado ao bloco; a fase diz onde cai a primeira
    // fronteira dentro deste buffer.
    const faseX = (LADO_DO_BLOCO - (x0 % LADO_DO_BLOCO)) % LADO_DO_BLOCO;
    const faseY = (LADO_DO_BLOCO - (y0 % LADO_DO_BLOCO)) % LADO_DO_BLOCO;
    dadosOrigem = removerBlocagem(dadosOrigem, larguraOrigem, alturaOrigem, faseX, faseY, forca);
  }

  const larguraExpandida = Math.max(1, Math.round(larguraOrigem * escalaX));
  const alturaExpandida = Math.max(1, Math.round(alturaOrigem * escalaY));

  const semMudancaDeEscala =
    Math.abs(escalaX - 1) < TOLERANCIA_DE_ESCALA &&
    Math.abs(escalaY - 1) < TOLERANCIA_DE_ESCALA &&
    larguraExpandida === larguraOrigem &&
    alturaExpandida === alturaOrigem;

  const redimensionada = semMudancaDeEscala
    ? dadosOrigem
    : redimensionarLanczos(
        dadosOrigem,
        larguraOrigem,
        alturaOrigem,
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
