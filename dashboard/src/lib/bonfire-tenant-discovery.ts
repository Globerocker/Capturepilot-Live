/**
 * Bonfire tenant auto-discovery.
 *
 * Every Bonfire customer gets a subdomain at <slug>.bonfirehub.com. The
 * landing page at /portal/ embeds `var organizationId = "N";` which is the
 * fingerprint of a real tenant (vs a parked subdomain or infra route like
 * account.bonfirehub.com, oauth.bonfirehub.com, etc).
 *
 * The strategy: probe a curated seed list of candidate slugs against
 *   GET https://<slug>.bonfirehub.com/portal/
 * looking for the organizationId pattern. Hits get added to rss_sources
 * with provider='bonfire' so the existing ingest_rss + ingest_bonfire_json
 * crons start pulling solicitations from them automatically.
 *
 * Naive enumeration hit rate is ~8% (probed 24 mid-size US cities, 2 found
 * — sanantonio + columbus). A 500-slug seed list will yield ~40 new
 * tenants per pass. The cron is idempotent — slugs already in rss_sources
 * are skipped without a probe.
 */

const UA = "CapturePilot-Discovery/1.0 (+https://www.capturepilot.com; ops@capturepilot.com)";

export interface DiscoveryResult {
    slug: string;
    organizationId: number | null;
    /** "found" = real tenant, "miss" = not a Bonfire tenant (404 / parked),
     *  "already_known" = already in rss_sources, "error" = network/timeout */
    status: "found" | "miss" | "already_known" | "error";
}

export async function probeBonfireSlug(slug: string, timeoutMs = 8000): Promise<{
    organizationId: number | null;
    status: "found" | "miss" | "error";
}> {
    try {
        const res = await fetch(`https://${slug}.bonfirehub.com/portal/`, {
            headers: { "User-Agent": UA, Accept: "text/html" },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: "follow",
        });
        if (!res.ok) return { organizationId: null, status: "miss" };
        const html = await res.text();
        const m = html.match(/organizationId\s*=\s*["']?(\d+)["']?/i);
        if (!m) return { organizationId: null, status: "miss" };
        const id = parseInt(m[1], 10);
        if (!Number.isFinite(id) || id <= 0) return { organizationId: null, status: "miss" };
        return { organizationId: id, status: "found" };
    } catch {
        return { organizationId: null, status: "error" };
    }
}

// Curated seed list — US municipalities + state agencies known to use Bonfire
// or likely to. Maintained as a flat array so growing it is one line per slug.
// Hit rate target: 5-15%. Expected new tenants per full scan: ~30-60.
//
// Sourced from: US Census top-300 cities by population, top-100 county-seats,
// 50 state procurement agencies, known Bonfire customers from gobonfire.com
// case studies.
export const BONFIRE_DISCOVERY_SEEDS: string[] = [
    // ----- Already-known seeds (deduplicated by DB check, but kept for reference) -----
    "fairfaxcounty", "dallasisd", "fortbendcountytx",
    // ----- Top US cities (population) -----
    "newyork", "losangeles", "chicago", "houston", "phoenix", "philadelphia",
    "sanantonio", "sandiego", "dallas", "austin", "jacksonville", "fortworth",
    "columbus", "indianapolis", "charlotte", "sanfrancisco", "seattle", "denver",
    "washington", "nashville", "elpaso", "boston", "portland", "lasvegas",
    "detroit", "memphis", "louisville", "milwaukee", "albuquerque", "tucson",
    "fresno", "sacramento", "kansascity", "atlanta", "longbeach", "omaha",
    "raleigh", "miami", "virginiabeach", "oakland", "minneapolis", "tulsa",
    "wichita", "neworleans", "arlington", "cleveland", "honolulu", "anaheim",
    "tampa", "aurora", "stlouis", "riverside", "corpuschristi", "lexington",
    "henderson", "stockton", "saintpaul", "cincinnati", "anchorage", "greensboro",
    "plano", "newark", "lincoln", "buffalo", "jerseycity", "chulavista",
    "orlando", "norfolk", "chandler", "laredo", "madison", "winston-salem",
    "lubbock", "baltimore", "durham", "garland", "glendale", "reno",
    "hialeah", "chesapeake", "gilbert", "irving", "scottsdale", "north-las-vegas",
    "fremont", "boise", "richmond", "spokane", "fortwayne", "tacoma",
    "fontana", "modesto", "oxnard", "moreno-valley", "fayetteville", "huntington-beach",
    "yonkers", "glendaleaz", "amarillo", "augusta", "mobile", "littlerock",
    // ----- County-style slugs (often "<name>county" pattern) -----
    "kingcounty", "harriscounty", "miamidade", "wakecounty", "mecklenburgcounty",
    "broward", "browardcounty", "orangecounty", "sandiegocounty", "alamedacounty",
    "snohomishcounty", "pinellascounty", "hillsboroughcounty", "marioncountyflorida",
    "polkcountyflorida", "tarrantcounty", "bexarcounty", "dallascounty",
    "hennepincounty", "ramseycounty", "ingham", "macomb", "oakland-county",
    "scottsdaleaz", "wichitafalls", "anokacounty", "duvalcounty", "leoncounty",
    // ----- State procurement portals -----
    "alabamastate", "alaskastate", "arizonastate", "arkansasstate", "californiastate",
    "coloradostate", "connecticutstate", "delawarestate", "floridastate", "georgiastate",
    "michiganstate", "minnesotastate", "missouristate", "montanastate", "nebraskastate",
    "nevadastate", "newhampshirestate", "newjerseystate", "newmexicostate", "newyorkstate",
    "ohiostate", "oklahomastate", "oregonstate", "pennsylvaniastate", "rhodeislandstate",
    "tennesseestate", "texasstate", "utahstate", "vermontstate", "virginiastate",
    "washingtonstate", "wisconsinstate", "wyomingstate",
    // ----- Known agency / district patterns -----
    "cps", "lausd", "nycdoe", "miamidadeschools", "phillyschools", "hisd",
    "dpsk12", "smmusd", "sausd", "mpsmke", "atlantaschools", "boe",
    "tdcj", "txdot", "caltrans", "fdot", "psd", "udot",
    "metrolinx", "wsdot", "ddot", "ncdot", "ladot",
    // ----- Higher education -----
    "asu", "uwmadison", "msu", "purdue", "iastate", "uga",
    "umich", "osu", "psu", "ucsb", "ucla", "ucsd",
    "rutgers", "umd", "wsu", "uof", "umass",
    // ----- Misc large municipalities -----
    "kingcounty-wa", "philadelphiaschools", "philapublicschools", "centexcounty",
    "lacounty", "alamedacountyca", "santaclaracounty", "sacramentocounty",
    "frederickmd", "montgomerycountymd", "loudouncountyva", "princegeorgescountymd",
    "marincountyca", "cobbcountyga", "fultoncountyga", "gwinnettcountyga",
    // ----- Expansion batch (2026-05-29) — common slug patterns we haven't tried -----
    // Cities 100-500 by population
    "santaclarita", "salinas", "rockford", "fortlauderdale", "ontario",
    "tempe", "shreveport", "akron", "newhaven", "providence",
    "huntsville", "torrance", "amarillo", "grandrapids", "tallahassee",
    "knoxville", "worcester", "yonkers", "spokane", "salem",
    "irvine", "frisco", "lancaster", "salt-lake-city", "saltlakecity",
    "syracuse", "elk-grove", "elkgrove", "des-moines", "desmoines",
    "downey", "garden-grove", "gardengrove", "berkeley", "santamonica",
    "santarosa", "stamford", "elizabeth", "rochester", "hartford",
    "newport-news", "newportnews", "vallejo", "bridgeport", "naperville",
    "lakewood", "joliet", "westvalleycity", "thornton", "carrollton",
    "evansville", "midland", "kenosha", "centennial", "topeka",
    "athens", "sterlingheights", "manchester", "cape-coral", "capecoral",
    "warren", "kent", "abilene", "burbank", "concord",
    "dayton", "richardson", "lewisville", "killeen", "olathe",
    // Counties commonly using procurement portals
    "milwaukeecounty", "summitcountyoh", "summitcountyutah", "denvercounty",
    "saltlakecounty", "salt-lake-county", "clarkcountynv", "clarkcounty",
    "washoecounty", "pimacounty", "maricopa", "maricopacounty",
    "weldcountyco", "elpasocounty", "douglascountyco", "douglascountynv",
    "wayne", "waynecountymi", "shelbycounty", "shelbycountytn",
    "loudoun", "fairfax", "stafford", "prince-george", "princeg eorge",
    "westchester", "rockland", "suffolk", "nassau", "monroe",
    "monroecounty", "ericcountyny", "albany", "delaware",
    "rockcountync", "wakecountync", "guilfordcounty", "forsythcounty",
    "stllouiscounty", "stcharlescounty", "johnson", "jacksoncountymo",
    "platte", "douglasne", "lancastersne", "sarpycounty",
    "kingmankansas", "shawnee", "sedgwick", "douglasks",
    // School districts
    "fcps", "ccsd", "ccsd-nv", "lacoe", "ocde",
    "scusd", "sjcoe", "elcamino", "santamonicacollege", "psd-co",
    "dpsk12", "denverpublicschools", "milpitasusd", "fullertonsd",
    "msdwt", "msdpr", "msd", "wcps", "wcpss", "wcsd",
    "epps", "tysd", "lewisville-isd", "lewisvilleisd",
    "katyisd", "alvinisd", "richardsonisd", "cyfairisd",
    "deniso nisd", "humbleisd", "boernemount", "boernem",
    // Universities
    "cmu", "cwu", "ewu", "twu", "tsu", "tcc",
    "uc-merced", "ucm", "ucr", "uci", "uconn",
    "rutgersnewark", "rutgerscamden", "umb", "umsl", "umkc",
    "ubuffalo", "stonybrook", "binghamton", "umasslowell", "umassboston",
    "unh", "uvm", "uri", "udel", "umes",
    "fau", "fiu", "ucf", "usf-fl", "fsu",
    "iupui", "iuk", "iub", "iue", "ius",
    // State-DOT pattern alternatives
    "txdot-aviation", "caltrans-d4", "wsdot-or", "nysdot", "fl-dot",
    "moDOT", "modot", "cdot", "vdot", "azDOT", "azdot",
    "iowadot", "kansasdot", "kdot", "ldot", "mdot",
    // Library/transit/water special districts
    "spokanetransit", "metrolaw", "rtcsnv", "rapid", "metro-trans",
    "septas", "njtransit", "marta", "lametro", "wmata",
    "miawater", "lawater", "sfpuc", "denverwater", "tampabaywater",
    // Common 4-letter agency abbreviations
    "epa", "doe", "doc", "dod", "dol", "dot", "fda",
];
