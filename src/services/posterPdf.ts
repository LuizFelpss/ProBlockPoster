import type { PosterLayout, Tile } from '../core/types';
import type { PdfOptions, PdfProgress } from './pdf';
import type { PedidoPdf, RespostaPdf } from '../workers/pdf.worker';

export interface ResultadoPdf {
  blob: Blob;
  /** Onde o PDF foi montado. A interface usa isso só para diagnóstico. */
  origem: 'worker' | 'thread-principal';
}

export function suportaWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/**
 * Entrega o PDF ao usuário. Fica aqui, e não em `pdf.ts`, para não arrastar o jsPDF
 * para dentro do bundle inicial só por causa de sete linhas de DOM.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Libera a memória do blob (req. 10).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Monta o PDF no worker quando o navegador permite, e na thread principal quando não.
 *
 * O fallback não é decorativo: Safari só ganhou `OffscreenCanvas` em 16.4, e a matriz
 * de suporte (req. 4.3) inclui navegadores sem ele. Se o worker falhar por qualquer
 * motivo, a geração ainda acontece — mais lenta, com a interface travando entre
 * folhas, mas acontece.
 */
export async function gerarPdf(
  bitmap: ImageBitmap,
  layout: PosterLayout,
  tiles: Tile[],
  options: PdfOptions,
  onProgress?: (progresso: PdfProgress) => void,
): Promise<ResultadoPdf> {
  if (suportaWorker()) {
    try {
      return { blob: await viaWorker(bitmap, layout, tiles, options, onProgress), origem: 'worker' };
    } catch (e) {
      console.warn('Worker indisponível, montando o PDF na thread principal.', e);
    }
  }

  const { generatePoster } = await import('./pdf');
  return {
    blob: await generatePoster(bitmap, layout, tiles, options, onProgress),
    origem: 'thread-principal',
  };
}

/**
 * O worker é reaproveitado entre gerações.
 *
 * Criar e destruir um por geração obriga o navegador a analisar e compilar o bundle do
 * jsPDF — quase 400 kB — toda vez. Mantido vivo, esse custo é pago uma vez por sessão.
 * O trabalho acontece fora da thread principal nos dois casos, então isso encurta a
 * espera, não destrava a interface.
 */
let workerCompartilhado: Worker | null = null;

function obterWorker(): Worker {
  if (!workerCompartilhado) {
    workerCompartilhado = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return workerCompartilhado;
}

function descartarWorker(): void {
  workerCompartilhado?.terminate();
  workerCompartilhado = null;
}

/**
 * Acorda o worker antes de ele ser necessário, para a compilação acontecer enquanto o
 * usuário ainda está escolhendo o tamanho do pôster. Chamar mais de uma vez não custa
 * nada.
 */
export function prepararWorker(): void {
  if (!suportaWorker()) return;
  try {
    obterWorker();
  } catch {
    // Sem worker o app continua funcionando pela thread principal.
    descartarWorker();
  }
}

async function viaWorker(
  bitmap: ImageBitmap,
  layout: PosterLayout,
  tiles: Tile[],
  options: PdfOptions,
  onProgress?: (progresso: PdfProgress) => void,
): Promise<Blob> {
  const worker = obterWorker();

  // `ImageBitmap` é transferível, não clonável: mandar o original deixaria a thread
  // principal sem imagem para a próxima geração. Vai uma cópia.
  const copia = await createImageBitmap(bitmap);

  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (evento: MessageEvent<RespostaPdf>) => {
        const resposta = evento.data;
        if (resposta.tipo === 'progresso') onProgress?.(resposta.progresso);
        else if (resposta.tipo === 'pronto') resolve(resposta.blob);
        else reject(new Error(resposta.mensagem));
      };
      worker.onerror = (evento) => reject(new Error(evento.message || 'Erro no worker.'));
      worker.onmessageerror = () => reject(new Error('Mensagem inválida vinda do worker.'));

      const pedido: PedidoPdf = { bitmap: copia, layout, tiles, options };
      worker.postMessage(pedido, [copia]);
    });
  } catch (e) {
    // Worker em estado duvidoso não é reaproveitado: a próxima geração começa limpa.
    descartarWorker();
    throw e;
  } finally {
    if (workerCompartilhado) {
      workerCompartilhado.onmessage = null;
      workerCompartilhado.onerror = null;
      workerCompartilhado.onmessageerror = null;
    }
  }
}
