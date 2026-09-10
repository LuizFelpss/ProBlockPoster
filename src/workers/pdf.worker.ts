import type { PosterLayout, Tile } from '../core/types';
import { generatePoster, superficieOffscreen, type PdfOptions, type PdfProgress } from '../services/pdf';

/**
 * Geração do PDF fora da thread principal (req. 4.1).
 *
 * O trabalho pesado é desenhar cada folha e codificá-la em JPEG; aqui isso acontece
 * em `OffscreenCanvas`, então a interface continua respondendo a cliques e o preview
 * não congela enquanto o pôster é montado.
 */

export interface PedidoPdf {
  bitmap: ImageBitmap;
  layout: PosterLayout;
  tiles: Tile[];
  options: PdfOptions;
}

export type RespostaPdf =
  | { tipo: 'progresso'; progresso: PdfProgress }
  | { tipo: 'pronto'; blob: Blob }
  | { tipo: 'erro'; mensagem: string };

self.onmessage = async (evento: MessageEvent<PedidoPdf>) => {
  const { bitmap, layout, tiles, options } = evento.data;

  try {
    const blob = await generatePoster(
      bitmap,
      layout,
      tiles,
      options,
      (progresso) => {
        const resposta: RespostaPdf = { tipo: 'progresso', progresso };
        self.postMessage(resposta);
      },
      superficieOffscreen,
    );

    const resposta: RespostaPdf = { tipo: 'pronto', blob };
    self.postMessage(resposta);
  } catch (e) {
    const resposta: RespostaPdf = {
      tipo: 'erro',
      mensagem: e instanceof Error ? e.message : 'Falha desconhecida ao montar o PDF.',
    };
    self.postMessage(resposta);
  } finally {
    // O bitmap foi transferido para cá: fechá-lo é responsabilidade do worker.
    bitmap.close();
  }
};
