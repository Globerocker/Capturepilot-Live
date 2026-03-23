/**
 * SSRF prevention: check if a hostname resolves to a private IP.
 * Ported from tools/17_analyze_company.py lines 174-182.
 */

import { lookup } from "dns/promises";

const PRIVATE_PREFIXES = [
    "127.", "10.", "0.", "192.168.",
    "169.254.",
];

function isPrivateIPv4(ip: string): boolean {
    if (PRIVATE_PREFIXES.some(p => ip.startsWith(p))) return true;
    // 172.16.0.0/12
    if (ip.startsWith("172.")) {
        const second = parseInt(ip.split(".")[1], 10);
        if (second >= 16 && second <= 31) return true;
    }
    return false;
}

export async function isPrivateIp(hostname: string): Promise<boolean> {
    try {
        const { address } = await lookup(hostname);
        if (address === "::1") return true;
        return isPrivateIPv4(address);
    } catch {
        return false;
    }
}

export function normalizeUrl(url: string): string {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }
    return url.replace(/\/+$/, "");
}
