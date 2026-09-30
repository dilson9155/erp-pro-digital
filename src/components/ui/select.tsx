import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * `<select>` nativo, estilizado.
 *
 * NATIVO DE PROPODITO, E O SHADCN/RADIX DE PROPODITO TAMBEM
 *
 * O `Select` do Radic (que ja esta no `package.json`) resolve um problema
 * especifico: renderizar um `<select>` dentro de uma `popover`, `dialog` ou
 * `combobox` multiplas, onde o elemento nativo escapa do portal e some.
 *
 * Nenhum dos modulos deste ERP tem esse problema. Todos os `<select>` desta
 * camada vivem num `<form>` de Server Component, e ali o elemento nativo e
 * superior em tres pontos que importam aqui:
 *
 * 1. **Funciona sem JavaScript.** O form depende de `action` de Server Action e
 *    o `<select>` nativo e o unico elemento que garante isso. Um trigger custom
 *    que abre lista precisa de `useState`, entao a tela quebra de forma
 *    silenciosa se o bundle falhar.
 * 2. **No celular, abre o seletor do sistema.** O teclado do Android e do iOS
 *    trata `<select>` com a roda nativa, que e o que a pessoa espera. Trigger
 *    custom obriga a abrir um teclado comum e digitar.
 * 3. **Acessibilidade de graca.** Navegar por setas, digitar a letra que comeca
 *    o rotulo e ler com leitor de tela sao comportamento do elemento nativo.
 *
 * O custo conhecido: nao da para filtrar enquanto digita. Para lista longa, o
 * caminho e a busca por texto ao lado — e e o que os dois cadastros grandes
 * (produto, cliente) usam.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

export { Select };
