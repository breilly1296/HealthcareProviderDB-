'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import type { InsuranceCardUpdates } from '@/lib/api';

// ============================================================================
// Query Keys
// ============================================================================

const insuranceCardKeys = {
  all: ['insurance-card'] as const,
};

// ============================================================================
// Hook
// ============================================================================

export function useInsuranceCard() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // ── Query ────────────────────────────────────────────────────────────

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: insuranceCardKeys.all,
    queryFn: async () => {
      const result = await api.insuranceCard.get();
      return result.card;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const card = data ?? null;

  // ── Scan Mutation ────────────────────────────────────────────────────

  const scanMutation = useMutation({
    mutationFn: ({ imageBase64, mimeType }: { imageBase64: string; mimeType: string }) =>
      api.insuranceCard.scan(imageBase64, mimeType),
    onSuccess: (result) => {
      queryClient.setQueryData(insuranceCardKeys.all, result.card);
      toast.success('Insurance card saved to your profile');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to scan insurance card');
    },
  });

  // ── Update Mutation ──────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: (updates: InsuranceCardUpdates) =>
      api.insuranceCard.update(updates),
    onSuccess: (result) => {
      queryClient.setQueryData(insuranceCardKeys.all, result.card);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update insurance card');
    },
  });

  // ── Delete Mutation ──────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: () => api.insuranceCard.delete(),
    onSuccess: () => {
      queryClient.setQueryData(insuranceCardKeys.all, null);
      toast.success('Insurance card removed');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete insurance card');
    },
  });

  // ── Return ───────────────────────────────────────────────────────────

  return {
    card,
    hasCard: card !== null,
    isLoading,
    error,

    scan: scanMutation.mutate,
    scanAsync: scanMutation.mutateAsync,
    isScanning: scanMutation.isPending,

    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,

    deleteCard: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}

export default useInsuranceCard;
