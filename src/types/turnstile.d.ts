// Cloudflare Turnstile — global window API typing.
// Loaded via async script tag in src/routes/__root.tsx.

export {};

declare global {
  interface TurnstileRenderOptions {
    sitekey: string;
    callback?: (token: string) => void;
    "expired-callback"?: () => void;
    "error-callback"?: () => void;
    "timeout-callback"?: () => void;
    theme?: "light" | "dark" | "auto";
    size?: "normal" | "compact" | "flexible";
    action?: string;
    cData?: string;
    tabindex?: number;
    "response-field"?: boolean;
    retry?: "auto" | "never";
    "refresh-expired"?: "auto" | "manual" | "never";
    appearance?: "always" | "execute" | "interaction-only";
  }

  interface TurnstileAPI {
    render: (
      container: string | HTMLElement,
      options: TurnstileRenderOptions,
    ) => string;
    reset: (widgetId?: string) => void;
    remove: (widgetId?: string) => void;
    getResponse: (widgetId?: string) => string | undefined;
    ready: (cb: () => void) => void;
  }

  interface Window {
    turnstile?: TurnstileAPI;
  }
}
