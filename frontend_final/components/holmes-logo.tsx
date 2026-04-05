"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type HolmesLogoProps = {
  size?: "nav" | "hero";
  className?: string;
  priority?: boolean;
};

const FALLBACK_SIZE = {
  nav: { width: 44, height: 44 },
  hero: { width: 200, height: 200 },
};

export function HolmesLogo({
  size = "nav",
  className,
  priority = false,
}: HolmesLogoProps) {
  const [hasError, setHasError] = useState(false);

  const dimensions = FALLBACK_SIZE[size];
  const src = useMemo(
    () => process.env.NEXT_PUBLIC_HOLMES_LOGO_PATH ?? "/holmes-logo.png",
    [],
  );
  const frameClass = [
    "mc-logo-frame grid place-items-center p-1",
    size === "hero"
      ? "h-[160px] w-[160px] md:h-[196px] md:w-[196px]"
      : "h-11 w-11",
    className ?? "",
  ].join(" ");

  if (hasError) {
    return (
      <div className={frameClass}>
        <div className="mc-chip grid place-items-center p-2">
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }, (_, index) => (
              <span
                key={`fallback-logo-${index}`}
                className={[
                  "h-3 w-3",
                  index % 2 === 0 ? "bg-[#7fc2ff]" : "bg-[#314b68]",
                ].join(" ")}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <Image
        src={src}
        alt="HOLMES pixel detective logo"
        width={dimensions.width}
        height={dimensions.height}
        className="pixel-art h-full w-full object-contain"
        priority={priority}
        onError={() => setHasError(true)}
      />
    </div>
  );
}
