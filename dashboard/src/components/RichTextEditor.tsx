"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Bold, Italic, Underline as UnderlineIcon, Heading2, List, ListOrdered, Link2, Undo, Redo } from "lucide-react";
import clsx from "clsx";

interface RichTextEditorProps {
    content: string;
    onChange?: (html: string) => void;
    className?: string;
    editable?: boolean;
}

export default function RichTextEditor({ content, onChange, className, editable = true }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                HTMLAttributes: { class: "text-blue-600 underline" },
            }),
        ],
        content,
        editable,
        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: "prose prose-sm prose-stone max-w-none focus:outline-none min-h-[200px] text-sm leading-relaxed",
            },
        },
    });

    if (!editor) return null;

    const ToolbarButton = ({
        onClick,
        isActive,
        children,
        title,
    }: {
        onClick: () => void;
        isActive?: boolean;
        children: React.ReactNode;
        title: string;
    }) => (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={clsx(
                "p-1.5 rounded-lg transition-colors",
                isActive
                    ? "bg-black text-white"
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            )}
        >
            {children}
        </button>
    );

    const addLink = () => {
        const url = window.prompt("Enter URL:");
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    };

    return (
        <div className={clsx("border border-stone-200 rounded-2xl overflow-hidden bg-white", className)}>
            {/* Toolbar */}
            {editable && (
                <div className="flex items-center gap-0.5 px-3 py-2 border-b border-stone-100 bg-stone-50 flex-wrap">
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        isActive={editor.isActive("bold")}
                        title="Bold"
                    >
                        <Bold className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        isActive={editor.isActive("italic")}
                        title="Italic"
                    >
                        <Italic className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        isActive={editor.isActive("underline")}
                        title="Underline"
                    >
                        <UnderlineIcon className="w-4 h-4" />
                    </ToolbarButton>

                    <div className="w-px h-5 bg-stone-200 mx-1" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        isActive={editor.isActive("heading", { level: 2 })}
                        title="Heading"
                    >
                        <Heading2 className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        isActive={editor.isActive("bulletList")}
                        title="Bullet List"
                    >
                        <List className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        isActive={editor.isActive("orderedList")}
                        title="Numbered List"
                    >
                        <ListOrdered className="w-4 h-4" />
                    </ToolbarButton>

                    <div className="w-px h-5 bg-stone-200 mx-1" />

                    <ToolbarButton
                        onClick={addLink}
                        isActive={editor.isActive("link")}
                        title="Add Link"
                    >
                        <Link2 className="w-4 h-4" />
                    </ToolbarButton>

                    <div className="w-px h-5 bg-stone-200 mx-1" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().undo().run()}
                        title="Undo"
                    >
                        <Undo className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().redo().run()}
                        title="Redo"
                    >
                        <Redo className="w-4 h-4" />
                    </ToolbarButton>
                </div>
            )}

            {/* Editor */}
            <div className="px-4 py-3">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
