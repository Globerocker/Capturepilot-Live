"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, X, Download, Search, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Worker must be configured once. Use the ESM worker from node_modules via URL.
// react-pdf ships its own pdfjs worker; hosting it via unpkg keeps the bundle lean.
if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface Props {
    url: string;
    fileName?: string;
    onClose: () => void;
    downloadUrl?: string;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_WIDTH = 720;

export default function PdfPreview({ url, fileName, onClose, downloadUrl }: Props) {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [hits, setHits] = useState<number[]>([]);
    const [hitIndex, setHitIndex] = useState(0);
    const [searching, setSearching] = useState(false);
    const docRef = useRef<{ getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str: string }> }> }> } | null>(null);
    const pageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Don't hijack arrow keys when typing in the search box
            const t = e.target as HTMLElement;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
            if (e.key === "Escape") {
                if (searchOpen) { setSearchOpen(false); return; }
                onClose();
            }
            if (e.key === "ArrowRight" && numPages && pageNumber < numPages) setPageNumber(p => p + 1);
            if (e.key === "ArrowLeft" && pageNumber > 1) setPageNumber(p => p - 1);
            if ((e.metaKey || e.ctrlKey) && e.key === "f") { e.preventDefault(); setSearchOpen(s => !s); }
            if ((e.metaKey || e.ctrlKey) && e.key === "=") { e.preventDefault(); setZoom(z => ZOOM_STEPS.find(s => s > z) ?? z); }
            if ((e.metaKey || e.ctrlKey) && e.key === "-") { e.preventDefault(); setZoom(z => [...ZOOM_STEPS].reverse().find(s => s < z) ?? z); }
            if ((e.metaKey || e.ctrlKey) && e.key === "0") { e.preventDefault(); setZoom(1); }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [pageNumber, numPages, onClose, searchOpen]);

    // Full-document text search — walks every page once and records which
    // pages contain `searchTerm`. Cached implicitly per render via state.
    async function runSearch(term: string) {
        if (!docRef.current || !term.trim() || !numPages) { setHits([]); return; }
        setSearching(true);
        try {
            const needle = term.toLowerCase();
            const matches: number[] = [];
            for (let i = 1; i <= numPages; i++) {
                try {
                    const page = await docRef.current.getPage(i);
                    const tc = await page.getTextContent();
                    const text = tc.items.map(it => it.str).join(" ").toLowerCase();
                    if (text.includes(needle)) matches.push(i);
                } catch { /* skip page */ }
            }
            setHits(matches);
            setHitIndex(0);
            if (matches.length > 0) setPageNumber(matches[0]);
        } finally {
            setSearching(false);
        }
    }

    function jumpToHit(direction: 1 | -1) {
        if (hits.length === 0) return;
        const next = (hitIndex + direction + hits.length) % hits.length;
        setHitIndex(next);
        setPageNumber(hits[next]);
    }

    function goToPage(n: number) {
        if (!numPages) return;
        const clamped = Math.max(1, Math.min(numPages, n));
        setPageNumber(clamped);
    }

    return (
        <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
                {/* Toolbar */}
                <div className="flex items-center justify-between bg-stone-900 text-white px-4 py-2.5 gap-3">
                    <span className="text-sm font-medium truncate flex-1 min-w-0">{fileName || "Preview"}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {numPages && (
                            <>
                                <button
                                    type="button"
                                    title="Previous page (←)"
                                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                                    disabled={pageNumber <= 1}
                                    className="p-1.5 rounded hover:bg-stone-700 disabled:opacity-40"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <input
                                    ref={pageInputRef}
                                    type="number"
                                    min={1}
                                    max={numPages}
                                    value={pageNumber}
                                    onChange={(e) => goToPage(parseInt(e.target.value, 10) || 1)}
                                    className="w-12 text-xs text-center tabular-nums bg-stone-800 border border-stone-700 rounded px-1 py-0.5 text-white"
                                    title="Jump to page"
                                />
                                <span className="text-xs tabular-nums text-stone-300">/ {numPages}</span>
                                <button
                                    type="button"
                                    title="Next page (→)"
                                    onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                                    disabled={pageNumber >= numPages}
                                    className="p-1.5 rounded hover:bg-stone-700 disabled:opacity-40"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                                <div className="w-px h-5 bg-stone-700 mx-1" />
                                <button
                                    type="button"
                                    title="Search this document (⌘F)"
                                    onClick={() => setSearchOpen(s => !s)}
                                    className={`p-1.5 rounded hover:bg-stone-700 ${searchOpen ? "bg-stone-700" : ""}`}
                                >
                                    <Search className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    title="Zoom out (⌘-)"
                                    onClick={() => setZoom(z => [...ZOOM_STEPS].reverse().find(s => s < z) ?? z)}
                                    disabled={zoom <= ZOOM_STEPS[0]}
                                    className="p-1.5 rounded hover:bg-stone-700 disabled:opacity-40"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </button>
                                <span className="text-[11px] tabular-nums text-stone-300 px-1">{Math.round(zoom * 100)}%</span>
                                <button
                                    type="button"
                                    title="Zoom in (⌘+)"
                                    onClick={() => setZoom(z => ZOOM_STEPS.find(s => s > z) ?? z)}
                                    disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                                    className="p-1.5 rounded hover:bg-stone-700 disabled:opacity-40"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    title="Reset zoom (⌘0)"
                                    onClick={() => setZoom(1)}
                                    className="p-1.5 rounded hover:bg-stone-700"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                                <div className="w-px h-5 bg-stone-700 mx-1" />
                            </>
                        )}
                        {downloadUrl && (
                            <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Download"
                                className="p-1.5 rounded hover:bg-stone-700"
                            >
                                <Download className="w-4 h-4" />
                            </a>
                        )}
                        <button
                            type="button"
                            title="Close (Esc)"
                            onClick={onClose}
                            className="p-1.5 rounded hover:bg-stone-700"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Search bar — drops in below the toolbar when active */}
                {searchOpen && (
                    <div className="flex items-center gap-2 bg-stone-800 px-4 py-2 border-t border-stone-700">
                        <Search className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                        <input
                            autoFocus
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") runSearch(searchTerm); }}
                            placeholder="Search in document… (Enter to run)"
                            className="flex-1 bg-stone-700 text-white text-sm px-3 py-1 rounded outline-none placeholder:text-stone-500"
                        />
                        <button
                            type="button"
                            onClick={() => runSearch(searchTerm)}
                            disabled={searching || !searchTerm.trim()}
                            className="text-xs font-bold bg-stone-700 hover:bg-stone-600 text-white px-3 py-1 rounded disabled:opacity-50"
                        >
                            {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : "Find"}
                        </button>
                        {hits.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-stone-300">
                                <span>{hitIndex + 1} / {hits.length} pages</span>
                                <button type="button" onClick={() => jumpToHit(-1)} className="p-1 rounded hover:bg-stone-700">
                                    <ChevronLeft className="w-3 h-3" />
                                </button>
                                <button type="button" onClick={() => jumpToHit(1)} className="p-1 rounded hover:bg-stone-700">
                                    <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                        {hits.length === 0 && searchTerm && !searching && (
                            <span className="text-xs text-stone-500">no matches</span>
                        )}
                    </div>
                )}

                {/* PDF render area */}
                <div className="flex-1 overflow-auto bg-stone-100 p-4 flex items-start justify-center">
                    {error ? (
                        <div className="text-center py-12 text-sm text-red-600">
                            Could not preview this file. {downloadUrl && <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="underline">Download instead</a>}
                        </div>
                    ) : (
                        <Document
                            file={url}
                            loading={<div className="py-16 flex items-center gap-2 text-stone-500 text-sm"><Loader2 className="w-5 h-5 animate-spin" /> Loading preview…</div>}
                            onLoadSuccess={(pdf) => { setNumPages(pdf.numPages); docRef.current = pdf as unknown as typeof docRef.current; }}
                            onLoadError={(e) => setError(e.message || "Failed to load PDF")}
                        >
                            <Page
                                pageNumber={pageNumber}
                                width={DEFAULT_WIDTH * zoom}
                                renderTextLayer
                                renderAnnotationLayer
                            />
                        </Document>
                    )}
                </div>
            </div>
        </div>
    );
}
