import Link from 'next/link';
import type { Location } from '@/types';
import { toDisplayCase, toAddressCase, toTitleCase } from '@/lib/formatName';

interface LocationCardProps {
  location: Location;
}

export function LocationCard({ location }: LocationCardProps) {
  return (
    <Link
      href={`/location/${location.id}`}
      className="block card hover:border-primary-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-primary-600">
                {toDisplayCase(location.name) || toAddressCase(location.addressLine1)}
              </h3>
              {location.name && (
                <p className="text-sm text-gray-700 mb-1 font-medium">
                  {toAddressCase(location.addressLine1)}
                </p>
              )}
              {location.addressLine2 && (
                <p className="text-sm text-gray-600 mb-1">
                  {toAddressCase(location.addressLine2)}
                </p>
              )}
              <p className="text-sm text-gray-600">
                {toTitleCase(location.city)}, {location.state} {location.zipCode}
              </p>
              {location.healthSystem && (
                <p className="text-sm text-primary-600 mt-1">
                  {toDisplayCase(location.healthSystem)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-primary-600 font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>
                {location.providerCount} provider{location.providerCount !== 1 ? 's' : ''}
              </span>
            </div>

            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(`${location.addressLine1}${location.addressLine2 ? ' ' + location.addressLine2 : ''}, ${location.city}, ${location.state} ${location.zipCode}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-500 hover:text-primary-600 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              View on map
            </a>
          </div>
        </div>

        <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
