export default function InsuranceLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading insurance scanner">
      <span className="sr-only">Loading...</span>
      <div className="h-10 w-10 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-primary-600 dark:border-t-primary-400 animate-spin" />
    </div>
  );
}
