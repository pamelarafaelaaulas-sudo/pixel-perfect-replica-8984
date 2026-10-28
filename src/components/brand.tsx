import { FlaskConical } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Brand({ to = "/" }: { to?: "/" | "/painel" }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-paper transition-transform group-hover:-rotate-12">
        <FlaskConical className="size-4.5" />
      </span>
      <span className="font-display text-lg font-semibold leading-none text-foreground">
        Caderno de Projetos
      </span>
    </Link>
  );
}
