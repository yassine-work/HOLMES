import { motion } from "framer-motion";
import {
  AlertTriangle,
  BadgeCheck,
  Flame,
  Heart,
  HelpCircle,
  Link2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { VerificationJobStatusResponse } from "@/lib/api";

type VerdictCardProps = {
  result: VerificationJobStatusResponse;
};

function getStatusVisual(status: VerificationJobStatusResponse["status"]) {
  if (status === "VERIFIED") {
    return {
      label: "Verified",
      item: "Shield of Truth",
      textClass: "text-verdict-verified",
      panelGlow: "mc-status-glow-verified",
      icon: ShieldCheck,
    };
  }

  if (status === "SUSPICIOUS") {
    return {
      label: "Suspicious",
      item: "Cursed Artifact",
      textClass: "text-verdict-suspicious",
      panelGlow: "mc-status-glow-suspicious",
      icon: Flame,
    };
  }

  return {
    label: "Inconclusive",
    item: "Unidentified Relic",
    textClass: "text-verdict-inconclusive",
    panelGlow: "mc-status-glow-inconclusive",
    icon: HelpCircle,
  };
}

function formatUrlLabel(value: string): string {
  try {
    const parsedUrl = new URL(value);
    return `${parsedUrl.hostname}${parsedUrl.pathname === "/" ? "" : parsedUrl.pathname}`;
  } catch {
    return value;
  }
}

export function VerdictCard({ result }: VerdictCardProps) {
  const confidence = Math.max(0, Math.min(100, result.confidence_score ?? 0));
  const visual = getStatusVisual(result.status);
  const StatusIcon = visual.icon;
  const fullHearts = Math.round((confidence / 100) * 5);
  const filledSegments = Math.round((confidence / 100) * 20);
  const isUrlVerdict = Boolean(result.submitted_url);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={["mc-panel p-5 md:p-6", visual.panelGlow].join(" ")}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="pixel-label text-[10px] text-[#93a5bb]">Loot Chest</p>
          <h2 className="pixel-title mt-2 text-lg leading-relaxed text-[#eff4fb] md:text-xl">
            HOLMES Verdict Drop
          </h2>
        </div>
        <span
          className={[
            "mc-chip inline-flex items-center gap-2 px-3 py-1 text-xs",
            visual.textClass,
          ].join(" ")}
        >
          <StatusIcon className="h-4 w-4" />
          {visual.label}
        </span>
      </header>

      <div className="grid gap-5 md:grid-cols-[240px_1fr] md:items-start">
        <div className="mc-slot p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="pixel-label text-[10px] text-[#93a5bb]">Item Found</p>
            <BadgeCheck className="h-4 w-4 text-[#9bc0e9]" />
          </div>

          <div className="mc-chip mb-4 grid h-28 place-items-center text-center">
            <div>
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.8,
                  ease: "easeInOut",
                }}
                className="mx-auto mb-2 grid h-12 w-12 place-items-center border-2 border-[#0c1016] bg-[#1f2833]"
              >
                <StatusIcon
                  className={["h-6 w-6", visual.textClass].join(" ")}
                />
              </motion.div>
              <p className="pixel-label text-[10px] text-[#d2e3f8]">
                {visual.item}
              </p>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between text-[#d6e2f2]">
            <p className="pixel-label text-[10px]">Confidence HP</p>
            <p className="pixel-label text-[10px]">{confidence.toFixed(0)}%</p>
          </div>
          <div className="mb-4 flex gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <Heart
                key={`heart-${index}`}
                className={[
                  "h-5 w-5",
                  index < fullHearts
                    ? "fill-[#ff6262] text-[#ff6262]"
                    : "text-[#4a5565]",
                ].join(" ")}
              />
            ))}
          </div>

          <div className="mc-xp-track">
            {Array.from({ length: 20 }, (_, index) => (
              <span
                key={`xp-${index}`}
                className={[
                  "mc-xp-segment",
                  index < filledSegments ? "is-filled" : "",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        <div className="mc-slot p-4 md:p-5">
          <p className="pixel-label text-[10px] text-[#93a5bb]">Narration</p>
          <p className="mt-3 text-xl leading-6 text-[#e6edf7]">
            {result.reasoning ??
              "HOLMES could not craft a clear story yet. Try adding stronger evidence ingredients."}
          </p>

          {isUrlVerdict && result.submitted_url ? (
            <div className="mt-4 mc-chip p-3">
              <p className="pixel-label text-[10px] text-[#8fa2bb]">URL Rune</p>
              <p className="mt-2 flex items-start gap-2 text-lg leading-5 text-[#d8e5f6]">
                <Link2 className="mt-0.5 h-4 w-4 text-[#9cc8ff]" />
                <span className="break-all">{formatUrlLabel(result.submitted_url)}</span>
              </p>
              {result.analysis_id ? (
                <p className="mt-2 text-base text-[#98aac0]">
                  Analysis ID: {result.analysis_id}
                </p>
              ) : null}
            </div>
          ) : null}

          {result.url_stats ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              {[
                { label: "Malicious", value: result.url_stats.malicious, tone: "text-[#ff8f8f]" },
                { label: "Suspicious", value: result.url_stats.suspicious, tone: "text-[#ffb35f]" },
                { label: "Harmless", value: result.url_stats.harmless, tone: "text-[#8de28f]" },
                { label: "Undetected", value: result.url_stats.undetected, tone: "text-[#8fb8e8]" },
                { label: "Timeout", value: result.url_stats.timeout, tone: "text-[#c7d2de]" },
              ].map((stat) => (
                <div key={stat.label} className="mc-chip p-3 text-center">
                  <p className="pixel-label text-[10px] text-[#8fa2bb]">{stat.label}</p>
                  <p className={[
                    "mt-2 text-lg",
                    stat.tone,
                  ].join(" ")}>{stat.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {result.url_highlights ? (
            <div className="mt-4 mc-chip p-3">
              <p className="pixel-label text-[10px] text-[#8fa2bb]">
                Top Engine Signals
              </p>
              <p className="mt-2 text-lg leading-5 text-[#d8e5f6]">
                {result.url_highlights}
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="mc-chip p-3 text-center">
              <p className="pixel-label text-[10px] text-[#8fa2bb]">
                Authenticity
              </p>
              <p className="mt-2 text-lg text-[#d8e5f5]">Checked</p>
            </div>
            <div className="mc-chip p-3 text-center">
              <p className="pixel-label text-[10px] text-[#8fa2bb]">Context</p>
              <p className="mt-2 text-lg text-[#d8e5f5]">Cross-Matched</p>
            </div>
            <div className="mc-chip p-3 text-center">
              <p className="pixel-label text-[10px] text-[#8fa2bb]">Source</p>
              <p className="mt-2 text-lg text-[#d8e5f5]">Scored</p>
            </div>
          </div>

          {result.status === "SUSPICIOUS" ? (
            <p className="mt-4 inline-flex items-center gap-2 text-lg text-[#ff8f8f]">
              <AlertTriangle className="h-4 w-4" />
              Suspicious pattern detected in evidence signals.
            </p>
          ) : null}

          {isUrlVerdict ? (
            <p className="mt-3 inline-flex items-center gap-2 text-lg text-[#9cc8ff]">
              <ShieldAlert className="h-4 w-4" />
              URL analysis completed with VirusTotal-backed signals.
            </p>
          ) : null}
        </div>
      </div>
    </motion.article>
  );
}
