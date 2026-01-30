import Link from 'next/link';

export function CTASection() {
  return (
    <section className="py-12 md:py-16 bg-primary-600">
      <div className="container-wide text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
          Ready to Find Your Provider?
        </h2>
        <p className="text-lg text-primary-100 max-w-2xl mx-auto mb-6">
          Don&apos;t be part of the 46% affected by inaccurate directories.
          Search now with research-backed verification.
        </p>
        <Link
          href="/search"
          className="inline-flex items-center justify-center bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-lg font-semibold px-8 py-4 rounded-lg shadow-lg shadow-blue-500/30 hover:scale-105 transition-transform"
        >
          Start Searching
        </Link>
      </div>
    </section>
  );
}
