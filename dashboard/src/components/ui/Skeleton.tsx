"use client";

import clsx from "clsx";

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return <div className={clsx("animate-pulse bg-stone-200 rounded", className)} />;
}

export function SkeletonKpiCard() {
    return (
        <div className="p-4 sm:p-5 rounded-[20px] sm:rounded-[28px] bg-white border border-stone-200 shadow-sm">
            <div className="flex justify-between items-start mb-3">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="w-7 h-7 sm:w-8 sm:h-8 rounded-full" />
            </div>
            <Skeleton className="h-8 w-16 rounded mb-1" />
            <Skeleton className="h-3 w-28 rounded" />
        </div>
    );
}

export function SkeletonTableRow() {
    return (
        <tr className="animate-pulse">
            <td className="py-3.5 px-5"><Skeleton className="h-3 w-16 rounded" /></td>
            <td className="py-3.5 px-5">
                <Skeleton className="h-4 w-48 rounded mb-1" />
                <Skeleton className="h-3 w-32 rounded" />
            </td>
            <td className="py-3.5 px-5"><Skeleton className="h-5 w-20 rounded" /></td>
            <td className="py-3.5 px-5"><Skeleton className="h-3 w-14 rounded" /></td>
            <td className="py-3.5 px-5"><Skeleton className="h-3 w-8 rounded" /></td>
            <td className="py-3.5 px-5 hidden xl:table-cell"><Skeleton className="h-3 w-12 rounded" /></td>
            <td className="py-3.5 px-5"><Skeleton className="h-3 w-16 rounded" /></td>
            <td className="py-3.5 px-5"><Skeleton className="h-5 w-14 rounded" /></td>
            <td className="py-3.5 px-5 hidden 2xl:table-cell"><Skeleton className="h-1.5 w-12 rounded-full" /></td>
        </tr>
    );
}

export function SkeletonMatchCard() {
    return (
        <div className="bg-white border border-stone-200 rounded-xl sm:rounded-2xl p-3 sm:p-4 animate-pulse">
            <div className="flex items-center gap-2">
                <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="flex gap-1.5">
                        <Skeleton className="h-4 w-10 rounded" />
                        <Skeleton className="h-4 w-16 rounded" />
                    </div>
                    <Skeleton className="h-4 w-full rounded" />
                    <Skeleton className="h-3 w-40 rounded" />
                </div>
                <div className="hidden sm:flex items-center gap-2">
                    <Skeleton className="h-4 w-14 rounded" />
                    <Skeleton className="h-4 w-20 rounded" />
                </div>
            </div>
        </div>
    );
}
