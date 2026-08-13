"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  LayoutDashboard,
  Loader2,
  PenLine,
  Scale,
  Timer,
} from "lucide-react";
import { PublishGradeForm } from "@/components/grade/PublishGradeForm";
import { GradeCard } from "@/components/grade/GradeCard";
import { HowItWorks } from "@/components/grade/HowItWorks";
import { FairnessLedger } from "@/components/grade/FairnessLedger";
import { ContractSetupBanner } from "@/components/ContractSetupBanner";
import { RateLimitNotice } from "@/components/RateLimitNotice";
import { useGrades, type GradeFilter } from "@/lib/hooks/useGradeAppeal";
import { getContractAddress } from "@/lib/genlayer/client";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "board", label: "Board", icon: Scale },
  { id: "publish", label: "Publish", icon: PenLine },
] as const;

const FILTERS: { id: GradeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "teaching", label: "My teaching" },
  { id: "mine", label: "My grades" },
  { id: "open", label: "Open appeals" },
];

type TabId = (typeof TABS)[number]["id"];

export function GradeApp() {
  const search = useSearchParams();
  const initialTab: TabId =
    search.get("tab") === "publish"
      ? "publish"
      : search.get("tab") === "board"
        ? "board"
        : "overview";
  const [tab, setTab] = useState<TabId>(initialTab);
  const [filter, setFilter] = useState<GradeFilter>("all");
  const contract = getContractAddress();
  const { data, isLoading, isError, error, refetch } = useGrades(
    tab === "board" || tab === "overview" ? filter : "all"
  );
  const grades = data ?? [];

  const stats = useMemo(() => {
    const open = grades.filter((g) => g.has_open_appeal).length;
    const active = grades.filter((g) => !g.closed && g.status !== "SETTLED").length;
    return [
      { label: "Published grades", value: grades.length, icon: BookOpen },
      { label: "Active cases", value: active, icon: Timer },
      { label: "Open appeals", value: open, icon: Scale },
      {
        label: "AI verdicts",
        value: "UPHOLD / RAISE",
        icon: LayoutDashboard,
      },
    ];
  }, [grades]);

  return (
    <div className="space-y-8">
      <ContractSetupBanner />
      <RateLimitNotice />

      {contract && (
        <p className="text-center font-mono text-xs text-muted-foreground">
          Contract: {contract.slice(0, 10)}...{contract.slice(-8)}
        </p>
      )}

      <nav className="flex flex-wrap justify-center gap-2 rounded-xl border border-white/5 bg-black/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              tab === t.id
                ? "gradient-purple-pink text-white shadow-md"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="animate-fade-in space-y-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="glass-card flex flex-col gap-3 p-5">
                <item.icon className="h-5 w-5 text-accent" />
                <p className="font-display text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
          <HowItWorks />
          <FairnessLedger />
        </div>
      )}

      {tab === "publish" && (
        <div className="mx-auto max-w-xl animate-fade-in">
          <PublishGradeForm onDone={() => setTab("board")} />
        </div>
      )}

      {tab === "board" && (
        <div className="animate-fade-in space-y-5">
          <div className="flex flex-wrap justify-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  filter === f.id
                    ? "gradient-purple-pink text-white"
                    : "border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading grades…
            </div>
          )}
          {isError && (
            <div className="glass-card p-4 text-sm">
              <p className="text-destructive">Failed to load grades.</p>
              <p className="mt-1 text-muted-foreground">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <button
                type="button"
                className="mt-2 text-accent underline"
                onClick={() => refetch()}
              >
                Retry
              </button>
            </div>
          )}
          {!isLoading && !isError && grades.length === 0 && (
            <div className="glass-card p-10 text-center">
              <p className="font-display text-lg font-bold">No grades yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Publish a grade with a locked rubric to start.
              </p>
              <button
                type="button"
                className="mt-4 text-sm font-medium text-accent underline"
                onClick={() => setTab("publish")}
              >
                Publish a grade
              </button>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-4">
            {grades.map((g) => (
              <GradeCard key={g.id} grade={g} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
