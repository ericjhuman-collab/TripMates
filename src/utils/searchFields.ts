const DIACRITICS_RE = /[̀-ͯ]/g;

const stripDiacritics = (s: string) =>
    s.normalize('NFKD').replace(DIACRITICS_RE, '').toLowerCase().trim();

export function normalizeSearchInput(s: string): string {
    return stripDiacritics(s);
}

export function deriveUserSearchFields(opts: {
    name?: string;
    lastName?: string;
}): { nameLower?: string; lastNameLower?: string } {
    const out: { nameLower?: string; lastNameLower?: string } = {};

    if (opts.name) out.nameLower = stripDiacritics(opts.name);

    if (opts.lastName) {
        out.lastNameLower = stripDiacritics(opts.lastName);
    } else if (opts.name) {
        const parts = opts.name.trim().split(/\s+/);
        if (parts.length > 1) {
            out.lastNameLower = stripDiacritics(parts[parts.length - 1]);
        }
    }

    return out;
}
