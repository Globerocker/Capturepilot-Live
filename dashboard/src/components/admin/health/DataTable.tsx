"use client";

import clsx from "clsx";

/**
 * DataTable — minimal, styled table used by /admin/health/* detail pages
 * to display per-row inspection data (objects in a bucket, queue items,
 * cron history, etc.). Intentionally lean: pass a `columns` shape and a
 * `rows` array, get the same look as every other admin-health table.
 *
 * If you need sorting, filtering, or pagination, wrap this in a parent
 * component that prepares the rows.
 */
export type DataTableColumn<T> = {
    key: string;
    header: React.ReactNode;
    /** "right" / "center" / undefined (default left) */
    align?: "left" | "right" | "center";
    /** Tailwind class for column width */
    width?: string;
    render: (row: T) => React.ReactNode;
};

export function DataTable<T>({
    columns,
    rows,
    emptyMessage = "No rows.",
    rowKey,
    className,
}: {
    columns: DataTableColumn<T>[];
    rows: T[];
    emptyMessage?: string;
    rowKey: (row: T, idx: number) => string;
    className?: string;
}) {
    return (
        <div className={clsx("bg-white border border-stone-200 rounded-2xl overflow-hidden", className)}>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-[10px] text-stone-400 uppercase tracking-wider">
                        <tr>
                            {columns.map(c => (
                                <th
                                    key={c.key}
                                    className={clsx(
                                        "px-3 py-2 font-bold",
                                        c.align === "right" ? "text-right" :
                                        c.align === "center" ? "text-center" :
                                        "text-left",
                                        c.width,
                                    )}
                                >
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="text-center text-stone-400 text-xs py-6">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : rows.map((row, idx) => (
                            <tr key={rowKey(row, idx)} className="hover:bg-stone-50/60">
                                {columns.map(c => (
                                    <td
                                        key={c.key}
                                        className={clsx(
                                            "px-3 py-2 text-xs text-stone-700",
                                            c.align === "right" ? "text-right" :
                                            c.align === "center" ? "text-center" :
                                            "text-left",
                                        )}
                                    >
                                        {c.render(row)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
