import re

with open("dashboard/src/app/(dashboard)/ai-drafter/page.tsx", "r") as f:
    content = f.read()

# Add import
content = content.replace('import { Suspense', 'import DrafterTabs from "@/components/layout/DrafterTabs";\nimport { Suspense')

# Replace Header
header_start_index = content.find('<header className="mb-6">')
nav_end_index = content.find('</nav>', header_start_index) + len('</nav>')

replacement_nav = """<DrafterTabs />
            {/* Sub-Tabs for Emails & Templates */}
            <div className="flex items-center gap-2 mb-6 mt-6">
                <button type="button" onClick={() => setTab("email")} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${tab === "email" ? "bg-black text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>Email Drafter</button>
                <button type="button" onClick={() => setTab("template")} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${tab === "template" ? "bg-black text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>Template Drafter</button>
            </div>"""

content = content[:header_start_index] + replacement_nav + content[nav_end_index:]

# Remove ProposalTab usage
content = content.replace('{tab === "proposal" && <ProposalTab />}', '')

# We also should set the initial tab to email if someone lands on /ai-drafter
content = content.replace('initialTab === "proposal" || initialTab === "email" || initialTab === "template" ? initialTab : "email"', 'initialTab === "email" || initialTab === "template" ? initialTab : "email"')

with open("dashboard/src/app/(dashboard)/ai-drafter/page.tsx", "w") as f:
    f.write(content)
