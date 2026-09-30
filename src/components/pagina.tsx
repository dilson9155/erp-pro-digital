import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeTom, type TomBadge } from "@/components/ui/badge";

/**
 * Estrutura de pagina e de listagem.
 *
 * Estes tres componentes existem porque toda tela de cadastro tem a mesma
 * anatomia — titulo, acao principal, e uma tabela dentro de um cartao — e cada
 * uma escrever a propria versao produz uma diferenca de um pixel entre telas
 * que a pessoa vai usar em sequencia. Mais importante: o lugar do "botao Novo" e
 * do "estado vazio" passa a ser o mesmo, entao nenhuma tela de listagem fica sem
 * o caminho para criar o primeiro registro.
 *
 * Server Components. O filtro de texto das listagens grandes e `<form method="get">`,
 * que resolve a busca no servidor — mais rapido que filtrar no cliente e, no
 * ERP, mais correto: a lista do servidor ja esta limitada por tenant e por filial.
 */

export function CabecalhoPagina({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao ? <p className="text-sm text-muted-foreground">{descricao}</p> : null}
      </div>
      {acao ? <div className="flex items-center gap-2">{acao}</div> : null}
    </div>
  );
}

/**
 * Cartao de lista ou de secao.
 *
 * `titulo`/`descricao` sao opcionais e ficam ACIMA do conteudo, com borda
 * embaixo, e nao dentro dele. Uma tela de detalhe tem varias secoes no mesmo
 * cartao visual ("Itens", "Pagamentos", "Fechamento"), e cada uma precisa de um
 * rotulo: sem ele, a pessoa ve quatro listas de valores e nao sabe qual e a
 * soma da venda e qual e o custo. A borda separando o rotulo do conteudo tambem
 * evita que o titulo pareca um dado da tabela.
 *
 * A lista de cadastro nao passa `titulo`, porque o `CabecalhoPagina` acima dela
 * ja diz o que a tela e.
 */
export function CartaoLista({
  children,
  className,
  titulo,
  descricao,
}: {
  children: React.ReactNode;
  className?: string;
  titulo?: string;
  descricao?: string;
}) {
  return (
    <Card>
      {titulo ? (
        <div className="border-b px-3 py-2">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {descricao ? <p className="text-xs text-muted-foreground">{descricao}</p> : null}
        </div>
      ) : null}
      <CardContent className={cn("p-0", className)}>{children}</CardContent>
    </Card>
  );
}

/**
 * Estado vazio.
 *
 * A lista vazia de um ERP quase nunca e "sem dados": e "voce ainda nao cadastrou
 * nada", e a acao util e criar o primeiro. Por isso o estado vazio traz o botao
 * da acao principal, e nao so uma frase. Sem isso, quem chega no cadastro
 * vazio precisa descobrir sozinho que a proxima tela e "Novo" — e a primeira
 * coisa que uma pessoa nova esquece.
 */
export function EstadoVazio({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-14 text-center", className)}>
      <p className="font-medium">{titulo}</p>
      {descricao ? <p className="max-w-md text-sm text-muted-foreground">{descricao}</p> : null}
      {acao ? <div className="pt-1">{acao}</div> : null}
    </div>
  );
}

/** Rodape da listagem: quantos registros a consulta devolveu. */
export function RodapeLista({
  total,
  unidade = "registros",
  className,
}: {
  total: number;
  unidade?: string;
  className?: string;
}) {
  return (
    <p className={cn("px-3 py-2 text-xs text-muted-foreground", className)}>
      {total} {total === 1 ? unidade.replace(/s$/, "") : unidade}
      {total >= 50 ? " (limite de 50 por pagina)" : ""}
    </p>
  );
}

/** Badge de status pronto, com a cor ja escolhida. */
export function StatusBadge({ tom, children }: { tom: TomBadge; children: React.ReactNode }) {
  return <BadgeTom tom={tom}>{children}</BadgeTom>;
}
