import Link from 'next/link';

export function CTASection() {
  return (
    <section className="py-16 md:py-24 bg-primary-600">
      <div className="container-wide text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Ready to Find Your Provider?
        </h2>
        <p className="text-xl text-primary-100 max-w-2xl mx-auto mb-8">
          Don&apos;t be part of the 46% affected by inaccurate directories.
          Search now with research-backed verification.
        </p>
        <Link
          href="/search"
          className="btn bg-white text-primary-600 hover:bg-gray-100 text-lg px-8 py-4"
        >
          Start Searching
        </Link>
      </div>
    </section>
  );
}
