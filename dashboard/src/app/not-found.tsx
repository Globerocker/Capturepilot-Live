import Link from "next/link";
import { Search, ArrowLeft, Target, Briefcase, Sparkles } from "lucide-react";

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 to-indigo-50">
            <div className="max-w-md w-full text-center">
                <div className="inline-flex items-center justify-center size-20 rounded-2xl bg-indigo-100 text-indigo-700 mb-6">
                    <Search className="size-10" />
                </div>
                <h1 className="text-4xl font-semibold text-slate-900 mb-2">Page not found</h1>
                <p className="text-slate-600 mb-8">
                    The page you&apos;re looking for doesn&apos;t exist or was moved. Try one of the shortcuts below.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    <Link
                        href="/matches"
                        className="flex flex-col items-center gap-2 p-4 rounded-lg bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-sm transition"
                    >
                        <Target className="size-5 text-indigo-600" />
                        <span className="text-sm font-medium text-slate-900">My Matches</span>
                    </Link>
                    <Link
                        href="/pipeline"
                        className="flex flex-col items-center gap-2 p-4 rounded-lg bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-sm transition"
                    >
                        <Briefcase className="size-5 text-indigo-600" />
                        <span className="text-sm font-medium text-slate-900">Pipeline</span>
                    </Link>
                    <Link
                        href="/ai-drafter"
                        className="flex flex-col items-center gap-2 p-4 rounded-lg bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-sm transition"
                    >
                        <Sparkles className="size-5 text-indigo-600" />
                        <span className="text-sm font-medium text-slate-900">AI Drafter</span>
                    </Link>
                </div>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-indigo-700 hover:text-indigo-900"
                >
                    <ArrowLeft className="size-4" /> Back to dashboard
                </Link>
            </div>
        </div>
    );
}
