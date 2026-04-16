import re

files = [
    "dashboard/src/app/(dashboard)/ai-drafter/proposals/page.tsx",
    "dashboard/src/app/(dashboard)/ai-drafter/capability-statement/page.tsx"
]

for f in files:
    with open(f, "r") as file:
        content = file.read()
    
    # Add import correctly after "use client";
    content = content.replace('"use client";', '"use client";\n\nimport DrafterTabs from "@/components/layout/DrafterTabs";')
    
    # Identify the <header>...</header> block
    # We will just use regex to replace `<header> ... </header>` completely with `<DrafterTabs />` once.
    # Note: Proposals and Cap Statement both have a `<header>` block at the start of their return statement.
    content = re.sub(r'<header>.*?</header>', '<DrafterTabs />', content, count=1, flags=re.DOTALL)

    with open(f, "w") as file:
        file.write(content)

print("done")
