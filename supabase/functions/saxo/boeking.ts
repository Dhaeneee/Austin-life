// AD Omniserve – indeling van Saxo-boekingen (pure functies, lokaal testbaar)
// deno-lint-ignore-file no-explicit-any
const num = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);

// Indeling van een Saxo-boeking op basis van het boekingstype (BkAmountType) zoals Saxo het noemt.
// Wat niet herkend wordt, blijft "overig" en wordt in de app zo getoond (nooit geraden).
export function soortBoeking(b: any): string {
  const t = String(b?.BkAmountType ?? "").toLowerCase(), bedrag = Number(b?.AmountAccountCurrency ?? b?.Amount ?? 0);
  if (/withholding|dividend tax|tax|taks|tob|stamp|belasting|voorheffing/.test(t)) return "belasting";
  if (/dividend/.test(t)) return "dividend";
  if (/commission|fee|cost|charge|custody|kosten|bewaarloon|ticket|exchange fee|service/.test(t)) return "kosten";
  if (/interest|rente/.test(t)) return "rente";
  if (/deposit|withdraw|cash ?transfer|storting|opname|incoming|outgoing|inpayment|payout/.test(t)) return bedrag >= 0 ? "storting" : "opname";
  if (/share amount|bond amount|etf amount|fund amount|trade|aankoop|verkoop|position/.test(t)) return "transactie";
  return "overig";
}
export function boekingRij(uid: string, env: string, b: any) {
  const datum = String(b?.Date ?? b?.ValueDate ?? "").slice(0, 10);
  return {
    user_id: uid, env, id: String(b?.BkAmountId ?? ""), datum: /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : null, soort: soortBoeking(b),
    type_saxo: b?.BkAmountType ? String(b.BkAmountType).slice(0, 80) : null, bedrag: num(b?.AmountAccountCurrency) ?? num(b?.Amount),
    munt: b?.AccountCurrency ?? b?.Currency ?? null, instrument: b?.InstrumentDescription ? String(b.InstrumentDescription).slice(0, 120) : null,
    data: b,
  };
}
