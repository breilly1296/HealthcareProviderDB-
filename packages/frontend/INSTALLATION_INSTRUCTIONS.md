# Installation Instructions - Error Handling & Toast Notifications

## 🚀 Quick Start

### Step 1: Install react-hot-toast

```bash
cd packages/frontend
npm install react-hot-toast
```

### Step 2: Update Root Layout

Edit `packages/frontend/src/app/layout.tsx` and add the ToastProvider import and component:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import ToastProvider from '@/components/ToastProvider'; // ADD THIS LINE

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HealthcareProviderDB - Find Providers Who Accept Your Insurance',
  description: 'Search for healthcare providers and verify insurance acceptance with community-verified data.',
};

// ... Header and Footer components remain the same ...

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <ToastProvider /> {/* ADD THIS LINE */}
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
```

### Step 3: Test the Implementation

Start your development server:

```bash
npm run dev
```

Navigate to:
- `/search` - Test search error handling and loading states
- `/provider/[npi]` - Test provider detail error handling
- Try submitting a verification form to see toast notifications

## ✅ What's Been Added

### New Components Created:

1. **ErrorMessage.tsx** - Comprehensive error display component
   - Search errors
   - Network errors
   - Server errors
   - Not found errors
   - Validation errors
   - Inline error variant for forms

2. **LoadingSpinner.tsx** - Loading state components
   - Basic spinner with variants (primary, white, gray)
   - Button spinner for form submissions
   - Loading section for content areas
   - Loading overlay for modal states

3. **ProviderCardSkeleton.tsx** - Skeleton loaders
   - Provider card skeleton for search results
   - Provider detail skeleton for detail pages
   - Compact skeleton for lists

4. **ToastProvider.tsx** - Toast notification setup
   - Configured react-hot-toast
   - Success, error, and loading toast styles
   - Helper functions and examples

### Updated Pages:

1. **search/page.tsx** ✅
   - Skeleton loading states
   - Network/server error detection
   - Retry button on errors
   - Empty state handling

2. **provider/[npi]/page.tsx** ✅
   - Full page skeleton
   - 404 error handling
   - Network/server error detection
   - Retry mechanism

3. **ProviderVerificationForm.tsx** ✅
   - Inline error messages
   - Button loading spinners
   - Disabled states during submission
   - Retry functionality on errors

## 📚 Usage Examples

### Show Success Toast

```tsx
import toast from 'react-hot-toast';

const handleSuccess = () => {
  toast.success('Verification submitted successfully!');
};
```

### Show Error Toast

```tsx
import toast from 'react-hot-toast';

const handleError = (error: Error) => {
  toast.error(error.message || 'Something went wrong');
};
```

### Show Loading Toast with Promise

```tsx
import toast from 'react-hot-toast';

const submitForm = async (data: FormData) => {
  const promise = fetch('/api/submit', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  await toast.promise(promise, {
    loading: 'Submitting...',
    success: 'Submitted successfully!',
    error: 'Failed to submit',
  });
};
```

### Use Loading Spinner in Component

```tsx
import LoadingSpinner from '@/components/LoadingSpinner';

export default function MyComponent() {
  const [loading, setLoading] = useState(true);

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading data..." />;
  }

  return <div>Content</div>;
}
```

### Use Error Message

```tsx
import ErrorMessage from '@/components/ErrorMessage';

export default function MyComponent() {
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <ErrorMessage
        variant="server"
        message={error}
        action={{
          label: 'Try Again',
          onClick: () => refetch()
        }}
      />
    );
  }

  return <div>Content</div>;
}
```

### Use Skeleton Loader

```tsx
import ProviderCardSkeleton from '@/components/ProviderCardSkeleton';

export default function SearchResults() {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);

  if (loading) {
    return <ProviderCardSkeleton count={3} />;
  }

  return (
    <div>
      {results.map(result => <ResultCard key={result.id} {...result} />)}
    </div>
  );
}
```

## 🎨 Component API Reference

### ErrorMessage Props

```typescript
interface ErrorMessageProps {
  title?: string;
  message: string;
  variant?: 'search' | 'network' | 'server' | 'not-found' | 'validation';
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: ReactNode;
}
```

### LoadingSpinner Props

```typescript
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'white' | 'gray';
  text?: string;
  className?: string;
  fullPage?: boolean;
}
```

### ProviderCardSkeleton Props

```typescript
interface ProviderCardSkeletonProps {
  count?: number;
  className?: string;
}
```

## 🔧 Troubleshooting

### Toast notifications not showing

1. Make sure react-hot-toast is installed:
   ```bash
   npm list react-hot-toast
   ```

2. Verify ToastProvider is added to layout.tsx

3. Check browser console for errors

### Skeleton not matching card size

- Adjust the skeleton structure in `ProviderCardSkeleton.tsx` to match your card design
- Update height/width classes to match your actual components

### Error messages not displaying correctly

- Ensure you're passing the correct variant
- Check that error messages are properly propagated from API calls
- Verify className prop is not conflicting with Tailwind classes

## 📖 Additional Documentation

See `ERROR_HANDLING_GUIDE.md` for:
- Detailed usage patterns
- Best practices
- Advanced examples
- Complete implementation patterns

## 🎯 Next Steps

1. ✅ Install react-hot-toast
2. ✅ Update layout.tsx with ToastProvider
3. ✅ Test all error scenarios
4. ✅ Add toast notifications to other forms in the app
5. Consider adding:
   - Error boundary components for React errors
   - Retry logic with exponential backoff
   - Offline detection and handling
   - Analytics tracking for errors

## 💡 Best Practices

1. **Always show loading states** - Never leave users wondering if something is happening
2. **Distinguish error types** - Network errors can be retried, validation errors need user action
3. **Provide actionable error messages** - Tell users what went wrong AND how to fix it
4. **Use toasts for success** - Quick, non-blocking feedback is best for success states
5. **Use inline errors for forms** - Keep validation errors close to the problematic fields
6. **Test error scenarios** - Intentionally trigger errors to verify handling works
7. **Log errors** - Consider adding error tracking (Sentry, LogRocket, etc.)

## 🆘 Need Help?

- Check the guide: `ERROR_HANDLING_GUIDE.md`
- React Hot Toast docs: https://react-hot-toast.com/
- Tailwind CSS docs: https://tailwindcss.com/
