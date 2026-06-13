import re

with open("dashboard/src/app/(dashboard)/pipeline/page.tsx", "r") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    'import { Layers, Loader2, Search, Eye, ChevronDown, Target, Clock, Plus, X, Settings, DollarSign } from "lucide-react";',
    'import { Layers, Loader2, Search, Eye, ChevronDown, Target, Clock, Plus, X, Settings, DollarSign, LayoutGrid, List } from "lucide-react";\nimport KanbanBoard from "@/components/pipeline/KanbanBoard";'
)

# 2. State for viewMode
state_search = 'const [stageSettingsOpen, setStageSettingsOpen] = useState(false);'
content = content.replace(
    state_search,
    f'{state_search}\n    const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");'
)

# 3. View Toggle UI in the Sort + Summary Bar
summary_bar_str = """                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-[10px] text-stone-400 uppercase tracking-widest mr-1">Sort by</span>"""

summary_bar_repl = """                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-stone-400 uppercase tracking-widest mr-1">Sort by</span>"""

# We need to inject the view switcher in the same flex container but on the right.
# Wait, this flex box contains the Sort By buttons. Let's find the closing tag.
# Replace:
old_sort_buttons = """                            <button type="button" key={opt.key} onClick={() => setPipelineSort(opt.key)}
                                className={clsx("text-xs font-bold px-3 py-1.5 rounded-full border transition-all",
                                    pipelineSort === opt.key ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                                )}>
                                {opt.label}
                            </button>
                        ))}
                    </div>"""
new_sort_buttons = """                            <button type="button" key={opt.key} onClick={() => setPipelineSort(opt.key)}
                                className={clsx("text-xs font-bold px-3 py-1.5 rounded-full border transition-all",
                                    pipelineSort === opt.key ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                                )}>
                                {opt.label}
                            </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 border border-stone-200 rounded-lg p-1 bg-white">
                        <button type="button" onClick={() => setViewMode("kanban")} className={clsx("p-1.5 rounded-md transition-colors", viewMode === "kanban" ? "bg-stone-100 text-black" : "text-stone-400 hover:text-stone-700")}>
                           <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => setViewMode("list")} className={clsx("p-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-stone-100 text-black" : "text-stone-400 hover:text-stone-700")}>
                           <List className="w-4 h-4" />
                        </button>
                      </div>
                    </div>"""
content = content.replace(summary_bar_str, summary_bar_repl)
content = content.replace(old_sort_buttons, new_sort_buttons)

# 4. Wrap List in conditional and render Kanban
# Finding exactly where the list starts: `<div className="space-y-3">` right after `{filteredPursuits.length === 0 ? ... : (`
render_str = """                    {filteredPursuits.length === 0 ? (
                        <div className="bg-white border border-stone-200 border-dashed rounded-2xl p-8 text-center">
                            <p className="text-sm text-stone-500">
                                No deals match the <span className="font-bold">{activeTabConfig.label}</span> filter.
                            </p>
                        </div>
                    ) : ("""

render_repl = """                    {filteredPursuits.length === 0 ? (
                        <div className="bg-white border border-stone-200 border-dashed rounded-2xl p-8 text-center">
                            <p className="text-sm text-stone-500">
                                No deals match the <span className="font-bold">{activeTabConfig.label}</span> filter.
                            </p>
                        </div>
                    ) : viewMode === "kanban" ? (
                        <KanbanBoard pursuits={filteredPursuits as any} stages={stages as any} onMove={(id, stage) => {
                            const p = pursuits.find(x => x.id === id);
                            if (p) updateStage(p, stage);
                        }} />
                    ) : ("""
content = content.replace(render_str, render_repl)

with open("dashboard/src/app/(dashboard)/pipeline/page.tsx", "w") as f:
    f.write(content)

print("pipeline update successful")
