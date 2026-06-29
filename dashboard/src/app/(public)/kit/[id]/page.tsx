import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { findKitItem } from "@/lib/startup-pack-assets";
import KitResolveForm from "./ResolveForm";

/**
 * /kit/<id> — deep-link resolver for the links printed inside the guide PDFs.
 *
 * The guide PDFs are one shared set of files, so they can't carry a per-buyer
 * token. Instead they link here. If the reader has opened their tokenized kit
 * in this browser, a cookie (sp_kit_token, set by the download page) lets us
 * bounce them straight to their own page, scrolled to the right item. No
 * cookie (new device)? We ask for their purchase email and send the link.
 */
export const dynamic = "force-dynamic"; // reads the request cookie

export default async function KitResolvePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const item = findKitItem(id);

    const jar = await cookies();
    const token = jar.get("sp_kit_token")?.value;
    if (token) {
        const anchor = item ? `#kit-${item.id}` : "";
        redirect(`/startup-pack/download/${encodeURIComponent(token)}${anchor}`);
    }

    return (
        <div className="min-h-screen bg-stone-50">
            <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
                <Link href="/check" className="flex items-center space-x-2">
                    <Image src="/logo.png" alt="CP" width={20} height={20} className="rounded" />
                    <span className="font-bold text-base">CapturePilot</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">Launch Kit</span>
                </Link>
            </header>

            <main className="max-w-lg mx-auto px-4 py-10">
                <div className="bg-white border border-stone-200 rounded-[28px] p-7 sm:p-8 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Open in your kit</p>
                    <h1 className="font-black text-2xl text-stone-900 leading-tight">
                        {item ? item.title : "Your Federal Launch Kit"}
                    </h1>
                    <p className="text-sm text-stone-500 mt-2 leading-relaxed">
                        To open this on your account, use the kit link from your purchase email. If you're on a new device,
                        enter the email you bought with and we'll send your link straight to you.
                    </p>

                    <div className="mt-6">
                        <KitResolveForm itemId={id} />
                    </div>

                    <p className="text-xs text-stone-400 mt-6">
                        Trouble finding it? Email <a href="mailto:support@capturepilot.com" className="underline">support@capturepilot.com</a> and we'll resend your link.
                    </p>
                </div>
            </main>
        </div>
    );
}
