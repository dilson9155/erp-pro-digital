import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * Campos de formulario.
 *
 * Server Components: sao `<label>`, `<input>` e `<select>` comrotulo e erro. Nao
 * ha estado, entao nao ha por que marcar `"use client"`. O `defaultValue` vem do
 * servidor, e a Server Action devolve o valor submitted em caso de erro.
 *
 * POR QUE O ERRO E TEXTO E NAO SO BORDA VERMELHA
 *
 * A borda vermelha diz "algo esta errado" e nao diz o que. Para quem escreve um
 * cadastro pela primeira vez, "CNPJ invalido" e a informacao; a cor e
 * decoracao. Alem disso, a cor sozinha falha para quem nao distingue vermelho de
 * verde — por isso o texto de erro acompanha sempre a borda, e o `aria-invalid`
 * vai no campo para o leitor de tela.
 *
 * `aria-describedby` aponta para o texto de erro e para a ajuda ao mesmo tempo,
 * com o mesmo `id` opcional sendo reaproveitado: o leitor anuncia "erro" e "ajuda"
 * sem o usuario precisar descobrir onde olhar.
 */

/** Envelope de um campo: rotulo, controle, ajuda e erro. */
export function Campo({
  nome,
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  className,
  children,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
    "aria-required": boolean | undefined;
  }) => React.ReactNode;
}) {
  const idHelp = `${nome}-ajuda`;
  const idErro = `${nome}-erro`;
  const descritores = [ajuda ? idHelp : null, erro ? idErro : null].filter(Boolean).join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={nome}>
        {rotulo}
        {obrigatorio ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children({
        id: nome,
        "aria-invalid": erro ? true : undefined,
        "aria-describedby": descritores || undefined,
        "aria-required": obrigatorio || undefined,
      })}
      {ajuda ? (
        <p id={idHelp} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      ) : null}
      {erro ? (
        <p id={idErro} className="text-xs font-medium text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

export function CampoTexto({
  nome,
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  defaultValue,
  placeholder,
  autoComplete,
  maxLength,
  className,
  inputClassName,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
  defaultValue?: string | undefined;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <Campo
      nome={nome}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      {(aria) => (
        <Input
          name={nome}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          className={inputClassName}
          {...aria}
        />
      )}
    </Campo>
  );
}

export function CampoNumero({
  nome,
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  defaultValue,
  min,
  max,
  step,
  className,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
  defaultValue?: string | number | undefined;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <Campo
      nome={nome}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      {(aria) => (
        <Input
          type="number"
          name={nome}
          defaultValue={defaultValue}
          min={min}
          max={max}
          step={step}
          inputMode="decimal"
          {...aria}
        />
      )}
    </Campo>
  );
}

/**
 * Campo de dinheiro.
 *
 * `type="text"` e NAO `type="number"`, e a escolha e deliberada. O campo de
 * numero do browser:
 * - aceita `e` e `E` como expoente, e "1e5" viraria R$ 100.000 sem querer;
 * - em pt-BBR, o step valido e "1,5", e o navegador rejeita e marca invalido;
 * - le e grava valor com ponto, porque o `input[type=number]` devolve
 *   `event.target.value` no formato do HTML, nao do pais.
 *
 * A conversao de verdade acontece na action, por `parseBrazilianNumber`, que e o
 * unico lugar que entende "1.234,56". Aqui o campo so garante que o texto digitado
 * volte intacto.
 */
export function CampoMoeda({
  nome,
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  defaultValue,
  placeholder = "0,00",
  className,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
  defaultValue?: string | undefined;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Campo
      nome={nome}
      rotulo={rotulo}
      ajuda={ajuda ?? "Digite com virgula. Ex.: 1.234,56"}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      {(aria) => (
        <div className="flex items-center">
          <span className="-mr-7 mr-1 text-sm text-muted-foreground">R$</span>
          <Input
            name={nome}
            defaultValue={defaultValue}
            placeholder={placeholder}
            inputMode="decimal"
            className="pl-8"
            {...aria}
          />
        </div>
      )}
    </Campo>
  );
}

/**
 * Campo de quantidade.
 *
 * Tambem `type="text"`, pelo mesmo motivo do dinheiro: o `input[type=number]`
 * gravaria "1,5" como invalido em pt-BR, e quem vende peso digita `1,500`.
 */
export function CampoQuantidade({
  nome,
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  defaultValue,
  className,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
  defaultValue?: string | undefined;
  className?: string;
}) {
  return (
    <Campo
      nome={nome}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      {(aria) => (
        <Input
          name={nome}
          defaultValue={defaultValue}
          inputMode="decimal"
          placeholder="0"
          {...aria}
        />
      )}
    </Campo>
  );
}

export function CampoData({
  nome,
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  defaultValue,
  className,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
  /** `AAAA-MM-DD`, que e o que o `input[type=date]` usa. */
  defaultValue?: string | undefined;
  className?: string;
}) {
  return (
    <Campo
      nome={nome}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      {(aria) => (
        <Input type="date" name={nome} defaultValue={defaultValue} {...aria} />
      )}
    </Campo>
  );
}

/** `opcoes` recebe `value: ""` para "nao informado", quando o campo aceita nulo. */
export function CampoSelect({
  nome,
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  defaultValue,
  placeholder,
  opcoes,
  className,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
  defaultValue?: string | undefined;
  placeholder?: string;
  opcoes: readonly { readonly value: string; readonly rotulo: string }[];
  className?: string;
}) {
  return (
    <Campo
      nome={nome}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio}
      className={className}
    >
      {(aria) => (
        <Select name={nome} defaultValue={defaultValue ?? ""} {...aria}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {opcoes.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>
              {opcao.rotulo}
            </option>
          ))}
        </Select>
      )}
    </Campo>
  );
}

export function CampoArea({
  nome,
  rotulo,
  ajuda,
  erro,
  defaultValue,
  rows = 3,
  maxLength,
  className,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  defaultValue?: string | undefined;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  return (
    <Campo nome={nome} rotulo={rotulo} ajuda={ajuda} erro={erro} className={className}>
      {(aria) => (
        <textarea
          name={nome}
          defaultValue={defaultValue}
          rows={rows}
          maxLength={maxLength}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          {...aria}
        />
      )}
    </Campo>
  );
}

/**
 * Checkbox.
 *
 * O campo escondido com o mesmo `name` e o que resolve o problema real do
 * checkbox em formulario sem JavaScript: quando desmarcado, o navegador nao envia
 * NENHUM campo, e a action receberia `undefined` — indistinguivel de "o form nem
 * tem esse campo".
 *
 * A solucao padrao e o par marcado/desmarcado com o mesmo nome. Como o escondido
 * vem primeiro no HTML, a leitura NAO pode ser `get` (sempre devolveria o
 * vazio); e `marcado()` em `lib/form.ts` usa `getAll` e procura `on` em qualquer
 * posicao. Ver o comentario de la para o por que da ordem nao importar.
 */
export function CampoCheckbox({
  nome,
  rotulo,
  ajuda,
  erro,
  defaultChecked,
  className,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  erro?: string | undefined;
  defaultChecked?: boolean;
  className?: string;
}) {
  const idErro = `${nome}-erro`;
  const idHelp = `${nome}-ajuda`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-start gap-2">
        <input type="hidden" name={nome} value="" />
        <input
          type="checkbox"
          id={nome}
          name={nome}
          value="on"
          defaultChecked={defaultChecked}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : ajuda ? idHelp : undefined}
          className="mt-0.5 size-4 rounded border-input shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="grid gap-0.5">
          <Label htmlFor={nome}>{rotulo}</Label>
          {ajuda ? (
            <p id={idHelp} className="text-xs text-muted-foreground">
              {ajuda}
            </p>
          ) : null}
        </div>
      </div>
      {erro ? (
        <p id={idErro} className="text-xs font-medium text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/** Botao de envio com estado de erro/sucesso ao lado. */
export function AcaoFormulario({
  children,
  erro,
  className,
}: {
  children: React.ReactNode;
  erro?: string | undefined;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {children}
      {erro ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
