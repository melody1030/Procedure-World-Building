import { useEffect, useRef } from "react";
import type { DependencyList } from "react";

export function useDebouncedEffect(effect: () => void, deps: DependencyList, delayMs: number): void {
  const timeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      effect();
      timeoutRef.current = null;
    }, delayMs);
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
