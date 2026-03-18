import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Building, Target, ShieldAlert, Award, Zap, MapPin, Calendar, CheckSquare, Phone, User, Mail } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import EmailDraftPanel from "@/components/EmailDraftPanel";
import CallButton from "@/components/CallButton";
import PursueButton from "@/components/PursueButton";
import OpportunityDescription from "@/components/OpportunityDescription";
import OpportunityAttachments from "@/components/OpportunityAttachments";
import StructuredRequirements from "@/components/StructuredRequirements";

export const dynamic = 'force-dynamic';

interface SamContact {
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
    fax?: string;
    type?: string;
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
    );

    const { data: opp, error } = await supabase
        .from("opportunities")
        .select("*")
        .eq("id", (await params).id)
        .single();

    if (error || !opp) {
        notFound();
    }

    // Fetch contacts from the contacts table
    const { data: dbContacts } = await supabase
        .from("contacts")
        .select("*")
        .eq("notice_id", opp.notice_id)
        .order("is_primary", { ascending: false });

    // Also extract POC from SAM.gov raw_json as fallback
    const rawJson = opp.raw_json || {};
    const samPocs: SamContact[] = [];
    if (rawJson.pointOfContact) {
        const pocs = Array.isArray(rawJson.pointOfContact)
            ? rawJson.pointOfContact
            : [rawJson.pointOfContact];
        for (const poc of pocs) {
            if (poc.fullName || poc.email || poc.phone) {
                samPocs.push({
                    fullName: poc.fullName,
                    title: poc.title,
                    email: poc.email,
                    phone: poc.phone,
                    fax: poc.fax,
                    type: poc.type,
                });
            }
        }
    }

    // Build unified contact list: DB contacts first, then SAM POCs not already in DB
    const contacts: { name: string; title?: string; email?: string; phone?: string; isPrimary?: boolean; source: string }[] = [];

    if (dbContacts && dbContacts.length > 0) {
        for (const c of dbContacts) {
            contacts.push({
                name: c.fullname || "Unknown",
                title: c.title || undefined,
                email: c.email || undefined,
                phone: c.phone || undefined,
                isPrimary: c.is_primary,
                source: "database",
            });
        }
    }

    // Add SAM POCs that aren't duplicates
    for (const poc of samPocs) {
        const isDuplicate = contacts.some(
            (c) => c.name.toLowerCase() === (poc.fullName || "").toLowerCase()
                || (c.email && poc.email && c.email.toLowerCase() === poc.email.toLowerCase())
        );
        if (!isDuplicate && poc.fullName) {
            contacts.push({
                name: poc.fullName,
                title: poc.title || undefined,
                email: poc.email || undefined,
                phone: poc.phone || undefined,
                source: "sam",
            });
        }
    }

    // Primary contact for CallButton
    const primaryContact = contacts[0] || null;

    // Parse complex JSONB fields cleanly
    const reqs = opp.structured_requirements || {};
    const strat = opp.strategic_scoring || {};
    const aiStrat = opp.ai_win_strategy || {};
    const setAsides = opp.set_aside_types || {};

    // Helper formatting
    const rawValue = opp.estimated_value || opp.award_amount;
    const formattedValue = rawValue ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(rawValue) : "TBD";
    const statusColor = (val: string) => {
        if (!val) return "text-stone-500 bg-stone-100";
        const v = val.toUpperCase();
        if (v === "HIGH") return "text-red-700 bg-red-100 border-red-200";
        if (v === "MEDIUM") return "text-yellow-700 bg-yellow-100 border-yellow-200";
        if (v === "LOW") return "text-green-700 bg-green-100 border-green-200";
        return "text-stone-700 bg-stone-100 border-stone-200";
    };

    const locationString = [
        opp.place_of_performance_city,
        opp.place_of_performance_state,
        opp.place_of_performance_zip,
        opp.place_of_performance_country
    ].filter(Boolean).join(", ");

    return (
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-10 animate-in fade-in duration-500 pb-16 px-1">
            {/* Header section */}
            <header className="mb-2 sm:mb-4">
                <Link href="/opportunities" className="inline-flex items-center text-sm font-typewriter text-stone-500 hover:text-black mb-4 sm:mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Opportunities
                </Link>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <span className="bg-stone-100 text-stone-800 font-bold font-typewriter text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-md border border-stone-200 uppercase tracking-wider shadow-sm">
                        {opp.notice_id}
                    </span>
                    <span className="bg-blue-50 text-blue-700 font-bold font-typewriter text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-md border border-blue-200 tracking-wider shadow-sm">
                        {opp.notice_type || "UNKNOWN TYPE"}
                    </span>
                    {opp.is_archived && (
                        <span className="bg-stone-800 text-stone-100 font-bold font-typewriter text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-md shadow-sm tracking-wider">
                            ARCHIVED
                        </span>
                    )}
                </div>
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-stone-900 leading-tight mb-4 sm:mb-6">
                    {opp.title}
                </h1>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-8">
                {/* Left Column: Data & Requirements */}
                <div className="xl:col-span-2 space-y-4 sm:space-y-8">

                    {/* 1. BASIC CONTRACT DATA */}
                    <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <h2 className="font-typewriter text-base sm:text-lg font-bold flex items-center text-stone-800">
                                <Target className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Basic Contract Data
                            </h2>
                            <span className="text-xl sm:text-2xl font-bold text-emerald-600 tracking-tight">{formattedValue}</span>
                        </div>

                        <div className="p-4 sm:p-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                                <div className="space-y-4 sm:space-y-6">
                                    <div>
                                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Agency / Department</p>
                                        <div className="flex items-start">
                                            <Building className="w-5 h-5 text-stone-400 mr-2 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-stone-800">{opp.agency || "Agency Not Specified"}</p>
                                                <p className="text-sm text-stone-500">{opp.department || ""}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">NAICS Codes <InfoTooltip text="Government classification codes for work type. Your NAICS codes are matched against these to find relevant opportunities." /></p>
                                        <div className="flex flex-wrap gap-2">
                                            {Array.isArray(opp.naics_code) ? opp.naics_code.map((n: string, i: number) => (
                                                <span key={i} className="bg-stone-100 text-stone-700 font-mono text-sm px-2.5 py-1 rounded border border-stone-200">
                                                    {n}
                                                </span>
                                            )) : (
                                                <span className="bg-stone-100 text-stone-700 font-mono text-sm px-2.5 py-1 rounded border border-stone-200">
                                                    {opp.naics_code || "---"}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Place of Performance <InfoTooltip text="Where the work will be performed. Being nearby improves your match score and reduces mobilization costs." /></p>
                                        <div className="flex items-start">
                                            <MapPin className="w-5 h-5 text-stone-400 mr-2 shrink-0 mt-0.5" />
                                            <p className="font-medium text-stone-800">{locationString || "Location TBD"}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 sm:space-y-6">
                                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                        <div>
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Posted Date</p>
                                            <div className="flex items-center text-stone-800 font-medium">
                                                <Calendar className="w-4 h-4 text-stone-400 mr-2" />
                                                {opp.posted_date ? new Date(opp.posted_date).toLocaleDateString() : "---"}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1.5">Response Deadline <InfoTooltip text="Last date to submit your response. Missing this deadline means automatic disqualification." /></p>
                                            <div className="flex items-center text-red-600 font-bold">
                                                <Calendar className="w-4 h-4 text-red-400 mr-2" />
                                                {opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD"}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2.5">Set-Aside Target <InfoTooltip text="Restricts competition to specific small business categories. If you hold the matching certification (e.g. 8(a), SDVOSB, HUBZone), you have a significant competitive advantage." /></p>
                                        <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                                            <p className="font-bold text-stone-800 mb-3 text-sm pb-2 border-b border-stone-200">
                                                Raw: {opp.set_aside_code || "UNRESTRICTED"}
                                            </p>
                                            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.total_small_business ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.total_small_business ? "text-stone-900 font-medium" : "text-stone-400")}>Total SB</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.partial_small_business ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.partial_small_business ? "text-stone-900 font-medium" : "text-stone-400")}>Partial SB</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides["8a"] ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides["8a"] ? "text-stone-900 font-medium" : "text-stone-400")}>8(a)</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.sdvosb ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.sdvosb ? "text-stone-900 font-medium" : "text-stone-400")}>SDVOSB</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.hubzone ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.hubzone ? "text-stone-900 font-medium" : "text-stone-400")}>HUBZone</span>
                                                </div>
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <CheckSquare className={clsx("w-4 h-4", setAsides.full_and_open ? "text-emerald-500" : "text-stone-300")} />
                                                    <span className={clsx(setAsides.full_and_open ? "text-stone-900 font-medium" : "text-stone-400")}>Full & Open</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* POINT OF CONTACT */}
                    {contacts.length > 0 && (
                        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                            <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5">
                                <h2 className="font-typewriter text-base sm:text-lg font-bold flex items-center text-stone-800">
                                    <User className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Point of Contact
                                </h2>
                            </div>
                            <div className="p-4 sm:p-8">
                                <div className="space-y-4">
                                    {contacts.map((contact, i) => (
                                        <div key={i} className={clsx(
                                            "flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6",
                                            i > 0 && "pt-4 border-t border-stone-100"
                                        )}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-bold text-stone-900 text-base">{contact.name}</p>
                                                    {contact.isPrimary && (
                                                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-typewriter font-bold px-2 py-0.5 rounded-full border border-emerald-200">PRIMARY</span>
                                                    )}
                                                </div>
                                                {contact.title && (
                                                    <p className="text-sm text-stone-500 mb-2">{contact.title}</p>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {contact.phone && (
                                                    <a
                                                        href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                                                        className="inline-flex items-center bg-emerald-50 text-emerald-700 font-typewriter font-bold px-3 py-2 rounded-xl text-xs hover:bg-emerald-100 transition-all border border-emerald-200"
                                                    >
                                                        <Phone className="w-3.5 h-3.5 mr-1.5" />
                                                        {contact.phone}
                                                    </a>
                                                )}
                                                {contact.email && (
                                                    <a
                                                        href={`mailto:${contact.email}`}
                                                        className="inline-flex items-center bg-blue-50 text-blue-700 font-typewriter font-bold px-3 py-2 rounded-xl text-xs hover:bg-blue-100 transition-all border border-blue-200"
                                                    >
                                                        <Mail className="w-3.5 h-3.5 mr-1.5" />
                                                        {contact.email}
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. STRUCTURED REQUIREMENTS - auto-extracted from description */}
                    <StructuredRequirements dbRequirements={reqs} noticeId={opp.notice_id} />

                    {/* Description - fetched live from SAM.gov */}
                    <OpportunityDescription noticeId={opp.notice_id} currentDescription={opp.description} defaultCollapsed={true} />

                    {/* Incumbent Intelligence */}
                    {(opp.incumbent_contractor_name || opp.award_amount) && (
                        <div className="bg-amber-50 rounded-2xl sm:rounded-3xl border border-amber-200 shadow-sm overflow-hidden">
                            <div className="bg-amber-100/50 border-b border-amber-200 px-4 sm:px-8 py-4 sm:py-5">
                                <h2 className="font-typewriter text-base sm:text-lg font-bold flex items-center text-amber-900">
                                    <ShieldAlert className="w-5 h-5 mr-2 sm:mr-3 text-amber-600" /> Incumbent Intelligence
                                </h2>
                            </div>
                            <div className="p-4 sm:p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {opp.incumbent_contractor_name && (
                                        <div>
                                            <p className="text-[10px] font-typewriter text-amber-600 uppercase tracking-widest mb-1.5">Current Contractor <InfoTooltip text="The company currently performing this work. Incumbents have a significant advantage in rebids. Understanding the incumbent helps shape your competitive strategy." /></p>
                                            <p className="font-bold text-amber-900 text-lg">{opp.incumbent_contractor_name}</p>
                                            {opp.incumbent_contractor_uei && (
                                                <p className="font-mono text-xs text-amber-700 mt-1">UEI: {opp.incumbent_contractor_uei}</p>
                                            )}
                                        </div>
                                    )}
                                    {opp.award_amount && (
                                        <div>
                                            <p className="text-[10px] font-typewriter text-amber-600 uppercase tracking-widest mb-1.5">Previous Award Value <InfoTooltip text="Contract value. Ideal if 20-80% of your annual revenue for comfortable execution capacity." /></p>
                                            <p className="font-bold text-amber-900 text-lg">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(opp.award_amount)}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Attachments - fetched live from SAM.gov */}
                    <OpportunityAttachments noticeId={opp.notice_id} resourceLinks={opp.resource_links} defaultCollapsed={true} />

                </div>

                {/* Right Column: Strategic AI Win Info */}
                <div className="space-y-4 sm:space-y-8">

                    {/* 3. STRATEGIC SCORING */}
                    <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-4 sm:px-6 py-3 sm:py-4">
                            <h2 className="font-typewriter text-[15px] font-bold flex items-center text-stone-800">
                                <Award className="w-4 h-4 mr-2 text-stone-400" /> Strategic Scoring
                            </h2>
                        </div>

                        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-[10px] sm:text-xs font-typewriter text-stone-500 uppercase tracking-widest">Est. Competition <InfoTooltip text="Estimated number of competitors based on NAICS popularity, set-aside type, and contract value. LOW = fewer competitors, better odds." /></span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border", statusColor(strat.est_competition_level))}>
                                    {strat.est_competition_level || "UNKNOWN"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Complexity Level <InfoTooltip text="How complex the requirements are based on document length, specialized needs, and compliance requirements. Higher complexity favors experienced contractors." /></span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border", statusColor(strat.complexity_level))}>
                                    {strat.complexity_level || "UNKNOWN"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-typewriter text-stone-500 uppercase tracking-widest">Win Prob Tier <InfoTooltip text="Estimated win probability based on your match score, competition level, and strategic factors. HIGH = strong alignment with your profile." /></span>
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-full border shadow-sm", statusColor(strat.win_prob_tier))}>
                                    {strat.win_prob_tier || "UNKNOWN"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Call & Transcribe */}
                    <CallButton
                        opportunityId={opp.id}
                        contactName={primaryContact?.name}
                        contactPhone={primaryContact?.phone}
                    />

                    {/* 4. AI WIN STRATEGY */}
                    <div className="bg-stone-900 rounded-2xl sm:rounded-3xl text-white relative overflow-hidden shadow-xl border border-stone-800">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

                        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-stone-800/50 flex items-center justify-between relative z-10">
                            <h2 className="font-typewriter text-[15px] font-bold flex items-center text-white">
                                <Zap className="w-4 h-4 mr-2 text-emerald-400" /> AI Win Strategy
                            </h2>
                        </div>

                        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 relative z-10">
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Executive Summary</p>
                                <p className="text-sm text-stone-300 leading-relaxed">
                                    {aiStrat.summary || "No AI strategy generated yet. Execute Phase 4 document analysis tools to populate."}
                                </p>
                            </div>

                            {aiStrat.sales_angle && (
                                <div className="bg-stone-950/50 rounded-2xl p-4 border border-emerald-900/30">
                                    <p className="text-[10px] font-typewriter text-emerald-400 uppercase tracking-widest mb-2">Recommended Sales Angle</p>
                                    <p className="text-sm text-white font-medium italic">&ldquo;{aiStrat.sales_angle}&rdquo;</p>
                                </div>
                            )}

                            {aiStrat.recommended_profile && (
                                <div className="bg-stone-950/50 rounded-2xl p-4 border border-stone-800">
                                    <p className="text-[10px] font-typewriter text-blue-400 uppercase tracking-widest mb-2">Target Profile Match</p>
                                    <p className="text-sm text-stone-300 font-medium">{aiStrat.recommended_profile}</p>
                                </div>
                            )}

                            {aiStrat.key_risks && aiStrat.key_risks.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-typewriter text-rose-400 uppercase tracking-widest mb-3 flex items-center">
                                        <ShieldAlert className="w-3 h-3 mr-1.5" /> Key Risks Identified
                                    </p>
                                    <ul className="space-y-2">
                                        {aiStrat.key_risks.map((risk: string, i: number) => (
                                            <li key={i} className="text-xs text-stone-300 flex items-start bg-rose-950/20 p-2.5 rounded-lg border border-rose-900/30">
                                                <span className="mr-2.5 text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                                                <span className="leading-snug">{risk}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Email Draft Panel */}
                    <EmailDraftPanel opportunityId={opp.id} opportunityTitle={opp.title} />

                    {/* Service CTA */}
                    <a href="https://calendly.com/americurial/intro-call" target="_blank" rel="noopener noreferrer"
                        className="block bg-gradient-to-br from-blue-50 to-white rounded-2xl sm:rounded-3xl border border-blue-200 p-4 sm:p-6 hover:shadow-md transition-all group">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <Phone className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <p className="font-typewriter font-bold text-sm text-stone-900 mb-1">
                                    Want help winning this contract?
                                </p>
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    Book a free strategy call. We&apos;ll review this opportunity with you, assess your competitive position, and help build a capture plan.
                                </p>
                            </div>
                        </div>
                    </a>
                </div>
            </div>

            {/* 5. Pursue This Opportunity - Sticky CTA */}
            <div className="sticky bottom-0 z-30 -mx-1 px-1 pt-6 pb-2 bg-gradient-to-t from-stone-50 via-stone-50/95 to-transparent">
                <PursueButton opportunityId={opp.id} noticeType={opp.notice_type || ""} />
            </div>
        </div>
    );
}
