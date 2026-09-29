import { createContext, useContext, useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";

/** What the active week exposes so the top bar can save and load its settings. */
export interface WeekConfigHandle {
  weekId: string;
  getData: () => unknown;
  applyData: (data: unknown) => void;
}

const RegisterContext = createContext<Dispatch<SetStateAction<WeekConfigHandle | null>>>(() => {});

export function WeekConfigProvider({
  setHandle,
  children,
}: {
  setHandle: Dispatch<SetStateAction<WeekConfigHandle | null>>;
  children: ReactNode;
}) {
  return <RegisterContext.Provider value={setHandle}>{children}</RegisterContext.Provider>;
}

/**
 * Called by each week with its current settings (`getData`) and a way to restore saved ones
 * (`applyData`). The latest callbacks are always used, so weeks can pass inline functions.
 */
export function useWeekConfig(weekId: string, getData: () => unknown, applyData: (data: unknown) => void) {
  const register = useContext(RegisterContext);
  const latest = useRef({ getData, applyData });
  latest.current = { getData, applyData };

  useEffect(() => {
    const handle: WeekConfigHandle = {
      weekId,
      getData: () => latest.current.getData(),
      applyData: (data) => latest.current.applyData(data),
    };
    register(handle);
    return () => register((current) => (current === handle ? null : current));
  }, [register, weekId]);
}

/** Merges saved data over the defaults, so configurations saved before a setting existed still load. */
export function withDefaults<T extends object>(defaults: T, data: unknown): T {
  return data && typeof data === "object" ? { ...defaults, ...(data as Partial<T>) } : defaults;
}
