export type Countdown = { days: number; hours: number; minutes: number; seconds: number; started: boolean };

/** Time left until `target`. Once the moment arrives, everything is 0 and `started` is true. */
export function countdown(target: Date, now: Date): Countdown {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, started: true };
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
    started: false,
  };
}

type FairSource = { fair_at: string | null; fair_name: string | null };

/** The fair to count down to among the user's classes: the soonest one still ahead, otherwise the most recent. */
export function pickFair(classes: FairSource[], now: Date): { at: Date; name: string } | null {
  const fairs = classes
    .filter((c): c is { fair_at: string; fair_name: string | null } => !!c.fair_at)
    .map((c) => ({ at: new Date(c.fair_at), name: c.fair_name?.trim() || "FECITI/MS" }));
  if (!fairs.length) return null;
  const ahead = fairs.filter((f) => f.at > now).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (ahead.length) return ahead[0]!;
  return fairs.sort((a, b) => b.at.getTime() - a.at.getTime())[0]!;
}
