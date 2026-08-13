"use client";

import { BarChart3 } from "lucide-react";
import { useFairnessLedger } from "@/lib/hooks/useGradeAppeal";

export function FairnessLedger() {
  const { data } = useFairnessLedger();
  const ledger = data ?? {
    uphold: 0,
    raise: 0,
    inconclusive: 0,
    cancelled: 0,
    judged: 0,
    judged_without_teacher_response: 0,
  };

  const rows = [
    { label: "Uphold", value: ledger.uphold },
    { label: "Raise", value: ledger.raise },
    { label: "Inconclusive", value: ledger.inconclusive },
    { label: "Cancelled", value: ledger.cancelled },
    { label: "Judged with no teacher reply", value: ledger.judged_without_teacher_response },
  ];

  return (
    <section className="glass-card p-6 md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-accent" />
        <div>
          <h2 className="font-display text-2xl font-bold">Fairness ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            On-chain counts of how appeals end — including AI judgments after a silent teacher.
            {ledger.judged > 0 ? ` ${ledger.judged} judged so far.` : ""}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {rows.map((row) => (
          <div key={row.label} className="soft-tile px-3 py-3">
            <p className="font-display text-xl font-bold">{row.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{row.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
