import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const SITE_KEY = "0x4AAAAAAD2UbQUFjR5PF19H";

export interface TurnstileWidgetHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
  className?: string;
}

/**
 * Wraps the Cloudflare Turnstile widget. The script itself is loaded once
 * from the root route head. We poll briefly for `window.turnstile`, render
 * into a stable container, and clean up on unmount.
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget(
    { onVerify, onExpire, onError, theme = "auto", size = "normal", className },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

    // Keep latest callbacks without re-rendering the widget.
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);
    const onErrorRef = useRef(onError);
    useEffect(() => {
      onVerifyRef.current = onVerify;
      onExpireRef.current = onExpire;
      onErrorRef.current = onError;
    }, [onVerify, onExpire, onError]);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          if (widgetIdRef.current && window.turnstile) {
            try {
              window.turnstile.reset(widgetIdRef.current);
            } catch {
              /* noop */
            }
          }
        },
      }),
      [],
    );

    useEffect(() => {
      let cancelled = false;
      let attempts = 0;
      const maxAttempts = 50; // ~5s at 100ms

      const tryRender = () => {
        if (cancelled) return;
        if (!containerRef.current) return;
        if (window.turnstile && typeof window.turnstile.render === "function") {
          try {
            const id = window.turnstile.render(containerRef.current, {
              sitekey: SITE_KEY,
              theme,
              size,
              "refresh-expired": "auto",
              retry: "auto",
              callback: (token: string) => onVerifyRef.current(token),
              "expired-callback": () => {
                onExpireRef.current?.();
                if (widgetIdRef.current && window.turnstile) {
                  try {
                    window.turnstile.reset(widgetIdRef.current);
                  } catch {
                    /* noop */
                  }
                }
              },
              "error-callback": () => onErrorRef.current?.(),
            });
            widgetIdRef.current = id;
            setStatus("ready");
          } catch {
            setStatus("unavailable");
          }
          return;
        }
        attempts += 1;
        if (attempts >= maxAttempts) {
          setStatus("unavailable");
          return;
        }
        window.setTimeout(tryRender, 100);
      };

      tryRender();

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* noop */
          }
          widgetIdRef.current = null;
        }
      };
    }, [theme, size]);

    return (
      <div className={className}>
        <div ref={containerRef} />
        {status === "loading" && (
          <div
            aria-hidden
            className="h-[65px] w-[300px] max-w-full animate-pulse rounded-md bg-muted"
          />
        )}
        {status === "unavailable" && (
          <p className="text-xs text-destructive">
            Security check failed to load. Please refresh the page.
          </p>
        )}
      </div>
    );
  },
);
