import { useEffect, useState } from "react";

export type DetectedQueryType =
  | "Which Stock to Buy"
  | "Sectorial View"
  | "Educational"
  | "News / Latest"
  | "Live Price"
  | "Should I Average?"
  | "Sell or Hold?"
  | "Set Stop Loss"
  | "Set Target"
  | "Long Term View"
  | "Fresh Entry";

const RULES: { type: DetectedQueryType; keywords: RegExp[] }[] = [
  {
    type: "Which Stock to Buy",
    keywords: [
      /\bwhich stock\b/i,
      /\bwhat (stock|to buy)\b/i,
      /\bbest stock\b/i,
      /\bstock recommendation\b/i,
      /\bwhere (to|should i) invest\b/i,
      /\bgive me a stock\b/i,
      /\bsuggest (a |me )?stock\b/i,
    ],
  },
  {
    type: "Sectorial View",
    keywords: [
      /\b(sector|industry) (view|outlook|future|growth|forecast)?\b/i,
      /\b(it|banking|auto|pharma|fmcg|metal|energy|infra|realty) sector\b/i,
    ],
  },
  {
    type: "Educational",
    keywords: [
      /\bwhat is\b/i,
      /\bexplain\b/i,
      /\bhow does\b/i,
      /\bmeaning of\b/i,
      /\bdifference between\b/i,
      /\bdefine\b/i,
    ],
  },
  {
    type: "News / Latest",
    keywords: [/\b(latest|recent) news\b/i, /\bnews\b/i, /\bwhat happened\b/i, /\btoday'?s\b/i],
  },
  {
    type: "Live Price",
    keywords: [/\b(current|live|now|today'?s) price\b/i, /\b(ltp|last traded price)\b/i],
  },
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
