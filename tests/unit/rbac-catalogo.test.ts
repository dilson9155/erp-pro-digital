import { describe, expect, it } from "vitest";

import { PlanModuleKey } from "@/generated/prisma/enums";

import { ACOES, ehAcao } from "@/lib/rbac/permissions";
import {
  CATALOGO,
  MODULOS_DO_CATALOGO,
  PREFIXO_PLATFORM,
  chaveDefinicao,
  chaveNoCatalogo,
  definicaoDaChave,
  gruposDoCatalogo,
  modulosDoCatalogo,
} from "@/lib/rbac/catalogo";
import { definirPerfisPadrao } from "@/lib/rbac/perfis-padrao";

/**
 * Invariantes do catalogo de permissoes.
 *
 * Sao invariantes, e nao testes de "funciona": cada um trava uma propriedade que
 * o resto do sistema assume e que ninguem repara quando quebra. O caso mais caro
 * de todos e o do modulo fora do enum — ele produz `modulosFaltantes` e o
 * gate de plano zera as permissoes do usuario INTEIRO, com o sintoma de "o
 * formulario nao salva" e a causa apontada para o formulario.
 */
describe("catalogo de permissoes", () => {
  it("nao tem chave duplicada", () => {
    // `Permission.key` e `@unique`, entao a duplicata nao falharia aqui: falharia
    // no seed, com o `upsert` escolhendo silenciosamente a segunda linha e a
    // primeira virando lixo orfao.
    const vistas = new Set<string>();
    const repetidas: string[] = [];
    for (const definicao of CATALOGO) {
      const chave = chaveDefinicao(definicao);
      if (vistas.has(chave)) repetidas.push(chave);
      vistas.add(chave);
    }
    expect(repetidas).toEqual([]);
  });

  it("monta a chave no formato modulo.recurso, sem parte vazia", () => {
    for (const definicao of CATALOGO) {
      const partes = chaveDefinicao(definicao).split(".");
      expect(partes).toHaveLength(2);
      expect(partes[0]).not.toBe("");
      expect(partes[1]).not.toBe("");
    }
  });

  it("declara ao menos uma acao por recurso, e todas validas", () => {
    for (const definicao of CATALOGO) {
      expect(definicao.acoes.length).toBeGreaterThan(0);
      for (const acao of definicao.acoes) {
        expect(ehAcao(acao)).toBe(true);
      }
    }
  });

  it("nao repete acao dentro do mesmo recurso", () => {
    // `RolePermission.actions` e um array: `["read", "read"]` nao quebra nada,
    // mas a tela de perfis marcaria a mesma caixa duas vezes.
    for (const definicao of CATALOGO) {
      expect(new Set(definicao.acoes).size).toBe(definicao.acoes.length);
    }
  });

  it("todo modulo do catalogo existe no enum PlanModuleKey, ou e platform", () => {
    // O teste que substitui o import do enum em `catalogo.ts`: a fronteira de
    // bundle impede `src/lib` de importar `@/generated/prisma`, entao a
    // verificacao mora aqui, onde o import e permitido.
    const validos = new Set<string>(Object.values(PlanModuleKey));
    for (const modulo of MODULOS_DO_CATALOGO) {
      expect(validos.has(modulo)).toBe(true);
    }
    for (const definicao of CATALOGO) {
      if (definicao.modulo === PREFIXO_PLATFORM) continue;
      expect(validos.has(definicao.modulo)).toBe(true);
    }
  });

  it("modulosDoCatalogo nunca inclui platform", () => {
    // `platform` nao esta no enum; se entrasse no `PlanModule`, o seed gravaria
    // uma linha invalida e o gate comecaria a reprovar o proprio administrador.
    expect(modulosDoCatalogo()).not.toContain(PREFIXO_PLATFORM);
  });

  it("cover todos os modulos declarados em MODULOS_DO_CATALOGO", () => {
    // A lista e o que o seed usa para montar o plano. Um modulo listado e nunca
    // citado produz um plano que contrata algo que o produto nao tem.
    const citados = new Set<string>(modulosDoCatalogo());
    for (const modulo of MODULOS_DO_CATALOGO) {
      expect(citados.has(modulo)).toBe(true);
    }
  });

  it("devolve a definicao pela chave, de forma coerente", () => {
    for (const definicao of CATALOGO) {
      const chave = chaveDefinicao(definicao);
      expect(chaveNoCatalogo(chave)).toBe(true);
      expect(definicaoDaChave(chave)?.label).toBe(definicao.label);
    }
    expect(chaveNoCatalogo("NAO_EXISTE.chave")).toBe(false);
  });

  it("agrupa por grupo, e todo grupo pertence a alguma definicao", () => {
    const grupos = gruposDoCatalogo();
    expect(grupos.length).toBeGreaterThan(0);
    for (const grupo of grupos) {
      const noGrupo = CATALOGO.filter((definicao) => definicao.grupo === grupo);
      expect(noGrupo.length).toBeGreaterThan(0);
    }
  });

  it("nao expoe acao que o recurso nao suporta", () => {
    // `VENDAS.venda` nao tem `delete`: venda cancelada continua no historico.
    // Se alguem adicionar `delete` ao recurso, este teste avisa que o negocio
    // mudou de regra e a concessao precisa ser revista.
    expect(definicaoDaChave("VENDAS.venda")?.acoes).not.toContain("delete");
    expect(definicaoDaChave("ESTOQUE.movimentacao")?.acoes).not.toContain("update");
  });
});

describe("perfis padrao", () => {
  it("nao concede recurso inexistente no catalogo", () => {
    // O seed tambem valida isso e falha alto; aqui o teste garante que a falha
    // continue necessaria, em vez de virar um `continue` silencioso.
    for (const perfil of definirPerfisPadrao()) {
      for (const concessao of perfil.concessoes) {
        const chave = `${concessao.modulo}.${concessao.recurso}`;
        expect(chaveNoCatalogo(chave)).toBe(true);
      }
    }
  });

  it("nao concede acao fora do conjunto suportado pelo recurso", () => {
    for (const perfil of definirPerfisPadrao()) {
      for (const concessao of perfil.concessoes) {
        const definicao = definicaoDaChave(`${concessao.modulo}.${concessao.recurso}`);
        for (const acao of concessao.acoes) {
          expect(ACOES).toContain(acao);
          expect(definicao?.acoes).toContain(acao);
        }
      }
    }
  });

  it("nao concede a mesma chave duas vezes no mesmo perfil", () => {
    for (const perfil of definirPerfisPadrao()) {
      const chaves = perfil.concessoes.map((c) => `${c.modulo}.${c.recurso}`);
      expect(new Set(chaves).size).toBe(chaves.length);
    }
  });

  it("administrador recebe tudo, exceto o que e platformOnly", () => {
    // `FISCAL.certificado` e a chave de assinatura da NF-e: fora do perfil de
    // tenant por decisao, nao por esquecimento. Este teste existe para que
    // "conceder tudo ao administrador" continue sendo uma afirmacao verificavel
    // e nao uma intencao.
    const administrador = definirPerfisPadrao().find((p) => p.slug === "administrador");
    expect(administrador).toBeDefined();

    const concedidas = new Set(
      administrador?.concessoes.map((c) => `${c.modulo}.${c.recurso}`) ?? [],
    );
    const naoConcedidas = CATALOGO.filter(
      (definicao) => !concedidas.has(chaveDefinicao(definicao)),
    );

    expect(naoConcedidas.map(chaveDefinicao)).toEqual(
      CATALOGO.filter((d) => d.platformOnly).map(chaveDefinicao),
    );
  });

  it("perfis restritos nunca recebem permissao platformOnly", () => {
    for (const perfil of definirPerfisPadrao()) {
      for (const concessao of perfil.concessoes) {
        const definicao = definicaoDaChave(`${concessao.modulo}.${concessao.recurso}`);
        if (perfil.slug === "administrador") continue;
        expect(definicao?.platformOnly ?? false).toBe(false);
      }
    }
  });
});
