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
        "log": "4_log_outcome.py",
        "discover": "7_discover_contractors.py",
        "enrich_deep": "8_enrich_contacts.py",
        "attachments": "9_download_attachments.py",
        "orchestrate": "10_enrichment_orchestrator.py",
        "win_strategy": "15_ai_win_strategy.py",
        "usaspending": "12_usaspending_enrich.py",
        "download_attachments": "13_download_attachments.py",
    };

    const scriptName = scriptMap[action];

    if (!scriptName) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    try {
        // Determine path relative to the dashboard directory (tools is sibling)
        const projectRoot = path.join(process.cwd(), "..");
        const scriptPath = path.join(projectRoot, "tools", scriptName);

        // Execute python script from the project root so .env loading works
        const { stdout, stderr } = await execAsync(`python3 "${scriptPath}"`, {
            cwd: projectRoot,
            timeout: 300000, // 5 minute timeout
        });

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
