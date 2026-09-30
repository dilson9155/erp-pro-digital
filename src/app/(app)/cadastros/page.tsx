import Link from "next/link";
import { ArrowRight, Construction } from "lucide-react";

import { CATALOGO } from "@/lib/rbac/catalogo";
import { CartaoLista, CabecalhoPagina } from "@/components/pagina";
import { Badge } from "@/components/ui/badge";
import { obterContextoOperacao, podeOperar } from "@/server/app/sessao";

/**
 * Indice de cadastros.
 *
 * DERIVADO DO CATALOGO DE PERMISSOES, E NAO DE UMA LISTA NA MAO
 *
 * A lista de cadastros do produto ja existe: e `CATALOGO`, o mesmo arquivo que o
 * seed sincroniza no banco e que a tela de perfis desenha. Escrever aqui uma
 * lista propria criaria uma segunda fonte de verdade, e as duas divergiriam
 * silenciosamente — o catalogo ganharia um recurso, o seed criaria a permissao,
 * e esta tela continuaria mostrando que o cadastro nao existe.
 *
 * `disponivel: false` marca o que ainda nao tem tela. A tela mostra esses itens
 * como "em breve" em vez de esconder, por uma razao pratica: quem esta avaliando
 * o sistema precisa saber o que ele promete, e quem esta usando precisa entender
 * por que o cadastro sumiu do menu depois de existir no plano.
 */
const DISPONIVEIS: Readonly<Record<string, string>> = {
  unidade: "/cadastros/unidades",
  categoria: "/cadastros/categorias",
  marca: "/cadastros/marcas",
  produto: "/cadastros/produtos",
  cliente: "/cadastros/clientes",
  fornecedor: "/cadastros/fornecedores",
};

export default async function PaginaCadastros() {
  const ctx = await obterContextoOperacao();

  const cadastros = CATALOGO.filter((item) => item.grupo === "Cadastros");

  const itens = await Promise.all(
    cadastros.map(async (item) => {
      const leitura = await podeOperar(ctx.rbac, {
        modulo: item.modulo,
        recurso: item.recurso,
        acao: "read",
      });
      return { item, leitura };
    }),
  );

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Cadastros"
        descricao="A base que os demais modulos usam. Unidade e produto primeiro; cliente pode vir em qualquer ordem."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {itens.map(({ item, leitura }) => {
          const href = DISPONIVEIS[item.recurso];

          // Sem permissao de leitura, o item NAO vira link. Diferente do menu
          // lateral — que e navegacao literal — aqui a lista inteira e o
          // catalogo, e expor o que existe sem poder abrir seria publicar o
          // inventario de uma empresa.
          if (href === undefined || !leitura) {
            return (
              <div
                key={item.recurso}
                className="flex items-start justify-between gap-3 rounded-lg border border-dashed p-4 opacity-70"
              >
                <div className="space-y-1">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {leitura ? "Tela em construcao." : "Voce nao tem acesso a este cadastro."}
                  </p>
                </div>
                <Badge className="shrink-0 border-border bg-muted text-muted-foreground">
                  <Construction className="size-3" />
                  {leitura ? "Em breve" : "Restrito"}
                </Badge>
              </div>
            );
          }

          return (
            <Link
              key={item.recurso}
              href={href}
              className="group flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
            >
              <div className="space-y-1">
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.acoes.length} acoes disponiveis</p>
              </div>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>

      <CartaoLista>
        <div className="p-6 text-sm text-muted-foreground">
          A ordem importa: produto exige unidade, e unidade exige simbolo e casas
          decimais. Cadastrar a unidade depois do produto deixa o item sem
          quantidade valida, e a correcao passa a ser manual em cada registro.
        </div>
      </CartaoLista>
    </div>
  );
}
