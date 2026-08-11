"use client";

import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StakeConfirmDialog } from "@/components/grade/StakeConfirmDialog";
import { usePublishGrade, useProtocolConfig } from "@/lib/hooks/useGradeAppeal";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { parseGenToWei, formatGen } from "@/lib/utils/format";
import { success, error as toastError } from "@/lib/utils/toast";
import { friendlyTxError } from "@/components/RateLimitNotice";
import type { TransactionProgress } from "@/lib/contracts/GradeAppeal";

const MIN_STAKE_WEI = 10_000_000_000_000_000n;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function PublishGradeForm({ onDone }: { onDone?: () => void }) {
  const { address, isConnected } = useWallet();
  const publish = usePublishGrade();
  const { data: config } = useProtocolConfig();
  const [student, setStudent] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("10");
  const [rubric, setRubric] = useState("");
  const [justification, setJustification] = useState("");
  const [windowDays, setWindowDays] = useState("7");
  const [stake, setStake] = useState("0.01");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<TransactionProgress | null>(null);

  const pending = publish.isPending;
  const minStake = config ? BigInt(config.minimum_stake) : MIN_STAKE_WEI;

  const validate = () => {
    if (!isConnected || !address) throw new Error("Connect your wallet to continue");
    if (!ADDR_RE.test(student.trim())) {
      throw new Error("Student address must be 0x + 40 hex characters");
    }
    if (student.trim().toLowerCase() === address.toLowerCase()) {
      throw new Error("You cannot publish a grade for your own address");
    }
    if (!courseCode.trim() || !assignmentTitle.trim()) {
      throw new Error("Course code and assignment title are required");
    }
    if (!rubric.trim() || !justification.trim()) {
      throw new Error("Rubric and justification are required");
    }
    const scoreN = Number(score);
    const maxN = Number(maxScore);
    if (!Number.isFinite(scoreN) || !Number.isFinite(maxN) || maxN <= 0) {
      throw new Error("Score and max score must be valid numbers");
    }
    if (scoreN > maxN) throw new Error("Score cannot exceed max score");
    const days = Number(windowDays);
    if (!Number.isFinite(days) || days < 0) throw new Error("Appeal window days invalid");
    const stakeWei = parseGenToWei(stake);
    if (stakeWei < minStake) {
      throw new Error(`Stake must be at least ${formatGen(minStake)} GEN`);
    }
    return { stakeWei, days };
  };

  const submit = async () => {
    try {
      const { stakeWei, days } = validate();
      setProgress({ stage: "preparing" });
      const result = await publish.mutateAsync({
        student: student.trim(),
        courseCode: courseCode.trim(),
        assignmentTitle: assignmentTitle.trim(),
        score: score.trim(),
        maxScore: maxScore.trim(),
        rubric: rubric.trim(),
        teacherJustification: justification.trim(),
        appealWindowSeconds: days === 0 ? 0 : Math.round(days * 86400),
        stakeWei,
        onProgress: setProgress,
      });
      success("Grade published", {
        description:
          result.gradeId >= 0
            ? `Grade #${result.gradeId} is on-chain. Students can appeal before the deadline.`
            : "Transaction accepted on StudioNet. Refresh the board in a minute if the grade is not listed yet (RPC rate limit can delay reads).",
      });
      setProgress(null);
      setConfirmOpen(false);
      setStudent("");
      setCourseCode("");
      setAssignmentTitle("");
      setScore("");
      setRubric("");
      setJustification("");
      onDone?.();
    } catch (err) {
      setProgress(null);
      toastError("Unable to publish grade", {
        description: friendlyTxError(err),
      });
    }
  };

  return (
    <>
      <form
        className="glass-card space-y-6 p-6 md:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            validate();
            setConfirmOpen(true);
          } catch (err) {
            toastError(err instanceof Error ? err.message : "Invalid form");
          }
        }}
      >
        <div className="flex items-start gap-4">
          <span className="gradient-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Teacher
            </p>
            <h2 className="font-display text-xl font-bold">Publish a grade</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Lock score + rubric with GEN stake. The student can appeal once before the deadline.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="student">Student wallet address</Label>
          <Input
            id="student"
            required
            value={student}
            onChange={(e) => setStudent(e.target.value)}
            placeholder="0x…"
            disabled={!isConnected || pending}
          />
          <p className="text-xs text-muted-foreground">Must be a different address than yours.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="code">Course code</Label>
            <Input
              id="code"
              required
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              maxLength={40}
              placeholder="CS201"
              disabled={!isConnected || pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Assignment</Label>
            <Input
              id="title"
              required
              value={assignmentTitle}
              onChange={(e) => setAssignmentTitle(e.target.value)}
              maxLength={200}
              placeholder="Sorting analysis homework"
              disabled={!isConnected || pending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="score">Score</Label>
            <Input
              id="score"
              required
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="6"
              disabled={!isConnected || pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max">Max score</Label>
            <Input
              id="max"
              required
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              placeholder="10"
              disabled={!isConnected || pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="window">Appeal window (days)</Label>
            <Input
              id="window"
              required
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              placeholder="7"
              disabled={!isConnected || pending}
            />
            <p className="text-xs text-muted-foreground">Use 0 for protocol default (7 days).</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rubric">Locked rubric ({rubric.length}/4000)</Label>
          <Textarea
            id="rubric"
            required
            value={rubric}
            onChange={(e) => setRubric(e.target.value.slice(0, 4000))}
            rows={4}
            placeholder="8-10: Correct algorithm + complexity + edge cases…"
            disabled={!isConnected || pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="why">Teacher justification ({justification.length}/3000)</Label>
          <Textarea
            id="why"
            required
            value={justification}
            onChange={(e) => setJustification(e.target.value.slice(0, 3000))}
            rows={3}
            placeholder="Why this score was assigned…"
            disabled={!isConnected || pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stake">Teacher stake (GEN)</Label>
          <Input
            id="stake"
            required
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            inputMode="decimal"
            className="max-w-[10rem]"
            disabled={!isConnected || pending}
          />
          <p className="text-xs text-muted-foreground">
            Minimum {formatGen(minStake)} GEN. Recoverable after deadline if no open appeal.
          </p>
        </div>

        <Button type="submit" variant="gradient" className="w-full" disabled={!isConnected || pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Publishing…
            </>
          ) : (
            <>
              <BookOpen className="mr-2 h-4 w-4" />
              Review stake and publish
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          StudioNet: 30 RPC requests/min · 500/hour — wait after errors; don’t spam Confirm.
        </p>
        {progress && (
          <div className="soft-tile text-sm" role="status">
            <p className="font-medium capitalize">Transaction: {progress.stage}</p>
            {progress.hash && (
              <code className="mt-1 block break-all text-xs text-muted-foreground">
                {progress.hash}
              </code>
            )}
          </div>
        )}
      </form>

      <StakeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm grade publish"
        description="You are locking GEN behind this grade and rubric. The student can appeal once before the deadline."
        stakeLabel={`${stake} GEN`}
        warnings={[
          "Rubric cannot be changed after publish",
          "You cannot close before the appeal deadline",
          "If the student wins an appeal, they may receive the stake pot",
          "StudioNet rate limit: wait ~1 min after a failed send before retrying",
        ]}
        pending={pending}
        onConfirm={submit}
      />
    </>
  );
}
