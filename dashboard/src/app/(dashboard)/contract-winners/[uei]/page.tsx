"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContractorDetailView } from "@/components/ContractorDetailView";

export default function ContractWinnerDetailPage({ params }: { params: Promise<{ uei: string }> }) {
    const { uei } = use(params);

    return (
        <div className="mx-auto max-w-5xl px-6 py-8">
            <Link href="/contract-winners" className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 mb-4">
                <ArrowLeft className="w-3 h-3" /> Back to Contract Winners
            </Link>
            <ContractorDetailView uei={uei} />
        </div>
    );
}
