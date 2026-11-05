import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Button,
} from '@vibe/core'
import {
  Columns3,
  Database,
  Eye,
  EyeOff,
  GitBranch,
  LockKeyhole,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'

import DashboardLayout from '../layouts/DashboardLayout'
import {
  createDuplicateJob,
  createEmptyTable,
  addManualColumn,
  previewCalculatedColumn,
  createCalculatedColumn,
  getCalculatedColumns,
  refreshCalculatedColumn,
  refreshStaleCalculatedColumns,
  createProfilingJob,
  deleteWarehouseTable,
  getDuplicateJob,
  getDuplicateOverview,
  getProfilingJob,
  getTableDetail,
  getTableLineage,
  getTableLineageGraph,
  getTableProfile,
  getTableSummaries,
  renameTableColumn,
  setTableColumnMasking,
} from '../services/dataWarehouseService'

import '../styles/data-tables-vibe.css'

function formatNumber(value) {
  if (value === null || value === undefined) {
    return '-'
  }

  return new Intl.NumberFormat('id-ID').format(
    Number(value),
  )
}

function periodLabel(table) {
  if (!table?.min_year && !table?.max_year) {
    return '-'
  }

  if (table.min_year === table.max_year) {
    return String(table.min_year)
  }

  return `${table.min_year ?? '-'}–${table.max_year ?? '-'}`
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(parsed)
}

function formatPercent(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return '-'
  }

  return `${new Intl.NumberFormat(
    'id-ID',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  ).format(Number(value))}%`
}

function duplicateModeLabel(mode) {
  return mode === 'selected_key'
    ? 'Selected Key'
    : 'Exact Row'
}

function duplicatePreviewLabel(group) {
  const entries = Object.entries(
    group?.preview || {},
  )

  if (!entries.length) {
    return group?.group_hash
      ? `Fingerprint ${group.group_hash.slice(0, 12)}`
      : '-'
  }

  return entries
    .map(([key, value]) => `${key}=${value}`)
    .join(' · ')
}

function qualitySeverityLabel(value) {
  const labels = {
    clean: 'Clean',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
    unknown: 'Unknown',
  }

  return labels[value] || 'Unknown'
}

function buildLineageGraphLayout(graph) {
  const graphNodes = Array.isArray(graph?.nodes)
    ? graph.nodes
    : []
  const graphEdges = Array.isArray(graph?.edges)
    ? graph.edges
    : []

  if (graphNodes.length === 0) {
    return {
      width: 0,
      height: 0,
      nodes: [],
      edges: [],
    }
  }

  const nodeWidth = 176
  const nodeHeight = 58
  const horizontalGap = 86
  const verticalGap = 18
  const paddingX = 20
  const paddingY = 18

  const maxDepth = Math.max(
    ...graphNodes.map((node) =>
      Number(node.depth || 0),
    ),
  )

  const levels = new Map()

  graphNodes.forEach((node) => {
    const depth = Number(node.depth || 0)

    if (!levels.has(depth)) {
      levels.set(depth, [])
    }

    levels.get(depth).push(node)
  })

  levels.forEach((nodes) => {
    nodes.sort((left, right) =>
      left.table_name.localeCompare(
        right.table_name,
      ),
    )
  })

  const maxLevelSize = Math.max(
    ...Array.from(levels.values()).map(
      (nodes) => nodes.length,
    ),
  )

  const innerHeight =
    maxLevelSize * nodeHeight +
    Math.max(0, maxLevelSize - 1) *
      verticalGap

  const positioned = []
  const positionById = new Map()

  for (
    let depth = maxDepth;
    depth >= 0;
    depth -= 1
  ) {
    const nodes = levels.get(depth) || []
    const columnIndex = maxDepth - depth
    const columnHeight =
      nodes.length * nodeHeight +
      Math.max(0, nodes.length - 1) *
        verticalGap
    const columnStartY =
      paddingY +
      Math.max(
        0,
        (innerHeight - columnHeight) / 2,
      )

    nodes.forEach((node, index) => {
      const x =
        paddingX +
        columnIndex *
          (nodeWidth + horizontalGap)
      const y =
        columnStartY +
        index * (nodeHeight + verticalGap)

      const positionedNode = {
        ...node,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      }

      positioned.push(positionedNode)
      positionById.set(
        node.table_name,
        positionedNode,
      )
    })
  }

  const edges = graphEdges
    .map((edge) => {
      const source = positionById.get(
        edge.source,
      )
      const target = positionById.get(
        edge.target,
      )

      if (!source || !target) {
        return null
      }

      return {
        ...edge,
        x1: source.x + source.width,
        y1: source.y + source.height / 2,
        x2: target.x,
        y2: target.y + target.height / 2,
      }
    })
    .filter(Boolean)

  return {
    width:
      paddingX * 2 +
      (maxDepth + 1) * nodeWidth +
      maxDepth * horizontalGap,
    height:
      paddingY * 2 +
      Math.max(innerHeight, nodeHeight),
    nodes: positioned,
    edges,
  }
}

function DataTables() {
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newTableName, setNewTableName] = useState('')
  const [includePeriod, setIncludePeriod] = useState(true)
  const [newColumns, setNewColumns] = useState([
    { id: 1, name: '', data_type: 'NUMERIC', nullable: true },
  ])
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [addColumnBusy, setAddColumnBusy] = useState(false)
  const [addColumnError, setAddColumnError] = useState('')
  const [addColumnName, setAddColumnName] = useState('')
  const [addColumnType, setAddColumnType] = useState('NUMERIC')
  const [addColumnNullable, setAddColumnNullable] = useState(true)
  const [addColumnHasDefault, setAddColumnHasDefault] = useState(false)
  const [addColumnDefault, setAddColumnDefault] = useState('')
  const [columnMode, setColumnMode] = useState('manual')
  const [calcFormula, setCalcFormula] = useState('')
  const [calcPreview, setCalcPreview] = useState(null)
  const [calcDefinitions, setCalcDefinitions] = useState([])
  const [calcTraceExpanded, setCalcTraceExpanded] = useState({})
  const [calcTracking, setCalcTracking] = useState(null)
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [tableSearchOpen, setTableSearchOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [activeInsightPanel, setActiveInsightPanel] = useState(null)

  const [selectedTable, setSelectedTable] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [lineage, setLineage] = useState(null)
  const [lineageError, setLineageError] = useState('')
  const [lineageGraph, setLineageGraph] = useState(null)
  const [lineageGraphError, setLineageGraphError] = useState('')
  const [lineageMapOpen, setLineageMapOpen] = useState(true)
  const [qualityProfile, setQualityProfile] = useState(null)
  const [qualityError, setQualityError] = useState('')
  const [qualityJob, setQualityJob] = useState(null)
  const [qualityRunLoading, setQualityRunLoading] = useState(false)

  const [duplicateOverview, setDuplicateOverview] = useState(null)
  const [duplicateError, setDuplicateError] = useState('')
  const [duplicateJob, setDuplicateJob] = useState(null)
  const [duplicateRunLoading, setDuplicateRunLoading] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState('exact_row')
  const [duplicateKeyColumns, setDuplicateKeyColumns] = useState([])
  const [duplicateColumnSearch, setDuplicateColumnSearch] = useState('')

  const [editingColumn, setEditingColumn] = useState('')
  const [editingValue, setEditingValue] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const [maskingColumn, setMaskingColumn] = useState('')
  const [message, setMessage] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteConfirmValue, setDeleteConfirmValue] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  function resetAddColumn() {
    setAddColumnOpen(false)
    setAddColumnError('')
    setAddColumnName('')
    setAddColumnType('NUMERIC')
    setAddColumnNullable(true)
    setAddColumnHasDefault(false)
    setAddColumnDefault('')
    setColumnMode('manual')
    setCalcFormula('')
    setCalcPreview(null)
  }

  async function handleAddColumn(event) {
    event.preventDefault()
    if (!selectedTable || addColumnBusy) return
    const name = addColumnName.trim()
    const confirmed = window.confirm(
      `Tambahkan kolom ${name} (${columnMode === 'calculated' ? 'NUMERIC (formula)' : addColumnType}) pada tabel ${selectedTable}?\n` +
      'Perubahan struktur akan diterapkan pada PostgreSQL.',
    )
    if (!confirmed) return
    setAddColumnBusy(true)
    setAddColumnError('')
    try {
      if (columnMode === 'calculated') {
        await createCalculatedColumn(selectedTable, {
          column_name: name,
          formula: calcFormula.trim(),
        })
      } else {
      await addManualColumn(selectedTable, {
        column_name: name,
        data_type: addColumnType,
        nullable: addColumnNullable,
        default_value: addColumnHasDefault ? addColumnDefault : null,
      })
      }
      resetAddColumn()
      await selectTable(selectedTable)
      await loadTables()
      setMessage(`Kolom '${name}' berhasil ditambahkan pada tabel '${selectedTable}'.`)
    } catch (error) {
      setAddColumnError(error.message || 'Gagal menambah kolom.')
    } finally {
      setAddColumnBusy(false)
    }
  }

  async function handleCalcPreview() {
    if (!selectedTable || !calcFormula.trim()) return
    setCalcPreview(null)
    setAddColumnError('')
    setAddColumnBusy(true)
    try {
      const result = await previewCalculatedColumn(selectedTable, calcFormula.trim())
      setCalcPreview(result)
    } catch (error) {
      setAddColumnError(error.message || 'Preview formula gagal.')
    } finally {
      setAddColumnBusy(false)
    }
  }

  async function handleCalcRefresh(columnName) {
    if (!selectedTable || addColumnBusy) return
    if (!window.confirm(`Hitung ulang kolom ${columnName} dari data sumber saat ini?`)) return
    setAddColumnBusy(true)
    setAddColumnError('')
    try {
      await refreshCalculatedColumn(selectedTable, columnName)
      const result = await getCalculatedColumns(selectedTable)
      setCalcDefinitions(result.columns || [])
      setCalcTracking(result)
      await selectTable(selectedTable)
      setMessage(`Kolom '${columnName}' berhasil dihitung ulang bersama dependensinya yang stale.`)
    } catch (error) {
      setAddColumnError(error.message || 'Refresh calculated column gagal.')
    } finally {
      setAddColumnBusy(false)
    }
  }

  async function handleRefreshStaleColumns() {
    if (!selectedTable || addColumnBusy) return
    if (!window.confirm(`Hitung ulang seluruh calculated column berstatus Stale pada tabel ${selectedTable}?`)) return
    setAddColumnBusy(true)
    setAddColumnError('')
    try {
      const result = await refreshStaleCalculatedColumns(selectedTable)
      const updated = await getCalculatedColumns(selectedTable)
      setCalcDefinitions(updated.columns || [])
      setCalcTracking(updated)
      await selectTable(selectedTable)
      setMessage(`${result.refreshed_count ?? 0} calculated column berhasil dihitung ulang.`)
    } catch (error) {
      setAddColumnError(error.message || 'Recalculation gagal.')
    } finally {
      setAddColumnBusy(false)
    }
  }

  async function openAddColumn() {
    setAddColumnError('')
    setCalcDefinitions([])
    setCalcTracking(null)
    setCalcTraceExpanded({})
    setAddColumnOpen(true)
    if (!selectedTable) return
    try {
      const result = await getCalculatedColumns(selectedTable)
      setCalcDefinitions(result.columns || [])
      setCalcTracking(result)
    } catch (error) {
      setAddColumnError(error.message || 'Gagal membaca definisi calculated column.')
    }
  }

  function resetCreateTableForm() {
    setCreateOpen(false)
    setCreateError('')
    setNewTableName('')
    setIncludePeriod(true)
    setNewColumns([
      { id: 1, name: '', data_type: 'NUMERIC', nullable: true },
    ])
  }

  function updateNewColumn(id, field, value) {
    setNewColumns((items) => items.map((item) => (
      item.id === id ? { ...item, [field]: value } : item
    )))
  }

  async function handleCreateTable(event) {
    event.preventDefault()
    if (createBusy) return
    setCreateBusy(true)
    setCreateError('')
    try {
      const name = newTableName.trim()
      const columns = newColumns.map(({ name: columnName, data_type, nullable }) => ({
        name: columnName.trim(), data_type, nullable,
      }))
      const result = await createEmptyTable({
        table_name: name,
        include_period: includePeriod,
        columns,
      })
      resetCreateTableForm()
      await loadTables({ preserveSelection: false })
      await selectTable(result.table_name)
      setMessage(`Tabel '${result.table_name}' berhasil dibuat dengan ${result.column_count} kolom dan 0 baris.`)
    } catch (error) {
      setCreateError(error.message || 'Gagal membuat tabel.')
    } finally {
      setCreateBusy(false)
    }
  }

  const filteredTables = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) {
      return tables
    }

    return tables.filter((table) =>
      table.table_name
        .toLowerCase()
        .includes(keyword),
    )
  }, [tables, search])

  const filteredColumns = useMemo(() => {
    const columns = Array.isArray(detail?.columns)
      ? detail.columns
      : []
    const keyword = columnSearch.trim().toLowerCase()

    if (!keyword) {
      return columns
    }

    return columns.filter((column) =>
      String(column.column_name || '')
        .toLowerCase()
        .includes(keyword),
    )
  }, [detail?.columns, columnSearch])

  const duplicateSelectableColumns = useMemo(() => {
    const columns = Array.isArray(detail?.columns)
      ? detail.columns
      : []
    const keyword = duplicateColumnSearch
      .trim()
      .toLowerCase()

    if (!keyword) {
      return columns
    }

    return columns.filter((column) =>
      String(column.column_name || '')
        .toLowerCase()
        .includes(keyword),
    )
  }, [detail?.columns, duplicateColumnSearch])

  const lineageGraphLayout = useMemo(
    () => buildLineageGraphLayout(
      lineageGraph,
    ),
    [lineageGraph],
  )

  async function loadTables({
    preserveSelection = true,
  } = {}) {
    try {
      setLoading(true)
      setLoadError('')

      const result = await getTableSummaries()
      const rows = Array.isArray(result?.tables)
        ? result.tables
        : []

      setTables(rows)

      if (
        preserveSelection &&
        selectedTable &&
        rows.some(
          (item) => item.table_name === selectedTable,
        )
      ) {
        return
      }

      if (rows.length > 0) {
        await selectTable(rows[0].table_name)
      } else {
        setSelectedTable('')
        setDetail(null)
        setLineage(null)
        setLineageError('')
        setLineageGraph(null)
        setLineageGraphError('')
        setQualityProfile(null)
        setQualityError('')
        setQualityJob(null)
        setDuplicateOverview(null)
        setDuplicateError('')
        setDuplicateJob(null)
      }
    } catch (error) {
      console.error(error)
      setLoadError(
        error.message ||
          'Gagal membaca Data Tables.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function selectTable(tableName) {
    try {
      setSelectedTable(tableName)
      setColumnSearch('')
      setEditingColumn('')
      setEditingValue('')
      setMessage('')
      setDetailLoading(true)
      setLineageError('')
      setLineageGraphError('')
      setQualityError('')
      setQualityJob(null)
      setDuplicateError('')
      setDuplicateJob(null)
      setDuplicateKeyColumns([])
      setDuplicateColumnSearch('')

      const [
        detailResult,
        lineageResult,
        graphResult,
        profileResult,
        duplicateResult,
      ] = await Promise.all([
        getTableDetail(tableName),
        getTableLineage(tableName).catch(
          (error) => {
            console.error(error)

            return {
              lineage: null,
              lineageError:
                error.message ||
                'Gagal membaca data lineage.',
            }
          },
        ),
        getTableLineageGraph(
          tableName,
          {
            maxDepth: 8,
          },
        ).catch((error) => {
          console.error(error)

          return {
            graph: null,
            graphError:
              error.message ||
              'Gagal membaca lineage graph.',
          }
        }),
        getTableProfile(
          tableName,
        ).catch((error) => {
          console.error(error)

          return {
            completeness: null,
            qualityError:
              error.message ||
              'Gagal membaca completeness profile.',
          }
        }),
        getDuplicateOverview(
          tableName,
        ).catch((error) => {
          console.error(error)

          return {
            duplicates: null,
            duplicateError:
              error.message ||
              'Gagal membaca duplicate detection.',
          }
        }),
      ])

      setDetail(detailResult)
      setLineage(
        lineageResult?.lineage || null,
      )
      setLineageError(
        lineageResult?.lineageError || '',
      )
      setLineageGraph(
        graphResult?.graph || null,
      )
      setLineageGraphError(
        graphResult?.graphError || '',
      )
      setQualityProfile(
        profileResult?.completeness || null,
      )
      setQualityError(
        profileResult?.qualityError || '',
      )
      setDuplicateOverview(
        duplicateResult?.duplicates || null,
      )
      setDuplicateError(
        duplicateResult?.duplicateError || '',
      )
    } catch (error) {
      console.error(error)
      setDetail(null)
      setLineage(null)
      setLineageError('')
      setLineageGraph(null)
      setLineageGraphError('')
      setQualityProfile(null)
      setQualityError('')
      setQualityJob(null)
      setDuplicateOverview(null)
      setDuplicateError('')
      setDuplicateJob(null)
      setDuplicateKeyColumns([])
      setDuplicateColumnSearch('')
      setMessage(
        error.message ||
          'Gagal membaca detail tabel.',
      )
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    loadTables({
      preserveSelection: false,
    })
  }, [])

  async function runCompletenessProfile() {
    if (!selectedTable) {
      return
    }

    try {
      setQualityRunLoading(true)
      setQualityError('')

      const result = await createProfilingJob({
        tableName: selectedTable,
        targetSampleRows: 50000,
        profileStrategy: 'adaptive',
      })

      setQualityJob(result?.job || null)
    } catch (error) {
      console.error(error)
      setQualityError(
        error.message ||
          'Gagal menjalankan completeness profile.',
      )
    } finally {
      setQualityRunLoading(false)
    }
  }

  useEffect(() => {
    const jobId = qualityJob?.id

    if (
      !jobId ||
      qualityJob?.status === 'completed' ||
      qualityJob?.status === 'failed'
    ) {
      return undefined
    }

    let cancelled = false
    let polling = false

    const timer = window.setInterval(
      async () => {
        if (polling || cancelled) {
          return
        }

        polling = true

        try {
          const statusResult =
            await getProfilingJob(jobId)
          const nextJob =
            statusResult?.job || null

          if (cancelled || !nextJob) {
            return
          }

          setQualityJob(nextJob)

          if (nextJob.status === 'completed') {
            window.clearInterval(timer)

            const profileResult =
              await getTableProfile(
                selectedTable,
              )

            if (!cancelled) {
              setQualityProfile(
                profileResult?.completeness ||
                  null,
              )
              setQualityError('')
            }
          }

          if (nextJob.status === 'failed') {
            window.clearInterval(timer)

            if (!cancelled) {
              setQualityError(
                nextJob.error_message ||
                  'Completeness profiling gagal.',
              )
            }
          }
        } catch (error) {
          console.error(error)

          if (!cancelled) {
            setQualityError(
              error.message ||
                'Gagal membaca status completeness profile.',
            )
          }
        } finally {
          polling = false
        }
      },
      900,
    )

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [qualityJob?.id, selectedTable])

  function toggleDuplicateKeyColumn(columnName) {
    setDuplicateKeyColumns((current) => {
      if (current.includes(columnName)) {
        return current.filter(
          (item) => item !== columnName,
        )
      }

      if (current.length >= 8) {
        setDuplicateError(
          'Selected Key maksimal menggunakan 8 kolom.',
        )
        return current
      }

      setDuplicateError('')
      return [...current, columnName]
    })
  }

  async function runDuplicateDetection() {
    if (!selectedTable) {
      return
    }

    if (
      duplicateMode === 'selected_key' &&
      duplicateKeyColumns.length === 0
    ) {
      setDuplicateError(
        'Pilih minimal 1 kolom untuk Selected Key.',
      )
      return
    }

    try {
      setDuplicateRunLoading(true)
      setDuplicateError('')

      const result = await createDuplicateJob({
        tableName: selectedTable,
        mode: duplicateMode,
        keyColumns:
          duplicateMode === 'selected_key'
            ? duplicateKeyColumns
            : null,
        includeIncompleteKeys: false,
        maxGroups: 100,
      })

      setDuplicateJob(result?.job || null)
    } catch (error) {
      console.error(error)
      setDuplicateError(
        error.message ||
          'Gagal menjalankan duplicate detection.',
      )
    } finally {
      setDuplicateRunLoading(false)
    }
  }

  useEffect(() => {
    const jobId = duplicateJob?.id

    if (
      !jobId ||
      duplicateJob?.status === 'completed' ||
      duplicateJob?.status === 'failed'
    ) {
      return undefined
    }

    let cancelled = false
    let polling = false

    const timer = window.setInterval(
      async () => {
        if (polling || cancelled) {
          return
        }

        polling = true

        try {
          const statusResult =
            await getDuplicateJob(jobId)
          const nextJob =
            statusResult?.job || null

          if (cancelled || !nextJob) {
            return
          }

          setDuplicateJob(nextJob)

          if (nextJob.status === 'completed') {
            window.clearInterval(timer)

            const overviewResult =
              await getDuplicateOverview(
                selectedTable,
              )

            if (!cancelled) {
              setDuplicateOverview(
                overviewResult?.duplicates ||
                  null,
              )
              setDuplicateError('')
            }
          }

          if (nextJob.status === 'failed') {
            window.clearInterval(timer)

            if (!cancelled) {
              setDuplicateError(
                nextJob.error_message ||
                  'Duplicate detection gagal.',
              )
            }
          }
        } catch (error) {
          console.error(error)

          if (!cancelled) {
            setDuplicateError(
              error.message ||
                'Gagal membaca status duplicate detection.',
            )
          }
        } finally {
          polling = false
        }
      },
      900,
    )

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [duplicateJob?.id, selectedTable])

  function startRename(column) {
    setEditingColumn(column.column_name)
    setEditingValue(column.column_name)
    setMessage('')
  }

  function cancelRename() {
    setEditingColumn('')
    setEditingValue('')
  }

  async function saveRename(column) {
    const nextName = editingValue.trim()

    if (!nextName) {
      setMessage(
        'Nama kolom baru tidak boleh kosong.',
      )
      return
    }

    if (
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(
        nextName,
      )
    ) {
      setMessage(
        'Gunakan huruf, angka, dan underscore; nama kolom tidak boleh diawali angka.',
      )
      return
    }

    if (nextName === column.column_name) {
      cancelRename()
      return
    }

    const duplicate = detail?.columns?.some(
      (item) =>
        item.column_name.toLowerCase() ===
          nextName.toLowerCase() &&
        item.column_name !== column.column_name,
    )

    if (duplicate) {
      setMessage(
        `Kolom '${nextName}' sudah tersedia.`,
      )
      return
    }

    const confirmed = window.confirm(
      `Ubah nama kolom?\n\n` +
        `Tabel: ${selectedTable}\n` +
        `${column.column_name} → ${nextName}\n\n` +
        'Perubahan akan diterapkan pada PostgreSQL dan schema mapping.',
    )

    if (!confirmed) return

    try {
      setRenameLoading(true)
      setMessage('')

      await renameTableColumn({
        tableName: selectedTable,
        oldName: column.column_name,
        newName: nextName,
      })

      await selectTable(selectedTable)
      await loadTables()

      setMessage(
        `Kolom '${column.column_name}' berhasil diubah menjadi '${nextName}'.`,
      )
    } catch (error) {
      console.error(error)
      setMessage(
        error.message ||
          'Gagal mengubah nama kolom.',
      )
    } finally {
      setRenameLoading(false)
      setEditingColumn('')
      setEditingValue('')
    }
  }


  async function toggleMasking(column) {
    if (!column.maskable) return

    const nextMasked = !column.masked

    if (!nextMasked) {
      const confirmed = window.confirm(
        `Tampilkan kembali data asli?\n\n` +
          `Tabel: ${selectedTable}\n` +
          `Kolom: ${column.column_name}\n\n` +
          'Data pada kolom ini akan kembali terlihat di Table Explorer.',
      )

      if (!confirmed) return
    }

    try {
      setMaskingColumn(column.column_name)
      setMessage('')

      await setTableColumnMasking({
        tableName: selectedTable,
        columnName: column.column_name,
        masked: nextMasked,
      })

      await selectTable(selectedTable)

      setMessage(
        nextMasked
          ? `Kolom '${column.column_name}' sekarang dimasking di Table Explorer.`
          : `Masking kolom '${column.column_name}' telah dinonaktifkan.`,
      )
    } catch (error) {
      console.error(error)
      setMessage(
        error.message ||
          'Gagal memperbarui masking kolom.',
      )
    } finally {
      setMaskingColumn('')
    }
  }

  function openDeleteTable() {
    if (!selectedTable || !detail?.summary) return

    setDeleteTarget({
      ...detail.summary,
      table_name: selectedTable,
    })
    setDeleteConfirmValue('')
    setMessage('')
  }

  function closeDeleteTable() {
    if (deleteLoading) return

    setDeleteTarget(null)
    setDeleteConfirmValue('')
  }

  async function confirmDeleteTable() {
    if (!deleteTarget) return

    const targetName = deleteTarget.table_name

    if (deleteConfirmValue.trim() !== targetName) {
      return
    }

    try {
      setDeleteLoading(true)
      setMessage('')

      const result = await deleteWarehouseTable(targetName)
      const removedRelationships = Number(
        result?.metadata_removed?.relationships || 0,
      )

      setDeleteTarget(null)
      setDeleteConfirmValue('')
      setSelectedTable('')
      setDetail(null)
      setLineage(null)
      setLineageError('')
      setLineageGraph(null)
      setLineageGraphError('')
      setQualityProfile(null)
      setQualityError('')
      setQualityJob(null)
      setDuplicateOverview(null)
      setDuplicateError('')
      setDuplicateJob(null)
      setDuplicateKeyColumns([])
      setDuplicateColumnSearch('')

      await loadTables({
        preserveSelection: false,
      })

      setMessage(
        `Tabel '${targetName}' berhasil dihapus permanen. ` +
          `${formatNumber(result?.row_count || 0)} baris dan ` +
          `${formatNumber(result?.column_count || 0)} kolom dihapus` +
          (removedRelationships > 0
            ? ` bersama ${formatNumber(removedRelationships)} relationship terkait.`
            : '.'),
      )
    } catch (error) {
      console.error(error)
      setMessage(
        error.message ||
          `Gagal menghapus tabel '${targetName}'.`,
      )
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <DashboardLayout>
      <main className="tp-data-tables mx-auto w-full max-w-[1480px] space-y-5">

        {message && (
          <div className="tp-data-message">
            {message}
          </div>
        )}

        {addColumnOpen && (
          <div className="tp-manual-table-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !addColumnBusy) resetAddColumn()
          }}>
            <section className="tp-manual-table-dialog tp-add-column-dialog" role="dialog" aria-modal="true" aria-labelledby="tp-add-column-heading">
              <div className="tp-manual-table-heading">
                <div>
                  <div className="tp-column-review-eyebrow">WAREHOUSE STRUCTURE</div>
                  <h2 id="tp-add-column-heading">Add Column</h2>
                  <p>Tambahkan kolom pada <strong>{selectedTable}</strong> tanpa menghapus data existing.</p>
                </div>
                <button type="button" className="tp-data-icon-button" onClick={resetAddColumn} disabled={addColumnBusy} aria-label="Tutup dialog">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAddColumn} className="tp-manual-table-form">
                <div className="tp-calc-mode-tabs">
                  <button type="button" className={columnMode === 'manual' ? 'is-active' : ''}
                    onClick={() => { setColumnMode('manual'); setAddColumnError('') }}>
                    Manual Column
                  </button>
                  <button type="button" className={columnMode === 'calculated' ? 'is-active' : ''}
                    onClick={() => { setColumnMode('calculated'); setAddColumnError('') }}>
                    Calculated Column
                  </button>
                </div>
                <label className="tp-manual-table-label">
                  Column Name
                  <input required maxLength={63} pattern="[a-z][a-z0-9_]*"
                    value={addColumnName}
                    onChange={(event) => setAddColumnName(event.target.value.toLowerCase())}
                    placeholder="contoh: kategori_risiko" />
                </label>
                {columnMode === 'manual' ? (
                  <>
                <label className="tp-manual-table-label">
                  Data Type
                  <select className="tp-add-column-select" value={addColumnType}
                    onChange={(event) => setAddColumnType(event.target.value)}>
                    {['TEXT', 'VARCHAR(255)', 'INTEGER', 'BIGINT', 'NUMERIC', 'DATE', 'TIMESTAMP', 'BOOLEAN'].map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="tp-manual-table-system">
                  <input type="checkbox" checked={addColumnNullable}
                    onChange={(event) => setAddColumnNullable(event.target.checked)} />
                  <span>Nullable — mengizinkan nilai NULL</span>
                </label>
                <label className="tp-manual-table-system">
                  <input type="checkbox" checked={addColumnHasDefault}
                    onChange={(event) => setAddColumnHasDefault(event.target.checked)} />
                  <span>Isi baris existing dengan nilai default statis</span>
                </label>
                {addColumnHasDefault && (
                  <label className="tp-manual-table-label">
                    Backfill Value ({addColumnType})
                    <input value={addColumnDefault} required
                      onChange={(event) => setAddColumnDefault(event.target.value)}
                      placeholder={addColumnType === 'DATE' ? '2026-11-04' : addColumnType === 'BOOLEAN' ? 'true' : 'Contoh: 0'} />
                  </label>
                )}
                <p className="tp-add-column-explanation">
                  Nilai default hanya digunakan sekali untuk mengisi baris existing.
                  Bukan formula otomatis dan bukan default untuk insert berikutnya.
                  Kolom baru pada tabel berisi data harus Nullable jika tidak ada backfill.
                </p>
                  </>
                ) : (
                  <>
                <div className="tp-calc-editor">
                  <label className="tp-manual-table-label">
                    Formula (NUMERIC 28,8)
                    <textarea required rows={3} maxLength={600}
                      value={calcFormula}
                      onChange={(event) => { setCalcFormula(event.target.value); setCalcPreview(null) }}
                      spellCheck={false} placeholder="(total_kredit / total_aset) * 100" />
                  </label>
                  <p className="tp-add-column-explanation">
                    Gunakan kolom numerik pada tabel ini dengan operator +, -, *, / dan tanda kurung.
                    NULL dan pembagian nol menghasilkan NULL. Rumus dihitung satu kali saat pembuatan;
                    perubahan data sumber ditandai Stale; lakukan Refresh untuk menghitung ulang.
                  </p>
                  <button type="button" className="tp-calc-preview-button"
                    disabled={addColumnBusy || !calcFormula.trim()} onClick={handleCalcPreview}>
                    Preview Formula
                  </button>
                  {calcPreview && (
                    <div className="tp-calc-preview-result">
                      <div>Source: {(calcPreview.source_columns || []).join(', ') || '—'}</div>
                      <div>Rows: {calcPreview.row_count} · NULL results: {calcPreview.null_count}</div>
                      <div>Sample (10): {(calcPreview.sample_values || []).map((v) => v === null ? 'NULL' : v).join(' · ') || '—'}</div>
                    </div>
                  )}
                  {calcDefinitions.length > 0 && (
                    <div className="tp-calc-existing-list">
                      <div className="tp-calc-section-heading">
                        <div>
                          <strong>Calculated Column Lineage</strong>
                          <span>{calcDefinitions.length} definitions · {calcTracking?.stale_count ?? '—'} stale</span>
                        </div>
                        <button type="button" className="tp-calc-refresh-all"
                          disabled={addColumnBusy || (calcTracking?.stale_count ?? 0) === 0}
                          onClick={handleRefreshStaleColumns}>
                          <RefreshCw size={13} /> Refresh Stale
                        </button>
                      </div>
                      {calcDefinitions.map((definition) => (
                        <div className="tp-calc-trace-item" key={definition.column_name}>
                          <div className="tp-calc-existing-row">
                            <div>
                              <div className="tp-calc-name-row">
                                <code>{definition.column_name}</code>
                                <span className={`tp-calc-status ${definition.status === 'current' ? 'is-current' : 'is-stale'}`}>
                                  {definition.status === 'current' ? 'Current' : 'Stale'}
                                </span>
                              </div>
                              <span className="tp-calc-formula-line">{definition.formula}</span>
                            </div>
                            <div className="tp-calc-row-actions">
                              <button type="button" disabled={addColumnBusy}
                                aria-expanded={Boolean(calcTraceExpanded[definition.column_name])}
                                onClick={() => setCalcTraceExpanded((v) => ({...v, [definition.column_name]: !v[definition.column_name]}))}>
                                <GitBranch size={13} /> Trace
                              </button>
                              <button type="button" disabled={addColumnBusy}
                                onClick={() => handleCalcRefresh(definition.column_name)}>
                                <RefreshCw size={13} /> Refresh
                              </button>
                            </div>
                          </div>
                          {calcTraceExpanded[definition.column_name] && (
                            <div className="tp-calc-trace-detail">
                              <div><b>Source columns:</b> {(definition.source_columns || []).join(', ') || '—'}</div>
                              <div><b>Calculated parents:</b> {(definition.upstream_calculated_columns || []).join(', ') || '—'}</div>
                              <div><b>Dependent columns:</b> {(definition.downstream_calculated_columns || []).join(', ') || '—'}</div>
                              <div><b>Last calculated:</b> {definition.last_calculated_at ? new Date(definition.last_calculated_at).toLocaleString('id-ID') : '—'}</div>
                              {definition.is_stale && <div><b>Stale reason:</b> {definition.stale_reason || 'Nilai perlu diverifikasi ulang.'}</div>}
                            </div>
                          )}
                        </div>
                      ))}
                      <p className="tp-calc-tracking-notice">
                        Perubahan data pada kolom sumber ditandai Stale oleh PostgreSQL.
                        Refresh menghitung dependency dari hulu ke hilir. Perubahan kolom
                        yang tidak terkait tidak memengaruhi status.
                      </p>
                    </div>
                  )}
                </div>
                  </>
                )}
                {addColumnError && <div className="tp-manual-table-error" role="alert">{addColumnError}</div>}
                <div className="tp-manual-table-footer">
                  <button type="button" className="tp-manual-table-cancel" onClick={resetAddColumn} disabled={addColumnBusy}>Cancel</button>
                  <button type="submit" className="tp-manual-table-submit" disabled={addColumnBusy}>
                    {addColumnBusy ? 'Processing...' : columnMode === 'calculated' ? 'Create Calculated Column' : 'Add Column'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {createOpen && (
          <div className="tp-manual-table-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !createBusy) resetCreateTableForm()
          }}>
            <section className="tp-manual-table-dialog" role="dialog" aria-modal="true" aria-labelledby="tp-manual-table-heading">
              <div className="tp-manual-table-heading">
                <div>
                  <div className="tp-column-review-eyebrow">WAREHOUSE STRUCTURE</div>
                  <h2 id="tp-manual-table-heading">Create Empty Table</h2>
                  <p>Definisikan tabel PostgreSQL tanpa upload Excel. Belum ada data yang ditambahkan.</p>
                </div>
                <button type="button" className="tp-data-icon-button" onClick={resetCreateTableForm} disabled={createBusy} aria-label="Tutup dialog">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleCreateTable} className="tp-manual-table-form">
                <label className="tp-manual-table-label">
                  Table Name
                  <input
                    required maxLength={63} value={newTableName}
                    onChange={(event) => setNewTableName(event.target.value.toLowerCase())}
                    placeholder="contoh: indikator_bpr_manual"
                    pattern="[a-z][a-z0-9_]*"
                    title="Gunakan huruf kecil, angka, dan underscore; harus diawali huruf"
                  />
                </label>
                <label className="tp-manual-table-system">
                  <input type="checkbox" checked={includePeriod} onChange={(event) => setIncludePeriod(event.target.checked)} />
                  <span>Tambahkan kolom sistem: <code>bank_id</code>, <code>bulan</code>, <code>tahun</code></span>
                </label>
                <div className="tp-manual-table-subhead">
                  <strong>Column Definitions</strong>
                  <span>{newColumns.length} kolom manual</span>
                </div>
                <div className="tp-manual-table-columns">
                  {newColumns.map((item, index) => (
                    <div className="tp-manual-table-column-row" key={item.id}>
                      <span className="tp-manual-table-index">{index + 1}</span>
                      <input
                        required value={item.name} maxLength={63}
                        pattern="[a-z][a-z0-9_]*"
                        placeholder="nama_kolom"
                        onChange={(event) => updateNewColumn(item.id, 'name', event.target.value.toLowerCase())}
                        aria-label={`Nama kolom ${index + 1}`}
                      />
                      <select value={item.data_type} onChange={(event) => updateNewColumn(item.id, 'data_type', event.target.value)} aria-label={`Tipe kolom ${index + 1}`}>
                        {['TEXT', 'VARCHAR(255)', 'INTEGER', 'BIGINT', 'NUMERIC', 'DATE', 'TIMESTAMP', 'BOOLEAN'].map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                      <label className="tp-manual-table-nullable" title="Izinkan NULL">
                        <input type="checkbox" checked={item.nullable} onChange={(event) => updateNewColumn(item.id, 'nullable', event.target.checked)} />
                        NULL
                      </label>
                      <button type="button" className="tp-data-icon-button" disabled={newColumns.length <= 1} onClick={() => setNewColumns((rows) => rows.filter((row) => row.id !== item.id))} aria-label={`Hapus kolom ${index + 1}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="tp-manual-table-add" disabled={newColumns.length >= 100} onClick={() => setNewColumns((rows) => [...rows, { id: Math.max(...rows.map((row) => row.id)) + 1, name: '', data_type: 'NUMERIC', nullable: true }])}>
                  <Plus size={14} /> Add Column
                </button>
                {createError && <div className="tp-manual-table-error" role="alert">{createError}</div>}
                <div className="tp-manual-table-footer">
                  <button type="button" className="tp-manual-table-cancel" onClick={resetCreateTableForm} disabled={createBusy}>Cancel</button>
                  <button type="submit" className="tp-manual-table-submit" disabled={createBusy}>{createBusy ? 'Creating...' : 'Create Empty Table'}</button>
                </div>
              </form>
            </section>
          </div>
        )}

        <section className="tp-data-tables-grid">
          <div className="tp-data-catalog">
            <div className="tp-data-panel-header">
              <div>
                <div className="tp-column-review-eyebrow">
                  Table Catalog
                </div>

                <p>
                  {tables.length} tabel tersedia
                  di PostgreSQL.
                </p>
              </div>

              <div className="tp-catalog-header-actions">
                <button
                  type="button"
                  className="tp-data-icon-button"
                  title="Buat tabel kosong"
                  aria-label="Buat tabel baru secara manual"
                  onClick={() => { setCreateError(''); setCreateOpen(true) }}
                >
                  <Plus size={16} />
                </button>
                <div className="tp-catalog-search-anchor">
                  <button
                    type="button"
                    className={`tp-data-icon-button tp-catalog-search-trigger ${
                      tableSearchOpen ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      if (tableSearchOpen) {
                        setTableSearchOpen(false)
                        setSearch('')
                        return
                      }

                      setTableSearchOpen(true)
                    }}
                    title={
                      tableSearchOpen
                        ? 'Tutup pencarian'
                        : 'Cari tabel'
                    }
                    aria-label={
                      tableSearchOpen
                        ? 'Tutup pencarian tabel'
                        : 'Buka pencarian tabel'
                    }
                    aria-expanded={tableSearchOpen}
                  >
                    <Search size={16} />
                  </button>

                  {tableSearchOpen && (
                    <div className="tp-catalog-search-popover">
                      <Search
                        size={15}
                        aria-hidden="true"
                      />

                      <input
                        autoFocus
                        value={search}
                        onChange={(event) =>
                          setSearch(
                            event.target.value,
                          )
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Escape'
                          ) {
                            setTableSearchOpen(
                              false,
                            )
                            setSearch('')
                          }
                        }}
                        placeholder="Cari nama tabel..."
                        aria-label="Cari nama tabel"
                      />

                      {search && (
                        <button
                          type="button"
                          className="tp-catalog-search-clear"
                          onClick={() =>
                            setSearch('')
                          }
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
                    className={
                      loading ? 'animate-spin' : ''
                    }
                  />
                </button>
              </div>
            </div>

            {loadError && (
              <div className="tp-data-error">
                {loadError}
              </div>
            )}

            <div className="tp-data-catalog-table-wrap">
              <table className="tp-data-catalog-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th className="text-right">
                      Rows
                    </th>
                    <th className="text-right">
                      Columns
                    </th>
                    <th className="text-right">
                      Banks
                    </th>
                    <th>Period</th>
                    <th>Schema</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTables.map(
                    (table) => (
                      <tr
                        key={table.table_name}
                        className={
                          selectedTable ===
                          table.table_name
                            ? 'is-selected'
                            : ''
                        }
                        onClick={() =>
                          selectTable(
                            table.table_name,
                          )
                        }
                      >
                        <td>
                          <div className="tp-table-name">
                            <Database size={14} />
                            {table.table_name}
                          </div>
                        </td>

                        <td className="text-right">
                          {formatNumber(
                            table.row_count,
                          )}
                        </td>

                        <td className="text-right">
                          {formatNumber(
                            table.column_count,
                          )}
                        </td>

                        <td className="text-right">
                          {formatNumber(
                            table.bank_count,
                          )}
                        </td>

                        <td>
                          {periodLabel(table)}
                        </td>

                        <td>
                          <span
                            className={`tp-schema-badge ${
                              table.schema_status ===
                              'mapped'
                                ? 'is-mapped'
                                : ''
                            }`}
                          >
                            {table.schema_status ===
                            'mapped'
                              ? 'Mapped'
                              : 'Unmapped'}
                          </span>
                        </td>
                      </tr>
                    ),
                  )}

                  {!loading &&
                    filteredTables.length === 0 && (
                      <tr>
                        <td
                          colSpan="6"
                          className="tp-data-empty"
                        >
                          Tidak ada tabel yang
                          sesuai pencarian.
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

                <h2>
                  {selectedTable || 'Pilih tabel'}
                </h2>
              </div>

              <div className="tp-column-review-actions">
                <button
                  type="button"
                  className="tp-data-icon-button tp-add-column-trigger"
                  disabled={!selectedTable || detailLoading}
                  onClick={openAddColumn}
                  title="Tambah kolom pada tabel ini"
                  aria-label="Tambah kolom pada tabel ini"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  className="tp-data-icon-button tp-delete-table-trigger"
                  onClick={openDeleteTable}
                  disabled={!selectedTable || detailLoading}
                  title="Hapus tabel permanen"
                  aria-label="Hapus tabel permanen"
                >
                  <Trash2 size={16} />
                </button>

                <Columns3 size={20} />
              </div>
            </div>

            {detail?.summary && (
              <div className="tp-detail-summary">
                <div>
                  <span>Rows</span>
                  <strong>
                    {formatNumber(
                      detail.summary.row_count,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Columns</span>
                  <strong>
                    {formatNumber(
                      detail.summary.column_count,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Banks</span>
                  <strong>
                    {formatNumber(
                      detail.summary.bank_count,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Period</span>
                  <strong>
                    {periodLabel(
                      detail.summary,
                    )}
                  </strong>
                </div>
              </div>
            )}

            <div className="tp-data-search">
              <Search size={16} />
              <input
                value={columnSearch}
                onChange={(event) =>
                  setColumnSearch(
                    event.target.value,
                  )
                }
                placeholder="Cari column name..."
                aria-label="Cari column name"
                disabled={!selectedTable || detailLoading}
              />
            </div>

            <div className="tp-column-table-wrap">
              {detailLoading ? (
                <div className="tp-detail-loading">
                  Membaca schema...
                </div>
              ) : (
                <table className="tp-column-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Column Name</th>
                      <th>Type</th>
                      <th>Source</th>
                      <th>Masking</th>
                      <th className="text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredColumns.map(
                      (column) => (
                        <tr
                          key={
                            column.column_name
                          }
                        >
                          <td className="tp-column-ordinal">
                            {column.ordinal}
                          </td>

                          <td>
                            {editingColumn ===
                            column.column_name ? (
                              <input
                                autoFocus
                                value={
                                  editingValue
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setEditingValue(
                                    event.target
                                      .value,
                                  )
                                }
                                onKeyDown={(
                                  event,
                                ) => {
                                  if (
                                    event.key ===
                                    'Enter'
                                  ) {
                                    saveRename(
                                      column,
                                    )
                                  }

                                  if (
                                    event.key ===
                                    'Escape'
                                  ) {
                                    cancelRename()
                                  }
                                }}
                                className="tp-column-edit-input"
                              />
                            ) : (
                              <div className="tp-column-name-cell">
                                <span>
                                  {
                                    column.column_name
                                  }
                                </span>

                                {column.system_column && (
                                  <LockKeyhole
                                    size={12}
                                  />
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
                              {column.source_column ||
                                '-'}
                            </span>
                          </td>

                          <td>
                            {column.maskable ? (
                              <button
                                type="button"
                                className={`tp-masking-toggle ${
                                  column.masked
                                    ? 'is-masked'
                                    : ''
                                }`}
                                onClick={() =>
                                  toggleMasking(
                                    column,
                                  )
                                }
                                disabled={
                                  maskingColumn ===
                                  column.column_name
                                }
                                title={
                                  column.masked
                                    ? 'Nonaktifkan masking'
                                    : 'Aktifkan masking'
                                }
                              >
                                {column.masked ? (
                                  <EyeOff
                                    size={13}
                                  />
                                ) : (
                                  <Eye
                                    size={13}
                                  />
                                )}

                                <span>
                                  {column.masked
                                    ? 'Masked'
                                    : 'Visible'}
                                </span>
                              </button>
                            ) : (
                              <span className="tp-locked-label">
                                Locked
                              </span>
                            )}
                          </td>

                          <td className="text-right">
                            {editingColumn ===
                            column.column_name ? (
                              <div className="tp-inline-actions">
                                <Button
                                  type="button"
                                  size="small"
                                  disabled={
                                    renameLoading
                                  }
                                  onClick={() =>
                                    saveRename(
                                      column,
                                    )
                                  }
                                >
                                  Simpan
                                </Button>

                                <button
                                  type="button"
                                  className="tp-data-icon-button"
                                  onClick={
                                    cancelRename
                                  }
                                  disabled={
                                    renameLoading
                                  }
                                  title="Batal"
                                >
                                  <X
                                    size={14}
                                  />
                                </button>
                              </div>
                            ) : column.editable ? (
                              <button
                                type="button"
                                className="tp-edit-column-button"
                                onClick={() =>
                                  startRename(
                                    column,
                                  )
                                }
                              >
                                <PencilLine
                                  size={13}
                                />
                                Edit
                              </button>
                            ) : (
                              <span className="tp-locked-label">
                                Locked
                              </span>
                            )}
                          </td>
                        </tr>
                      ),
                    )}

                    {!detailLoading &&
                      filteredColumns.length === 0 && (
                        <tr>
                          <td
                            colSpan="6"
                            className="tp-data-empty"
                          >
                            {selectedTable &&
                            (detail?.columns || [])
                              .length > 0
                              ? 'Tidak ada column name yang sesuai pencarian.'
                              : 'Pilih tabel untuk melihat schema.'}
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
                bank_id, bulan, dan tahun merupakan
                system columns dan tidak dapat
                diubah atau dimasking. Masking
                hanya memengaruhi data yang
                dikirim ke Table Explorer; nilai
                asli tetap tersimpan di PostgreSQL.
              </span>
            </div>
          </aside>

                    <section className="tp-insight-launcher">
            <button
              type="button"
              className={`tp-insight-menu-button ${
                activeInsightPanel === 'lineage'
                  ? 'is-active'
                  : ''
              }`}
              onClick={() =>
                setActiveInsightPanel((current) =>
                  current === 'lineage'
                    ? null
                    : 'lineage',
                )
              }
              aria-expanded={
                activeInsightPanel === 'lineage'
              }
            >
              <GitBranch size={14} />

              <span className="tp-insight-menu-copy">
                <strong>Data Lineage</strong>
                <small>
                  {!selectedTable
                    ? 'Select table'
                    : lineage?.lineage_type ===
                        'derived_table'
                      ? 'Derived'
                      : lineage?.lineage_type ===
                          'source_table'
                        ? 'Source'
                        : 'No lineage'}
                </small>
              </span>

              <span className="tp-insight-menu-caret">
                {activeInsightPanel === 'lineage'
                  ? '−'
                  : '+'}
              </span>
            </button>

            <button
              type="button"
              className={`tp-insight-menu-button ${
                activeInsightPanel === 'completeness'
                  ? 'is-active'
                  : ''
              }`}
              onClick={() =>
                setActiveInsightPanel((current) =>
                  current === 'completeness'
                    ? null
                    : 'completeness',
                )
              }
              aria-expanded={
                activeInsightPanel === 'completeness'
              }
            >
              <Columns3 size={14} />

              <span className="tp-insight-menu-copy">
                <strong>Completeness</strong>
                <small>
                  {!selectedTable
                    ? 'Select table'
                    : qualityProfile?.profiled
                      ? `${formatPercent(
                          qualityProfile.current
                            ?.completeness_score,
                        )}${
                          qualityProfile.freshness ===
                          'stale'
                            ? ' · Stale'
                            : ''
                        }`
                      : 'Not profiled'}
                </small>
              </span>

              <span className="tp-insight-menu-caret">
                {activeInsightPanel ===
                'completeness'
                  ? '−'
                  : '+'}
              </span>
            </button>

            <button
              type="button"
              className={`tp-insight-menu-button ${
                activeInsightPanel === 'duplicates'
                  ? 'is-active'
                  : ''
              }`}
              onClick={() =>
                setActiveInsightPanel((current) =>
                  current === 'duplicates'
                    ? null
                    : 'duplicates',
                )
              }
              aria-expanded={
                activeInsightPanel === 'duplicates'
              }
            >
              <Database size={14} />

              <span className="tp-insight-menu-copy">
                <strong>Duplicates</strong>
                <small>
                  {!selectedTable
                    ? 'Select table'
                    : duplicateOverview?.checked
                      ? `${formatPercent(
                          duplicateOverview.latest
                            ?.uniqueness_score,
                        )} unique${
                          duplicateOverview.latest
                            ?.freshness === 'stale'
                            ? ' · Stale'
                            : ''
                        }`
                      : 'Not checked'}
                </small>
              </span>

              <span className="tp-insight-menu-caret">
                {activeInsightPanel === 'duplicates'
                  ? '−'
                  : '+'}
              </span>
            </button>
          </section>

          {activeInsightPanel === 'lineage' && (
<section className="tp-data-lineage-workspace tp-insight-teardrop-panel tp-insight-teardrop-panel--lineage">
            {!selectedTable ? (
              <div className="tp-lineage-workspace-empty">
                <GitBranch size={16} />

                <div>
                  <strong>Lineage & Query Detail</strong>
                  <span>
                    Pilih tabel untuk melihat lineage, query provenance,
                    dan column-level lineage.
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
                        lineage.lineage_type ===
                        'derived_table'
                          ? 'is-derived'
                          : 'is-source'
                      }`}
                    >
                      {lineage.lineage_type ===
                      'derived_table'
                        ? 'Derived Table'
                        : 'Source Table'}
                    </span>
                  </div>

                  <p>
                    {lineage.lineage_type ===
                    'derived_table'
                      ? 'Direct upstream lineage dari materialisasi Visual SQL Builder.'
                      : 'Belum ada upstream transformation yang direkam untuk tabel ini.'}
                  </p>
                </div>

                {lineage.lineage_type ===
                'derived_table' ? (
                  <>
                    {lineageGraph &&
                      lineageGraph.node_count > 1 && (
                      <div className="tp-lineage-map-section">
                        <div className="tp-lineage-map-toolbar">
                          <div>
                            <span>
                              Recursive Lineage Map
                            </span>

                            <small>
                              {formatNumber(
                                lineageGraph.node_count,
                              )}{' '}
                              tables ·{' '}
                              {formatNumber(
                                lineageGraph.edge_count,
                              )}{' '}
                              dependencies
                            </small>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setLineageMapOpen(
                                (value) =>
                                  !value,
                              )
                            }
                          >
                            {lineageMapOpen
                              ? 'Hide map'
                              : 'Show map'}
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
                                width={
                                  lineageGraphLayout.width
                                }
                                height={
                                  lineageGraphLayout.height
                                }
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

                                {lineageGraphLayout.edges.map(
                                  (edge) => {
                                    const control =
                                      Math.max(
                                        28,
                                        (edge.x2 -
                                          edge.x1) /
                                          2,
                                      )

                                    return (
                                      <path
                                        key={
                                          edge.id
                                        }
                                        d={`M ${edge.x1} ${edge.y1} C ${edge.x1 + control} ${edge.y1}, ${edge.x2 - control} ${edge.y2}, ${edge.x2} ${edge.y2}`}
                                        className="tp-lineage-map-edge"
                                        markerEnd="url(#tp-lineage-arrow)"
                                      />
                                    )
                                  },
                                )}
                              </svg>

                              {lineageGraphLayout.nodes.map(
                                (node) => {
                                  const canOpen =
                                    Boolean(
                                      node.available,
                                    ) &&
                                    tables.some(
                                      (table) =>
                                        table.table_name ===
                                        node.table_name,
                                    )

                                  return (
                                    <button
                                      key={
                                        node.table_name
                                      }
                                      type="button"
                                      className={`tp-lineage-map-node ${
                                        node.lineage_type ===
                                        'derived_table'
                                          ? 'is-derived'
                                          : 'is-source'
                                      } ${
                                        node.is_selected
                                          ? 'is-selected'
                                          : ''
                                      }`}
                                      style={{
                                        left: `${node.x}px`,
                                        top: `${node.y}px`,
                                        width: `${node.width}px`,
                                        height: `${node.height}px`,
                                      }}
                                      disabled={
                                        !canOpen ||
                                        node.is_selected
                                      }
                                      onClick={() =>
                                        selectTable(
                                          node.table_name,
                                        )
                                      }
                                      title={
                                        node.is_selected
                                          ? 'Current table'
                                          : canOpen
                                            ? `Buka ${node.table_name}`
                                            : `${node.table_name} tidak tersedia di katalog`
                                      }
                                    >
                                      <span className="tp-lineage-map-node-icon">
                                        <Database
                                          size={12}
                                        />
                                      </span>

                                      <span className="tp-lineage-map-node-copy">
                                        <strong>
                                          {
                                            node.table_name
                                          }
                                        </strong>

                                        <small>
                                          {node.lineage_type ===
                                          'derived_table'
                                            ? node.saved_query
                                                ?.available
                                              ? `Derived · ${node.saved_query.query_name}`
                                              : 'Derived Table'
                                            : 'Source Table'}
                                        </small>
                                      </span>
                                    </button>
                                  )
                                },
                              )}
                            </div>
                          </div>
                        )}

                        {(lineageGraph.truncated ||
                          lineageGraph.cycle_detected) && (
                          <div className="tp-lineage-map-warning">
                            {lineageGraph.cycle_detected
                              ? 'Cycle terdeteksi pada metadata lineage. Traversal dihentikan pada cabang terkait.'
                              : 'Lineage map mencapai batas kedalaman maksimum.'}
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
                        <strong>
                          {lineage.base_table || '-'}
                        </strong>
                      </div>

                      <div>
                        <span>Sources</span>
                        <strong>
                          {formatNumber(
                            lineage.transformation
                              ?.source_count,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Joins</span>
                        <strong>
                          {formatNumber(
                            lineage.transformation
                              ?.join_count,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Created</span>
                        <strong>
                          {formatDateTime(
                            lineage.created_at,
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="tp-lineage-body">
                      <div className="tp-lineage-block">
                        <span className="tp-lineage-label">
                          Upstream tables
                        </span>

                        <div className="tp-lineage-source-list">
                          {(lineage.source_details ||
                            []).map((source) => {
                            const canOpen =
                              Boolean(
                                source.available,
                              ) &&
                              tables.some(
                                (table) =>
                                  table.table_name ===
                                  source.table_name,
                              )

                            return (
                              <button
                                key={
                                  source.table_name
                                }
                                type="button"
                                className={`tp-lineage-source-chip ${
                                  source.is_base_table
                                    ? 'is-base'
                                    : ''
                                }`}
                                disabled={!canOpen}
                                onClick={() =>
                                  selectTable(
                                    source.table_name,
                                  )
                                }
                                title={
                                  canOpen
                                    ? `Buka ${source.table_name}`
                                    : `${source.table_name} tidak tersedia di katalog`
                                }
                              >
                                <Database
                                  size={11}
                                />

                                <span>
                                  {
                                    source.table_name
                                  }
                                </span>

                                {source.is_base_table && (
                                  <em>Base</em>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="tp-lineage-transformation-row">
                        <div>
                          <span>Transformation</span>
                          <strong>
                            {lineage.transformation
                              ?.engine ||
                              'Visual SQL Builder'}
                          </strong>
                        </div>

                        <div>
                          <span>Output</span>
                          <strong>
                            {formatNumber(
                              lineage.transformation
                                ?.output_count,
                            )}{' '}
                            columns
                          </strong>
                        </div>

                        <div>
                          <span>Filters</span>
                          <strong>
                            {formatNumber(
                              lineage.transformation
                                ?.filter_count,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>Sort</span>
                          <strong>
                            {lineage.transformation
                              ?.has_sort
                              ? 'Yes'
                              : 'No'}
                          </strong>
                        </div>
                      </div>

                      <div className="tp-lineage-query-row">
                        <span>
                          Saved Query
                        </span>

                        <strong>
                          {lineage.source_saved_query
                            ?.available
                            ? lineage
                                .source_saved_query
                                .query_name
                            : lineage
                                  .source_saved_query
                                  ?.id
                              ? `Query #${lineage.source_saved_query.id} sudah tidak tersedia`
                              : 'Ad hoc query'}
                        </strong>
                      </div>

                      {lineage.description && (
                        <div className="tp-lineage-description">
                          {
                            lineage.description
                          }
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
                                <th>
                                  Output Column
                                </th>
                                <th>
                                  Source
                                </th>
                                <th>
                                  State
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {(lineage.column_lineage ||
                                []).map(
                                (column) => (
                                  <tr
                                    key={
                                      column.output_column
                                    }
                                  >
                                    <td>
                                      <code>
                                        {
                                          column.output_column
                                        }
                                      </code>
                                    </td>

                                    <td>
                                      <code>
                                        {column.source_reference ||
                                          '-'}
                                      </code>
                                    </td>

                                    <td>
                                      <span
                                        className={`tp-lineage-mask-badge ${
                                          column.masked
                                            ? 'is-masked'
                                            : ''
                                        }`}
                                      >
                                        {column.masked
                                          ? 'Masked'
                                          : 'Visible'}
                                      </span>
                                    </td>
                                  </tr>
                                ),
                              )}

                              {(lineage.column_lineage ||
                                []).length ===
                                0 && (
                                <tr>
                                  <td
                                    colSpan="3"
                                    className="tp-lineage-empty"
                                  >
                                    Column lineage
                                    belum tersedia.
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
                      <strong>
                        No upstream lineage recorded
                      </strong>

                      <span>
                        Tabel ini diperlakukan sebagai
                        source table pada lineage Caffeine
                        Theory saat ini.
                      </span>
                    </div>
                  </div>
                )}
              </section>
            )}

            {!detailLoading && lineageError && (
              <div className="tp-lineage-error">
                {lineageError}
              </div>
            )}
                {!lineage && !lineageError && (
                  <div className="tp-lineage-workspace-empty">
                    <GitBranch size={16} />

                    <div>
                      <strong>Lineage belum tersedia</strong>
                      <span>
                        Belum ada metadata lineage yang dapat ditampilkan
                        untuk tabel ini.
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
          )}

          {activeInsightPanel === 'completeness' && (
<section className="tp-data-quality-workspace tp-insight-teardrop-panel tp-insight-teardrop-panel--completeness">
            <div className="tp-quality-header">
              <div>
                <div className="tp-column-review-eyebrow">
                  Data Quality
                </div>

                <h2>
                  Completeness Profiling
                </h2>

                <p>
                  Monitoring null dan blank pada business columns
                  berdasarkan profiling metadata.
                </p>
              </div>

              <div className="tp-quality-header-actions">
                {qualityProfile?.freshness && (
                  <span
                    className={`tp-quality-freshness ${
                      qualityProfile.freshness ===
                      'current'
                        ? 'is-current'
                        : qualityProfile.freshness ===
                            'stale'
                          ? 'is-stale'
                          : 'is-empty'
                    }`}
                  >
                    {qualityProfile.freshness ===
                    'current'
                      ? 'Current'
                      : qualityProfile.freshness ===
                          'stale'
                        ? 'Stale'
                        : 'Not profiled'}
                  </span>
                )}

                <button
                  type="button"
                  className="tp-quality-run-button"
                  onClick={runCompletenessProfile}
                  disabled={
                    !selectedTable ||
                    qualityRunLoading ||
                    ['queued', 'running'].includes(
                      qualityJob?.status,
                    )
                  }
                >
                  <RefreshCw
                    size={13}
                    className={
                      qualityRunLoading ||
                      ['queued', 'running'].includes(
                        qualityJob?.status,
                      )
                        ? 'animate-spin'
                        : ''
                    }
                  />

                  <span>
                    {qualityJob?.status === 'queued'
                      ? 'Queued'
                      : qualityJob?.status ===
                          'running'
                        ? `Profiling ${qualityJob.progress_pct || 0}%`
                        : qualityProfile?.profiled
                          ? 'Re-profile'
                          : 'Run profile'}
                  </span>
                </button>
              </div>
            </div>

            {!selectedTable ? (
              <div className="tp-quality-empty">
                Pilih tabel untuk melihat completeness profile.
              </div>
            ) : qualityError ? (
              <div className="tp-quality-error">
                {qualityError}
              </div>
            ) : !qualityProfile?.profiled ? (
              <div className="tp-quality-empty">
                <strong>
                  Completeness profile belum tersedia.
                </strong>
                <span>
                  Jalankan profiling untuk membuat baseline
                  completeness dan history pertama.
                </span>
              </div>
            ) : (
              <>
                {qualityProfile.freshness ===
                  'stale' && (
                  <div className="tp-quality-stale-banner">
                    <TriangleAlert size={14} />

                    <span>
                      Data atau schema berubah setelah profile terakhir.
                      Jalankan re-profile untuk memperbarui completeness.
                    </span>
                  </div>
                )}

                <div className="tp-quality-summary">
                  <div>
                    <span>Completeness</span>
                    <strong>
                      {formatPercent(
                        qualityProfile.current
                          ?.completeness_score,
                      )}
                    </strong>

                    {qualityProfile
                      .delta_completeness_pp !==
                      null &&
                      qualityProfile
                        .delta_completeness_pp !==
                        undefined && (
                        <small
                          className={
                            qualityProfile
                              .delta_completeness_pp <
                            0
                              ? 'is-negative'
                              : qualityProfile
                                    .delta_completeness_pp >
                                  0
                                ? 'is-positive'
                                : ''
                          }
                        >
                          {qualityProfile
                            .delta_completeness_pp >
                          0
                            ? '+'
                            : ''}
                          {
                            qualityProfile
                              .delta_completeness_pp
                          }{' '}
                          pp vs previous
                        </small>
                      )}
                  </div>

                  <div>
                    <span>Missing Values</span>
                    <strong>
                      {formatNumber(
                        qualityProfile.current
                          ?.missing_business_values,
                      )}
                    </strong>
                    <small>
                      sample business cells
                    </small>
                  </div>

                  <div>
                    <span>Affected Columns</span>
                    <strong>
                      {formatNumber(
                        qualityProfile.current
                          ?.affected_business_columns,
                      )}
                      {' / '}
                      {formatNumber(
                        qualityProfile.current
                          ?.business_column_count,
                      )}
                    </strong>
                    <small>
                      business columns
                    </small>
                  </div>

                  <div>
                    <span>Last Profiled</span>
                    <strong>
                      {formatDateTime(
                        qualityProfile.current
                          ?.created_at,
                      )}
                    </strong>
                    <small>
                      {qualityProfile.current
                        ?.profile_mode || '-'}{' '}
                      ·{' '}
                      {formatNumber(
                        qualityProfile.current
                          ?.sample_row_count,
                      )}{' '}
                      rows
                    </small>
                  </div>
                </div>

                <div className="tp-quality-grid">
                  <div className="tp-quality-column-panel">
                    <div className="tp-quality-section-title">
                      Column Completeness
                    </div>

                    <div className="tp-quality-table-wrap">
                      <table className="tp-quality-table">
                        <thead>
                          <tr>
                            <th>Column</th>
                            <th>Completeness</th>
                            <th>Missing</th>
                            <th>Null</th>
                            <th>Blank</th>
                            <th>Severity</th>
                          </tr>
                        </thead>

                        <tbody>
                          {(qualityProfile.current
                            ?.columns ||
                            []).map(
                            (column) => (
                              <tr
                                key={
                                  column.column_name
                                }
                                className={
                                  column.is_system
                                    ? 'is-system'
                                    : ''
                                }
                              >
                                <td>
                                  <div className="tp-quality-column-name">
                                    <code>
                                      {
                                        column.column_name
                                      }
                                    </code>

                                    {column.is_system && (
                                      <span>
                                        System
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td>
                                  <div className="tp-quality-completeness-cell">
                                    <strong>
                                      {formatPercent(
                                        column.completeness_score,
                                      )}
                                    </strong>

                                    <div className="tp-quality-progress">
                                      <span
                                        style={{
                                          width: `${Math.max(
                                            0,
                                            Math.min(
                                              100,
                                              Number(
                                                column.completeness_score ||
                                                  0,
                                              ),
                                            ),
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </td>

                                <td>
                                  {formatNumber(
                                    column.missing_count,
                                  )}
                                </td>

                                <td>
                                  {formatNumber(
                                    column.null_count,
                                  )}
                                </td>

                                <td>
                                  {formatNumber(
                                    column.blank_count,
                                  )}
                                </td>

                                <td>
                                  <span
                                    className={`tp-quality-severity is-${column.severity || 'unknown'}`}
                                  >
                                    {qualitySeverityLabel(
                                      column.severity,
                                    )}
                                  </span>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="tp-quality-history-panel">
                    <div className="tp-quality-section-title">
                      Completeness History
                    </div>

                    <div className="tp-quality-history-list">
                      {(qualityProfile.history ||
                        []).map(
                        (snapshot, index) => (
                          <div
                            key={snapshot.id}
                            className={`tp-quality-history-row ${
                              index === 0
                                ? 'is-latest'
                                : ''
                            }`}
                          >
                            <div>
                              <strong>
                                {formatPercent(
                                  snapshot.completeness_score,
                                )}
                              </strong>
                              <span>
                                Data version{' '}
                                {
                                  snapshot.source_data_version
                                }
                              </span>
                            </div>

                            <div>
                              <strong>
                                {formatNumber(
                                  snapshot.missing_business_values,
                                )}
                              </strong>
                              <span>
                                missing
                              </span>
                            </div>

                            <time>
                              {formatDateTime(
                                snapshot.created_at,
                              )}
                            </time>
                          </div>
                        ),
                      )}
                    </div>

                    <div className="tp-quality-history-note">
                      Overall score menggunakan business columns.
                      System columns tetap ditampilkan tetapi tidak
                      memengaruhi score.
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
          )}

          {activeInsightPanel === 'duplicates' && (
<section className="tp-data-duplicate-workspace tp-insight-teardrop-panel tp-insight-teardrop-panel--duplicates">
            <div className="tp-quality-header">
              <div>
                <div className="tp-column-review-eyebrow">
                  Data Quality
                </div>

                <h2>
                  Duplicate Detection
                </h2>

                <p>
                  Identifikasi exact duplicate rows atau duplikasi berdasarkan selected key.
                </p>
              </div>

              <div className="tp-quality-header-actions">
                {duplicateOverview?.latest && (
                  <span
                    className={`tp-quality-freshness ${
                      duplicateOverview.latest
                        .freshness === 'current'
                        ? 'is-current'
                        : 'is-stale'
                    }`}
                  >
                    {duplicateOverview.latest
                      .freshness === 'current'
                      ? 'Current'
                      : 'Stale'}
                  </span>
                )}

                <button
                  type="button"
                  className="tp-quality-run-button"
                  onClick={runDuplicateDetection}
                  disabled={
                    !selectedTable ||
                    duplicateRunLoading ||
                    ['queued', 'running'].includes(
                      duplicateJob?.status,
                    ) ||
                    (duplicateMode ===
                      'selected_key' &&
                      duplicateKeyColumns.length === 0)
                  }
                >
                  <RefreshCw
                    size={13}
                    className={
                      duplicateRunLoading ||
                      ['queued', 'running'].includes(
                        duplicateJob?.status,
                      )
                        ? 'animate-spin'
                        : ''
                    }
                  />

                  <span>
                    {duplicateJob?.status === 'queued'
                      ? 'Queued'
                      : duplicateJob?.status ===
                          'running'
                        ? 'Checking'
                        : 'Run check'}
                  </span>
                </button>
              </div>
            </div>

            {!selectedTable ? (
              <div className="tp-quality-empty">
                Pilih tabel untuk menjalankan duplicate detection.
              </div>
            ) : (
              <>
                <div className="tp-duplicate-config">
                  <div className="tp-duplicate-mode">
                    <span>Detection Mode</span>

                    <div className="tp-duplicate-mode-buttons">
                      <button
                        type="button"
                        className={
                          duplicateMode === 'exact_row'
                            ? 'is-active'
                            : ''
                        }
                        onClick={() => {
                          setDuplicateMode('exact_row')
                          setDuplicateError('')
                        }}
                      >
                        Exact Row
                      </button>

                      <button
                        type="button"
                        className={
                          duplicateMode === 'selected_key'
                            ? 'is-active'
                            : ''
                        }
                        onClick={() => {
                          setDuplicateMode('selected_key')
                          setDuplicateError('')
                        }}
                      >
                        Selected Key
                      </button>
                    </div>

                    <small>
                      {duplicateMode === 'exact_row'
                        ? 'Mendeteksi baris identik pada seluruh physical columns, termasuk system columns.'
                        : 'Mendeteksi lebih dari satu row dengan kombinasi key yang sama. NULL/blank key diabaikan.'}
                    </small>
                  </div>

                  {duplicateMode === 'selected_key' && (
                    <div className="tp-duplicate-key-picker">
                      <div className="tp-duplicate-key-picker-head">
                        <div>
                          <span>Key Columns</span>
                          <small>
                            {duplicateKeyColumns.length}
                            {' / 8 selected'}
                          </small>
                        </div>

                        <div className="tp-duplicate-key-search">
                          <Search size={13} />
                          <input
                            value={duplicateColumnSearch}
                            onChange={(event) =>
                              setDuplicateColumnSearch(
                                event.target.value,
                              )
                            }
                            placeholder="Cari column..."
                          />
                        </div>
                      </div>

                      <div className="tp-duplicate-column-options">
                        {duplicateSelectableColumns.map(
                          (column) => {
                            const selected =
                              duplicateKeyColumns.includes(
                                column.column_name,
                              )

                            return (
                              <button
                                type="button"
                                key={column.column_name}
                                className={
                                  selected
                                    ? 'is-selected'
                                    : ''
                                }
                                onClick={() =>
                                  toggleDuplicateKeyColumn(
                                    column.column_name,
                                  )
                                }
                              >
                                <span
                                  className="tp-duplicate-checkbox"
                                  aria-hidden="true"
                                >
                                  {selected ? '✓' : ''}
                                </span>

                                <code>
                                  {column.column_name}
                                </code>
                              </button>
                            )
                          },
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {duplicateError && (
                  <div className="tp-quality-error tp-duplicate-inline-error">
                    {duplicateError}
                  </div>
                )}

                {!duplicateOverview?.checked ? (
                  <div className="tp-quality-empty">
                    <strong>
                      Duplicate baseline belum tersedia.
                    </strong>
                    <span>
                      Pilih detection mode lalu jalankan check. Hasil disimpan sebagai snapshot historis.
                    </span>
                  </div>
                ) : (
                  <>
                    {duplicateOverview.latest
                      ?.freshness === 'stale' && (
                      <div className="tp-quality-stale-banner">
                        <TriangleAlert size={14} />
                        <span>
                          Data berubah setelah duplicate check terakhir. Jalankan check baru untuk memperbarui hasil.
                        </span>
                      </div>
                    )}

                    <div className="tp-quality-summary tp-duplicate-summary">
                      <div>
                        <span>Uniqueness</span>
                        <strong>
                          {formatPercent(
                            duplicateOverview.latest
                              ?.uniqueness_score,
                          )}
                        </strong>
                        <small>
                          {duplicateModeLabel(
                            duplicateOverview.latest?.mode,
                          )}
                        </small>
                      </div>

                      <div>
                        <span>Duplicate Groups</span>
                        <strong>
                          {formatNumber(
                            duplicateOverview.latest
                              ?.duplicate_group_count,
                          )}
                        </strong>
                        <small>distinct groups</small>
                      </div>

                      <div>
                        <span>Affected Rows</span>
                        <strong>
                          {formatNumber(
                            duplicateOverview.latest
                              ?.duplicate_row_count,
                          )}
                        </strong>
                        <small>
                          {formatPercent(
                            duplicateOverview.latest
                              ?.affected_rate_pct,
                          )}{' '}
                          eligible rows
                        </small>
                      </div>

                      <div>
                        <span>Redundant Rows</span>
                        <strong>
                          {formatNumber(
                            duplicateOverview.latest
                              ?.redundant_row_count,
                          )}
                        </strong>
                        <small>
                          {formatPercent(
                            duplicateOverview.latest
                              ?.duplicate_rate_pct,
                          )}{' '}
                          duplicate rate
                        </small>
                      </div>
                    </div>

                    <div className="tp-duplicate-meta-strip">
                      <div>
                        <span>Mode</span>
                        <strong>
                          {duplicateModeLabel(
                            duplicateOverview.latest?.mode,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Key</span>
                        <strong>
                          {duplicateOverview.latest?.mode ===
                          'selected_key'
                            ? duplicateOverview.latest.key_columns.join(
                                ' + ',
                              )
                            : 'All physical columns'}
                        </strong>
                      </div>

                      <div>
                        <span>Eligible Rows</span>
                        <strong>
                          {formatNumber(
                            duplicateOverview.latest
                              ?.eligible_row_count,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Ignored Incomplete</span>
                        <strong>
                          {formatNumber(
                            duplicateOverview.latest
                              ?.ignored_incomplete_rows,
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="tp-quality-grid tp-duplicate-result-grid">
                      <div className="tp-quality-column-panel">
                        <div className="tp-quality-section-title">
                          Top Duplicate Groups
                        </div>

                        <div className="tp-quality-table-wrap">
                          <table className="tp-quality-table tp-duplicate-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Group / Key</th>
                                <th>Rows</th>
                                <th>Redundant</th>
                              </tr>
                            </thead>

                            <tbody>
                              {(duplicateOverview.latest
                                ?.groups ||
                                []).map((group) => (
                                <tr key={group.id}>
                                  <td>{group.rank}</td>
                                  <td>
                                    <div className="tp-duplicate-preview">
                                      {duplicatePreviewLabel(
                                        group,
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    {formatNumber(
                                      group.row_count,
                                    )}
                                  </td>
                                  <td>
                                    {formatNumber(
                                      group.redundant_row_count,
                                    )}
                                  </td>
                                </tr>
                              ))}

                              {(duplicateOverview.latest
                                ?.groups || []).length ===
                                0 && (
                                <tr>
                                  <td
                                    colSpan="4"
                                    className="tp-data-empty"
                                  >
                                    Tidak ditemukan duplicate group.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="tp-quality-history-panel">
                        <div className="tp-quality-section-title">
                          Duplicate History
                        </div>

                        <div className="tp-quality-history-list">
                          {(duplicateOverview.history ||
                            []).map(
                            (snapshot, index) => (
                              <div
                                key={snapshot.id}
                                className={`tp-quality-history-row ${
                                  index === 0
                                    ? 'is-latest'
                                    : ''
                                }`}
                              >
                                <div>
                                  <strong>
                                    {formatPercent(
                                      snapshot.uniqueness_score,
                                    )}
                                  </strong>
                                  <span>
                                    {duplicateModeLabel(
                                      snapshot.mode,
                                    )}
                                  </span>
                                </div>

                                <div>
                                  <strong>
                                    {formatNumber(
                                      snapshot.redundant_row_count,
                                    )}
                                  </strong>
                                  <span>redundant</span>
                                </div>

                                <time>
                                  {formatDateTime(
                                    snapshot.created_at,
                                  )}
                                  {' · v'}
                                  {snapshot.source_data_version}
                                </time>
                              </div>
                            ),
                          )}
                        </div>

                        <div className="tp-quality-history-note">
                          Uniqueness = 100% − redundant rows / eligible rows. Selected Key mengabaikan NULL/blank key.
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
          )}
        </section>

        {deleteTarget && (
          <div
            className="tp-delete-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeDeleteTable()
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
                <h2 id="tp-delete-table-title">
                  Hapus tabel secara permanen?
                </h2>

                <p>
                  Tabel PostgreSQL dan metadata yang terkait akan
                  dihapus. Relationship, profile, schema mapping,
                  dan pengaturan masking yang mereferensikan tabel
                  ini juga akan dibersihkan.
                </p>

                <div className="tp-delete-table-summary">
                  <div>
                    <span>Table</span>
                    <strong>{deleteTarget.table_name}</strong>
                  </div>
                  <div>
                    <span>Rows</span>
                    <strong>
                      {formatNumber(deleteTarget.row_count)}
                    </strong>
                  </div>
                  <div>
                    <span>Columns</span>
                    <strong>
                      {formatNumber(deleteTarget.column_count)}
                    </strong>
                  </div>
                </div>

                <label className="tp-delete-confirm-field">
                  <span>
                    Ketik <strong>{deleteTarget.table_name}</strong>{' '}
                    untuk mengonfirmasi.
                  </span>
                  <input
                    autoFocus
                    value={deleteConfirmValue}
                    onChange={(event) =>
                      setDeleteConfirmValue(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        deleteConfirmValue.trim() ===
                          deleteTarget.table_name &&
                        !deleteLoading
                      ) {
                        confirmDeleteTable()
                      }

                      if (event.key === 'Escape') {
                        closeDeleteTable()
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
                      deleteConfirmValue.trim() !==
                        deleteTarget.table_name
                    }
                  >
                    <Trash2 size={14} />
                    {deleteLoading
                      ? 'Menghapus...'
                      : 'Drop table permanen'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  )
}

export default DataTables
