import type { Prisma } from "@/generated/prisma/client";
import type { Supplier } from "@/generated/prisma/client";
import { PersonType } from "@/generated/prisma/enums";

import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";
import { somenteDigitos } from "@/lib/documento";

/**
 * Consultas de fornecedor.
 *
 * A ESTRUTURA E A DE `clientes/queries.ts`, E A DIVERENCIA PRECISA: a coluna de
 * valor e `totalPurchased` com o sentido INVERTIDO.
 *
 * No cliente, `totalPurchased` e quanto a PESSOA comprou da empresa. No
 * fornecedor, e quanto a EMPRESA comprou dele. A coluna tem o mesmo nome e o
 * significado oposto, e por isso as duas listagens nao podem mostrar o mesmo
 * rotulo: "Total comprado" em cliente e "Total comprado de nos" em fornecedor
 * seria ambigo demais para quem le as duas telas na mesma hora.
 *
 * Por isso aqui nao ha filtro de "com saldo": `totalDebt` do fornecedor e conta a
 * PAGAR, e quem precisa da fila de trabalho e quem faz o pagamento, no modulo
 * financeiro. A lista mostra o valor e o prazo medio de entrega, que e o dado
 * que o comprador consulta.
 */

/** Linha da listagem: o minimo para renderizar a tabela. */
export interface FornecedorListagem {
  readonly id: string;
  readonly nome: string;
  readonly nomeFantasia: string | null;
  readonly personType: Supplier["personType"];
  readonly documento: string | null;
  readonly documentoMascarado: string;
  readonly email: string | null;
  readonly telefone: string | null;
  readonly nomeContato: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
  readonly active: boolean;
  readonly totalPurchased: Supplier["totalPurchased"];
  readonly purchaseCount: number;
  readonly averageLeadTimeDays: number;
}

export interface ListagemFornecedores {
  readonly fornecedores: readonly FornecedorListagem[];
  readonly total: number;
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly busca: string;
  readonly incluirInativos: boolean;
}

export const TAMANHO_PAGINA = 50;

/**
 * `where` de busca, com o termo normalizado.
 *
 * Mesma regra do cliente: as colunas de documento, telefone e CEP guardam SO
 * digitos, entao o termo passa por `somenteDigitos` antes de virar `contains`.
 * A condicao so entra quando sobra digito — sem isso, "Bosch" viraria
 * `{ cnpj: { contains: "" } }` e a busca passaria a trazer qualquer coisa.
 */
export function filtroBusca(busca: string): Prisma.SupplierWhereInput {
  const termo = busca.trim();
  if (termo === "") return {};

  const digitos = somenteDigitos(termo);
  const condicoes: Prisma.SupplierWhereInput[] = [
    { name: { contains: termo, mode: "insensitive" } },
    { tradeName: { contains: termo, mode: "insensitive" } },
    { email: { contains: termo, mode: "insensitive" } },
    // `contactName` entra na busca porque quem liga para o fornecedor lembra do
    // nome do interlocutor, e nao da razao social — "falar com o Sr. Paulo".
    { contactName: { contains: termo, mode: "insensitive" } },
  ];

  if (digitos !== "") {
    condicoes.push(
      { cpf: { contains: digitos } },
      { cnpj: { contains: digitos } },
      { phone: { contains: digitos } },
      { whatsapp: { contains: digitos } },
      { zipCode: { contains: digitos } },
    );
  }

  return { OR: condicoes };
}

export async function listarFornecedores(
  scope: TenantScope,
  entrada: { busca?: string; pagina?: number; incluirInativos?: boolean } = {},
): Promise<ListagemFornecedores> {
  const busca = entrada.busca?.trim() ?? "";
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const where: Prisma.SupplierWhereInput = {
    deletedAt: null,
    ...(entrada.incluirInativos ? {} : { active: true }),
    ...filtroBusca(busca),
  };

  return withTenantDb(scope, async (db) => {
    const [fornecedores, total] = await Promise.all([
      db.supplier.findMany({
        where,
        // Ativo primeiro, depois por nome. `totalPurchased` nao ordena: a lista
        // e de consulta por nome, e ordenar por valor mudaria a ordem a cada
        // compra, com a pessoa procurando o mesmo fornecedor e nao achando.
        orderBy: [{ active: "desc" }, { name: "asc" }],
        skip: (pagina - 1) * TAMANHO_PAGINA,
        take: TAMANHO_PAGINA,
        select: {
          id: true,
          name: true,
          tradeName: true,
          personType: true,
          cpf: true,
          cnpj: true,
          email: true,
          phone: true,
          contactName: true,
          city: true,
          state: true,
          active: true,
          totalPurchased: true,
          purchaseCount: true,
          averageLeadTimeDays: true,
        },
      }),
      db.supplier.count({ where }),
    ]);

    return {
      fornecedores: fornecedores.map((f) => ({
        id: f.id,
        nome: f.name,
        nomeFantasia: f.tradeName,
        personType: f.personType,
        documento: f.cpf ?? f.cnpj,
        documentoMascarado: formatarDocumentoColuna(f.cpf, f.cnpj),
        email: f.email,
        telefone: f.phone ?? f.email,
        nomeContato: f.contactName,
        cidade: f.city,
        uf: f.state,
        active: f.active,
        totalPurchased: f.totalPurchased,
        purchaseCount: f.purchaseCount,
        averageLeadTimeDays: f.averageLeadTimeDays,
      })),
      total,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
      busca,
      incluirInativos: entrada.incluirInativos ?? false,
    };
  });
}

/**
 * Fornecedor inteiro para a tela de edicao.
 *
 * Tipo PROPRIO, e nao `Supplier`, pelo mesmo motivo do cliente: o `select` e
 * deliberado, e declarar o retorno como `Supplier` obrigaria a devolver
 * `tags`, `countryCode` e `totalDebt` sem nenhum uso na tela — ou pior, deixaria
 * um campo novo aparecer ali sem ninguem ter decidido.
 */
export interface FornecedorDetalhe {
  readonly id: string;
  readonly name: string;
  readonly tradeName: string | null;
  readonly personType: Supplier["personType"];
  readonly cpf: string | null;
  readonly cnpj: string | null;
  readonly documentRaw: string | null;
  readonly stateRegistration: string | null;
  readonly municipalRegistration: string | null;
  readonly contactName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly whatsapp: string | null;
  readonly zipCode: string | null;
  readonly street: string | null;
  readonly streetNumber: string | null;
  readonly streetComplement: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly state: Supplier["state"];
  readonly bankName: string | null;
  readonly bankCode: string | null;
  readonly agency: string | null;
  readonly agencyDigit: string | null;
  readonly accountNumber: string | null;
  readonly accountDigit: string | null;
  readonly pixKeyType: string | null;
  readonly pixKey: string | null;
  readonly notes: string | null;
  readonly active: boolean;
  readonly totalPurchased: Supplier["totalPurchased"];
  readonly purchaseCount: number;
  readonly lastPurchaseAt: Date | null;
  readonly averageLeadTimeDays: number;
}

export async function buscarFornecedor(
  scope: TenantScope,
  id: string,
): Promise<FornecedorDetalhe | null> {
  return withTenantDb(scope, (db) =>
    db.supplier.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        tradeName: true,
        personType: true,
        cpf: true,
        cnpj: true,
        documentRaw: true,
        stateRegistration: true,
        municipalRegistration: true,
        contactName: true,
        email: true,
        phone: true,
        whatsapp: true,
        zipCode: true,
        street: true,
        streetNumber: true,
        streetComplement: true,
        district: true,
        city: true,
        state: true,
        bankName: true,
        bankCode: true,
        agency: true,
        agencyDigit: true,
        accountNumber: true,
        accountDigit: true,
        pixKeyType: true,
        pixKey: true,
        notes: true,
        active: true,
        totalPurchased: true,
        purchaseCount: true,
        lastPurchaseAt: true,
        averageLeadTimeDays: true,
      },
    }),
  );
}

/**
 * Linha com o MESMO documento, com ou sem `deletedAt`.
 *
 * Sem filtro de `deletedAt`: a linha excluida continua ocupando o `@@unique` e
 * precisa ser restaurada, nao ignorada. Ver `server/app/unicidade.ts`.
 *
 * A comparacao e no aplicativo e nao em `where: { OR: [{ cpf: doc }, { cnpj: doc }] }`
 * pela mesma razao do cliente: dado vindo de carga de XML precisa ser comparado
 * ja normalizado, e o proprio modelo tem `documentRaw` para provar que dado
 * externo entra.
 */
export async function linhaDeMesmoDocumento(
  scope: TenantScope,
  personType: PersonType,
  documento: string,
  ignorarId?: string,
): Promise<{ id: string; deletedAt: Date | null; active: boolean } | null> {
  const alvo = somenteDigitos(documento);
  if (alvo === "") return null;

  return withTenantDb(scope, async (db) => {
    const candidatas = await db.supplier.findMany({
      where: ignorarId ? { id: { not: ignorarId } } : {},
      select: { id: true, personType: true, cpf: true, cnpj: true, deletedAt: true, active: true },
    });

    return (
      candidatas.find((f) => {
        if (f.personType !== personType) return false;
        const daLinha = personType === PersonType.FISICA ? f.cpf : f.cnpj;
        return daLinha !== null && somenteDigitos(daLinha) === alvo;
      }) ?? null
    );
  });
}

/**
 * Mascara do documento para exibicao.
 *
 * Mesma funcao, em codigo, da de `clientes/queries.ts` — e o motivo dela ser
 * repetida em vez de importada e o que costuma falhar nesse tipo de duplicacao:
 * dois copies divergem no primeiro ajuste. Nao ha ganho real em mover 8 linhas
 * para um modulo novo, e o comentario da funcao registra o porque.
 */
function formatarDocumentoColuna(cpf: string | null, cnpj: string | null): string {
  const documento = cpf ?? cnpj;
  if (documento === null) return "";
  const digitos = somenteDigitos(documento);
  if (digitos.length === 11) return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digitos.length === 14) return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return documento;
}

/** Opcoes de fornecedor para o `<select>` de outro modulo (compras). */
export async function opcoesFornecedor(
  scope: TenantScope,
  entrada: { busca?: string; incluirInativos?: boolean; limite?: number } = {},
): Promise<readonly { readonly value: string; readonly rotulo: string }[]> {
  const busca = entrada.busca?.trim() ?? "";
  return withTenantDb(scope, async (db) => {
    const fornecedores = await db.supplier.findMany({
      where: {
        deletedAt: null,
        ...(entrada.incluirInativos ? {} : { active: true }),
        ...filtroBusca(busca),
      },
      orderBy: { name: "asc" },
      take: entrada.limite ?? 200,
      select: { id: true, name: true, tradeName: true, cpf: true, cnpj: true, active: true },
    });

    return fornecedores.map((f) => {
      const documento = formatarDocumentoColuna(f.cpf, f.cnpj);
      const rotulo = [f.tradeName ?? f.name, documento].filter((p) => p !== "").join(" · ");
      return { value: f.id, rotulo: f.active ? rotulo : `${rotulo} (inativo)` };
    });
  });
}
