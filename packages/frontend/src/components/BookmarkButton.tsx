'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

interface BookmarkButtonProps {
  npi: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function BookmarkButton({ npi, className = '', size = 'sm' }: BookmarkButtonProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['saved-status', npi],
    queryFn: () => api.savedProviders.checkStatus(npi),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const isSaved = data?.saved ?? false;

  const saveMutation = useMutation({
    mutationFn: () => api.savedProviders.save(npi),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['saved-status', npi] });
      const previous = queryClient.getQueryData<{ saved: boolean }>(['saved-status', npi]);
      queryClient.setQueryData(['saved-status', npi], { saved: true });
      return { previous };
    },
    onError: (_err: unknown, _vars: void, context: { previous: { saved: boolean } | undefined } | undefined) => {
      queryClient.setQueryData(['saved-status', npi], context?.previous);
      toast.error('Failed to save provider');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-status', npi] });
      queryClient.invalidateQueries({ queryKey: ['saved-providers'] });
    },
    onSuccess: () => {
      toast.success('Provider saved', { id: `save-${npi}`, duration: 2000 });
    },
  });

  const unsaveMutation = useMutation({
    mutationFn: () => api.savedProviders.unsave(npi),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['saved-status', npi] });
      const previous = queryClient.getQueryData<{ saved: boolean }>(['saved-status', npi]);
      queryClient.setQueryData(['saved-status', npi], { saved: false });
      return { previous };
    },
    onError: (_err: unknown, _vars: void, context: { previous: { saved: boolean } | undefined } | undefined) => {
      queryClient.setQueryData(['saved-status', npi], context?.previous);
      toast.error('Failed to remove provider');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-status', npi] });
      queryClient.invalidateQueries({ queryKey: ['saved-providers'] });
    },
    onSuccess: () => {
      toast.success('Provider removed', { id: `unsave-${npi}`, duration: 2000 });
    },
  });

  const isPending = saveMutation.isPending || unsaveMutation.isPending;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!isAuthenticated) {
        router.push('/login');
        return;
      }

      if (isSaved) {
        unsaveMutation.mutate();
      } else {
        saveMutation.mutate();
      }
    },
    [isAuthenticated, isSaved, router, saveMutation, unsaveMutation]
  );

  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const buttonSize = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={isSaved ? 'Remove from saved providers' : 'Save provider'}
      title={isSaved ? 'Remove from saved' : isAuthenticated ? 'Save provider' : 'Sign in to save providers'}
      className={`inline-flex items-center justify-center ${buttonSize} rounded-lg transition-colors disabled:opacity-50 print:hidden ${
        isSaved
          ? 'text-primary-600 dark:text-primary-400 hover:text-red-500 dark:hover:text-red-400'
          : 'text-stone-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-stone-100 dark:hover:bg-gray-700'
      } ${className}`}
    >
      <Bookmark
        className={`${iconSize} ${isSaved ? 'fill-current' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}
