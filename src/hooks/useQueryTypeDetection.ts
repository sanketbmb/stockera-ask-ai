import { useEffect, useState } from "react";

export type DetectedQueryType =
  | "Should I Average?"
  | "Sell or Hold?"
  | "Set Stop Loss"
  | "Set Target"
  | "Long Term View"
  | "Fresh Entry";

const RULES: { type: DetectedQueryType; keywords: RegExp[] }[] = [
  {
    type: "Should I Average?",
    keywords: [/\baveraging?\b/i, /\bbuy more\b/i, /\bdouble down\b/i, /\baverage\b/i],
  },
  {
    type: "Sell or Hold?",
    keywords: [/\bsell\b/i, /\bexit\b/i, /\bbook profit\b/i, /\bget out\b/i],
  },
  {
    type: "Set Stop Loss",
    keywords: [/\bstop[\s-]?loss\b/i, /\bSL\b/, /\bstoploss\b/i],
  },
  {
    type: "Set Target",
    keywords: [/\btarget\b/i, /\bTP\b/],
  },
  {
    type: "Long Term View",
    keywords: [/\blong[\s-]?term\b/i, /\b\d{1,2}\s*year(s)?\b/i, /\b10\s*year\b/i],
  },
  {
    type: "Fresh Entry",
    keywords: [/\bfresh entry\b/i, /\bshould i buy\b/i, /\bentry point\b/i],
  },
];

export function useQueryTypeDetection(text: string, delay = 500) {
  const [detected, setDetected] = useState<DetectedQueryType | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = text.trim();
      if (trimmed.length < 6) {
        setDetected(null);
        return;
      }
      for (const rule of RULES) {
        if (rule.keywords.some((k) => k.test(trimmed))) {
          setDetected(rule.type);
          return;
        }
      }
      setDetected(null);
    }, delay);
    return () => window.clearTimeout(handle);
  }, [text, delay]);

  return detected;
}

export default useQueryTypeDetection;
