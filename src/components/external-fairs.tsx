import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBannerModel } from "@/components/fair-accreditation";
import { toast } from "sonner";
import { FairAttendees } from "@/components/fair-attendees";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { EXTERNAL_FAIRS, fairsLabel, normalizeFairs } from "@/lib/ethics";

/** Student: "Deseja participar de feiras externas?" — yes opens FETEC/MS and FECINTEC (one or both). */
export function ExternalFairsCard({
  projectId,
  groupId,
  interest,
  fairs,
}: {
  projectId: string;
  groupId: string;
  interest: boolean;
  fairs: string[];
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (next: { interest: boolean; fairs: string[] }) => {
      const { error } = await supabase
        .from("projects")
        .update({ external_fairs_interest: next.interest, external_fairs: normalizeFairs(next.interest, next.fairs) })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card-paper space-y-3 p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Trophy className="size-5 text-highlight-foreground" /> Feiras externas
      </h3>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Deseja participar de feiras externas?</span>
        <Switch
          checked={interest}
          disabled={save.isPending}
          onCheckedChange={(on) => save.mutate({ interest: on, fairs })}
          aria-label="Deseja participar de feiras externas?"
        />
      </label>
      {interest && (
        <div className="space-y-2 rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Escolha uma ou as duas:</p>
          {EXTERNAL_FAIRS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={fairs.includes(f)}
                disabled={save.isPending}
                onCheckedChange={(c) =>
                  save.mutate({ interest: true, fairs: c === true ? [...fairs, f] : fairs.filter((x) => x !== f) })
                }
              />
              {f}
            </label>
          ))}
          {fairs.map((f) => (
            <Button key={`m-${f}`} size="sm" variant="outline" onClick={() => downloadBannerModel(f)}>
              <Download /> Baixar modelo de banner {f}
            </Button>
          ))}
          {fairs.length === 0 && <p className="text-xs text-warning-foreground">Marque pelo menos uma feira.</p>}
          {fairs.length > 0 && <FairAttendees groupId={groupId} />}
        </div>
      )}
    </div>
  );
}

/** Small read-only tag for the teacher's screens. */
export function ExternalFairsTag({ interest, fairs }: { interest: boolean; fairs: string[] }) {
  if (!interest) return null;
  const list = normalizeFairs(true, fairs);
  return (
    <Badge variant="highlight" title={fairsLabel(interest, fairs)}>
      <Trophy className="mr-1 size-3" /> {list.length ? list.join(" + ") : "Feira externa"}
    </Badge>
  );
}
