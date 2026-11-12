// VAT numbers and IBANs: parsing and offline checks used before any external lookup.

export const EU_VAT_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE',
  'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI',
] as const;

export interface ParsedVat {
  /** VIES member-state code (Greece is EL). */
  vatCountry: string;
  number: string;
  /** Normalised, e.g. BG203145882. */
  full: string;
  /** ISO 3166 country of the business (EL → GR, XI → GB). */
  country: string;
}

/**
 * Reads a VAT number typed in any format ("bg 203 145 882", "203145882"). A bare number of
 * 9–10 digits is taken as Bulgarian. Returns null when the text is not shaped like a VAT number.
 */
export function parseVat(input: string): ParsedVat | null {
  const raw = input.toUpperCase().replace(/[\s.\-/]/g, '');
  let vatCountry: string;
  let number: string;
  if (/^\d{9,10}$/.test(raw)) {
    vatCountry = 'BG';
    number = raw;
  } else {
    const m = /^([A-Z]{2})([0-9A-Z+*]{2,12})$/.exec(raw);
    if (!m) return null;
    vatCountry = m[1] === 'GR' ? 'EL' : m[1];
    number = m[2];
    if (!(EU_VAT_COUNTRIES as readonly string[]).includes(vatCountry) || !/\d/.test(number)) return null;
  }
  const country = vatCountry === 'EL' ? 'GR' : vatCountry === 'XI' ? 'GB' : vatCountry;
  return { vatCountry, number, full: vatCountry + number, country };
}

export function normaliseIban(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

const IBAN_LENGTHS: Record<string, number> = {
  AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27,
  GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IL: 23, IT: 27, LT: 20, LU: 20, LV: 21, MT: 31, NL: 18,
  NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24,
};

/** Length per country plus the ISO 7064 mod-97 checksum. */
export function isValidIban(input: string): boolean {
  const iban = normaliseIban(input);
  if (!/^[A-Z]{2}\d{2}[0-9A-Z]{10,30}$/.test(iban)) return false;
  const len = IBAN_LENGTHS[iban.slice(0, 2)];
  if (len && iban.length !== len) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

export function maskIban(last4: string | null | undefined): string | null {
  return last4 ? `IBAN ····${last4}` : null;
}

// Bulgarian IBANs carry the bank's BIC prefix at positions 5–8 (BG80 BNBG 9661 …).
const BG_BANKS: Record<string, { bank: string; bic: string }> = {
  UNCR: { bank: 'UniCredit Bulbank', bic: 'UNCRBGSF' },
  STSA: { bank: 'DSK Bank', bic: 'STSABGSF' },
  UBBS: { bank: 'United Bulgarian Bank', bic: 'UBBSBGSF' },
  FINV: { bank: 'First Investment Bank', bic: 'FINVBGSF' },
  BPBI: { bank: 'Postbank (Eurobank Bulgaria)', bic: 'BPBIBGSF' },
  RZBB: { bank: 'Raiffeisenbank (Bulgaria)', bic: 'RZBBBGSF' },
  CECB: { bank: 'Central Cooperative Bank', bic: 'CECBBGSF' },
  PRCB: { bank: 'ProCredit Bank (Bulgaria)', bic: 'PRCBBGSF' },
  BNBG: { bank: 'Bulgarian National Bank', bic: 'BNBGBGSD' },
  IORT: { bank: 'Investbank', bic: 'IORTBGSF' },
  TTBB: { bank: 'Texim Bank', bic: 'TTBBBG22' },
  BUIN: { bank: 'Allianz Bank Bulgaria', bic: 'BUINBGSF' },
  SOMB: { bank: 'Municipal Bank', bic: 'SOMBBGSF' },
  BGUS: { bank: 'Bulgarian-American Credit Bank', bic: 'BGUSBGSF' },
  CREX: { bank: 'Tokuda Bank', bic: 'CREXBGSF' },
  DEMI: { bank: 'D Commerce Bank', bic: 'DEMIBGSF' },
  NASB: { bank: 'Bulgarian Development Bank', bic: 'NASBBGSF' },
  INTF: { bank: 'International Asset Bank', bic: 'INTFBGSF' },
};

/** Bank name and BIC from the IBAN where the bank code is known; null otherwise. */
export function bankFromIban(input: string): { bank: string; bic: string } | null {
  const iban = normaliseIban(input);
  if (iban.startsWith('BG') && iban.length >= 8) return BG_BANKS[iban.slice(4, 8)] ?? null;
  return null;
}
