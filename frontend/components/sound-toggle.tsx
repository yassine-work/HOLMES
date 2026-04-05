"use client";

import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

import { useSound } from "@/providers/sound-provider";

export function SoundToggle() {
  const { enabled, toggle } = useSound();

  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ y: 1 }}
      type="button"
      onClick={toggle}
      className="mc-button mc-button-stone fixed right-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center p-0 text-[#1b2430] md:right-6 md:top-6"
      aria-label={enabled ? "Mute sounds" : "Enable sounds"}
      title={enabled ? "Sound: On" : "Sound: Muted"}
    >
      {enabled ? (
        <Volume2 className="h-4 w-4" />
      ) : (
        <VolumeX className="h-4 w-4" />
      )}
    </motion.button>
  );
}
