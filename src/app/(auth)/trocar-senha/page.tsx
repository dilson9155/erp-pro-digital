import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { readSessionToken, authenticateSession } from "@/server/app/auth/queries";
import { FormularioTrocaSenha } from "./formulario";

export const metadata: Metadata = { title: "Trocar senha" };

/**
 * So chega aqui quem tem sessao AUTENTICADA (o layout `(auth)` ja redireciona
 * quem nao tem). A checagem abaixo e o par que falta: sessao com
 * `mustChangePassword` desligado nao tem motivo para ver esta tela, e sem o
 * `redirect` ela seria um formulario que valida uma senha para trocar outra
 * senha — uma operacao que so faz sentido logo apos um administrador redefinir.
 */
export default async function PageTrocarSenha() {
  const token = await readSessionToken();
  const autenticado = token ? await authenticateSession(token) : null;
  if (!autenticado) redirect("/login");

  if (!autenticado.user.mustChangePassword) redirect("/escolher-empresa");

  return (
    <div className="flex w-full justify-center">
      <FormularioTrocaSenha />
    </div>
  );
}