import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ListOrdered, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { waLink } from "@/lib/reminders";

export type QueueMessage = { id: string; name: string; detail: string; phone: string; text: string };

export function WhatsappSendQueue({ messages, disabled = false }: { messages: QueueMessage[]; disabled?: boolean }) {
  const [queue, setQueue] = useState<QueueMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const current = queue[index];
  return (
    <>
      <Button variant="outline" disabled={disabled || messages.length === 0} onClick={() => {
        setQueue(messages.map((m) => ({ ...m })));
        setIndex(0);
        setConfirmed(new Set());
        setOpen(true);
      }}><ListOrdered /> Fila de envio rápido ({messages.length})</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fila de envio gratuito</DialogTitle>
            <DialogDescription>Envie no seu WhatsApp e confirme aqui. Abrir a conversa não confirma o envio nem a entrega.</DialogDescription>
          </DialogHeader>
          {current && <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
              <span>Aluno {index + 1} de {queue.length}</span>
              <span>{confirmed.size} envio(s) confirmado(s) por você</span>
            </div>
            <div>
              <p className="break-words text-lg font-semibold">{current.name}</p>
              <p className="break-words text-sm text-muted-foreground">{current.detail}</p>
            </div>
            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-sm">{current.text}</p>
            <Button asChild className="w-full"><a href={waLink(current.phone, current.text)} target="_blank" rel="noopener noreferrer"><MessageCircle /> Abrir no WhatsApp</a></Button>
            <Button variant={confirmed.has(current.id) ? "secondary" : "outline"} className="h-auto min-h-9 w-full whitespace-normal" disabled={confirmed.has(current.id)} onClick={() => {
              setConfirmed((prev) => new Set([...prev, current.id]));
              if (index < queue.length - 1) setIndex(index + 1);
            }}><Check /> {confirmed.has(current.id) ? "Envio confirmado por você" : "Já enviei — avançar para o próximo"}</Button>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft /> Anterior</Button>
              <Button variant="ghost" disabled={index >= queue.length - 1} onClick={() => setIndex(index + 1)}>Próximo <ArrowRight /></Button>
            </div>
            {confirmed.size === queue.length && <p className="text-sm font-medium text-success">Fila concluída: você confirmou todos os envios.</p>}
            <p className="text-xs text-muted-foreground">O progresso desta fila vale só enquanto esta página estiver aberta. Iniciar outra fila reinicia as confirmações.</p>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}