"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

/**
 * SWR hooks for the dashboard. Each keys off a stable string and inherits
 * the 30s revalidation set in providers.tsx. Hooks that require a session
 * accept an `enabled` flag so they pause until the user has signed in.
 */

export function useYields() {
  const { data, error, isLoading, mutate } = useSWR("yields", () => api.yields());
  return { yields: data?.yields ?? [], cachedAt: data?.cachedAt, error, isLoading, mutate };
}

export function useBalance(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "balance" : null,
    () => api.balance(),
  );
  return { balances: data?.balances ?? [], error, isLoading, mutate };
}

export function useRuns(enabled: boolean, limit = 20, offset = 0) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? ["runs", limit, offset] : null,
    () => api.runs(limit, offset),
  );
  return { runs: data?.runs ?? [], error, isLoading, mutate };
}

export function usePolicy(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "policy" : null,
    () => api.getPolicy(),
  );
  return { policy: data?.policy ?? null, error, isLoading, mutate };
}

export function useChatHistory(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "chat" : null,
    () => api.chatHistory(),
  );
  return { messages: data?.messages ?? [], error, isLoading, mutate };
}

export function useProfile() {
  const { data, error, isLoading } = useSWR("profile", () => api.profile());
  return { profile: data ?? null, error, isLoading };
}
