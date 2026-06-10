import Sidebar from "@/components/layout/Sidebar";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import UpgradeBanner from "@/components/UpgradeBanner";
import FeedbackWidget from "@/components/FeedbackWidget";
import GlobalToast from "@/components/GlobalToast";
import SupportChat from "@/components/SupportChat";
import RunningJobsIndicator from "@/components/proposals/RunningJobsIndicator";
// import { ReviewPrompt } from "@/components/ReviewPrompt"; // Disabled until Google Business Profile is set up

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex bg-stone-50 min-h-screen lg:h-screen lg:overflow-hidden text-stone-900 selection:bg-black selection:text-white">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden lg:pl-2 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="bg-emerald-600 text-white text-center py-2 px-4 text-xs font-medium">
          Public Beta — All features unlocked free until May 9, 2026. Give feedback to lock in $149/mo pricing (25% off forever).
        </div>
        <UpgradeBanner />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 lg:rounded-l-[40px] bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 lg:my-2 lg:mr-2 lg:border lg:border-stone-200/80 lg:shadow-inner dot-grid-bg">
          {children}
        </div>
      </main>
      <MobileBottomNav />
      <FeedbackWidget />
      <GlobalToast />
      <SupportChat />
      <RunningJobsIndicator />
      {/* <ReviewPrompt /> — disabled until Google Business Profile is set up */}
    </div>
  );
}
