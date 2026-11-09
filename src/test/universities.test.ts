import { describe, expect, it } from "vitest";
import { matchesUniversityEmail } from "@/lib/universities";

describe("matchesUniversityEmail", () => {
  it("accepts only the selected university's student email domain", () => {
    expect(matchesUniversityEmail("student@khi.iba.edu.pk", "iba")).toBe(true);
    expect(matchesUniversityEmail("student@st.habib.edu.pk", "habib")).toBe(true);
    expect(matchesUniversityEmail("student@st.habib.edu.pk", "iba")).toBe(false);
    expect(matchesUniversityEmail("student@khi.iba.edu.pk", "habib")).toBe(false);
  });

  it("rejects other IBA domains and lookalike domains", () => {
    expect(matchesUniversityEmail("student@iba.edu.pk", "iba")).toBe(false);
    expect(matchesUniversityEmail("student@notst.habib.edu.pk", "habib")).toBe(false);
  });

  it("matches domains case-insensitively", () => {
    expect(matchesUniversityEmail("student@ST.HABIB.EDU.PK", "habib")).toBe(true);
  });
});
