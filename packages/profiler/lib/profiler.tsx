import { Profiler as ReactProfiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

const FRAME_BUDGET_MS = 8.33;

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration) => {
  if (actualDuration > FRAME_BUDGET_MS) {
    console.warn(
      `[Profiler] ${id} (${phase}) ${actualDuration.toFixed(2)}ms / ${baseDuration.toFixed(2)}ms base — exceeds ${FRAME_BUDGET_MS}ms budget`,
    );
  }
};

export function Profiler({ children }: { children: ReactNode }) {
  return (
    <ReactProfiler id="app" onRender={onRender}>
      {children}
    </ReactProfiler>
  );
}
