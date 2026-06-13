import re

with open("dashboard/src/app/(dashboard)/dashboard/page.tsx", "r") as f:
    content = f.read()

# I will wrap everything after the KPI cards section into the grid.
kpi_end_str = "      </section>"
kpi_marker = content.find(kpi_end_str, content.find("KPI Cards")) + len(kpi_end_str)

market_intel_start = content.find("{/* Market Intelligence */}")

if kpi_marker == -1 or market_intel_start == -1:
    print("Could not find markers")
    exit(1)

pre_kpi = content[:kpi_marker]
post_market = content[market_intel_start:]

inner_content = content[kpi_marker:market_intel_start]

# We want to extract each section from inner_content
actions_preview = re.search(r'\{\/\* Action Items \+ Pipeline preview side-by-side.*?\}\)', inner_content, re.DOTALL)
profile_summary = re.search(r'\{\/\* Profile Summary \*\/\}.*?\}\)', inner_content, re.DOTALL)
profile_cta = re.search(r'\{\/\* Profile Completeness \+ Service CTA \*\/\}.*?\}\)\(\)\}', inner_content, re.DOTALL)
pipeline_summary = re.search(r'\{\/\* Pipeline \& Action Items Summary \*\/\}.*?\}\)', inner_content, re.DOTALL)
top_matches = re.search(r'\{\/\* Top Matching Opportunities \*\/\}.*?<\/section>', inner_content, re.DOTALL)
quick_actions = re.search(r'\{\/\* Quick Actions \*\/\}.*?<\/section>', inner_content, re.DOTALL)

if not all([profile_summary, profile_cta, pipeline_summary, top_matches, quick_actions]):
    print("Could not parse all sections")
    # let's just do it manually if regex fails
    pass

# We will just do a simpler search & replace to wrap them if regex doesn't easily capture it all.
# Let's break it down by known strings:
sections = {
    "actions_preview": "{/* Action Items + Pipeline preview side-by-side on wide screens */}",
    "profile_summary": "{/* Profile Summary */}",
    "profile_cta": "{/* Profile Completeness + Service CTA */}",
    "pipeline_summary": "{/* Pipeline & Action Items Summary */}",
    "top_matches": "{/* Top Matching Opportunities */}",
    "quick_actions": "{/* Quick Actions */}"
}
# Find offsets
offsets = [(name, content.find(s_text)) for name, s_text in sections.items() if content.find(s_text) != -1]
offsets.sort(key=lambda x: x[1])
# Include end
offsets.append(("end", market_intel_start))

blocks = {}
for i in range(len(offsets) - 1):
    name = offsets[i][0]
    start = offsets[i][1]
    end = offsets[i+1][1]
    blocks[name] = content[start:end].strip()
    
# Reconstruct!
replacement = f"""
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start mt-6">
        {{/* LEFT COLUMN */}}
        <div className="xl:col-span-8 flex flex-col gap-6">
          {blocks.get('quick_actions', '')}
          {blocks.get('top_matches', '')}
        </div>

        {{/* RIGHT COLUMN */}}
        <div className="xl:col-span-4 flex flex-col gap-6">
          {blocks.get('profile_summary', '')}
          {blocks.get('pipeline_summary', '')}
          {blocks.get('actions_preview', '')}
          {blocks.get('profile_cta', '')}
        </div>
      </div>
"""

new_content = pre_kpi + replacement + "\n      " + post_market

# Now let's rename "Top Matches for You" to "Opportunities" and add fake tabs
new_content = new_content.replace('Top Matches for You', 'Opportunities')

with open("dashboard/src/app/(dashboard)/dashboard/page.tsx", "w") as f:
    f.write(new_content)
    
print("Dashboard layout replaced!")
