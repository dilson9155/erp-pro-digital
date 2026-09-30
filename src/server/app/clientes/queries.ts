import type { Prisma } from "@/generated/prisma/client";
import type { Customer } from "@/generated/prisma/client";

import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";
import { somenteDigitos } from "@/lib/documento";
import { PersonType } from "@/generated/prisma/enums";

/**
 * Consultas de cliente.
 *
 * TRES DIFERENCAS EM RELACAO AOS CADASTROS DE CATALOGO
 *
 * 1. A CHAVE DE UNICIDADE E O DOCUMENTO, E O DOCUMENTO E OPCIONAL NO BANCO.
 *    Marca, unidade e categoria tem um `@@unique([tenantId, name])`; cliente
 *    tem `@@unique([tenantId, cpf])` e `@@unique([tenantId, cnpj])`, com
 *    `personType` decidindo qual dos dois recebe o valor. A mesma linha de
 *    cliente pode, portanto, ocupar uma coluna e nao ocupar a outra — e o
 *    schema exige o documento justamente para nao existir esse caso. Ver
 *    `linhaDeMesmoDocumento`.
 *
 * 2. A BUSCA ACEITA DOCUMENTO COM E SEM MASKARA. A coluna guarda so digitos, e
 *    quem busca digita "111.444.777-06" ou "11" ou um pedaco do nome. A
 *    busca por `contains` no campo de digitos receberia a mascara inteira e
 *    nao encontraria nada, entao o termo passa por `somenteDigitos` e a
 *    busca acontece sobre os dois campos de documento ao mesmo tempo.
 *
 * 3. OS DERIVADOS (`totalPurchased`, `totalDebt`, `purchaseCount`,
 *    `lastPurchaseAt`) NAO SAO FILTROS IMPLEMENTAVEIS COM `where` DO PRISMA
 *    QUE COMPARE COLUNAS. `totalDebt > 0` compara com constante e funciona, e
 *    por isso existe o filtro de "com saldo em aberto". Ja "comprou acima de
 *    X" compararia com a constante e seria um filtro sem uso aqui.
 */

/** Linha da listagem: o minimo para renderizar a tabela. */
export interface ClienteListagem {
  readonly id: string;
  readonly nome: string;
  readonly nomeFantasia: string | null;
  readonly personType: Customer["personType"];
  readonly documento: string | null;
  readonly documentoMascarado: string;
  readonly email: string | null;
  readonly telefone: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
  readonly active: boolean;
  readonly totalDebt: Customer["totalDebt"];
  readonly totalPurchased: Customer["totalPurchased"];
  readonly purchaseCount: number;
  readonly lastPurchaseAt: Date | null;
  /** Consentimento de marketing: `null` = nunca consentiu, tem a data quando consentiu. */
  readonly marketingConsentAt: Date | null;
}

export interface ListagemClientes {
  readonly clientes: readonly ClienteListagem[];
  readonly total: number;
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly busca: string;
  readonly filtroSaldo: FiltroSaldo;
  readonly incluirInativos: boolean;
}

export const TAMANHO_PAGINA = 50;

/**
 * Filtros de situacao financeira.
 *
 * A SEPARACAO ENTRE O QUE E FILTRO E O QUE NAO E
 *
 * `comSaldo` e implementavel e util: e a fila de trabalho do financeiro, quem
 * tem valor a receber de um cliente especifico. `totalDebt > 0` compara coluna
 * com constante, e o `@@index([tenantId, totalDebt])` existe exatamente para
 * isso.
 *
 * `semContato` (cliente sem telefone e sem e-mail) NAO esta aqui, e a ausencia
 * e deliberada, como no filtro de estoque do produto. O Prisma nao expressa
 * "nenhuma das colunas e nao nula": exigiria `{ phone: null, email: null }` com
 * `AND` sobre o mesmo registro, o que o `where` tipado tambem nao permite sem
 * lista com `NOT`. Trago a discussao completa em `produtos/queries.ts`; o
 * resumo e que as saidas alternativas (filtrar no aplicativo quebra a
 * paginacao; `$queryRaw` desvia da extensao de tenant) sao piores.
 */
export const FILTROS_SALDO = {
  todos: "todos",
  comSaldo: "com_saldo",
} as const;

export type FiltroSaldo = (typeof FILTROS_SALDO)[keyof typeof FILTROS_SALDO];

export function ehFiltroSaldo(valor: string): valor is FiltroSaldo {
  return Object.values(FILTROS_SALDO).some((f) => f === valor);
}

export function filtroDeSaldo(filtro: FiltroSaldo): Prisma.CustomerWhereInput {
  switch (filtro) {
    case FILTROS_SALDO.comSaldo:
      return { totalDebt: { gt: 0 } };
    case FILTROS_SALDO.todos:
    default:
      return {};
  }
}

/**
 * `where` de busca, com o termo normalizado.
 *
 * O termo entra em `name`, `tradeName`, `email` e nos DOIS campos de documento.
 * Nos de documento so quando sobra digito depois de `somenteDigitos`: uma
 * busca por "Joao" nao pode virar `{ cpf: "1" }` e trazer o cliente cujo CPF
 * comeca com 1. Esse era o comportamento antes do campo de digitos aparecer na
 * busca.
 */
export function filtroBusca(busca: string): Prisma.CustomerWhereInput {
  const termo = busca.trim();
  if (termo === "") return {};

  const digitos = somenteDigitos(termo);
  const condicoes: Prisma.CustomerWhereInput[] = [
    { name: { contains: termo, mode: "insensitive" } },
    { tradeName: { contains: termo, mode: "insensitive" } },
    { email: { contains: termo, mode: "insensitive" } },
  ];

  // So e busca por documento quando o termo TEM digito. Um termo misto ("Joao
  // 11") vira "11" aqui e buscaria por CPF 11..., o que e plausivel como
  // intencao; o caso que precisa ser barrado e o termo sem digito algum.
  if (digitos !== "") {
    condicoes.push(
      { cpf: { contains: digitos } },
      { cnpj: { contains: digitos } },
      // `phone` e `whatsapp` guardam digitos tambem (o schema normaliza no
      // `superRefine`/`transform`), entao busca por telefone e por digito puro.
      { phone: { contains: digitos } },
      { whatsapp: { contains: digitos } },
      { zipCode: { contains: digitos } },
    );
  }

  return { OR: condicoes };
}

export async function listarClientes(
  scope: TenantScope,
  entrada: {
    busca?: string;
    pagina?: number;
    incluirInativos?: boolean;
    saldo?: FiltroSaldo;
  } = {},
): Promise<ListagemClientes> {
  const busca = entrada.busca?.trim() ?? "";
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const saldo = entrada.saldo ?? FILTROS_SALDO.todos;
  const where: Prisma.CustomerWhereInput = {
    deletedAt: null,
    ...(entrada.incluirInativos ? {} : { active: true }),
    ...filtroBusca(busca),
    ...filtroDeSaldo(saldo),
  };

  return withTenantDb(scope, async (db) => {
    const [clientes, total] = await Promise.all([
      db.customer.findMany({
        where,
        // Ativo primeiro, depois por nome. `totalDebt` nao entra na
        // ordenacao de proposito: a lista e de consulta por nome, e ordenar
        // por saldo mudaria a ordem a cada recebimento, com a pessoa
        // procurando um cliente pelo mesmo lugar e nao o achando.
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
          whatsapp: true,
          city: true,
          state: true,
          active: true,
          totalDebt: true,
          totalPurchased: true,
          purchaseCount: true,
          lastPurchaseAt: true,
          marketingConsentAt: true,
        },
      }),
      db.customer.count({ where }),
    ]);

    return {
      clientes: clientes.map((c) => ({
        id: c.id,
        nome: c.name,
        nomeFantasia: c.tradeName,
        personType: c.personType,
        documento: c.cpf ?? c.cnpj,
        documentoMascarado: formatarDocumentoColuna(c.cpf, c.cnpj),
        email: c.email,
        telefone: c.phone ?? c.whatsapp,
        cidade: c.city,
        uf: c.state,
        active: c.active,
        totalDebt: c.totalDebt,
        totalPurchased: c.totalPurchased,
        purchaseCount: c.purchaseCount,
        lastPurchaseAt: c.lastPurchaseAt,
        marketingConsentAt: c.marketingConsentAt,
      })),
      total,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
      busca,
      filtroSaldo: saldo,
      incluirInativos: entrada.incluirInativos ?? false,
    };
  });
}

/**
 * Cliente inteiro para a tela de edicao.
 *
 * O retorno e um tipo PROPRIO, e nao `Customer`. O `select` e deliberado — a
 * tela nao precisa de `tags` (array de texto de filtro futuro), de
 * `defaultPaymentTermsId` (nenhum modulo de pagamento existe) nem de
 * `ibgeCode` (derivado de consulta de CEP que ainda nao existe) — e declarar o
 * retorno como `Customer` obrigaria a devolver colunas que nao tem uso. O tipo
 * proprio tambem protege: campo novo no schema nao aparece aqui sem decisao, em
 * vez de vira `undefined` silencioso na tela.
 */
export interface ClienteDetalhe {
  readonly id: string;
  readonly name: string;
  readonly tradeName: string | null;
  readonly personType: Customer["personType"];
  readonly cpf: string | null;
  readonly cnpj: string | null;
  readonly documentRaw: string | null;
  readonly stateRegistration: string | null;
  readonly municipalRegistration: string | null;
  readonly birthDate: Date | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly whatsapp: string | null;
  readonly marketingConsentAt: Date | null;
  readonly zipCode: string | null;
  readonly street: string | null;
  readonly streetNumber: string | null;
  readonly streetComplement: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly state: Customer["state"];
  readonly creditLimit: Customer["creditLimit"];
  readonly notes: string | null;
  readonly active: boolean;
  readonly totalPurchased: Customer["totalPurchased"];
  readonly totalDebt: Customer["totalDebt"];
  readonly purchaseCount: number;
  readonly lastPurchaseAt: Date | null;
}

export async function buscarCliente(
  scope: TenantScope,
  id: string,
): Promise<ClienteDetalhe | null> {
  return withTenantDb(scope, (db) =>
    db.customer.findFirst({
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
        birthDate: true,
        email: true,
        phone: true,
        whatsapp: true,
        marketingConsentAt: true,
        zipCode: true,
        street: true,
        streetNumber: true,
        streetComplement: true,
        district: true,
        city: true,
        state: true,
        creditLimit: true,
        notes: true,
        active: true,
        totalPurchased: true,
        totalDebt: true,
        purchaseCount: true,
        lastPurchaseAt: true,
      },
    }),
  );
}

/**
 * Linha com o MESMO documento, com ou sem `deletedAt`.
 *
 * A busca e feita nos DOIS campos e comparada no aplicativo, como nos outros
 * cadastros. A alternativa seria `where: { OR: [{ cpf: doc }, { cnpj: doc }] }`,
 * que parece mais direta e tem um problema: ela nao normaliza. O schema grava o
 * documento JA SEM MASKARA, mas a coluna pode ter sido alimentada por carga de
 * XML — o proprio modelo tem `documentRaw` para "valor original do XML quando
 * nao bate com CPF/CNPJ", o que prova que dado externo entra. Comparar no
 * aplicativo cobre o registro inserido fora do formulario.
 *
 * Sem filtro de `deletedAt`: e a linha excluida que precisa ser restaurada,
 * porque continua ocupando o `@@unique`. Ver `server/app/unicidade.ts`.
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
    const candidatas = await db.customer.findMany({
      where: ignorarId ? { id: { not: ignorarId } } : {},
      select: { id: true, personType: true, cpf: true, cnpj: true, deletedAt: true, active: true },
    });

    return (
      candidatas.find((c) => {
        // So compara quem tem documento do MESMO tipo. Um CPF e um CNPJ com os
        // mesmos digitos sao pessoas diferentes, e o indice unico e por coluna:
        // sao dois `@@unique` independentes e nao se excluem.
        if (c.personType !== personType) return false;
        const daLinha = personType === PersonType.FISICA ? c.cpf : c.cnpj;
        return daLinha !== null && somenteDigitos(daLinha) === alvo;
      }) ?? null
    );
  });
}

/**
 * Mascara do documento para exibicao.
 *
 * A coluna guarda digitos; a tela mostra pontuar. Fica aqui, e nao na pagina,
 * porque a mesma formatacao e usada na listagem e na edicao, e as duas precisam
 * concordar: a coluna da listagem mostra "111.444.777-06" e a edicao tem que
 * devolver o mesmo texto no campo, senao a pessoa ve um numero diferente do que
 * esta gravado.
 */
function formatarDocumentoColuna(cpf: string | null, cnpj: string | null): string {
  const documento = cpf ?? cnpj;
  if (documento === null) return "";
  const digitos = somenteDigitos(documento);
  if (digitos.length === 11) return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digitos.length === 14) return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return documento;
}

/**
 * Opcoes de cliente para o `<select>` de outro modulo.
 *
 * Sem esta funcao, quem precisar listar clientes em um select — o modulo de
 * venda, quando existir — abriria a tabela de clientes e traria colunas que nao
 * sao de interesse. `withTenantDb` ja restringe ao tenant da operacao.
 */
export async function opcoesCliente(
  scope: TenantScope,
  entrada: { busca?: string; incluirInativos?: boolean; limite?: number } = {},
): Promise<readonly { readonly value: string; readonly rotulo: string }[]> {
  const busca = entrada.busca?.trim() ?? "";
  return withTenantDb(scope, async (db) => {
    const clientes = await db.customer.findMany({
      where: {
        deletedAt: null,
        ...(entrada.incluirInativos ? {} : { active: true }),
        ...filtroBusca(busca),
      },
      orderBy: { name: "asc" },
      take: entrada.limite ?? 200,
      select: { id: true, name: true, tradeName: true, cpf: true, cnpj: true, active: true },
    });

    return clientes.map((c) => {
      const documento = formatarDocumentoColuna(c.cpf, c.cnpj);
      const rotulo = [c.tradeName ?? c.name, documento].filter((p) => p !== "").join(" · ");
      return { value: c.id, rotulo: c.active ? rotulo : `${rotulo} (inativo)` };
    });
  });
}
