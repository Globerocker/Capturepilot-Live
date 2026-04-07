"use client";
import { useState, useRef } from "react";
import { HelpCircle } from "lucide-react";

interface TooltipProps {
  text: string;
  children?: React.ReactNode;
  icon?: boolean;
}

export function Tooltip({ text, children, icon = true }: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <span className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {icon && <HelpCircle className="w-3.5 h-3.5 text-stone-400 hover:text-emerald-500 cursor-help flex-shrink-0" />}
      {show && (
        <div ref={ref} className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-stone-900 text-white text-xs rounded-xl px-4 py-3 shadow-xl z-50 leading-relaxed pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-stone-900 rotate-45" />
        </div>
      )}
    </span>
  );
}
