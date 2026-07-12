import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Page } from "@/api/client";
import { renderWithProviders } from "@/test-utils/render";
import { DataTable, type DataTableColumn } from "../data-table";
import { useAdminList, type AdminListParams } from "../use-admin-list";

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", render: (row) => row.name },
];

function makePage(items: Row[], nextCursor: string | null): Page<Row> {
  return {
    items,
    page: { nextCursor, hasMore: nextCursor !== null, total: items.length },
  };
}

/** A harness wiring the list controller to the table, like a real screen. */
function Harness({
  fetchPage,
}: {
  fetchPage: (params: AdminListParams) => Promise<Page<Row>>;
}) {
  const list = useAdminList<Row>({ queryKey: "test-rows", fetchPage });
  return (
    <DataTable
      columns={columns}
      data={list.items}
      getRowId={(row) => row.id}
      isLoading={list.isLoading}
      isError={list.isError}
      error={list.error}
      search={list.search}
      onSearchChange={list.onSearchChange}
      page={list.page}
      onNext={list.onNext}
      onPrev={list.onPrev}
      canPrev={list.canPrev}
      canNext={list.canNext}
    />
  );
}

describe("DataTable + useAdminList", () => {
  it("renders rows returned by the API", async () => {
    const fetchPage = vi
      .fn<(params: AdminListParams) => Promise<Page<Row>>>()
      .mockResolvedValue(makePage([{ id: "1", name: "Alice" }], null));

    renderWithProviders(<Harness fetchPage={fetchPage} />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
  });

  it("calls the API with the search term", async () => {
    const fetchPage = vi
      .fn<(params: AdminListParams) => Promise<Page<Row>>>()
      .mockResolvedValue(makePage([{ id: "1", name: "Alice" }], null));

    renderWithProviders(<Harness fetchPage={fetchPage} />);
    await screen.findByText("Alice");

    await userEvent.type(screen.getByLabelText("Search"), "bob");

    await waitFor(() => {
      expect(fetchPage).toHaveBeenCalledWith(
        expect.objectContaining({ search: "bob" }),
      );
    });
  });

  it("advances to the next page using the returned cursor", async () => {
    const fetchPage = vi
      .fn<(params: AdminListParams) => Promise<Page<Row>>>()
      .mockImplementation((params) =>
        Promise.resolve(
          params.cursor === "cursor-2"
            ? makePage([{ id: "2", name: "Bianca" }], null)
            : makePage([{ id: "1", name: "Alice" }], "cursor-2"),
        ),
      );

    renderWithProviders(<Harness fetchPage={fetchPage} />);
    await screen.findByText("Alice");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Bianca")).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "cursor-2" }),
    );
  });

  it("shows an empty state when there are no records", async () => {
    const fetchPage = vi
      .fn<(params: AdminListParams) => Promise<Page<Row>>>()
      .mockResolvedValue(makePage([], null));

    renderWithProviders(<Harness fetchPage={fetchPage} />);

    expect(await screen.findByText("No records found.")).toBeInTheDocument();
  });
});
