export default function PortalOppsLoading() {
    return (
        <div className="space-y-6 animate-pulse max-w-7xl mx-auto">
            <div className="h-8 w-48 bg-stone-200 rounded-lg" />
            <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-16 border-b border-stone-100 last:border-b-0 flex items-center gap-4 px-6">
                        <div className="flex-1 h-4 bg-stone-100 rounded" />
                        <div className="w-24 h-3 bg-stone-100 rounded" />
                        <div className="w-20 h-3 bg-stone-100 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}
