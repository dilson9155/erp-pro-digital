import type { Prisma } from "@/generated/prisma/client";

import { withTenantDb } from "@/server/db/scoped";
import type { TenantScope } from "@/server/db/tenant-scope";

/**
 * Numeracao sequencial de documentos.
 *
 * Este arquivo implementa a regra 7 do `schema.prisma`:
 *
 *   "Toda entidade numerada tem indice unico composto e o numero e alocado
 *    dentro de transacao com lock pessimista sobre `NumberSequence`"
 *
 * A tabela e a linha (a 2387) ja existiam; o que nao existia era a logica.
 *
 * POR QUE LOCK E NAO "MAX + 1"
 *
 * `SELECT max(number) + 1` e o jeitinho que toda pessoa escreve primeiro, e ele
 * esta errado de um jeito que so aparece em producao. Duas vendas confirmadas no
 * mesmo instante leem o mesmo max, calculam o mesmo numero, e uma das duas
 * estoura o `@@unique` — ou pior, as duas gravam e oConstraint deixa passar em
 * alguma corrida de leitura. Com `count() + 1` o resultado e ainda pior: um
 * soft delete no meio da serie faz a contagem repetir numero ja usado.
 *
 * O lock pessimista resolve os dois: o segundo pedido ESPERA o primeiro terminar
 * a transacao, e ai le o `last_number` ja atualizado. E por isso que
 * `proximoNumero` exige estar dentro de uma transacao — fora dela o
 * `FOR UPDATE` libera o lock no fim da propria frase, e a corrida continua
 * existindo. Ver `dentroDeTransacao`.
 */

/** Casas do numero no documento. `000001`, `000002`, ... */
export const CASAS_NUMERO = 6;

/** Modelos de `NumberSequence.model`. O valor vai para a coluna, entao e literal. */
export const MODELOS = {
  venda: "SALE",
  orcamento: "QUOTE",
  pedido: "SALES_ORDER",
  devolucaoVenda: "SALE_RETURN",
  compra: "PURCHASE",
  transferencia: "STOCK_TRANSFER",
  inventario: "INVENTORY",
  contaReceber: "ACCOUNTS_RECEIVABLE",
  contaPagar: "ACCOUNTS_PAYABLE",
} as const;

export type ModeloNumero = (typeof MODELOS)[keyof typeof MODELOS];

/**
 * O tipo minimo de um cliente transacional.
 *
 * Deliberadamente estreito: e o que estas funcoes usam de `Prisma.TransactionClient`,
 * e um `tx` de `$transaction` satisfaz. Aceitar o client inteiro esconderia o
 * requisito importante — que a chamada PRECISA estar em transacao — atrasando o
 * erro para o typecheck de um `db` comum, que compila e raceia.
 */
type ClienteTx = Pick<Prisma.TransactionClient, "numberSequence" | "$queryRaw" | "$executeRaw">;

export interface PedidoNumero {
  /** Chave de `NumberSequence.model`. */
  readonly model: ModeloNumero;
  /** Filial que possui a serie. */
  readonly branchId: string;
  /**
   * Ano de serie resettavel, ou 0 para serie continua.
   *
   * PADRAO 0, E O PADRAO E O CERTO para documento comercial. A serie so pode
   * reiniciar por ano se o ANO FAZER PARTE DO NUMERO, porque `sales` tem
   * `@@unique([tenantId, branchId, number])` — duas vendas "000001", uma de
   * 2025 e outra de 2026, colidiriam na mesma filial. A serie anual existe
   * para o QUEJA serve: numeracao de nota fiscal, onde o ano e obligation
   * legal e vem na serie, e nao para o documento comercial.
   */
  readonly year?: number;
  /** Prefixo do documento, como "V" ou "NF". Vem da propria linha da sequencia. */
  readonly prefix?: string;
}

/**
 * Aloca o proximo numero e avanca a serie.
 *
 * PRECISA ESTAR DENTRO DE UMA TRANSACAO
 *
 * A funcao nao abre transacao por conta propria, e essa e a decisao. Se ela
 * abrisse, quem chama nao conseguiria agrupar a alocacao com a gravacao do
 * documento: o numero seria consumido mesmo se a gravacao falhasse, e a serie
 * teria um buraco. Quem chama usa `dentroDeTransacao`, que garante o agrupamento
 * e o lock ao mesmo tempo.
 */
export async function proximoNumero(db: ClienteTx, scope: TenantScope, pedido: PedidoNumero): Promise<string> {
  const year = pedido.year ?? 0;

  // `upsert` e a criacao do registro de serie. Precisa ser `upsert` e nao
  // `create`: duas vendas da primeira vez na mesma filial (duas abas abertas)
  // chegariam juntas, e `create` deixaria uma estourar o unico.
  const sequencia = await db.numberSequence.upsert({
    where: {
      tenantId_branchId_model_year: {
        tenantId: scope.tenantId,
        branchId: pedido.branchId,
        model: pedido.model,
        year,
      },
    },
    create: {
      tenantId: scope.tenantId,
      branchId: pedido.branchId,
      model: pedido.model,
      year,
      step: 1,
      lastNumber: 0,
      prefix: pedido.prefix ?? null,
    },
    update: {},
    select: { id: true, lastNumber: true, step: true, prefix: true },
  });

  // O lock. `FOR UPDATE` segura a linha ate a transacao fechar, e e o que
  // impede dois pedidos de lerem o mesmo `lastNumber`.
  //
  // POR QUE ISTO NAO E UM VAZAMENTO DE TENANT
  //
  // `$queryRaw` nao passa pela extensao do `tenant-guard`, e essa e a razao de
  // todo o resto do projeto recusar query raw em caminho de negocio. Aqui a
  // consulta e por CHAVE PRIMARIA, e a chave veio do `upsert` acima, que rodou
  // no client protegido — logo a linha e, por construcao, do tenant da operacao.
  // Ainda assim o `tenant_id` vai no WHERE: e a segunda barreira, e custa uma
  // linha. Se alguem reusar este padrao em outro lugar, a dependencia de "o id
  // veio de uma query protegida" fica visivel no codigo em vez de implícita.
  const trancada = await db.$queryRaw<
    { id: string; last_number: number; step: number; prefix: string | null }[]
  >`SELECT id, last_number, step, prefix
      FROM number_sequences
     WHERE id = ${sequencia.id} AND tenant_id = ${scope.tenantId}
     FOR UPDATE`;

  const linha = trancada[0];
  if (linha === undefined) {
    // Só acontece se a linha sumir entre o `upsert` e o lock — o que dentro de
    // uma transação é praticamente impossível. Melhor falhar aqui do que
    // devolver um número repetido.
    throw new Error("Sequencia de numeracao sumiu durante a alocacao do numero");
  }

  const proximo = linha.last_number + linha.step;

  await db.numberSequence.update({
    where: { id: linha.id },
    data: { lastNumber: proximo },
  });

  return formatarNumero(proximo, linha.prefix);
}

/**
 * Renderiza o numero gravado no documento.
 *
 * O prefixo e o que diferencia a serie de venda da serie de orcamento quando as
 * duas sao "000001". Sem prefixo, "a venda 5" e "o orcamento 5" aparecem iguais
 * na tela de consulta, e a pessoa procura um documento que nao existe.
 */
export function formatarNumero(numero: number, prefix: string | null | undefined): string {
  const base = String(numero).padStart(CASAS_NUMERO, "0");
  return prefix === null || prefix === undefined || prefix === "" ? base : `${prefix}-${base}`;
}

/**
 * Roda a funcao dentro de uma transacao, com o escopo de tenant ativo.
 *
 * Existe para que o requisito "numero e documento vao na mesma transacao" nao
 * dependa de disciplina de quem chama. Duas chamadas no lugar de uma, e o
 * numero fica correto por construcao.
 *
 * O callback recebe o `TransactionClient` INTEIRO, e nao o recorte de
 * `proximoNumero`. Sao coisas diferentes: quem chama esta funcao esta gravando
 * venda, estoque e financeiro, e o recorte minimo do `numero.ts` obrigaria
 * cada action a declarar models que nao tem nada a ver com numeracao. A
 * restricao estreita fica onde ela e util — em `proximoNumero`, que precisa
 * saber que esta num lock.
 */
export async function dentroDeTransacao<T>(
  scope: TenantScope,
  fn: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantDb(scope, async (db) =>
    db.$transaction(async (tx) => fn(tx), {
      // Sem timeout customizado alem do maxWait: venda nao espera I/O externo,
      // e uma espera longa aqui indicaria lock preso, que e bug e nao lentidao.
      maxWait: 5_000,
      timeout: 15_000,
    }),
  );
}

