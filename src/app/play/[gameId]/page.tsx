import type { Metadata } from "next";
import { GameShell } from "@/components/game-shell";
import { getGame } from "@/lib/game-registry";

type PageProps = {
  params: Promise<{ gameId: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { gameId } = await params;
  const game = getGame(gameId);
  return {
    title: game?.title ?? "Game",
  };
}

export default async function PlayPage({ params }: PageProps) {
  const { gameId } = await params;
  return <GameShell key={gameId} gameId={gameId} />;
}
