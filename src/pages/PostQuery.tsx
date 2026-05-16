import { Navbar } from "@/components/layout/Navbar";
import { QueryForm } from "@/components/query/QueryForm";
import { QueryContextPanel } from "@/components/query/QueryContextPanel";

export default function PostQueryPage() {
  return (
    <div className="min-h-screen bg-mesh flex flex-col">
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Ask The Expert</p>
          <h1 className="font-display text-3xl md:text-4xl mt-1">Post a Query</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Get a structured AI report in seconds. A SEBI-registered analyst will follow up with a video answer within 24 hours.
          </p>
        </header>
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <QueryForm />
          <div className="hidden lg:block"><QueryContextPanel /></div>
        </div>
      </main>
    </div>
  );
}
