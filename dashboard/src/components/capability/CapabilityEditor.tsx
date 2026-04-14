"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import {
    Bold, Italic, Underline as UnderlineIcon, Heading2, List, ListOrdered,
    Link2, Undo, Redo, Sparkles, Loader2,
} from "lucide-react";
import clsx from "clsx";
import { useState } from "react";

interface Props {
    content: string;
    onChange: (html: string) => void;
    sectionTitle?: string;
    className?: string;
}

/**
 * TipTap editor with an AI-improve bubble menu for selected text.
 * Posts selection + context to /api/ai/capability-improve.
 */
export default function CapabilityEditor({ content, onChange, sectionTitle, className }: Props) {
    const [improving, setImproving] = useState(false);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [2, 3] } }),
            Underline,
            Link.configure({
                openOnClick: false,
                HTMLAttributes: { class: "text-blue-600 underline" },
            }),
        ],
        content,
        editable: true,
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
        editorProps: {
            attributes: {
                class: "prose prose-sm prose-stone max-w-none focus:outline-none min-h-[160px] text-sm leading-relaxed",
            },
        },
    });

    if (!editor) return null;

    const improveSelection = async (instruction: "rewrite" | "shorten" | "expand" | "tighten") => {
        const { from, to } = editor.state.selection;
        if (from === to) return;
        const selected = editor.state.doc.textBetween(from, to, "\n");
        if (!selected.trim()) return;

        setImproving(true);
        try {
            const res = await fetch("/api/ai/capability-improve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: selected,
                    section_title: sectionTitle,
                    instruction,
                }),
            });
            if (!res.ok) throw new Error(`AI improve failed (${res.status})`);
            const data = await res.json();
            if (data.improved_text) {
                editor.chain().focus().deleteRange({ from, to }).insertContent(data.improved_text).run();
            }
        } catch (e) {
            alert("AI improve failed: " + (e as Error).message);
        } finally {
            setImproving(false);
        }
    };

    const addLink = () => {
        const url = window.prompt("Enter URL:");
        if (url) editor.chain().focus().setLink({ href: url }).run();
    };

    const ToolbarBtn = ({ onClick, isActive, title, children }: {
        onClick: () => void; isActive?: boolean; title: string; children: React.ReactNode;
    }) => (
        <button type="button" onClick={onClick} title={title}
            className={clsx("p-1.5 rounded-lg transition-colors",
                isActive ? "bg-black text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            )}>
            {children}
        </button>
    );

    return (
        <div className={clsx("border border-stone-200 rounded-2xl overflow-hidden bg-white", className)}>
            <div className="flex items-center gap-0.5 px-3 py-2 border-b border-stone-100 bg-stone-50 flex-wrap">
                <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive("bold")} title="Bold"><Bold className="w-4 h-4" /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive("italic")} title="Italic"><Italic className="w-4 h-4" /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive("underline")} title="Underline"><UnderlineIcon className="w-4 h-4" /></ToolbarBtn>
                <div className="w-px h-5 bg-stone-200 mx-1" />
                <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive("heading", { level: 2 })} title="Heading"><Heading2 className="w-4 h-4" /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive("bulletList")} title="Bullet List"><List className="w-4 h-4" /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive("orderedList")} title="Numbered List"><ListOrdered className="w-4 h-4" /></ToolbarBtn>
                <div className="w-px h-5 bg-stone-200 mx-1" />
                <ToolbarBtn onClick={addLink} isActive={editor.isActive("link")} title="Add Link"><Link2 className="w-4 h-4" /></ToolbarBtn>
                <div className="w-px h-5 bg-stone-200 mx-1" />
                <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo className="w-4 h-4" /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo className="w-4 h-4" /></ToolbarBtn>

                <div className="ml-auto text-[10px] text-stone-400">Select text → Improve with AI</div>
            </div>

            {/* Bubble menu appears on text selection */}
            <BubbleMenu editor={editor}>
                <div className="bg-white border border-stone-200 rounded-xl shadow-lg px-1 py-1 flex items-center gap-1">
                    <button type="button" onClick={() => improveSelection("rewrite")} disabled={improving}
                        className="text-xs font-bold px-2 py-1 rounded-lg bg-black text-white hover:bg-stone-800 flex items-center gap-1 disabled:opacity-50">
                        {improving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Improve
                    </button>
                    <button type="button" onClick={() => improveSelection("shorten")} disabled={improving}
                        className="text-xs px-2 py-1 rounded-lg hover:bg-stone-100 disabled:opacity-50">Shorten</button>
                    <button type="button" onClick={() => improveSelection("expand")} disabled={improving}
                        className="text-xs px-2 py-1 rounded-lg hover:bg-stone-100 disabled:opacity-50">Expand</button>
                    <button type="button" onClick={() => improveSelection("tighten")} disabled={improving}
                        className="text-xs px-2 py-1 rounded-lg hover:bg-stone-100 disabled:opacity-50">Tighten</button>
                </div>
            </BubbleMenu>

            <div className="px-4 py-3">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
