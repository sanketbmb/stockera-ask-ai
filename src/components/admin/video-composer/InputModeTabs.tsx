// Stage 4G APPLY-2 — Input mode tabs (upload / record / external).
import { Upload, Video, Link as LinkIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type InputMode = "upload" | "record" | "external";

interface Props {
  value: InputMode;
  onChange: (m: InputMode) => void;
}

export function InputModeTabs({ value, onChange }: Props) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as InputMode)}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1.5" /> Upload file</TabsTrigger>
        <TabsTrigger value="record"><Video className="h-4 w-4 mr-1.5" /> Record</TabsTrigger>
        <TabsTrigger value="external"><LinkIcon className="h-4 w-4 mr-1.5" /> External link</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export default InputModeTabs;
