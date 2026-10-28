import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "dd 'de' MMM", { locale: ptBR });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function fmtAgo(d: string | Date | null | undefined) {
  if (!d) return "—";
  return formatDistanceToNow(new Date(d), { locale: ptBR, addSuffix: true });
}

/** yyyy-MM-dd for <input type="date"> in local time */
export function toDateInput(d: string | Date) {
  return format(new Date(d), "yyyy-MM-dd");
}

/** Local end-of-day ISO string from yyyy-MM-dd */
export function endOfDayFromInput(value: string) {
  const [y = 1970, m = 1, day = 1] = value.split("-").map(Number);
  return new Date(y, m - 1, day, 23, 59, 0).toISOString();
}

export function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}`;
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
