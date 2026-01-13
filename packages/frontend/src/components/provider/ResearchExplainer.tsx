/**
 * Research Explainer Component
 * Shows why verification matters with research statistics
 */

import Link from 'next/link';
import { DocumentIcon, ChevronRightIcon } from '../icons/Icons';

export function ResearchExplainer() {
  return (
    <div className="card bg-gray-50 border-gray-200">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
          <DocumentIcon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Why Verification Matters
          </h3>
          <div className="text-xs text-gray-700 space-y-2">
            <p>
              <strong>46-77%</strong> of insurance directories are wrong, causing:
            </p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li><strong>4x more surprise bills</strong></li>
              <li>28% delay needed care</li>
              <li>540 days to fix errors</li>
            </ul>
            <p className="pt-2">
              Our crowdsourced verification achieves <strong>expert-level accuracy</strong> (κ=0.58) with just 3 patients.
            </p>
          </div>
        </div>
      </div>

      <Link
        href="/research"
        className="text-xs font-medium text-primary-700 hover:text-primary-800 flex items-center gap-1 mt-3"
      >
        Read the research
        <ChevronRightIcon className="w-3 h-3" />
      </Link>
    </div>
  );
}
