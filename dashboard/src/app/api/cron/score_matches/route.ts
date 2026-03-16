import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

export const maxDuration = 300;

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const projectRoot = path.join(process.cwd(), "..");
        const scriptPath = path.join(projectRoot, "tools", "2_score_matches.py");

        const { stdout, stderr } = await execAsync(
            `python3 "${scriptPath}"`,
            { cwd: projectRoot, timeout: 280000 }
        );

        return NextResponse.json({
            success: true,
            output: stdout,
            errors: stderr,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
