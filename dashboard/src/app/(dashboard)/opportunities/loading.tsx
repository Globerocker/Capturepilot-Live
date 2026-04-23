export default function OpportunitiesLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div>
                    <div className="h-8 w-48 bg-stone-200 rounded-lg" />
                    <div className="mt-2 h-4 w-64 bg-stone-100 rounded" />
                </div>
                <div className="flex gap-2">
                    <div className="h-9 w-24 bg-stone-200 rounded-xl" />
                    <div className="h-9 w-24 bg-stone-200 rounded-xl" />
                </div>
            </div>
            <div className="h-12 bg-white border border-stone-200 rounded-2xl" />
            <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden">
                <div className="h-12 bg-stone-50 border-b border-stone-200" />
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-16 border-b border-stone-100 last:border-b-0 flex items-center gap-4 px-6">
                        <div className="w-20 h-3 bg-stone-100 rounded" />
                        <div className="flex-1 h-4 bg-stone-100 rounded" />
                        <div className="w-24 h-3 bg-stone-100 rounded" />
                        <div className="w-16 h-3 bg-stone-100 rounded" />
                        <div className="w-24 h-3 bg-stone-100 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}
