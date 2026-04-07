"use client";

import { useEffect } from "react";

/** Pricing lives on the marketing site — redirect there */
export default function PricingPage() {
    useEffect(() => {
        window.location.href = "https://capturepilot.com/pricing";
    }, []);
    return null;
}
