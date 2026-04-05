"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { NavigationBar } from "@/components/navigation-bar";
import { SoundToggle } from "@/components/sound-toggle";
import { isAuthenticated } from "@/lib/api";

type AppShellProps = {
  children: ReactNode;
};

function isAuthRoute(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register";
}

function isPublicRoute(pathname: string): boolean {
  return isAuthRoute(pathname) || pathname === "/pricing";
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

    const authRoute = isAuthRoute(pathname);
    const publicRoute = isPublicRoute(pathname);

    if (!authed && !publicRoute) {
      router.replace("/login");
      return;
    }

    if (authed && authRoute) {
      router.replace("/verify");
    }
  }, [authed, pathname, ready, router]);

  if (!ready) {
    return null;
  }

  const publicRoute = isPublicRoute(pathname);

  if (!authed && !publicRoute) {
    return null;
  }

  if (publicRoute) {
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
