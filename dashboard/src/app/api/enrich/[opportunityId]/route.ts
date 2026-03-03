import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ opportunityId: string }> }
) {
    const { opportunityId } = await params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(opportunityId)) {
        return NextResponse.json({ error: "Invalid opportunity ID" }, { status: 400 });
    }

    try {
        const scriptPath = path.join(process.cwd(), "..", "tools", "10_enrichment_orchestrator.py");

        const { stdout, stderr } = await execAsync(
            `python "${scriptPath}" --opportunity_id "${opportunityId}" --trigger manual`,
            { timeout: 180000 } // 3 minute timeout
        );

        return NextResponse.json({
            success: true,
            output: stdout,
            errors: stderr,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({
            success: false,
            error: message,
        }, { status: 500 });
    }
}
