import * as React from "react";

import { cn } from "@/lib/utils";

/** Etiqueta de estado. Para "Ativo", "Cancelada", "Pago" — nunca para acoes. */
const Badge = React.forwardRef<HTMLSpanElement, React.ComponentProps<"span">>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

/**
 * Variacao de estado, com cor derivada de semantica e nao de estetica.
 *
 * `tom` e um conjunto pequeno de nomes ("ok", "atencao", "perigo", "neutro"), e
 * nao uma cor. O motivo e operacional: o mesmo status aparece em quinze telas, e
 * `className="text-green-600"` em cada uma garante que a situacao ficasse verde
 * na listagem e cinza no detalhe. Nomeando a intencao, a cor e um detalhe que
 * muda num lugar so.
 */
export type TomBadge = "ok" | "atencao" | "perigo" | "neutro" | "info";

const TONS: Record<TomBadge, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  atencao: "border-amber-200 bg-amber-50 text-amber-700",
  perigo: "border-red-200 bg-red-50 text-red-700",
  neutro: "border-border bg-muted text-muted-foreground",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export function BadgeTom({ tom, children }: { tom: TomBadge; children: React.ReactNode }) {
  return <Badge className={TONS[tom]}>{children}</Badge>;
}

export { Badge };
