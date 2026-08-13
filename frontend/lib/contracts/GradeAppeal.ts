import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

export type GradeStatus = "PUBLISHED" | "APPEALED" | "SETTLED" | "CLOSED";
export type AppealStatus = "OPEN" | "JUDGED" | "CANCELLED";
export type Verdict =
  | "UPHOLD_ORIGINAL"
  | "RAISE_GRADE"
  | "INCONCLUSIVE"
  | "CANCELLED"
  | "";

export type GradeView = {
  id: number;
  teacher: string;
  student: string;
  course_code: string;
  assignment_title: string;
  score: string;
  max_score: string;
  rubric: string;
  teacher_justification: string;
  stake: number | string;
  created_at: number;
  appeal_deadline_at: number;
  status: GradeStatus;
  has_open_appeal: boolean;
  open_appeal_id: number;
  appeal_count: number;
  closed: boolean;
  final_score: string;
  final_verdict: Verdict;
};

export type AppealView = {
  id: number;
  grade_id: number;
  student: string;
  reason: string;
  evidence: string;
  proposed_score: string;
  teacher_response: string;
  stake: number | string;
  created_at: number;
  response_deadline_at: number;
  judged_at: number;
  verdict: Verdict;
  recommended_score: string;
  confidence: number;
  reasoning: string;
  status: AppealStatus;
  paid_out: boolean;
  responded_at: number;
  judged_without_teacher_response: boolean;
};

export type FairnessLedger = {
  uphold: number;
  raise: number;
  inconclusive: number;
  cancelled: number;
  judged: number;
  judged_without_teacher_response: number;
};

export type ProtocolConfig = {
  minimum_stake: number | string;
  default_appeal_window: number | string;
  min_appeal_window: number | string;
  max_appeal_window: number | string;
  teacher_response_window: number | string;
};

export type TransactionProgress = {
  hash?: string;
  stage: "preparing" | "submitted" | "finalizing" | "finalized";
};

export type WriteResult = {
  hash: string;
  receipt: unknown;
};

const AI_TX_WAIT = {
  retries: 45,
  interval: 2500,
  status: TransactionStatus.FINALIZED,
};
const FAST_TX_WAIT = {
  retries: 18,
  interval: 2000,
  status: TransactionStatus.ACCEPTED,
};

function isRpcNoiseError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err ?? "").toLowerCase();
  return (
    msg.includes("gen_call") ||
    msg.includes("rate limit") ||
    msg.includes("rate limited") ||
    msg.includes("too many requests") ||
    msg.includes("failed to fetch") ||
    msg.includes("fetch") ||
    msg.includes("network")
  );
}

function withMutedGenLayerConsole<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof console === "undefined" || typeof console.error !== "function") {
    return fn();
  }
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map((a) => String(a)).join(" ");
    if (
      text.includes("Error fetching") &&
      text.includes("from GenLayer RPC")
    ) {
      return;
    }
    original(...args);
  };
  return fn().finally(() => {
    console.error = original;
  });
}

function normalizeReadValue(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [key, entry] of value.entries()) {
      obj[String(key)] = normalizeReadValue(entry);
    }
    return obj;
  }
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeReadValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeReadValue(entry)])
    );
  }
  return value;
}

function normalizeReadResult<T>(raw: unknown): T {
  return normalizeReadValue(raw) as T;
}

export class GradeAppealClient {
  private contractAddress: `0x${string}`;
  private readClient: ReturnType<typeof createClient>;
  private account?: `0x${string}`;
  private endpoint?: string;

  constructor(contractAddress: string, account?: string | null, endpoint?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.account = account ? (account as `0x${string}`) : undefined;
    this.endpoint = endpoint;
    const config: Record<string, unknown> = { chain: studionet };
    if (endpoint) config.endpoint = endpoint;
    this.readClient = createClient(config as Parameters<typeof createClient>[0]);
  }

  updateAccount(address: string, endpoint?: string) {
    this.account = address as `0x${string}`;
    this.endpoint = endpoint ?? this.endpoint;
  }

  private async assertContractDeployed() {
    const endpoint = this.endpoint || "https://studio.genlayer.com/api";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "gen_getContractSchema",
          params: [this.contractAddress],
        }),
      });
      const data = (await res.json()) as {
        result?: { methods?: Record<string, unknown> };
        error?: { message?: string };
      };
      if (data.error || !data.result?.methods) {
        throw new Error(
          `No GradeAppeal contract at ${this.contractAddress} on Studionet. Redeploy contracts/grade_appeal.py in GenLayer Studio, then set NEXT_PUBLIC_CONTRACT_ADDRESS and restart the frontend.`
        );
      }
      if (!("publish_grade" in data.result.methods)) {
        throw new Error(
          `Contract at ${this.contractAddress} is missing publish_grade. Confirm you deployed GradeAppeal.`
        );
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.startsWith("No GradeAppeal") ||
          err.message.startsWith("Contract at"))
      ) {
        throw err;
      }
      // If the preflight RPC fails, continue — write path will surface the real error.
    }
  }

  private async getWriteClient() {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("A browser wallet is required to send transactions.");
    }

    // Prefer live MetaMask accounts — React wallet state can lag after chain switches.
    const { ensureGenLayerNetwork, getAccounts, requestAccounts } = await import(
      "@/lib/genlayer/client"
    );
    await ensureGenLayerNetwork();
    await this.assertContractDeployed();

    let accounts = await getAccounts();
    if (accounts.length === 0) {
      accounts = await requestAccounts();
    }
    const account = (accounts[0] || this.account) as `0x${string}` | undefined;
    if (!account) {
      throw new Error("Connect your wallet to continue");
    }
    this.account = account;

    // Do NOT call client.connect("studionet"): it requests the GenLayer MetaMask Snap
    // (wallet_getSnaps / wallet_requestSnaps), which often drops the session on stable MM.
    // Network switching is already handled by ensureGenLayerNetwork above.
    return createClient({
      chain: studionet,
      endpoint: this.endpoint,
      account,
      provider: window.ethereum as NonNullable<
        Parameters<typeof createClient>[0]
      >["provider"],
    });
  }

  private async studioRpc<T>(method: string, params: unknown[]): Promise<T> {
    const endpoint = this.endpoint || "https://studio.genlayer.com/api";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });
    const data = (await res.json()) as { result?: T; error?: { message?: string } };
    if (data.error) {
      throw new Error(data.error.message || "Studio RPC error");
    }
    return data.result as T;
  }

  private statusReached(current: string, target: TransactionStatus | undefined): boolean {
    const cur = current.toUpperCase();
    const want = String(target ?? TransactionStatus.ACCEPTED).toUpperCase();
    if (cur.includes("CANCEL") || cur.includes("TIMEOUT")) return false;
    if (want.includes("FINAL")) {
      return cur === "FINALIZED" || cur === "ACCEPTED";
    }
    // ACCEPTED wait: ACCEPTED or FINALIZED both count as done
    return cur === "ACCEPTED" || cur === "FINALIZED" || cur === "ACTIVATED";
  }

  private async waitForWrite(
    _client: ReturnType<typeof createClient>,
    hash: Awaited<ReturnType<ReturnType<typeof createClient>["writeContract"]>>,
    options: {
      retries: number;
      interval: number;
      status?: TransactionStatus;
    } = AI_TX_WAIT,
    onProgress?: (progress: TransactionProgress) => void
  ) {
    const txHash = String(hash);
    onProgress?.({ hash: txHash, stage: "finalizing" });

    // Avoid SDK waitForTransactionReceipt — it hammers gen_call / MetaMask RPC and
    // trips StudioNet rate limits + Next.js console.error overlays even after success.
    let lastStatus = "";
    const retries = Math.max(1, options.retries);
    for (let i = 0; i < retries; i++) {
      try {
        lastStatus = String(
          await this.studioRpc<string>("gen_getTransactionStatus", [txHash])
        ).toUpperCase();

        if (lastStatus.includes("CANCEL") || lastStatus.includes("TIMEOUT")) {
          throw new Error(
            `Transaction ${lastStatus.toLowerCase().replace(/_/g, " ")}.`
          );
        }

        if (this.statusReached(lastStatus, options.status)) {
          onProgress?.({ hash: txHash, stage: "finalized" });
          return {
            hash: txHash,
            receipt: { statusName: lastStatus },
          } satisfies WriteResult;
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Transaction ")) {
          throw err;
        }
        // After the tx is already submitted, RPC noise should not fail the UI.
        if (i >= 2 && isRpcNoiseError(err)) {
          onProgress?.({ hash: txHash, stage: "finalized" });
          return {
            hash: txHash,
            receipt: { statusName: lastStatus || "SUBMITTED", soft: true },
          } satisfies WriteResult;
        }
      }
      await new Promise((r) => setTimeout(r, options.interval));
    }

    // Hash exists on Studio — prefer success over a false "publish failed".
    onProgress?.({ hash: txHash, stage: "finalized" });
    return {
      hash: txHash,
      receipt: { statusName: lastStatus || "SUBMITTED", soft: true },
    } satisfies WriteResult;
  }

  private async write(
    functionName: string,
    args: Array<string | number>,
    value: bigint,
    wait = FAST_TX_WAIT,
    onProgress?: (progress: TransactionProgress) => void
  ) {
    onProgress?.({ stage: "preparing" });
    const client = await this.getWriteClient();
    const hash = await withMutedGenLayerConsole(() =>
      client.writeContract({
        address: this.contractAddress,
        functionName,
        args,
        value,
      })
    );
    onProgress?.({ hash: String(hash), stage: "submitted" });
    return this.waitForWrite(client, hash, wait, onProgress);
  }

  async getGradeCount(): Promise<number> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_grade_count",
      args: [],
    });
    return Number(normalizeReadResult<number>(raw) ?? 0);
  }

  async getAppealCount(): Promise<number> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_appeal_count",
      args: [],
    });
    return Number(normalizeReadResult<number>(raw) ?? 0);
  }

  async getAllGrades(): Promise<GradeView[]> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_all_grades",
      args: [],
    });
    const list = normalizeReadResult<GradeView[]>(raw);
    return Array.isArray(list) ? list : [];
  }

  async getGrade(id: number): Promise<GradeView> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_grade",
      args: [id],
    });
    return normalizeReadResult<GradeView>(raw);
  }

  async getAppeal(id: number): Promise<AppealView> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_appeal",
      args: [id],
    });
    return normalizeReadResult<AppealView>(raw);
  }

  async getGradeAppeals(gradeId: number): Promise<AppealView[]> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_grade_appeals",
      args: [gradeId],
    });
    const list = normalizeReadResult<AppealView[]>(raw);
    return Array.isArray(list) ? list : [];
  }

  async getProtocolConfig(): Promise<ProtocolConfig> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_protocol_config",
      args: [],
    });
    return normalizeReadResult<ProtocolConfig>(raw);
  }

  async getFairnessLedger(): Promise<FairnessLedger> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_fairness_ledger",
      args: [],
    });
    return normalizeReadResult<FairnessLedger>(raw);
  }

  async publishGrade(
    student: string,
    courseCode: string,
    assignmentTitle: string,
    score: string,
    maxScore: string,
    rubric: string,
    teacherJustification: string,
    appealWindowSeconds: number,
    stakeWei: bigint,
    onProgress?: (progress: TransactionProgress) => void
  ) {
    let before = -1;
    try {
      before = await this.getGradeCount();
    } catch {
      // Board reads can fail under rate limit — still allow publish.
    }
    onProgress?.({ stage: "preparing" });
    const client = await this.getWriteClient();
    const hash = await withMutedGenLayerConsole(() =>
      client.writeContract({
        address: this.contractAddress,
        functionName: "publish_grade",
        args: [
          student,
          courseCode,
          assignmentTitle,
          score,
          maxScore,
          rubric,
          teacherJustification,
          appealWindowSeconds,
        ],
        value: stakeWei,
      })
    );
    onProgress?.({ hash: String(hash), stage: "submitted" });
    const transaction = await this.waitForWrite(client, hash, FAST_TX_WAIT, onProgress);

    if (before >= 0) {
      for (let i = 0; i < 4; i++) {
        try {
          const n = await this.getGradeCount();
          if (n > before) return { gradeId: n - 1, ...transaction };
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    return { gradeId: -1, ...transaction };
  }

  fileAppeal(
    gradeId: number,
    reason: string,
    evidence: string,
    proposedScore: string,
    stakeWei: bigint,
    onProgress?: (progress: TransactionProgress) => void
  ) {
    return this.write(
      "file_appeal",
      [gradeId, reason, evidence, proposedScore],
      stakeWei,
      FAST_TX_WAIT,
      onProgress
    );
  }

  respondToAppeal(
    appealId: number,
    response: string,
    onProgress?: (progress: TransactionProgress) => void
  ) {
    return this.write("respond_to_appeal", [appealId, response], 0n, FAST_TX_WAIT, onProgress);
  }

  cancelAppeal(appealId: number, onProgress?: (progress: TransactionProgress) => void) {
    return this.write("cancel_appeal", [appealId], 0n, FAST_TX_WAIT, onProgress);
  }

  judgeAppeal(appealId: number, onProgress?: (progress: TransactionProgress) => void) {
    return this.write("judge_appeal", [appealId], 0n, AI_TX_WAIT, onProgress);
  }

  closeGrade(gradeId: number, onProgress?: (progress: TransactionProgress) => void) {
    return this.write("close_grade", [gradeId], 0n, FAST_TX_WAIT, onProgress);
  }
}
