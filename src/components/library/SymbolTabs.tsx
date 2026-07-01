import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { SymbolLibraryCounts } from "@/types/library-symbol";

type Kind = "all" | "report" | "video" | "community_query";

interface Props {
  counts: SymbolLibraryCounts;
  activeKind: Kind;
  onKindChange: (k: Kind) => void;
}

export function SymbolTabs({ counts, activeKind, onKindChange }: Props) {
  return (
    <div
      className="sticky top-0 z-20 -mx-4 mb-6 border-b border-border bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70"
    >
      <div className="mx-auto w-full max-w-5xl">
        <Tabs value={activeKind} onValueChange={(v) => onKindChange(v as Kind)}>
          <TabsList className="flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="all" className="tab-underline gap-2 transition-colors">
              All <Badge variant="secondary" className="transition-transform group-data-[state=active]:scale-105">{counts.all}</Badge>
            </TabsTrigger>
            <TabsTrigger value="report" className="tab-underline gap-2 transition-colors">
              Reports <Badge variant="secondary">{counts.reports}</Badge>
            </TabsTrigger>
            <TabsTrigger value="video" className="tab-underline gap-2 transition-colors">
              Videos <Badge variant="secondary">{counts.videos}</Badge>
            </TabsTrigger>
            <TabsTrigger value="community_query" className="tab-underline gap-2 transition-colors">
              Questions <Badge variant="secondary">{counts.community}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}

export default SymbolTabs;
