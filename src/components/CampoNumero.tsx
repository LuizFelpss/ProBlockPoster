import { useEffect, useState, type ReactNode } from 'react';

interface CampoNumeroProps {
  rotulo: ReactNode;
  valor: number;
  aoMudar: (valor: number) => void;
  min: number;
  max: number;
  passo?: number;
  /** Arredonda para inteiro ao confirmar. */
  inteiro?: boolean;
  legenda?: ReactNode;
  className?: string;
}

/**
 * Campo numérico que aceita ficar vazio enquanto se digita.
 *
 * A versão anterior escrevia `Math.max(1, Number(valor))` a cada tecla. Apagar o campo
 * fazia `Number('')` virar 0, o mínimo entrava no lugar, e o campo se reescrevia sozinho
 * na hora — quem quisesse trocar 1 por 6 acabava com 16, porque o 1 voltava antes do 6
 * ser digitado.
 *
 * Aqui o texto digitado vive em estado próprio. Ele só vira número quando é um número
 * válido dentro da faixa, e o ajuste aos limites acontece ao sair do campo, não a cada
 * tecla. Digitar é uma operação em andamento; corrigir no meio dela atrapalha.
 */
export default function CampoNumero({
  rotulo,
  valor,
  aoMudar,
  min,
  max,
  passo = 1,
  inteiro = false,
  legenda,
  className,
}: CampoNumeroProps) {
  const [texto, setTexto] = useState(() => String(valor));
  const [editando, setEditando] = useState(false);

  // Enquanto o campo está sendo editado, quem manda é o que a pessoa digitou.
  useEffect(() => {
    if (!editando) setTexto(String(valor));
  }, [valor, editando]);

  function digitou(bruto: string) {
    setTexto(bruto);

    if (bruto.trim() === '') return;
    const numero = Number(bruto);
    if (!Number.isFinite(numero)) return;
    // Fora da faixa não propaga, mas continua visível: quem digita "1" a caminho de
    // "150" não pode ver o campo saltar para o mínimo no meio do caminho.
    if (numero < min || numero > max) return;

    aoMudar(inteiro ? Math.round(numero) : numero);
  }

  function saiu() {
    setEditando(false);
    const numero = Number(texto);
    const valido = texto.trim() !== '' && Number.isFinite(numero);
    const ajustado = valido ? Math.min(max, Math.max(min, numero)) : valor;
    const final = inteiro ? Math.round(ajustado) : ajustado;

    setTexto(String(final));
    if (final !== valor) aoMudar(final);
  }

  return (
    <label className={className}>
      <span className="ficha-legenda">{rotulo}</span>
      <input
        type="number"
        className="campo numero"
        inputMode={inteiro ? 'numeric' : 'decimal'}
        min={min}
        max={max}
        step={passo}
        value={texto}
        onFocus={() => setEditando(true)}
        onChange={(e) => digitou(e.target.value)}
        onBlur={saiu}
      />
      {legenda && <span className="ficha-legenda mt-1 block">{legenda}</span>}
    </label>
  );
}
