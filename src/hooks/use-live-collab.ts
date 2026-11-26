import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type LivePeer = { userId: string; name: string; field: string | null };

/** Live co-editing for one group: presence (who is online / in which field) + broadcast of typed values. */
export function useLiveCollab(
  groupId: string,
  me: { id: string; name: string } | null,
  onRemote: (field: string, value: unknown) => void,
) {
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const chan = useRef<RealtimeChannel | null>(null);
  const field = useRef<string | null>(null);
  const remote = useRef(onRemote);
  remote.current = onRemote;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel(`group-live:${groupId}`, {
      config: { private: true, presence: { key: me.id }, broadcast: { self: false } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<LivePeer>();
        setPeers(
          Object.values(state)
            .map((list) => list[list.length - 1])
            .filter((p): p is LivePeer & { presence_ref: string } => !!p && p.userId !== me.id),
        );
      })
      .on("broadcast", { event: "edit" }, ({ payload }) => {
        const p = payload as { field?: string; value?: unknown };
        if (p.field) remote.current(p.field, p.value);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ userId: me.id, name: me.name, field: field.current });
      });
    chan.current = channel;
    const t = timers.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
      chan.current = null;
      supabase.removeChannel(channel);
    };
  }, [groupId, me?.id, me?.name]);

  const focus = useCallback(
    (f: string | null) => {
      field.current = f;
      if (me) void chan.current?.track({ userId: me.id, name: me.name, field: f });
    },
    [me],
  );

  /** Send a field value to the other members (throttled ~150ms per field). */
  const send = useCallback((f: string, value: unknown) => {
    clearTimeout(timers.current[f]);
    timers.current[f] = setTimeout(() => {
      void chan.current?.send({ type: "broadcast", event: "edit", payload: { field: f, value } });
    }, 150);
  }, []);

  const editingBy = useCallback((f: string) => peers.find((p) => p.field === f) ?? null, [peers]);

  return { peers, focus, send, editingBy };
}
