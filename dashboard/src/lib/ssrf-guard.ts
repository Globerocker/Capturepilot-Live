import { lookup } from "node:dns/promises";

/**
 * Reject URLs that resolve to private/loopback/link-local IPs or use a
 * non-http(s) protocol. Use BEFORE issuing a `fetch(url)` against any
 * user-supplied URL.
 *
 * Throws on rejection. Returns void on accept.
 */
const PRIVATE_V4_RANGES: Array<{ base: number; mask: number; bits: number }> = [
    // 10.0.0.0/8
    { base: ipv4ToInt("10.0.0.0"), mask: 0xff000000, bits: 8 },
    // 172.16.0.0/12
    { base: ipv4ToInt("172.16.0.0"), mask: 0xfff00000, bits: 12 },
    // 192.168.0.0/16
    { base: ipv4ToInt("192.168.0.0"), mask: 0xffff0000, bits: 16 },
    // 127.0.0.0/8 — loopback
    { base: ipv4ToInt("127.0.0.0"), mask: 0xff000000, bits: 8 },
    // 169.254.0.0/16 — link-local (incl AWS/GCP metadata 169.254.169.254)
    { base: ipv4ToInt("169.254.0.0"), mask: 0xffff0000, bits: 16 },
    // 0.0.0.0/8
    { base: ipv4ToInt("0.0.0.0"), mask: 0xff000000, bits: 8 },
    // 100.64.0.0/10 — carrier-grade NAT
    { base: ipv4ToInt("100.64.0.0"), mask: 0xffc00000, bits: 10 },
];

function ipv4ToInt(ip: string): number {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateV4(ip: string): boolean {
    const n = ipv4ToInt(ip);
    return PRIVATE_V4_RANGES.some(r => (n & r.mask) === r.base);
}

function isPrivateV6(ip: string): boolean {
    const lower = ip.toLowerCase();
    // ::1 loopback
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
    // fc00::/7 (unique local addresses)
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    // fe80::/10 link-local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    // IPv4-mapped (::ffff:10.0.0.1, etc) — strip mapping and recheck v4
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped && isPrivateV4(mapped[1])) return true;
    return false;
}

export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error("Invalid URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }

    const host = parsed.hostname;
    if (!host) throw new Error("Missing hostname");

    // Resolve all A/AAAA records and reject if any are private.
    const records = await lookup(host, { all: true });
    for (const { address, family } of records) {
        if (family === 4 && isPrivateV4(address)) {
            throw new Error(`Refusing to fetch private IP ${address} (host ${host})`);
        }
        if (family === 6 && isPrivateV6(address)) {
            throw new Error(`Refusing to fetch private IP ${address} (host ${host})`);
        }
    }

    return parsed;
}
