'use client';

import { User, Building2, Globe } from 'lucide-react';

interface AboutProviderProps {
  entityType?: string | null;
  acceptsNewPatients?: boolean | null;
  languages?: string[] | null;
}

export function AboutProvider({
  entityType,
  acceptsNewPatients,
  languages,
}: AboutProviderProps) {
  // Determine practice type
  const practiceType = entityType === 'ORGANIZATION'
    ? 'Group Practice / Organization'
    : 'Individual Provider';

  // Determine new patient status
  const newPatientsStatus = acceptsNewPatients === true
    ? 'Yes'
    : acceptsNewPatients === false
    ? 'No'
    : 'Unknown';

  const newPatientsColor = acceptsNewPatients === true
    ? 'text-green-600 dark:text-green-400'
    : acceptsNewPatients === false
    ? 'text-red-600 dark:text-red-400'
    : 'text-stone-500 dark:text-gray-400';

  // Only show if we have meaningful data
  const hasData = entityType || acceptsNewPatients !== undefined || (languages && languages.length > 0);

  if (!hasData) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-stone-200 dark:border-gray-700 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-stone-800 dark:text-white mb-4">About This Provider</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Accepting New Patients */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-stone-500 dark:text-gray-400" />
          </div>
          <div>
            <p className="text-sm text-stone-500 dark:text-gray-400">New Patients</p>
            <p className={`font-medium ${newPatientsColor}`}>{newPatientsStatus}</p>
          </div>
        </div>

        {/* Practice Type */}
        {entityType && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-stone-500 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-stone-500 dark:text-gray-400">Practice Type</p>
              <p className="font-medium text-stone-800 dark:text-white">{practiceType}</p>
            </div>
          </div>
        )}

        {/* Languages */}
        {languages && languages.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Globe className="w-5 h-5 text-stone-500 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-stone-500 dark:text-gray-400">Languages</p>
              <p className="font-medium text-stone-800 dark:text-white">{languages.join(', ')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
