"use client";

import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import {
  AlertCircle,
  FileSearch,
  Link2,
  Package,
  Pickaxe,
  ScrollText,
  ShieldEllipsis,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createVerificationJob } from "@/lib/api";
import { upsertJournalEntry } from "@/lib/journal";
import { useSound } from "@/providers/sound-provider";

export function EvidenceIntake() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { play } = useSound();

  const [draftInput, setDraftInput] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: () =>
      createVerificationJob({
        input: draftInput,
        url: draftUrl,
        file: selectedFile,
      }),
    onSuccess: ({ job_id, current_status }) => {
      upsertJournalEntry({
        jobId: job_id,
        currentStatus: current_status,
        verdictStatus: null,
      });
      router.push(`/results/${job_id}`);
    },
  });

  const canSubmit = useMemo(() => {
    return Boolean(draftInput.trim() || draftUrl.trim() || selectedFile);
  }, [draftInput, draftUrl, selectedFile]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [selectedFile]);

  function onFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    if (nextFile) {
      setSelectedFile(nextFile);
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      setSelectedFile(droppedFile);
    }
  }

  async function onSubmit() {
    if (!canSubmit || submitMutation.isPending) {
      return;
    }

    play("start");
    await submitMutation.mutateAsync();
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mc-panel mx-auto w-full max-w-6xl p-5 md:p-7"
    >
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="pixel-label inline-flex items-center gap-2 bg-[#223043] px-3 py-1 text-[10px] text-[#d3e6ff]">
            <ShieldEllipsis className="h-3.5 w-3.5" />
            Crafting Table
          </p>
          <h2 className="pixel-title mt-3 text-lg leading-relaxed text-[#f4f8ff] md:text-xl">
            Build Your Evidence Recipe
          </h2>
          <p className="pixel-sub mt-3 max-w-3xl text-xl leading-6">
            Drop image proof, paste a link, or write a claim. HOLMES crafts a
            verdict from authenticity, context, and credibility ingredients.
          </p>
        </div>

        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ y: 1 }}
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitMutation.isPending}
          className="mc-button mc-button-result inline-flex h-14 min-w-[220px] items-center justify-center gap-2 px-5 text-xs text-[#eff5ff] disabled:cursor-not-allowed disabled:opacity-65"
        >
          <FileSearch className="h-4 w-4" />
          {submitMutation.isPending ? "Crafting Verdict..." : "Craft Verdict"}
        </motion.button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <div className="mc-slot p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="pixel-label inline-flex items-center gap-2 text-[10px] text-[#c9d7ea]">
                <ScrollText className="h-4 w-4" />
                Ingredient A: Claim Scroll
              </p>
              <span className="mc-chip px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[#b9cbe3]">
                Text Rune
              </span>
            </div>
            <label htmlFor="evidence-input" className="sr-only">
              Evidence text input
            </label>
            <textarea
              id="evidence-input"
              value={draftInput}
              onChange={(event) => setDraftInput(event.target.value)}
              placeholder="This image was taken today in Casablanca or a short claim to verify"
              rows={8}
              className="w-full resize-none border-2 border-[#0e1218] bg-[#19212b] px-3 py-2 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
            />
            <p className="pixel-sub mt-3 text-lg leading-5">
              Use this for claims, quotes, or context notes.
            </p>
          </div>

          <div className="mc-slot p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="pixel-label inline-flex items-center gap-2 text-[10px] text-[#c9d7ea]">
                <Link2 className="h-4 w-4" />
                Ingredient B: URL Rune
              </p>
              <span className="mc-chip px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[#b9cbe3]">
                URL Detector
              </span>
            </div>
            <label htmlFor="url-input" className="sr-only">
              Evidence URL input
            </label>
            <input
              id="url-input"
              type="url"
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              placeholder="https://example.com/article"
              className="w-full border-2 border-[#0e1218] bg-[#19212b] px-3 py-3 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
            />
            <p className="pixel-sub mt-3 text-lg leading-5">
              When filled, HOLMES checks the URL against VirusTotal and uses the
              URL result.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={[
              "mc-slot p-4",
              isDragActive ? "mc-slot-active" : "",
            ].join(" ")}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={onFileSelect}
              className="hidden"
            />

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="pixel-label inline-flex items-center gap-2 text-[10px] text-[#c9d7ea]">
                <UploadCloud className="h-4 w-4" />
                Ingredient C: Media Proof
              </p>
              <button
                type="button"
                onClick={() => {
                  play("click");
                  fileInputRef.current?.click();
                }}
                className="mc-button mc-button-stone px-3 py-1 text-[10px]"
              >
                Select File
              </button>
            </div>

            {selectedFile ? (
              <div className="space-y-3">
                <div className="mc-chip flex items-center justify-between gap-3 px-3 py-2 text-lg leading-5 text-[#d8e5f6]">
                  <div className="min-w-0">
                    <p className="truncate">{selectedFile.name}</p>
                    <p className="text-base text-[#9fb1c7]">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      play("click");
                      setSelectedFile(null);
                    }}
                    className="mc-button mc-button-stone p-1"
                    aria-label="Remove selected file"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>

                {previewUrl && selectedFile.type.startsWith("image/") ? (
                  <div className="mc-chip overflow-hidden p-1">
                    <Image
                      src={previewUrl}
                      alt="Selected evidence preview"
                      width={1200}
                      height={720}
                      unoptimized
                      className="max-h-56 w-full object-contain"
                    />
                  </div>
                ) : null}

                {previewUrl && selectedFile.type.startsWith("video/") ? (
                  <div className="mc-chip overflow-hidden p-1">
                    <video
                      src={previewUrl}
                      controls
                      muted
                      className="max-h-56 w-full"
                    >
                      Your browser does not support video preview.
                    </video>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="pixel-sub text-lg leading-5">
                Drag image or video evidence here to place it in your recipe.
              </p>
            )}
          </div>

          <div className="mc-slot p-4">
            <p className="pixel-label mb-3 inline-flex items-center gap-2 text-[10px] text-[#c9d7ea]">
              <Package className="h-4 w-4" />
              Recipe Preview
            </p>

            <div className="grid grid-cols-[1fr_auto] items-center gap-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: draftInput.trim() ? "Claim Loaded" : "Claim Slot",
                    active: Boolean(draftInput.trim()),
                    icon: Link2,
                  },
                  {
                    label: draftUrl.trim() ? "URL Loaded" : "URL Slot",
                    active: Boolean(draftUrl.trim()),
                    icon: Link2,
                  },
                  {
                    label: selectedFile ? "Media Loaded" : "Media Slot",
                    active: Boolean(selectedFile),
                    icon: UploadCloud,
                  },
                  {
                    label: "Authenticity",
                    active: canSubmit,
                    icon: ShieldEllipsis,
                  },
                  { label: "Source Trust", active: canSubmit, icon: Pickaxe },
                  { label: "Cross-check", active: canSubmit, icon: FileSearch },
                  { label: "", active: false, icon: Package },
                  { label: "", active: false, icon: Package },
                  { label: "", active: false, icon: Package },
                ].map((slot, index) => {
                  const SlotIcon = slot.icon;
                  return (
                    <motion.div
                      key={`${slot.label}-${index}`}
                      initial={{ scale: 0.95, opacity: 0.7 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.18, delay: index * 0.02 }}
                      className={[
                        "mc-chip grid h-16 place-items-center px-1 text-center text-[10px] uppercase tracking-[0.06em]",
                        slot.active ? "text-[#d9ecff]" : "text-[#7d8999]",
                      ].join(" ")}
                    >
                      <div>
                        <SlotIcon className="mx-auto mb-1 h-3.5 w-3.5" />
                        {slot.label || "Empty"}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="space-y-2 text-center">
                <p className="pixel-label text-[10px] text-[#9fb1c7]">Output</p>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={onSubmit}
                  disabled={!canSubmit || submitMutation.isPending}
                  className="mc-button mc-button-result grid h-20 w-32 place-items-center px-2 text-[9px] leading-none tracking-[0.03em] disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <FileSearch className="mb-1 h-5 w-5" />
                  {submitMutation.isPending ? "Crafting" : "Investigate"}
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {submitMutation.error ? (
        <p className="mc-slot mt-5 inline-flex items-center gap-2 px-3 py-2 text-lg leading-5 text-[#ff9595]">
          <AlertCircle className="h-4 w-4" />
          {submitMutation.error.message}
        </p>
      ) : null}
    </motion.section>
  );
}
