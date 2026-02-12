'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function InsuranceAuthRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/dashboard/insurance');
    }
  }, [isLoading, isAuthenticated, router]);

  // While loading or redirecting, render nothing
  if (isLoading || isAuthenticated) return null;

  // CTA for unauthenticated users
  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-6 h-6 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Save your card to your profile
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Sign in to save your insurance card data securely and access it anytime.
            </p>
          </div>
          <Link
            href="/login?redirect=/dashboard/insurance"
            className="btn-primary whitespace-nowrap"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
