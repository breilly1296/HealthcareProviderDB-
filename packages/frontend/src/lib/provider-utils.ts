/**
 * Utility functions for provider display and formatting
 */

export const SPECIALTY_LABELS: Record<string, string> = {
  ENDOCRINOLOGY: 'Endocrinology',
  RHEUMATOLOGY: 'Rheumatology',
  ORTHOPEDICS: 'Orthopedics',
  INTERNAL_MEDICINE: 'Internal Medicine',
  FAMILY_MEDICINE: 'Family Medicine',
  GERIATRICS: 'Geriatrics',
  OTHER: 'Other Specialty',
};

export function getSpecialtyDisplay(
  specialtyCategory: string | null | undefined,
  taxonomyDescription: string | null | undefined
): string {
  if (specialtyCategory && SPECIALTY_LABELS[specialtyCategory]) {
    return SPECIALTY_LABELS[specialtyCategory];
  }
  return taxonomyDescription || 'Healthcare Provider';
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
