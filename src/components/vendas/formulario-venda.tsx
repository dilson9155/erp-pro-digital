"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { AcaoFormulario, CampoArea, CampoData, CampoSelect } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstadoFormulario } from "@/lib/formulario";

/**
 * Formulario de venda, com editor de itens.
 *
 * ## POR QUE ESTE COMPONENTE NAO E O `Formulario` GENERICO
 *
 * `Formulario` recebe uma spec plana: um array de campos, cada um com um `nome`.
 * Uma venda tem N itens, e cada item tem seis campos — o que daria N*6 entradas de
 * formulario com nome, tipo o `Object.fromEntries(formData)`.
 *
 * O ponto em que isso quebra e concreto. `Object.fromEntries` nao aceita duplicata:
 * dois inputs com `name="quantidade"` viram uma chave so, e a segunda sobrescreve
 * a primeira. A venda com tres itens de quantidade 2, 3 e 4 chegaria ao servidor
 * com uma unica quantidade, a ultima. Nenhum aviso — o Zod receberia um array de um
 * item e a venda sairia errada.
 *
 * ## A SAIDA: UM CAMPO JSON SO
 *
 * Cada item vive no estado do React e a lista inteira e serializada num
 * `<input type="hidden" name="itens">`. O servidor faz `JSON.parse` e valida com
 * Zod. Um campo, sem colisao de nome, e o item continua sendo dado validado no
 * servidor — o que o componente nao valida, so monta.
 *
 * ## POR QUE O ESTADO E DO LADO DO CLIENTE
 *
 * O total e a quantidade de itens mudam a cada tecla, e sao numeros que dependem
 * do que esta nas outras linhas. Server Component nao faria isso: cada tecla
 * seria uma ida ao servidor. O preco digitado, o desconto e o subtotal ficam
 * aqui por legibilidade, e o servidor RECALCULA tudo antes de gravar — o valor
 * que chega no `hidden` nunca e o que vai para o banco.
 */

export interface ItemVendaForm {
  /**
   * `null` = linha em branco, ainda nao escolhida.
   *
   * O nome e `productId`, e nao `produtoId`, porque este objeto vai direto
   * para `JSON.parse` no schema — e o schema e a unica fonte do formato do
   * item. Um campo em portugues aqui e em ingles la exigiria uma traducao no
   * meio, e a traducao e o tipo de coisa que funciona ate alguem renomear um
   * dos dois lados.
   */
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly descricao: string;
  readonly quantidade: string;
  readonly precoUnitario: string;
  readonly desconto: string;
}

export interface OpcoesFormularioVenda {
  readonly clientes: readonly { readonly value: string; readonly rotulo: string }[];
  readonly vendedores: readonly { readonly value: string; readonly rotulo: string }[];
  readonly condicoesPagamento: readonly { readonly value: string; readonly rotulo: string }[];
  readonly formasPagamento: readonly { readonly value: string; readonly rotulo: string }[];
  readonly produtos: readonly {
    /** `produto:<id>` ou `servico:<id>` — o prefixo decide o campo gravado. */
    readonly value: string;
    readonly rotulo: string;
    readonly origem: "produto" | "servico";
    readonly preco: string;
    readonly disponivel: string | null;
    /** Servico ou composto: o item nao baixa estoque. */
    readonly semEstoque: boolean;
  }[];
  readonly tipos: readonly { readonly value: string; readonly rotulo: string }[];
  readonly canais: readonly { readonly value: string; readonly rotulo: string }[];
}

export interface PropsFormularioVenda {
  readonly acao: (estado: EstadoFormulario | null, dados: FormData) => Promise<EstadoFormulario>;
  readonly opcoes: OpcoesFormularioVenda;
  readonly titulo: string;
  readonly descricao?: string;
  readonly textoEnviar: string;
  readonly voltarHref: string;
  /** Dados do rascunho em edicao; ausente = venda nova. */
  readonly valores?: Readonly<Record<string, string | undefined>>;
  /** Itens do rascunho em edicao, ja serializados. */
  readonly itensIniciais?: readonly ItemVendaForm[];
  /** Esconde os botoes de confirmacao: sao da tela de edicao de rascunho. */
  readonly semCard?: boolean;
}

function linhaVazia(): ItemVendaForm {
  return {
    productId: null,
    serviceId: null,
    descricao: "",
    quantidade: "1",
    precoUnitario: "0,00",
    desconto: "0,00",
  };
}

/**
 * Linhas que valem a pena enviar.
 *
 * A tela sempre mostra pelo menos uma linha, e "adicionar item" cria outra em
 * branco. Sem este filtro, clicar em salvar com uma linha em branco enviaria
 * um item sem produto e sem descricao, e o servidor responderia "Item 2:
 * escolha um produto ou um servico" — apontando para uma linha que a pessoa
 * nem pretendeu preencher.
 *
 * O filtro remove so a linha COMPLETAMENTE vazia: com produto, com descricao
 * ou com algum valor digitado, a linha sobe para o servidor reprovar com a
 * mensagem certa, porque a pessoa quer preenche-la e nao esqueceu dela.
 */
function linhasPreenchidas(itens: readonly ItemVendaForm[]): readonly ItemVendaForm[] {
  return itens.filter(
    (item) =>
      item.productId !== null ||
      item.serviceId !== null ||
      item.descricao.trim() !== "" ||
      paraNumero(item.precoUnitario) !== 0,
  );
}

/** "1.234,56" -> 1234.56. Devolve 0 para o que nao se parses, sem lancar. */
function paraNumero(texto: string): number {
  const limpo = texto.replace(/\./g, "").replace(",", ".").trim();
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Os itens que o servidor devolveu no estado de erro, ou `null`.
 *
 * O parse e tolerante a falha: um `itens` corrompido devolve `null` e a pessoa
 * ve a tabela como estava, que e sempre melhor do que `setItens` com algo que
 * nao e `ItemVendaForm` — o `item.descricao.trim()` do `linhasPreenchidas`
 * lancaria em `undefined`.
 */
function lerItensDoErro(estado: EstadoFormulario): ItemVendaForm[] | null {
  // `EstadoFormulario` e uma uniao: so o ramo `erro` carrega `valores`. O
  // chamador ja filtrou por `tipo === "erro"`, mas a funcao nao sabe disso e
  // precisa checar — ler `valores` de um `{ tipo: "ok" }` e erro de tipo.
  if (estado.tipo !== "erro") return null;
  const bruto = estado.valores?.itens;
  if (typeof bruto !== "string" || bruto === "") return null;
  try {
    const dados: unknown = JSON.parse(bruto);
    if (!Array.isArray(dados) || dados.length === 0) return null;
    return dados as ItemVendaForm[];
  } catch {
    return null;
  }
}

export function FormularioVenda(props: PropsFormularioVenda) {
  const [estado, formAction] = useActionState<EstadoFormulario | null, FormData>(props.acao, null);
  const [itens, setItens] = useState<readonly ItemVendaForm[]>(
    props.itensIniciais && props.itensIniciais.length > 0 ? props.itensIniciais : [linhaVazia()],
  );

  const erro = estado?.tipo === "erro" ? estado : null;
  const erroGeral = erro ? erro.mensagem : null;
  const erroAncorado = erro?.campos ? Object.keys(erro.campos).length > 0 : false;
  const erroDoCampo = (nome: string): string | undefined => {
    const lista = erro?.campos?.[nome];
    return lista && lista.length > 0 ? lista[0] : undefined;
  };

  const valor = (campo: string): string | undefined => {
    const doEstado = erro?.valores?.[campo];
    if (doEstado !== undefined) return doEstado;
    return props.valores?.[campo];
  };

  const produtoPorId = useMemo(
    () => new Map(props.opcoes.produtos.map((p) => [p.value, p])),
    [props.opcoes.produtos],
  );

  /*
   * RECUPERAR OS ITENS DEPOIS DE UM ERRO
   *
   * `useState` so usa o valor inicial na primeira renderizacao, entao um erro do
   * servidor nao repopula a tabela sozinho. E o ajuste tem que ser explicito:
   * `confirmarVenda` recusa por estoque insuficiente, cliente removido ou
   * vendedor bloqueado, e sao TODOS erros que chegam depois de a venda inteira
   * estar preenchida. Sem esta recuperacao, a pessoa perdia os itens e tinha
   * que remontar a venda por causa de um saldo de estoque.
   *
   * O ajuste acontece DURANTE a renderizacao, e nao num `useEffect`, pelo
   * motivo que o proprio React documenta: nao ha efeito externo para sincronizar
   * aqui, so um valor anterior a comparar. Em `useEffect` o `setItens`
   * provocaria uma segunda renderizacao, e o React linter proibe `setState`
   * sincrono dentro de efeito por isso. `itensAnterior` guarda qual estado de
   * erro ja foi aplicado, entao o ajuste acontece uma vez por erro — e o que
   * impede o laco de "estado mudou, ajusta de novo".
   */
  const [erroAplicado, setErroAplicado] = useState<EstadoFormulario | null>(null);
  if (erro !== null && erroAplicado !== erro) {
    setErroAplicado(erro);
    const recuperado = lerItensDoErro(erro);
    if (recuperado !== null) setItens(recuperado);
  }

  // `frete` e `desconto` sao ESTADO, e nao `defaultValue`, por causa do total
  // abaixo: `CampoMoeda` e nao controlado, entao o valor do `<input>` nao passa
  // pelo React, e o total ficaria congelado no que veio do servidor. Aqui os
  // dois numeros vivem no estado e o input recebe `value` — a conta na tela
  // acompanha a digitacao.
  const [freteTexto, setFreteTexto] = useState(valor("frete") ?? "");
  const [descontoTexto, setDescontoTexto] = useState(valor("desconto") ?? "");

  // Subtotal e total saoPREVISAO. O servidor recalcula antes de gravar; se os
  // dois divergirem, quem manda e o calculo do servidor, e nao este numero.
  const subtotal = useMemo(
    () =>
      itens.reduce(
        (acc, item) =>
          acc + paraNumero(item.quantidade) * paraNumero(item.precoUnitario) - paraNumero(item.desconto),
        0,
      ),
    [itens],
  );
  const frete = paraNumero(freteTexto);
  const descontoCabecalho = paraNumero(descontoTexto);
  const total = Math.max(0, subtotal - descontoCabecalho + frete);

  const alterarItem = (indice: number, mudanca: Partial<ItemVendaForm>) => {
    setItens((atuais) => atuais.map((item, i) => (i === indice ? { ...item, ...mudanca } : item)));
  };

  /**
   * Escolher o item, decidindo se ele vira `productId` ou `serviceId`.
   *
   * O schema exige um OU outro, nunca os dois, e `confirmarVenda` so debita
   * estoque do que tem `productId`. A origem vem no proprio `value` da opcao
   * (`produto:<id>` ou `servico:<id>`) porque `Product` e `Service` sao duas
   * tabelas distintas com FKs distintas: um id so, sem prefixo, gravaria o
   * ponteiro do lado errado.
   *
   * `semEstoque` continua decidindo o que NAO movimenta estoque. Um
   * `ProductType.SERVICO` continua sendo `productId` — ele e um item de NFS-e
   * cadastrado em `Product`, nao um `Service` do catalogo de servicos — e o
   * que impede a baixa e `confirmarVenda`, que so debita `MERCADORIA`.
   */
  const escolherProduto = (indice: number, escolhido: string) => {
    const opcao = produtoPorId.get(escolhido);
    setItens((atuais) =>
      atuais.map((item, i) => {
        if (i !== indice) return item;
        if (escolhido === "" || opcao === undefined) {
          return { ...item, productId: null, serviceId: null };
        }
        const id = opcao.value.slice(opcao.origem.length + 1);
        return {
          ...item,
          productId: opcao.origem === "produto" ? id : null,
          serviceId: opcao.origem === "servico" ? id : null,
          // O preco vem do cadastro; a descricao so e preenchida se a pessoa
          // nao digitou a sua, para nao sobrescrever texto proprio.
          precoUnitario: opcao.preco,
          descricao: item.descricao === "" ? opcao.rotulo : item.descricao,
        };
      }),
    );
  };

  const adicionarItem = () => setItens((atuais) => [...atuais, linhaVazia()]);
  const removerItem = (indice: number) =>
    // A ultima linha nao some: um formulario sem nenhuma linha parece quebrado,
    // e "remover" nela nao tem para onde levar. A linha volta em branco.
    setItens((atuais) => (atuais.length === 1 ? [linhaVazia()] : atuais.filter((_, i) => i !== indice)));

  const conteudo = (
    <form action={formAction} className="space-y-6" noValidate>
      {props.valores?.id ? <input type="hidden" name="id" value={props.valores.id} /> : null}

      {erroGeral && !erroAncorado ? (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erroGeral}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <CampoSelect
          nome="clienteId"
          rotulo="Cliente"
          ajuda="Deixe vazio para venda no balcao, sem cliente vinculado."
          erro={erroDoCampo("clienteId")}
          defaultValue={valor("clienteId")}
          placeholder="Sem cliente"
          opcoes={props.opcoes.clientes}
        />
        <CampoSelect
          nome="vendedorId"
          rotulo="Vendedor"
          erro={erroDoCampo("vendedorId")}
          defaultValue={valor("vendedorId")}
          placeholder="Sem vendedor"
          opcoes={props.opcoes.vendedores}
        />
        <CampoSelect
          nome="tipo"
          rotulo="Tipo"
          erro={erroDoCampo("tipo")}
          defaultValue={valor("tipo") ?? "BALCAO"}
          opcoes={props.opcoes.tipos}
        />
        <CampoSelect
          nome="canal"
          rotulo="Canal"
          erro={erroDoCampo("canal")}
          defaultValue={valor("canal") ?? "BALCAO"}
          opcoes={props.opcoes.canais}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="border-b pb-1.5 text-sm font-semibold">Itens da venda</h3>
          <Button type="button" variant="outline" size="sm" onClick={adicionarItem}>
            <Plus /> Adicionar item
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="w-28">Qtd</TableHead>
                <TableHead className="w-32">Preco unit.</TableHead>
                <TableHead className="w-28">Desconto</TableHead>
                <TableHead className="w-32 text-right">Total</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((item, indice) => {
                // O `<select>` compara por `value`, e o `value` da opcao e
                // `produto:<id>` ou `servico:<id>`. Reconstruir o prefixo a
                // partir de qual campo esta preenchido e o que mantem o item
                // selecionado apos um erro do servidor — sem isso, o `<select>`
                // cairia em "Selecione" com a linha ainda preenchida.
                const escolhido =
                  item.productId !== null
                    ? `produto:${item.productId}`
                    : item.serviceId !== null
                      ? `servico:${item.serviceId}`
                      : "";
                const opcao = escolhido ? produtoPorId.get(escolhido) : undefined;
                const totalLinha = Math.max(0, paraNumero(item.quantidade) * paraNumero(item.precoUnitario) - paraNumero(item.desconto));
                return (
                  <TableRow key={indice}>
                    <TableCell>
                      <Select
                        value={escolhido}
                        onChange={(e) => escolherProduto(indice, e.target.value)}
                        aria-label={`Produto ou servico do item ${indice + 1}`}
                      >
                        <option value="">Selecione</option>
                        {props.opcoes.produtos.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.rotulo}
                          </option>
                        ))}
                      </Select>
                      {opcao?.disponivel ? (
                        <p className="pt-1 text-xs text-muted-foreground">Saldo: {opcao.disponivel}</p>
                      ) : null}
                      <Input
                        value={item.descricao}
                        onChange={(e) => alterarItem(indice, { descricao: e.target.value })}
                        placeholder="Descricao (opcional)"
                        aria-label={`Descricao do item ${indice + 1}`}
                        className="mt-1 h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.quantidade}
                        onChange={(e) => alterarItem(indice, { quantidade: e.target.value })}
                        inputMode="decimal"
                        aria-label={`Quantidade do item ${indice + 1}`}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.precoUnitario}
                        onChange={(e) => alterarItem(indice, { precoUnitario: e.target.value })}
                        inputMode="decimal"
                        aria-label={`Preco unitario do item ${indice + 1}`}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.desconto}
                        onChange={(e) => alterarItem(indice, { desconto: e.target.value })}
                        inputMode="decimal"
                        aria-label={`Desconto do item ${indice + 1}`}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-right align-middle text-sm tabular-nums">
                      {totalLinha.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </TableCell>
                    <TableCell className="align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removerItem(indice)}
                        aria-label={`Remover item ${indice + 1}`}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {erroDoCampo("itens") ? (
          <p className="text-xs font-medium text-destructive">{erroDoCampo("itens")}</p>
        ) : null}

        <div className="ml-auto w-full max-w-xs space-y-1.5 border-t pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Frete</span>
            <span className="tabular-nums">{frete.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
          {descontoCabecalho > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span className="tabular-nums text-destructive">
                -{descontoCabecalho.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
        </div>
      </div>

      <input type="hidden" name="itens" value={JSON.stringify(linhasPreenchidas(itens))} />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="desconto" className="text-sm font-medium leading-none">
            Desconto no total
          </label>
          <Input
            id="desconto"
            name="desconto"
            value={descontoTexto}
            onChange={(e) => setDescontoTexto(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={erroDoCampo("desconto") ? true : undefined}
            className="mt-1.5"
          />
          <p className="pt-1.5 text-xs text-muted-foreground">Abatido do subtotal, depois dos descontos por item.</p>
          {erroDoCampo("desconto") ? (
            <p className="pt-1.5 text-xs font-medium text-destructive">{erroDoCampo("desconto")}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="frete" className="text-sm font-medium leading-none">
            Frete
          </label>
          <Input
            id="frete"
            name="frete"
            value={freteTexto}
            onChange={(e) => setFreteTexto(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={erroDoCampo("frete") ? true : undefined}
            className="mt-1.5"
          />
          {erroDoCampo("frete") ? (
            <p className="pt-1.5 text-xs font-medium text-destructive">{erroDoCampo("frete")}</p>
          ) : null}
        </div>
        <CampoSelect
          nome="condicaoPagamentoId"
          rotulo="Condicao de pagamento"
          erro={erroDoCampo("condicaoPagamentoId")}
          defaultValue={valor("condicaoPagamentoId")}
          placeholder="A vista"
          opcoes={props.opcoes.condicoesPagamento}
        />
        <CampoSelect
          nome="formaPagamentoId"
          rotulo="Forma de pagamento"
          ajuda="Usada no recebimento imediato, se houver."
          erro={erroDoCampo("formaPagamentoId")}
          defaultValue={valor("formaPagamentoId")}
          placeholder="Nao informed"
          opcoes={props.opcoes.formasPagamento}
        />
        {/* `nome="data"`, e nao "dataVenda": e o nome que `schemaVenda` le. Um
            campo com nome diferente do schema nao da erro — ele simplesmente nao
            chega, e a venda ficaria sem data sem ninguem saber por que. */}
        <CampoData nome="data" rotulo="Data da venda" ajuda="Vazio usa a data de hoje." erro={erroDoCampo("data")} defaultValue={valor("data")} />
        <CampoArea nome="observacoes" rotulo="Observacoes" erro={erroDoCampo("observacoes")} defaultValue={valor("observacoes")} rows={3} />
      </div>

      <AcaoFormulario erro={undefined}>
        <BotaoEnviar texto={props.textoEnviar} />
        <Button asChild variant="outline">
          <Link href={props.voltarHref}>Cancelar</Link>
        </Button>
      </AcaoFormulario>
    </form>
  );

  if (props.semCard) return conteudo;

  return (
    <Card>
      <CardContent className="pt-6">{conteudo}</CardContent>
    </Card>
  );
}

function BotaoEnviar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Salvando..." : texto}
    </Button>
  );
}
