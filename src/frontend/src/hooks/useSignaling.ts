import { useCallback } from "react";
import type { SignalingState } from "../types";
import { useActor } from "./useActor";

export function useSignaling() {
  const { actor } = useActor();

  const readSignaling = useCallback(
    async (roomCode: string): Promise<SignalingState | null> => {
      if (!actor) return null;
      try {
        const status = await actor.getDeviceStatus();
        if (!status) return null;
        if (status.lastUpdate !== roomCode) return null;
        const parsed = JSON.parse(status.systemHealth) as SignalingState;
        if (parsed.roomCode !== roomCode) return null;
        return parsed;
      } catch {
        return null;
      }
    },
    [actor],
  );

  const writeSignaling = useCallback(
    async (state: SignalingState): Promise<void> => {
      if (!actor) return;
      try {
        await actor.setDeviceStatus(
          BigInt(state.seq),
          BigInt(state.primaryIce.length),
          BigInt(state.secondaryIce.length),
          JSON.stringify(state),
          state.roomCode,
        );
      } catch (e) {
        console.error("Signaling write error:", e);
      }
    },
    [actor],
  );

  const mergeWrite = useCallback(
    async (roomCode: string, patch: Partial<SignalingState>): Promise<void> => {
      if (!actor) return;
      try {
        const current = (await readSignaling(roomCode)) ?? {
          roomCode,
          phase: "waiting" as const,
          primaryOffer: null,
          secondaryAnswer: null,
          primaryIce: [],
          secondaryIce: [],
          seq: 0,
        };
        const merged: SignalingState = {
          ...current,
          ...patch,
          seq: current.seq + 1,
          roomCode,
        };
        await writeSignaling(merged);
      } catch (e) {
        console.error("Merge write error:", e);
      }
    },
    [actor, readSignaling, writeSignaling],
  );

  return { readSignaling, writeSignaling, mergeWrite };
}
