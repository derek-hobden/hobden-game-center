"use client";

import { useProfile } from "@/context/profile-context";
import { ProfilePicker } from "@/components/profile-picker";
import { GameMenu } from "@/components/game-menu";

export function HomeClient() {
  const { profile, ready } = useProfile();

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p className="brand-mark text-3xl font-black">Hobden Game Center</p>
      </div>
    );
  }

  return profile ? <GameMenu /> : <ProfilePicker />;
}
