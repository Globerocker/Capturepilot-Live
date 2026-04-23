export default function MatchesLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div>
                <div className="h-8 w-40 bg-stone-200 rounded-lg" />
                <div className="mt-2 h-4 w-56 bg-stone-100 rounded" />
            </div>
            <div className="flex items-center gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 w-20 bg-stone-200 rounded-full" />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="bg-white border border-stone-200 rounded-3xl p-5 h-52">
                        <div className="flex items-center justify-between">
                            <div className="h-4 w-16 bg-stone-100 rounded-full" />
                            <div className="h-6 w-12 bg-stone-200 rounded-full" />
                        </div>
                        <div className="mt-4 h-5 w-full bg-stone-100 rounded" />
                        <div className="mt-2 h-5 w-2/3 bg-stone-100 rounded" />
                        <div className="mt-8 flex gap-2">
                            <div className="h-6 w-16 bg-stone-100 rounded-full" />
                            <div className="h-6 w-16 bg-stone-100 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
