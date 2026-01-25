# Error Handling & Loading States Guide

This guide explains how to use the comprehensive error handling and loading state components added to the application.

## 📦 Installation

### Step 1: Install react-hot-toast

```bash
cd packages/frontend
npm install react-hot-toast
```

### Step 2: Add ToastProvider to Root Layout

Edit `packages/frontend/src/app/layout.tsx` and add the ToastProvider:

```tsx
import ToastProvider from '@/components/ToastProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider />
        {children}
      </body>
    </html>
  );
}
```

## 🎯 Components Overview

### 1. ErrorMessage Component

Location: `packages/frontend/src/components/ErrorMessage.tsx`

**Variants:**
- `search` - No results found
- `network` - Connection error
- `server` - Server error
- `not-found` - Resource not found
- `validation` - Form validation error

**Usage:**

```tsx
import ErrorMessage from '@/components/ErrorMessage';

// Basic usage
<ErrorMessage
  variant="network"
  message="Unable to connect to the server."
/>

// With action button
<ErrorMessage
  variant="server"
  message="Something went wrong."
  action={{
    label: 'Try Again',
    onClick: () => refetch()
  }}
/>

// With custom children
<ErrorMessage variant="not-found" message="Provider not found.">
  <Link href="/search" className="btn-primary">
    Back to Search
  </Link>
</ErrorMessage>
```

**Inline Error (for forms):**

```tsx
import { InlineError } from '@/components/ErrorMessage';

{error && <InlineError message={error} className="mb-4" />}
```

### 2. LoadingSpinner Component

Location: `packages/frontend/src/components/LoadingSpinner.tsx`

**Sizes:** `sm`, `md`, `lg`, `xl`
**Variants:** `primary`, `white`, `gray`

**Usage:**

```tsx
import LoadingSpinner, { ButtonSpinner, LoadingSection, LoadingOverlay } from '@/components/LoadingSpinner';

// Basic spinner
<LoadingSpinner size="lg" text="Loading..." />

// Full page loading
<LoadingSpinner size="xl" text="Loading..." fullPage />

// Button spinner
<button disabled={loading}>
  {loading ? <ButtonSpinner text="Saving..." /> : 'Save'}
</button>

// Section loading
<LoadingSection text="Loading providers..." />

// Loading overlay
<LoadingOverlay show={isLoading} text="Processing..." />
```

### 3. ProviderCardSkeleton Component

Location: `packages/frontend/src/components/ProviderCardSkeleton.tsx`

**Usage:**

```tsx
import ProviderCardSkeleton, { ProviderDetailSkeleton, ProviderCardSkeletonCompact } from '@/components/ProviderCardSkeleton';

// Search results loading
{loading && <ProviderCardSkeleton count={3} />}

// Provider detail page loading
{loading && <ProviderDetailSkeleton />}

// Compact list loading
{loading && <ProviderCardSkeletonCompact count={2} />}
```

## 🔥 Toast Notifications

### Usage with react-hot-toast

```tsx
import toast from 'react-hot-toast';

// Success toast
toast.success('Verification submitted successfully!');

// Error toast
toast.error('Failed to submit verification. Please try again.');

// Loading toast
const toastId = toast.loading('Submitting...');
// Later...
toast.success('Done!', { id: toastId }); // Update the same toast

// Promise-based toast
const promise = fetch('/api/verifications', {...});
toast.promise(promise, {
  loading: 'Submitting verification...',
  success: 'Verification submitted successfully!',
  error: 'Failed to submit verification.',
});

// Custom duration
toast.success('Quick message', { duration: 2000 });

// Dismiss a toast
toast.dismiss(toastId);

// Dismiss all toasts
toast.dismiss();
```

## 📝 Implementation Examples

### Search Page Pattern

```tsx
'use client';

import { useState, useEffect } from 'react';
import ProviderCardSkeleton from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';

export default function SearchPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; type: 'network' | 'server' } | null>(null);
  const [results, setResults] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/search');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setResults(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      const isNetwork = message.includes('network') || message.includes('fetch');
      setError({ message, type: isNetwork ? 'network' : 'server' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ProviderCardSkeleton count={3} />;

  if (error) {
    return (
      <ErrorMessage
        variant={error.type}
        message={error.message}
        action={{ label: 'Try Again', onClick: fetchData }}
      />
    );
  }

  if (results.length === 0) {
    return <ErrorMessage variant="search" message="No results found." />;
  }

  return <div>{/* Render results */}</div>;
}
```

### Form Submission Pattern

```tsx
'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ButtonSpinner } from '@/components/LoadingSpinner';
import { InlineError } from '@/components/ErrorMessage';

export default function MyForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /* data */ }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Submission failed');
      }

      toast.success('Submitted successfully!');
      // Handle success...
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <InlineError message={error} className="mb-4" />}

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-primary disabled:opacity-50"
      >
        {isSubmitting ? <ButtonSpinner text="Submitting..." /> : 'Submit'}
      </button>

      {error && !isSubmitting && (
        <button
          type="button"
          onClick={handleSubmit}
          className="text-primary-600 hover:text-primary-700 text-sm"
        >
          Try again
        </button>
      )}
    </form>
  );
}
```

### Detail Page Pattern

```tsx
'use client';

import { useState, useEffect } from 'react';
import { ProviderDetailSkeleton } from '@/components/ProviderCardSkeleton';
import ErrorMessage from '@/components/ErrorMessage';

export default function DetailPage({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; type: 'network' | 'server' | 'not-found' } | null>(null);
  const [data, setData] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/items/${id}`);

      if (response.status === 404) {
        throw new Error('not-found:Item not found');
      }

      if (!response.ok) {
        throw new Error('Failed to load item');
      }

      const data = await response.json();
      setData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      const isNotFound = message.includes('not-found:');
      const isNetwork = message.includes('network') || message.includes('fetch');

      setError({
        message: message.replace('not-found:', ''),
        type: isNotFound ? 'not-found' : isNetwork ? 'network' : 'server'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  if (loading) return <ProviderDetailSkeleton />;

  if (error || !data) {
    return (
      <ErrorMessage
        variant={error?.type || 'not-found'}
        message={error?.message || 'Item not found'}
        action={
          error?.type !== 'not-found'
            ? { label: 'Try Again', onClick: fetchData }
            : undefined
        }
      >
        <Link href="/search" className="btn-primary">
          Back to Search
        </Link>
      </ErrorMessage>
    );
  }

  return <div>{/* Render data */}</div>;
}
```

## 🎨 Styling

All components use Tailwind CSS and follow the app's design system:

- **Primary color:** `primary-*` classes
- **Error states:** Red (`red-*`)
- **Success states:** Green (`green-*`)
- **Warning states:** Yellow (`yellow-*`)
- **Loading states:** Gray animations

## ✅ Best Practices

1. **Always show loading states** - Use skeletons for better UX
2. **Distinguish error types** - Network vs server errors need different handling
3. **Provide retry mechanisms** - Let users try again on transient errors
4. **Use toasts for success** - Success feedback should be quick and non-blocking
5. **Use inline errors for forms** - Keep validation errors close to fields
6. **Be specific with error messages** - Tell users what went wrong and how to fix it
7. **Disable buttons during submission** - Prevent double-submission
8. **Clear errors on retry** - Reset error state when user takes action

## 🚀 Updated Files

The following files have been updated with comprehensive error handling:

1. ✅ `packages/frontend/src/app/search/page.tsx` - Search page with retry
2. ✅ `packages/frontend/src/app/provider/[npi]/page.tsx` - Provider detail with 404 handling
3. ✅ `packages/frontend/src/components/ProviderVerificationForm.tsx` - Form with inline errors

## 📚 Additional Resources

- [react-hot-toast documentation](https://react-hot-toast.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- Component files in `packages/frontend/src/components/`
