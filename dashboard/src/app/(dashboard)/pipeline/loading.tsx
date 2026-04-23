export default function PipelineLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div>
                <div className="h-8 w-40 bg-stone-200 rounded-lg" />
                <div className="mt-2 h-4 w-64 bg-stone-100 rounded" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-white border border-stone-200 rounded-3xl p-4 min-h-[360px]">
                        <div className="h-4 w-24 bg-stone-200 rounded mb-4" />
                        <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, j) => (
                                <div key={j} className="h-20 bg-stone-50 rounded-xl" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
