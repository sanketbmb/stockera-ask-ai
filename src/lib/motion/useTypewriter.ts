import { useEffect, useState } from "react";

/**
 * Shared typewriter hook used by Section A hero demo and Step 1.
 * - `start` gates the animation (e.g. gated on inView or reduced-motion).
 * - `speed` = ms per character (default 32ms).
 * Returns the current typed slice.
 */
export function useTypewriter(text: string, opts: { start?: boolean; speed?: number; cycleKey?: unknown } = {}) {
  const { start = true, speed = 32, cycleKey } = opts;
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!start) {
      setDisplayed("");
      return;
    }
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, start, cycleKey]);

  return displayed;
}
