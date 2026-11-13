import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorDashboard from "@/pages/VendorDashboard";

const mocks = vi.hoisted(() => ({
  results: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  updates: [] as { table: string; values: unknown; id: string }[],
  updateError: null as { message: string } | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/components/TopBar", () => ({ TopBar: () => null }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ restaurantId: "restaurant-id" }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock("@/integrations/supabase/client", () => {
  class QueryBuilder {
    constructor(private table: string) {}

    select() {
      return this;
    }

    eq() {
      return this;
    }

    order() {
      return this;
    }

    maybeSingle() {
      return Promise.resolve(mocks.results[this.table] ?? { data: null, error: null });
    }

    update(values: unknown) {
      return {
        eq: async (_column: string, id: string) => {
          mocks.updates.push({ table: this.table, values, id });
          return { error: mocks.updateError };
        },
      };
    }

    then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      const result = mocks.results[this.table] ?? { data: [], error: null };
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
  }

  return {
    supabase: {
      from: (table: string) => new QueryBuilder(table),
      channel: () => ({
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
      }),
      removeChannel: vi.fn(),
    },
  };
});

describe("VendorDashboard menu management", () => {
  beforeEach(() => {
    mocks.results = {
      restaurants: { data: { name: "Test Restaurant" }, error: null },
      menu_items: {
        data: [{
          id: "menu-item-id",
          name: "Test Dish",
          description: null,
          price: 20,
          category: "Main",
          is_available: true,
          restaurant_id: "restaurant-id",
        }],
        error: null,
      },
      orders: { data: [], error: null },
    };
    mocks.updates = [];
    mocks.updateError = null;
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("opens the menu tab, loads items, and keeps price and availability controls working", async () => {
    render(<VendorDashboard />);
    await screen.findByText("Test Restaurant");
    const menuTab = screen.getByRole("tab", { name: "Menu manager" });
    fireEvent.mouseDown(menuTab, { button: 0, ctrlKey: false });

    expect(await screen.findByText("Test Dish")).toBeInTheDocument();
    expect(menuTab).toHaveAttribute("aria-selected", "true");

    const itemPrice = screen.getByRole("spinbutton", { name: "Price for Test Dish" });
    fireEvent.change(itemPrice, { target: { value: "25" } });
    fireEvent.blur(itemPrice);
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(mocks.updates).toHaveLength(2));
    expect(mocks.updates).toContainEqual({
      table: "menu_items",
      values: { price: 25 },
      id: "menu-item-id",
    });
    expect(mocks.updates).toContainEqual({
      table: "menu_items",
      values: { is_available: false },
      id: "menu-item-id",
    });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("shows a helpful message when the menu is empty", async () => {
    mocks.results.menu_items = { data: [], error: null };
    render(<VendorDashboard />);
    await screen.findByText("Test Restaurant");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Menu manager" }), { button: 0, ctrlKey: false });

    expect(await screen.findByText(/No menu items have been added to this restaurant yet/)).toBeInTheDocument();
  });

  it("shows a visible error when menu loading fails", async () => {
    mocks.results.menu_items = { data: null, error: { message: "permission denied" } };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<VendorDashboard />);
    await screen.findByText("Test Restaurant");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Menu manager" }), { button: 0, ctrlKey: false });

    expect(await screen.findByText(/Menu items could not be loaded/)).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith("Unable to load vendor menu:", "permission denied");
    consoleError.mockRestore();
  });
});
