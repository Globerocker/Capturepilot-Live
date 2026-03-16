import Sidebar from "@/components/layout/Sidebar";
import UpgradeBanner from "@/components/UpgradeBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex bg-stone-50 min-h-screen lg:h-screen lg:overflow-hidden text-stone-900 selection:bg-black selection:text-white">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden lg:pl-2 pt-14 lg:pt-0">
        <UpgradeBanner />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 lg:rounded-l-[40px] bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 lg:my-2 lg:mr-2 lg:border lg:border-stone-200/80 lg:shadow-inner">
          {children}
        </div>
      </main>
    </div>
  );
}
