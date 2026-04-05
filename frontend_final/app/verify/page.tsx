"use client";

import { LoaderCircle, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";

import { HolmesContentType, isAuthenticated, submitVerification } from "@/lib/api";

type UploadMode = "url" | "file";

const CONTENT_TYPES: HolmesContentType[] = ["text", "image", "video", "audio", "url"];

export default function VerifyPage() {
  const router = useRouter();

  const [contentType, setContentType] = useState<HolmesContentType>("text");
  const [textValue, setTextValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [mediaInputMode, setMediaInputMode] = useState<UploadMode>("url");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  const currentAccept = useMemo(() => {
    if (contentType === "image") {
      return "image/jpeg,image/png,image/webp";
    }
    if (contentType === "video") {
      return "video/mp4,video/webm";
    }
    return "";
  }, [contentType]);

  function resetInputs(nextType: HolmesContentType) {
    setContentType(nextType);
    setTextValue("");
    setUrlValue("");
    setSelectedFile(null);
    setError(null);
    setMediaInputMode("url");
  }

  function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setSelectedFile(nextFile);
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
    const dropped = event.dataTransfer.files?.[0] ?? null;
    setSelectedFile(dropped);
  }

  async function onSubmit() {
    setError(null);
    setIsLoading(true);

    try {
      if (contentType === "text") {
        const content = textValue.trim();
        if (!content) {
          throw new Error("Please paste text content to verify.");
        }
        const result = await submitVerification({ contentType, content });
        router.push(`/result/${result.job_id}`);
        return;
      }

      if (contentType === "url") {
        const content = urlValue.trim();
        if (!content) {
          throw new Error("Please provide a URL to verify.");
        }
        const result = await submitVerification({ contentType, content });
        router.push(`/result/${result.job_id}`);
        return;
      }

      if (contentType === "audio") {
        const content = urlValue.trim();
        if (!content) {
          throw new Error("Please provide an audio URL.");
        }
        const result = await submitVerification({ contentType, content });
        router.push(`/result/${result.job_id}`);
        return;
      }

      if (mediaInputMode === "file") {
        if (!selectedFile) {
          throw new Error("Please choose a file first.");
        }
        const result = await submitVerification({ contentType, file: selectedFile });
        router.push(`/result/${result.job_id}`);
        return;
      }

      const content = urlValue.trim();
      if (!content) {
        throw new Error("Please provide a media URL.");
      }
      const result = await submitVerification({ contentType, content });
      router.push(`/result/${result.job_id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to run verification.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="px-4 py-10 md:px-8 md:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <section className="mc-panel p-5 md:p-7">
          <h1 className="pixel-title text-lg leading-relaxed text-[#eff5ff] md:text-xl">
            Verification Pipeline
          </h1>
          <p className="pixel-sub mt-3 text-xl leading-6">
            Choose content type, provide evidence, and run Holmes analysis.
          </p>

          <div className="mt-6">
            <p className="pixel-label mb-2 text-[10px] text-[#c9d7ea]">
              Content Type
            </p>
            <div className="grid gap-2 sm:grid-cols-5">
              {CONTENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => resetInputs(type)}
                  className={[
                    "mc-button inline-flex items-center justify-center px-3 py-2 text-[10px]",
                    contentType === type ? "mc-button-result text-[#eff5ff]" : "mc-button-stone",
                  ].join(" ")}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <p className="pixel-label mb-2 text-[10px] text-[#c9d7ea]">Content Input</p>

            {contentType === "text" ? (
              <textarea
                rows={5}
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
                placeholder="Paste the text you want to verify..."
                className="w-full resize-none border-2 border-[#0e1218] bg-[#19212b] px-3 py-2 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
              />
            ) : null}

            {contentType === "url" ? (
              <input
                type="url"
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
                placeholder="https://example.com/article"
                className="w-full border-2 border-[#0e1218] bg-[#19212b] px-3 py-3 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
              />
            ) : null}

            {(contentType === "image" || contentType === "video") ? (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMediaInputMode("url");
                      setSelectedFile(null);
                    }}
                    className={[
                      "mc-button inline-flex items-center justify-center px-3 py-2 text-[10px]",
                      mediaInputMode === "url" ? "mc-button-result text-[#eff5ff]" : "mc-button-stone",
                    ].join(" ")}
                  >
                    URL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaInputMode("file");
                      setUrlValue("");
                    }}
                    className={[
                      "mc-button inline-flex items-center justify-center px-3 py-2 text-[10px]",
                      mediaInputMode === "file" ? "mc-button-result text-[#eff5ff]" : "mc-button-stone",
                    ].join(" ")}
                  >
                    Upload file
                  </button>
                </div>

                {mediaInputMode === "url" ? (
                  <input
                    type="url"
                    value={urlValue}
                    onChange={(event) => setUrlValue(event.target.value)}
                    placeholder={
                      contentType === "image"
                        ? "https://example.com/photo.jpg"
                        : "https://example.com/video.mp4"
                    }
                    className="w-full border-2 border-[#0e1218] bg-[#19212b] px-3 py-3 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
                  />
                ) : (
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
                      type="file"
                      accept={currentAccept}
                      onChange={onSelectFile}
                      className="block w-full text-lg text-[#d8e5f6]"
                    />
                    <p className="pixel-sub mt-3 text-lg leading-5">
                      Drag and drop a {contentType} file or use the picker.
                    </p>
                    {selectedFile ? (
                      <p className="mt-2 text-lg text-[#d8e5f6]">Selected: {selectedFile.name}</p>
                    ) : null}
                    <p className="mt-2 inline-flex items-center gap-2 text-lg text-[#9cb1ca]">
                      <UploadCloud className="h-4 w-4" />
                      Accepted: {currentAccept}
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {contentType === "audio" ? (
              <input
                type="url"
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
                placeholder="https://example.com/audio.mp3"
                className="w-full border-2 border-[#0e1218] bg-[#19212b] px-3 py-3 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
              />
            ) : null}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={onSubmit}
              disabled={isLoading}
              className="mc-button mc-button-result inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-[10px] text-[#eff5ff] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {isLoading ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Running verification pipeline...
                </>
              ) : (
                "Analyze Content"
              )}
            </button>

            {error ? (
              <p className="mc-slot mt-3 px-3 py-2 text-lg leading-5 text-[#ff9595]">
                {error}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
