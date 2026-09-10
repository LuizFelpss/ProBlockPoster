import { useCallback, useEffect, useMemo, useState } from 'react';
import Convite from './components/Convite';
import Ficha from './components/Ficha';
import Palco from './components/Palco';
import { CONFIG_PADRAO, type Config } from './config';
import { ZOOM_MINIMO, project } from './core/fit';
import { computeLayout, gridForWidth, gridParaTamanho } from './core/layout';
import { paperSize } from './core/paper';
import { assessQuality, clampRenderDpi } from './core/quality';
import { buildTiles } from './core/tiles';
import type { Focus } from './core/types';
import { ImageError, loadImage, type LoadedImage } from './services/image';
import type { PdfProgress } from './services/pdf';

const CENTRO: Focus = { x: 0.5, y: 0.5 };

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<Config>(CONFIG_PADRAO);
  const [focus, setFocus] = useState<Focus>(CENTRO);
  const [zoom, setZoom] = useState(ZOOM_MINIMO);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<PdfProgress | null>(null);

  const ajustar = useCallback((patch: Partial<Config>) => {
    setConfig((atual) => ({ ...atual, ...patch }));
    setErroPdf(null);
  }, []);

  async function receberArquivo(file: File) {
    setCarregando(true);
    setErroUpload(null);
    try {
      const carregada = await loadImage(file);
      setImage((anterior) => {
        anterior?.bitmap.close();
        anterior?.preview.close();
        return carregada;
      });
      setFocus(CENTRO);
      setZoom(ZOOM_MINIMO);
    } catch (e) {
      setErroUpload(
        e instanceof ImageError ? e.message : 'Não foi possível ler este arquivo.',
      );
    } finally {
      setCarregando(false);
    }
  }

  // O preview usa uma cópia reduzida; a imagem original nunca vai para o DOM (req. 4.1).
  useEffect(() => {
    if (!image) {
      setImageUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelado = false;

    const canvas = document.createElement('canvas');
    canvas.width = image.preview.width;
    canvas.height = image.preview.height;
    canvas.getContext('2d')?.drawImage(image.preview, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob || cancelado) return;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      },
      'image/jpeg',
      0.9,
    );

    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [image]);

  /*
    Assim que existe uma imagem, o usuário já decidiu que vai gerar um pôster. Buscar e
    compilar o worker agora, num momento ocioso, tira esse tempo da espera que começa no
    clique em "Gerar PDF".
  */
  useEffect(() => {
    if (!image) return;
    const agendar =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback
        : (fn: () => void) => setTimeout(fn, 300);
    const id = agendar(() => {
      void import('./services/posterPdf').then((m) => m.prepararWorker());
    });
    return () => {
      if (typeof cancelIdleCallback === 'function' && typeof id === 'number') {
        cancelIdleCallback(id);
      }
    };
  }, [image]);

  const calculo = useMemo(() => {
    if (!image) return null;

    // A margem pode estreitar a folha a ponto de invalidar a sobreposição escolhida.
    const page = paperSize(config.paper, config.orientation);
    const usavel = {
      width: page.width - 2 * config.margin,
      height: page.height - 2 * config.margin,
    };
    const overlap = Math.min(config.overlap, Math.max(0, Math.min(usavel.width, usavel.height) - 1));
    const base = {
      paper: config.paper,
      orientation: config.orientation,
      margin: config.margin,
      overlap,
    };

    const grade =
      config.modo === 'largura'
        ? gridForWidth(config.larguraCm * 10, image, base)
        : config.modo === 'tamanho'
          ? gridParaTamanho({ largura: config.larguraCm * 10, altura: config.alturaCm * 10 }, base)
          : { cols: config.cols, rows: config.rows };

    const layout = computeLayout({ ...base, ...grade });
    const projection = project(image, layout.poster, config.fit, focus, zoom);
    const tiles = buildTiles(layout, projection);

    return {
      layout,
      projection,
      tiles,
      quality: assessQuality(projection),
      renderDpi: clampRenderDpi(config.renderDpi, layout.usable),
    };
  }, [image, config, focus, zoom]);

  async function gerar() {
    if (!image || !calculo) return;
    setGerando(true);
    setErroPdf(null);
    setProgresso({ done: 0, total: calculo.tiles.length + (config.coverSheet ? 1 : 0) });

    try {
      // O jsPDF só é baixado quando o usuário decide gerar: são ~400 kB que não
      // fazem falta enquanto ele está só experimentando configurações.
      const { gerarPdf, downloadBlob } = await import('./services/posterPdf');
      const { blob } = await gerarPdf(
        image.bitmap,
        calculo.layout,
        calculo.tiles,
        {
          renderDpi: calculo.renderDpi,
          jpegQuality: 0.92,
          cropMarks: config.cropMarks,
          pageLabels: config.pageLabels,
          coverSheet: config.coverSheet,
          fileName: image.fileName,
          enhance: config.enhance,
          imageSize: { width: image.width, height: image.height },
        },
        setProgresso,
      );
      downloadBlob(blob, `${image.fileName}-poster.pdf`);
    } catch (e) {
      setErroPdf(
        'A geração falhou, provavelmente por falta de memória. Tente uma resolução menor ' +
          `ou menos folhas. (${e instanceof Error ? e.message : 'erro desconhecido'})`,
      );
    } finally {
      setGerando(false);
      setProgresso(null);
    }
  }

  const pronto = image && imageUrl && calculo;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      {pronto && (
        <Ficha
          config={config}
          ajustar={ajustar}
          layout={calculo.layout}
          projection={calculo.projection}
          quality={calculo.quality}
          image={image}
          imageUrl={imageUrl}
          focus={focus}
          onFocus={setFocus}
          zoom={zoom}
          onZoom={setZoom}
          onGerar={gerar}
          onTrocar={() => {
            image.bitmap.close();
            image.preview.close();
            setImage(null);
            setErroUpload(null);
          }}
          gerando={gerando}
          progresso={progresso}
          erro={erroPdf}
        />
      )}

      <main className="order-1 flex flex-1 flex-col px-5 py-8 sm:px-8 lg:order-2 lg:overflow-y-auto">
        {pronto ? (
          <>
            <div className="flex flex-1 items-center justify-center">
              <Palco
                layout={calculo.layout}
                tiles={calculo.tiles}
                projection={calculo.projection}
                image={image}
                imageUrl={imageUrl}
                chave={`${calculo.layout.cols}x${calculo.layout.rows}-${config.paper}-${config.orientation}`}
              />
            </div>
            <Rodape
              largura={calculo.layout.poster.width}
              altura={calculo.layout.poster.height}
              folhas={calculo.layout.pages}
              colunas={calculo.layout.cols}
              linhas={calculo.layout.rows}
              sobreposicao={calculo.layout.overlap}
              alvo={
                config.modo === 'tamanho'
                  ? { largura: config.larguraCm * 10, altura: config.alturaCm * 10 }
                  : null
              }
            />

            {/*
              O tamanho final é a resposta que o usuário está perseguindo ao mexer nos
              controles. Quem não vê a tela precisa ouvir que ele mudou.
            */}
            <p aria-live="polite" className="sr-only">
              Pôster de {(calculo.layout.poster.width / 10).toFixed(1)} por{' '}
              {(calculo.layout.poster.height / 10).toFixed(1)} centímetros, em{' '}
              {calculo.layout.pages} folhas. {calculo.quality.message}
            </p>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center py-6">
            <Convite onArquivo={receberArquivo} carregando={carregando} erro={erroUpload} />
          </div>
        )}
      </main>
    </div>
  );
}

interface RodapeProps {
  largura: number;
  altura: number;
  folhas: number;
  colunas: number;
  linhas: number;
  sobreposicao: number;
  /** Tamanho pedido no modo por tamanho, para comparar com o que saiu. */
  alvo: { largura: number; altura: number } | null;
}

/** Leitura do tamanho real e o essencial das instruções de impressão (req. 3.3 e 3.11). */
function Rodape({ largura, altura, folhas, colunas, linhas, sobreposicao, alvo }: RodapeProps) {
  // A grade é inteira, então o tamanho pedido quase nunca é atingível. Esconder essa
  // diferença faria o número grande do rodapé parecer uma promessa quebrada.
  const desvio = alvo
    ? Math.round(
        Math.max(
          Math.abs(largura - alvo.largura) / alvo.largura,
          Math.abs(altura - alvo.altura) / alvo.altura,
        ) * 100,
      )
    : 0;
  return (
    <footer className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-t border-grafite/20 pt-4">
      <p
        className="numero text-grafite"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'clamp(1.5rem, 3.4vw, 2.25rem)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {(largura / 10).toFixed(1).replace('.', ',')} × {(altura / 10).toFixed(1).replace('.', ',')}{' '}
        cm
        <span className="ml-3 text-base font-normal text-grafite/70">
          {folhas} folhas em {colunas} × {linhas}
          {alvo && desvio > 0 && (
            <>
              , pedido {(alvo.largura / 10).toFixed(0)} × {(alvo.altura / 10).toFixed(0)} cm com{' '}
              {desvio}% de desvio
            </>
          )}
        </span>
      </p>

      <ol className="max-w-md space-y-1 text-sm leading-snug text-grafite/80">
        <li>Imprima em escala de 100 %, com "Ajustar à página" desligado.</li>
        <li>Meça a régua da folha de montagem antes de imprimir o resto.</li>
        <li>
          {sobreposicao > 0
            ? `Recorte pelas marcas e sobreponha ${sobreposicao} mm entre folhas.`
            : 'Recorte pelas marcas e encoste as folhas sem sobrepor.'}
        </li>
      </ol>
    </footer>
  );
}
