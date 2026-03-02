import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ action: string }> }
) {
    const { action } = await params;

    // Map action parameter to the specific script in the tools/ directory
    const scriptMap: Record<string, string> = {
        "ingest": "1_ingest_sam.py",
        "score": "2_score_matches.py",
        "drafts": "3_generate_email_drafts.py",
        "log": "4_log_outcome.py"
    };

    const scriptName = scriptMap[action];

    if (!scriptName) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    try {
        // Determine path relative to the dashboard directory (assuming tools is sibling)
        const scriptPath = path.join(process.cwd(), "..", "tools", scriptName);

        // Execute python script. Note: Assumes python environment is active or global python has dependencies.
        // In a production setup, explicit python path (e.g., ../venv/bin/python) should be used.
        const { stdout, stderr } = await execAsync(`python "${scriptPath}"`);

        return NextResponse.json({
            success: true,
            action,
            output: stdout,
            errors: stderr
        });

    } catch (error: any) {
        return NextResponse.json({
            success: false,
            action,
            error: error.message
        }, { status: 500 });
    }
}
