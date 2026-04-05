"use client";

import { motion } from "framer-motion";
import { ArrowRight, Pickaxe, ShieldCheck, Siren } from "lucide-react";
import Link from "next/link";

import { DetectiveJournal } from "@/components/detective-journal";
import { EvidenceIntake } from "@/components/evidence-intake";
import { HolmesLogo } from "@/components/holmes-logo";
import { useSound } from "@/providers/sound-provider";

export default function SubmissionPage() {
  const { play } = useSound();

  return (
    <main className="px-4 py-10 md:px-8 md:py-14">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto mb-8 w-full max-w-6xl"
      >
        <section className="mc-panel p-5 md:p-7">
          <div className="text-center">
            <p className="pixel-label inline-flex items-center gap-2 bg-[#23354b] px-3 py-1 text-[10px] text-[#d7e8ff]">
              <ShieldCheck className="h-3.5 w-3.5" />
              HOLMES Realm
            </p>

            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{
                duration: 3.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="mx-auto mt-5 w-fit"
            >
              <HolmesLogo size="hero" priority className="mx-auto" />
            </motion.div>

            <h1 className="pixel-title mt-4 text-lg leading-relaxed text-[#eff5ff] md:text-xl">
              HOLMES Craft-Verified News
            </h1>
            <p className="pixel-sub mx-auto mt-3 max-w-3xl text-xl leading-6">
              Mine authenticity clues, smelt context, and forge trustworthy
              conclusions before sharing content.
            </p>
          </div>

          <div className="mt-6 flex justify-center">
            <Link
              href="/results/demo"
              onClick={() => play("click")}
              className="mc-button mc-button-stone inline-flex h-11 items-center gap-2 px-4 text-[10px]"
            >
              <Siren className="h-4 w-4" />
              Preview Chest
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <div className="mt-3 inline-flex items-center gap-2 px-1 text-[#99b0c8]">
          <Pickaxe className="h-4 w-4" />
          <p className="pixel-label text-[10px]">
            Build your evidence recipe below.
          </p>
        </div>
      </motion.div>

      <div className="mx-auto mb-7 w-full max-w-6xl">
        <DetectiveJournal />
      </div>

      <EvidenceIntake />
    </main>
  );
}
