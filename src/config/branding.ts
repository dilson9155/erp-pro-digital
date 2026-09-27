/**
 * Identidade visual do produto.
 *
 * NOME PROVISORIO. Este arquivo e a fonte de verdade do front-end. Para
 * rebranding, altere aqui e nas variaveis `NEXT_PUBLIC_APP_*` do `.env`.
 * Nada de nome de produto hardcoded em componentes: sempre importe daqui.
 */

export const branding = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "ERP PRO Digital",
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE ?? "Gestao completa para sua empresa",
  supportEmail:
    process.env.NEXT_PUBLIC_APP_SUPPORT_EMAIL ?? "suporte@erpprodigital.com.br",

  /** Descricao usada em metadata do Next.js e no PWA manifest. */
  description:
    "ERP SaaS multi-tenant com vendas, estoque, financeiro e emissao fiscal para o mercado brasileiro.",

  /**
   * Paleta padrao. A cor primaria por empresa vive em `Tenant.primaryColor` e
   * sobrescreve este valor via CSS custom property `--primary` (ver
   * `src/app/layout.tsx`). O valor abaixo e apenas o fallback da marca.
   */
  colors: {
    primary: "hsl(222 47% 31%)",
    primaryForeground: "hsl(210 40% 98%)",
    accent: "hsl(210 40% 96%)",
    accentForeground: "hsl(222 47% 11%)",
    destructive: "hsl(0 72% 51%)",
    destructiveForeground: "hsl(210 40% 98%)",
    border: "hsl(214 32% 91%)",
    input: "hsl(214 32% 91%)",
    ring: "hsl(222 47% 31%)",
    background: "hsl(0 0% 100%)",
    foreground: "hsl(222 47% 11%)",
    muted: "hsl(210 40% 96%)",
    mutedForeground: "hsl(215 16% 47%)",
    popover: "hsl(0 0% 100%)",
    popoverForeground: "hsl(222 47% 11%)",
    card: "hsl(0 0% 100%)",
    cardForeground: "hsl(222 47% 11%)",
  },

  /** Locale e moeda padrao. Sobrescritos por `Tenant.locale`/`Tenant.currency`. */
  locale: "pt-BR",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
} as const;

export type Branding = typeof branding;
