import Sidebar from "@/components/layout/Sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex bg-stone-50 min-h-screen text-stone-900 selection:bg-black selection:text-white">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden pl-2">
                <div className="flex-1 overflow-y-auto p-8 rounded-l-[40px] bg-stone-100 my-2 mr-2 border border-stone-200 shadow-inner">
                    {children}
                </div>
            </main>
        </div>
    );
}
