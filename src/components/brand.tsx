import { Link } from "@tanstack/react-router";
import logo from "@/assets/feciti-flow-logo.png.asset.json";

export function Brand({ to = "/" }: { to?: "/" | "/painel" }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5">
      <img src={logo.url} alt="FECITI Flow" className="h-11 w-auto rounded-md transition-transform group-hover:scale-105" />
    </Link>
  );
}
