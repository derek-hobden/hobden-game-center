"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PROFILE_STORAGE_KEY,
  PROFILES,
  type ProfileId,
  type ProfileTheme,
} from "@/lib/profiles";

type ProfileContextValue = {
  profileId: ProfileId | null;
  profile: ProfileTheme | null;
  ready: boolean;
  setProfile: (id: ProfileId) => void;
  clearProfile: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function applyTheme(profile: ProfileTheme | null) {
  const root = document.documentElement;
  if (!profile) {
    root.removeAttribute("data-profile");
    return;
  }
  root.setAttribute("data-profile", profile.id);
  root.style.setProperty("--accent", profile.accent);
  root.style.setProperty("--accent-fg", profile.accentFg);
  root.style.setProperty("--ink", profile.ink);
  root.style.setProperty("--surface", profile.surface);
  root.style.setProperty("--surface-2", profile.surface2);
  root.style.setProperty("--sky-from", profile.skyFrom);
  root.style.setProperty("--sky-to", profile.skyTo);
  root.style.setProperty("--tile-glow", profile.tileGlow);
  root.style.setProperty("--pattern", profile.pattern);
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profileId, setProfileId] = useState<ProfileId | null>(null);
  const [ready, setReady] = useState(false);

  // localStorage is only readable after hydration, so the saved profile has
  // to be applied from an effect (server render always starts "not ready").
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (saved === "keira" || saved === "luke") {
      setProfileId(saved);
      applyTheme(PROFILES[saved]);
    }
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setProfile = useCallback((id: ProfileId) => {
    setProfileId(id);
    window.localStorage.setItem(PROFILE_STORAGE_KEY, id);
    applyTheme(PROFILES[id]);
  }, []);

  const clearProfile = useCallback(() => {
    setProfileId(null);
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    applyTheme(null);
  }, []);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profileId,
      profile: profileId ? PROFILES[profileId] : null,
      ready,
      setProfile,
      clearProfile,
    }),
    [profileId, ready, setProfile, clearProfile],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
