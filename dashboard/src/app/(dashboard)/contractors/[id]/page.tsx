import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import ContractorDetailClient from "./ClientPage";

export const dynamic = 'force-dynamic';

export default async function ContractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
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
