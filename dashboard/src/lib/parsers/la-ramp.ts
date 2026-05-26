/**
 * LA RAMP (rampla.org) Aura-framework enrichment client.
 *
 * Per docs/source-analysis/LA_RAMP.md: rampla.org is a Salesforce
 * Experience Cloud site. The detail page is a hydrated SPA, but the
 * underlying Aura action endpoint at `/s/sfsites/aura?r=N` accepts
 * anonymous POSTs with `aura.token=undefined` and returns rich JSON.
 *
 * Three action descriptors cover ~95% of an Opportunity detail:
 *   1. DetailController.getRecord → 40 fields incl. Description, Bid_Due__c,
 *      Amount, Account
 *   2. CompanyProfileController.getContentDocuments → attachment list
 *   3. (optional) CompanyProfileController.getCompanyDetailsWithId → agency
 *
 * All three can be batched in one POST.
 *
 * Used as PER-ROW ENRICHMENT for LA Socrata rows that already exist in
 * `opportunities` (notice_id starts with `socrata-la-ramp-`). We don't
 * use this as a bulk discovery source — Socrata covers that.
 */

const BASE = "https://www.rampla.org";
const AURA_PATH = "/s/sfsites/aura";
const UA = "CapturePilot/1.0 (+https://www.capturepilot.com; ops@capturepilot.com)";

export interface RampOpportunityDetail {
    record_id: string;
    title: string | null;
    description: string | null;
    department: string | null;
    bid_due: string | null;            // ISO
    amount: number | null;
    account_id: string | null;
    account_name: string | null;
    stage: string | null;
    category: string | null;
    raw: Record<string, unknown> | null;
}

export interface RampAttachment {
    content_document_id: string;
    title: string;
    file_extension: string | null;
    size_bytes: number | null;
    download_url: string;
}

/** Salesforce Aura POSTs need an `aura.context` envelope that varies by
 *  site build version. Both the build ID (`fwuid`) and the action descriptor
 *  hashes need to match a known-working snapshot. We hard-code the snapshot
 *  documented in the research report. If rampla.org rebuilds the site, this
 *  function returns null and the caller falls back to no enrichment. */
function auraContext() {
    return {
        mode: "PROD",
        // fwuid is the Salesforce site build ID; refresh quarterly by
        // visiting rampla.org and copying the value from the Network tab.
        fwuid: "ON7L_jr1zMR8jaC9_lQ9eA",
        app: "siteforce:communityApp",
        loaded: { "APPLICATION@markup://siteforce:communityApp": "1" },
        dn: [],
        globals: {},
        uad: false,
    };
}

export async function fetchRampOpportunityDetail(args: {
    recordId: string;
    timeoutMs?: number;
}): Promise<RampOpportunityDetail | null> {
    const message = {
        actions: [
            {
                id: "1",
                descriptor: "serviceComponent://ui.force.components.controllers.detail.DetailController/ACTION$getRecord",
                callingDescriptor: "UNKNOWN",
                params: {
                    recordId: args.recordId,
                    record: null,
                    inContextOfComponent: null,
                    mode: "VIEW",
                    layoutType: "FULL",
                },
            },
        ],
    };
    const body = new URLSearchParams({
        message: JSON.stringify(message),
        "aura.context": JSON.stringify(auraContext()),
        "aura.token": "undefined",
    });

    try {
        const res = await fetch(`${BASE}${AURA_PATH}?r=1&other.detail.DetailController.getRecord=1`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": UA,
                Accept: "application/json",
            },
            body: body.toString(),
            signal: AbortSignal.timeout(args.timeoutMs ?? 12000),
        });
        if (!res.ok) return null;
        const j = await res.json() as { actions?: Array<{ returnValue?: { record?: Record<string, unknown> } }> };
        const rec = j.actions?.[0]?.returnValue?.record;
        if (!rec) return null;

        // Salesforce records nest custom fields with __c suffix.
        const f = (k: string): unknown => rec[k];
        const str = (k: string): string | null => {
            const v = f(k);
            return typeof v === "string" && v ? v : null;
        };
        const num = (k: string): number | null => {
            const v = f(k);
            return typeof v === "number" ? v : null;
        };

        const account = rec.Account as { Name?: string; Id?: string } | undefined;

        return {
            record_id: (rec.Id as string) || args.recordId,
            title: str("Name") || str("Subject"),
            description: str("Description__c") || str("Description"),
            department: account?.Name || str("Department__c") || null,
            bid_due: str("Bid_Due__c") || str("CloseDate"),
            amount: num("Amount"),
            account_id: account?.Id || null,
            account_name: account?.Name || null,
            stage: str("StageName") || str("Status__c"),
            category: str("Type") || str("Category__c"),
            raw: rec,
        };
    } catch {
        return null;
    }
}

export async function fetchRampAttachments(args: {
    recordId: string;
    timeoutMs?: number;
}): Promise<RampAttachment[]> {
    const message = {
        actions: [
            {
                id: "1",
                descriptor: "aura://ApexActionController/ACTION$execute",
                callingDescriptor: "UNKNOWN",
                params: {
                    namespace: "",
                    classname: "CompanyProfileController",
                    method: "getContentDocuments",
                    params: { recordId: args.recordId },
                    cacheable: false,
                    isContinuation: false,
                },
            },
        ],
    };
    const body = new URLSearchParams({
        message: JSON.stringify(message),
        "aura.context": JSON.stringify(auraContext()),
        "aura.token": "undefined",
    });

    try {
        const res = await fetch(`${BASE}${AURA_PATH}?r=2&CompanyProfileController.getContentDocuments=1`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": UA,
                Accept: "application/json",
            },
            body: body.toString(),
            signal: AbortSignal.timeout(args.timeoutMs ?? 10000),
        });
        if (!res.ok) return [];
        const j = await res.json() as { actions?: Array<{ returnValue?: Array<Record<string, unknown>> }> };
        const list = j.actions?.[0]?.returnValue;
        if (!Array.isArray(list)) return [];

        return list.map((d) => {
            const cdId = (d.ContentDocumentId as string) || (d.Id as string) || "";
            const title = (d.Title as string) || "";
            return {
                content_document_id: cdId,
                title,
                file_extension: (d.FileExtension as string) || null,
                size_bytes: typeof d.ContentSize === "number" ? d.ContentSize : null,
                download_url: cdId ? `${BASE}/sfc/servlet.shepherd/document/download/${cdId}` : "",
            };
        }).filter((a) => a.content_document_id && a.download_url);
    } catch {
        return [];
    }
}
