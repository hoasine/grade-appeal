"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { getContractAddress, getStudioUrl, ensureGenLayerNetwork } from "@/lib/genlayer/client";
import {
  GradeAppealClient,
  type TransactionProgress,
} from "@/lib/contracts/GradeAppeal";

export type GradeFilter = "all" | "teaching" | "mine" | "open";

export function useGradeAppealClient() {
  const { address } = useWallet();
  const contract = getContractAddress();
  return useMemo(() => {
    if (!contract) return null;
    return new GradeAppealClient(contract, address, getStudioUrl());
  }, [contract, address]);
}

export function useGrades(filter: GradeFilter = "all") {
  const client = useGradeAppealClient();
  const { address } = useWallet();
  return useQuery({
    queryKey: ["grades", getContractAddress(), filter, address],
    queryFn: async () => {
      if (!client) return [];
      try {
        const list = await client.getAllGrades();
        const sorted = [...list].sort((a, b) => b.id - a.id);
        const me = address?.toLowerCase();
        if (filter === "teaching") {
          if (!me) return [];
          return sorted.filter((g) => g.teacher.toLowerCase() === me);
        }
        if (filter === "mine") {
          if (!me) return [];
          return sorted.filter((g) => g.student.toLowerCase() === me);
        }
        if (filter === "open") {
          return sorted.filter((g) => g.has_open_appeal);
        }
        return sorted;
      } catch (err) {
        // StudioNet rate limits often break board reads; keep previous cache via RQ.
        console.warn("Grade board refresh skipped:", err);
        throw err;
      }
    },
    enabled: !!client,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useGradeAppeals(gradeId: number, enabled = true) {
  const client = useGradeAppealClient();
  return useQuery({
    queryKey: ["grade-appeals", getContractAddress(), gradeId],
    queryFn: () => client!.getGradeAppeals(gradeId),
    enabled: !!client && enabled && gradeId >= 0,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useProtocolConfig() {
  const client = useGradeAppealClient();
  return useQuery({
    queryKey: ["grade-appeal-config", getContractAddress()],
    queryFn: () => client!.getProtocolConfig(),
    enabled: !!client,
    staleTime: 60_000,
  });
}

export function useFairnessLedger() {
  const client = useGradeAppealClient();
  return useQuery({
    queryKey: ["fairness-ledger", getContractAddress()],
    queryFn: () => client!.getFairnessLedger(),
    enabled: !!client,
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: 0,
  });
}

type ProgressInput = { onProgress?: (progress: TransactionProgress) => void };

function useInvalidateGradeData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["grades"] }),
      qc.invalidateQueries({ queryKey: ["grade-appeals"] }),
      qc.invalidateQueries({ queryKey: ["fairness-ledger"] }),
    ]);
}

export function usePublishGrade() {
  const client = useGradeAppealClient();
  const invalidate = useInvalidateGradeData();
  return useMutation({
    mutationFn: async (
      input: {
        student: string;
        courseCode: string;
        assignmentTitle: string;
        score: string;
        maxScore: string;
        rubric: string;
        teacherJustification: string;
        appealWindowSeconds: number;
        stakeWei: bigint;
      } & ProgressInput
    ) => {
      if (!client) throw new Error("Contract address not set");
      await ensureGenLayerNetwork();
      return client.publishGrade(
        input.student,
        input.courseCode,
        input.assignmentTitle,
        input.score,
        input.maxScore,
        input.rubric,
        input.teacherJustification,
        input.appealWindowSeconds,
        input.stakeWei,
        input.onProgress
      );
    },
    onSuccess: invalidate,
  });
}

export function useFileAppeal() {
  const client = useGradeAppealClient();
  const invalidate = useInvalidateGradeData();
  return useMutation({
    mutationFn: async (
      input: {
        gradeId: number;
        reason: string;
        evidence: string;
        proposedScore: string;
        stakeWei: bigint;
      } & ProgressInput
    ) => {
      if (!client) throw new Error("Contract address not set");
      await ensureGenLayerNetwork();
      return client.fileAppeal(
        input.gradeId,
        input.reason,
        input.evidence,
        input.proposedScore,
        input.stakeWei,
        input.onProgress
      );
    },
    onSuccess: invalidate,
  });
}

export function useRespondToAppeal() {
  const client = useGradeAppealClient();
  const invalidate = useInvalidateGradeData();
  return useMutation({
    mutationFn: async (
      input: { appealId: number; response: string } & ProgressInput
    ) => {
      if (!client) throw new Error("Contract address not set");
      await ensureGenLayerNetwork();
      return client.respondToAppeal(input.appealId, input.response, input.onProgress);
    },
    onSuccess: invalidate,
  });
}

export function useCancelAppeal() {
  const client = useGradeAppealClient();
  const invalidate = useInvalidateGradeData();
  return useMutation({
    mutationFn: async ({ appealId, onProgress }: { appealId: number } & ProgressInput) => {
      if (!client) throw new Error("Contract address not set");
      await ensureGenLayerNetwork();
      return client.cancelAppeal(appealId, onProgress);
    },
    onSuccess: invalidate,
  });
}

export function useJudgeAppeal() {
  const client = useGradeAppealClient();
  const invalidate = useInvalidateGradeData();
  return useMutation({
    mutationFn: async ({ appealId, onProgress }: { appealId: number } & ProgressInput) => {
      if (!client) throw new Error("Contract address not set");
      await ensureGenLayerNetwork();
      return client.judgeAppeal(appealId, onProgress);
    },
    onSuccess: invalidate,
  });
}

export function useCloseGrade() {
  const client = useGradeAppealClient();
  const invalidate = useInvalidateGradeData();
  return useMutation({
    mutationFn: async ({ gradeId, onProgress }: { gradeId: number } & ProgressInput) => {
      if (!client) throw new Error("Contract address not set");
      await ensureGenLayerNetwork();
      return client.closeGrade(gradeId, onProgress);
    },
    onSuccess: invalidate,
  });
}
