#!/usr/bin/env python3
"""
Fast description enrichment - processes opportunities in parallel using ThreadPoolExecutor.
Fetches actual description HTML from SAM.gov and stores it + extracted requirements.
"""
import os, sys, re, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

def load_env():
    for fp in [os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), f) for f in (".env.local", ".env")]:
        if os.path.exists(fp):
            with open(fp) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')

load_env()

from supabase import create_client

sb = create_client(
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)
SAM_KEY = os.getenv("SAM_API_KEY")

session = requests.Session()
session.headers.update({"X-Api-Key": SAM_KEY})


def extract_reqs(html):
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text).strip()
    lo = text.lower()
    r = {}
    m = re.search(r'(\d+)\s*(?:employee|worker|personnel|staff|fte)', lo)
    if m: r["min_workforce"] = int(m.group(1))
    m = re.search(r'(\d+)\s*(?:year|yr)s?\s*(?:of\s+)?(?:experience|exp)', lo)
    if m: r["years_experience"] = int(m.group(1))
    if re.search(r'\bbond(?:ing|ed)?\b', lo):
        m = re.search(r'bond[^.]*?\$\s*([\d,.]+\s*(?:million|m|k)?)', lo)
        r["bonding_req"] = f"${m.group(1)}" if m else "Required"
    m = re.search(r'(?:period\s+of\s+performance|base\s+(?:year|period)|contract\s+(?:period|duration))[^.]*?(\d+)\s*(year|month|day|week)', lo)
    if m: r["performance_period"] = f"{m.group(1)} {m.group(2)}{'s' if int(m.group(1))>1 else ''}"
    eq = [e for e in ["fleet","truck","vehicle","excavator","crane","forklift","mower","tractor","vacuum","floor machine","pressure washer"] if e in lo]
    if eq: r["equipment_req"] = ", ".join(eq)
    if re.search(r'\btop\s+secret\b|\bts[/ ]sci\b', lo): r["clearance_level"] = "Top Secret"
    elif re.search(r'\bsecret\b(?!\s*(?:service|ary|ion))', lo): r["clearance_level"] = "Secret"
    elif re.search(r'\bbackground\s+(?:check|investigation)\b', lo): r["clearance_level"] = "Background Check"
    certs = [l for p,l in [(r'\biso\s*\d{4,5}',"ISO"),(r'\bosha',"OSHA"),(r'\bcmmi',"CMMI")] if re.search(p,lo)]
    if certs: r["certifications"] = ", ".join(certs)
    ev = re.search(r'evaluation\s+(?:criteria|factor).{20,500}', text, re.IGNORECASE)
    if ev: r["eval_criteria_summary"] = ev.group(0)[:400].strip()
    return r


def process_opp(opp):
    nid = opp["notice_id"]
    url = f"https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid={nid}"
    for attempt in range(3):
        try:
            r = session.get(url, timeout=20)
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            if r.status_code == 200:
                ct = r.headers.get("content-type", "")
                if "json" in ct or "hal+json" in ct:
                    data = r.json()
                    desc = data.get("description", "")
                else:
                    desc = r.text
                if desc and len(desc) > 10:
                    reqs = extract_reqs(desc) if len(desc) > 50 else {}
                    update = {"description": desc}
                    if reqs:
                        update["structured_requirements"] = reqs
                    sb.table("opportunities").update(update).eq("id", opp["id"]).execute()
                    return ("ok", nid, len(desc))
                return ("empty", nid, 0)
            elif r.status_code == 404:
                sb.table("opportunities").update({"description": "No description available."}).eq("id", opp["id"]).execute()
                return ("404", nid, 0)
            else:
                if attempt == 2:
                    return ("fail", nid, r.status_code)
                time.sleep(2)
        except Exception as e:
            if attempt == 2:
                return ("error", nid, str(e))
            time.sleep(2)
    return ("fail", nid, 0)


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 4200
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    print(f"Fetching opportunities with URL descriptions (limit={limit}, workers={workers})...", flush=True)

    # Get all opportunities that still have SAM URL as description
    all_opps = []
    offset = 0
    while len(all_opps) < limit:
        batch = min(1000, limit - len(all_opps))
        res = sb.table("opportunities") \
            .select("id, notice_id") \
            .like("description", "https://api.sam.gov%") \
            .order("posted_date", desc=True) \
            .range(offset, offset + batch - 1) \
            .execute()
        if not res.data:
            break
        all_opps.extend(res.data)
        offset += batch
        if len(res.data) < batch:
            break

    print(f"Found {len(all_opps)} opportunities to enrich", flush=True)

    ok = 0
    fail = 0
    empty = 0
    notfound = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_opp, opp): opp for opp in all_opps}

        for i, future in enumerate(as_completed(futures), 1):
            status, nid, info = future.result()
            if status == "ok":
                ok += 1
            elif status == "404":
                notfound += 1
            elif status == "empty":
                empty += 1
            else:
                fail += 1

            if i % 50 == 0:
                elapsed = time.time() - start
                rate = i / elapsed if elapsed > 0 else 0
                eta = (len(all_opps) - i) / rate if rate > 0 else 0
                print(f"  [{i}/{len(all_opps)}] ok={ok} 404={notfound} empty={empty} fail={fail} | {rate:.1f}/sec | ETA: {eta/60:.0f}min", flush=True)

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.0f}s ({elapsed/60:.1f}min)", flush=True)
    print(f"  Descriptions fetched: {ok}", flush=True)
    print(f"  Not found (404): {notfound}", flush=True)
    print(f"  Empty responses: {empty}", flush=True)
    print(f"  Failed: {fail}", flush=True)


if __name__ == "__main__":
    main()
