"use client";

import { Suspense } from "react";
import { Scale } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { GradeApp } from "@/components/grade/GradeApp";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-grow px-4 pt-24 pb-16 md:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-12 animate-fade-in text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <Scale className="h-3.5 w-3.5" />
              Intelligent Contract · GenLayer Studionet
            </div>
            <h1 className="mb-4 font-display text-4xl font-bold md:text-5xl lg:text-6xl">
              Grade<span className="text-gradient">Appeal</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Fair grade appeals — clear rules, real stakes, AI review against a locked rubric.
            </p>
          </header>
          <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}>
            <GradeApp />
          </Suspense>
        </div>
      </main>
      <footer className="space-y-4 border-t border-white/5 px-4 py-8">
        <p className="text-center text-xs text-muted-foreground">
          GradeAppeal · Powered by GenLayer · Education fairness prototype — not institutional policy
        </p>
      </footer>
    </div>
  );
}
