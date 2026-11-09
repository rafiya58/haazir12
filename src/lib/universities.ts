export const universities = {
  iba: { name: "IBA", domain: "khi.iba.edu.pk" },
  habib: { name: "Habib University", domain: "st.habib.edu.pk" },
} as const;

export type UniversityId = keyof typeof universities;

export const matchesUniversityEmail = (email: string, university: UniversityId) =>
  email.trim().toLowerCase().endsWith(`@${universities[university].domain}`);
