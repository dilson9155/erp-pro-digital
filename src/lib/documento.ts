/**
 * Validacao e normalizacao de documento brasileiro.
 *
 * POR QUE ISTO E UM MODULO E NAO DOIS CAMPOS NO SCHEMA
 *
 * CPF e CNPJ tem a mesma forma: digitos, dois digitos verificadores calculados
 * por modulo 11 com pesos diferentes. A regra e a mesma, os numeros nao. Escrever
 * duas vezes faria as duas copias divergirem em silencio — o que ja aconteceu
 * com enums escritos a mao neste projeto, e o sintoma foi um `P2002` so em
 * runtime.
 *
 * E POR QUE UM DIGITO VERIFICADOR INVALIDO PRECISA SER REJEITADO AQUI, E NAO
 * PELO BANCO
 *
 * A coluna e `VarChar(11)` / `VarChar(14)`. O Postgres nao valida digito
 * verificador: aceitaria "12345678901" e guardaria. O erro apareceria na
 * emissao da nota, com o cadastro ja impresso em relatorio, o cliente ja
 * cadastrado na loja e o vendedor sem tempo de corrigir. E um dado que nao
 * volta: corrigir CPF errado exige carta de correcao ou rectificacao na
 * Receita. Rejeitar no cadastro e o unico ponto barato.
 *
 * POR QUE A CONVERSAO DE TEXTO ESTA AQUI E NAO NO `lib/form.ts`
 *
 * `lib/form.ts` le campo a campo e e generico. Isto e uma funcao de dominio com
 * regra de negocio, e as actions importam daqui.
 */

/** Remove tudo que nao for digito: pontos, barras, hifens, espacos, letras. */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D+/g, "");
}

/**
 * Remove os digitos verificadores, deixando a mascara de 3 em 3 (CNPJ) ou
 * 3-3-2-2 (CPF) para a exibicao.
 *
 * A mascara e responsabilidade da APRESENTACAO — o comentario do schema.prisma
 * diz isso do `cpf`/`cnpj` ("gravado apenas com digitos") — e por isso a
 * funcao vive aqui, e nao no `lib/money`, que e numerico.
 */
export function formatarDocumento(valor: string): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 11) {
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digitos.length === 14) {
    return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return digitos;
}

/**
 * Digito verificador por modulo 11.
 *
 * A regra e sempre a mesma, com pesos diferentes: multiplica da direita para a
 * esquerda por 2, 3, 4, ... 9 (ciclando), soma, e o resto da divisao por 11 da o
 * digito — trocando 10 e 11 por 0, porque resto 10 significaria "o digito nao
 * cabe num digito".
 *
 * Nao ha parametro de tamanho: o calculo usa `base.length`. Um parametro
 * separado permitiria passar um tamanho diferente do dado e sair um digito
 * invalido sem erro — o que ja aconteceu nos testes deste arquivo, com numeros
 * de exemplo copiados de memoria que nao passavam no proprio validador.
 */
function digitoVerificador(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    const caractere = base.charAt(i);
    if (caractere === undefined) return -1;
    soma += Number(caractere) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto === 10 || resto === 11 ? 0 : resto;
}

/**
 * CPF valido: 11 digitos e os dois verificadores corretos.
 *
 * Os digitos de REPETICAO sao rejeitados ("11111111111" passa no calculo, e
 * nao existe). Sem essa checagem, um cadastro repetido de zeros entraria, e o
 * numero e invalido por definicao: o CPF de uma pessoa real tem os dois
 * verificadores derivados dos 9 primeiros, e "000000000" nao e uma base valida
 * porque a Receita nunca emitiu.
 */
export function cpfValido(valor: string): boolean {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const base = digitos.slice(0, 9);
  const primeiro = digitoVerificador(base);
  const segundo = digitoVerificador(`${base}${primeiro}`);
  return digitos.charAt(9) === String(primeiro) && digitos.charAt(10) === String(segundo);
}

/** CNPJ valido: 14 digitos e os dois verificadores corretos. */
export function cnpjValido(valor: string): boolean {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  // A CNPJ costuma ser emitida com os dois primeiros digitos "00" (filial da
  // matriz). Nao e obrigatorio, entao NAO e rejeitado aqui: `00.000...` e um
  // CNPJ valido, e barrar isso quebraria cadastro legitimo.
  const base = digitos.slice(0, 12);
  const primeiro = digitoVerificador(base);
  const segundo = digitoVerificador(`${base}${primeiro}`);
  return digitos.charAt(12) === String(primeiro) && digitos.charAt(13) === String(segundo);
}

/**
 * DDDs em uso no Brasil, como `Set` de duas posicoes.
 *
 * Uma lista de DDDs EXISTENTES, e nao de DDDs invalidos. A lista de invalidos
 * seria menor e pareceria mais eficiente, e foi a primeira versao: os DDDs de 00
 * a 09 mais 10. O bug foi bloquear 11 — Sao Paulo — que e o DDD mais usado do
 * pais. Um telefone de Sao Paulo recusado no cadastro e um bug que so aparece
 * para o cliente mais importante, e a lista de invalidos cresce a cada faixa
 * que a Anatel distribui, enquanto esta lista so encolhe.
 */
const DDDS_VALIDOS = new Set([
  // 11 a 19: SP e regioes
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  // 21, 22, 24, 27, 28: Rio e regioes
  "21", "22", "24", "27", "28",
  // 31 a 38: Minas
  "31", "32", "33", "34", "35", "37", "38",
  // 41 a 49: Parana e Santa Catarina
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  // 51, 53, 54, 55: Rio Grande do Sul
  "51", "53", "54", "55",
  // 61 a 69: Distrito Federal e Centro-Oeste
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  // 71, 73, 74, 75, 77, 79: Bahia e Sergipe
  "71", "73", "74", "75", "77", "79",
  // 81 a 89: Pernambuco e Nordeste
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  // 91 a 99: Para
  "91", "93", "94", "95", "96", "97", "98", "99",
]);

/**
 * Telefone brasileiro: 10 ou 11 digitos, com DDD existente.
 *
 * 10 e o telefone fixo (DDD + 8 numeros), 11 e o celular (DDD + 9, com o nono
 * digito). O nono digito e OBRIGATORIO desde 2016 para celular, mas o schema
 * aceita os dois: telefone fixo de cidade pequena ainda usa 8, e um cadastro
 * antigo nao deve ser barrado por causa disso.
 */
export function telefoneValido(valor: string): boolean {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 10 && digitos.length !== 11) return false;
  return DDDS_VALIDOS.has(digitos.slice(0, 2));
}

/** CEP: 8 digitos. O quinto digito identifica a regiao (0 para o Brasil). */
export function cepValido(valor: string): boolean {
  const digitos = somenteDigitos(valor);
  return digitos.length === 8;
}

/** Email: o suficiente para pegar erro de digitacao, sem ser um RFC 5322. */
export function emailValido(valor: string): boolean {
  // Deliberadamente permissivo. Um validador estrito rejeita enderecos validos
  // (`a@b.co`, com TLD de duas letras, ou dominios com hifen que nao comeca
  // nem termina com hifen), e o efeito e bloquear o cadastro de um cliente
  // real. O campo segue aceitando string; quem decide se envia e-mail para o
  // endereco e o modulo de comunicacao, com o resultado real do envio.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}
