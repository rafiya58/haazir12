import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentHome from "@/pages/StudentHome";

const mocks = vi.hoisted(() => ({
  studentUniversityIds: ["iba"],
  restaurants: [{
    id: "iba-vendor",
    name: "IBA Vendor",
    slug: "iba-vendor",
    cuisine: "Cafe",
    emoji: null,
    description: null,
    is_open: true,
    university_id: "iba",
  }],
  campusFilter: vi.fn(),
}));

vi.mock("@/components/TopBar", () => ({ TopBar: () => null }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ studentUniversityIds: mocks.studentUniversityIds }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select() {
        return this;
      },
      in(column: string, values: string[]) {
        mocks.campusFilter(column, values);
        return this;
      },
      order() {
        return Promise.resolve({ data: mocks.restaurants, error: null });
      },
    }),
  },
}));

describe("StudentHome university scope", () => {
  beforeEach(() => {
    mocks.studentUniversityIds = ["iba"];
    mocks.campusFilter.mockReset();
  });

  it("loads only restaurants registered with the student's university", async () => {
    render(
      <MemoryRouter>
        <StudentHome />
      </MemoryRouter>,
    );

    expect(await screen.findByText("IBA Vendor")).toBeInTheDocument();
    expect(mocks.campusFilter).toHaveBeenCalledWith("university_id", ["iba"]);
  });

  it("does not load or display restaurants without a student university", async () => {
    mocks.studentUniversityIds = [];
    render(
      <MemoryRouter>
        <StudentHome />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/not linked to a university yet/)).toBeInTheDocument();
    expect(mocks.campusFilter).not.toHaveBeenCalled();
  });
});
