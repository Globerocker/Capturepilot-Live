with open("dashboard/src/app/(dashboard)/dashboard/page.tsx", "r") as f:
    content = f.read()

target = """        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="font-bold text-base sm:text-lg flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-stone-400" />
            Opportunities
          </h3>
          <Link href="/opportunities" className="text-xs font-bold bg-stone-100 border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors flex items-center self-start sm:self-auto">
            Browse All <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </div>"""

replacement = """        <div className="flex flex-col gap-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="font-bold text-base sm:text-lg flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-stone-400" />
              Opportunities
            </h3>
            <Link href="/opportunities" className="text-xs font-bold bg-stone-100 border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-200 transition-colors flex items-center self-start sm:self-auto">
              Browse All <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </div>
          
          {/* Quick Filters */}
          <div className="flex items-center space-x-2 flex-wrap border-b border-stone-100 pb-2">
             <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-black text-white transition-all">All Opportunities</button>
             <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-white text-stone-500 hover:bg-stone-100 transition-all">Strong Matches</button>
             <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-white text-stone-500 hover:bg-stone-100 transition-all">Good Matches</button>
             <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-white text-stone-500 hover:bg-stone-100 transition-all">Possible Matches</button>
          </div>
        </div>"""

content = content.replace(target, replacement)
content = content.replace('No matches generated yet', 'No opportunities found')
content = content.replace("Generate matches to find federal opportunities tailored to your profile.", "We couldn't find any opportunities matching these criteria.")
content = content.replace('Generate Matches', 'Find Opportunities')
content = content.replace('Calculating your matches...', 'Loading opportunities...')

with open("dashboard/src/app/(dashboard)/dashboard/page.tsx", "w") as f:
    f.write(content)
