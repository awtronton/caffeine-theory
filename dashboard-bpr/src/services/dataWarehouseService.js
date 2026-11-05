const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function requestJson(url, options, fallbackMessage) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    console.error("NETWORK ERROR:", error);

    throw new Error(
      `Tidak dapat terhubung ke backend FastAPI di ${API_URL}. Pastikan server backend masih berjalan dan CORS sudah benar.`
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const detail = errorBody.detail;
    const detailMessage =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object"
          ? detail.message || JSON.stringify(detail)
          : "";

    throw new Error(
      detailMessage ||
        `${fallbackMessage} (HTTP ${response.status})`
    );
  }

  return response.json();
}

export async function detectExcelSheets(file) {
  const formData = new FormData();
  formData.append("file", file);

  return requestJson(
    `${API_URL}/excel/sheets`,
    {
      method: "POST",
      body: formData,
    },
    "Gagal membaca sheet Excel"
  );
}

export async function savePivotExcel({
  file, sheetName, bankName, month, year, tableName, tableMode,
  codeColumn = null, valueColumn = null, duplicateAction = 'block',
}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sheet_name', sheetName);
  formData.append('bank_name', bankName);
  formData.append('month', String(month));
  formData.append('year', String(year));
  formData.append('table_name', tableName);
  formData.append('table_mode', tableMode);
  formData.append('duplicate_action', duplicateAction);
  if (codeColumn !== null && valueColumn !== null) {
    formData.append('code_column', String(codeColumn));
    formData.append('value_column', String(valueColumn));
  }

  let response;
  try {
    response = await fetch(`${API_URL}/excel/pivot-save`, {
      method: 'POST', body: formData,
    });
  } catch {
    throw new Error(`Tidak dapat menghubungi backend di ${API_URL}.`);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail;
    const error = new Error(
      typeof detail === 'string'
        ? detail
        : detail?.message || `Pivot Save gagal (HTTP ${response.status}).`,
    );
    error.code = detail?.code;
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return response.json();
}

export async function previewPivotExcel({
  file,
  sheetName,
  bankName,
  month,
  year,
  codeColumn = null,
  valueColumn = null,
}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sheet_name", sheetName);
  formData.append("bank_name", bankName);
  formData.append("month", String(month));
  formData.append("year", String(year));

  if (codeColumn !== null && valueColumn !== null) {
    formData.append("code_column", String(codeColumn));
    formData.append("value_column", String(valueColumn));
  }

  return requestJson(
    `${API_URL}/excel/pivot-preview`,
    { method: "POST", body: formData },
    "Gagal membuat Smart Pivot Preview"
  );
}

export async function previewExcel({
  file,
  tableMode,
  tableName,
  bankName,
  month,
  year,
  sheetName,
  headerRow,
  firstDataRow,
}) {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("table_mode", tableMode);
  formData.append("table_name", tableName);
  formData.append("bank_name", bankName);
  formData.append("month", String(month));
  formData.append("year", String(year));
  formData.append("sheet_name", sheetName);

  if (tableMode === "new") {
    formData.append("header_row", String(headerRow));
  } else {
    formData.append("first_data_row", String(firstDataRow));
  }

  return requestJson(
    `${API_URL}/excel/preview`,
    {
      method: "POST",
      body: formData,
    },
    "Gagal memproses file Excel"
  );
}


export async function getBanks() {
  return requestJson(
    `${API_URL}/banks`,
    {
      method: "GET",
    },
    "Gagal mengambil master bank"
  );
}

export async function previewCalculatedColumn(tableName, formula) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/columns/calculated/preview`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formula }) },
    'Gagal membuat preview formula',
  );
}

export async function createCalculatedColumn(tableName, payload) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/columns/calculated`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload) },
    'Gagal membuat calculated column',
  );
}

export async function getCalculatedColumns(tableName) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/columns/calculated`,
    { method: 'GET' },
    'Gagal membaca calculated columns',
  );
}

export async function refreshStaleCalculatedColumns(tableName) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/columns/calculated/refresh-stale`,
    { method: 'POST' },
    'Gagal menghitung ulang calculated columns yang stale',
  );
}

export async function refreshCalculatedColumn(tableName, columnName) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/columns/calculated/${encodeURIComponent(columnName)}/refresh`,
    { method: 'POST' },
    'Gagal menghitung ulang calculated column',
  );
}

export async function addManualColumn(tableName, payload) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/columns/manual`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Gagal menambahkan kolom',
  );
}

export async function createEmptyTable(payload) {
  return requestJson(
    `${API_URL}/tables/manual`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Gagal membuat tabel manual',
  );
}

export async function getTables() {
  return requestJson(
    `${API_URL}/tables`,
    {
      method: "GET",
    },
    "Gagal mengambil daftar tabel database"
  );
}


export async function checkPeriod({
  tableName,
  bankName,
  month,
  year,
}) {
  const formData = new FormData();

  formData.append("table_name", tableName);
  formData.append("bank_name", bankName);
  formData.append("month", String(month));
  formData.append("year", String(year));

  return requestJson(
    `${API_URL}/excel/check-period`,
    {
      method: "POST",
      body: formData,
    },
    "Gagal memeriksa periode existing"
  );
}

export async function saveExcel({
  file,
  tableMode,
  tableName,
  bankName,
  month,
  year,
  sheetName,
  headerRow,
  firstDataRow,
  deletedRows = [],
  columnMapping = {},
  duplicateAction = "block",
}) {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("table_mode", tableMode);
  formData.append("table_name", tableName);
  formData.append("bank_name", bankName);
  formData.append("month", String(month));
  formData.append("year", String(year));
  formData.append("sheet_name", sheetName);

  if (tableMode === "new") {
    formData.append("header_row", String(headerRow));
  } else {
    formData.append("first_data_row", String(firstDataRow));
  }

  formData.append("deleted_rows", JSON.stringify(deletedRows));
  formData.append("column_mapping", JSON.stringify(columnMapping));
  formData.append("duplicate_action", duplicateAction);

  return requestJson(
    `${API_URL}/excel/save`,
    {
      method: "POST",
      body: formData,
    },
    "Gagal menyimpan data ke database"
  );
}


export async function getTableSummaries() {
  return requestJson(
    `${API_URL}/tables-summary`,
    {
      method: "GET",
    },
    "Gagal membaca ringkasan tabel"
  );
}

export async function getTableDetail(tableName) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/detail`,
    {
      method: "GET",
    },
    "Gagal membaca detail tabel"
  );
}

export async function getTableProfile(tableName) {
  return requestJson(
    `${API_URL}/profiling/tables/${encodeURIComponent(tableName)}`,
    {
      method: "GET",
    },
    "Gagal membaca completeness profile"
  );
}

export async function createProfilingJob({
  tableName,
  columns = null,
  targetSampleRows = 50000,
  profileStrategy = "adaptive",
}) {
  return requestJson(
    `${API_URL}/profiling/jobs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table_name: tableName,
        columns,
        target_sample_rows: targetSampleRows,
        profile_strategy: profileStrategy,
      }),
    },
    "Gagal menjalankan completeness profile"
  );
}

export async function getProfilingJob(jobId) {
  return requestJson(
    `${API_URL}/profiling/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
    },
    "Gagal membaca status profiling"
  );
}


export async function getDuplicateOverview(tableName) {
  return requestJson(
    `${API_URL}/data-quality/duplicates/tables/${encodeURIComponent(tableName)}`,
    {
      method: "GET",
    },
    "Gagal membaca duplicate detection"
  );
}

export async function createDuplicateJob({
  tableName,
  mode = "exact_row",
  keyColumns = null,
  includeIncompleteKeys = false,
  maxGroups = 100,
}) {
  return requestJson(
    `${API_URL}/data-quality/duplicates/jobs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        table_name: tableName,
        mode,
        key_columns: keyColumns,
        include_incomplete_keys: includeIncompleteKeys,
        max_groups: maxGroups,
      }),
    },
    "Gagal menjalankan duplicate detection"
  );
}

export async function getDuplicateJob(jobId) {
  return requestJson(
    `${API_URL}/data-quality/duplicates/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
    },
    "Gagal membaca status duplicate detection"
  );
}


export async function getTableLineage(tableName) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/lineage`,
    {
      method: "GET",
    },
    "Gagal membaca data lineage"
  );
}

export async function getTableLineageGraph(
  tableName,
  {
    maxDepth = 8,
  } = {}
) {
  const params = new URLSearchParams();
  params.set("max_depth", String(maxDepth));

  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/lineage/graph?${params.toString()}`,
    {
      method: "GET",
    },
    "Gagal membaca lineage graph"
  );
}

export async function deleteWarehouseTable(tableName) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}`,
    {
      method: "DELETE",
    },
    "Gagal menghapus tabel"
  );
}

export async function renameTableColumn({
  tableName,
  oldName,
  newName,
}) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/column`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        old_name: oldName,
        new_name: newName,
      }),
    },
    "Gagal mengubah nama kolom"
  );
}


export async function getTableExplorerOptions(tableName) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/explorer/options`,
    {
      method: "GET",
    },
    "Gagal membaca opsi Table Explorer"
  );
}

export async function exploreTable({
  tableName,
  page = 1,
  pageSize = 20,
  search = "",
  bankId = "",
  month = "",
  year = "",
  sortColumn = "",
  sortDirection = "asc",
}) {
  const params = new URLSearchParams();

  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  if (search) params.set("search", search);
  if (bankId) params.set("bank_id", bankId);
  if (month) params.set("month", String(month));
  if (year) params.set("year", String(year));
  if (sortColumn) params.set("sort_column", sortColumn);

  params.set("sort_direction", sortDirection);

  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/explorer?${params.toString()}`,
    {
      method: "GET",
    },
    "Gagal membaca data Table Explorer"
  );
}


export async function setTableColumnMasking({
  tableName,
  columnName,
  masked,
}) {
  return requestJson(
    `${API_URL}/tables/${encodeURIComponent(tableName)}/column-masking`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        column_name: columnName,
        masked: Boolean(masked),
      }),
    },
    "Gagal memperbarui masking kolom"
  );
}


export async function getTableRelationships(tableName = "") {
  const params = new URLSearchParams();

  if (tableName) {
    params.set("table_name", tableName);
  }

  const suffix = params.toString()
    ? `?${params.toString()}`
    : "";

  return requestJson(
    `${API_URL}/relationships${suffix}`,
    {
      method: "GET",
    },
    "Gagal membaca relationship"
  );
}

export async function createTableRelationship(payload) {
  return requestJson(
    `${API_URL}/relationships`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Gagal membuat relationship"
  );
}

export async function updateTableRelationship(
  relationshipId,
  payload
) {
  return requestJson(
    `${API_URL}/relationships/${relationshipId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Gagal memperbarui relationship"
  );
}

export async function deleteTableRelationship(relationshipId) {
  return requestJson(
    `${API_URL}/relationships/${relationshipId}`,
    {
      method: "DELETE",
    },
    "Gagal menghapus relationship"
  );
}


export async function preflightQuery(payload, { signal } = {}) {
  return requestJson(
    `${API_URL}/query/preflight`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    },
    "Gagal memeriksa query"
  );
}


export async function previewQuery(payload, { signal } = {}) {
  return requestJson(
    `${API_URL}/query/preview`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    },
    "Gagal menjalankan data preview"
  );
}


export async function listSavedQueries() {
  return requestJson(
    `${API_URL}/saved-queries`,
    {
      method: "GET",
    },
    "Gagal membaca saved query"
  );
}

export async function getSavedQuery(queryId) {
  return requestJson(
    `${API_URL}/saved-queries/${queryId}`,
    {
      method: "GET",
    },
    "Gagal membuka saved query"
  );
}

export async function createSavedQuery(payload) {
  return requestJson(
    `${API_URL}/saved-queries`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Gagal menyimpan query"
  );
}

export async function updateSavedQuery(queryId, payload) {
  return requestJson(
    `${API_URL}/saved-queries/${queryId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Gagal memperbarui saved query"
  );
}

export async function deleteSavedQuery(queryId) {
  return requestJson(
    `${API_URL}/saved-queries/${queryId}`,
    {
      method: "DELETE",
    },
    "Gagal menghapus saved query"
  );
}

export async function createOutputTable(payload) {
  return requestJson(
    `${API_URL}/query/materialize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Gagal membuat output table"
  );
}


// 7A.1 — Bank Intelligence / One Page Summary
export async function getBankOpsOverview(bankId) {
  return requestJson(
    `${API_URL}/banks/${encodeURIComponent(bankId)}/ops`,
    { method: "GET" },
    "Gagal membaca One Page Summary bank"
  );
}

export async function saveBankOpsProfile(bankId, profile) {
  return requestJson(
    `${API_URL}/banks/${encodeURIComponent(bankId)}/profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    },
    "Gagal menyimpan profil bank"
  );
}


// 7A.2 — OPS Financial Mapping (explicit source, no guessed account codes)
export async function getOpsFinancialSources() {
  return requestJson(`${API_URL}/ops/financial/sources`, { method: 'GET' }, 'Gagal membaca tabel sumber OPS');
}
export async function getOpsFinancialMappings() {
  return requestJson(`${API_URL}/ops/financial/mappings`, { method: 'GET' }, 'Gagal membaca mapping OPS');
}
export async function saveOpsFinancialMapping(metricKey, payload) {
  return requestJson(`${API_URL}/ops/financial/mappings/${encodeURIComponent(metricKey)}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    'Gagal menyimpan mapping OPS');
}
export async function deleteOpsFinancialMapping(metricKey) {
  return requestJson(`${API_URL}/ops/financial/mappings/${encodeURIComponent(metricKey)}`,
    { method: 'DELETE' }, 'Gagal menghapus mapping OPS');
}
export async function getBankOpsFinancial(bankId, period) {
  return requestJson(`${API_URL}/banks/${encodeURIComponent(bankId)}/ops/financial?period=${encodeURIComponent(period)}`,
    { method: 'GET' }, 'Gagal membaca kinerja keuangan OPS');
}


export async function previewOpsFinancialFormula(payload) {
  return requestJson(`${API_URL}/ops/financial/formulas/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Gagal menghitung preview formula OPS');
}

// 7A.2.2.7 — Read-only OPS reconciliation from explicitly selected columns.
export async function getOpsReconciliation(bankId, period, selection) {
  const params = new URLSearchParams({
    period, table_name: selection.tableName,
    assets_column: selection.assetsColumn,
    liabilities_column: selection.liabilitiesColumn,
    equity_column: selection.equityColumn,
  });
  if (selection.derivedColumn) params.set('derived_column', selection.derivedColumn);
  return requestJson(
    `${API_URL}/banks/${encodeURIComponent(bankId)}/ops/reconciliation?${params.toString()}`,
    { method: 'GET' }, 'Gagal merekonsiliasi data OPS'
  );
}
