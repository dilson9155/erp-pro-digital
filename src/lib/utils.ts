import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina classes Tailwind resolvendo conflito.
 *
 * O `clsx` sozinho concatena, e o `twMerge` sozinho nao aceita condicional. O
 * par resolve os dois casos, que e o que o `cva` e o `cn` de cada componente
 * precisam: `cn("p-2", condicional && "p-4")` tem de dar `p-4`, e nao as duas.
 *
 * A ordem importa: `twMerge` precisa vir DEPOIS do `clsx`, porque ele so enxerga
 * a lista ja montada. Invertido, ele receberia um unico argumento e nao
 * resolveria conflito nenhum — o que passaria despercebido ate alguem esperar que
 * a ultima classe vencesse.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
