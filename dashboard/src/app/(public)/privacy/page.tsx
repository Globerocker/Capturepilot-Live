import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata: Metadata = {
    title: "Privacy Policy",
    description:
        "How CapturePilot collects, uses, and protects your data. We don't sell personal information and use industry-standard security.",
    alternates: { canonical: "/privacy" },
    robots: { index: true, follow: true },
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-stone-50 px-6 py-12">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-center space-x-3 mb-10">
                    <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shadow-lg">
                        <Image src="/logo.png" alt="CapturePilot" width={20} height={20} className="rounded" />
                    </div>
                    <h1 className="text-2xl font-bold">CapturePilot</h1>
                </div>

                <div className="bg-white rounded-[32px] p-8 border border-stone-200 shadow-sm">
                    <h2 className="text-xl font-bold mb-6">Privacy Policy</h2>

                    <div className="prose prose-sm prose-stone max-w-none space-y-4 text-sm text-stone-600">
                        <p><strong>Last updated:</strong> March 2026</p>

                        <h3 className="font-bold text-black text-base">What We Collect</h3>
                        <p>We collect what you give us when you create an account and set up your company profile — email address, company name, NAICS codes, certifications, and other business details you choose to share.</p>

                        <h3 className="font-bold text-black text-base">How We Use It</h3>
                        <p>Your information is used to match you with relevant federal contracting opportunities, generate win strategies, and improve your experience on the platform. We don&apos;t sell your personal information to third parties.</p>

                        <h3 className="font-bold text-black text-base">Data Storage</h3>
                        <p>Your data sits on Supabase with encryption at rest and in transit. We follow industry-standard security practices to protect your information.</p>

                        <h3 className="font-bold text-black text-base">Third-Party Services</h3>
                        <p>We use SAM.gov public data to source federal opportunities. We may use analytics services to improve the platform. We don&apos;t share your company details with other users or competitors.</p>

                        <h3 className="font-bold text-black text-base">Your Rights</h3>
                        <p>You can request to view, update, or delete your data at any time by contacting us. You can also delete your account from the settings page.</p>

                        <h3 className="font-bold text-black text-base">Contact</h3>
                        <p>For privacy questions, email <strong>privacy@capturepilot.com</strong></p>
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <Link href="/signup" className="text-sm text-stone-500 hover:text-black inline-flex items-center">
                        <ArrowLeft className="w-3 h-3 mr-1" /> Back to Sign Up
                    </Link>
                </div>
            </div>
        </div>
    );
}
