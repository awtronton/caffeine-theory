import { useEffect, useMemo, useState } from "react";
import { Button } from "@vibe/core";
import {
  Columns3,
  Database,
  Eye,
  EyeOff,
  GitBranch,
  LockKeyhole,
  PencilLine,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import DashboardLayout from "../layouts/DashboardLayout";
import {
  deleteWarehouseTable,
  getTableDetail,
  getTableLineage,
  getTableLineageGraph,
  getTableSummaries,
  renameTableColumn,
  setTableColumnMasking,
} from "../services/dataWarehouseService";

import "../styles/data-tables-vibe.css";

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("id-ID").format(Number(value));
}

function periodLabel(table) {
  if (!table?.min_year && !table?.max_year) {
    return "-";
  }

  if (table.min_year === table.max_year) {
    return String(table.min_year);
  }

  return `${table.min_year ?? "-"}–${table.max_year ?? "-"}`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function buildLineageGraphLayout(graph) {
  const graphNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const graphEdges = Array.isArray(graph?.edges) ? graph.edges : [];

  if (graphNodes.length === 0) {
    return {
      width: 0,
      height: 0,
      nodes: [],
      edges: [],
    };
  }

  const nodeWidth = 176;
  const nodeHeight = 58;
  const horizontalGap = 86;
  const verticalGap = 18;
  const paddingX = 20;
  const paddingY = 18;

  const maxDepth = Math.max(
    ...graphNodes.map((node) => Number(node.depth || 0)),
  );

  const levels = new Map();

  graphNodes.forEach((node) => {
    const depth = Number(node.depth || 0);

    if (!levels.has(depth)) {
      levels.set(depth, []);
    }

    levels.get(depth).push(node);
  });

  levels.forEach((nodes) => {
    nodes.sort((left, right) =>
      left.table_name.localeCompare(right.table_name),
    );
  });

  const maxLevelSize = Math.max(
    ...Array.from(levels.values()).map((nodes) => nodes.length),
  );

  const innerHeight =
    maxLevelSize * nodeHeight + Math.max(0, maxLevelSize - 1) * verticalGap;

  const positioned = [];
  const positionById = new Map();

  for (let depth = maxDepth; depth >= 0; depth -= 1) {
    const nodes = levels.get(depth) || [];
    const columnIndex = maxDepth - depth;
    const columnHeight =
      nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * verticalGap;
    const columnStartY =
      paddingY + Math.max(0, (innerHeight - columnHeight) / 2);

    nodes.forEach((node, index) => {
      const x = paddingX + columnIndex * (nodeWidth + horizontalGap);
      const y = columnStartY + index * (nodeHeight + verticalGap);

      const positionedNode = {
        ...node,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      };

      positioned.push(positionedNode);
      positionById.set(node.table_name, positionedNode);
    });
  }

  const edges = graphEdges
    .map((edge) => {
      const source = positionById.get(edge.source);
      const target = positionById.get(edge.target);

      if (!source || !target) {
        return null;
      }

      return {
        ...edge,
        x1: source.x + source.width,
        y1: source.y + source.height / 2,
        x2: target.x,
        y2: target.y + target.height / 2,
      };
    })
    .filter(Boolean);

  return {
    width: paddingX * 2 + (maxDepth + 1) * nodeWidth + maxDepth * horizontalGap,
    height: paddingY * 2 + Math.max(innerHeight, nodeHeight),
    nodes: positioned,
    edges,
  };
}

function DataTables() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [tableSearchOpen, setTableSearchOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");

  const [selectedTable, setSelectedTable] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lineage, setLineage] = useState(null);
  const [lineageError, setLineageError] = useState("");
  const [lineageGraph, setLineageGraph] = useState(null);
  const [lineageGraphError, setLineageGraphError] = useState("");
  const [lineageMapOpen, setLineageMapOpen] = useState(true);

  const [editingColumn, setEditingColumn] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [maskingColumn, setMaskingColumn] = useState("");
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filteredTables = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return tables;
    }

    return tables.filter((table) =>
      table.table_name.toLowerCase().includes(keyword),
    );
  }, [tables, search]);

  const filteredColumns = useMemo(() => {
    const columns = Array.isArray(detail?.columns) ? detail.columns : [];
    const keyword = columnSearch.trim().toLowerCase();

    if (!keyword) {
      return columns;
    }

    return columns.filter((column) =>
      String(column.column_name || "")
        .toLowerCase()
        .includes(keyword),
    );
  }, [detail?.columns, columnSearch]);

  const lineageGraphLayout = useMemo(
    () => buildLineageGraphLayout(lineageGraph),
    [lineageGraph],
  );

  async function loadTables({ preserveSelection = true } = {}) {
    try {
      setLoading(true);
      setLoadError("");

      const result = await getTableSummaries();
      const rows = Array.isArray(result?.tables) ? result.tables : [];

      setTables(rows);

      if (
        preserveSelection &&
        selectedTable &&
        rows.some((item) => item.table_name === selectedTable)
      ) {
        return;
      }

      if (rows.length > 0) {
        await selectTable(rows[0].table_name);
      } else {
        setSelectedTable("");
        setDetail(null);
        setLineage(null);
        setLineageError("");
        setLineageGraph(null);
        setLineageGraphError("");
      }
    } catch (error) {
      console.error(error);
      setLoadError(error.message || "Gagal membaca Data Tables.");
    } finally {
      setLoading(false);
    }
  }

  async function selectTable(tableName) {
    try {
      setSelectedTable(tableName);
      setColumnSearch("");
      setEditingColumn("");
      setEditingValue("");
      setMessage("");
      setDetailLoading(true);
      setLineageError("");
      setLineageGraphError("");

      const [detailResult, lineageResult, graphResult] = await Promise.all([
        getTableDetail(tableName),
        getTableLineage(tableName).catch((error) => {
          console.error(error);

          return {
            lineage: null,
            lineageError: error.message || "Gagal membaca data lineage.",
          };
        }),
        getTableLineageGraph(tableName, {
          maxDepth: 8,
        }).catch((error) => {
          console.error(error);

          return {
            graph: null,
            graphError: error.message || "Gagal membaca lineage graph.",
          };
        }),
      ]);

      setDetail(detailResult);
      setLineage(lineageResult?.lineage || null);
      setLineageError(lineageResult?.lineageError || "");
      setLineageGraph(graphResult?.graph || null);
      setLineageGraphError(graphResult?.graphError || "");
    } catch (error) {
      console.error(error);
      setDetail(null);
      setLineage(null);
      setLineageError("");
      setLineageGraph(null);
      setLineageGraphError("");
      setMessage(error.message || "Gagal membaca detail tabel.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadTables({
      preserveSelection: false,
    });
  }, []);

  function startRename(column) {
    setEditingColumn(column.column_name);
    setEditingValue(column.column_name);
    setMessage("");
  }

  function cancelRename() {
    setEditingColumn("");
    setEditingValue("");
  }

  async function saveRename(column) {
    const nextName = editingValue.trim();

    if (!nextName) {
      setMessage("Nama kolom baru tidak boleh kosong.");
      return;
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nextName)) {
      setMessage(
        "Gunakan huruf, angka, dan underscore; nama kolom tidak boleh diawali angka.",
      );
      return;
    }

    if (nextName === column.column_name) {
      cancelRename();
      return;
    }

    const duplicate = detail?.columns?.some(
      (item) =>
        item.column_name.toLowerCase() === nextName.toLowerCase() &&
        item.column_name !== column.column_name,
    );

    if (duplicate) {
      setMessage(`Kolom '${nextName}' sudah tersedia.`);
      return;
    }

    const confirmed = window.confirm(
      `Ubah nama kolom?\n\n` +
        `Tabel: ${selectedTable}\n` +
        `${column.column_name} → ${nextName}\n\n` +
        "Perubahan akan diterapkan pada PostgreSQL dan schema mapping.",
    );

    if (!confirmed) return;

    try {
      setRenameLoading(true);
      setMessage("");

      await renameTableColumn({
        tableName: selectedTable,
        oldName: column.column_name,
        newName: nextName,
      });

      await selectTable(selectedTable);
      await loadTables();

      setMessage(
        `Kolom '${column.column_name}' berhasil diubah menjadi '${nextName}'.`,
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Gagal mengubah nama kolom.");
    } finally {
      setRenameLoading(false);
      setEditingColumn("");
      setEditingValue("");
    }
  }

  async function toggleMasking(column) {
    if (!column.maskable) return;

    const nextMasked = !column.masked;

    if (!nextMasked) {
      const confirmed = window.confirm(
        `Tampilkan kembali data asli?\n\n` +
          `Tabel: ${selectedTable}\n` +
          `Kolom: ${column.column_name}\n\n` +
          "Data pada kolom ini akan kembali terlihat di Table Explorer.",
      );

      if (!confirmed) return;
    }

    try {
      setMaskingColumn(column.column_name);
      setMessage("");

      await setTableColumnMasking({
        tableName: selectedTable,
        columnName: column.column_name,
        masked: nextMasked,
      });

      await selectTable(selectedTable);

      setMessage(
        nextMasked
          ? `Kolom '${column.column_name}' sekarang dimasking di Table Explorer.`
          : `Masking kolom '${column.column_name}' telah dinonaktifkan.`,
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Gagal memperbarui masking kolom.");
    } finally {
      setMaskingColumn("");
    }
  }

  function openDeleteTable() {
    if (!selectedTable || !detail?.summary) return;

    setDeleteTarget({
      ...detail.summary,
      table_name: selectedTable,
    });
    setDeleteConfirmValue("");
    setMessage("");
  }

  function closeDeleteTable() {
    if (deleteLoading) return;

    setDeleteTarget(null);
    setDeleteConfirmValue("");
  }

  async function confirmDeleteTable() {
    if (!deleteTarget) return;

    const targetName = deleteTarget.table_name;

    if (deleteConfirmValue.trim() !== targetName) {
      return;
    }

    try {
      setDeleteLoading(true);
      setMessage("");

      const result = await deleteWarehouseTable(targetName);
      const removedRelationships = Number(
        result?.metadata_removed?.relationships || 0,
      );

      setDeleteTarget(null);
      setDeleteConfirmValue("");
      setSelectedTable("");
      setDetail(null);
      setLineage(null);
      setLineageError("");
      setLineageGraph(null);
      setLineageGraphError("");

      await loadTables({
        preserveSelection: false,
      });

      setMessage(
        `Tabel '${targetName}' berhasil dihapus permanen. ` +
          `${formatNumber(result?.row_count || 0)} baris dan ` +
          `${formatNumber(result?.column_count || 0)} kolom dihapus` +
          (removedRelationships > 0
            ? ` bersama ${formatNumber(removedRelationships)} relationship terkait.`
            : "."),
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || `Gagal menghapus tabel '${targetName}'.`);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <main className="tp-data-tables mx-auto w-full max-w-[1480px] space-y-5">
        {message && <div className="tp-data-message">{message}</div>}

        <section className="tp-data-tables-grid">
          <div className="tp-data-catalog">
            <div className="tp-data-panel-header">
              <div>
                <div className="tp-column-review-eyebrow">Table Catalog</div>

                <p>{tables.length} tabel tersedia di PostgreSQL.</p>
              </div>

              <div className="tp-catalog-header-actions">
                <div className="tp-catalog-search-anchor">
                  <button
                    type="button"
                    className={`tp-data-icon-button tp-catalog-search-trigger ${
                      tableSearchOpen ? "is-active" : ""
                    }`}
                    onClick={() => {
                      if (tableSearchOpen) {
                        setTableSearchOpen(false);
                        setSearch("");
                        return;
                      }

                      setTableSearchOpen(true);
                    }}
                    title={tableSearchOpen ? "Tutup pencarian" : "Cari tabel"}
                    aria-label={
                      tableSearchOpen
                        ? "Tutup pencarian tabel"
                        : "Buka pencarian tabel"
                    }
                    aria-expanded={tableSearchOpen}
                  >
                    <Search size={16} />
                  </button>

                  {tableSearchOpen && (
                    <div className="tp-catalog-search-popover">
                      <Search size={15} aria-hidden="true" />

                      <input
                        autoFocus
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setTableSearchOpen(false);
                            setSearch("");
                          }
                        }}
                        placeholder="Cari nama tabel..."
                        aria-label="Cari nama tabel"
                      />

                      {search && (
                        <button
                          type="button"
                          className="tp-catalog-search-clear"
                          onClick={() => setSearch("")}
                          title="Hapus pencarian"
                          aria-label="Hapus pencarian"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="tp-data-icon-button"
                  onClick={() => loadTables()}
                  disabled={loading}
                  title="Refresh"
                  aria-label="Refresh Data Tables"
                >
                  <RefreshCw
                    size={16}
                    className={loading ? "animate-spin" : ""}
                  />
                </button>
              </div>
            </div>

            {loadError && <div className="tp-data-error">{loadError}</div>}

            <div className="tp-data-catalog-table-wrap">
              <table className="tp-data-catalog-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th className="text-right">Rows</th>
                    <th className="text-right">Columns</th>
                    <th className="text-right">Banks</th>
                    <th>Period</th>
                    <th>Schema</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTables.map((table) => (
                    <tr
                      key={table.table_name}
                      className={
                        selectedTable === table.table_name ? "is-selected" : ""
                      }
                      onClick={() => selectTable(table.table_name)}
                    >
                      <td>
                        <div className="tp-table-name">
                          <Database size={14} />
                          {table.table_name}
                        </div>
                      </td>

                      <td className="text-right">
                        {formatNumber(table.row_count)}
                      </td>

                      <td className="text-right">
                        {formatNumber(table.column_count)}
                      </td>

                      <td className="text-right">
                        {formatNumber(table.bank_count)}
                      </td>

                      <td>{periodLabel(table)}</td>

                      <td>
                        <span
                          className={`tp-schema-badge ${
                            table.schema_status === "mapped" ? "is-mapped" : ""
                          }`}
                        >
                          {table.schema_status === "mapped"
                            ? "Mapped"
                            : "Unmapped"}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {!loading && filteredTables.length === 0 && (
                    <tr>
                      <td colSpan="6" className="tp-data-empty">
                        Tidak ada tabel yang sesuai pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="tp-column-review">
            <div className="tp-data-panel-header">
              <div>
                <div className="tp-column-review-eyebrow">
                  Column Name Review
                </div>

                <h2>{selectedTable || "Pilih tabel"}</h2>
              </div>

              <div className="tp-column-review-actions">
                <button
                  type="button"
                  className="tp-delete-table-trigger"
                  onClick={openDeleteTable}
                  disabled={!selectedTable || detailLoading}
                  title="Hapus tabel permanen"
                >
                  <Trash2 size={13} />
                  <span>Drop table</span>
                </button>

                <Columns3 size={20} />
              </div>
            </div>

            {detail?.summary && (
              <div className="tp-detail-summary">
                <div>
                  <span>Rows</span>
                  <strong>{formatNumber(detail.summary.row_count)}</strong>
                </div>

                <div>
                  <span>Columns</span>
                  <strong>{formatNumber(detail.summary.column_count)}</strong>
                </div>

                <div>
                  <span>Banks</span>
                  <strong>{formatNumber(detail.summary.bank_count)}</strong>
                </div>

                <div>
                  <span>Period</span>
                  <strong>{periodLabel(detail.summary)}</strong>
                </div>
              </div>
            )}

            <div className="tp-data-search">
              <Search size={16} />
              <input
                value={columnSearch}
                onChange={(event) => setColumnSearch(event.target.value)}
                placeholder="Cari column name..."
                aria-label="Cari column name"
                disabled={!selectedTable || detailLoading}
              />
            </div>

            <div className="tp-column-table-wrap">
              {detailLoading ? (
                <div className="tp-detail-loading">Membaca schema...</div>
              ) : (
                <table className="tp-column-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Column Name</th>
                      <th>Type</th>
                      <th>Source</th>
                      <th>Masking</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredColumns.map((column) => (
                      <tr key={column.column_name}>
                        <td className="tp-column-ordinal">{column.ordinal}</td>

                        <td>
                          {editingColumn === column.column_name ? (
                            <input
                              autoFocus
                              value={editingValue}
                              onChange={(event) =>
                                setEditingValue(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  saveRename(column);
                                }

                                if (event.key === "Escape") {
                                  cancelRename();
                                }
                              }}
                              className="tp-column-edit-input"
                            />
                          ) : (
                            <div className="tp-column-name-cell">
                              <span>{column.column_name}</span>

                              {column.system_column && (
                                <LockKeyhole size={12} />
                              )}
                            </div>
                          )}
                        </td>

                        <td>
                          <span className="tp-column-type">
                            {column.data_type}
                          </span>
                        </td>

                        <td>
                          <span className="tp-column-source">
                            {column.source_column || "-"}
                          </span>
                        </td>

                        <td>
                          {column.maskable ? (
                            <button
                              type="button"
                              className={`tp-masking-toggle ${
                                column.masked ? "is-masked" : ""
                              }`}
                              onClick={() => toggleMasking(column)}
                              disabled={maskingColumn === column.column_name}
                              title={
                                column.masked
                                  ? "Nonaktifkan masking"
                                  : "Aktifkan masking"
                              }
                            >
                              {column.masked ? (
                                <EyeOff size={13} />
                              ) : (
                                <Eye size={13} />
                              )}

                              <span>
                                {column.masked ? "Masked" : "Visible"}
                              </span>
                            </button>
                          ) : (
                            <span className="tp-locked-label">Locked</span>
                          )}
                        </td>

                        <td className="text-right">
                          {editingColumn === column.column_name ? (
                            <div className="tp-inline-actions">
                              <Button
                                type="button"
                                size="small"
                                disabled={renameLoading}
                                onClick={() => saveRename(column)}
                              >
                                Simpan
                              </Button>

                              <button
                                type="button"
                                className="tp-data-icon-button"
                                onClick={cancelRename}
                                disabled={renameLoading}
                                title="Batal"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : column.editable ? (
                            <button
                              type="button"
                              className="tp-edit-column-button"
                              onClick={() => startRename(column)}
                            >
                              <PencilLine size={13} />
                              Edit
                            </button>
                          ) : (
                            <span className="tp-locked-label">Locked</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {!detailLoading && filteredColumns.length === 0 && (
                      <tr>
                        <td colSpan="6" className="tp-data-empty">
                          {selectedTable && (detail?.columns || []).length > 0
                            ? "Tidak ada column name yang sesuai pencarian."
                            : "Pilih tabel untuk melihat schema."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="tp-column-review-note">
              <LockKeyhole size={13} />
              <span>
                bank_id, bulan, dan tahun merupakan system columns dan tidak
                dapat diubah atau dimasking. Masking hanya memengaruhi data yang
                dikirim ke Table Explorer; nilai asli tetap tersimpan di
                PostgreSQL.
              </span>
            </div>
          </aside>

          <section className="tp-data-lineage-workspace">
            {!selectedTable ? (
              <div className="tp-lineage-workspace-empty">
                <GitBranch size={16} />

                <div>
                  <strong>Lineage & Query Detail</strong>
                  <span>
                    Pilih tabel untuk melihat lineage, query provenance, dan
                    column-level lineage.
                  </span>
                </div>
              </div>
            ) : detailLoading ? (
              <div className="tp-lineage-workspace-loading">
                Membaca lineage dan query detail...
              </div>
            ) : (
              <>
                {!detailLoading && lineage && (
                  <section className="tp-lineage-panel tp-lineage-panel--workspace">
                    <div className="tp-lineage-header">
                      <div className="tp-lineage-heading">
                        <GitBranch size={14} />

                        <strong>Data Lineage</strong>

                        <span
                          className={`tp-lineage-type-badge ${
                            lineage.lineage_type === "derived_table"
                              ? "is-derived"
                              : "is-source"
                          }`}
                        >
                          {lineage.lineage_type === "derived_table"
                            ? "Derived Table"
                            : "Source Table"}
                        </span>
                      </div>

                      <p>
                        {lineage.lineage_type === "derived_table"
                          ? "Direct upstream lineage dari materialisasi Visual SQL Builder."
                          : "Belum ada upstream transformation yang direkam untuk tabel ini."}
                      </p>
                    </div>

                    {lineage.lineage_type === "derived_table" ? (
                      <>
                        {lineageGraph && lineageGraph.node_count > 1 && (
                          <div className="tp-lineage-map-section">
                            <div className="tp-lineage-map-toolbar">
                              <div>
                                <span>Recursive Lineage Map</span>

                                <small>
                                  {formatNumber(lineageGraph.node_count)} tables
                                  · {formatNumber(lineageGraph.edge_count)}{" "}
                                  dependencies
                                </small>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setLineageMapOpen((value) => !value)
                                }
                              >
                                {lineageMapOpen ? "Hide map" : "Show map"}
                              </button>
                            </div>

                            {lineageMapOpen && (
                              <div className="tp-lineage-map-scroll">
                                <div
                                  className="tp-lineage-map-canvas"
                                  style={{
                                    width: `${lineageGraphLayout.width}px`,
                                    height: `${lineageGraphLayout.height}px`,
                                  }}
                                >
                                  <svg
                                    className="tp-lineage-map-edges"
                                    width={lineageGraphLayout.width}
                                    height={lineageGraphLayout.height}
                                    aria-hidden="true"
                                  >
                                    <defs>
                                      <marker
                                        id="tp-lineage-arrow"
                                        markerWidth="7"
                                        markerHeight="7"
                                        refX="6"
                                        refY="3.5"
                                        orient="auto"
                                      >
                                        <path
                                          d="M0,0 L7,3.5 L0,7 Z"
                                          className="tp-lineage-map-arrow"
                                        />
                                      </marker>
                                    </defs>

                                    {lineageGraphLayout.edges.map((edge) => {
                                      const control = Math.max(
                                        28,
                                        (edge.x2 - edge.x1) / 2,
                                      );

                                      return (
                                        <path
                                          key={edge.id}
                                          d={`M ${edge.x1} ${edge.y1} C ${edge.x1 + control} ${edge.y1}, ${edge.x2 - control} ${edge.y2}, ${edge.x2} ${edge.y2}`}
                                          className="tp-lineage-map-edge"
                                          markerEnd="url(#tp-lineage-arrow)"
                                        />
                                      );
                                    })}
                                  </svg>

                                  {lineageGraphLayout.nodes.map((node) => {
                                    const canOpen =
                                      Boolean(node.available) &&
                                      tables.some(
                                        (table) =>
                                          table.table_name === node.table_name,
                                      );

                                    return (
                                      <button
                                        key={node.table_name}
                                        type="button"
                                        className={`tp-lineage-map-node ${
                                          node.lineage_type === "derived_table"
                                            ? "is-derived"
                                            : "is-source"
                                        } ${
                                          node.is_selected ? "is-selected" : ""
                                        }`}
                                        style={{
                                          left: `${node.x}px`,
                                          top: `${node.y}px`,
                                          width: `${node.width}px`,
                                          height: `${node.height}px`,
                                        }}
                                        disabled={!canOpen || node.is_selected}
                                        onClick={() =>
                                          selectTable(node.table_name)
                                        }
                                        title={
                                          node.is_selected
                                            ? "Current table"
                                            : canOpen
                                              ? `Buka ${node.table_name}`
                                              : `${node.table_name} tidak tersedia di katalog`
                                        }
                                      >
                                        <span className="tp-lineage-map-node-icon">
                                          <Database size={12} />
                                        </span>

                                        <span className="tp-lineage-map-node-copy">
                                          <strong>{node.table_name}</strong>

                                          <small>
                                            {node.lineage_type ===
                                            "derived_table"
                                              ? node.saved_query?.available
                                                ? `Derived · ${node.saved_query.query_name}`
                                                : "Derived Table"
                                              : "Source Table"}
                                          </small>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {(lineageGraph.truncated ||
                              lineageGraph.cycle_detected) && (
                              <div className="tp-lineage-map-warning">
                                {lineageGraph.cycle_detected
                                  ? "Cycle terdeteksi pada metadata lineage. Traversal dihentikan pada cabang terkait."
                                  : "Lineage map mencapai batas kedalaman maksimum."}
                              </div>
                            )}
                          </div>
                        )}

                        {lineageGraphError && (
                          <div className="tp-lineage-map-warning">
                            {lineageGraphError}
                          </div>
                        )}

                        <div className="tp-lineage-summary">
                          <div>
                            <span>Base Table</span>
                            <strong>{lineage.base_table || "-"}</strong>
                          </div>

                          <div>
                            <span>Sources</span>
                            <strong>
                              {formatNumber(
                                lineage.transformation?.source_count,
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>Joins</span>
                            <strong>
                              {formatNumber(lineage.transformation?.join_count)}
                            </strong>
                          </div>

                          <div>
                            <span>Created</span>
                            <strong>
                              {formatDateTime(lineage.created_at)}
                            </strong>
                          </div>
                        </div>

                        <div className="tp-lineage-body">
                          <div className="tp-lineage-block">
                            <span className="tp-lineage-label">
                              Upstream tables
                            </span>

                            <div className="tp-lineage-source-list">
                              {(lineage.source_details || []).map((source) => {
                                const canOpen =
                                  Boolean(source.available) &&
                                  tables.some(
                                    (table) =>
                                      table.table_name === source.table_name,
                                  );

                                return (
                                  <button
                                    key={source.table_name}
                                    type="button"
                                    className={`tp-lineage-source-chip ${
                                      source.is_base_table ? "is-base" : ""
                                    }`}
                                    disabled={!canOpen}
                                    onClick={() =>
                                      selectTable(source.table_name)
                                    }
                                    title={
                                      canOpen
                                        ? `Buka ${source.table_name}`
                                        : `${source.table_name} tidak tersedia di katalog`
                                    }
                                  >
                                    <Database size={11} />

                                    <span>{source.table_name}</span>

                                    {source.is_base_table && <em>Base</em>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="tp-lineage-transformation-row">
                            <div>
                              <span>Transformation</span>
                              <strong>
                                {lineage.transformation?.engine ||
                                  "Visual SQL Builder"}
                              </strong>
                            </div>

                            <div>
                              <span>Output</span>
                              <strong>
                                {formatNumber(
                                  lineage.transformation?.output_count,
                                )}{" "}
                                columns
                              </strong>
                            </div>

                            <div>
                              <span>Filters</span>
                              <strong>
                                {formatNumber(
                                  lineage.transformation?.filter_count,
                                )}
                              </strong>
                            </div>

                            <div>
                              <span>Sort</span>
                              <strong>
                                {lineage.transformation?.has_sort
                                  ? "Yes"
                                  : "No"}
                              </strong>
                            </div>
                          </div>

                          <div className="tp-lineage-query-row">
                            <span>Saved Query</span>

                            <strong>
                              {lineage.source_saved_query?.available
                                ? lineage.source_saved_query.query_name
                                : lineage.source_saved_query?.id
                                  ? `Query #${lineage.source_saved_query.id} sudah tidak tersedia`
                                  : "Ad hoc query"}
                            </strong>
                          </div>

                          {lineage.description && (
                            <div className="tp-lineage-description">
                              {lineage.description}
                            </div>
                          )}

                          <div className="tp-lineage-block">
                            <span className="tp-lineage-label">
                              Column lineage
                            </span>

                            <div className="tp-lineage-column-wrap">
                              <table className="tp-lineage-column-table">
                                <thead>
                                  <tr>
                                    <th>Output Column</th>
                                    <th>Source</th>
                                    <th>State</th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {(lineage.column_lineage || []).map(
                                    (column) => (
                                      <tr key={column.output_column}>
                                        <td>
                                          <code>{column.output_column}</code>
                                        </td>

                                        <td>
                                          <code>
                                            {column.source_reference || "-"}
                                          </code>
                                        </td>

                                        <td>
                                          <span
                                            className={`tp-lineage-mask-badge ${
                                              column.masked ? "is-masked" : ""
                                            }`}
                                          >
                                            {column.masked
                                              ? "Masked"
                                              : "Visible"}
                                          </span>
                                        </td>
                                      </tr>
                                    ),
                                  )}

                                  {(lineage.column_lineage || []).length ===
                                    0 && (
                                    <tr>
                                      <td
                                        colSpan="3"
                                        className="tp-lineage-empty"
                                      >
                                        Column lineage belum tersedia.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="tp-lineage-source-note">
                        <Database size={15} />

                        <div>
                          <strong>No upstream lineage recorded</strong>

                          <span>
                            Tabel ini diperlakukan sebagai source table pada
                            lineage Caffeine Theory saat ini.
                          </span>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {!detailLoading && lineageError && (
                  <div className="tp-lineage-error">{lineageError}</div>
                )}
                {!lineage && !lineageError && (
                  <div className="tp-lineage-workspace-empty">
                    <GitBranch size={16} />

                    <div>
                      <strong>Lineage belum tersedia</strong>
                      <span>
                        Belum ada metadata lineage yang dapat ditampilkan untuk
                        tabel ini.
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </section>

        {deleteTarget && (
          <div
            className="tp-delete-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeDeleteTable();
              }
            }}
          >
            <div
              className="tp-delete-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tp-delete-table-title"
            >
              <div className="tp-delete-modal-icon">
                <TriangleAlert size={20} />
              </div>

              <div className="tp-delete-modal-content">
                <h2 id="tp-delete-table-title">Hapus tabel secara permanen?</h2>

                <p>
                  Tabel PostgreSQL dan metadata yang terkait akan dihapus.
                  Relationship, profile, schema mapping, dan pengaturan masking
                  yang mereferensikan tabel ini juga akan dibersihkan.
                </p>

                <div className="tp-delete-table-summary">
                  <div>
                    <span>Table</span>
                    <strong>{deleteTarget.table_name}</strong>
                  </div>
                  <div>
                    <span>Rows</span>
                    <strong>{formatNumber(deleteTarget.row_count)}</strong>
                  </div>
                  <div>
                    <span>Columns</span>
                    <strong>{formatNumber(deleteTarget.column_count)}</strong>
                  </div>
                </div>

                <label className="tp-delete-confirm-field">
                  <span>
                    Ketik <strong>{deleteTarget.table_name}</strong> untuk
                    mengonfirmasi.
                  </span>
                  <input
                    autoFocus
                    value={deleteConfirmValue}
                    onChange={(event) =>
                      setDeleteConfirmValue(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        deleteConfirmValue.trim() === deleteTarget.table_name &&
                        !deleteLoading
                      ) {
                        confirmDeleteTable();
                      }

                      if (event.key === "Escape") {
                        closeDeleteTable();
                      }
                    }}
                    placeholder={deleteTarget.table_name}
                  />
                </label>

                <div className="tp-delete-modal-actions">
                  <button
                    type="button"
                    className="tp-delete-cancel-button"
                    onClick={closeDeleteTable}
                    disabled={deleteLoading}
                  >
                    Batal
                  </button>

                  <button
                    type="button"
                    className="tp-delete-confirm-button"
                    onClick={confirmDeleteTable}
                    disabled={
                      deleteLoading ||
                      deleteConfirmValue.trim() !== deleteTarget.table_name
                    }
                  >
                    <Trash2 size={14} />
                    {deleteLoading ? "Menghapus..." : "Drop table permanen"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}

export default DataTables;
