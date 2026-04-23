export default function PortalOverviewLoading() {
    return (
        <div className="space-y-6 animate-pulse max-w-6xl mx-auto">
            <div className="h-8 w-64 bg-stone-200 rounded-lg" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-white border border-stone-200 rounded-3xl p-6 h-28" />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white border border-stone-200 rounded-3xl h-80" />
                <div className="bg-white border border-stone-200 rounded-3xl h-80" />
            </div>
        </div>
    );
}
