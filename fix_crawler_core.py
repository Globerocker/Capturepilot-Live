with open("dashboard/src/lib/crawler/index.ts", "r") as f:
    text = f.read()

text = text.replace(
    'import { MemoryStorage } from "@crawlee/memory-storage";',
    'import { MemoryStorage } from "@crawlee/core";'
)

with open("dashboard/src/lib/crawler/index.ts", "w") as f:
    f.write(text)

print("fixed index.ts core")
