"use client";

import {
  Flame,
  HelpCircle,
  Pickaxe,
  ShieldCheck,
  Skull,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  JournalEntry,
  JOURNAL_UPDATE_EVENT,
  getRecentJournalEntries,
} from "@/lib/journal";
import { useSound } from "@/providers/sound-provider";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getJournalVisual(entry: JournalEntry) {
  if (entry.currentStatus === "FAILED") {
    return {
      label: "Failed",
      icon: Skull,
      className: "text-[#ff8f8f]",
    };
  }

  if (entry.currentStatus === "PENDING") {
    return {
      label: "Queued",
      icon: Timer,
      className: "text-[#8fb8e8]",
    };
  }

  if (entry.currentStatus === "PROCESSING") {
    return {
      label: "Processing",
      icon: Pickaxe,
      className: "text-[#9bd4ff]",
    };
  }

  if (entry.verdictStatus === "VERIFIED") {
    return {
      label: "Verified",
      icon: ShieldCheck,
      className: "text-[#79e286]",
    };
  }

  if (entry.verdictStatus === "SUSPICIOUS") {
    return {
      label: "Suspicious",
      icon: Flame,
      className: "text-[#ff8686]",
    };
  }

  return {
    label: "Inconclusive",
    icon: HelpCircle,
    className: "text-[#8de2e2]",
  };
}

export function DetectiveJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const { play } = useSound();

  useEffect(() => {
    const refresh = () => {
      setEntries(getRecentJournalEntries(3));
    };

    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(JOURNAL_UPDATE_EVENT, refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(JOURNAL_UPDATE_EVENT, refresh);
    };
  }, []);

  const hasEntries = useMemo(() => entries.length > 0, [entries.length]);

  return (
    <section className="mc-panel p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="pixel-label text-[10px] text-[#9db2cb]">
            Detective&apos;s Journal
          </p>
          <h3 className="pixel-title mt-2 text-base text-[#ecf3ff]">
            Recent Investigations
          </h3>
        </div>
        <span className="mc-chip px-2 py-1 text-[10px] text-[#cadcf3]">
          Last 3
        </span>
      </div>

      {hasEntries ? (
        <div className="grid gap-3 md:grid-cols-3">
          {entries.map((entry) => {
            const visual = getJournalVisual(entry);
            const VisualIcon = visual.icon;

            return (
              <Link
                key={entry.jobId}
                href={`/results/${entry.jobId}`}
                onClick={() => play("click")}
                className="mc-slot p-3 transition hover:brightness-110"
              >
                <p className="pixel-label mb-2 text-[10px] text-[#92a6bf]">
                  Case {entry.jobId.slice(0, 8)}
                </p>
                <p
                  className={[
                    "inline-flex items-center gap-2 text-lg",
                    visual.className,
                  ].join(" ")}
                >
                  <VisualIcon className="h-4 w-4" />
                  {visual.label}
                </p>
                <p className="mt-2 text-base text-[#9cb1ca]">
                  Updated {formatTimestamp(entry.updatedAt)}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mc-slot p-4 text-lg text-[#a9bad0]">
          Journal is empty. Start your first investigation to unlock your quest
          log.
        </div>
      )}
    </section>
  );
}
