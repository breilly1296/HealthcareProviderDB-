/**
 * Verification Call-to-Action Component
 * Prominent CTA to encourage provider verification
 */

import { VerificationButton } from '../VerificationButton';
import { CheckCircleIcon, ClockIcon, UsersIcon } from '../icons/Icons';

interface VerificationCallToActionProps {
  npi: string;
  providerName: string;
}

export function VerificationCallToAction({ npi, providerName }: VerificationCallToActionProps) {
  return (
    <div className="card bg-gradient-to-br from-primary-50 to-primary-100 border-primary-300 shadow-md">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
          <CheckCircleIcon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-primary-900 mb-1">
            Verify This Provider
          </h3>
          <p className="text-sm text-primary-800">
            Your 2-minute verification helps prevent surprise bills
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg p-3 mb-4">
        <BenefitItem icon={<CheckCircleIcon />} text="5 simple yes/no questions" />
        <BenefitItem icon={<ClockIcon />} text="Under 2 minutes, no typing" />
        <BenefitItem icon={<UsersIcon />} text="3 verifications = expert accuracy" />
      </div>

      <VerificationButton npi={npi} providerName={providerName} />

      <p className="text-xs text-primary-700 mt-3 text-center">
        Research shows patients face 4x more surprise bills when directories are wrong
      </p>
    </div>
  );
}

interface BenefitItemProps {
  icon: React.ReactNode;
  text: string;
}

function BenefitItem({ icon, text }: BenefitItemProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-700 mb-2 last:mb-0">
      <div className="text-green-600">
        {icon}
      </div>
      {text}
    </div>
  );
}
