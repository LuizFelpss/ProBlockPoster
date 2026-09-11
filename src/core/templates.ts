import type { AlvoDeTamanho } from './layout';
import type { Size } from './types';

/**
 * Tamanho de pôster pronto (RF-021).
 *
 * O tamanho é guardado como lado maior e lado menor, não como largura e altura. A
 * orientação não é propriedade do tamanho e sim da imagem que vai ocupá-lo: quem
 * escolhe "A0" com uma foto deitada quer um A0 deitado, e não deveria precisar dizer
 * isso. Guardar largura e altura fixas obrigaria a interface a girar o par depois, o
 * que é a mesma decisão tomada num lugar pior.
 */
export interface Template {
  id: string;
  rotulo: string;
  /** Por que este tamanho está na lista — é o que distingue um atalho de um número solto. */
  nota: string;
  /** Lado maior e lado menor do pôster, em mm. */
  maior: number;
  menor: number;
}

/**
 * A lista é curta de propósito. Cada entrada responde a um destino concreto do pôster —
 * uma parede, uma moldura que já existe, um vão de dois metros. Uma biblioteca de
 * dezenas de tamanhos devolveria ao usuário exatamente a dúvida que o atalho existe
 * para eliminar.
 */
export const TEMPLATES: Template[] = [
  { id: 'a2', rotulo: 'A2', nota: 'cartaz de parede', maior: 594, menor: 420 },
  { id: 'a1', rotulo: 'A1', nota: 'pôster de cinema', maior: 841, menor: 594 },
  { id: 'a0', rotulo: 'A0', nota: 'cartaz de rua', maior: 1189, menor: 841 },
  { id: 'moldura-30-40', rotulo: '30 × 40', nota: 'moldura de prateleira', maior: 400, menor: 300 },
  { id: 'moldura-50-70', rotulo: '50 × 70', nota: 'moldura de parede', maior: 700, menor: 500 },
  { id: 'quadrado-60', rotulo: 'Quadrado', nota: '60 × 60 cm', maior: 600, menor: 600 },
  { id: 'faixa-200-40', rotulo: 'Faixa', nota: 'dois metros de comprimento', maior: 2000, menor: 400 },
];

/**
 * Tolerância do reconhecimento, em mm.
 *
 * O alvo volta da interface em centímetros com uma casa decimal, então 841 mm chega de
 * volta como 84,1 cm e reconstitui 841 mm exatos — mas um décimo de milímetro de
 * diferença não pode desmarcar o atalho que o usuário acabou de clicar.
 */
const TOLERANCIA_MM = 1;

/** O tamanho pedido que este atalho representa para esta imagem. */
export function alvoDoTemplate(template: Template, imagem: Size): AlvoDeTamanho {
  const deitada = imagem.width > imagem.height;

  return deitada
    ? { largura: template.maior, altura: template.menor }
    : { largura: template.menor, altura: template.maior };
}

/**
 * Qual atalho corresponde ao tamanho pedido agora, ou `null` quando o usuário digitou
 * um tamanho seu. Serve para a ficha marcar o atalho ativo em vez de deixar todos
 * apagados logo depois de um deles ter sido clicado.
 */
export function templateDoAlvo(alvo: AlvoDeTamanho, imagem: Size): Template | null {
  return (
    TEMPLATES.find((template) => {
      const esperado = alvoDoTemplate(template, imagem);
      return (
        Math.abs(esperado.largura - alvo.largura) <= TOLERANCIA_MM &&
        Math.abs(esperado.altura - alvo.altura) <= TOLERANCIA_MM
      );
    }) ?? null
  );
}
