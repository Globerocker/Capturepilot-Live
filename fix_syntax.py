import re

with open("dashboard/src/app/(dashboard)/settings/page.tsx", "r") as f:
    lines = f.readlines()

depth = 0
for i, line in enumerate(lines):
    # simple counting ignoring comments/strings for quick heuristic
    line_clean = re.sub(r'//.*', '', line)
    line_clean = re.sub(r'/\*.*?\*/', '', line_clean)
    opens = line_clean.count('<div ') + line_clean.count('<div>')
    closes = line_clean.count('</div')
    if opens > 0 or closes > 0:
        depth += (opens - closes)
        # print(f"L{i+1} : {depth} | +{opens} -{closes}")

# Usually, when someone tries to fix the two-column layout, they break the wrapping.
# Let's just restore the file from my previous `fix_settings.py` or inspect where depth leaps.
