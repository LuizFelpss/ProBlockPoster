import { useId, useRef } from 'react';
import { ZOOM_MAXIMO, ZOOM_MINIMO } from '../core/fit';
import type { FitMode, Focus, Projection, Size } from '../core/types';

interface MapaRecorteProps {
  imageUrl: string;
  image: Size;
  projection: Projection;
  fit: FitMode;
  focus: Focus;
  onFocus: (focus: Focus) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
}

/**
 * Mostra qual parte da imagem entra no pôster e qual é descartada (req. 3.4), e deixa
 * ajustar recorte (RF-019) e zoom (RF-020).
 *
 * O mapa é arrastável com o ponteiro, mas quem comanda de verdade são os controles
 * abaixo dele: um `input range` nativo já vem com teclado, leitor de tela e valor
 * anunciado. Uma área de arrasto com `role="slider"` seria mentira — slider é um
 * controle de um eixo só, e este tem dois.
 */
export default function MapaRecorte({
  imageUrl,
  image,
  projection,
  fit,
  focus,
  onFocus,
  zoom,
  onZoom,
}: MapaRecorteProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const descricaoId = useId();
  const { source } = projection;

  const fracaoLargura = source.width / image.width;
  const fracaoAltura = source.height / image.height;
  const podeAndarX = fracaoLargura < 0.999;
  const podeAndarY = fracaoAltura < 0.999;
  const recortaAlgo = podeAndarX || podeAndarY;
  const arrastavel = fit === 'preencher' && recortaAlgo;

  function mover(clientX: number, clientY: number) {
    const el = caixa.current;
    if (!el || !arrastavel) return;
    const r = el.getBoundingClientRect();
    const px = (clientX - r.left) / r.width;
    const py = (clientY - r.top) / r.height;

    onFocus({
      x: podeAndarX ? clamp((px - fracaoLargura / 2) / (1 - fracaoLargura)) : 0.5,
      y: podeAndarY ? clamp((py - fracaoAltura / 2) / (1 - fracaoAltura)) : 0.5,
    });
  }

  const descricao =
    fit === 'ajustar'
      ? 'A imagem inteira entra no pôster. Sobra papel em branco nas laterais.'
      : recortaAlgo
        ? 'A área clara entra no pôster. Arraste o mapa ou use os controles abaixo.'
        : 'A imagem tem a mesma proporção da grade: nada é descartado.';

  return (
    <div>
      <div
        ref={caixa}
        role="img"
        aria-label={`Mapa do recorte. ${Math.round(fracaoLargura * fracaoAltura * 100)} por cento da imagem entra no pôster.`}
        onPointerDown={(e) => {
          if (!arrastavel) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          mover(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) mover(e.clientX, e.clientY);
        }}
        className="relative w-full touch-none overflow-hidden bg-tinta-escura/40"
        style={{
          aspectRatio: `${image.width} / ${image.height}`,
          cursor: arrastavel ? 'grab' : 'default',
        }}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-cover opacity-40"
        />
        <div
          className="absolute overflow-hidden"
          style={{
            left: `${(source.x / image.width) * 100}%`,
            top: `${(source.y / image.height) * 100}%`,
            width: `${fracaoLargura * 100}%`,
            height: `${fracaoAltura * 100}%`,
            outline: '2px solid var(--color-registro)',
          }}
        >
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{
              left: `${(-source.x / source.width) * 100}%`,
              top: `${(-source.y / source.height) * 100}%`,
              width: `${(image.width / source.width) * 100}%`,
              height: `${(image.height / source.height) * 100}%`,
            }}
          />
        </div>
      </div>

      <p id={descricaoId} className="ficha-legenda mt-2">
        {descricao}
      </p>

      {fit === 'preencher' && (
        <div className="mt-3 space-y-2">
          <Deslizante
            rotulo="Zoom"
            valor={zoom}
            min={ZOOM_MINIMO}
            max={ZOOM_MAXIMO}
            passo={0.05}
            formatar={(v) => `${v.toFixed(2).replace('.', ',')}×`}
            aoMudar={onZoom}
            descrito={descricaoId}
          />
          {podeAndarX && (
            <Deslizante
              rotulo="Posição horizontal"
              valor={focus.x}
              min={0}
              max={1}
              passo={0.01}
              formatar={(v) => `${Math.round(v * 100)}%`}
              aoMudar={(v) => onFocus({ ...focus, x: v })}
              descrito={descricaoId}
            />
          )}
          {podeAndarY && (
            <Deslizante
              rotulo="Posição vertical"
              valor={focus.y}
              min={0}
              max={1}
              passo={0.01}
              formatar={(v) => `${Math.round(v * 100)}%`}
              aoMudar={(v) => onFocus({ ...focus, y: v })}
              descrito={descricaoId}
            />
          )}
          {zoom > ZOOM_MINIMO && (
            <button
              type="button"
              onClick={() => {
                onZoom(ZOOM_MINIMO);
                onFocus({ x: 0.5, y: 0.5 });
              }}
              className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100"
            >
              Voltar ao enquadramento original
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface DeslizanteProps {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  formatar: (valor: number) => string;
  aoMudar: (valor: number) => void;
  descrito: string;
}

function Deslizante({
  rotulo,
  valor,
  min,
  max,
  passo,
  formatar,
  aoMudar,
  descrito,
}: DeslizanteProps) {
  return (
    <label className="block">
      <span className="ficha-legenda flex items-baseline justify-between gap-2">
        {rotulo}
        <span className="numero">{formatar(valor)}</span>
      </span>
      <input
        type="range"
        className="deslizante"
        min={min}
        max={max}
        step={passo}
        value={valor}
        aria-describedby={descrito}
        aria-valuetext={formatar(valor)}
        onChange={(e) => aoMudar(Number(e.target.value))}
      />
    </label>
  );
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}
