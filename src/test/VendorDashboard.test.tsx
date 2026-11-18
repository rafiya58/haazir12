import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VendorDashboard from "@/pages/VendorDashboard";

const mocks = vi.hoisted(() => ({
  results: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  updates: [] as { table: string; values: unknown; id: string }[],
  deletes: [] as { table: string; id: string }[],
  updateError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
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

    delete() {
      return {
        eq: async (_column: string, id: string) => {
          mocks.deletes.push({ table: this.table, id });
          return { error: mocks.deleteError };
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
    mocks.deletes = [];
    mocks.updateError = null;
    mocks.deleteError = null;
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("saves menu item name and price while keeping availability controls working", async () => {
    render(<VendorDashboard />);
    await screen.findByText("Test Restaurant");
    const menuTab = screen.getByRole("tab", { name: "Menu manager" });
    fireEvent.mouseDown(menuTab, { button: 0, ctrlKey: false });

    expect(await screen.findByRole("textbox", { name: "Name for Test Dish" })).toHaveValue("Test Dish");
    expect(menuTab).toHaveAttribute("aria-selected", "true");

    fireEvent.change(screen.getByRole("textbox", { name: "Name for Test Dish" }), { target: { value: "Updated Dish" } });
    const itemPrice = screen.getByRole("spinbutton", { name: "Price for Test Dish" });
    fireEvent.change(itemPrice, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(mocks.updates).toHaveLength(2));
    expect(mocks.updates).toContainEqual({
      table: "menu_items",
      values: { name: "Updated Dish", price: 25 },
      id: "menu-item-id",
    });
    expect(mocks.updates).toContainEqual({
      table: "menu_items",
      values: { is_available: false },
      id: "menu-item-id",
    });
    expect(screen.getByRole("textbox", { name: "Name for Updated Dish" })).toHaveValue("Updated Dish");
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

  it("deletes the selected menu item", async () => {
    render(<VendorDashboard />);
    await screen.findByText("Test Restaurant");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Menu manager" }), { button: 0, ctrlKey: false });
    await screen.findByRole("textbox", { name: "Name for Test Dish" });

    fireEvent.click(screen.getByRole("button", { name: "Delete Test Dish" }));

    await waitFor(() => expect(mocks.deletes).toEqual([{ table: "menu_items", id: "menu-item-id" }]));
    expect(await screen.findByText(/No menu items have been added to this restaurant yet/)).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Test Dish deleted from your menu");
  });

  it("keeps the item and shows the database error when deletion is blocked", async () => {
    mocks.deleteError = { message: "Cannot delete a menu item that is part of an accepted active order." };
    render(<VendorDashboard />);
    await screen.findByText("Test Restaurant");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Menu manager" }), { button: 0, ctrlKey: false });
    await screen.findByRole("textbox", { name: "Name for Test Dish" });

    fireEvent.click(screen.getByRole("button", { name: "Delete Test Dish" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(mocks.deleteError?.message));
    expect(screen.getByRole("textbox", { name: "Name for Test Dish" })).toHaveValue("Test Dish");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
