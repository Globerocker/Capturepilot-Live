export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 text-stone-900 selection:bg-black selection:text-white">
      <div className="max-w-2xl mx-auto py-6 sm:py-10 px-4">
        {children}
      </div>
    </div>
  );
}
