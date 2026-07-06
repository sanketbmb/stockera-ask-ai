import { Badge } from "@/components/ui/badge";
import { contentTypeMeta } from "@/lib/discover-ranking";

export function DiscoverTypeChip({ contentType }: { contentType: string }) {
  const meta = contentTypeMeta(contentType);
  return (
    <Badge className={`text-[10px] ${meta.accent}`}>{meta.short}</Badge>
  );
}
