with open("dashboard/src/lib/crawler/index.ts", "r") as f:
    text = f.read()

text = text.replace(
    'import { CheerioCrawler, MemoryStorage, Configuration } from "@crawlee/cheerio";',
    'import { CheerioCrawler, Configuration } from "@crawlee/cheerio";\nimport { MemoryStorage } from "@crawlee/memory-storage";'
)

with open("dashboard/src/lib/crawler/index.ts", "w") as f:
    f.write(text)

print("fixed index.ts")
