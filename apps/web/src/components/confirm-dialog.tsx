"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
};

type PendingState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

let pushConfirm: ((opts: PendingState) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (!pushConfirm) {
    // Fallback to window.confirm if provider not mounted (should not happen in app).
    return Promise.resolve(window.confirm(`${opts.title}${opts.description ? "\n\n" + opts.description : ""}`));
  }
  return new Promise((resolve) => {
    pushConfirm!({ ...opts, resolve });
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = React.useState<PendingState | null>(null);

  React.useEffect(() => {
    pushConfirm = (opts) => setPending(opts);
    return () => {
      pushConfirm = null;
    };
  }, []);

  const open = pending !== null;

  function close(result: boolean) {
    if (pending) pending.resolve(result);
    setPending(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.title ?? ""}</DialogTitle>
          {pending?.description && (
            <DialogDescription>{pending.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {pending?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={pending?.variant === "destructive" ? "destructive" : "default"}
            onClick={() => close(true)}
            autoFocus
          >
            {pending?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
