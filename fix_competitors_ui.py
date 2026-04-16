with open("dashboard/src/app/(dashboard)/competitors/page.tsx", "r") as f:
    original = f.read()

# 1. State changes
state_str = "    const [analyzing, setAnalyzing] = useState(false);"
new_state_str = """    const [analyzing, setAnalyzing] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [suggestions, setSuggestions] = useState<Array<{name: string; domain: string; reason: string}>>([]);"""
original = original.replace(state_str, new_state_str)

# 2. Add handleSuggest function
fn_str = "    function handleAddSubmit(e: React.FormEvent) {"
new_fn_str = """    async function handleSuggest() {
        setSuggesting(true);
        setSuggestions([]);
        try {
            const res = await fetch("/api/ai/competitor-suggest", { method: "POST", body: "{}" });
            const data = await res.json();
            if (data.success) setSuggestions(data.competitors);
            else alert(data.error);
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSuggesting(false);
        }
    }

    function handleAddSubmit(e: React.FormEvent) {"""
original = original.replace(fn_str, new_fn_str)

# 3. Add Suggest AI button UI and suggestions list in the form
form_header_str = """                            <div className="flex items-center gap-2 mb-1">
                                <Plus className="w-4 h-4 text-emerald-600" />
                                <h3 className="text-sm font-bold text-black">Add New Competitor</h3>
                            </div>"""

new_form_header_str = """                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <Plus className="w-4 h-4 text-emerald-600" />
                                    <h3 className="text-sm font-bold text-black">Add New Competitor</h3>
                                </div>
                                <button type="button" onClick={handleSuggest} disabled={suggesting} className="text-xs text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1 rounded-full font-bold hover:bg-blue-100 disabled:opacity-50">
                                    {suggesting ? "Analyzing market..." : "Suggest via AI"}
                                </button>
                            </div>
                            
                            {suggestions.length > 0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                                    <h4 className="text-xs font-bold text-blue-900 mb-2 uppercase tracking-wide">Suggested Competitors</h4>
                                    <div className="space-y-2">
                                        {suggestions.map((s, i) => (
                                            <div key={i} className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-blue-100">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-black">{s.name} <span className="text-stone-400 font-normal ml-1">{s.domain}</span></p>
                                                    <p className="text-[10px] text-stone-500 mt-0.5 line-clamp-1">{s.reason}</p>
                                                </div>
                                                <button type="button" onClick={() => { setAddUrl(s.domain); setSuggestions([]); }} className="text-xs bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-md flex-shrink-0 hover:bg-emerald-700">Use</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}"""

original = original.replace(form_header_str, new_form_header_str)

with open("dashboard/src/app/(dashboard)/competitors/page.tsx", "w") as f:
    f.write(original)

print("competitor UI updated")
