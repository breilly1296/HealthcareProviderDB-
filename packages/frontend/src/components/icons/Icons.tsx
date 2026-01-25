/**
 * Reusable SVG icon components
 * All icons accept className for sizing/color and aria-hidden for accessibility
 */

export interface IconProps {
  className?: string;
  'aria-hidden'?: boolean;
}

export function SearchIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

export function CloseIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// Alias for CloseIcon
export const XIcon = CloseIcon;

export function ChevronRightIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function ChevronUpIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

export function CheckIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function CheckCircleIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function InfoIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function WarningIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

// Alias for WarningIcon
export const AlertTriangleIcon = WarningIcon;

export function PhoneIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

export function LocationIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// Alias for LocationIcon
export const MapPinIcon = LocationIcon;

export function ExternalLinkIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export function FilterIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  );
}

export function ClockIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function DocumentIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export function ChartBarIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

export function UsersIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

export function HomeIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

export function CameraIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function CreditCardIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

export function SpinnerIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={`${className} animate-spin`} aria-hidden={ariaHidden} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export function StarIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

export function HeartIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

export function TrashIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export function PlusIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

export function MinusIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}

export function AlertIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// Alias for AlertIcon (exclamation in circle)
export const ExclamationCircleIcon = AlertIcon;

export function WifiOffIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
    </svg>
  );
}

export function ServerIcon({ className = "w-5 h-5", "aria-hidden": ariaHidden = true }: IconProps) {
  return (
    <svg className={className} aria-hidden={ariaHidden} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  );
}
