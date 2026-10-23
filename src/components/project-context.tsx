"use client";
import { createContext, useCallback, useContext } from "react";
export type ActiveProject = {
  id: string;
  name: string;
  status: string;
  version: number;
  view: Record<string, unknown>;
  organizationId: string;
  actorId: string;
};
const Context = createContext<ActiveProject | null>(null);
export function ProjectProvider({
  project,
  children,
}: {
  project: ActiveProject;
  children: React.ReactNode;
}) {
  return <Context.Provider value={project}>{children}</Context.Provider>;
}
export function useActiveProject() {
  const value = useContext(Context);
  if (!value) throw new Error("Abra um projeto para acessar a rede.");
  return value;
}
export function useProjectFetch() {
  const { id, organizationId } = useActiveProject();
  return useCallback(
    (url: string, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      headers.set("x-project-id", id);
      headers.set("x-organization-id", organizationId);
      return globalThis.fetch(url, { ...options, headers });
    },
    [id, organizationId],
  );
}
export function useProjectRequest() {
  const fetch = useProjectFetch();
  return useCallback(
    async (url: string, body?: unknown, method = body ? "POST" : "GET") => {
      const r = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error ?? "Não foi possível concluir a operação.");
      return data;
    },
    [fetch],
  );
}
