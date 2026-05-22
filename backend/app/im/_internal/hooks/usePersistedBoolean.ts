"use client";
import { useEffect, useRef, useState } from "react";

export function usePersistedBoolean(
  key: string,
  defaultValue: boolean
): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(defaultValue);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "true") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(true);
      }
    } catch {}
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(key, String(value)); } catch {}
  }, [key, value]);

  return [value, setValue];
}
