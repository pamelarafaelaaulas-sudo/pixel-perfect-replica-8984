export const SHIRT_SIZES = ["PP", "P", "M", "G", "GG", "XGG"] as const;

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function formatCpf(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Brazilian CPF check digits. */
export function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

export function ageOn(birth: string, at = new Date()): number {
  const b = new Date(birth + "T12:00:00");
  let a = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) a--;
  return a;
}

export type AttendeeForm = {
  full_name: string;
  cpf: string;
  birth_date: string;
  shirt_size: string;
  whatsapp: string;
  guardian_name: string;
  guardian_phone: string;
  dietary: string;
};

export function attendeeProblem(f: AttendeeForm, now = new Date()): string | null {
  if (f.full_name.trim().split(/\s+/).length < 2) return "Digite o nome completo.";
  if (!isValidCpf(f.cpf)) return "CPF inválido.";
  if (!f.birth_date) return "Informe a data de nascimento.";
  if (!(SHIRT_SIZES as readonly string[]).includes(f.shirt_size)) return "Escolha o tamanho da camiseta.";
  if (onlyDigits(f.whatsapp).length < 10) return "WhatsApp inválido.";
  if (ageOn(f.birth_date, now) < 18) {
    if (f.guardian_name.trim().length < 3) return "Menor de 18: informe o nome do responsável.";
    if (onlyDigits(f.guardian_phone).length < 10) return "Menor de 18: informe o telefone do responsável.";
  }
  return null;
}
