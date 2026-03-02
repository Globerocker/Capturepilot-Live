export async function parseSAMCSV(
    file: File,
    onProgress: (percent: number) => void,
    onBatch: (rows: Record<string, string>[]) => Promise<void>
) {
    const CHUNK_SIZE = 1024 * 512; // 512KB chunks
    let offset = 0;
    let leftover = "";
    let headers: string[] = [];
    let isFirstRow = true;

    const getRows = (str: string, isLastChunk: boolean) => {
        const rows = [];
        let currentRow = [];
        let inQuotes = false;
        let val = "";

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            const nextChar = str[i + 1];

            if (char === '"' && inQuotes && nextChar === '"') {
                val += '"';
                i++; // skip escaped quote
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                currentRow.push(val.trim());
                val = "";
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') i++; // skip \n of \r\n
                currentRow.push(val.trim());
                rows.push(currentRow);
                currentRow = [];
                val = "";
            } else {
                val += char;
            }
        }

        if (!isLastChunk && currentRow.length > 0) {
            // Did not finish the line, return it as leftover
            if (inQuotes) {
                return { rows, leftoverSpan: str.slice(str.lastIndexOf('\n') + 1) }; // Overly simple fallback
            }
        }

        // Last chunk, or we happen to end cleanly
        if (currentRow.length > 0 || val !== "") {
            currentRow.push(val.trim());
            rows.push(currentRow);
        }

        return { rows, leftoverSpan: "" };
    };

    // A more robust but simpler split for SAM.gov which usually is heavily quoted
    // Read using stream or slice

    while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const text = await slice.text();
        const chunkData = leftover + text;

        // Find the last unquoted newline to split cleanly
        let lastNewline = -1;
        let inQuotes = false;
        for (let i = 0; i < chunkData.length; i++) {
            if (chunkData[i] === '"') inQuotes = !inQuotes;
            if (chunkData[i] === '\n' && !inQuotes) lastNewline = i;
        }

        let toParse = chunkData;
        if (lastNewline !== -1 && offset + CHUNK_SIZE < file.size) {
            toParse = chunkData.substring(0, lastNewline);
            leftover = chunkData.substring(lastNewline + 1);
        } else {
            leftover = "";
        }

        const { rows } = getRows(toParse, offset + CHUNK_SIZE >= file.size);

        let batchRecords = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (r.length < 2) continue; // skip empty

            if (isFirstRow) {
                headers = r.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                isFirstRow = false;
                continue;
            }

            let obj: Record<string, string> = {};
            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = r[j] || "";
            }
            batchRecords.push(obj);
        }

        if (batchRecords.length > 0) {
            // Process batch
            await onBatch(batchRecords);
        }

        offset += CHUNK_SIZE;
        onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
    }
}
