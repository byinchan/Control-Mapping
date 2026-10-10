"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ID_INDEX } from "@/lib/catalog/catalogs.ts";
import { loadWorkspace, saveWorkspace } from "@/lib/workflow/storage.ts";
import type { Workspace } from "@/lib/workflow/workspace.ts";

const storage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * The tab's workspace, shared by every screen through sessionStorage. Loaded once on the client
 * (the ref stops React's development double-run from hiding a discard notice) and saved on change.
 */
export function useWorkspace() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [discarded, setDiscarded] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    const loaded = loadWorkspace(storage(), ID_INDEX);
    setWs(loaded.ws);
    setDiscarded(loaded.discarded);
  }, []);

  useEffect(() => {
    if (ws) setStorageOk(saveWorkspace(storage(), ws));
  }, [ws]);

  const change = useCallback((fn: (w: Workspace) => Workspace) => setWs((w) => (w ? fn(w) : w)), []);

  return { ws, setWs, change, discarded, storageOk };
}

/** Synchronous save before navigating, so the next screen reads the latest state. */
export function saveNow(ws: Workspace) {
  saveWorkspace(storage(), ws);
}
