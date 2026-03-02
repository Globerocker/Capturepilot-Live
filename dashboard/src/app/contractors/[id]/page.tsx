import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import ContractorDetailClient from "./ClientPage";

export const dynamic = 'force-dynamic';

export default async function ContractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: contractor, error } = await supabase
        .from("contractors")
        .select("*")
        .eq("id", (await params).id)
        .single();

    if (error || !contractor) {
        notFound();
    }

    return <ContractorDetailClient initialData={contractor} />;
}
