"use client";

import { Info } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function InfoTooltip({ text }: { text: string }) {
    const [show, setShow] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!show) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setShow(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [show]);

    return (
        <span className="relative inline-block ml-1.5" ref={ref}>
            <button
                type="button"
                onClick={() => setShow(!show)}
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
                className="text-stone-400 hover:text-stone-600 transition-colors align-middle"
                aria-label="More info"
            >
                <Info className="w-3.5 h-3.5" />
            </button>
            {show && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-stone-900 text-white text-xs rounded-xl p-3 shadow-lg leading-relaxed">
                    {text}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-stone-900 rotate-45" />
                </div>
            )}
        </span>
    );
}
