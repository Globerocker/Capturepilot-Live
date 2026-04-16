import re

with open("dashboard/src/app/(dashboard)/settings/page.tsx", "r") as f:
    content = f.read()

# We need to find the start of the grid.
grid_start = content.find('<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start lg:[grid-auto-flow:row_dense]">')
grid_end = content.find('            {/* ---- /Two-column grid ---- */}')

if grid_start == -1 or grid_end == -1:
    print("Could not find grid wrapper!")
    exit(1)

grid_content = content[grid_start:grid_end]

# It has the grid wrapper start:
wrapper_close_index = grid_content.rfind('</div>')

# Inside the grid content, we can use regex to split items based on `<section` and `<button` (for showAdvanced).
# Wait, it's easier to use a simple string replacement approach because we know the exact IDs and classes.
left_items = []
right_items = []

# We can replace the grid div with two divs. We just need to extract everything and group.
# Actually, since it's React, and there are JSX fragments like {showAdvanced && (<> ... </>)} which span multiple sections.
# If I move them into a flex container:
replacement = """
            {/* ================================================================ */}
            {/*  Two flex columns for independent height flow                  */}
            {/* ================================================================ */}
            <div className="flex flex-col lg:flex-row gap-6 items-start w-full">

                {/* LEFT COLUMN */}
                <div className="w-full lg:w-1/2 flex flex-col gap-6">
                    <section id="account" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('<section id="account" className="lg:col-start-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split('<section id="subscription"')[0] + """

                    <section id="profile" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('<section id="profile" className="lg:col-start-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split('{/* ---- Profile Completeness ---- */}')[0] + """

                    {/* ---- Advanced Settings Toggle ---- */}
""" + content.split('{/* ---- Advanced Settings Toggle ---- */}')[1].split('{showAdvanced && (<>')[0] + """
                    {showAdvanced && (<>
                        {/* Capacity & Experience */}
                        <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('<section className="lg:col-start-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split(' {/* Industry */}')[0] + """
                        {/* Industry */}
                        <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split(' {/* Industry */}\n            <section className="lg:col-start-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split(' {/* PSC Codes & Clearances */}')[0] + """
                        {/* PSC Codes & Clearances */}
                        <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('{/* PSC Codes & Clearances */}\n            <section className="lg:col-start-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split('{/* Preferred Agencies & Contract Preferences */}')[0] + """
                        {/* Preferred Agencies & Contract Preferences */}
                        <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('{/* Preferred Agencies & Contract Preferences */}\n            <section className="lg:col-start-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split('</>)}')[0] + """
                    </>)}

                    {/* Target States */}
                    <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('{/* Target States */}\n            <section className="lg:col-start-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split('{/* Notifications */}')[0] + """
                </div>

                {/* RIGHT COLUMN */}
                <div className="w-full lg:w-1/2 flex flex-col gap-6">
                    <section id="subscription" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('<section id="subscription" className="lg:col-start-2 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split(' {/* ================================================================ */}\n            {/*  SECTION 3: Invoices & Billing History                           */}')[0] + """

                    {/* Invoices */}
                    <section id="invoices" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('<section id="invoices" className="lg:col-start-2 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split(' {/* ================================================================ */}\n            {/*  SECTION 4: Profile Settings                                     */}')[0] + """

                    {/* Profile Completeness */}
                    {(() => {
""" + content.split('{/* ---- Profile Completeness ---- */}\n            {(() => {')[1].split('<section className="lg:col-start-2 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[0] + """<section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('{/* ---- Profile Completeness ---- */}\n            {(() => {')[1].split('<section className="lg:col-start-2 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split('{/* ---- Advanced Settings Toggle ---- */}')[0] + """

                    {/* Notifications */}
                    <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('{/* Notifications */}\n            <section className="lg:col-start-2 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split('{/* ================================================================ */}\n            {/*  SECTION 5: Password                                             */}')[0] + """

                    {/* Password */}
                    <section id="password" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('<section id="password" className="lg:col-start-2 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split(' {/* Google Login */}')[0] + """

                    {/* Google Login */}
                    <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
""" + content.split('{/* Google Login */}\n            <section className="lg:col-start-2 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">')[1].split(' {/* ================================================================ */}\n            {/*  SECTION 6: Danger Zone                                          */}')[0] + """

                    {/* Danger Zone */}
                    <section id="danger-zone" className="bg-white rounded-2xl border border-red-200 shadow-sm p-5 sm:p-7">
""" + content.split('<section id="danger-zone" className="lg:col-start-2 bg-white rounded-2xl border border-red-200 shadow-sm p-5 sm:p-7">')[1].split('            </div>\n            {/* ---- /Two-column grid ---- */}')[0] + """
                </div>
"""

new_content = content[:grid_start] + replacement + content[grid_end:]
new_content = new_content.replace('className="lg:col-start-1 w-full bg-stone-50 border', 'className="w-full bg-stone-50 border')
new_content = new_content.replace('max-w-7xl mx-auto space-y-6', 'w-full 2xl:max-w-[1600px] mx-auto space-y-6')
with open("dashboard/src/app/(dashboard)/settings/page.tsx", "w") as f:
    f.write(new_content)

print("success")
