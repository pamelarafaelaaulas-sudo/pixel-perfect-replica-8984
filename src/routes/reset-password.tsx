import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — Caderno de Projetos" },
      { name: "description", content: "Defina uma nova senha para sua conta." },
      { property: "og:title", content: "Nova senha — Caderno de Projetos" },
      { property: "og:description", content: "Defina uma nova senha para sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password !== String(f.get("confirm"))) return toast.error("As senhas não conferem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada!");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background bg-grid px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <form onSubmit={onSubmit} className="card-paper space-y-4 p-7">
          <h1 className="text-2xl font-semibold">Defina sua nova senha</h1>
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <Input id="password" name="password" type="password" minLength={6} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Repita a senha</Label>
            <Input id="confirm" name="confirm" type="password" minLength={6} required />
          </div>
          <Button className="w-full" disabled={busy}>
            Salvar senha
          </Button>
        </form>
      </div>
    </div>
  );
}
