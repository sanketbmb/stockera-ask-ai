import { useEffect, useRef, useState } from "react";

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [isLink, setIsLink] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 1024;
    setEnabled(fine);
    if (!fine) return;

    const move = (e: MouseEvent) => {
      if (!dotRef.current) return;
      dotRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    };
    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      setIsLink(!!t?.closest("a, button, [role=button], [data-cursor=link], input, textarea, select"));
    };
    window.addEventListener("mousemove", move, { passive: true });
    window.addEventListener("mouseover", over);
    document.documentElement.style.cursor = "none";
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseover", over);
      document.documentElement.style.cursor = "";
    };
  }, []);

  if (!enabled) return null;
  return <div ref={dotRef} className={`cursor-dot ${isLink ? "is-link" : ""}`} aria-hidden />;
}

export default CustomCursor;
