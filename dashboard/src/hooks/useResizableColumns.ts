"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Small hook for drag-to-resize column widths with localStorage persistence.
 *
 * Usage:
 *   const { widths, getResizerProps, getWidth } = useResizableColumns({
 *       storageKey: "matches:colwidths:${profileId}",
 *       defaults: { title: 280, agency: 200, ... },
 *       min: 60,
 *       max: 800,
 *   });
 *
 *   <th style={{ width: getWidth("title") }}>
 *     Title
 *     <span {...getResizerProps("title")} />
 *   </th>
 *
 * The resizer props attach a mousedown handler that tracks the drag across
 * the document until mouseup, then commits + persists. We intentionally do
 * NOT fire updates on every mousemove pixel — we debounce the localStorage
 * write to the mouseup so rapid drags don't thrash the key.
 */
export function useResizableColumns(opts: {
    storageKey: string | null;
    defaults: Record<string, number>;
    min?: number;
    max?: number;
}) {
    const min = opts.min ?? 60;
    const max = opts.max ?? 900;
    const [widths, setWidths] = useState<Record<string, number>>(opts.defaults);
    const [activeResizeKey, setActiveResizeKey] = useState<string | null>(null);
    const activeKey = useRef<string | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);
    const onMouseUpRef = useRef<() => void>(() => {});

    // Hydrate from localStorage — only runs once, and only if storageKey is set.
    // We merge with defaults so new columns get their default width rather than
    // being undefined (which would collapse them).
    useEffect(() => {
        if (!opts.storageKey || typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(opts.storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Record<string, number>;
            if (parsed && typeof parsed === "object") {
                setWidths(prev => ({ ...prev, ...parsed }));
            }
        } catch { /* ignore corrupt stored value */ }
    }, [opts.storageKey]);

    const persist = useCallback((next: Record<string, number>) => {
        if (!opts.storageKey || typeof window === "undefined") return;
        try { localStorage.setItem(opts.storageKey, JSON.stringify(next)); } catch { /* quota full — skip */ }
    }, [opts.storageKey]);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!activeKey.current) return;
        const delta = e.clientX - startX.current;
        const raw = startWidth.current + delta;
        const clamped = Math.max(min, Math.min(max, raw));
        setWidths(prev => ({ ...prev, [activeKey.current as string]: clamped }));
    }, [min, max]);

    const onMouseUp = useCallback(() => {
        if (!activeKey.current) return;
        activeKey.current = null;
        setActiveResizeKey(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUpRef.current);
        // Persist the final widths snapshot. We read via setWidths callback to
        // avoid stale-state closures.
        setWidths(prev => {
            persist(prev);
            return prev;
        });
    }, [onMouseMove, persist]);

    useEffect(() => {
        onMouseUpRef.current = onMouseUp;
    }, [onMouseUp]);

    const startDrag = useCallback((key: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        activeKey.current = key;
        setActiveResizeKey(key);
        startX.current = e.clientX;
        startWidth.current = widths[key] ?? opts.defaults[key] ?? 150;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUpRef.current);
    }, [widths, opts.defaults, onMouseMove]);

    // Safety: if the component unmounts mid-drag, release listeners.
    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUpRef.current);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [onMouseMove]);

    const getWidth = (key: string): number => widths[key] ?? opts.defaults[key] ?? 150;

    const getResizerProps = (key: string) => ({
        onMouseDown: startDrag(key),
        role: "separator" as const,
        "aria-orientation": "vertical" as const,
        title: "Drag to resize",
        // Inline class-independent styling keeps the hook drop-in — consumers
        // don't need to import any CSS module. Positioned absolutely by the
        // parent <th> which should be `position: relative`.
        style: {
            position: "absolute" as const,
            right: -4,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: "col-resize",
            zIndex: 10,
            userSelect: "none" as const,
        },
    });

    const reset = useCallback(() => {
        setWidths(opts.defaults);
        persist(opts.defaults);
    }, [opts.defaults, persist]);

    return { widths, getWidth, getResizerProps, reset, activeResizeKey };
}
