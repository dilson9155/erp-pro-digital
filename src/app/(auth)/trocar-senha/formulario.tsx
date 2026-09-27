"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { trocarSenha, type EstadoTrocaSenha } from "@/server/app/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

/**
 * Formulario de troca de senha.
 *
 * Fica em `(auth)` e nao em `(app)` por um motivo concreto: em `(app)` o layout
 * veria `mustChangePassword` e devolveria a pessoa para `/trocar-senha` antes de
 * o formulario existir — um loop de redirect onde a unica tela possivel e a que
 * manda de volta. `decidirAcesso` trata `troca_de_senha` como saida, e saida
 * precisa de uma rota fora do grupo protegido.
 *
 * `PASSWORD_MIN_LENGTH` e importado do mesmo modulo que valida no servidor: a
 * constante nao pode ter duas copias, ou o formulario aceitaria uma senha que a
 * action vai recusar.
 */
export function FormularioTrocaSenha() {
  const [estado, formAction] = useActionState<EstadoTrocaSenha | null, FormData>(trocarSenha, null);
  const erro = estado?.tipo === "erro" ? estado : null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Trocar senha</CardTitle>
        <CardDescription>
          Defina uma senha nova. As outras sessoes serao encerradas e voce voltara a entrar.
        </CardDescription>
      </CardHeader>

      <form action={formAction} className="space-y-4 px-6 pb-6" noValidate>
        {erro ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {erro.mensagem}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="senhaAtual">Senha atual</Label>
          <Input
            id="senhaAtual"
            name="senhaAtual"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            aria-invalid={erro?.campo === "senhaAtual"}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="novaSenha">Senha nova</Label>
          <Input
            id="novaSenha"
            name="novaSenha"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            aria-invalid={erro?.campo === "novaSenha"}
          />
          <p className="text-xs text-muted-foreground">Ao menos {PASSWORD_MIN_LENGTH} caracteres.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmacao">Repita a senha nova</Label>
          <Input
            id="confirmacao"
            name="confirmacao"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={erro?.campo === "confirmacao"}
          />
        </div>

        <BotaoTrocar />
      </form>
    </Card>
  );
}

function BotaoTrocar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Salvando..." : "Trocar senha"}
    </Button>
  );
}
