with open("dashboard/src/lib/crawler/index.ts", "r") as f:
    text = f.read()

# remove imports of MemoryStorage
text = text.replace('import { MemoryStorage } from "@crawlee/core";\n', '')
text = text.replace('import { MemoryStorage } from "@crawlee/memory-storage";\n', '')
text = text.replace('import { CheerioCrawler, Configuration } from "@crawlee/cheerio";', 'import os from "os";\nimport { CheerioCrawler, Configuration } from "@crawlee/cheerio";')

# change config definition
old_config = """// Configure Crawlee to use memory instead of disk to prevent Vercel filesystem errors
const memoryStorage = new MemoryStorage({
    localDirectory: undefined, // ensure no disk usage
});
const config = new Configuration({
    storageClient: memoryStorage,
    availableMemoryRatio: 0.5,
});"""

new_config = """// Configure Crawlee to use Vercel's writable /tmp directory to avoid readonly errors
const config = new Configuration({
    defaultDatasetId: "default",
    defaultKeyValueStoreId: "default",
    defaultRequestQueueId: "default",
    purgeOnStart: true,
    availableMemoryRatio: 0.5,
});
// Set storage directory explicitly to /tmp
process.env.CRAWLEE_STORAGE_DIR = os.tmpdir() + '/crawlee_storage';
"""

text = text.replace(old_config, new_config)

with open("dashboard/src/lib/crawler/index.ts", "w") as f:
    f.write(text)

print("fixed crawler tmp folder config")
