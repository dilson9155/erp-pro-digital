import Link from "next/link";
import { branding } from "@/config/branding";

/**
 * Layout das telas públicas (login, escolha de empresa, escolha de filial, troca
 * de senha, acesso bloqueado).
 *
 * LAYOUT APRESENTACIONAL, SEM REDIRECT — e a ausencia do `redirect` e a decisao.
 *
 * A primeira versao deste arquivo mandava para o app quem ja tinha sessao com
 * `tenantId`. Isso e um `redirect` de LAYOUT, e layout cobre o grupo INTEIRO, o
 * que inclui as telas que Precisam ser vistas por quem tem sessao:
 *
 * - `/trocar-senha`: a pessoa tem `mustChangePassword` ligado e sessao com
 *   empresa. O layout a jogava em `/escolher-filial`; aquele layout via
 *   `decidirAcesso` e a mandava de volta para `/trocar-senha`. Loop.
 * - `/acesso-bloqueado?motivo=sem_vinculo_com_a_empresa`: mesma coisa, sessao com
 *   empresa e vinculo morto. Loop igual.
 *
 * O padrao e o mesmo que o `policy.ts` descreve para o proxy: uma regra escrita
 * para "as telas do grupo" e um grupo com telas de estados diferentes. A regra
 * correta nao e "tem sessao? entao vai para o app", e "esta rota especifica, com
 * sessao, vai para ONDE" — e isso so a propria pagina sabe.
 *
 * Entao: quem tem sessao e abre `/login` e_redirecionado_ pela pagina de login,
 * e nao por aqui. O layout so cuida do moldura.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4">
          <Link href="/" className="font-semibold tracking-tight">
            {branding.name}
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        {branding.name} — {branding.tagline}
      </footer>
    </div>
  );
}
