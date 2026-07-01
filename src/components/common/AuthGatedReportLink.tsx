import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import type { ReactNode, MouseEvent } from "react";

const PUBLIC_DEMO_REPORT_IDS = new Set<string>([]);

interface Props {
  queryId: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  preload?: "intent" | false;
  search?: Record<string, unknown>;
  hash?: string;
}

export function AuthGatedReportLink({
  queryId,
  className,
  children,
  preload = "intent",
  search,
  hash,
  ...rest
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!user && !PUBLIC_DEMO_REPORT_IDS.has(queryId)) {
      e.preventDefault();
      navigate({ to: "/login", search: { redirect: `/report/${queryId}` } as never });
    }
  };

  return (
    <Link
      to="/report/$queryId"
      params={{ queryId }}
      preload={preload}
      search={search as never}
      hash={hash}
      className={className}
      onClick={handleClick}
      aria-label={rest["aria-label"]}
    >
      {children}
    </Link>
  );
}
