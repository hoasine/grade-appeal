"use client";

import { BookOpen, Brain, Scale, Timer } from "lucide-react";

const steps = [
  {
    icon: BookOpen,
    title: "Publish + lock rubric",
    desc: "Teacher posts score, justification, and an immutable rubric with GEN stake.",
  },
  {
    icon: Scale,
    title: "File an appeal",
    desc: "Student stakes once, explains why, and can cancel before judgment.",
  },
  {
    icon: Timer,
    title: "Teacher may respond",
    desc: "Guaranteed reply window before AI can settle. Deadlines protect both sides.",
  },
  {
    icon: Brain,
    title: "AI settles",
    desc: "Verdict: UPHOLD, RAISE, or INCONCLUSIVE — never lower as punishment.",
  },
];

export function HowItWorks() {
  return (
    <section className="glass-card p-6 md:p-8">
      <h2 className="mb-6 font-display text-2xl font-bold">How it works</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
                {i + 1}
              </span>
              <s.icon className="h-5 w-5 text-accent" />
            </div>
            <h3 className="font-semibold">{s.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
