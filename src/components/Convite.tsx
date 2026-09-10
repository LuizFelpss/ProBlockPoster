import { useRef, useState } from 'react';
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, MAX_PIXELS, formatBytes } from '../services/image';

interface ConviteProps {
  onArquivo: (file: File) => void;
  carregando: boolean;
  erro: string | null;
}

/** Colunas e linhas do pôster desenhado no estado inicial. */
const COLUNAS = 3;
const LINHAS = 2;

/**
 * Estado inicial do palco.
 *
 * Mostra o resultado, não o processo: um pôster já montado, com as emendas cortando
 * a frase e as faixas de sobreposição visíveis. É o mesmo vocabulário do preview —
 * rosa só onde existe registro a acertar —, então a tela inicial já ensina a ler o app.
 */
export default function Convite({ onArquivo, carregando, erro }: ConviteProps) {
  const input = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);

  function receber(files: FileList | null) {
    const file = files?.[0];
    if (file) onArquivo(file);
  }

  const seamsVerticais = Array.from({ length: COLUNAS - 1 }, (_, i) => ((i + 1) / COLUNAS) * 100);
  const seamsHorizontais = Array.from({ length: LINHAS - 1 }, (_, i) => ((i + 1) / LINHAS) * 100);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        receber(e.dataTransfer.files);
      }}
      className="mx-auto w-full"
      style={{ maxWidth: '52rem' }}
    >
      <p
        className="mb-4 text-tinta"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}
      >
        Block Poster
      </p>

      <div
        className="folha relative w-full transition-transform duration-150"
        style={{
          aspectRatio: `${COLUNAS * 297} / ${LINHAS * 210}`,
          boxShadow: sobre
            ? '0 10px 24px rgb(16 31 92 / 0.26)'
            : '0 4px 14px rgb(16 31 92 / 0.20)',
          transform: sobre ? 'translateY(-3px)' : 'none',
        }}
        aria-hidden="true"
      >
        {seamsVerticais.map((esquerda) => (
          <span
            key={`v${esquerda}`}
            className="registro registro-vertical inset-y-0"
            style={{ left: `calc(${esquerda}% - 1.1%)`, width: '2.2%' }}
          />
        ))}
        {seamsHorizontais.map((topo) => (
          <span
            key={`h${topo}`}
            className="registro registro-horizontal inset-x-0"
            style={{ top: `calc(${topo}% - 1.6%)`, height: '3.2%' }}
          />
        ))}

        {seamsVerticais.map((esquerda) => (
          <span
            key={`lv${esquerda}`}
            className="pointer-events-none absolute inset-y-0 border-l border-grafite/25"
            style={{ left: `${esquerda}%` }}
          />
        ))}
        {seamsHorizontais.map((topo) => (
          <span
            key={`lh${topo}`}
            className="pointer-events-none absolute inset-x-0 border-t border-grafite/25"
            style={{ top: `${topo}%` }}
          />
        ))}

        <p
          className="pointer-events-none absolute inset-0 flex items-center px-[5%] text-tinta"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 'clamp(2rem, 6.4vw, 4.1rem)',
            lineHeight: 0.94,
            letterSpacing: '-0.025em',
            mixBlendMode: 'multiply',
          }}
        >
          Do tamanho da parede, em folhas comuns.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(e) => {
            receber(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={carregando}
          className="rounded-sm bg-tinta px-6 py-3 text-white transition-colors hover:bg-tinta-escura disabled:opacity-60"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.0625rem' }}
        >
          {carregando ? 'Abrindo a imagem…' : 'Escolher imagem'}
        </button>

        <p className="max-w-sm text-sm leading-snug text-grafite/70">
          Ou arraste um arquivo até aqui. JPG, PNG ou WebP, até {formatBytes(MAX_FILE_BYTES)} e{' '}
          {MAX_PIXELS / 1e6} megapixels. A imagem não sai do seu navegador.
        </p>
      </div>

      {erro && (
        <p role="alert" className="aviso mt-4 max-w-md text-registro">
          {erro}
        </p>
      )}
    </div>
  );
}
