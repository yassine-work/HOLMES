"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { UserProfile, getAuthToken, getUserProfile } from "@/lib/api";

type UserProfileContextValue = {
  profile: UserProfile | null;
  isPremium: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
};

type UserProfileProviderProps = {
  children: ReactNode;
};

const UserProfileContext = createContext<UserProfileContextValue | undefined>(
  undefined,
);

export function UserProfileProvider({ children }: UserProfileProviderProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshProfile = async () => {
    const token = getAuthToken();
    if (!token) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const nextProfile = await getUserProfile();
      setProfile(nextProfile);
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshProfile();

    const onAuthUpdated = () => {
      void refreshProfile();
    };

    window.addEventListener("holmes-auth-updated", onAuthUpdated);
    window.addEventListener("storage", onAuthUpdated);

    return () => {
      window.removeEventListener("holmes-auth-updated", onAuthUpdated);
      window.removeEventListener("storage", onAuthUpdated);
    };
  }, []);

  const value = useMemo<UserProfileContextValue>(
    () => ({
      profile,
      isPremium: Boolean(profile?.is_premium || profile?.is_admin),
      isAdmin: Boolean(profile?.is_admin),
      isLoading,
      refreshProfile,
    }),
    [profile, isLoading],
  );

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextValue {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error("useUserProfile must be used within UserProfileProvider.");
  }
  return context;
}
