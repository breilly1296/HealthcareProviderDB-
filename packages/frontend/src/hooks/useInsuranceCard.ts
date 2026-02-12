'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import type { InsuranceCardUpdates, ScanResponse } from '@/lib/api';
import type { InsuranceCardExtractionResponse } from '@/types/insurance';

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
    mutationFn: async ({ imageBase64, mimeType: _mimeType }: { imageBase64: string; mimeType: string }): Promise<ScanResponse> => {
      // Step 1: Extract via Next.js API route (frontend server has ANTHROPIC_API_KEY)
      const extractRes = await fetch('/api/insurance-card/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64 }),
      });

      const extraction: InsuranceCardExtractionResponse = await extractRes.json();

      if (!extractRes.ok || !extraction.success || !extraction.data) {
        throw new Error(extraction.userMessage || extraction.error || 'Failed to extract insurance card data');
      }

      // Step 2: Save extracted data to backend
      const saveData: InsuranceCardUpdates = {
        insurance_company: extraction.data.insurance_company,
        plan_name: extraction.data.plan_name,
        plan_type: extraction.data.plan_type,
        provider_network: extraction.data.provider_network,
        network_notes: extraction.data.network_notes,
        subscriber_name: extraction.data.subscriber_name,
        subscriber_id: extraction.data.subscriber_id,
        group_number: extraction.data.group_number,
        effective_date: extraction.data.effective_date,
        copay_pcp: extraction.data.copay_pcp,
        copay_specialist: extraction.data.copay_specialist,
        copay_urgent: extraction.data.copay_urgent,
        copay_er: extraction.data.copay_er,
        deductible_individual: extraction.data.deductible_individual,
        deductible_family: extraction.data.deductible_family,
        oop_max_individual: extraction.data.oop_max_individual,
        oop_max_family: extraction.data.oop_max_family,
        rxbin: extraction.data.rxbin,
        rxpcn: extraction.data.rxpcn,
        rxgrp: extraction.data.rxgrp,
        card_side: extraction.metadata?.cardType ?? null,
        confidence_score: extraction.metadata?.confidenceScore != null
          ? Math.round(extraction.metadata.confidenceScore * 100)
          : null,
      };

      const saveResult = await api.insuranceCard.save(saveData);

      // Return ScanResponse shape for the UI
      return {
        card: saveResult.card,
        extraction: {
          confidence: extraction.metadata?.confidence ?? null,
          confidenceScore: extraction.metadata?.confidenceScore ?? null,
          fieldsExtracted: extraction.metadata?.fieldsExtracted ?? 0,
          totalFields: extraction.metadata?.totalFields ?? 0,
          suggestions: extraction.suggestions ?? [],
        },
      };
    },
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
