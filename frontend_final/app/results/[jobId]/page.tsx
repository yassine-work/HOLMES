"use client";

import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Axe,
  CheckCircle2,
  Clock4,
  LoaderCircle,
  Pickaxe,
  ShieldCheck,
  Skull,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { upsertJournalEntry } from "@/lib/journal";
import { useSound } from "@/providers/sound-provider";
import { VerdictCard } from "@/components/verdict-card";
import {
  CurrentJobStatus,
  VerificationJobStatusResponse,
  getVerificationJob,
} from "@/lib/api";

type ResultsPageProps = {
  params: {
    jobId: string;
  };
};

const TERMINAL: CurrentJobStatus[] = ["COMPLETED", "FAILED"];

const CRAFT_STEPS: Array<{
  status: CurrentJobStatus;
  label: string;
  icon: typeof Clock4;
  note: string;
}> = [
  {
    status: "PENDING",
    label: "Queued",
    icon: Clock4,
    note: "Evidence recipe queued",
  },
  {
    status: "PROCESSING",
    label: "Processing",
    icon: Pickaxe,
    note: "Signals mined from web and media",
  },
  {
    status: "COMPLETED",
    label: "Complete",
    icon: CheckCircle2,
    note: "Verdict crafted",
  },
  {
    status: "FAILED",
    label: "Failed",
    icon: Skull,
    note: "Craft interrupted",
  },
];

function getProgressIndex(status: CurrentJobStatus): number {
  if (status === "PROCESSING") {
    return 1;
  }
  if (status === "COMPLETED") {
    return 2;
  }
  if (status === "FAILED") {
    return 3;
  }
  return 0;
}

function getStepState(
  stepStatus: CurrentJobStatus,
  currentStatus: CurrentJobStatus,
): { done: boolean; active: boolean } {
  if (currentStatus === "PENDING") {
    return { done: false, active: stepStatus === "PENDING" };
  }

  if (currentStatus === "PROCESSING") {
    return {
      done: stepStatus === "PENDING",
      active: stepStatus === "PROCESSING",
    };
  }

  if (currentStatus === "COMPLETED") {
    return {
      done: stepStatus === "PENDING" || stepStatus === "PROCESSING",
      active: stepStatus === "COMPLETED",
    };
  }

  return {
    done: stepStatus === "PENDING" || stepStatus === "PROCESSING",
    active: stepStatus === "FAILED",
  };
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { play } = useSound();
  const playedCueRef = useRef<string>("");

  const { data, isPending, isError, error } =
    useQuery<VerificationJobStatusResponse>({
      queryKey: ["verification-job", params.jobId],
      queryFn: () => getVerificationJob(params.jobId),
      refetchInterval: (query) => {
        const state = (
          query.state.data as VerificationJobStatusResponse | undefined
        )?.current_status;
        return state && TERMINAL.includes(state) ? false : 2_000;
      },
    });

  const effectiveStatus: CurrentJobStatus = data?.current_status ?? "PENDING";
  const isImmediateCompleted = effectiveStatus === "COMPLETED";
  const displayedSteps = isImmediateCompleted
    ? CRAFT_STEPS.filter((step) => step.status === "COMPLETED")
    : CRAFT_STEPS;
  const progressIndex = getProgressIndex(effectiveStatus);
  const progressPercent = isImmediateCompleted
    ? 100
    : Math.max(10, ((progressIndex + 1) / displayedSteps.length) * 100);

  useEffect(() => {
    if (!data) {
      return;
    }

    upsertJournalEntry({
      jobId: data.job_id,
      currentStatus: data.current_status,
      verdictStatus: data.status,
    });
  }, [data]);

  useEffect(() => {
    if (!data) {
      return;
    }

    const cueKey = `${data.job_id}:${data.current_status}:${data.status ?? "NONE"}`;
    if (cueKey === playedCueRef.current) {
      return;
    }

    if (data.current_status === "COMPLETED") {
      if (data.status === "VERIFIED") {
        play("verified");
      } else if (data.status === "SUSPICIOUS") {
        play("suspicious");
      } else {
        play("inconclusive");
      }
      playedCueRef.current = cueKey;
      return;
    }

    if (data.current_status === "FAILED") {
      play("suspicious");
      playedCueRef.current = cueKey;
    }
  }, [data, play]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <header className="mc-panel mb-6 flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
        <div>
          <p className="pixel-label text-[10px] text-[#96abc2]">
            Investigation Dungeon
          </p>
          <h1 className="pixel-title mt-2 text-lg leading-relaxed text-[#ebf2fb] md:text-xl">
            Case #{params.jobId}
          </h1>
          <p className="pixel-sub mt-2 text-lg leading-5">
            Track crafting progress until HOLMES opens the verdict chest.
          </p>
        </div>
        <Link
          href="/"
          onClick={() => play("click")}
          className="mc-button mc-button-stone inline-flex items-center gap-2 px-4 py-2 text-[10px]"
        >
          <Axe className="h-4 w-4" />
          New Investigation
        </Link>
      </header>

      {isPending ? (
        <section className="mc-panel p-5 md:p-6">
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.25, ease: "linear" }}
            className="status-pulse inline-flex items-center gap-2 text-xl leading-6 text-[#d8e7fb]"
          >
            <LoaderCircle className="h-5 w-5 animate-spin" />
            HOLMES is preparing your crafting station...
          </motion.p>
        </section>
      ) : null}

      {isError ? (
        <section className="mc-panel border-[#331515] bg-[#2a1a1a] p-5 text-[#ffb6b6]">
          <p className="inline-flex items-center gap-2 text-xl leading-6">
            <AlertCircle className="h-5 w-5" />
            Could not retrieve job status.
          </p>
          <p className="mt-2 text-lg leading-5">{error.message}</p>
        </section>
      ) : null}

      {data && !isPending && !isError ? (
        <div className="space-y-5">
          <section className="mc-panel p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="pixel-label inline-flex items-center gap-2 text-[10px] text-[#a0b5cc]">
                <ShieldCheck className="h-4 w-4" />
                Crafting Progress
              </p>
              <span className="mc-chip px-3 py-1 text-xs text-[#d4e4f8]">
                Current: {data.current_status}
              </span>
            </div>

            <div className="mc-crafting-track">
              <motion.div
                className="mc-crafting-fill"
                initial={{ width: "0%" }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>

            <div
              className={[
                "mt-4 grid gap-3",
                displayedSteps.length > 1 ? "md:grid-cols-4" : "md:grid-cols-1",
              ].join(" ")}
            >
              {displayedSteps.map((step, index) => {
                const StepIcon = step.icon;
                const { done: isDone, active: isActive } = getStepState(
                  step.status,
                  effectiveStatus,
                );

                return (
                  <motion.div
                    key={step.status}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={[
                      "mc-step-badge p-3",
                      isDone ? "text-[#d8e9ff]" : "text-[#7f90a5]",
                      isActive ? "mc-status-glow-inconclusive" : "",
                    ].join(" ")}
                  >
                    <p className="pixel-label mb-1 inline-flex items-center gap-2 text-[10px]">
                      <StepIcon className="h-3.5 w-3.5" />
                      {step.label}
                    </p>
                    <p className="text-base leading-5">{step.note}</p>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <VerdictCard result={data} />
        </div>
      ) : null}
    </main>
  );
}
