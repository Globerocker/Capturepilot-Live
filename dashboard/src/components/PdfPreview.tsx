"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, X, Download } from "lucide-react";
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

export default function PdfPreview({ url, fileName, onClose, downloadUrl }: Props) {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight" && numPages && pageNumber < numPages) setPageNumber(p => p + 1);
            if (e.key === "ArrowLeft" && pageNumber > 1) setPageNumber(p => p - 1);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [pageNumber, numPages, onClose]);

    return (
        <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
                {/* Toolbar */}
                <div className="flex items-center justify-between bg-stone-900 text-white px-4 py-2.5">
                    <span className="text-sm font-medium truncate flex-1 mr-2">{fileName || "Preview"}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {numPages && (
                            <>
                                <button
                                    type="button"
                                    title="Previous page"
                                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                                    disabled={pageNumber <= 1}
                                    className="p-1.5 rounded hover:bg-stone-700 disabled:opacity-40"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs tabular-nums px-2">
                                    {pageNumber} / {numPages}
                                </span>
                                <button
                                    type="button"
                                    title="Next page"
                                    onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                                    disabled={pageNumber >= numPages}
                                    className="p-1.5 rounded hover:bg-stone-700 disabled:opacity-40"
                                >
                                    <ChevronRight className="w-4 h-4" />
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
                            title="Close"
                            onClick={onClose}
                            className="p-1.5 rounded hover:bg-stone-700"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

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
                            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                            onLoadError={(e) => setError(e.message || "Failed to load PDF")}
                        >
                            <Page
                                pageNumber={pageNumber}
                                width={720}
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
