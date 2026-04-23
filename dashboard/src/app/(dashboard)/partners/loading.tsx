export default function PartnersLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div>
                <div className="h-8 w-40 bg-stone-200 rounded-lg" />
                <div className="mt-2 h-4 w-72 bg-stone-100 rounded" />
            </div>
            <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-9 w-32 bg-stone-200 rounded-full" />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="bg-white border border-stone-200 rounded-3xl p-5 h-56">
                        <div className="h-5 w-3/4 bg-stone-200 rounded" />
                        <div className="mt-2 h-3 w-1/2 bg-stone-100 rounded" />
                        <div className="mt-6 flex gap-2 flex-wrap">
                            <div className="h-6 w-16 bg-stone-100 rounded-full" />
                            <div className="h-6 w-20 bg-stone-100 rounded-full" />
                            <div className="h-6 w-14 bg-stone-100 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
