"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, LogOut, Settings } from "lucide-react";
import { encerrarSessao } from "@/server/app/auth";
import { branding } from "@/config/branding";

/**
 * Navegacao lateral do sistema.
 *
 * Client Component porque tem tres estados que so o navegador tem: qual item esta
 * aberto, se o menu de contexto esta aberto, e o que esta sendo enviado. Nenhum
 * dado de permissao e decidido aqui — os itens Below sao leitura de layout.
 *
 * O menu de contexto (trocar empresa/filial) envia `membershipId`/`branchId` que
 * a pagina montou. Trocar a empresa e uma Server Action e nao um `router.push`:
 * mudar de empresa muda o escopo de TODOS os dados seguintes, e um link deixaria
 * a sessao apontando para a empresa antiga enquanto a tela mostra a nova.
 */

interface ItemMenu {
  readonly href: string;
  readonly rotulo: string;
  readonly icone?: typeof Settings;
  readonly filhos?: readonly ItemMenu[];
}

export interface PropsNavLateral {
  readonly tenantName: string;
  readonly primaryColor: string | null;
  readonly userName: string;
  readonly userEmail: string;
  readonly isOwner: boolean;
  readonly branchName: string | null;
}

export function NavLateral(props: PropsNavLateral) {
  const [aberto, setAberto] = useState(false);
  const menu = itensDoMenu();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/30 lg:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          {iniciais(branding.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{props.tenantName}</p>
          <p className="truncate text-xs text-muted-foreground">{props.branchName ?? "Sem filial fixa"}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {menu.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
              >
                {item.icone ? <item.icone className="size-4" /> : null}
                {item.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="relative border-t p-2">
        {aberto ? (
          <div className="absolute bottom-full left-2 right-2 mb-2 rounded-md border bg-popover p-1 shadow-md">
            <LinkEscolherEmpresa />
            <BotaoTrocarFilial branchName={props.branchName} />
            <form action={encerrarSessao}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <LogOut className="size-4" />
                Sair
              </button>
            </form>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
            {iniciais(props.userName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{props.userName}</span>
            <span className="block truncate text-xs text-muted-foreground">{props.userEmail}</span>
          </span>
          {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </div>
    </aside>
  );
}

/**
 * Trocar de filial: so a filial ATUAL, que e a unica troca que faz sentido
 * enquanto se esta numa tela de negocio. A escolha completa vive em
 * `/escolher-filial`, que e a rota de verdade.
 */
function BotaoTrocarFilial({ branchName }: { branchName: string | null }) {
  return (
    <Link
      href="/escolher-filial"
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
    >
      <Building2 className="size-4" />
      {branchName ? "Trocar filial" : "Escolher filial"}
    </Link>
  );
}

/**
 * Trocar de empresa vai para a tela de escolha, e nao para um `<select>` aqui.
 *
 * A primeira versao deste componente tinha um select com as empresas, o que
 * parecia mais direto. Nao funciona: a nav so recebe `tenantName` (layout),
 * entao a lista de vinculos teria de ser carregada e refrescada a cada troca de
 * tela, e o `<select>` repetiria a logica de escolha que ja existe em
 * `/escolher-empresa` — duas copias do mesmo formulario, com a segunda
 * esquecendo de revalidar o vinculo. O link delega para a unica tela que tem
 * a lista correta.
 */
function LinkEscolherEmpresa() {
  return (
    <Link
      href="/escolher-empresa"
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
    >
      <Building2 className="size-4" />
      Trocar empresa
    </Link>
  );
}

/**
 * Menu da FASE 1.
 *
 * Os itens sao literais, e nao derivados de permissao: cada pagina criada ate
 * agora valida a propria permissao no servidor, entao esconder o item aqui
 * seria uma segunda fonte de verdade para o mesmo fato. A navegacao por
 * permissoes entra junto com os modulos de negocio, quando o item tiver uma
 * tela real atras dele.
 */
function itensDoMenu(): readonly ItemMenu[] {
  return [
    { href: "/dashboard", rotulo: "Visao geral" },
    { href: "/configuracoes", rotulo: "Configuracoes", icone: Settings, filhos: [] },
  ];
}

/** Iniciais para o avatar de texto. `undefined`/`''` produce string vazia, e nao lanca. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return (partes[0] ?? "").slice(0, 2).toUpperCase();
  return `${(partes[0] ?? "")[0] ?? ""}${(partes[partes.length - 1] ?? "")[0] ?? ""}`.toUpperCase();
}
