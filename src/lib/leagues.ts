export function weeklyLeague(xp: number) {
  if (xp >= 180) return "Elite";
  if (xp >= 100) return "Diamond";
  if (xp >= 50) return "Gold";
  return xp >= 20 ? "Silver" : "Bronze";
}
