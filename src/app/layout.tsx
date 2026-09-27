import type { Metadata, Viewport } from "next";
import { branding } from "@/config/branding";
import { cn } from "@/lib/utils";
import "./globals.css";

/**
 * Layout raiz.
 *
 * Server Component de proposito: e o unico lugar que roda no servidor para
 * TODAS as rotas, e nenhum de seus dados muda por interacao. Marcando aqui como
 * `"use client"`, a arvore inteira do app viraria client e o layout perderia o
 * que ele existe para prover: o `<html>` e o `<body>` sao renderizados no
 * servidor justamente para aparecer antes do JS.
 *
 * A cor da marca vive em `branding.ts`, e a cor por EMPRESA e injetada em
 * runtime (ver `src/app/(app)/layout.tsx`), porque so la se sabe o tenant da
 * sessao. Aqui so vai o fallback.
 */
export const metadata: Metadata = {
  title: {
    default: branding.name,
    template: `%s | ${branding.name}`,
  },
  description: branding.description,
  applicationName: branding.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: branding.name,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // `maximumScale: 1` e `userScalable: false` NAO sao usados de proposito:
  // impedir zoom quebra a acessibilidade de quem precisa ampliar a tela, e o
  // iOS ja ignora ambos no Safari 10+.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

/**
 * Aplica a paleta da marca.
 *
 * Funcao de servidor, sem estado e sem hook: escreve a variavel CSS no `<html>`
 * antes da hidratar. `suppressHydrationWarning` no `<html>` e o que impede o
 * React de reclamar quando o valor injetado no servidor difere do que o cliente
 * esperaria — e o motivo de o warning estar no `<html>` e nao num `<div>`:
 * ele precisa cobrir o elemento cujo atributo muda.
 */
function paletaDaMarca(atributo: string, cor: string) {
  return { [atributo]: cor } as React.CSSProperties;
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={cn("min-h-dvh bg-background font-sans antialiased")}
        style={{
          ...paletaDaMarca("--primary", branding.colors.primary),
          ...paletaDaMarca("--primary-foreground", branding.colors.primaryForeground),
          ...paletaDaMarca("--accent", branding.colors.accent),
          ...paletaDaMarca("--accent-foreground", branding.colors.accentForeground),
        }}
      >
        {children}
      </body>
    </html>
  );
}
