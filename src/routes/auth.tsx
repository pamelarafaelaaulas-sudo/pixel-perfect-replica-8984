import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Caderno de Projetos" },
      { name: "description", content: "Entre ou crie sua conta para acessar o projeto científico da turma." },
      { property: "og:title", content: "Entrar — Caderno de Projetos" },
      { property: "og:description", content: "Acesse o caderno do seu grupo ou o painel da professora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function translateError(message: string) {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
  if (/already registered/i.test(message)) return "Este e-mail já tem conta. Use a aba Entrar.";
  if (/password/i.test(message) && /6/.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
  return message;
}

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/painel", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setBusy(false);
    if (error) {
      toast.error(translateError(error.message));
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  async function onSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: String(f.get("password")),
      options: {
        emailRedirectTo: window.location.origin + "/painel",
        data: { name: String(f.get("name")).trim() },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(translateError(error.message));
      return;
    }
    if (!data.session) setSentTo(email);
  }

  async function onForgot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(String(f.get("email")), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(translateError(error.message));
      return;
    }
    toast.success("Enviamos um link para redefinir sua senha.");
    setMode("signin");
  }

  async function onGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) {
      toast.error("Não foi possível entrar com Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background bg-grid px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <div className="card-paper p-7">
          {sentTo ? (
            <div className="space-y-3 text-center">
              <h1 className="text-2xl font-semibold">Confira seu e-mail</h1>
              <p className="text-sm text-muted-foreground">
                Enviamos um link de confirmação para <strong className="text-foreground">{sentTo}</strong>.
                Clique nele para ativar sua conta.
              </p>
              <Button variant="outline" onClick={() => setSentTo(null)}>
                Voltar
              </Button>
            </div>
          ) : mode === "forgot" ? (
            <form onSubmit={onForgot} className="space-y-4">
              <h1 className="text-2xl font-semibold">Esqueci minha senha</h1>
              <div className="space-y-2">
                <Label htmlFor="femail">E-mail</Label>
                <Input id="femail" name="email" type="email" required />
              </div>
              <Button className="w-full" disabled={busy}>
                Enviar link
              </Button>
              <Button type="button" variant="link" className="w-full" onClick={() => setMode("signin")}>
                Voltar para entrar
              </Button>
            </form>
          ) : (
            <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
              <TabsList className="mb-6 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={onSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input id="password" name="password" type="password" autoComplete="current-password" required />
                  </div>
                  <Button className="w-full" disabled={busy}>
                    Entrar
                  </Button>
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={onSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input id="name" name="name" autoComplete="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="semail">E-mail</Label>
                    <Input id="semail" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="spassword">Senha</Label>
                    <Input
                      id="spassword"
                      name="password"
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <Button className="w-full" disabled={busy}>
                    Criar conta
                  </Button>
                </form>
              </TabsContent>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
                <GoogleIcon /> Continuar com Google
              </Button>
            </Tabs>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="underline-offset-4 hover:underline">
            Voltar ao início
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.72 14.53 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12s4.12 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.99 0-.6-.07-1.06-.15-1.51Z"
      />
    </svg>
  );
}
