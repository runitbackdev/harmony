import { useCallback, useRef, type Ref, type RefCallback } from "react";

export function useMergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  const refsRef = useRef(refs);
  refsRef.current = refs;

  return useCallback((value: T | null) => {
    for (const ref of refsRef.current) {
      if (typeof ref === "function") ref(value);
      else if (ref != null) (ref as { current: T | null }).current = value;
    }
  }, []);
}
