"use client";

import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-stone-50 px-6 py-12">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-center space-x-3 mb-10">
                    <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shadow-lg">
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold font-typewriter">CapturePilot</h1>
                </div>

                <div className="bg-white rounded-[32px] p-8 border border-stone-200 shadow-sm">
                    <h2 className="text-xl font-bold font-typewriter mb-6">Terms of Service</h2>

                    <div className="prose prose-sm prose-stone max-w-none space-y-4 text-sm text-stone-600">
                        <p><strong>Last updated:</strong> March 2026</p>

                        <h3 className="font-typewriter font-bold text-black text-base">Acceptance of Terms</h3>
                        <p>By creating an account or using CapturePilot, you agree to these terms. If you do not agree, please do not use the service.</p>

                        <h3 className="font-typewriter font-bold text-black text-base">Service Description</h3>
                        <p>CapturePilot is a federal contract matching and capture management platform. We provide opportunity matching, win probability scoring, and pipeline management tools to help small businesses pursue government contracts.</p>

                        <h3 className="font-typewriter font-bold text-black text-base">Beta Program</h3>
                        <p>CapturePilot is currently in beta. The service is provided free of charge during the beta period. Features, pricing, and availability may change. Beta users will receive a 25% discount when paid plans launch.</p>

                        <h3 className="font-typewriter font-bold text-black text-base">Your Responsibilities</h3>
                        <p>You are responsible for maintaining the accuracy of your account information. You agree not to use the platform for any unlawful purpose or to interfere with other users&apos; experience.</p>

                        <h3 className="font-typewriter font-bold text-black text-base">Data Accuracy</h3>
                        <p>While we strive to provide accurate opportunity data sourced from SAM.gov and other federal databases, we cannot guarantee the accuracy or completeness of all listings. Always verify opportunity details directly on SAM.gov before submitting proposals.</p>

                        <h3 className="font-typewriter font-bold text-black text-base">Limitation of Liability</h3>
                        <p>CapturePilot is provided &ldquo;as is&rdquo; without warranty. We are not liable for any missed opportunities, unsuccessful bids, or business decisions made based on information from our platform.</p>

                        <h3 className="font-typewriter font-bold text-black text-base">Changes to Terms</h3>
                        <p>We may update these terms as the service evolves. We will notify registered users of significant changes via email.</p>

                        <h3 className="font-typewriter font-bold text-black text-base">Contact</h3>
                        <p>For questions about these terms, email us at <strong>legal@capturepilot.com</strong></p>
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
