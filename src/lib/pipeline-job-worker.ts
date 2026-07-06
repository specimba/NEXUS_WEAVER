/**
 * Async pipeline job worker (v5).
 *
 * WHY: The AWS ALB in front of the sandbox cuts HTTP requests at 60s. Modal
 * FLUX.2 cold-start + generation takes 60-90s. The async pattern (POST →
 * jobId → poll) sidesteps the 60s wall entirely.
 */

import { db } from "@/lib/db";
import { runPipeline, type PipelineRunInput, type StageName, type StageProgress, type StageState } from "@/lib/pipeline";

export interface JobStageStatus {
  status: StageState;
  ms?: number;
  message?: string;
}

export interface JobStateSnapshot {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "blocked";
  currentStage: string;
  stages: Record<string, JobStageStatus>;
  generationId: string | null;
  errorMessage: string | null;
  totalMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export async function getJobState(jobId: string): Promise<JobStateSnapshot | null> {
  const job = await db.pipelineJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  let stages: Record<string, JobStageStatus> = {};
  try {
    stages = job.stageStatus ? JSON.parse(job.stageStatus) : {};
  } catch {
    stages = {};
  }
  return {
    id: job.id,
    status: job.status as JobStateSnapshot["status"],
    currentStage: job.currentStage,
    stages,
    generationId: job.generationId,
    errorMessage: job.errorMessage,
    totalMs: job.totalMs,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function startPipelineJob(jobId: string, input: PipelineRunInput, createdAtMs: number): void {
  void runPipelineJob(jobId, input, createdAtMs).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline-job-worker] FATAL for job ${jobId}:`, msg);
    void db.pipelineJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: `Worker crashed: ${msg.slice(0, 300)}`,
        totalMs: Date.now() - createdAtMs,
      },
    }).catch(() => { /* nothing more we can do */ });
  });
}

async function runPipelineJob(jobId: string, input: PipelineRunInput, createdAtMs: number): Promise<void> {
  await db.pipelineJob.update({
    where: { id: jobId },
    data: { status: "running", currentStage: "st3gg" },
  });

  const stages: Record<string, JobStageStatus> = {};

  const persistProgress = async (stage: StageName, p: StageProgress) => {
    stages[stage] = {
      status: p.status,
      ms: p.ms,
      message: p.message,
    };
    const currentStage = p.status === "running" ? stage :
      stage === "output" ? "done" : stage;
    try {
      await db.pipelineJob.update({
        where: { id: jobId },
        data: {
          currentStage,
          stageStatus: JSON.stringify(stages),
        },
      });
    } catch (e) {
      console.error(`[pipeline-job-worker] progress write failed for job ${jobId}:`, e);
    }
  };

  let result;
  try {
    result = await runPipeline(input, persistProgress);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.pipelineJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: `Pipeline threw before returning: ${msg.slice(0, 300)}`,
        totalMs: Date.now() - createdAtMs,
      },
    });
    return;
  }

  const jobStatus: JobStateSnapshot["status"] =
    result.status === "completed" ? "completed" :
    result.status === "blocked" ? "blocked" :
    "failed";

  await db.pipelineJob.update({
    where: { id: jobId },
    data: {
      status: jobStatus,
      generationId: result.id,
      errorMessage: result.errorMessage,
      totalMs: Date.now() - createdAtMs,
      currentStage: result.status === "completed" ? "done" :
        result.status === "blocked" ? "blocked" : "error",
    },
  });
}
