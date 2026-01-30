/**
 * Utility functions for provider display and formatting
 * Centralized location for specialty labels and provider formatting
 */

import { CONFIDENCE_THRESHOLDS } from './constants';

/** Comprehensive specialty labels mapping */
export const SPECIALTY_LABELS: Record<string, string> = {
  ACUPUNCTURE: 'Acupuncture',
  ALLERGY_IMMUNOLOGY: 'Allergy & Immunology',
  ANESTHESIOLOGY: 'Anesthesiology',
  CARDIOLOGY: 'Cardiology',
  CHIROPRACTIC: 'Chiropractic',
  CLINIC_FACILITY: 'Clinic/Facility',
  COMMUNITY_HEALTH: 'Community Health',
  DENTISTRY: 'Dentistry',
  DERMATOLOGY: 'Dermatology',
  DIETETICS: 'Dietetics',
  DME_PROSTHETICS: 'DME & Prosthetics',
  EMERGENCY_MEDICINE: 'Emergency Medicine',
  ENDOCRINOLOGY: 'Endocrinology',
  FAMILY_MEDICINE: 'Family Medicine',
  GASTROENTEROLOGY: 'Gastroenterology',
  GERIATRICS: 'Geriatrics',
  HOME_HEALTH: 'Home Health',
  HOSPICE_PALLIATIVE: 'Hospice & Palliative',
  HOSPITAL: 'Hospital',
  INFECTIOUS_DISEASE: 'Infectious Disease',
  INTERNAL_MEDICINE: 'Internal Medicine',
  LAB_PATHOLOGY: 'Lab & Pathology',
  MENTAL_HEALTH: 'Mental Health',
  MIDWIFERY: 'Midwifery',
  NEPHROLOGY: 'Nephrology',
  NEUROLOGY: 'Neurology',
  NURSE_PRACTITIONER: 'Nurse Practitioner',
  NURSING: 'Nursing',
  OB_GYN: 'OB/GYN',
  OCCUPATIONAL_THERAPY: 'Occupational Therapy',
  ONCOLOGY: 'Oncology',
  OPTOMETRY: 'Optometry',
  ORTHOPEDICS: 'Orthopedics',
  OTHER: 'Other Specialty',
  PATHOLOGY: 'Pathology',
  PEDIATRICS: 'Pediatrics',
  PHARMACY: 'Pharmacy',
  PHYSICAL_THERAPY: 'Physical Therapy',
  PHYSICIAN_ASSISTANT: 'Physician Assistant',
  PSYCHIATRY: 'Psychiatry',
  PSYCHOLOGY: 'Psychology',
  PULMONOLOGY: 'Pulmonology',
  RADIOLOGY: 'Radiology',
  RESPIRATORY_THERAPY: 'Respiratory Therapy',
  RHEUMATOLOGY: 'Rheumatology',
  SOCIAL_WORK: 'Social Work',
  SPEECH_THERAPY: 'Speech Therapy',
  SURGERY: 'Surgery',
  UROLOGY: 'Urology',
};

/** Specialty options for dropdowns with value/label pairs */
export const SPECIALTY_OPTIONS = [
  { value: '', label: 'All Specialties' },
  ...Object.entries(SPECIALTY_LABELS).map(([value, label]) => ({ value, label })),
];

export function getSpecialtyDisplay(
  specialtyCategory: string | null | undefined,
  taxonomyDescription: string | null | undefined
): string {
  // First try exact match
  if (specialtyCategory && SPECIALTY_LABELS[specialtyCategory]) {
    return SPECIALTY_LABELS[specialtyCategory];
  }

  // Try uppercase version
  if (specialtyCategory) {
    const upperKey = specialtyCategory.toUpperCase().replace(/[\s-]/g, '_');
    if (SPECIALTY_LABELS[upperKey]) {
      return SPECIALTY_LABELS[upperKey];
    }
    // If we have a specialtyCategory but no match, format it nicely
    return specialtyCategory
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Use taxonomy description if available
  if (taxonomyDescription) {
    return taxonomyDescription;
  }

  return 'Healthcare Provider';
}

export function formatConfidenceLevel(level: string | null | undefined): string {
  return level?.replace('_', ' ') || 'MEDIUM';
}

export function getAcceptanceStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    ACCEPTED: 'Accepts this plan',
    NOT_ACCEPTED: 'Does not accept',
    PENDING: 'Status pending verification',
  };
  return statusMap[status] || 'Unknown';
}

export function getNewPatientStatusText(acceptsNewPatients: boolean | null): string | null {
  if (acceptsNewPatients === null) return null;
  return acceptsNewPatients ? 'Accepting new patients' : 'Not accepting new patients';
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'Unknown';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/** US States mapping for dropdowns */
export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'Washington DC',
};

/** State options for dropdowns */
export const STATE_OPTIONS = [
  { value: '', label: 'All States' },
  ...Object.entries(US_STATES).map(([value, label]) => ({ value, label })),
];

/** Confidence level thresholds and styling */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export const CONFIDENCE_LEVELS: { min: number; level: ConfidenceLevel }[] = [
  { min: CONFIDENCE_THRESHOLDS.HIGH, level: 'high' },
  { min: CONFIDENCE_THRESHOLDS.MEDIUM, level: 'medium' },
  { min: CONFIDENCE_THRESHOLDS.LOW, level: 'low' },
];

export const CONFIDENCE_STYLES: Record<ConfidenceLevel, { color: string; bgColor: string; label: string }> = {
  high: { color: 'text-green-800', bgColor: 'bg-green-100 border-green-300', label: 'High Confidence' },
  medium: { color: 'text-yellow-800', bgColor: 'bg-yellow-100 border-yellow-300', label: 'Medium Confidence' },
  low: { color: 'text-red-800', bgColor: 'bg-red-100 border-red-300', label: 'Low Confidence' },
};

export const CONFIDENCE_BAR_COLORS: Record<ConfidenceLevel, string> = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-red-500',
};

/** Get confidence level from score */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  for (const { min, level } of CONFIDENCE_LEVELS) {
    if (score >= min) return level;
  }
  return 'low';
}
