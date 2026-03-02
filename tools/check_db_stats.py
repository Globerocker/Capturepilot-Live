import os
from supabase import create_client

def load_env_file(filepath=".env"):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip().strip("'").strip('"')

load_env_file(".env.local")
load_env_file(".env")

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

res = supabase.table('opportunities').select('id', count='exact').limit(1).execute()
opp_count = res.count

res = supabase.table('contractors').select('id', count='exact').limit(1).execute()
contractor_count = res.count

res = supabase.table('matches').select('id', count='exact').limit(1).execute()
match_count = res.count

res = supabase.table('opportunities').select('posted_date, title').order('posted_date', desc=True).limit(5).execute()
recent_opps = res.data

print(f"Total Opportunities: {opp_count}")
print(f"Total Contractors: {contractor_count}")
print(f"Total Matches: {match_count}")
print("Recent Opportunities:")
for o in recent_opps:
    print(f"  {o['posted_date']} - {o.get('title')}")
