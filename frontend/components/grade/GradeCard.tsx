"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import type { AppealView, GradeView, TransactionProgress } from "@/lib/contracts/GradeAppeal";
import {
  useCancelAppeal,
  useCloseGrade,
  useFileAppeal,
  useGradeAppeals,
  useJudgeAppeal,
  useRespondToAppeal,
} from "@/lib/hooks/useGradeAppeal";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { formatCountdown, formatGen, parseGenToWei, shortAddr } from "@/lib/utils/format";
import { success, error as toastError } from "@/lib/utils/toast";
import { friendlyTxError } from "@/components/RateLimitNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StakeConfirmDialog } from "@/components/grade/StakeConfirmDialog";

const MIN_STAKE_WEI = 10_000_000_000_000_000n;

function statusChip(status: string) {
  if (status === "APPEALED") return "bg-amber/15 text-amber border-amber/40";
  if (status === "SETTLED") return "bg-mint/15 text-mint border-mint/40";
  if (status === "CLOSED") return "bg-secondary text-muted-foreground border-border";
  return "bg-sky/15 text-sky border-sky/40";
}

function verdictChip(verdict: string) {
  if (verdict === "RAISE_GRADE") return "bg-mint/15 text-mint border-mint/40";
  if (verdict === "UPHOLD_ORIGINAL") return "bg-sky/15 text-sky border-sky/40";
  if (verdict === "INCONCLUSIVE") return "bg-amber/15 text-amber border-amber/40";
  if (verdict === "CANCELLED") return "bg-secondary text-muted-foreground border-border";
  return "bg-secondary text-muted-foreground border-border";
}

function verdictLabel(verdict: string) {
  if (verdict === "RAISE_GRADE") return "Raise grade";
  if (verdict === "UPHOLD_ORIGINAL") return "Uphold original";
  if (verdict === "INCONCLUSIVE") return "Inconclusive";
  if (verdict === "CANCELLED") return "Cancelled";
  return verdict || "—";
}

export function GradeCard({ grade }: { grade: GradeView }) {
  const { address, isConnected } = useWallet();
  const [now, setNow] = useState(() => Date.now());
  const [progress, setProgress] = useState<TransactionProgress | null>(null);

  const [appealOpen, setAppealOpen] = useState(false);
  const [confirmAppeal, setConfirmAppeal] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [proposed, setProposed] = useState("");
  const [appealStake, setAppealStake] = useState("0.01");

  const [responseOpen, setResponseOpen] = useState(false);
  const [response, setResponse] = useState("");

  const appealsQ = useGradeAppeals(grade.id, true);
  const appeals = appealsQ.data ?? [];
  const openAppeal: AppealView | undefined = appeals.find((a) => a.status === "OPEN");
  const latestAppeal = appeals[appeals.length - 1];

  const fileAppeal = useFileAppeal();
  const respond = useRespondToAppeal();
  const cancel = useCancelAppeal();
  const judge = useJudgeAppeal();
  const close = useCloseGrade();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const me = address?.toLowerCase();
  const isTeacher = Boolean(me && grade.teacher.toLowerCase() === me);
  const isStudent = Boolean(me && grade.student.toLowerCase() === me);
  const deadlineMs = grade.appeal_deadline_at * 1000;
  const beforeDeadline = now < deadlineMs;
  const afterDeadline = now >= deadlineMs;

  const canPetition =
    isConnected &&
    isStudent &&
    !grade.closed &&
    grade.status === "PUBLISHED" &&
    grade.appeal_count === 0 &&
    beforeDeadline &&
    !grade.has_open_appeal;

  const canCancel =
    isConnected && isStudent && Boolean(openAppeal) && openAppeal?.status === "OPEN";
  const canRespond =
    isConnected &&
    isTeacher &&
    Boolean(openAppeal) &&
    !openAppeal?.teacher_response?.trim();
  const canJudge = isConnected && Boolean(openAppeal);
  const canClose =
    isConnected &&
    isTeacher &&
    !grade.closed &&
    grade.status !== "SETTLED" &&
    !grade.has_open_appeal &&
    afterDeadline;

  const pending =
    fileAppeal.isPending ||
    respond.isPending ||
    cancel.isPending ||
    judge.isPending ||
    close.isPending;

  const countdown = useMemo(
    () => formatCountdown(grade.appeal_deadline_at, now),
    [grade.appeal_deadline_at, now]
  );

  const onAppeal = async () => {
    try {
      const stakeWei = parseGenToWei(appealStake);
      if (stakeWei < MIN_STAKE_WEI) throw new Error("Stake must be at least 0.01 GEN");
      if (!reason.trim() || !evidence.trim()) {
        throw new Error("Reason and evidence are required");
      }
      setProgress({ stage: "preparing" });
      await fileAppeal.mutateAsync({
        gradeId: grade.id,
        reason: reason.trim(),
        evidence: evidence.trim(),
        proposedScore: proposed.trim(),
        stakeWei,
        onProgress: setProgress,
      });
      success("Appeal filed", { description: "You can cancel before judgment if you change your mind." });
      setConfirmAppeal(false);
      setAppealOpen(false);
      setReason("");
      setEvidence("");
      setProposed("");
    } catch (err) {
      setProgress(null);
      toastError("Unable to file appeal", {
        description: friendlyTxError(err),
      });
    }
  };

  return (
    <article className="glass-card space-y-4 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-bold">
              {grade.course_code} · {grade.assignment_title}
            </h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusChip(grade.status)}`}>
              {grade.status}
            </span>
            {grade.final_verdict && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${verdictChip(grade.final_verdict)}`}>
                {verdictLabel(grade.final_verdict)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Grade #{grade.id} · Teacher {shortAddr(grade.teacher)} · Student{" "}
            {shortAddr(grade.student)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold">
            {grade.final_score || grade.score}
            <span className="text-base text-muted-foreground"> / {grade.max_score}</span>
          </p>
          {grade.final_score && grade.final_score !== grade.score && (
            <p className="text-xs text-muted-foreground">Was {grade.score}</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="soft-tile px-3 py-2">
          <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">Stake locked</p>
          <p className="font-semibold">{formatGen(grade.stake)} GEN</p>
        </div>
        <div className="soft-tile px-3 py-2">
          <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
            Appeal deadline
          </p>
          <p className="font-semibold">
            {beforeDeadline ? countdown : "Passed"}
          </p>
        </div>
        <div className="soft-tile px-3 py-2">
          <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">Appeals</p>
          <p className="font-semibold">
            {grade.appeal_count}
            {grade.has_open_appeal ? " · open" : ""}
          </p>
        </div>
      </div>

      <details className="soft-tile px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">Rubric & justification</summary>
        <div className="mt-3 space-y-3 text-sm whitespace-pre-wrap text-muted-foreground">
          <div>
            <p className="mb-1 text-xs font-semibold text-foreground uppercase">Rubric</p>
            {grade.rubric}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-foreground uppercase">Justification</p>
            {grade.teacher_justification}
          </div>
        </div>
      </details>

      {latestAppeal && (
        <div className="soft-tile space-y-2 px-4 py-3 text-sm">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Latest appeal #{latestAppeal.id} · {latestAppeal.status}
          </p>
          <p>
            <span className="font-medium text-foreground">Reason:</span> {latestAppeal.reason}
          </p>
          <p className="text-muted-foreground whitespace-pre-wrap">{latestAppeal.evidence}</p>
          {latestAppeal.teacher_response && (
            <p>
              <span className="font-medium text-foreground">Teacher reply:</span>{" "}
              {latestAppeal.teacher_response}
            </p>
          )}
          {latestAppeal.verdict && (
            <p>
              Verdict:{" "}
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${verdictChip(latestAppeal.verdict)}`}>
                {verdictLabel(latestAppeal.verdict)}
              </span>
              {latestAppeal.reasoning ? ` — ${latestAppeal.reasoning}` : ""}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canPetition && (
          <Dialog open={appealOpen} onOpenChange={setAppealOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient" size="sm" disabled={pending}>
                <Scale className="h-4 w-4" />
                File appeal
              </Button>
            </DialogTrigger>
            <DialogContent className="brand-card max-w-lg border-2">
              <DialogHeader>
                <DialogTitle className="font-display">File an appeal</DialogTitle>
                <DialogDescription>
                  One-shot only. Cite rubric bands. You may cancel before judgment.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Reason ({reason.length}/2000)</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 2000))}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Evidence ({evidence.length}/4000)</Label>
                  <Textarea
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value.slice(0, 4000))}
                    rows={4}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Proposed score (optional)</Label>
                    <Input value={proposed} onChange={(e) => setProposed(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Stake (GEN)</Label>
                    <Input value={appealStake} onChange={(e) => setAppealStake(e.target.value)} />
                  </div>
                </div>
                <Button
                  variant="gradient"
                  className="w-full"
                  onClick={() => {
                    try {
                      parseGenToWei(appealStake);
                      if (!reason.trim() || !evidence.trim()) {
                        throw new Error("Reason and evidence are required");
                      }
                      setConfirmAppeal(true);
                    } catch (err) {
                      toastError(err instanceof Error ? err.message : "Invalid appeal");
                    }
                  }}
                >
                  Review stake
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {canRespond && openAppeal && (
          <Dialog open={responseOpen} onOpenChange={setResponseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                Respond
              </Button>
            </DialogTrigger>
            <DialogContent className="brand-card max-w-lg border-2">
              <DialogHeader>
                <DialogTitle className="font-display">Respond to appeal</DialogTitle>
                <DialogDescription>One response only. AI will read this with the rubric.</DialogDescription>
              </DialogHeader>
              <Textarea
                value={response}
                onChange={(e) => setResponse(e.target.value.slice(0, 3000))}
                rows={5}
                placeholder="Explain why the original score fits the rubric…"
              />
              <Button
                variant="gradient"
                disabled={pending || !response.trim()}
                onClick={async () => {
                  try {
                    setProgress({ stage: "preparing" });
                    await respond.mutateAsync({
                      appealId: openAppeal.id,
                      response: response.trim(),
                      onProgress: setProgress,
                    });
                    success("Response submitted");
                    setResponseOpen(false);
                    setResponse("");
                  } catch (err) {
                    setProgress(null);
                    toastError("Unable to respond", {
                      description: friendlyTxError(err),
                    });
                  }
                }}
              >
                {respond.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit response"}
              </Button>
            </DialogContent>
          </Dialog>
        )}

        {canCancel && openAppeal && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={async () => {
              try {
                setProgress({ stage: "preparing" });
                await cancel.mutateAsync({ appealId: openAppeal.id, onProgress: setProgress });
                success("Appeal cancelled", {
                  description: "Your stake was refunded. You cannot appeal this grade again.",
                });
              } catch (err) {
                setProgress(null);
                toastError("Unable to cancel", {
                  description: friendlyTxError(err),
                });
              }
            }}
          >
            Cancel appeal
          </Button>
        )}

        {canJudge && openAppeal && (
          <Button
            variant="gradient"
            size="sm"
            disabled={pending}
            onClick={async () => {
              try {
                setProgress({ stage: "preparing" });
                await judge.mutateAsync({ appealId: openAppeal.id, onProgress: setProgress });
                success("Appeal judged");
              } catch (err) {
                setProgress(null);
                toastError("Unable to judge", {
                  description: friendlyTxError(err),
                });
              }
            }}
          >
            {judge.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Judge appeal"}
          </Button>
        )}

        {canClose && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={async () => {
              try {
                setProgress({ stage: "preparing" });
                await close.mutateAsync({ gradeId: grade.id, onProgress: setProgress });
                success("Grade closed", { description: "Teacher stake recovered." });
              } catch (err) {
                setProgress(null);
                toastError("Unable to close", {
                  description: friendlyTxError(err),
                });
              }
            }}
          >
            Close grade
          </Button>
        )}
      </div>

      {progress && (
        <div className="soft-tile text-sm" role="status">
          <p className="font-medium capitalize">Transaction: {progress.stage}</p>
          {progress.hash && (
            <code className="mt-1 block break-all text-xs text-muted-foreground">{progress.hash}</code>
          )}
        </div>
      )}

      <StakeConfirmDialog
        open={confirmAppeal}
        onOpenChange={setConfirmAppeal}
        title="Confirm appeal stake"
        description="This is your only appeal for this grade. You may cancel before AI judgment to reclaim stake."
        stakeLabel={`${appealStake} GEN`}
        warnings={[
          "One-shot: cancel still blocks a second appeal",
          "AI may UPHOLD, RAISE, or return INCONCLUSIVE — never lower as punishment",
          "Cite rubric bands in your evidence",
        ]}
        pending={fileAppeal.isPending}
        onConfirm={onAppeal}
      />
    </article>
  );
}
