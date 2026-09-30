import { describe, expect, it } from "vitest";

import { data, dataOuNula, decimal, decimalOuZero, inteiro, marcado, texto, textoBruto } from "@/lib/form";
import { erroDeRegra, estadoDeErro, validarFormulario } from "@/server/app/validacao";
import { schemaUnidade } from "@/server/app/unidades/schema";
import type { EstadoFormulario } from "@/lib/formulario";

/**
 * Testes do formulario.
 *
 * A cobertura aqui e deliberadamente dos PONTOS QUE QUEBRAM EM SILENCIO, e nao
 * de cobertura de linhas. Um `texto()` com `trim` errado passa em qualquer
 * revisao visual e devolve " " como se fosse nome valido; um `marcado()` que usa
 * `get` em vez de `getAll` faz toda checkbox do sistema responder "desmarcada",
 * e o unico sintoma e que ninguem consegue ativar nada. Um `decimal()` com
 * `parseFloat` grava mil reais como mil e duzentos. Nenhum desses broken
 * behaviors aparece no typecheck, e todos aparecem em producao.
 */

describe("lib/form", () => {
  describe("texto", () => {
    it("remove espacos das pontas", () => {
      const dados = new FormData();
      dados.set("nome", "  kg  ");
      expect(texto(dados, "nome")).toBe("kg");
    });

    it("devolve undefined quando o campo nao existe", () => {
      // `undefined` e nao `""`: a distincao permite ao Zod dizer "campo
      // obrigatorio" para ausente e "campo obrigatorio em branco" para vazio,
      // que sao mensagens diferentes para quem esta preenchendo.
      expect(texto(new FormData(), "nome")).toBeUndefined();
    });

    it("devolve undefined para campo so com espacos", () => {
      // Um required nativo aceitaria "   " como preenchimento, e o schema
      // receberia uma string que parece preenchida.
      const dados = new FormData();
      dados.set("nome", "   ");
      expect(texto(dados, "nome")).toBeUndefined();
    });

    it("devolve o primeiro valor quando o campo se repete", () => {
      const dados = new FormData();
      dados.append("nome", "primeiro");
      dados.append("nome", "segundo");
      expect(texto(dados, "nome")).toBe("primeiro");
    });
  });

  describe("textoBruto", () => {
    it("devolve string vazia quando o campo nao existe", () => {
      // Para observacao e descricao: o vazio e um valor legitimo, distinto de
      // "nao informado", e quem chama decide o que fazer com ele.
      expect(textoBruto(new FormData(), "descricao")).toBe("");
    });

    it("preserva o texto preenchido", () => {
      const dados = new FormData();
      dados.set("descricao", "  Quilograma  ");
      expect(textoBruto(dados, "descricao")).toBe("Quilograma");
    });
  });

  describe("inteiro", () => {
    it("converte texto valido", () => {
      const dados = new FormData();
      dados.set("casas", "4");
      expect(inteiro(dados, "casas")).toBe(4);
    });

    it("devolve NaN para fracao, em vez de arredondar", () => {
      // Arredondar 2.5 para 2 ou 3 faria o cadastro aceitar um numero que a
      // pessoa nao digitou. `NaN` passa pelo `Number.isInteger` do chamador.
      const dados = new FormData();
      dados.set("casas", "2.5");
      expect(inteiro(dados, "casas")).toBeNaN();
    });

    it("devolve undefined quando vazio", () => {
      // Zero e um valor real para "casas decimais = 0". Confundir vazio com
      // zero gravaria 0 em campo que a pessoa nao preencheu.
      expect(inteiro(new FormData(), "casas")).toBeUndefined();
    });
  });

  describe("decimal", () => {
    it("entende milhar com ponto e decimal com virgula", () => {
      // O caso que faz `parseFloat` gravar mil reais em vez de mil e duzentos.
      const dados = new FormData();
      dados.set("preco", "1.234,56");
      expect(decimal(dados, "preco")?.toString()).toBe("1234.56");
    });

    it("entende ponto como decimal quando nao ha virgula", () => {
      const dados = new FormData();
      dados.set("preco", "1234.56");
      expect(decimal(dados, "preco")?.toString()).toBe("1234.56");
    });

    it("preserva fracoes alem de duas casas", () => {
      // Quantidade em kg com grama tem 4 casas. Arredondar para 2 perderia
      // precisao de estoque silenciosamente.
      const dados = new FormData();
      dados.set("peso", "1,5005");
      expect(decimal(dados, "peso")?.toString()).toBe("1.5005");
    });

    it("lanca para texto nao numerico, em vez de devolver zero", () => {
      // Zero silencioso gravaria R$ 0,00. `parseBrazilianNumber` lanca
      // `TypeError`, e a acao trata como erro de campo.
      const dados = new FormData();
      dados.set("preco", "abc");
      expect(() => decimal(dados, "preco")).toThrow();
    });

    it("devolve undefined quando vazio", () => {
      expect(decimal(new FormData(), "preco")).toBeUndefined();
    });
  });

  describe("decimalOuZero", () => {
    it("usa zero quando o campo nao veio", () => {
      // Para total calculado, onde ausencia e zero por definicao.
      const dados = new FormData();
      expect(decimalOuZero(dados, "desconto").toString()).toBe("0");
    });
  });

  describe("marcado", () => {
    it("detecta o par marcado/desmarcado com o mesmo nome", () => {
      // Este e o motivo de `marcado` usar `getAll`. Com `get`, o campo
      // escondido (que vem primeiro no HTML) devolveria "" e um checkbox
      // marcado leria `false`.
      const sim = new FormData();
      sim.append("ativo", "");
      sim.append("ativo", "on");

      const nao = new FormData();
      nao.append("ativo", "");

      expect(marcado(sim, "ativo")).toBe(true);
      expect(marcado(nao, "ativo")).toBe(false);
    });

    it("funciona com o checkbox marcado em qualquer posicao", () => {
      const dados = new FormData();
      dados.append("ativo", "on");
      dados.append("ativo", "");
      expect(marcado(dados, "ativo")).toBe(true);
    });

    it("aceita as tres grafias de verdadeiro", () => {
      for (const valor of ["on", "true", "1"]) {
        const dados = new FormData();
        dados.set("flag", valor);
        expect(marcado(dados, "flag")).toBe(true);
      }
    });

    it("devolve false quando o campo nao existe", () => {
      expect(marcado(new FormData(), "ativo")).toBe(false);
    });
  });

  describe("data", () => {
    it("monta a data em UTC, preservando o dia digitado", () => {
      // `new Date("2026-01-31")` em Node e UTC, mas "31/01/2026" e local, e a
      // mesma data vira dia 30 depois do meio-dia no Brasil. Parseando as
      // partes, o dia digitado e o dia que fica.
      const dados = new FormData();
      dados.set("vencimento", "2026-01-31");
      const resultado = data(dados, "vencimento");
      expect(resultado?.toISOString().slice(0, 10)).toBe("2026-01-31");
    });

    it("devolve undefined para data invalida", () => {
      const dados = new FormData();
      dados.set("vencimento", "31/01/2026");
      expect(data(dados, "vencimento")).toBeUndefined();
    });

    it("dataOuNula devolve null para campo ausente", () => {
      expect(dataOuNula(new FormData(), "vencimento")).toBeNull();
    });
  });
});

describe("server/app/validacao", () => {
  describe("validarFormulario", () => {
    function formUnidade(campos: Record<string, string>): FormData {
      const dados = new FormData();
      for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
      return dados;
    }

    /**
     * Estreita o resultado de `validarFormulario` ate o formato de erro.
     *
     * Sao dois estreitamentos: `ok` decide qual ramo do resultado existe, e
     * `tipo` decide qual formato o estado tem. Sem o segundo, `estado.campos` nao
     * compila — e o compilador esta certo, porque no ramo de sucesso esse campo
     * nao existe. Ler os dois e mais barato que um `as`.
     */
    function erroDe(resultado: ReturnType<typeof validarFormulario>): Extract<EstadoFormulario, { tipo: "erro" }> {
      if (resultado.ok || resultado.estado.tipo !== "erro") {
        throw new Error(`esperava erro de validacao, veio ${JSON.stringify(resultado)}`);
      }
      return resultado.estado;
    }

    it("devolve os dados convertidos quando valido", () => {
      const resultado = validarFormulario(schemaUnidade, formUnidade({ nome: "kg", casasDecimais: "2" }));
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.dados.nome).toBe("kg");
      expect(resultado.dados.casasDecimais).toBe(2);
      // Ausente e "desmarcado": o par hidden manda "" e o checkbox marcado
      // mandaria "on".
      expect(resultado.dados.ativo).toBe(false);
    });

    it("agrupa erros por nome de campo", () => {
      // E o contrato com o formulario: `campos[nome]` tem de ser a chave que o
      // HTML conhece, e nao o caminho do Zod.
      const estado = erroDe(validarFormulario(schemaUnidade, formUnidade({ nome: "", casasDecimais: "9" })));
      expect(estado.campos?.nome?.[0]).toBeTruthy();
      expect(estado.campos?.casasDecimais?.[0]).toBeTruthy();
    });

    it("pede revisao dos campos, sem repetir o erro de cada um", () => {
      // Uma mensagem "Dados invalidos" acima do formulario e redundante quando
      // cada campo ja diz o que ha de errado.
      const estado = erroDe(validarFormulario(schemaUnidade, formUnidade({ nome: "" })));
      expect(estado.mensagem).toBe("Verifique os campos destacados.");
    });

    it("preserva os valores digitados para o formulario nao limpar", () => {
      // Sem isso, corrigir um campo apaga todo o resto — o pior sintoma possivel
      // num cadastro com doze campos.
      const estado = erroDe(
        validarFormulario(
          schemaUnidade,
          formUnidade({ nome: "kg", descricao: "Quilograma", casasDecimais: "99" }),
        ),
      );
      expect(estado.valores?.nome).toBe("kg");
      expect(estado.valores?.descricao).toBe("Quilograma");
    });

    it("aceita descricao vazia como null", () => {
      // A coluna e nullable. `""` e `NULL` significam coisas diferentes em
      // filtro (`IS NULL` vs `= ''`), entao a conversao acontece no schema.
      const resultado = validarFormulario(
        schemaUnidade,
        formUnidade({ nome: "un", descricao: "", casasDecimais: "0", ativo: "on" }),
      );
      if (!resultado.ok) throw new Error(`deveria passar: ${JSON.stringify(resultado.estado)}`);
      expect(resultado.dados.descricao).toBeNull();
      expect(resultado.dados.ativo).toBe(true);
    });
  });

  describe("erroDeRegra", () => {
    it("ancora a mensagem no campo", () => {
      const estado = erroDeRegra("Ja existe uma unidade com este simbolo.", "nome");
      if (estado.tipo !== "erro") throw new Error("tipo errado");
      expect(estado.campos?.nome).toEqual(["Ja existe uma unidade com este simbolo."]);
    });

    it("funciona sem campo, para erro geral", () => {
      const estado = erroDeRegra("Falha na operacao.");
      if (estado.tipo !== "erro") throw new Error("tipo errado");
      expect(estado.campos).toBeUndefined();
    });
  });

  describe("estadoDeErro", () => {
    it("nao expoe detalhe de erro desconhecido para a tela", () => {
      // Mensagem de Prisma/Postgres carrega nome de tabela e fragmento de SQL.
      // O log do servidor recebe o detalhe; a tela recebe texto generico.
      const estado = estadoDeErro(new Error("relation units does not exist"));
      if (estado.tipo !== "erro") throw new Error("tipo errado");
      expect(estado.mensagem).not.toContain("relation");
      expect(estado.mensagem).not.toContain("SQL");
    });
  });
});

describe("schemaUnidade", () => {
  it("recusa simbolo com mais de 8 caracteres", () => {
    // A coluna e `VarChar(8)`. Sem o `max`, o erro chegaria do banco como falha
    // de infraestrutura em vez de erro de campo apontando o que foi digitado.
    const resultado = schemaUnidade.safeParse({ nome: "Quilograma", casasDecimais: 2, ativo: false });
    expect(resultado.success).toBe(false);
  });

  it("aceita 4 casas decimais, o caso de kg com grama", () => {
    const resultado = schemaUnidade.safeParse({ nome: "kg", casasDecimais: 4, ativo: true });
    expect(resultado.success).toBe(true);
  });

  it("recusa 7 casas decimais", () => {
    // Acima de 6 nao e formato, e erro de digitacao. `Decimal` aceita 20, entao
    // a divergencia entre 7 e 20 casas seria silenciosa.
    const resultado = schemaUnidade.safeParse({ nome: "kg", casasDecimais: 7, ativo: true });
    expect(resultado.success).toBe(false);
  });

  it("trata checkbox vazio como false, e nao como erro", () => {
    // O par marcado/desmarcado manda "" quando desmarcado. Se "" fosse erro de
    // validacao, desmarcar um campo padrao devolveria dois erros.
    const resultado = schemaUnidade.safeParse({ nome: "un", casasDecimais: 0, ativo: "" });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.ativo).toBe(false);
  });

  it("recusa casas decimais fracionarias", () => {
    const resultado = schemaUnidade.safeParse({ nome: "kg", casasDecimais: 2.5, ativo: true });
    expect(resultado.success).toBe(false);
  });
});
