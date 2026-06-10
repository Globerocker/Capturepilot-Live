import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

/**
 * POST /api/eligibility
 * Check if a company profile is eligible for an opportunity's set-aside.
 *
 * Body: { notice_id }
 *
 * Returns eligibility assessment with:
 * - eligible: boolean
 * - reasons: string[]
 * - missing: string[] (what's needed to qualify)
 * - recommendations: string[]
 * - match_strength: "strong" | "moderate" | "weak" | "ineligible"
 */
export async function POST(req: NextRequest) {
    // Audit fix #3: require auth, resolve caller's own profile via auth_user_id.
    // Body-supplied user_profile_id is ignored (was an IDOR read on the entire
    // onboarding payload for every customer).
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { sb, profile: callerProfile } = auth;
    if (!callerProfile?.id) {
        return NextResponse.json({ error: "Profile not found for current user" }, { status: 404 });
    }

    try {
        const { notice_id } = await req.json();
        if (!notice_id) {
            return NextResponse.json({ error: "notice_id required" }, { status: 400 });
        }

        const [{ data: profile }, { data: opp }] = await Promise.all([
            sb.from("user_profiles")
                .select("company_name, naics_codes, sba_certifications, state, employee_count, revenue, federal_awards_count, target_states")
                .eq("id", callerProfile.id).single(),
            sb.from("opportunities")
                .select("title, naics_code, set_aside_code, notice_type, place_of_performance_state, estimated_value, response_deadline, veteran_relevance_flag, small_business_relevance_flag, wosb_relevance_flag")
                .eq("notice_id", notice_id).single(),
        ]);

        if (!profile || !opp) return NextResponse.json({ error: "Profile or opportunity not found" }, { status: 404 });

        const eligible: string[] = [];
        const missing: string[] = [];
        const recommendations: string[] = [];

        // 1. NAICS Match
        const userNaics = profile.naics_codes || [];
        if (opp.naics_code && userNaics.includes(opp.naics_code)) {
            eligible.push(`NAICS ${opp.naics_code} matches your profile`);
        } else if (opp.naics_code && userNaics.some((n: string) => n.substring(0, 4) === opp.naics_code?.substring(0, 4))) {
            eligible.push(`NAICS ${opp.naics_code} partially matches (same industry sector)`);
            recommendations.push(`Consider adding NAICS ${opp.naics_code} to your SAM.gov registration`);
        } else if (opp.naics_code) {
            missing.push(`Your NAICS codes don't match ${opp.naics_code}`);
        }

        // 2. Set-Aside Eligibility
        const setAside = (opp.set_aside_code || "").toLowerCase();
        const userCerts = (profile.sba_certifications || []).map((c: string) => c.toLowerCase());

        if (!setAside || setAside.includes("none") || setAside.includes("full and open")) {
            eligible.push("Open competition — no special certification required");
        } else if (setAside.includes("8(a)") || setAside.includes("8a")) {
            if (userCerts.some((c: string) => c.includes("8(a)") || c.includes("8a"))) {
                eligible.push("You hold the required 8(a) certification");
            } else {
                missing.push("8(a) certification required — you don't have this");
                recommendations.push("Apply for 8(a) certification via SBA if your company qualifies as socially/economically disadvantaged");
            }
        } else if (setAside.includes("sdvosb") || setAside.includes("service-disabled")) {
            if (userCerts.some((c: string) => c.includes("sdvosb"))) {
                eligible.push("You hold the required SDVOSB certification");
            } else {
                missing.push("SDVOSB certification required — you don't have this");
                recommendations.push("SDVOSB requires 51%+ ownership by a service-disabled veteran. Register through the VA's VetBiz portal.");
            }
        } else if (setAside.includes("wosb") || setAside.includes("women")) {
            if (userCerts.some((c: string) => c.includes("wosb") || c.includes("edwosb"))) {
                eligible.push("You hold the required WOSB certification");
            } else {
                missing.push("WOSB certification required — you don't have this");
                recommendations.push("WOSB requires 51%+ ownership/control by women. Self-certify via SBA's beta.certify.sba.gov");
            }
        } else if (setAside.includes("hubzone")) {
            if (userCerts.some((c: string) => c.includes("hubzone"))) {
                eligible.push("You hold the required HUBZone certification");
            } else {
                missing.push("HUBZone certification required — you don't have this");
                recommendations.push("HUBZone requires principal office + 35% employees in a designated HUBZone area. Check maps.certify.sba.gov");
            }
        } else if (setAside.includes("small business") || setAside.includes("total small")) {
            // Check SBA size standards
            const revenue = Number(profile.revenue || 0);
            const employees = Number(profile.employee_count || 0);
            if (revenue > 0 && revenue < 40_000_000) {
                eligible.push("You likely qualify as a small business based on revenue");
            } else if (employees > 0 && employees < 500) {
                eligible.push("You likely qualify as a small business based on employee count");
            } else if (revenue === 0 && employees === 0) {
                missing.push("Cannot verify small business status — add revenue and employee count to your profile");
            } else {
                missing.push("You may exceed small business size standards for this NAICS code");
                recommendations.push("Check SBA size standards at sba.gov/size-standards for your specific NAICS code");
            }
        }

        // 3. Geographic fit
        const oppState = opp.place_of_performance_state;
        const targetStates = profile.target_states || [];
        if (!oppState) {
            eligible.push("No specific location requirement");
        } else if (targetStates.includes("NATIONWIDE") || targetStates.includes(oppState) || profile.state === oppState) {
            eligible.push(`Location match: ${oppState}`);
        } else {
            recommendations.push(`This contract is in ${oppState} — consider if you can perform work there`);
        }

        // 4. Past Performance
        const awards = Number(profile.federal_awards_count || 0);
        if (awards >= 3) {
            eligible.push(`${awards} past federal awards — strong past performance`);
        } else if (awards >= 1) {
            eligible.push(`${awards} past federal award(s) — some past performance`);
            recommendations.push("Strengthen your past performance by documenting commercial work relevant to this contract");
        } else {
            missing.push("No federal past performance on record");
            recommendations.push("If you have relevant commercial or state/local experience, document it for your proposal");
        }

        // 5. Deadline check
        if (opp.response_deadline) {
            const daysLeft = Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / 86400000);
            if (daysLeft < 0) {
                missing.push("Deadline has passed");
            } else if (daysLeft <= 3) {
                recommendations.push(`Only ${daysLeft} days left — you need to act immediately`);
            } else if (daysLeft <= 14) {
                recommendations.push(`${daysLeft} days until deadline — start your response now`);
            } else {
                eligible.push(`${daysLeft} days until deadline — sufficient time to prepare`);
            }
        }

        // Calculate strength
        const eligibleCount = eligible.length;
        const missingCount = missing.length;
        let matchStrength: "strong" | "moderate" | "weak" | "ineligible";
        if (missingCount === 0 && eligibleCount >= 3) matchStrength = "strong";
        else if (missingCount <= 1 && eligibleCount >= 2) matchStrength = "moderate";
        else if (missingCount >= 3 || (missingCount > 0 && eligibleCount === 0)) matchStrength = "ineligible";
        else matchStrength = "weak";

        return NextResponse.json({
            success: true,
            eligible: missingCount === 0,
            match_strength: matchStrength,
            eligible_reasons: eligible,
            missing_requirements: missing,
            recommendations,
            opportunity: { title: opp.title, set_aside: opp.set_aside_code, naics: opp.naics_code },
            company: profile.company_name,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
