import Link from "next/link";
import type { Metadata } from "next";
import { encerrarSessao } from "@/server/app/auth";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MotivoNegativa } from "@/server/app/auth";

export const metadata: Metadata = { title: "Acesso bloqueado" };

/**
 * Tela de acesso negado.
 *
 * O motivo vem da QUERY STRING, nao de um banco de dados: `decidirAcesso` ja
 * conhece a traducao de cada `MotivoNegativa` para texto, e duplicar esse mapa
 * aqui seria a segunda versao da regra. A tela recebe o codigo, mostra o texto do
 * modulo de politica e nao inventa nada.
 *
 * Por que ficar em `(auth)` e nao em `(app)`: em `(app)` o layout exigiria
 * empresa e filial antes de renderizar, e quem chega aqui esta sem uma das duas
 * (ou sem vinculo) — o layout jogaria para `/escolher-empresa` e nunca mostraria
 * a explicacao.
 */
export default async function PageAcessoBloqueado({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const texto = textoDoMotivo(isMotivo(motivo) ? motivo : null);

  return (
    <div className="w-full max-w-md space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Acesso indisponivel</CardTitle>
          <CardDescription>{texto.descricao}</CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{texto.orientacao}</p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/login">Voltar ao login</Link>
          </Button>
          <form action={encerrarSessao}>
            <Button type="submit" variant="ghost">
              Sair
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * So aceita os codigos do union type. `searchParams` e entrada de usuario: sem
 * esta checagem, o texto viria de um mapa e o TypeScript aceitaria, e a pagina
 * passaria a explicar motivos que a politica nao produziu.
 */
function isMotivo(valor: string | undefined): valor is MotivoNegativa {
  return valor === "conta_nao_ativa" || valor === "sem_vinculo_com_a_empresa";
}

function textoDoMotivo(motivo: MotivoNegativa | null): { descricao: string; orientacao: string } {
  switch (motivo) {
    case "conta_nao_ativa":
      return {
        descricao: "Sua conta esta inativa, bloqueada ou aguardando ativacao.",
        orientacao: "Fale com o administrador da sua empresa para reativar o acesso.",
      };
    case "sem_vinculo_com_a_empresa":
      return {
        descricao: "Seu usuario esta ativo, mas o vinculo com esta empresa nao esta mais valido.",
        orientacao:
          "O vinculo pode ter sido removido ou desativado depois que a sessao foi criada. Entre com outro usuario ou peça um novo vinculo.",
      };
    default:
      return {
        descricao: "Nao foi possivel liberar o acesso para esta sessao.",
        orientacao: "Entre novamente. Se o problema continuar, fale com o suporte.",
      };
  }
}