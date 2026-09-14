"use client";

import { useProfile } from "@/context/profile-context";
import { ProfilePicker } from "@/components/profile-picker";
import { GameMenu } from "@/components/game-menu";
import { BrandLoading } from "@/components/brand-loading";

export function HomeClient() {
  const { profile, ready } = useProfile();

  if (!ready) {
    return <BrandLoading />;
  }

  return profile ? <GameMenu /> : <ProfilePicker />;
}
