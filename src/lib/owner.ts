/** Pâmela's own account: only she sees her caricature (other teachers see the FECITI Flow logo). */
export const OWNER_EMAILS = ["pamelarafaelaaulas@gmail.com"];

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase());
}
