"use client";

import { useState, useEffect } from "react";
import {
    Building, Mail, Phone, ExternalLink, Star, MapPin, Shield, User,
} from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase/client";

const supabase = createSupabaseClient();

interface ContractorContact {
    id: string;
    full_name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    source: string;
    confidence: string;
}

interface EnrichedContractor {
    id: string;
    contractor_id: string;
    discovery_source: string;
    enrichment_status: string;
    contact_readiness_score: number;
    contractors: {
        id: string;
        company_name: string;
        city: string | null;
        state: string | null;
        business_url: string | null;
        website: string | null;
        google_rating: number | null;
        google_reviews_count: number | null;
        primary_poc_name: string | null;
        primary_poc_email: string | null;
        primary_poc_phone: string | null;
        sba_certifications: string[] | null;
        sam_registered: boolean | null;
        social_linkedin: string | null;
    };
}

interface Props {
    opportunityId: string;
}

function ReadinessIndicator({ score }: { score: number }) {
    const color = score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-500" : "text-stone-400";
    const bgColor = score >= 70 ? "bg-emerald-50 border-emerald-200" : score >= 40 ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-200";

    return (
        <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${bgColor}`}>
            <span className={`text-sm font-bold font-typewriter ${color}`}>{score}</span>
        </div>
    );
}

function SourceBadge({ source }: { source: string }) {
    const config: Record<string, { label: string; bg: string }> = {
        sam_entity: { label: "SAM.gov", bg: "bg-blue-100 text-blue-700" },
        google_local: { label: "Google", bg: "bg-orange-100 text-orange-700" },
        existing_match: { label: "Matched", bg: "bg-stone-100 text-stone-600" },
    };
    const c = config[source] || { label: source, bg: "bg-stone-100 text-stone-600" };

    return (
        <span className={`text-[10px] font-bold font-typewriter px-2 py-0.5 rounded-full ${c.bg}`}>
            {c.label}
        </span>
    );
}

export default function EnrichedContractorsList({ opportunityId }: Props) {
    const [contractors, setContractors] = useState<EnrichedContractor[]>([]);
    const [contacts, setContacts] = useState<Record<string, ContractorContact[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);

            // Fetch opportunity contractors with joined contractor data
            const { data: ocData } = await supabase
                .from("opportunity_contractors")
                .select(
                    `id, contractor_id, discovery_source, enrichment_status, contact_readiness_score,
                     contractors(id, company_name, city, state, business_url, website,
                     google_rating, google_reviews_count, primary_poc_name, primary_poc_email,
                     primary_poc_phone, sba_certifications, sam_registered, social_linkedin)`
                )
                .eq("opportunity_id", opportunityId)
                .order("contact_readiness_score", { ascending: false });

            if (ocData) {
                setContractors(ocData as unknown as EnrichedContractor[]);

                // Fetch contacts for all contractors
                const contractorIds = ocData.map((oc: { contractor_id: string }) => oc.contractor_id);
                if (contractorIds.length > 0) {
                    const { data: contactData } = await supabase
                        .from("contractor_contacts")
                        .select("*")
                        .in("contractor_id", contractorIds);

                    if (contactData) {
                        const grouped: Record<string, ContractorContact[]> = {};
                        for (const c of contactData) {
                            if (!grouped[c.contractor_id]) grouped[c.contractor_id] = [];
                            grouped[c.contractor_id].push(c as ContractorContact);
                        }
                        setContacts(grouped);
                    }
                }
            }

            setLoading(false);
        }

        fetchData();
    }, [opportunityId]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-stone-400 text-sm font-typewriter py-4">
                <div className="w-4 h-4 border-2 border-stone-300 border-t-transparent rounded-full animate-spin" />
                Loading contractors...
            </div>
        );
    }

    if (contractors.length === 0) {
        return (
            <p className="text-stone-400 text-sm font-typewriter py-4">
                No contractors discovered yet. Click &quot;Enrich Now&quot; to find contractors.
            </p>
        );
    }

    return (
        <div className="grid gap-3">
            {contractors.map((oc) => {
                const c = oc.contractors;
                if (!c) return null;
                const cContacts = contacts[c.id] || [];
                const primaryContact = cContacts.find(
                    (ct) => ct.confidence === "high" && ct.full_name
                ) || cContacts.find((ct) => ct.full_name) || cContacts[0];

                return (
                    <div
                        key={oc.id}
                        className="flex items-start gap-4 p-4 rounded-2xl border border-stone-200 bg-white hover:border-stone-300 transition-colors"
                    >
                        {/* Readiness Score */}
                        <ReadinessIndicator score={oc.contact_readiness_score} />

                        {/* Main Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-typewriter font-bold text-sm truncate">
                                    {c.company_name}
                                </h4>
                                <SourceBadge source={oc.discovery_source} />
                                {c.sam_registered && (
                                    <span title="SAM Registered">
                                        <Shield className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                    </span>
                                )}
                            </div>

                            {/* Location */}
                            {(c.city || c.state) && (
                                <p className="flex items-center gap-1 text-xs text-stone-500 mb-1.5">
                                    <MapPin className="w-3 h-3" />
                                    {[c.city, c.state].filter(Boolean).join(", ")}
                                </p>
                            )}

                            {/* Decision Maker */}
                            {primaryContact && (
                                <div className="flex items-center gap-2 text-xs mb-1.5">
                                    <User className="w-3 h-3 text-stone-400" />
                                    <span className="font-medium">
                                        {primaryContact.full_name || "Contact"}
                                    </span>
                                    {primaryContact.title && (
                                        <span className="text-stone-400">
                                            {primaryContact.title}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Certifications */}
                            {c.sba_certifications && c.sba_certifications.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {c.sba_certifications.map((cert: string) => (
                                        <span
                                            key={cert}
                                            className="text-[10px] font-typewriter bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded"
                                        >
                                            {cert}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Google Rating */}
                            {c.google_rating && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-stone-500">
                                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                    {c.google_rating}
                                    {c.google_reviews_count && (
                                        <span>({c.google_reviews_count} reviews)</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                            {(primaryContact?.email || c.primary_poc_email) && (
                                <a
                                    href={`mailto:${primaryContact?.email || c.primary_poc_email}`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-typewriter bg-stone-100 hover:bg-stone-200 transition-colors"
                                    title={primaryContact?.email || c.primary_poc_email || ""}
                                >
                                    <Mail className="w-3 h-3" /> Email
                                </a>
                            )}
                            {(primaryContact?.phone || c.primary_poc_phone) && (
                                <a
                                    href={`tel:${primaryContact?.phone || c.primary_poc_phone}`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-typewriter bg-stone-100 hover:bg-stone-200 transition-colors"
                                >
                                    <Phone className="w-3 h-3" /> Call
                                </a>
                            )}
                            {(primaryContact?.linkedin_url || c.social_linkedin || c.business_url || c.website) && (
                                <a
                                    href={primaryContact?.linkedin_url || c.social_linkedin || c.business_url || c.website || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-typewriter bg-stone-100 hover:bg-stone-200 transition-colors"
                                >
                                    <ExternalLink className="w-3 h-3" /> Link
                                </a>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
