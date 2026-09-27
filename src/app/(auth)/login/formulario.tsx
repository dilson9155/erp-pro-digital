"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { login, type EstadoLogin } from "@/server/app/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { branding } from "@/config/branding";

/**
 * Formulário de login.
 *
 * Client Component porque `useActionState` guarda o estado entre submissões. O
 * que ele NÃO faz é validar credencial: o `<form action>` envia direto para a
 * Server Action, e a senha nunca passa por código do navegador além do campo que
 * a pessoa digitou. Validar no cliente antes de enviar só daria a oportunidade
 * de pular a validação — quem chama a action direto, com `curl`, não passa pelo
 * React.
 *
 * O `mfa_necessario` é o que troca o formulário pela versão com o campo de TOTP,
 * sem trocar de rota. Ver `EstadoLogin` para o porquê de ser um estado de
 * SUCESSO e não um erro.
 */
export function FormularioLogin() {
  const [estado, formAction] = useActionState<EstadoLogin | null, FormData>(login, null);

  // Estreita o estado para o formato de erro, e usa `erro` no resto do
  // formulário. Acessar `estado.campo` direto não compila, porque `EstadoLogin`
  // tem três formatos e só o de erro tem `campo` — e o compilador está certo em
  // reclamar: num estado `mfa_necessario` o campo não existe.
  const erro = estado?.tipo === "erro" ? estado : null;
  const mostrarTotp = estado?.tipo === "mfa_necessario" || erro?.campo === "totpCode";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {erro ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {erro.mensagem}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={erro?.campo === "email"}
          placeholder="voce@suaempresa.com.br"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={erro?.campo === "password"}
        />
      </div>

      {mostrarTotp ? (
        <div className="space-y-2">
          <Label htmlFor="totpCode">Codigo de verificacao</Label>
          <Input
            id="totpCode"
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            aria-invalid={erro?.campo === "totpCode"}
            placeholder="000000"
          />
          <p className="text-xs text-muted-foreground">
            Use o codigo do seu aplicativo autenticador.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input id="rememberMe" name="rememberMe" type="checkbox" className="size-4 rounded border-input" />
        <Label htmlFor="rememberMe" className="font-normal text-muted-foreground">
          Manter conectado
        </Label>
      </div>

      <BotaoEnviar />

      <p className="text-center text-xs text-muted-foreground">
        Problemas para entrar? Fale com {branding.supportEmail}.
      </p>
    </form>
  );
}

/**
 * Botão que desabilita durante o envio.
 *
 * `useFormStatus` vive no FILHO do `<form>`, não no próprio formulário: o hook
 * lê o contexto da submissão mais próxima acima dele, e quem está dentro do
 * `<form>` é o `<button>` — colocá-lo no mesmo componente faria o status ser
 * sempre o do formulário pai, que não existe.
 *
 * Sem isso, o botão continua clicável durante o `bcrypt` (300 ms) e a pessoa
 * envia o login duas vezes, gastando duas vezes o rate limit dela.
 */
function BotaoEnviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}
