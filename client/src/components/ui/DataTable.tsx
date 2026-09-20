import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "../../lib/cn";
import { EmptyState } from "./EmptyState";
import { SkeletonTable } from "./Skeleton";

export type Column<Row> = {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: Row) => string | number | null | undefined;
  align?: "start" | "end" | "center";
  /** Tailwind width class, e.g. "w-40". */
  width?: string;
  numeric?: boolean;
};

export type DataTableProps<Row> = {
  columns: ReadonlyArray<Column<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  loading?: boolean;
  empty?: ReactNode;
  density?: "compact" | "regular";
  /** Initial sort column id. */
  defaultSort?: { id: string; dir: "asc" | "desc" };
  onRowClick?: (row: Row) => void;
  caption?: ReactNode;
  className?: string;
  /** Max height with sticky header; omit for natural height. */
  maxHeight?: string;
};

/** Terminal-style data table: sticky header, client-side sort, empty/skeleton states. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  density = "regular",
  defaultSort,
  onRowClick,
  caption,
  className,
  maxHeight
}: DataTableProps<Row>) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const r = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const cellPad = density === "compact" ? "px-3 py-2" : "px-4 py-3";
  const alignClass = (a?: Column<Row>["align"]) =>
    a === "end" ? "text-end" : a === "center" ? "text-center" : "text-start";

  if (loading) return <SkeletonTable rows={6} cols={columns.length} />;

  return (
    <div
      className={cn("overflow-auto rounded-lg border border-hairline bg-surface-2", className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sticky top-0 z-10 bg-surface-1">
          <tr>
            {columns.map((col) => {
              const sortable = Boolean(col.sortValue);
              const active = sort?.id === col.id;
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    cellPad,
                    "border-b border-hairline text-xs font-semibold uppercase tracking-label text-ink-muted",
                    alignClass(col.align),
                    col.width
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) =>
                          s?.id === col.id ? { id: col.id, dir: s.dir === "asc" ? "desc" : "asc" } : { id: col.id, dir: "asc" }
                        )
                      }
                      className="inline-flex items-center gap-1 rounded hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      {col.header}
                      {active ? (
                        sort!.dir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? <EmptyState compact />}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-hairline last:border-b-0 transition-colors duration-fast",
                  onRowClick && "cursor-pointer hover:bg-surface-3"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(cellPad, "text-ink", alignClass(col.align), col.numeric && "font-tnum")}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
