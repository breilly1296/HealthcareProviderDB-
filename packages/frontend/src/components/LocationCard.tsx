import Link from 'next/link';
import type { Location } from '@/types';
import { toDisplayCase, toAddressCase, toTitleCase } from '@/lib/formatName';
import { Building2, Users, MapPin, ChevronRight } from 'lucide-react';

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
              <Building2 className="w-5 h-5 text-primary-600" />
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
              <Users className="w-4 h-4" />
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
              <MapPin className="w-4 h-4" />
              View on map
            </a>
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
}
