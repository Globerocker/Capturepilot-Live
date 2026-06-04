import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { loadPlanLimits } from "@/lib/plan-tier";

export const maxDuration = 60;

const MAX_EXPORT = 20;

/**
 * POST /api/matches/export
 * Body: { match_ids: string[] }
 * Returns: .xlsx file of selected matches for the authenticated user.
 */
export async function POST(req: NextRequest) {
    try {
        const { match_ids } = await req.json();
        if (!Array.isArray(match_ids) || match_ids.length === 0) {
            return NextResponse.json({ error: "match_ids required" }, { status: 400 });
        }
        if (match_ids.length > MAX_EXPORT) {
            return NextResponse.json({ error: `Maximum ${MAX_EXPORT} matches per export` }, { status: 400 });
        }

        // Auth
        const cookieStore = await cookies();
        const authSupabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll() } }
        );
        const { data: { user } } = await authSupabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        );

        // Get caller profile id
        const { data: profile } = await sb
            .from("user_profiles")
            .select("id")
            .eq("auth_user_id", user.id)
            .single();
        if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

        const profileId = (profile as { id: string }).id;

        // Gate: export_data is Pro+ only. Anti-scrape — a Light tier user
        // could grab 65K opps in 4-5 cancel cycles otherwise.
        const { limits, tierLabel } = await loadPlanLimits(profileId);
        if (!limits.export_data) {
            return NextResponse.json({
                error: "Export requires the Pro plan",
                code: "EXPORT_REQUIRES_PRO",
                current_tier: tierLabel,
                upgrade_url: "/billing?upgrade=pro&feature=export_data",
            }, { status: 402 });  // 402 Payment Required
        }

        // Fetch matches scoped to this user
        const { data, error } = await sb
            .from("user_matches")
            .select(
                "id, score, classification, is_saved, " +
                "opportunities(id, notice_id, title, agency, naics_code, notice_type, response_deadline, set_aside_code, place_of_performance_state, award_amount, estimated_value, status)"
            )
            .eq("user_profile_id", profileId)
            .in("id", match_ids);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Build workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Caturepilot";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Opportunities", {
            views: [{ state: "frozen", ySplit: 1 }],
        });

        sheet.columns = [
            { header: "Score", key: "score", width: 10 },
            { header: "Title", key: "title", width: 50 },
            { header: "Agency", key: "agency", width: 28 },
            { header: "NAICS", key: "naics", width: 12 },
            { header: "Notice Type", key: "notice_type", width: 18 },
            { header: "Set-Aside", key: "set_aside", width: 14 },
            { header: "State", key: "state", width: 8 },
            { header: "Value", key: "value", width: 14 },
            { header: "Deadline", key: "deadline", width: 14 },
            { header: "SAM.gov URL", key: "url", width: 48 },
            { header: "Match Score", key: "match_score", width: 12 },
            { header: "Classification", key: "classification", width: 14 },
            { header: "Status", key: "status", width: 14 },
        ];

        // Header styling
        const header = sheet.getRow(1);
        header.font = { bold: true, color: { argb: "FFFFFFFF" } };
        header.alignment = { vertical: "middle", horizontal: "left" };
        header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
        header.height = 20;

        type Row = {
            id: string;
            score: number;
            classification: string;
            opportunities: {
                notice_id?: string;
                title?: string;
                agency?: string;
                naics_code?: string;
                notice_type?: string;
                response_deadline?: string;
                set_aside_code?: string;
                place_of_performance_state?: string;
                award_amount?: number | null;
                estimated_value?: number | null;
                status?: string;
            } | null;
        };

        for (const m of (data || []) as unknown as Row[]) {
            const opp = m.opportunities;
            if (!opp) continue;
            const pct = Math.round((m.score || 0) * 100);
            const value = opp.award_amount ?? opp.estimated_value ?? null;
            const samUrl = opp.notice_id
                ? `https://sam.gov/opp/${opp.notice_id}/view`
                : "";

            sheet.addRow({
                score: `${pct}%`,
                title: opp.title || "",
                agency: opp.agency || "",
                naics: opp.naics_code || "",
                notice_type: opp.notice_type || "",
                set_aside: opp.set_aside_code || "",
                state: opp.place_of_performance_state || "",
                value: value != null ? value : "",
                deadline: opp.response_deadline ? new Date(opp.response_deadline) : "",
                url: samUrl,
                match_score: pct / 100,
                classification: m.classification || "",
                status: opp.status || "",
            });
        }

        // Format columns
        sheet.getColumn("value").numFmt = "$#,##0";
        sheet.getColumn("deadline").numFmt = "yyyy-mm-dd";
        sheet.getColumn("match_score").numFmt = "0%";
        sheet.getColumn("url").alignment = { wrapText: false };

        // Auto filter on header
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

        const buffer = await workbook.xlsx.writeBuffer();

        const stamp = new Date().toISOString().slice(0, 10);
        return new NextResponse(buffer as ArrayBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="capturepilot-opportunities-${stamp}.xlsx"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
