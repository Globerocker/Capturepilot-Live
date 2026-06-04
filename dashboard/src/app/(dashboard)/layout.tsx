import { Suspense } from "react";
import Sidebar from "@/components/layout/Sidebar";
import UpgradeBanner from "@/components/UpgradeBanner";
import FeedbackWidget from "@/components/FeedbackWidget";
import GlobalToast from "@/components/GlobalToast";
import SupportChat from "@/components/SupportChat";
import GlobalJobsIndicator from "@/components/jobs/GlobalJobsIndicator";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import ConsultingCTA from "@/components/ConsultingCTA";
import HubSpotChat from "@/components/HubSpotChat";
// import { ReviewPrompt } from "@/components/ReviewPrompt"; // Disabled until Google Business Profile is set up

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex bg-stone-50 min-h-screen lg:h-screen lg:overflow-hidden text-stone-900 selection:bg-black selection:text-white">
      <Suspense fallback={<div className="w-64 border-r border-stone-200 bg-white" />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 flex flex-col overflow-hidden lg:pl-2 pt-14 lg:pt-0">
        <ImpersonationBanner />
        <div className="bg-emerald-600 text-white text-center py-2 px-4 text-xs font-medium">
          New: Light $39/mo · Pro $89/mo · 14-day free trial. <a href="/pricing" className="underline font-bold hover:text-emerald-100">See plans →</a>
        </div>
        <UpgradeBanner />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 lg:rounded-l-[40px] bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 lg:my-2 lg:mr-2 lg:border lg:border-stone-200/80 lg:shadow-inner dot-grid-bg">
          {children}
        </div>
      </main>
      <FeedbackWidget />
      <GlobalToast />
      <SupportChat />
      <GlobalJobsIndicator />
      {/* Consulting CTA — floating bottom-left, doesn't collide with the
          FeedbackWidget at bottom-right. Reminds every dashboard visitor
          "we'll do this for you" via the audit-call upsell. */}
      <ConsultingCTA variant="floating" placement="dashboard_floating" />
      {/* HubSpot Conversations chat bubble — bottom-right, layers BELOW the
          FeedbackWidget (HubSpot uses z-index < 50). Provides live chat
          escalation when the in-app feedback isn't enough. */}
      <HubSpotChat />
      {/* <ReviewPrompt /> — disabled until Google Business Profile is set up */}
    </div>
  );
}
