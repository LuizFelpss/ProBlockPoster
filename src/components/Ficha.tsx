import type { ReactNode } from 'react';
import type { Config } from '../config';
import { ALTURA_MAXIMA_CM, LARGURA_MAXIMA_CM, MARGEM_MAXIMA_MM } from '../config';
import { forcaParaBlocagem } from '../core/deblock';
import { melhorEncaixe, type AlvoDeTamanho, type Encaixe } from '../core/layout';
import { MIN_MARGIN_MM, OVERLAP_OPTIONS_MM, PAPERS, PAPER_IDS } from '../core/paper';
import {
  DPI_ADEQUADO,
  MAX_RENDER_DPI,
  MIN_RENDER_DPI,
  estimatePdfBytes,
  larguraParaDpi,
  maxRenderDpi,
} from '../core/quality';
import { TEMPLATES, alvoDoTemplate, templateDoAlvo } from '../core/templates';
import type { Melhoria, Orientation, PaperId, PosterLayout, Projection, Size } from '../core/types';
import type { QualityReport } from '../core/quality';
import type { PdfProgress } from '../services/pdf';
import { formatBytes } from '../services/image';
import { BYTES_DA_REDE, redeDisponivel } from '../services/superres';
import CampoNumero from './CampoNumero';
import MapaRecorte from './MapaRecorte';
import type { Focus } from '../core/types';

interface FichaProps {
  config: Config;
  ajustar: (patch: Partial<Config>) => void;
  layout: PosterLayout;
  projection: Projection;
  quality: QualityReport;
  image: Size & { blocagem: number };
  imageUrl: string;
  focus: Focus;
  onFocus: (focus: Focus) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  onGerar: () => void;
  onTrocar: () => void;
  gerando: boolean;
  progresso: PdfProgress | null;
  erro: string | null;
}

/** Painel de configuração: uma ficha de impressão, não um formulário genérico. */
export default function Ficha(props: FichaProps) {
  const { config, ajustar, layout, quality, progresso, gerando } = props;

  const dpiMaximo = Math.min(MAX_RENDER_DPI, maxRenderDpi(layout.usable));
  const dpisDisponiveis = [150, 200, 250, 300].filter(
    (d) => d >= MIN_RENDER_DPI && d <= dpiMaximo,
  );
  const sobreposicoesValidas = OVERLAP_OPTIONS_MM.filter(
    (o) => o < layout.usable.width && o < layout.usable.height,
  );
  // Campo vazio ou zerado não pode virar divisão por zero na busca de encaixe.
  const alvo: AlvoDeTamanho = {
    largura: Math.max(10, config.larguraCm * 10),
    altura: Math.max(10, config.alturaCm * 10),
  };
  const encaixe = melhorEncaixe(alvo, { margin: layout.margin, overlap: layout.overlap });
  // Só faz sentido marcar um atalho como ativo no modo em que ele manda: nos outros
  // o tamanho não vem mais da largura e da altura pedidas.
  const templateAtivo = config.modo === 'tamanho' ? templateDoAlvo(alvo, props.image) : null;

  const compressaoDetectada = forcaParaBlocagem(props.image.blocagem) > 0;
  /*
    A rede só é oferecida onde há WebGPU. Em CPU a mesma inferência leva cerca de 37
    segundos por megapixel de origem — uma folha passaria de um minuto, e o usuário não
    teria como prever isso antes de esperar.
  */
  const temRede = redeDisponivel();

  const larguraSaudavel = larguraParaDpi(props.projection, layout.poster.width);
  // Um pôster não pode ser menor que a área imprimível de uma folha.
  const menorPosterPossivel = layout.usable.width;
  const sugestaoAlcancavel = larguraSaudavel >= menorPosterPossivel;
  const tamanhoEstimado = estimatePdfBytes(
    layout.pages + (config.coverSheet ? 1 : 0),
    layout.usable,
    config.renderDpi,
  );

  return (
    // No celular a ficha vem depois do preview: ninguém quer rolar por todos os
    // controles antes de ver o pôster.
    <div className="order-2 flex flex-col gap-6 bg-tinta px-6 py-6 text-white lg:order-1 lg:h-full lg:w-[22rem] lg:flex-none lg:overflow-y-auto">
      <header className="flex items-baseline justify-between gap-3">
        <h1
          className="text-white"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.5rem',
            letterSpacing: '-0.02em',
          }}
        >
          Block Poster
        </h1>
        <button
          type="button"
          onClick={props.onTrocar}
          className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100"
        >
          Trocar imagem
        </button>
      </header>

      <Bloco titulo="Papel">
        <div className="segmento" role="group" aria-label="Tamanho do papel">
          {PAPER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={config.paper === id}
              onClick={() => ajustar({ paper: id })}
            >
              {PAPERS[id].label}
            </button>
          ))}
        </div>
        <div className="segmento mt-2" role="group" aria-label="Orientação do papel">
          <button
            type="button"
            aria-pressed={config.orientation === 'retrato'}
            onClick={() => ajustar({ orientation: 'retrato' })}
          >
            Retrato
          </button>
          <button
            type="button"
            aria-pressed={config.orientation === 'paisagem'}
            onClick={() => ajustar({ orientation: 'paisagem' })}
          >
            Paisagem
          </button>
        </div>
      </Bloco>

      <Bloco titulo="Tamanho do pôster">
        <div className="segmento" role="group" aria-label="Como definir o tamanho">
          <button
            type="button"
            aria-pressed={config.modo === 'largura'}
            onClick={() => ajustar({ modo: 'largura' })}
          >
            Largura
          </button>
          <button
            type="button"
            aria-pressed={config.modo === 'tamanho'}
            onClick={() =>
              ajustar({
                modo: 'tamanho',
                // Entra com a altura que o pôster tem agora, para o modo começar
                // exatamente de onde o usuário estava.
                alturaCm: Math.round(layout.poster.height / 10),
                larguraCm: Math.round(layout.poster.width / 10),
              })
            }
          >
            Tamanho
          </button>
          <button
            type="button"
            aria-pressed={config.modo === 'grade'}
            onClick={() => ajustar({ modo: 'grade', cols: layout.cols, rows: layout.rows })}
          >
            Folhas
          </button>
        </div>

        {/*
          Atalhos para os tamanhos que as pessoas realmente pedem. Sem eles, quem quer um
          A0 precisa saber que A0 tem 84,1 × 118,9 cm — e quem não sabe acaba digitando um
          número redondo qualquer.
        */}
        <fieldset className="mt-3">
          <legend className="ficha-legenda">Tamanhos prontos</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPLATES.map((template) => {
              const alvoDele = alvoDoTemplate(template, props.image);
              return (
                <button
                  key={template.id}
                  type="button"
                  className="chip"
                  aria-pressed={templateAtivo?.id === template.id}
                  aria-label={`${template.rotulo}, ${formatPar(alvoDele.largura, alvoDele.altura)}: ${template.nota}`}
                  onClick={() =>
                    ajustar({
                      modo: 'tamanho',
                      larguraCm: alvoDele.largura / 10,
                      alturaCm: alvoDele.altura / 10,
                    })
                  }
                >
                  {template.rotulo}
                </button>
              );
            })}
          </div>
          <p className="ficha-legenda mt-2">
            {templateAtivo ? (
              <>
                {templateAtivo.rotulo} em{' '}
                {props.image.width > props.image.height ? 'paisagem' : 'retrato'},{' '}
                {templateAtivo.nota}:{' '}
                <span className="numero">{formatPar(alvo.largura, alvo.altura)}</span>.
              </>
            ) : (
              'Cada atalho já vem na orientação da sua imagem e preenche largura e altura.'
            )}
          </p>
        </fieldset>

        {config.modo === 'largura' ? (
          <CampoNumero
            className="mt-3 block"
            rotulo="Largura final, em centímetros"
            valor={config.larguraCm}
            aoMudar={(larguraCm) => ajustar({ larguraCm })}
            min={5}
            max={LARGURA_MAXIMA_CM}
            legenda="A altura sai da proporção da imagem. O sistema arredonda para a grade mais próxima e mostra a largura real abaixo."
          />
        ) : config.modo === 'tamanho' ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <CampoNumero
                rotulo="Largura, em cm"
                valor={config.larguraCm}
                aoMudar={(larguraCm) => ajustar({ larguraCm })}
                min={1}
                max={LARGURA_MAXIMA_CM}
              />
              <CampoNumero
                rotulo="Altura, em cm"
                valor={config.alturaCm}
                aoMudar={(alturaCm) => ajustar({ alturaCm })}
                min={1}
                max={ALTURA_MAXIMA_CM}
              />
            </div>
            <p className="ficha-legenda mt-2">
              Aqui a proporção é sua, não da imagem. A imagem se acomoda pelo
              enquadramento: recorta em Preencher, sobra papel em Ajustar.
            </p>
            <Recomendacao
              encaixe={encaixe}
              alvo={{ largura: config.larguraCm * 10, altura: config.alturaCm * 10 }}
              atual={{ paper: config.paper, orientation: config.orientation, pages: layout.pages }}
              aoAplicar={() =>
                ajustar({ paper: encaixe.paper, orientation: encaixe.orientation })
              }
            />
          </>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <CampoNumero
              rotulo="Colunas"
              valor={config.cols}
              aoMudar={(cols) => ajustar({ cols })}
              min={1}
              max={40}
              inteiro
            />
            <CampoNumero
              rotulo="Linhas"
              valor={config.rows}
              aoMudar={(rows) => ajustar({ rows })}
              min={1}
              max={40}
              inteiro
            />
          </div>
        )}
      </Bloco>

      <Bloco titulo="Impressão">
        <CampoNumero
          className="block"
          rotulo={`Margem, em milímetros — mínimo ${MIN_MARGIN_MM}, porque impressoras não imprimem até a borda`}
          valor={config.margin}
          aoMudar={(margin) => ajustar({ margin })}
          min={MIN_MARGIN_MM}
          max={MARGEM_MAXIMA_MM}
          inteiro
        />

        <fieldset className="mt-4">
          <legend className="ficha-legenda">Sobreposição entre folhas, em milímetros</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {sobreposicoesValidas.map((mm) => (
              <button
                key={mm}
                type="button"
                className="chip numero"
                aria-pressed={config.overlap === mm}
                onClick={() => ajustar({ overlap: mm })}
              >
                {mm}
              </button>
            ))}
          </div>
        </fieldset>
      </Bloco>

      <Bloco titulo="Enquadramento">
        <div className="segmento" role="group" aria-label="Como a imagem se ajusta ao pôster">
          <button
            type="button"
            aria-pressed={config.fit === 'preencher'}
            onClick={() => ajustar({ fit: 'preencher' })}
          >
            Preencher
          </button>
          <button
            type="button"
            aria-pressed={config.fit === 'ajustar'}
            onClick={() => ajustar({ fit: 'ajustar' })}
          >
            Ajustar
          </button>
        </div>
        <div className="mt-3">
          <MapaRecorte
            imageUrl={props.imageUrl}
            image={props.image}
            projection={props.projection}
            fit={config.fit}
            focus={props.focus}
            onFocus={props.onFocus}
            zoom={props.zoom}
            onZoom={props.onZoom}
          />
        </div>
      </Bloco>

      <Bloco titulo="Saída">
        <label className="block">
          <span className="ficha-legenda">Resolução de impressão</span>
          <select
            className="campo"
            value={config.renderDpi}
            onChange={(e) => ajustar({ renderDpi: Number(e.target.value) })}
          >
            {dpisDisponiveis.map((dpi) => (
              <option key={dpi} value={dpi}>
                {dpi} dpi{dpi === 200 ? ' — recomendado' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 space-y-1">
          <label className="interruptor">
            <input
              type="checkbox"
              checked={config.coverSheet}
              onChange={(e) => ajustar({ coverSheet: e.target.checked })}
            />
            <span className="text-sm">Folha de montagem com régua de conferência</span>
          </label>
          <label className="interruptor">
            <input
              type="checkbox"
              checked={config.cropMarks}
              onChange={(e) => ajustar({ cropMarks: e.target.checked })}
            />
            <span className="text-sm">Marcas de corte</span>
          </label>
          <label className="interruptor">
            <input
              type="checkbox"
              checked={config.pageLabels}
              onChange={(e) => ajustar({ pageLabels: e.target.checked })}
            />
            <span className="text-sm">Numeração das folhas</span>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="ficha-legenda">Como ampliar a imagem</span>
          <select
            className="campo"
            value={config.melhoria}
            onChange={(e) => ajustar({ melhoria: e.target.value as Melhoria })}
          >
            <option value="navegador">Filtro do navegador — mais rápido</option>
            <option value="lanczos">Lanczos e nitidez — recomendado</option>
            <option value="rede" disabled={!temRede}>
              Rede neural{temRede ? '' : ' — precisa de WebGPU'}
            </option>
          </select>
        </label>
        <p className="ficha-legenda mt-2">{LEGENDA_DA_MELHORIA[config.melhoria]}</p>

        {/*
          A rede custa download e tempo, e os dois precisam ser ditos antes de o usuário
          clicar em gerar — descobrir depois é o mesmo que não ter sido avisado.
        */}
        {config.melhoria === 'rede' && (
          <p className="ficha-legenda mt-2 border-l-2 border-registro pl-2">
            Baixa cerca de <span className="numero">{formatBytes(BYTES_DA_REDE)}</span> na
            primeira vez e leva alguns segundos por folha. O modelo roda na sua máquina: a
            imagem continua sem sair do navegador.
          </p>
        )}

        {/*
          O app não age em silêncio: se detectou compressão e vai filtrar, diz. E se a
          melhoria está desligada, diz que o problema existe e não será tratado.
        */}
        {compressaoDetectada && (
          <p className="ficha-legenda mt-2 border-l-2 border-white/30 pl-2">
            {config.melhoria === 'lanczos' &&
              'Esta imagem tem marcas de compressão forte. Os blocos de 8 × 8 do JPEG serão suavizados antes da ampliação, senão virariam quadrados de alguns milímetros no papel.'}
            {config.melhoria === 'rede' &&
              'Esta imagem tem marcas de compressão forte. A rede foi treinada sobre imagens comprimidas e desfaz os blocos por conta própria, então o filtro de blocagem sai do caminho.'}
            {config.melhoria === 'navegador' &&
              'Esta imagem tem marcas de compressão forte. Com o filtro do navegador, os blocos do JPEG vão para o papel ampliados como estão.'}
          </p>
        )}
      </Bloco>

      {quality.level !== 'adequada' && (
        <div
          className="aviso"
          style={{ color: quality.level === 'baixa' ? 'var(--color-registro)' : 'white' }}
        >
          <p>
            {quality.message} <span className="numero">({quality.dpi} dpi no tamanho final)</span>
          </p>
          {/*
            Reclamar do dpi sem dizer o que fazer deixa o problema no colo do usuário.
            O dpi é inversamente proporcional ao tamanho, então existe uma resposta
            exata: até que largura esta imagem aguenta.
          */}
          <p className="mt-1.5">
            {sugestaoAlcancavel ? (
              <>
                Para chegar a {DPI_ADEQUADO} dpi, imprima até cerca de{' '}
                <span className="numero">{formatCm(larguraSaudavel)}</span> de largura.{' '}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() =>
                    ajustar({
                      modo: 'largura',
                      larguraCm: Math.max(1, Math.floor(larguraSaudavel / 10)),
                    })
                  }
                >
                  Usar esse tamanho
                </button>
              </>
            ) : (
              // O menor pôster possível é uma folha. Abaixo disso não há o que sugerir,
              // e oferecer um tamanho inalcançável seria prometer o que não se cumpre.
              <>
                Nem uma folha única chega a {DPI_ADEQUADO} dpi com esta imagem: o menor
                pôster possível tem <span className="numero">{formatCm(menorPosterPossivel)}</span>{' '}
                de largura. Dá para imprimir assim mesmo, mas o ganho viria de uma imagem
                maior.
              </>
            )}
          </p>
        </div>
      )}

      {props.erro && (
        <p role="alert" className="aviso text-registro">
          {props.erro}
        </p>
      )}

      <div className="mt-auto pt-2">
        <button
          type="button"
          className="botao-gerar"
          onClick={props.onGerar}
          disabled={gerando}
        >
          {gerando && progresso
            ? `Gerando folha ${progresso.done + 1} de ${progresso.total}${
                progresso.etapa ? ` — ${progresso.etapa}` : '…'
              }`
            : 'Gerar PDF'}
        </button>
        <p className="ficha-legenda mt-2 text-center">
          {layout.pages + (config.coverSheet ? 1 : 0)} páginas, cerca de{' '}
          <span className="numero">{formatBytes(tamanhoEstimado)}</span>
        </p>

        {gerando && progresso && (
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/25"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progresso.total}
            aria-valuenow={progresso.done}
          >
            <div
              className="h-full bg-registro transition-[width] duration-150"
              style={{ width: `${(progresso.done / progresso.total) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface RecomendacaoProps {
  encaixe: Encaixe;
  alvo: AlvoDeTamanho;
  atual: { paper: PaperId; orientation: Orientation; pages: number };
  aoAplicar: () => void;
}

/**
 * Qual papel e orientação chegam mais perto do tamanho pedido.
 *
 * Não é enfeite: um banner de 200 × 42 cm sai em 7 folhas A3 em paisagem e em 14 folhas
 * A4 em retrato, e a opção de menos folhas ainda fica mais perto do alvo. Ninguém
 * descobre isso sozinho testando combinação por combinação.
 */
function Recomendacao({ encaixe, alvo, atual, aoAplicar }: RecomendacaoProps) {
  const jaEstaNoMelhor =
    encaixe.paper === atual.paper && encaixe.orientation === atual.orientation;
  const desvio = Math.round(encaixe.erro * 100);
  const tamanho = formatPar(encaixe.poster.width, encaixe.poster.height);

  return (
    <p className="ficha-legenda mt-3 border-l-2 border-white/30 pl-2">
      {jaEstaNoMelhor ? (
        <>
          Este papel já é o melhor encaixe para {formatPar(alvo.largura, alvo.altura)}:{' '}
          <span className="numero">{tamanho}</span> em{' '}
          <span className="numero">{encaixe.pages}</span>{' '}
          {encaixe.pages === 1 ? 'folha' : 'folhas'}, {desvio}% de desvio.
        </>
      ) : (
        <>
          {PAPERS[encaixe.paper].label} em {encaixe.orientation} chega mais perto:{' '}
          <span className="numero">{tamanho}</span> em{' '}
          <span className="numero">{encaixe.pages}</span>{' '}
          {encaixe.pages === 1 ? 'folha' : 'folhas'} ({desvio}% de desvio), contra{' '}
          <span className="numero">{atual.pages}</span> folhas agora.{' '}
          <button type="button" className="underline underline-offset-4" onClick={aoAplicar}>
            Trocar o papel
          </button>
        </>
      )}
    </p>
  );
}

function formatPar(larguraMm: number, alturaMm: number): string {
  return `${(larguraMm / 10).toFixed(1).replace('.', ',')} × ${formatCm(alturaMm)}`;
}

function formatCm(mm: number): string {
  return `${(mm / 10).toFixed(1).replace('.', ',')} cm`;
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2
        className="mb-2 border-b border-white/25 pb-1 text-white"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem' }}
      >
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const LEGENDA_DA_MELHORIA: Record<Melhoria, string> = {
  navegador: 'A ampliação fica por conta do filtro interno do navegador, mais rápido e mais mole.',
  lanczos:
    'Usa Lanczos no lugar do filtro do navegador e compensa o borrão de tinta e papel. Deixa a geração mais lenta.',
  rede: 'Uma rede de super-resolução refaz os pixels que faltam. Limpa marcas de compressão melhor que o resto, mas alisa textura fina — em foto pequena e comprimida ganha; em imagem já boa, não.',
};
