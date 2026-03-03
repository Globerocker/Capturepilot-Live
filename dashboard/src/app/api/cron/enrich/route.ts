import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

export const maxDuration = 300;

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
    // Authorization check
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const scriptPath = path.join(process.cwd(), "..", "tools", "10_enrichment_orchestrator.py");

        const { stdout, stderr } = await execAsync(
            `python "${scriptPath}" --trigger auto`,
            { timeout: 280000 } // 4m 40s (within 5m max duration)
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
