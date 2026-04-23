export default function DashboardLoading() {
    return (
        <div className="space-y-8 animate-pulse">
            <div>
                <div className="h-8 w-64 bg-stone-200 rounded-lg" />
                <div className="mt-2 h-4 w-80 bg-stone-100 rounded" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-white border border-stone-200 rounded-3xl p-6 h-32">
                        <div className="h-3 w-20 bg-stone-100 rounded" />
                        <div className="mt-4 h-8 w-16 bg-stone-200 rounded" />
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white border border-stone-200 rounded-3xl p-6 h-80">
                    <div className="h-5 w-40 bg-stone-200 rounded" />
                    <div className="mt-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-14 bg-stone-50 rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="bg-white border border-stone-200 rounded-3xl p-6 h-80">
                    <div className="h-5 w-32 bg-stone-200 rounded" />
                    <div className="mt-6 space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-10 bg-stone-50 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
