import { harmony } from "@harmony/core";
import { applyListDiff, type SpaceSummary } from "@harmony/protocol";
import { useEffect } from "react";
import { proxy, useSnapshot } from "valtio";

const spacesState = proxy({ spaces: [] as SpaceSummary[] });

export function useSpaces() {
  const snap = useSnapshot(spacesState);

  useEffect(() => {
    const unsubscribe = harmony.on("h.spaces.update", ({ spaces }) => {
      for (const diff of spaces) applyListDiff(spacesState.spaces, diff);
    });

    harmony.spaces.subscribe().then(({ spaces }) => {
      spacesState.spaces = spaces;
    });

    return () => {
      unsubscribe();
      harmony.spaces.unsubscribe();
    };
  }, []);

  return snap.spaces;
}
