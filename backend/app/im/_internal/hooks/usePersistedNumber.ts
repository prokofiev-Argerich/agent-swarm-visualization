"use client";
import { useEffect, useRef, useState } from "react";

export function usePersistedNumber(
  key: string,
  defaultValue: number,
  opts?: { min?: number; max?: number }
): [number, (v: number) => void] {
  const [value, setValue] = useState<number>(defaultValue);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = Number(localStorage.getItem(key) ?? "");
      const min = opts?.min ?? -Infinity;
      const max = opts?.max ?? Infinity;
      if (Number.isFinite(raw) && raw >= min && raw <= max) setValue(raw);
    } catch {}
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(key, String(value)); } catch {}
  }, [key, value]);

  return [value, setValue];
}
