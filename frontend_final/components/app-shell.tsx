"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { NavigationBar } from "@/components/navigation-bar";
import { SoundToggle } from "@/components/sound-toggle";
import { isAuthenticated } from "@/lib/api";

type AppShellProps = {
  children: ReactNode;
};

function isPublicAuthRoute(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register";
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setAuthed(isAuthenticated());
      setReady(true);
    };

    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("holmes-auth-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("holmes-auth-updated", refresh);
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const isAuthRoute = isPublicAuthRoute(pathname);

    if (!authed && !isAuthRoute) {
      router.replace("/login");
      return;
    }

    if (authed && isAuthRoute) {
      router.replace("/verify");
    }
  }, [authed, pathname, ready, router]);

  if (!ready) {
    return null;
  }

  const isAuthRoute = isPublicAuthRoute(pathname);

  if (!authed && !isAuthRoute) {
    return null;
  }

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <NavigationBar />
      <SoundToggle />
      {children}
    </>
  );
}
