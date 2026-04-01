"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Pricing lives on the marketing site — redirect to login */
export default function PricingPage() {
    const router = useRouter();
    useEffect(() => { router.replace("/login"); }, [router]);
    return null;
}
