/**
 * Comprehensive NPI Taxonomy Code to Specialty Category Mappings
 * Based on CMS NUCC Health Care Provider Taxonomy Code Set
 *
 * Reference: https://taxonomy.nucc.org/
 */

export type SpecialtyCategory =
  | 'ENDOCRINOLOGY'
  | 'RHEUMATOLOGY'
  | 'ORTHOPEDICS'
  | 'INTERNAL_MEDICINE'
  | 'FAMILY_MEDICINE'
  | 'GERIATRICS'
  | 'MENTAL_HEALTH'
  | 'PSYCHIATRY'
  | 'PSYCHOLOGY'
  | 'SOCIAL_WORK'
  | 'NURSING'
  | 'NURSE_PRACTITIONER'
  | 'PHYSICIAN_ASSISTANT'
  | 'MIDWIFERY'
  | 'DENTISTRY'
  | 'OPTOMETRY'
  | 'PHARMACY'
  | 'PHYSICAL_THERAPY'
  | 'OCCUPATIONAL_THERAPY'
  | 'SPEECH_THERAPY'
  | 'RESPIRATORY_THERAPY'
  | 'CHIROPRACTIC'
  | 'ACUPUNCTURE'
  | 'EMERGENCY_MEDICINE'
  | 'PEDIATRICS'
  | 'ANESTHESIOLOGY'
  | 'SURGERY'
  | 'OB_GYN'
  | 'CARDIOLOGY'
  | 'RADIOLOGY'
  | 'DERMATOLOGY'
  | 'NEUROLOGY'
  | 'ONCOLOGY'
  | 'UROLOGY'
  | 'GASTROENTEROLOGY'
  | 'PULMONOLOGY'
  | 'NEPHROLOGY'
  | 'INFECTIOUS_DISEASE'
  | 'ALLERGY_IMMUNOLOGY'
  | 'PATHOLOGY'
  | 'DIETETICS'
  | 'LAB_PATHOLOGY'
  | 'DME_PROSTHETICS'
  | 'COMMUNITY_HEALTH'
  | 'HOME_HEALTH'
  | 'HOSPICE_PALLIATIVE'
  | 'OPHTHALMOLOGY'
  | 'PODIATRY'
  | 'PHYSICAL_MEDICINE_REHAB'
  | 'GENERAL_PRACTICE'
  | 'PLASTIC_SURGERY'
  | 'PREVENTIVE_MEDICINE'
  | 'NUCLEAR_MEDICINE'
  | 'COLON_RECTAL_SURGERY'
  | 'CLINIC_FACILITY'
  | 'HOSPITAL'
  | 'OTHER';

/**
 * Complete taxonomy code to specialty category mapping
 * Format: 'taxonomyCode': 'SpecialtyCategory'
 */
export const TAXONOMY_TO_SPECIALTY: Record<string, SpecialtyCategory> = {
  // ============================================================
  // ENDOCRINOLOGY (207RE*, 261QE*)
  // ============================================================
  '207RE0101X': 'ENDOCRINOLOGY', // Endocrinology, Diabetes & Metabolism
  '207RI0011X': 'ENDOCRINOLOGY', // Internal Medicine - Endocrinology
  '261QE0700X': 'ENDOCRINOLOGY', // Clinic/Center - Endocrinology

  // ============================================================
  // RHEUMATOLOGY (207RR*, 261QR*)
  // ============================================================
  '207RR0500X': 'RHEUMATOLOGY', // Internal Medicine - Rheumatology
  '261QR0401X': 'RHEUMATOLOGY', // Clinic/Center - Rheumatology

  // ============================================================
  // ORTHOPEDICS (207X*)
  // ============================================================
  '207X00000X': 'ORTHOPEDICS', // Orthopaedic Surgery
  '207XS0114X': 'ORTHOPEDICS', // Adult Reconstructive Orthopaedic Surgery
  '207XS0106X': 'ORTHOPEDICS', // Hand Surgery (Orthopaedic)
  '207XS0117X': 'ORTHOPEDICS', // Orthopaedic Surgery of the Spine
  '207XX0004X': 'ORTHOPEDICS', // Orthopaedic Foot and Ankle Surgery
  '207XX0005X': 'ORTHOPEDICS', // Sports Medicine (Orthopaedic)
  '207XX0801X': 'ORTHOPEDICS', // Orthopaedic Trauma
  '207XP3100X': 'ORTHOPEDICS', // Pediatric Orthopaedic Surgery

  // ============================================================
  // INTERNAL MEDICINE (207R*)
  // ============================================================
  '207R00000X': 'INTERNAL_MEDICINE', // Internal Medicine
  '207RA0000X': 'INTERNAL_MEDICINE', // Internal Medicine - Adolescent Medicine
  '207RA0001X': 'INTERNAL_MEDICINE', // Internal Medicine - Advanced Heart Failure
  '207RC0000X': 'CARDIOLOGY',        // Internal Medicine - Cardiovascular Disease (mapped to Cardiology)
  '207RI0200X': 'INFECTIOUS_DISEASE', // Internal Medicine - Infectious Disease
  '207RG0100X': 'GASTROENTEROLOGY',  // Internal Medicine - Gastroenterology
  '207RH0000X': 'INTERNAL_MEDICINE', // Internal Medicine - Hematology
  '207RH0003X': 'ONCOLOGY',          // Internal Medicine - Hematology & Oncology
  '207RI0008X': 'INTERNAL_MEDICINE', // Internal Medicine - Hepatology
  '207RN0300X': 'NEPHROLOGY',        // Internal Medicine - Nephrology
  '207RP1001X': 'PULMONOLOGY',       // Internal Medicine - Pulmonary Disease
  '207RC0200X': 'PULMONOLOGY',       // Internal Medicine - Critical Care Medicine
  '207RC0001X': 'CARDIOLOGY',        // Internal Medicine - Clinical Cardiac Electrophysiology
  '207RM1200X': 'INTERNAL_MEDICINE', // Internal Medicine - Magnetic Resonance Imaging

  // ============================================================
  // FAMILY MEDICINE (207Q*)
  // ============================================================
  '207Q00000X': 'FAMILY_MEDICINE', // Family Medicine
  '207QA0000X': 'FAMILY_MEDICINE', // Family Medicine - Adolescent Medicine
  '207QA0401X': 'FAMILY_MEDICINE', // Family Medicine - Addiction Medicine
  '207QA0505X': 'FAMILY_MEDICINE', // Family Medicine - Adult Medicine
  '207QB0002X': 'FAMILY_MEDICINE', // Family Medicine - Obesity Medicine
  '207QH0002X': 'HOSPICE_PALLIATIVE', // Family Medicine - Hospice and Palliative Medicine
  '207QS0010X': 'FAMILY_MEDICINE', // Family Medicine - Sports Medicine
  '207QS1201X': 'FAMILY_MEDICINE', // Family Medicine - Sleep Medicine

  // ============================================================
  // GERIATRICS (207QG*, 207RG*)
  // ============================================================
  '207QG0300X': 'GERIATRICS', // Family Medicine - Geriatric Medicine
  '207RG0300X': 'GERIATRICS', // Internal Medicine - Geriatric Medicine

  // ============================================================
  // MENTAL HEALTH & COUNSELING (101*, 106*)
  // ============================================================
  '101Y00000X': 'MENTAL_HEALTH',  // Counselor
  '101YA0400X': 'MENTAL_HEALTH',  // Addiction (Substance Use Disorder) Counselor
  '101YM0800X': 'MENTAL_HEALTH',  // Mental Health Counselor
  '101YP1600X': 'MENTAL_HEALTH',  // Pastoral Counselor
  '101YP2500X': 'MENTAL_HEALTH',  // Professional Counselor
  '101YS0200X': 'MENTAL_HEALTH',  // School Counselor
  '106E00000X': 'MENTAL_HEALTH',  // Assistant Behavior Analyst
  '106H00000X': 'MENTAL_HEALTH',  // Marriage & Family Therapist
  '106S00000X': 'MENTAL_HEALTH',  // Marriage & Family Therapist

  // ============================================================
  // PSYCHOLOGY (103*)
  // ============================================================
  '103G00000X': 'PSYCHOLOGY', // Clinical Neuropsychologist
  '103GC0700X': 'PSYCHOLOGY', // Clinical Neuropsychologist
  '103K00000X': 'PSYCHOLOGY', // Behavioral Analyst
  '103T00000X': 'PSYCHOLOGY', // Psychologist
  '103TA0400X': 'PSYCHOLOGY', // Psychologist - Addiction
  '103TA0700X': 'PSYCHOLOGY', // Psychologist - Adult Development & Aging
  '103TB0200X': 'PSYCHOLOGY', // Psychologist - Cognitive & Behavioral
  '103TC0700X': 'PSYCHOLOGY', // Psychologist - Clinical
  '103TC1900X': 'PSYCHOLOGY', // Psychologist - Counseling
  '103TC2200X': 'PSYCHOLOGY', // Psychologist - Clinical Child & Adolescent
  '103TE1100X': 'PSYCHOLOGY', // Psychologist - Exercise & Sports
  '103TF0000X': 'PSYCHOLOGY', // Psychologist - Family
  '103TF0200X': 'PSYCHOLOGY', // Psychologist - Forensic
  '103TH0004X': 'PSYCHOLOGY', // Psychologist - Health
  '103TH0100X': 'PSYCHOLOGY', // Psychologist - Health Service
  '103TM1800X': 'PSYCHOLOGY', // Psychologist - Intellectual & Developmental Disabilities
  '103TP0016X': 'PSYCHOLOGY', // Psychologist - Prescribing (Medical)
  '103TP0814X': 'PSYCHOLOGY', // Psychologist - Psychoanalysis
  '103TP2701X': 'PSYCHOLOGY', // Psychologist - Rehabilitation
  '103TR0400X': 'PSYCHOLOGY', // Psychologist - Rehabilitation
  '103TS0200X': 'PSYCHOLOGY', // Psychologist - School
  '103TW0100X': 'PSYCHOLOGY', // Psychologist - Women

  // ============================================================
  // PSYCHIATRY (2084*)
  // ============================================================
  '2084A0401X': 'PSYCHIATRY', // Psychiatry - Addiction Medicine
  '2084A2900X': 'PSYCHIATRY', // Psychiatry - Adolescent
  '2084B0002X': 'PSYCHIATRY', // Psychiatry - Obesity Medicine
  '2084B0040X': 'PSYCHIATRY', // Psychiatry - Behavioral Neurology & Neuropsychiatry
  '2084D0003X': 'PSYCHIATRY', // Psychiatry - Diagnostic Neuroimaging
  '2084F0202X': 'PSYCHIATRY', // Psychiatry - Forensic
  '2084H0002X': 'PSYCHIATRY', // Psychiatry - Hospice and Palliative Medicine
  '2084N0008X': 'PSYCHIATRY', // Psychiatry - Neurology
  '2084N0400X': 'NEUROLOGY',  // Psychiatry - Neurology (mapped to Neurology)
  '2084N0402X': 'NEUROLOGY',  // Psychiatry - Neurology with Special Qualifications
  '2084N0600X': 'NEUROLOGY',  // Psychiatry - Clinical Neurophysiology
  '2084P0005X': 'PSYCHIATRY', // Psychiatry - Neurodevelopmental Disabilities
  '2084P0015X': 'PSYCHIATRY', // Psychiatry - Psychosomatic Medicine
  '2084P0301X': 'PSYCHIATRY', // Psychiatry - Brain Injury Medicine
  '2084P0800X': 'PSYCHIATRY', // Psychiatry - Psychiatry
  '2084P0802X': 'PSYCHIATRY', // Psychiatry - Addiction Psychiatry
  '2084P0804X': 'PSYCHIATRY', // Psychiatry - Child & Adolescent
  '2084P0805X': 'PSYCHIATRY', // Psychiatry - Geriatric
  '2084P2900X': 'PSYCHIATRY', // Psychiatry - Pain Medicine
  '2084S0010X': 'PSYCHIATRY', // Psychiatry - Sports Medicine
  '2084S0012X': 'PSYCHIATRY', // Psychiatry - Sleep Medicine
  '2084V0102X': 'PSYCHIATRY', // Psychiatry - Vascular Neurology

  // ============================================================
  // SOCIAL WORK (104*)
  // ============================================================
  '104100000X': 'SOCIAL_WORK', // Social Worker
  '1041C0700X': 'SOCIAL_WORK', // Clinical Social Worker
  '1041S0200X': 'SOCIAL_WORK', // School Social Worker

  // ============================================================
  // NURSING (163*, 164*)
  // ============================================================
  '163W00000X': 'NURSING', // Registered Nurse
  '163WA0400X': 'NURSING', // Registered Nurse - Addiction
  '163WA2000X': 'NURSING', // Registered Nurse - Administrator
  '163WC0200X': 'NURSING', // Registered Nurse - Critical Care
  '163WC0400X': 'NURSING', // Registered Nurse - Case Management
  '163WC1400X': 'NURSING', // Registered Nurse - College Health
  '163WC1500X': 'NURSING', // Registered Nurse - Community Health
  '163WC1600X': 'NURSING', // Registered Nurse - Continuing Education
  '163WC2100X': 'NURSING', // Registered Nurse - Continence Care
  '163WC3500X': 'NURSING', // Registered Nurse - Cardiac Rehabilitation
  '163WD0400X': 'NURSING', // Registered Nurse - Diabetes Educator
  '163WD1100X': 'NURSING', // Registered Nurse - Dialysis/Peritoneal
  '163WE0003X': 'NURSING', // Registered Nurse - Emergency
  '163WE0900X': 'NURSING', // Registered Nurse - Enterostomal Therapy
  '163WF0300X': 'NURSING', // Registered Nurse - Flight
  '163WG0000X': 'NURSING', // Registered Nurse - General Practice
  '163WG0100X': 'NURSING', // Registered Nurse - Gastroenterology
  '163WG0600X': 'NURSING', // Registered Nurse - Gerontology
  '163WH0200X': 'NURSING', // Registered Nurse - Home Health
  '163WH0500X': 'NURSING', // Registered Nurse - Hemodialysis
  '163WH1000X': 'NURSING', // Registered Nurse - Hospice
  '163WI0500X': 'NURSING', // Registered Nurse - Infusion Therapy
  '163WI0600X': 'NURSING', // Registered Nurse - Infection Control
  '163WL0100X': 'NURSING', // Registered Nurse - Lactation Consultant
  '163WM0102X': 'NURSING', // Registered Nurse - Maternal Newborn
  '163WM0705X': 'NURSING', // Registered Nurse - Medical-Surgical
  '163WM1400X': 'NURSING', // Registered Nurse - Massage Therapy
  '163WN0002X': 'NURSING', // Registered Nurse - Neonatal Intensive Care
  '163WN0003X': 'NURSING', // Registered Nurse - Neonatal/Low Risk
  '163WN0300X': 'NURSING', // Registered Nurse - Nephrology
  '163WN0800X': 'NURSING', // Registered Nurse - Neuroscience
  '163WN1003X': 'NURSING', // Registered Nurse - Nutrition Support
  '163WP0000X': 'NURSING', // Registered Nurse - Pain Management
  '163WP0200X': 'NURSING', // Registered Nurse - Pediatric
  '163WP0218X': 'NURSING', // Registered Nurse - Pediatric Oncology
  '163WP0807X': 'NURSING', // Registered Nurse - Psych/Mental Health Child
  '163WP0808X': 'NURSING', // Registered Nurse - Psych/Mental Health
  '163WP0809X': 'NURSING', // Registered Nurse - Psych/Mental Health Adult
  '163WP1700X': 'NURSING', // Registered Nurse - Perinatal
  '163WP2201X': 'NURSING', // Registered Nurse - Ambulatory Care
  '163WR0006X': 'NURSING', // Registered Nurse - Registered Nurse First Assistant
  '163WR0400X': 'NURSING', // Registered Nurse - Rehabilitation
  '163WR1000X': 'NURSING', // Registered Nurse - Reproductive Endocrinology
  '163WS0121X': 'NURSING', // Registered Nurse - Plastic Surgery
  '163WS0200X': 'NURSING', // Registered Nurse - School
  '163WU0100X': 'NURSING', // Registered Nurse - Urology
  '163WW0000X': 'NURSING', // Registered Nurse - Wound Care
  '163WW0101X': 'NURSING', // Registered Nurse - Women's Health Care
  '163WX0002X': 'NURSING', // Registered Nurse - Obstetric High-Risk
  '163WX0003X': 'NURSING', // Registered Nurse - Obstetric Inpatient
  '163WX0106X': 'NURSING', // Registered Nurse - Occupational Health
  '163WX0200X': 'NURSING', // Registered Nurse - Oncology
  '163WX0601X': 'NURSING', // Registered Nurse - Otorhinolaryngology
  '163WX0800X': 'NURSING', // Registered Nurse - Orthopedic
  '163WX1100X': 'NURSING', // Registered Nurse - Ophthalmic
  '163WX1500X': 'NURSING', // Registered Nurse - Ostomy Care
  '164W00000X': 'NURSING', // Licensed Practical Nurse
  '164X00000X': 'NURSING', // Licensed Vocational Nurse

  // ============================================================
  // NURSE PRACTITIONER (363L*)
  // ============================================================
  '363L00000X': 'NURSE_PRACTITIONER', // Nurse Practitioner
  '363LA2100X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Acute Care
  '363LA2200X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Adult Health
  '363LC0200X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Critical Care Medicine
  '363LC1500X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Community Health
  '363LF0000X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Family
  '363LG0600X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Gerontology
  '363LN0000X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Neonatal
  '363LN0005X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Neonatal Critical Care
  '363LP0200X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Pediatrics
  '363LP0222X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Pediatrics Critical Care
  '363LP0808X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Psychiatric/Mental Health
  '363LP1700X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Perinatal
  '363LP2300X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Primary Care
  '363LS0200X': 'NURSE_PRACTITIONER', // Nurse Practitioner - School
  '363LW0102X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Women's Health
  '363LX0001X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Obstetrics & Gynecology
  '363LX0106X': 'NURSE_PRACTITIONER', // Nurse Practitioner - Occupational Health
  '363AM0700X': 'NURSE_PRACTITIONER', // Physician Assistant - Medical (mapped here for NPs)

  // ============================================================
  // PHYSICIAN ASSISTANT (363A*)
  // ============================================================
  '363A00000X': 'PHYSICIAN_ASSISTANT', // Physician Assistant
  '363AS0400X': 'PHYSICIAN_ASSISTANT', // Physician Assistant - Surgical Specialists

  // ============================================================
  // MIDWIFERY (171M*, 176B*)
  // ============================================================
  '171M00000X': 'MIDWIFERY', // Midwife
  '176B00000X': 'MIDWIFERY', // Midwife - Certified Nurse Midwife

  // ============================================================
  // DENTISTRY (122*, 123*, 124*, 125*, 126*)
  // ============================================================
  '122300000X': 'DENTISTRY', // Dentist
  '1223D0001X': 'DENTISTRY', // Dentist - Dental Public Health
  '1223D0004X': 'DENTISTRY', // Dentist - Dentist Anesthesiologist
  '1223E0200X': 'DENTISTRY', // Dentist - Endodontics
  '1223G0001X': 'DENTISTRY', // Dentist - General Practice
  '1223P0106X': 'DENTISTRY', // Dentist - Oral & Maxillofacial Pathology
  '1223P0221X': 'DENTISTRY', // Dentist - Pediatric Dentistry
  '1223P0300X': 'DENTISTRY', // Dentist - Periodontics
  '1223P0700X': 'DENTISTRY', // Dentist - Prosthodontics
  '1223S0112X': 'DENTISTRY', // Dentist - Oral & Maxillofacial Surgery
  '1223X0008X': 'DENTISTRY', // Dentist - Oral & Maxillofacial Radiology
  '1223X0400X': 'DENTISTRY', // Dentist - Orthodontics
  '1223X2210X': 'DENTISTRY', // Dentist - Orofacial Pain
  '124Q00000X': 'DENTISTRY', // Dental Hygienist
  '125J00000X': 'DENTISTRY', // Dental Therapist
  '125K00000X': 'DENTISTRY', // Advanced Practice Dental Therapist
  '125Q00000X': 'DENTISTRY', // Oral Medicinist
  '126800000X': 'DENTISTRY', // Dental Assistant
  '126900000X': 'DENTISTRY', // Dental Laboratory Technician

  // ============================================================
  // OPTOMETRY (152*)
  // ============================================================
  '152W00000X': 'OPTOMETRY', // Optometrist
  '152WC0802X': 'OPTOMETRY', // Optometrist - Corneal and Contact Management
  '152WL0500X': 'OPTOMETRY', // Optometrist - Low Vision Rehabilitation
  '152WP0200X': 'OPTOMETRY', // Optometrist - Pediatrics
  '152WS0006X': 'OPTOMETRY', // Optometrist - Sports Vision
  '152WV0400X': 'OPTOMETRY', // Optometrist - Vision Therapy
  '152WX0102X': 'OPTOMETRY', // Optometrist - Occupational Vision
  '156F00000X': 'OPTOMETRY', // Technician/Technologist (Optometric)
  '156FC0800X': 'OPTOMETRY', // Contact Lens Technician
  '156FC0801X': 'OPTOMETRY', // Contact Lens Fitter
  '156FX1100X': 'OPTOMETRY', // Ophthalmic Technician
  '156FX1101X': 'OPTOMETRY', // Ophthalmic Assistant
  '156FX1201X': 'OPTOMETRY', // Optometric Technician
  '156FX1202X': 'OPTOMETRY', // Optometric Assistant
  '156FX1700X': 'OPTOMETRY', // Ocularist
  '156FX1800X': 'OPTOMETRY', // Optician
  '156FX1900X': 'OPTOMETRY', // Orthoptist

  // ============================================================
  // PHARMACY (183*)
  // ============================================================
  '183500000X': 'PHARMACY', // Pharmacist
  '1835C0205X': 'PHARMACY', // Pharmacist - Critical Care
  '1835G0000X': 'PHARMACY', // Pharmacist - General Practice
  '1835G0303X': 'PHARMACY', // Pharmacist - Geriatric
  '1835N0905X': 'PHARMACY', // Pharmacist - Nuclear Pharmacy
  '1835N1003X': 'PHARMACY', // Pharmacist - Nutrition Support
  '1835P0018X': 'PHARMACY', // Pharmacist - Pharmacist Clinician
  '1835P0200X': 'PHARMACY', // Pharmacist - Pediatric
  '1835P1200X': 'PHARMACY', // Pharmacist - Pharmacotherapy
  '1835P1300X': 'PHARMACY', // Pharmacist - Psychiatric
  '1835P2201X': 'PHARMACY', // Pharmacist - Ambulatory Care
  '1835X0200X': 'PHARMACY', // Pharmacist - Oncology
  '183700000X': 'PHARMACY', // Pharmacy Technician

  // ============================================================
  // PHYSICAL THERAPY (225*)
  // ============================================================
  '225100000X': 'PHYSICAL_THERAPY', // Physical Therapist
  '2251C0400X': 'PHYSICAL_THERAPY', // Physical Therapist - Cardiopulmonary
  '2251C2600X': 'PHYSICAL_THERAPY', // Physical Therapist - Clinical Electrophysiology
  '2251E1200X': 'PHYSICAL_THERAPY', // Physical Therapist - Ergonomics
  '2251E1300X': 'PHYSICAL_THERAPY', // Physical Therapist - Electrophysiology
  '2251G0304X': 'PHYSICAL_THERAPY', // Physical Therapist - Geriatrics
  '2251H1200X': 'PHYSICAL_THERAPY', // Physical Therapist - Hand
  '2251H1300X': 'PHYSICAL_THERAPY', // Physical Therapist - Human Factors
  '2251N0400X': 'PHYSICAL_THERAPY', // Physical Therapist - Neurology
  '2251P0200X': 'PHYSICAL_THERAPY', // Physical Therapist - Pediatrics
  '2251S0007X': 'PHYSICAL_THERAPY', // Physical Therapist - Sports
  '2251X0800X': 'PHYSICAL_THERAPY', // Physical Therapist - Orthopedic
  '225200000X': 'PHYSICAL_THERAPY', // Physical Therapy Assistant

  // ============================================================
  // OCCUPATIONAL THERAPY (225X*, 224*)
  // ============================================================
  '225X00000X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist
  '225XE0001X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Environmental Modification
  '225XE1200X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Ergonomics
  '225XF0002X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Feeding/Eating/Swallowing
  '225XG0600X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Gerontology
  '225XH1200X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Hand
  '225XH1300X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Human Factors
  '225XL0004X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Low Vision
  '225XM0800X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Mental Health
  '225XN1300X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Neurorehabilitation
  '225XP0019X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Physical Rehabilitation
  '225XP0200X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Pediatrics
  '225XR0403X': 'OCCUPATIONAL_THERAPY', // Occupational Therapist - Driving and Community Mobility
  '224Z00000X': 'OCCUPATIONAL_THERAPY', // Occupational Therapy Assistant

  // ============================================================
  // SPEECH THERAPY (225*, 235*)
  // ============================================================
  '225700000X': 'SPEECH_THERAPY', // Respiratory/Speech/Rehab Technician (grouped here)
  '235500000X': 'SPEECH_THERAPY', // Speech/Language/Hearing Specialist
  '235Z00000X': 'SPEECH_THERAPY', // Speech-Language Pathologist
  '237600000X': 'SPEECH_THERAPY', // Audiologist
  '237700000X': 'SPEECH_THERAPY', // Hearing Instrument Specialist

  // ============================================================
  // RESPIRATORY THERAPY (227*, 367*)
  // ============================================================
  '227800000X': 'RESPIRATORY_THERAPY', // Respiratory Therapist - Certified
  '227900000X': 'RESPIRATORY_THERAPY', // Respiratory Therapist - Registered
  '367500000X': 'RESPIRATORY_THERAPY', // Certified Respiratory Therapist
  '367A00000X': 'RESPIRATORY_THERAPY', // Pulmonary Function Technologist
  '367H00000X': 'RESPIRATORY_THERAPY', // Anesthesiologist Assistant

  // ============================================================
  // CHIROPRACTIC (111*)
  // ============================================================
  '111N00000X': 'CHIROPRACTIC', // Chiropractor
  '111NI0013X': 'CHIROPRACTIC', // Chiropractor - Independent Medical Examiner
  '111NI0900X': 'CHIROPRACTIC', // Chiropractor - Internist
  '111NN0400X': 'CHIROPRACTIC', // Chiropractor - Neurology
  '111NN1001X': 'CHIROPRACTIC', // Chiropractor - Nutrition
  '111NP0017X': 'CHIROPRACTIC', // Chiropractor - Pediatric Chiropractor
  '111NR0200X': 'CHIROPRACTIC', // Chiropractor - Radiology
  '111NR0400X': 'CHIROPRACTIC', // Chiropractor - Rehabilitation
  '111NS0005X': 'CHIROPRACTIC', // Chiropractor - Sports Physician
  '111NT0100X': 'CHIROPRACTIC', // Chiropractor - Thermography
  '111NX0100X': 'CHIROPRACTIC', // Chiropractor - Occupational Health
  '111NX0800X': 'CHIROPRACTIC', // Chiropractor - Orthopedic

  // ============================================================
  // ACUPUNCTURE (171*)
  // ============================================================
  '171100000X': 'ACUPUNCTURE', // Acupuncturist

  // ============================================================
  // EMERGENCY MEDICINE (207P*)
  // ============================================================
  '207P00000X': 'EMERGENCY_MEDICINE', // Emergency Medicine
  '207PE0004X': 'EMERGENCY_MEDICINE', // Emergency Medicine - Emergency Medical Services
  '207PE0005X': 'EMERGENCY_MEDICINE', // Emergency Medicine - Undersea and Hyperbaric
  '207PH0002X': 'EMERGENCY_MEDICINE', // Emergency Medicine - Hospice and Palliative
  '207PP0204X': 'EMERGENCY_MEDICINE', // Emergency Medicine - Pediatric Emergency
  '207PS0010X': 'EMERGENCY_MEDICINE', // Emergency Medicine - Sports Medicine
  '207PT0002X': 'EMERGENCY_MEDICINE', // Emergency Medicine - Medical Toxicology

  // ============================================================
  // PEDIATRICS (208*)
  // ============================================================
  '208000000X': 'PEDIATRICS', // Pediatrics
  '2080A0000X': 'PEDIATRICS', // Pediatrics - Adolescent Medicine
  '2080B0002X': 'PEDIATRICS', // Pediatrics - Obesity Medicine
  '2080C0008X': 'PEDIATRICS', // Pediatrics - Child Abuse Pediatrics
  '2080H0002X': 'PEDIATRICS', // Pediatrics - Hospice and Palliative
  '2080I0007X': 'PEDIATRICS', // Pediatrics - Clinical & Lab Immunology
  '2080N0001X': 'PEDIATRICS', // Pediatrics - Neonatal-Perinatal Medicine
  '2080P0006X': 'PEDIATRICS', // Pediatrics - Developmental-Behavioral
  '2080P0008X': 'PEDIATRICS', // Pediatrics - Neurodevelopmental Disabilities
  '2080P0201X': 'PEDIATRICS', // Pediatrics - Pediatric Allergy/Immunology
  '2080P0202X': 'PEDIATRICS', // Pediatrics - Pediatric Cardiology
  '2080P0203X': 'PEDIATRICS', // Pediatrics - Pediatric Critical Care
  '2080P0204X': 'PEDIATRICS', // Pediatrics - Pediatric Emergency Medicine
  '2080P0205X': 'PEDIATRICS', // Pediatrics - Pediatric Endocrinology
  '2080P0206X': 'PEDIATRICS', // Pediatrics - Pediatric Gastroenterology
  '2080P0207X': 'PEDIATRICS', // Pediatrics - Pediatric Hematology-Oncology
  '2080P0208X': 'PEDIATRICS', // Pediatrics - Pediatric Infectious Diseases
  '2080P0210X': 'PEDIATRICS', // Pediatrics - Pediatric Nephrology
  '2080P0214X': 'PEDIATRICS', // Pediatrics - Pediatric Pulmonology
  '2080P0216X': 'PEDIATRICS', // Pediatrics - Pediatric Rheumatology
  '2080S0010X': 'PEDIATRICS', // Pediatrics - Sports Medicine
  '2080S0012X': 'PEDIATRICS', // Pediatrics - Sleep Medicine
  '2080T0002X': 'PEDIATRICS', // Pediatrics - Medical Toxicology
  '2080T0004X': 'PEDIATRICS', // Pediatrics - Pediatric Transplant Hepatology

  // ============================================================
  // ANESTHESIOLOGY (207L*)
  // ============================================================
  '207L00000X': 'ANESTHESIOLOGY', // Anesthesiology
  '207LA0401X': 'ANESTHESIOLOGY', // Anesthesiology - Addiction Medicine
  '207LC0200X': 'ANESTHESIOLOGY', // Anesthesiology - Critical Care Medicine
  '207LH0002X': 'ANESTHESIOLOGY', // Anesthesiology - Hospice and Palliative
  '207LP2900X': 'ANESTHESIOLOGY', // Anesthesiology - Pain Medicine
  '207LP3000X': 'ANESTHESIOLOGY', // Anesthesiology - Pediatric Anesthesiology

  // ============================================================
  // SURGERY (208*)
  // ============================================================
  '208600000X': 'SURGERY', // Surgery
  '2086H0002X': 'SURGERY', // Surgery - Hospice and Palliative Medicine
  '2086S0102X': 'SURGERY', // Surgery - Surgical Critical Care
  '2086S0105X': 'SURGERY', // Surgery - Surgery of the Hand
  '2086S0120X': 'SURGERY', // Surgery - Pediatric Surgery
  '2086S0122X': 'SURGERY', // Surgery - Plastic and Reconstructive Surgery
  '2086S0127X': 'SURGERY', // Surgery - Trauma Surgery
  '2086S0129X': 'SURGERY', // Surgery - Vascular Surgery
  '2086X0206X': 'SURGERY', // Surgery - Surgical Oncology
  '208G00000X': 'SURGERY', // Thoracic Surgery
  '208G00001X': 'SURGERY', // Thoracic Surgery - Congenital Cardiac
  '208M00000X': 'SURGERY', // Hospitalist
  '208VP0000X': 'SURGERY', // Pain Medicine
  '208VP0014X': 'SURGERY', // Pain Medicine - Interventional Pain

  // ============================================================
  // OB/GYN (207V*)
  // ============================================================
  '207V00000X': 'OB_GYN', // Obstetrics & Gynecology
  '207VB0002X': 'OB_GYN', // OB/GYN - Obesity Medicine
  '207VC0200X': 'OB_GYN', // OB/GYN - Critical Care Medicine
  '207VE0102X': 'OB_GYN', // OB/GYN - Reproductive Endocrinology
  '207VF0040X': 'OB_GYN', // OB/GYN - Female Pelvic Medicine
  '207VG0400X': 'OB_GYN', // OB/GYN - Gynecology
  '207VH0002X': 'OB_GYN', // OB/GYN - Hospice and Palliative
  '207VM0101X': 'OB_GYN', // OB/GYN - Maternal & Fetal Medicine
  '207VX0000X': 'OB_GYN', // OB/GYN - Obstetrics
  '207VX0201X': 'OB_GYN', // OB/GYN - Gynecologic Oncology

  // ============================================================
  // CARDIOLOGY — additional codes not in Internal Medicine section
  // ============================================================
  '207RI0001X': 'CARDIOLOGY', // Interventional Cardiology
  '207RY0107X': 'CARDIOLOGY', // Adult Congenital Heart Disease

  // ============================================================
  // RADIOLOGY (2085*)
  // ============================================================
  '2085B0100X': 'RADIOLOGY', // Radiology - Body Imaging
  '2085D0003X': 'RADIOLOGY', // Radiology - Diagnostic Neuroimaging
  '2085H0002X': 'RADIOLOGY', // Radiology - Hospice and Palliative
  '2085N0700X': 'RADIOLOGY', // Radiology - Neuroradiology
  '2085N0904X': 'RADIOLOGY', // Radiology - Nuclear Radiology
  '2085P0229X': 'RADIOLOGY', // Radiology - Pediatric Radiology
  '2085R0001X': 'RADIOLOGY', // Radiology - Radiation Oncology
  '2085R0202X': 'RADIOLOGY', // Radiology - Diagnostic Radiology
  '2085R0203X': 'RADIOLOGY', // Radiology - Therapeutic Radiology
  '2085R0204X': 'RADIOLOGY', // Radiology - Vascular & Interventional
  '2085R0205X': 'RADIOLOGY', // Radiology - Radiological Physics
  '2085U0001X': 'RADIOLOGY', // Radiology - Diagnostic Ultrasound

  // ============================================================
  // DERMATOLOGY (207N*)
  // ============================================================
  '207N00000X': 'DERMATOLOGY', // Dermatology
  '207ND0101X': 'DERMATOLOGY', // Dermatology - MOHS-Micrographic Surgery
  '207ND0900X': 'DERMATOLOGY', // Dermatology - Dermatopathology
  '207NI0002X': 'DERMATOLOGY', // Dermatology - Clinical & Lab Immunology
  '207NP0225X': 'DERMATOLOGY', // Dermatology - Pediatric Dermatology
  '207NS0135X': 'DERMATOLOGY', // Dermatology - Procedural Dermatology

  // ============================================================
  // NEUROLOGY — additional codes not in Psychiatry section
  // ============================================================
  '204D00000X': 'NEUROLOGY', // Neuromusculoskeletal Medicine & OMM
  '204C00000X': 'NEUROLOGY', // Neuromusculoskeletal Medicine, Sports Medicine

  // ============================================================
  // UROLOGY (2088*)
  // ============================================================
  '208800000X': 'UROLOGY', // Urology
  '2088F0040X': 'UROLOGY', // Urology - Female Pelvic Medicine and Reconstructive Surgery
  '2088P0231X': 'UROLOGY', // Urology - Pediatric Urology

  // ============================================================
  // ALLERGY & IMMUNOLOGY (207K*)
  // ============================================================
  '207K00000X': 'ALLERGY_IMMUNOLOGY', // Allergy & Immunology
  '207KA0200X': 'ALLERGY_IMMUNOLOGY', // Allergy & Immunology - Allergy
  '207KI0005X': 'ALLERGY_IMMUNOLOGY', // Allergy & Immunology - Clinical & Lab Immunology

  // ============================================================
  // PATHOLOGY (207Z*)
  // ============================================================
  '207ZB0001X': 'PATHOLOGY', // Pathology - Blood Banking & Transfusion
  '207ZC0006X': 'PATHOLOGY', // Pathology - Clinical Pathology
  '207ZC0008X': 'PATHOLOGY', // Pathology - Clinical Informatics
  '207ZC0500X': 'PATHOLOGY', // Pathology - Cytopathology
  '207ZD0900X': 'PATHOLOGY', // Pathology - Dermatopathology
  '207ZF0201X': 'PATHOLOGY', // Pathology - Forensic Pathology
  '207ZH0000X': 'PATHOLOGY', // Pathology - Hematology
  '207ZI0100X': 'PATHOLOGY', // Pathology - Immunopathology
  '207ZM0300X': 'PATHOLOGY', // Pathology - Medical Microbiology
  '207ZN0500X': 'PATHOLOGY', // Pathology - Neuropathology
  '207ZP0007X': 'PATHOLOGY', // Pathology - Molecular Genetic Pathology
  '207ZP0101X': 'PATHOLOGY', // Pathology - Anatomic Pathology
  '207ZP0102X': 'PATHOLOGY', // Pathology - Anatomic Pathology & Clinical Pathology
  '207ZP0104X': 'PATHOLOGY', // Pathology - Chemical Pathology
  '207ZP0105X': 'PATHOLOGY', // Pathology - Clinical Pathology/Lab Medicine
  '207ZP0213X': 'PATHOLOGY', // Pathology - Pediatric Pathology

  // ============================================================
  // DIETETICS (133*)
  // ============================================================
  '133N00000X': 'DIETETICS', // Nutritionist
  '133NN1002X': 'DIETETICS', // Nutritionist - Nutrition, Education
  '133V00000X': 'DIETETICS', // Dietitian, Registered
  '133VN1004X': 'DIETETICS', // Dietitian - Nutrition, Pediatric
  '133VN1005X': 'DIETETICS', // Dietitian - Nutrition, Renal
  '133VN1006X': 'DIETETICS', // Dietitian - Nutrition, Metabolic
  '136A00000X': 'DIETETICS', // Dietetic Technician, Registered

  // ============================================================
  // LAB/PATHOLOGY TECHNICIANS (374*)
  // ============================================================
  '374700000X': 'LAB_PATHOLOGY', // Technician, Pathology
  '3747A0650X': 'LAB_PATHOLOGY', // Technician, Pathology - Laboratory
  '3747P1801X': 'LAB_PATHOLOGY', // Technician, Pathology - Phlebotomy

  // ============================================================
  // DME & PROSTHETICS (310*, 332*, 335*)
  // ============================================================
  '310400000X': 'DME_PROSTHETICS', // Prosthetics/Orthotics Supplier
  '310500000X': 'DME_PROSTHETICS', // Medical Equipment & Supplies
  '332B00000X': 'DME_PROSTHETICS', // Durable Medical Equipment & Medical Supplies
  '332BC3200X': 'DME_PROSTHETICS', // DME - Customized Equipment
  '332BD1200X': 'DME_PROSTHETICS', // DME - Dialysis Equipment
  '332BN1400X': 'DME_PROSTHETICS', // DME - Nursing Facility Supplies
  '332BP3500X': 'DME_PROSTHETICS', // DME - Parenteral & Enteral Nutrition
  '332BX2000X': 'DME_PROSTHETICS', // DME - Oxygen Equipment
  '335E00000X': 'DME_PROSTHETICS', // Prosthetist
  '335G00000X': 'DME_PROSTHETICS', // Orthotist
  '335U00000X': 'DME_PROSTHETICS', // Prosthetic/Orthotic Supplier
  '335V00000X': 'DME_PROSTHETICS', // Orthotics/Prosthetics Fitter

  // ============================================================
  // OPHTHALMOLOGY (207W*)
  // ============================================================
  '207W00000X': 'OPHTHALMOLOGY', // Ophthalmology
  '207WX0009X': 'OPHTHALMOLOGY', // Glaucoma Specialist
  '207WX0107X': 'OPHTHALMOLOGY', // Retinal Specialist
  '207WX0108X': 'OPHTHALMOLOGY', // Uveitis and Ocular Inflammatory Disease
  '207WX0200X': 'OPHTHALMOLOGY', // Ophthalmic Plastic and Reconstructive Surgery

  // ============================================================
  // PODIATRY (213E*)
  // ============================================================
  '213E00000X': 'PODIATRY', // Podiatrist
  '213EG0000X': 'PODIATRY', // General Practice (Podiatry)
  '213EP0504X': 'PODIATRY', // Public Medicine (Podiatry)
  '213EP1101X': 'PODIATRY', // Primary Podiatric Medicine
  '213ES0000X': 'PODIATRY', // Sports Medicine (Podiatry)
  '213ES0103X': 'PODIATRY', // Foot & Ankle Surgery
  '213ES0131X': 'PODIATRY', // Foot Surgery

  // ============================================================
  // PHYSICAL MEDICINE & REHABILITATION (2081*)
  // ============================================================
  '208100000X': 'PHYSICAL_MEDICINE_REHAB', // Physical Medicine & Rehabilitation
  '2081H0002X': 'PHYSICAL_MEDICINE_REHAB', // PM&R - Hospice and Palliative
  '2081N0008X': 'PHYSICAL_MEDICINE_REHAB', // PM&R - Neuromuscular Medicine
  '2081P0004X': 'PHYSICAL_MEDICINE_REHAB', // PM&R - Spinal Cord Injury
  '2081P0010X': 'PHYSICAL_MEDICINE_REHAB', // PM&R - Pediatric Rehabilitation
  '2081P0301X': 'PHYSICAL_MEDICINE_REHAB', // PM&R - Brain Injury Medicine
  '2081P2900X': 'PHYSICAL_MEDICINE_REHAB', // PM&R - Pain Medicine
  '2081S0010X': 'PHYSICAL_MEDICINE_REHAB', // PM&R - Sports Medicine

  // ============================================================
  // GENERAL PRACTICE (208D*)
  // ============================================================
  '208D00000X': 'GENERAL_PRACTICE', // General Practice

  // ============================================================
  // PLASTIC SURGERY (2082*)
  // ============================================================
  '208200000X': 'PLASTIC_SURGERY', // Plastic Surgery
  '2082S0099X': 'PLASTIC_SURGERY', // Plastic Surgery Within the Head and Neck
  '2082S0105X': 'PLASTIC_SURGERY', // Surgery of the Hand (Plastic Surgery)

  // ============================================================
  // COLON & RECTAL SURGERY (208C*)
  // ============================================================
  '208C00000X': 'COLON_RECTAL_SURGERY', // Colon & Rectal Surgery

  // ============================================================
  // NUCLEAR MEDICINE (207U*)
  // ============================================================
  '207U00000X': 'NUCLEAR_MEDICINE', // Nuclear Medicine
  '207UN0901X': 'NUCLEAR_MEDICINE', // Nuclear Cardiology
  '207UN0903X': 'NUCLEAR_MEDICINE', // In Vivo & In Vitro Nuclear Medicine

  // ============================================================
  // PREVENTIVE MEDICINE (2083*)
  // ============================================================
  '2083A0100X': 'PREVENTIVE_MEDICINE', // Aerospace Medicine
  '2083B0002X': 'PREVENTIVE_MEDICINE', // Obesity Medicine
  '2083C0008X': 'PREVENTIVE_MEDICINE', // Clinical Informatics
  '2083P0011X': 'PREVENTIVE_MEDICINE', // Undersea and Hyperbaric Medicine
  '2083P0500X': 'PREVENTIVE_MEDICINE', // Preventive Medicine/Occupational Environmental
  '2083P0901X': 'PREVENTIVE_MEDICINE', // Public Health & General Preventive Medicine
  '2083S0010X': 'PREVENTIVE_MEDICINE', // Sports Medicine
  '2083T0002X': 'PREVENTIVE_MEDICINE', // Medical Toxicology
  '2083X0100X': 'PREVENTIVE_MEDICINE', // Occupational Medicine

  // ============================================================
  // COMMUNITY HEALTH (172*, 173*, 174*, 175*, 176*, 251*)
  // ============================================================
  '172V00000X': 'COMMUNITY_HEALTH', // Community Health Worker
  '173000000X': 'COMMUNITY_HEALTH', // Legal Medicine
  '173C00000X': 'COMMUNITY_HEALTH', // Reflexologist
  '173F00000X': 'COMMUNITY_HEALTH', // Sleep Specialist, PhD
  '174200000X': 'COMMUNITY_HEALTH', // Meals
  '174400000X': 'COMMUNITY_HEALTH', // Specialist
  '175F00000X': 'COMMUNITY_HEALTH', // Naturopath
  '175L00000X': 'COMMUNITY_HEALTH', // Homeopath
  '175M00000X': 'COMMUNITY_HEALTH', // Midwife, Lay
  '175T00000X': 'COMMUNITY_HEALTH', // Peer Specialist
  '176P00000X': 'COMMUNITY_HEALTH', // Funeral Director
  '177F00000X': 'COMMUNITY_HEALTH', // Lodging
  '251B00000X': 'COMMUNITY_HEALTH', // Case Management Agency
  '251C00000X': 'COMMUNITY_HEALTH', // Day Training/Habilitation Agency
  '251F00000X': 'COMMUNITY_HEALTH', // Home Infusion Agency
  '251J00000X': 'COMMUNITY_HEALTH', // Nursing Care Agency
  '251K00000X': 'COMMUNITY_HEALTH', // Public Health Agency
  '251S00000X': 'COMMUNITY_HEALTH', // Community/Behavioral Health Agency
  '251T00000X': 'COMMUNITY_HEALTH', // PACE Provider
  '251V00000X': 'COMMUNITY_HEALTH', // Voluntary Health Agency
  '251X00000X': 'COMMUNITY_HEALTH', // Supports Brokerage

  // ============================================================
  // HOME HEALTH (251E*)
  // ============================================================
  '251E00000X': 'HOME_HEALTH', // Home Health Agency

  // ============================================================
  // HOSPICE/PALLIATIVE (251G*)
  // ============================================================
  '251G00000X': 'HOSPICE_PALLIATIVE', // Hospice, Community Based

  // ============================================================
  // CLINIC/FACILITY (261Q*)
  // ============================================================
  '261Q00000X': 'CLINIC_FACILITY', // Clinic/Center
  '261QA0005X': 'CLINIC_FACILITY', // Ambulatory Family Planning
  '261QA0006X': 'CLINIC_FACILITY', // Ambulatory Fertility
  '261QA0600X': 'CLINIC_FACILITY', // Adult Day Care
  '261QA0900X': 'CLINIC_FACILITY', // Amputee
  '261QA1903X': 'CLINIC_FACILITY', // Ambulatory Surgical
  '261QA3000X': 'CLINIC_FACILITY', // Augmentative Communication
  '261QB0400X': 'CLINIC_FACILITY', // Birthing
  '261QC0050X': 'CLINIC_FACILITY', // Critical Access Hospital
  '261QC1500X': 'CLINIC_FACILITY', // Community Health
  '261QC1800X': 'CLINIC_FACILITY', // Corporate Health
  '261QD0000X': 'CLINIC_FACILITY', // Dental
  '261QD1600X': 'CLINIC_FACILITY', // Developmental Disabilities
  '261QE0002X': 'CLINIC_FACILITY', // Emergency Care
  '261QE0800X': 'CLINIC_FACILITY', // End-Stage Renal Disease
  '261QF0050X': 'CLINIC_FACILITY', // Family Planning, Non-Surgical
  '261QF0400X': 'CLINIC_FACILITY', // Federally Qualified Health Center
  '261QG0250X': 'CLINIC_FACILITY', // Genetics
  '261QH0100X': 'CLINIC_FACILITY', // Health Service
  '261QH0700X': 'CLINIC_FACILITY', // Hearing and Speech
  '261QI0500X': 'CLINIC_FACILITY', // Infusion Therapy
  '261QL0400X': 'CLINIC_FACILITY', // Lithotripsy
  '261QM0801X': 'CLINIC_FACILITY', // Mental Health (Including Community Mental Health)
  '261QM0850X': 'CLINIC_FACILITY', // Adult Mental Health
  '261QM0855X': 'CLINIC_FACILITY', // Adolescent and Children Mental Health
  '261QM1000X': 'CLINIC_FACILITY', // Migrant Health
  '261QM1100X': 'CLINIC_FACILITY', // Military/US Coast Guard
  '261QM1101X': 'CLINIC_FACILITY', // Military Ambulatory Procedure
  '261QM1102X': 'CLINIC_FACILITY', // Military Outpatient Operational
  '261QM1103X': 'CLINIC_FACILITY', // Military Ambulatory Surgery
  '261QM1200X': 'CLINIC_FACILITY', // MRI
  '261QM1300X': 'CLINIC_FACILITY', // Multi-Specialty
  '261QM2500X': 'CLINIC_FACILITY', // Medical Specialty
  '261QM2800X': 'CLINIC_FACILITY', // Methadone
  '261QM3000X': 'CLINIC_FACILITY', // Medically Fragile Infants and Children Day Care
  '261QP0904X': 'CLINIC_FACILITY', // Public Health, Federal
  '261QP0905X': 'CLINIC_FACILITY', // Public Health, State or Local
  '261QP1100X': 'CLINIC_FACILITY', // Podiatric
  '261QP2000X': 'CLINIC_FACILITY', // Physical Therapy
  '261QP2300X': 'CLINIC_FACILITY', // Primary Care
  '261QP2400X': 'CLINIC_FACILITY', // Prison Health
  '261QP3300X': 'CLINIC_FACILITY', // Pain
  '261QR0200X': 'CLINIC_FACILITY', // Radiology
  '261QR0206X': 'CLINIC_FACILITY', // Radiology, Mammography
  '261QR0207X': 'CLINIC_FACILITY', // Radiology, Mobile Mammography
  '261QR0208X': 'CLINIC_FACILITY', // Radiology, Mobile
  '261QR0400X': 'CLINIC_FACILITY', // Rehabilitation
  '261QR0404X': 'CLINIC_FACILITY', // Rehabilitation, Cardiac
  '261QR0405X': 'CLINIC_FACILITY', // Rehabilitation, Substance Use Disorder
  '261QR0800X': 'CLINIC_FACILITY', // Recovery Care
  '261QR1100X': 'CLINIC_FACILITY', // Research
  '261QR1300X': 'CLINIC_FACILITY', // Rural Health
  '261QS0112X': 'CLINIC_FACILITY', // Oral and Maxillofacial Surgery
  '261QS0132X': 'CLINIC_FACILITY', // Ophthalmologic Surgery
  '261QS1000X': 'CLINIC_FACILITY', // Student Health
  '261QS1200X': 'CLINIC_FACILITY', // Sleep Disorder Diagnostic
  '261QU0200X': 'CLINIC_FACILITY', // Urgent Care
  '261QV0200X': 'CLINIC_FACILITY', // VA
  '261QX0100X': 'CLINIC_FACILITY', // Occupational Medicine
  '261QX0200X': 'CLINIC_FACILITY', // Oncology
  '261QX0203X': 'CLINIC_FACILITY', // Oncology, Radiation

  // ============================================================
  // HOSPITAL (273*, 275*, 276*, 281*, 282*, 283*, 284*, 286*)
  // ============================================================
  '273100000X': 'HOSPITAL', // Epilepsy Unit
  '273R00000X': 'HOSPITAL', // Psychiatric Unit
  '273Y00000X': 'HOSPITAL', // Rehabilitation Unit
  '275N00000X': 'HOSPITAL', // Medicare Defined Swing Bed Unit
  '276400000X': 'HOSPITAL', // Rehabilitation, Substance Use Disorder Unit
  '281P00000X': 'HOSPITAL', // Chronic Disease Hospital
  '281PC2000X': 'HOSPITAL', // Children's Chronic Disease
  '282E00000X': 'HOSPITAL', // Long Term Care Hospital
  '282J00000X': 'HOSPITAL', // Religious Nonmedical Health Care Institution
  '282N00000X': 'HOSPITAL', // General Acute Care Hospital
  '282NC0060X': 'HOSPITAL', // Critical Access
  '282NC2000X': 'HOSPITAL', // Children
  '282NR1301X': 'HOSPITAL', // Rural
  '282NW0100X': 'HOSPITAL', // Women
  '283Q00000X': 'HOSPITAL', // Psychiatric Hospital
  '283X00000X': 'HOSPITAL', // Rehabilitation Hospital
  '283XC2000X': 'HOSPITAL', // Rehabilitation, Children
  '284300000X': 'HOSPITAL', // Special Hospital
  '286500000X': 'HOSPITAL', // Military Hospital
  '287300000X': 'HOSPITAL', // Christian Science Sanatorium

  // ============================================================
  // Skilled Nursing & Residential (311*, 313*, 314*, 315*, 317*, 320*, 322*, 323*, 324*, 331*, 332*, 333*, 341*, 343*, 385*, 390*)
  // ============================================================
  '311500000X': 'HOME_HEALTH', // Alzheimer Center
  '311Z00000X': 'HOME_HEALTH', // Custodial Care Facility
  '313M00000X': 'HOME_HEALTH', // Nursing Facility/Intermediate Care
  '314000000X': 'HOME_HEALTH', // Skilled Nursing Facility
  '315D00000X': 'HOSPICE_PALLIATIVE', // Hospice, Inpatient
  '315P00000X': 'HOSPICE_PALLIATIVE', // Hospice, Extended Care
  '317400000X': 'HOME_HEALTH', // Christian Science Facility
  '320600000X': 'HOME_HEALTH', // Residential Treatment - Intellectual/Developmental Disabilities
  '320700000X': 'HOME_HEALTH', // Residential Treatment - Physical Disabilities
  '320800000X': 'MENTAL_HEALTH', // Residential Treatment - Mental Illness
  '320900000X': 'MENTAL_HEALTH', // Residential Treatment - Mental Retardation/Developmental Disabilities
  '322D00000X': 'HOME_HEALTH', // Residential Treatment - Emotionally Disturbed Children
  '323P00000X': 'MENTAL_HEALTH', // Psychiatric Residential Treatment Facility
  '324500000X': 'MENTAL_HEALTH', // Substance Abuse Rehabilitation Facility
  '331L00000X': 'PHARMACY', // Blood Bank
  '332000000X': 'PHARMACY', // Military/US Coast Guard Pharmacy
  '332100000X': 'PHARMACY', // Department of Veterans Affairs Pharmacy
  '332800000X': 'PHARMACY', // Indian Health Service/Tribal/Urban Indian Health Pharmacy
  '332900000X': 'PHARMACY', // Non-Pharmacy Dispensing Site
  '332G00000X': 'PHARMACY', // Pharmacy - Clinic Pharmacy
  '332H00000X': 'PHARMACY', // Pharmacy - Community/Retail Pharmacy
  '332S00000X': 'PHARMACY', // Pharmacy - Compounding Pharmacy
  '332U00000X': 'PHARMACY', // Home Infusion Therapy Pharmacy
  '333300000X': 'PHARMACY', // Pharmacy - Hospital Pharmacy
  '333600000X': 'PHARMACY', // Pharmacy - Institutional Pharmacy
  '341600000X': 'CLINIC_FACILITY', // Ambulance
  '341800000X': 'CLINIC_FACILITY', // Military/US Coast Guard Transport
  '343800000X': 'CLINIC_FACILITY', // Secure Transportation
  '343900000X': 'CLINIC_FACILITY', // Non-emergency Medical Transport (VAN)
  '344600000X': 'CLINIC_FACILITY', // Taxi
  '344800000X': 'CLINIC_FACILITY', // Air Carrier
  '347B00000X': 'CLINIC_FACILITY', // Bus
  '347C00000X': 'CLINIC_FACILITY', // Private Vehicle
  '347D00000X': 'CLINIC_FACILITY', // Train
  '347E00000X': 'CLINIC_FACILITY', // Transportation Broker
  '385H00000X': 'CLINIC_FACILITY', // Respite Care
  '385HR2050X': 'CLINIC_FACILITY', // Respite Care, Mental Illness, Child
  '385HR2055X': 'CLINIC_FACILITY', // Respite Care, Mental Retardation/Developmental Disabilities, Child
  '385HR2060X': 'CLINIC_FACILITY', // Respite Care, Physical Disabilities, Child
  '385HR2065X': 'CLINIC_FACILITY', // Respite Care, Mental Illness, Adult
  '385HR2070X': 'CLINIC_FACILITY', // Respite Care, Mental Retardation/Developmental Disabilities, Adult
  '385HR2075X': 'CLINIC_FACILITY', // Respite Care, Physical Disabilities, Adult
  '390200000X': 'CLINIC_FACILITY', // Student Health
  '405300000X': 'OTHER', // Prevention Professional

  // ============================================================
  // Group Practice (193*, 291*, 292*, 293*)
  // ============================================================
  '193200000X': 'CLINIC_FACILITY', // Multi-Specialty Group Practice
  '193400000X': 'CLINIC_FACILITY', // Single Specialty Group Practice
  '291900000X': 'LAB_PATHOLOGY', // Laboratory - Military
  '291U00000X': 'LAB_PATHOLOGY', // Clinical Medical Laboratory
  '292200000X': 'LAB_PATHOLOGY', // Dental Laboratory
  '293D00000X': 'LAB_PATHOLOGY', // Physiological Laboratory

  // ============================================================
  // Medical Technicians (24*, 246*, 247*)
  // ============================================================
  '246QB0000X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Blood Banking
  '246QC1000X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Chemistry
  '246QC2700X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Cytotechnology
  '246QH0000X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Hemapheresis Practitioner
  '246QH0401X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Hematology
  '246QH0600X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Histology
  '246QI0000X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Immunology
  '246QL0900X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Laboratory Management
  '246QL0901X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Lab Management, Diplomate
  '246QM0706X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Medical Technologist
  '246QM0900X': 'LAB_PATHOLOGY', // Specialist/Technologist, Pathology - Microbiology
  '247000000X': 'LAB_PATHOLOGY', // Technician, Health Information
  '2470A2800X': 'LAB_PATHOLOGY', // Technician, Health Information - Assessment Specialist
  '247100000X': 'RADIOLOGY', // Technologist, Radiologic
  '2471B0102X': 'RADIOLOGY', // Technologist, Radiologic - Bone Densitometry
  '2471C1101X': 'RADIOLOGY', // Technologist, Radiologic - Cardiovascular-Interventional
  '2471C1106X': 'RADIOLOGY', // Technologist, Radiologic - Cardiac-Interventional
  '2471C3401X': 'RADIOLOGY', // Technologist, Radiologic - Computed Tomography
  '2471C3402X': 'RADIOLOGY', // Technologist, Radiologic - CT
  '2471M1202X': 'RADIOLOGY', // Technologist, Radiologic - Magnetic Resonance Imaging
  '2471M2300X': 'RADIOLOGY', // Technologist, Radiologic - Mammography
  '2471N0900X': 'RADIOLOGY', // Technologist, Radiologic - Nuclear Medicine
  '2471Q0001X': 'RADIOLOGY', // Technologist, Radiologic - Quality Management
  '2471R0002X': 'RADIOLOGY', // Technologist, Radiologic - Radiation Therapy
  '2471S1302X': 'RADIOLOGY', // Technologist, Radiologic - Sonography
  '2471V0105X': 'RADIOLOGY', // Technologist, Radiologic - Vascular-Interventional
  '2471V0106X': 'RADIOLOGY', // Technologist, Radiologic - Vascular Sonography
  '247200000X': 'OTHER', // Technician, Other

  // ============================================================
  // Behavioral Health Day Programs (373*)
  // ============================================================
  '373H00000X': 'MENTAL_HEALTH', // Day Training/Habilitation Specialist

  // ============================================================
  // Other/Catch-all
  // ============================================================
};

/**
 * Prefix-based taxonomy mappings for fallback matching
 * Used when exact taxonomy code is not found in TAXONOMY_TO_SPECIALTY
 * Sorted by length at runtime for correct matching (longest/most specific first)
 */
const PREFIX_MAPPINGS: [string, SpecialtyCategory][] = [
  // Highly specific mappings (9+ chars) - Internal Medicine subspecialties
  ['207RH0003', 'ONCOLOGY'],           // Hematology & Oncology
  ['207RG0100', 'GASTROENTEROLOGY'],   // Gastroenterology
  ['207RI0200', 'INFECTIOUS_DISEASE'], // Infectious Disease
  ['207RI0011', 'ENDOCRINOLOGY'],      // Endocrinology (Internal Med)
  ['261QE0700', 'ENDOCRINOLOGY'],      // Clinic/Center - Endocrinology
  ['261QR0401', 'RHEUMATOLOGY'],       // Clinic/Center - Rheumatology
  ['207RG0300', 'GERIATRICS'],         // Geriatric Medicine (Internal Med)

  // Medium specificity (4-6 chars) - Subspecialties
  ['247100', 'RADIOLOGY'],
  ['207RC', 'CARDIOLOGY'],
  ['2084N', 'NEUROLOGY'],
  ['207RX', 'ONCOLOGY'],
  ['207RP', 'PULMONOLOGY'],
  ['207RN', 'NEPHROLOGY'],
  ['207RE', 'ENDOCRINOLOGY'],
  ['207RR', 'RHEUMATOLOGY'],
  ['207QG', 'GERIATRICS'],

  // Mental Health & Behavioral
  ['101Y', 'MENTAL_HEALTH'],
  ['103', 'PSYCHOLOGY'],
  ['104', 'SOCIAL_WORK'],
  ['106', 'MENTAL_HEALTH'],
  ['2084', 'PSYCHIATRY'],
  ['373', 'MENTAL_HEALTH'],

  // Nursing & Mid-level Providers
  ['163W', 'NURSING'],
  ['164', 'NURSING'],
  ['363L', 'NURSE_PRACTITIONER'],
  ['363A', 'PHYSICIAN_ASSISTANT'],

  // Dental & Vision
  ['122', 'DENTISTRY'],
  ['124', 'DENTISTRY'],
  ['125', 'DENTISTRY'],
  ['126', 'DENTISTRY'],
  ['152W', 'OPTOMETRY'],
  ['156', 'OPTOMETRY'],

  // Pharmacy
  ['183', 'PHARMACY'],
  ['331', 'PHARMACY'],
  ['332', 'PHARMACY'],
  ['333', 'PHARMACY'],

  // Therapy Services
  ['2251', 'PHYSICAL_THERAPY'],
  ['2252', 'PHYSICAL_THERAPY'],
  ['225X', 'OCCUPATIONAL_THERAPY'],
  ['224Z', 'OCCUPATIONAL_THERAPY'],
  ['2257', 'SPEECH_THERAPY'],
  ['235', 'SPEECH_THERAPY'],
  ['237', 'SPEECH_THERAPY'],
  ['367', 'RESPIRATORY_THERAPY'],
  ['111N', 'CHIROPRACTIC'],
  ['1711', 'ACUPUNCTURE'],

  // Medical Specialties
  ['207P', 'EMERGENCY_MEDICINE'],
  ['2080', 'PEDIATRICS'],
  ['207L', 'ANESTHESIOLOGY'],
  ['2086', 'SURGERY'],
  ['208G', 'SURGERY'],
  ['207V', 'OB_GYN'],
  ['2085', 'RADIOLOGY'],
  ['207N', 'DERMATOLOGY'],
  ['2088', 'UROLOGY'],
  ['207K', 'ALLERGY_IMMUNOLOGY'],
  ['207Z', 'PATHOLOGY'],
  ['207X', 'ORTHOPEDICS'],
  ['207Q', 'FAMILY_MEDICINE'],
  ['207R', 'INTERNAL_MEDICINE'],
  ['207W', 'OPHTHALMOLOGY'],
  ['213E', 'PODIATRY'],
  ['2081', 'PHYSICAL_MEDICINE_REHAB'],
  ['208D', 'GENERAL_PRACTICE'],
  ['2082', 'PLASTIC_SURGERY'],
  ['208C', 'COLON_RECTAL_SURGERY'],
  ['207U', 'NUCLEAR_MEDICINE'],
  ['2083', 'PREVENTIVE_MEDICINE'],

  // Support Services
  ['133', 'DIETETICS'],
  ['136', 'DIETETICS'],
  ['374', 'LAB_PATHOLOGY'],
  ['246', 'LAB_PATHOLOGY'],
  ['247', 'LAB_PATHOLOGY'],
  ['291', 'LAB_PATHOLOGY'],
  ['292', 'LAB_PATHOLOGY'],
  ['293', 'LAB_PATHOLOGY'],
  ['310', 'DME_PROSTHETICS'],
  ['332B', 'DME_PROSTHETICS'],
  ['335', 'DME_PROSTHETICS'],
  ['172V', 'COMMUNITY_HEALTH'],
  ['251', 'COMMUNITY_HEALTH'],
  ['171M', 'MIDWIFERY'],
  ['176B', 'MIDWIFERY'],
  ['315', 'HOSPICE_PALLIATIVE'],

  // Facilities
  ['261Q', 'CLINIC_FACILITY'],
  ['193', 'CLINIC_FACILITY'],
  ['390', 'CLINIC_FACILITY'],
  ['27', 'HOSPITAL'],
  ['28', 'HOSPITAL'],
  ['31', 'HOME_HEALTH'],
];

// Pre-sort by prefix length (longest first) for correct matching
// This ensures more specific codes like '207RH0003' match before broader '207R'
const SORTED_PREFIX_MAPPINGS = [...PREFIX_MAPPINGS].sort((a, b) => b[0].length - a[0].length);

/**
 * Get specialty category for a given taxonomy code
 * Uses direct lookup first, then falls back to prefix matching (sorted by specificity)
 *
 * @param taxonomyCode - NPI taxonomy code (e.g., '207RE0101X')
 * @returns SpecialtyCategory - The mapped specialty or 'OTHER' if not found
 */
export function getSpecialtyCategory(taxonomyCode: string | null | undefined): SpecialtyCategory {
  if (!taxonomyCode) return 'OTHER';

  // Direct lookup for exact matches (most accurate)
  if (TAXONOMY_TO_SPECIALTY[taxonomyCode]) {
    return TAXONOMY_TO_SPECIALTY[taxonomyCode];
  }

  // Prefix matching (sorted by length - longest/most specific first)
  for (const [prefix, category] of SORTED_PREFIX_MAPPINGS) {
    if (taxonomyCode.startsWith(prefix)) {
      return category;
    }
  }

  return 'OTHER';
}

/**
 * Taxonomy code descriptions (subset for common codes)
 */
export const TAXONOMY_DESCRIPTIONS: Record<string, string> = {
  // Internal Medicine & Subspecialties
  '207R00000X': 'Internal Medicine',
  '207RA0000X': 'Adolescent Medicine',
  '207RA0001X': 'Advanced Heart Failure & Transplant Cardiology',
  '207RC0000X': 'Cardiovascular Disease',
  '207RC0001X': 'Clinical Cardiac Electrophysiology',
  '207RC0200X': 'Critical Care Medicine',
  '207RE0101X': 'Endocrinology, Diabetes & Metabolism',
  '207RG0100X': 'Gastroenterology',
  '207RG0300X': 'Geriatric Medicine',
  '207RH0000X': 'Hematology',
  '207RH0003X': 'Hematology & Oncology',
  '207RI0001X': 'Interventional Cardiology',
  '207RI0008X': 'Hepatology',
  '207RI0011X': 'Endocrinology',
  '207RI0200X': 'Infectious Disease',
  '207RM1200X': 'Magnetic Resonance Imaging',
  '207RN0300X': 'Nephrology',
  '207RP1001X': 'Pulmonary Disease',
  '207RR0500X': 'Rheumatology',
  '207RX0202X': 'Medical Oncology',
  '207RY0107X': 'Adult Congenital Heart Disease',

  // Family Medicine
  '207Q00000X': 'Family Medicine',
  '207QA0000X': 'Family Medicine - Adolescent Medicine',
  '207QA0401X': 'Family Medicine - Addiction Medicine',
  '207QA0505X': 'Family Medicine - Adult Medicine',
  '207QB0002X': 'Family Medicine - Obesity Medicine',
  '207QG0300X': 'Geriatric Medicine',
  '207QH0002X': 'Hospice & Palliative Medicine',
  '207QS0010X': 'Family Medicine - Sports Medicine',

  // General Practice
  '208D00000X': 'General Practice',

  // Emergency Medicine
  '207P00000X': 'Emergency Medicine',
  '207PE0004X': 'Emergency Medical Services',
  '207PP0204X': 'Pediatric Emergency Medicine',
  '207PS0010X': 'Emergency Medicine - Sports Medicine',

  // Pediatrics
  '208000000X': 'Pediatrics',
  '2080A0000X': 'Pediatrics - Adolescent Medicine',
  '2080C0008X': 'Pediatrics - Child Abuse Pediatrics',
  '2080N0001X': 'Neonatal-Perinatal Medicine',
  '2080P0006X': 'Developmental-Behavioral Pediatrics',
  '2080P0201X': 'Pediatric Allergy & Immunology',
  '2080P0202X': 'Pediatric Cardiology',
  '2080P0203X': 'Pediatric Critical Care',
  '2080P0205X': 'Pediatric Endocrinology',
  '2080P0206X': 'Pediatric Gastroenterology',
  '2080P0207X': 'Pediatric Hematology-Oncology',
  '2080P0210X': 'Pediatric Nephrology',
  '2080P0214X': 'Pediatric Pulmonology',

  // Surgery
  '208600000X': 'Surgery',
  '2086S0102X': 'Surgical Critical Care',
  '2086S0105X': 'Surgery of the Hand',
  '2086S0120X': 'Pediatric Surgery',
  '2086S0122X': 'Plastic & Reconstructive Surgery',
  '2086S0127X': 'Trauma Surgery',
  '2086S0129X': 'Vascular Surgery',
  '2086X0206X': 'Surgical Oncology',
  '208G00000X': 'Thoracic Surgery',
  '208M00000X': 'Hospitalist',
  '208VP0000X': 'Pain Medicine',
  '208VP0014X': 'Interventional Pain Medicine',

  // Orthopedics
  '207X00000X': 'Orthopaedic Surgery',
  '207XS0106X': 'Hand Surgery',
  '207XS0114X': 'Adult Reconstructive Orthopaedic Surgery',
  '207XS0117X': 'Orthopaedic Spine Surgery',
  '207XX0004X': 'Orthopaedic Foot & Ankle Surgery',
  '207XX0005X': 'Sports Medicine',
  '207XX0801X': 'Orthopaedic Trauma',

  // OB/GYN
  '207V00000X': 'Obstetrics & Gynecology',
  '207VE0102X': 'Reproductive Endocrinology',
  '207VG0400X': 'Gynecology',
  '207VM0101X': 'Maternal & Fetal Medicine',
  '207VX0000X': 'Obstetrics',
  '207VX0201X': 'Gynecologic Oncology',

  // Ophthalmology
  '207W00000X': 'Ophthalmology',
  '207WX0009X': 'Glaucoma Specialist',
  '207WX0107X': 'Retinal Specialist',
  '207WX0200X': 'Ophthalmic Plastic & Reconstructive Surgery',

  // Dermatology
  '207N00000X': 'Dermatology',
  '207ND0101X': 'MOHS Micrographic Surgery',
  '207ND0900X': 'Dermatopathology',
  '207NP0225X': 'Pediatric Dermatology',

  // Neurology & Psychiatry
  '2084N0400X': 'Neurology',
  '2084N0402X': 'Child Neurology',
  '2084N0600X': 'Clinical Neurophysiology',
  '2084P0800X': 'Psychiatry',
  '2084P0802X': 'Addiction Psychiatry',
  '2084P0804X': 'Child & Adolescent Psychiatry',
  '2084P0805X': 'Geriatric Psychiatry',
  '2084A0401X': 'Psychiatry - Addiction Medicine',
  '2084S0012X': 'Sleep Medicine',

  // Radiology
  '2085R0202X': 'Diagnostic Radiology',
  '2085R0001X': 'Radiation Oncology',
  '2085R0204X': 'Vascular & Interventional Radiology',
  '2085N0700X': 'Neuroradiology',
  '2085P0229X': 'Pediatric Radiology',

  // Anesthesiology
  '207L00000X': 'Anesthesiology',
  '207LC0200X': 'Anesthesiology - Critical Care',
  '207LP2900X': 'Anesthesiology - Pain Medicine',

  // Urology
  '208800000X': 'Urology',
  '2088P0231X': 'Pediatric Urology',

  // Allergy & Immunology
  '207K00000X': 'Allergy & Immunology',

  // Pathology
  '207ZP0101X': 'Anatomic Pathology',
  '207ZP0102X': 'Anatomic & Clinical Pathology',
  '207ZC0006X': 'Clinical Pathology',

  // Podiatry
  '213E00000X': 'Podiatrist',
  '213EG0000X': 'Podiatrist - General Practice',
  '213ES0103X': 'Podiatrist - Foot & Ankle Surgery',
  '213ES0131X': 'Podiatrist - Foot Surgery',

  // Physical Medicine & Rehabilitation
  '208100000X': 'Physical Medicine & Rehabilitation',
  '2081P2900X': 'PM&R - Pain Medicine',
  '2081S0010X': 'PM&R - Sports Medicine',

  // Plastic Surgery
  '208200000X': 'Plastic Surgery',

  // Colon & Rectal Surgery
  '208C00000X': 'Colon & Rectal Surgery',

  // Nuclear Medicine
  '207U00000X': 'Nuclear Medicine',

  // Preventive Medicine
  '2083P0500X': 'Preventive Medicine',
  '2083P0901X': 'Public Health & General Preventive Medicine',
  '2083X0100X': 'Occupational Medicine',

  // Psychiatry, Psychology & Mental Health
  '103T00000X': 'Psychologist',
  '103TC0700X': 'Clinical Psychologist',
  '103TC1900X': 'Counseling Psychologist',
  '103TH0100X': 'Health Service Psychologist',
  '103TS0200X': 'School Psychologist',
  '103G00000X': 'Clinical Neuropsychologist',
  '101Y00000X': 'Counselor',
  '101YM0800X': 'Mental Health Counselor',
  '101YA0400X': 'Addiction Counselor',
  '104100000X': 'Social Worker',
  '1041C0700X': 'Licensed Clinical Social Worker',
  '106H00000X': 'Marriage & Family Therapist',
  '103K00000X': 'Behavioral Analyst',

  // Nursing
  '163W00000X': 'Registered Nurse',
  '163WP0808X': 'Psychiatric/Mental Health Nurse',
  '163WP0200X': 'Pediatric Nurse',
  '163WC0200X': 'Critical Care Nurse',
  '163WE0003X': 'Emergency Nurse',
  '163WG0600X': 'Gerontology Nurse',
  '164W00000X': 'Licensed Practical Nurse',
  '164X00000X': 'Licensed Vocational Nurse',

  // Nurse Practitioner
  '363L00000X': 'Nurse Practitioner',
  '363LA2100X': 'Nurse Practitioner - Acute Care',
  '363LA2200X': 'Nurse Practitioner - Adult Health',
  '363LC0200X': 'Nurse Practitioner - Critical Care',
  '363LF0000X': 'Nurse Practitioner - Family',
  '363LG0600X': 'Nurse Practitioner - Gerontology',
  '363LN0000X': 'Nurse Practitioner - Neonatal',
  '363LP0200X': 'Nurse Practitioner - Pediatrics',
  '363LP0808X': 'Nurse Practitioner - Psychiatric/Mental Health',
  '363LP2300X': 'Nurse Practitioner - Primary Care',
  '363LW0102X': 'Nurse Practitioner - Women\'s Health',
  '363LX0001X': 'Nurse Practitioner - OB/GYN',

  // Physician Assistant
  '363A00000X': 'Physician Assistant',
  '363AS0400X': 'Physician Assistant - Surgical',

  // CRNA & Midwifery
  '367H00000X': 'Anesthesiologist Assistant',
  '171M00000X': 'Midwife',
  '176B00000X': 'Certified Nurse Midwife',

  // Dentistry
  '122300000X': 'Dentist',
  '1223G0001X': 'General Practice Dentist',
  '1223E0200X': 'Endodontist',
  '1223P0106X': 'Oral & Maxillofacial Pathologist',
  '1223P0221X': 'Pediatric Dentist',
  '1223P0300X': 'Periodontist',
  '1223P0700X': 'Prosthodontist',
  '1223S0112X': 'Oral & Maxillofacial Surgeon',
  '1223X0400X': 'Orthodontist',
  '124Q00000X': 'Dental Hygienist',

  // Optometry
  '152W00000X': 'Optometrist',
  '152WP0200X': 'Optometrist - Pediatrics',

  // Pharmacy
  '183500000X': 'Pharmacist',
  '1835G0000X': 'Pharmacist - General Practice',
  '183700000X': 'Pharmacy Technician',

  // Physical Therapy
  '225100000X': 'Physical Therapist',
  '2251X0800X': 'Physical Therapist - Orthopedic',
  '2251S0007X': 'Physical Therapist - Sports',
  '2251N0400X': 'Physical Therapist - Neurology',
  '225200000X': 'Physical Therapy Assistant',

  // Occupational Therapy
  '225X00000X': 'Occupational Therapist',
  '225XH1200X': 'Occupational Therapist - Hand',
  '225XP0200X': 'Occupational Therapist - Pediatrics',
  '224Z00000X': 'Occupational Therapy Assistant',

  // Speech & Hearing
  '235Z00000X': 'Speech-Language Pathologist',
  '237600000X': 'Audiologist',

  // Respiratory Therapy
  '227800000X': 'Respiratory Therapist',
  '227900000X': 'Respiratory Therapist',
  '367500000X': 'Respiratory Therapist',

  // Chiropractic & Acupuncture
  '111N00000X': 'Chiropractor',
  '171100000X': 'Acupuncturist',

  // Dietetics
  '133V00000X': 'Registered Dietitian',
  '133N00000X': 'Nutritionist',

  // Lab & DME
  '3747P1801X': 'Phlebotomy Technician',
  '332B00000X': 'Durable Medical Equipment',
  '172V00000X': 'Community Health Worker',

  // Facilities
  '261Q00000X': 'Clinic/Center',
  '261QP2300X': 'Primary Care Clinic',
  '261QU0200X': 'Urgent Care Clinic',
  '261QM0801X': 'Mental Health Clinic',
  '261QF0400X': 'Federally Qualified Health Center',
  '282N00000X': 'General Acute Care Hospital',
  '283Q00000X': 'Psychiatric Hospital',
  '283X00000X': 'Rehabilitation Hospital',
  '314000000X': 'Skilled Nursing Facility',
};

/**
 * Get a human-readable description for a taxonomy code.
 * Falls back to the specialty category label if no exact description exists.
 */
export function getTaxonomyDescription(taxonomyCode: string | null | undefined): string | null {
  if (!taxonomyCode) return null;

  // Direct lookup
  if (TAXONOMY_DESCRIPTIONS[taxonomyCode]) {
    return TAXONOMY_DESCRIPTIONS[taxonomyCode];
  }

  // Fall back to category label (e.g., "ENDOCRINOLOGY" → "Endocrinology")
  const category = getSpecialtyCategory(taxonomyCode);
  if (category && category !== 'OTHER') {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  return null;
}
