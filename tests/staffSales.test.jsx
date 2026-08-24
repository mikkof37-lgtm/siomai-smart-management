import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StaffSales from "../src/pages/StaffSales";

const salesMock = vi.hoisted(() => ({
  addSalesBatch: vi.fn(),
  correctSaleRecord: vi.fn(),
  saleCorrections: []
}));

vi.mock("../src/components/Sidebar", () => ({
  default: () => <aside>Sidebar</aside>
}));

vi.mock("../src/components/TopBar", () => ({
  default: ({ title }) => <header>{title}</header>
}));

vi.mock("../src/context/InventoryContext", () => ({
  useInventory: () => ({
    inventory: [
      {
        id: 7,
        name: "Chili Garlic Sauce (Gallon)",
        stock: 12,
        unit: "gallon",
        threshold: 10,
        price: 80
      },
      {
        id: 1,
        name: "Regular Pork Siomai",
        stock: 45,
        unit: "packs",
        threshold: 100,
        price: 120
      }
    ]
  })
}));

vi.mock("../src/context/SalesContext", () => ({
  useSales: () => ({
    salesHistory: [
      {
        id: "sale-1",
        branch: "Talavera 2",
        product: "Chili Garlic Sauce (Gallon)",
        qty: 1,
        price: 80,
        date: "Jul 29, 2026"
      }
    ],
    addSalesBatch: salesMock.addSalesBatch,
    correctSaleRecord: salesMock.correctSaleRecord,
    saleCorrections: salesMock.saleCorrections
  })
}));

const currentUser = {
  email: "cashier@example.com",
  user_metadata: {
    role: "cashier",
    default_branch: "Talavera 2"
  }
};

beforeEach(() => {
  salesMock.addSalesBatch.mockClear();
  salesMock.correctSaleRecord.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ sent: true, recipientEmail: "owner@example.com" })
    }))
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("StaffSales sale entry flow", () => {
  test("records a batch receipt and sends the email", async () => {
    const user = userEvent.setup();

    render(<StaffSales currentUser={currentUser} onLogout={vi.fn()} />);

    const branchSelect = screen.getByLabelText("Branch");
    const firstProductInput = screen.getByLabelText("Product");
    const firstQtyInput = screen.getByLabelText("Qty");
    const notesInput = screen.getByPlaceholderText("Optional notes for this sale");
    const addItemButton = screen.getByRole("button", { name: "Add item" });
    const submitButton = screen.getByRole("button", { name: "Record Sale" });

    await waitFor(() => {
      expect(branchSelect).toHaveValue("Talavera 2");
    });

    await user.selectOptions(branchSelect, "Talavera 2");
    await user.selectOptions(firstProductInput, "Chili Garlic Sauce (Gallon)");
    fireEvent.change(firstQtyInput, { target: { value: "2" } });
    expect(firstQtyInput).toHaveValue(2);
    await user.click(addItemButton);
    await waitFor(() => {
      expect(screen.getAllByLabelText("Product")[1]).toHaveFocus();
    });
    const secondProductInput = screen.getAllByLabelText("Product")[1];
    const secondQtyInput = screen.getAllByLabelText("Qty")[1];
    await user.selectOptions(secondProductInput, "Regular Pork Siomai");
    fireEvent.change(secondQtyInput, { target: { value: "3" } });
    expect(secondQtyInput).toHaveValue(3);
    await user.type(notesInput, "Test sale");
    await user.click(submitButton);

    expect(salesMock.addSalesBatch).toHaveBeenCalledTimes(1);
    const batch = salesMock.addSalesBatch.mock.calls[0][0];
    expect(batch).toHaveLength(2);
    expect(batch[0]).toMatchObject({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      branch: "Talavera 2",
      product: "Chili Garlic Sauce (Gallon)",
      qty: 2,
      price: 80,
      notes: "Test sale",
      inventoryItemId: 7,
      inventoryItemName: "Chili Garlic Sauce (Gallon)",
      inventoryQty: 2
    });
    expect(batch[1]).toMatchObject({
      branch: "Talavera 2",
      product: "Regular Pork Siomai",
      qty: 3,
      notes: "Test sale",
      inventoryItemId: 1,
      inventoryItemName: "Regular Pork Siomai",
      inventoryQty: 0.003
    });
    expect(batch[1].price).toBeCloseTo(16 / 3, 5);
    await waitFor(() => {
      expect(screen.getByLabelText("Branch")).toHaveValue("Talavera 2");
      expect(screen.getAllByLabelText("Product")[0]).toHaveValue("");
      expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
      expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(1);
      expect(notesInput).toHaveValue("");
    });
    expect(await screen.findByText("Sale saved for Talavera 2.")).toBeInTheDocument();
  });

  test("corrects a specific recent sale line item", async () => {
    const user = userEvent.setup();

    render(<StaffSales currentUser={currentUser} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Branch")).toHaveValue("Talavera 2");
    });

    await user.click(
      screen.getByRole("button", { name: "Correct Chili Garlic Sauce (Gallon) sale" })
    );

    const correctionProductInput = screen.getByLabelText("Correction Product");
    const correctionQtyInput = screen.getByLabelText("Correction Qty");
    const reasonInput = screen.getByLabelText("Reason for correction");
    const saveButton = screen.getByRole("button", { name: "Save correction" });

    expect(correctionProductInput).toHaveValue("Chili Garlic Sauce (Gallon)");
    expect(correctionQtyInput).toHaveValue(1);

    fireEvent.change(correctionQtyInput, { target: { value: "2" } });
    await user.type(reasonInput, "Wrong quantity entered");
    salesMock.correctSaleRecord.mockReturnValue({
      id: "sale-1",
      branch: "Talavera 2",
      product: "Chili Garlic Sauce (Gallon)",
      qty: 2
    });
    await user.click(saveButton);

    expect(salesMock.correctSaleRecord).toHaveBeenCalledWith(
      "sale-1",
      expect.objectContaining({
        product: "Chili Garlic Sauce (Gallon)",
        qty: 2,
        price: 80,
        inventoryItemId: 7,
        inventoryItemName: "Chili Garlic Sauce (Gallon)",
        inventoryQty: 2
      }),
      "Wrong quantity entered"
    );
    expect(
      await screen.findByText(
        "Corrected Chili Garlic Sauce (Gallon) for Talavera 2. Reason: Wrong quantity entered."
      )
    ).toBeInTheDocument();
  });
});
