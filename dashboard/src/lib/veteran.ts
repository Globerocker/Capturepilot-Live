/**
 * Veteran-owned business eligibility helpers.
 *
 * A user qualifies for the 20% veteran discount if ANY of the following is true:
 *   - user_profiles.is_veteran_owned = true (set by verification or self-declaration)
 *   - user_profiles.sba_certifications contains 'SDVOSB' or 'VOSB'
 *     (populated by the SAM Entity API response)
 */

export const VETERAN_DISCOUNT_PERCENT = 20;
export const VETERAN_CERT_TYPES = ["SDVOSB", "VOSB"] as const;
export type VeteranCertType = (typeof VETERAN_CERT_TYPES)[number] | "self_declared" | "manual";

export interface ProfileVeteranFields {
    is_veteran_owned?: boolean | null;
    veteran_cert_type?: string | null;
    veteran_verified_at?: string | null;
    veteran_verified_source?: string | null;
    sba_certifications?: string[] | null;
}

export function isVeteranEligible(profile: ProfileVeteranFields | null | undefined): boolean {
    if (!profile) return false;
    if (profile.is_veteran_owned === true) return true;
    const certs = (profile.sba_certifications || []).map((c) => (c || "").toUpperCase());
    return certs.includes("SDVOSB") || certs.includes("VOSB");
}

export function veteranCertLabel(profile: ProfileVeteranFields | null | undefined): string | null {
    if (!profile) return null;
    const certs = (profile.sba_certifications || []).map((c) => (c || "").toUpperCase());
    if (certs.includes("SDVOSB")) return "SDVOSB Verified";
    if (certs.includes("VOSB")) return "VOSB Verified";
    if (profile.veteran_cert_type === "SDVOSB") return "SDVOSB Verified";
    if (profile.veteran_cert_type === "VOSB") return "VOSB Verified";
    if (profile.veteran_cert_type === "self_declared") return "Veteran-Owned";
    if (profile.veteran_cert_type === "manual") return "Veteran-Owned";
    return null;
}

export function discountedPrice(base: number): number {
    return Math.round(base * (1 - VETERAN_DISCOUNT_PERCENT / 100));
}
