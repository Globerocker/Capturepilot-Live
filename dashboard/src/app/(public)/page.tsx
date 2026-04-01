"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root page — redirects to /login (app-only, no landing page).
 * Landing/marketing lives on a separate domain.
 */
export default function RootPage() {
    const router = useRouter();
    useEffect(() => { router.replace("/login"); }, [router]);
    return null;
}
