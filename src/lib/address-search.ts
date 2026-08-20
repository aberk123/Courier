import { normalizeStreet, stripStreetSuffix } from "@/lib/import/match";

export type AddressQuery = {
  /** A leading house number, if the CSR typed one ("28" in "28 Squankum Rd"). */
  houseNumber: string | null;
  /** Whatever followed it: a street, a surname, or both. */
  text: string;
  /** The street term to match in the database, suffix stripped. */
  streetTerm: string;
};

/**
 * Turns what a CSR actually types into something searchable.
 *
 * They type an address the way they say it on the phone -- "28 squankum rd",
 * "squankum", "weinstock" -- not into separate house-number and street fields.
 * So the leading number is split off and matched exactly, while the rest is
 * matched loosely against street and recipient name.
 *
 * Returns null for input too short to be worth a table scan.
 */
export function parseAddressQuery(raw: string): AddressQuery | null {
  // PostgREST's or() filter is comma and parenthesis delimited, and ilike
  // treats % and _ as wildcards, so strip what would otherwise change the
  // shape of the query rather than the value being searched for.
  const cleaned = raw
    .replace(/[,()%_*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return null;

  const withNumber = /^(\d+[a-zA-Z]?)\s+(.+)$/.exec(cleaned);
  if (withNumber) {
    const text = withNumber[2];
    return {
      houseNumber: withNumber[1],
      text,
      streetTerm: stripStreetSuffix(normalizeStreet(text)) || text.toLowerCase(),
    };
  }

  // A bare number is a house number with no street -- worth showing every
  // "28" on any street, since the CSR may be reading a partial address.
  if (/^\d+[a-zA-Z]?$/.test(cleaned)) {
    return { houseNumber: cleaned, text: "", streetTerm: "" };
  }

  return {
    houseNumber: null,
    text: cleaned,
    streetTerm: stripStreetSuffix(normalizeStreet(cleaned)) || cleaned.toLowerCase(),
  };
}
