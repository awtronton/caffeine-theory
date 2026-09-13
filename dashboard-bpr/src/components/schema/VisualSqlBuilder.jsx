import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
  Dropdown,
} from '@vibe/core'
import {
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Code2,
  Database,
  Eye,
  EyeOff,
  GitBranch,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Trash2,
} from 'lucide-react'

import {
  getTableDetail,
  preflightQuery,
  previewQuery,
} from '../../services/dataWarehouseService'

const JOIN_OPTIONS = [
  {
    value: 'INNER JOIN',
    label: 'INNER JOIN',
    description:
      'Hanya row yang memiliki pasangan pada kedua sisi.',
  },
  {
    value: 'LEFT JOIN',
    label: 'LEFT JOIN',
    description:
      'Semua row dari dataset kiri tetap dipertahankan.',
  },
  {
    value: 'RIGHT JOIN',
    label: 'RIGHT JOIN',
    description:
      'Semua row dari tabel yang baru ditambahkan tetap dipertahankan.',
  },
  {
    value: 'FULL OUTER JOIN',
    label: 'FULL OUTER JOIN',
    description:
      'Mempertahankan seluruh row dari kedua sisi, termasuk yang tidak memiliki pasangan.',
  },
  {
    value: 'LEFT ANTI JOIN',
    label: 'LEFT ANTI JOIN',
    description:
      'Hanya mempertahankan row dari dataset kiri yang tidak memiliki pasangan pada tabel baru.',
  },
  {
    value: 'RIGHT ANTI JOIN',
    label: 'RIGHT ANTI JOIN',
    description:
      'Hanya mempertahankan row dari tabel baru yang tidak memiliki pasangan pada dataset kiri.',
  },
  {
    value: 'FULL ANTI JOIN',
    label: 'FULL ANTI JOIN',
    description:
      'Mempertahankan row yang tidak memiliki pasangan dari kedua sisi dan membuang row yang match.',
  },
]

const FILTER_OPERATOR_OPTIONS = [
  {
    value: 'equals',
    label: 'Equals',
  },
  {
    value: 'not_equals',
    label: 'Not equal',
  },
  {
    value: 'contains',
    label: 'Contains',
  },
  {
    value: 'not_contains',
    label: 'Does not contain',
  },
  {
    value: 'starts_with',
    label: 'Starts with',
  },
  {
    value: 'ends_with',
    label: 'Ends with',
  },
  {
    value: 'gt',
    label: 'Greater than',
  },
  {
    value: 'gte',
    label: 'Greater or equal',
  },
  {
    value: 'lt',
    label: 'Less than',
  },
  {
    value: 'lte',
    label: 'Less or equal',
  },
  {
    value: 'is_empty',
    label: 'Is empty',
  },
  {
    value: 'is_not_empty',
    label: 'Is not empty',
  },
]

const FILTER_NO_VALUE_OPERATORS =
  new Set([
    'is_empty',
    'is_not_empty',
  ])


const PAGE_SIZE_OPTIONS = [
  25,
  50,
  100,
  200,
]

function sortDirectionOptions(
  dataType,
) {
  const family =
    dataTypeFamily(dataType)

  if (
    family === 'integer' ||
    family === 'number'
  ) {
    return [
      {
        value: 'asc',
        label: 'Smallest → Largest',
      },
      {
        value: 'desc',
        label: 'Largest → Smallest',
      },
    ]
  }

  if (
    family === 'date' ||
    family === 'datetime'
  ) {
    return [
      {
        value: 'asc',
        label: 'Oldest → Newest',
      },
      {
        value: 'desc',
        label: 'Newest → Oldest',
      },
    ]
  }

  if (family === 'boolean') {
    return [
      {
        value: 'asc',
        label: 'False → True',
      },
      {
        value: 'desc',
        label: 'True → False',
      },
    ]
  }

  return [
    {
      value: 'asc',
      label: 'A → Z',
    },
    {
      value: 'desc',
      label: 'Z → A',
    },
  ]
}

function dataTypeFamily(
  dataType,
) {
  const value =
    String(dataType || '').toUpperCase()

  if (
    [
      'SMALLINT',
      'BIGINT',
      'INTEGER',
      'INT',
    ].some((token) =>
      value.includes(token),
    )
  ) {
    return 'integer'
  }

  if (
    [
      'NUMERIC',
      'DECIMAL',
      'DOUBLE',
      'REAL',
      'FLOAT',
    ].some((token) =>
      value.includes(token),
    )
  ) {
    return 'number'
  }

  if (
    value.includes('BOOLEAN') ||
    value === 'BOOL'
  ) {
    return 'boolean'
  }

  if (
    value.includes('TIMESTAMP') ||
    value.includes('DATETIME')
  ) {
    return 'datetime'
  }

  if (
    value === 'DATE' ||
    value.startsWith('DATE')
  ) {
    return 'date'
  }

  return 'text'
}

function filterOperatorOptions(
  dataType,
) {
  const family =
    dataTypeFamily(dataType)

  if (family === 'boolean') {
    return FILTER_OPERATOR_OPTIONS.filter(
      (option) =>
        [
          'equals',
          'not_equals',
          'is_empty',
          'is_not_empty',
        ].includes(
          option.value,
        ),
    )
  }

  if (
    [
      'integer',
      'number',
      'date',
      'datetime',
    ].includes(family)
  ) {
    return FILTER_OPERATOR_OPTIONS.filter(
      (option) =>
        [
          'equals',
          'not_equals',
          'gt',
          'gte',
          'lt',
          'lte',
          'is_empty',
          'is_not_empty',
        ].includes(
          option.value,
        ),
    )
  }

  return FILTER_OPERATOR_OPTIONS.filter(
    (option) =>
      [
        'equals',
        'not_equals',
        'contains',
        'not_contains',
        'starts_with',
        'ends_with',
        'is_empty',
        'is_not_empty',
      ].includes(
        option.value,
      ),
  )
}

function filterNeedsValue(
  operator,
) {
  return !FILTER_NO_VALUE_OPERATORS.has(
    operator,
  )
}

function filterInputType(
  dataType,
) {
  const family =
    dataTypeFamily(dataType)

  if (
    family === 'integer' ||
    family === 'number'
  ) {
    return 'number'
  }

  if (family === 'date') {
    return 'date'
  }

  if (family === 'datetime') {
    return 'datetime-local'
  }

  return 'text'
}

function sqlLiteral(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return 'NULL'
  }

  return `'${String(value).replaceAll(
    "'",
    "''",
  )}'`
}

function CompactJoinTypeSelect({
  value,
  onChange,
  disabled = false,
}) {
  const [open, setOpen] =
    useState(false)
  const [menuStyle, setMenuStyle] =
    useState({})
  const rootRef = useRef(null)
  const triggerRef = useRef(null)

  const selected =
    JOIN_OPTIONS.find(
      (option) =>
        option.value === value,
    ) || JOIN_OPTIONS[1]

  function updateMenuPosition() {
    const rect =
      triggerRef.current?.getBoundingClientRect()

    if (!rect) {
      return
    }

    const menuWidth = Math.max(
      rect.width,
      190,
    )

    const viewportPadding = 8
    const spaceBelow =
      window.innerHeight -
      rect.bottom -
      viewportPadding
    const estimatedMenuHeight = 220
    const openAbove =
      spaceBelow <
        estimatedMenuHeight &&
      rect.top >
        estimatedMenuHeight

    setMenuStyle({
      position: 'fixed',
      left: Math.min(
        Math.max(
          viewportPadding,
          rect.left,
        ),
        window.innerWidth -
          menuWidth -
          viewportPadding,
      ),
      top: openAbove
        ? undefined
        : rect.bottom + 4,
      bottom: openAbove
        ? window.innerHeight -
          rect.top +
          4
        : undefined,
      width: menuWidth,
      zIndex: 2000,
    })
  }

  useEffect(() => {
    if (!open) {
      return undefined
    }

    updateMenuPosition()

    function handlePointerDown(
      event,
    ) {
      const clickedTrigger =
        rootRef.current?.contains(
          event.target,
        )
      const clickedMenu =
        event.target.closest?.(
          '.tp-compact-join-menu',
        )

      if (
        !clickedTrigger &&
        !clickedMenu
      ) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    function handleViewportChange() {
      updateMenuPosition()
    }

    document.addEventListener(
      'pointerdown',
      handlePointerDown,
    )
    document.addEventListener(
      'keydown',
      handleKeyDown,
    )
    window.addEventListener(
      'resize',
      handleViewportChange,
    )
    window.addEventListener(
      'scroll',
      handleViewportChange,
      true,
    )

    return () => {
      document.removeEventListener(
        'pointerdown',
        handlePointerDown,
      )
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      )
      window.removeEventListener(
        'resize',
        handleViewportChange,
      )
      window.removeEventListener(
        'scroll',
        handleViewportChange,
        true,
      )
    }
  }, [open])

  function chooseOption(
    optionValue,
  ) {
    onChange?.(optionValue)
    setOpen(false)
    window.requestAnimationFrame(
      () =>
        triggerRef.current?.focus(),
    )
  }

  const menu = open
    ? createPortal(
        <div
          className="tp-compact-join-menu"
          style={menuStyle}
          role="listbox"
          aria-label="Join type"
        >
          {JOIN_OPTIONS.map(
            (option) => {
              const active =
                option.value ===
                selected.value

              return (
                <button
                  key={
                    option.value
                  }
                  type="button"
                  role="option"
                  aria-selected={
                    active
                  }
                  className={`tp-compact-join-option ${
                    active
                      ? 'is-selected'
                      : ''
                  }`}
                  onClick={() =>
                    chooseOption(
                      option.value,
                    )
                  }
                >
                  {option.label}
                </button>
              )
            },
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <div
      ref={rootRef}
      className={`tp-compact-join-select ${
        open ? 'is-open' : ''
      }`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="tp-compact-join-trigger"
        onClick={() => {
          if (disabled) {
            return
          }

          if (!open) {
            updateMenuPosition()
          }

          setOpen(
            (current) =>
              !current,
          )
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>
          {selected.label}
        </span>

        <ChevronDown
          size={14}
          strokeWidth={2}
        />
      </button>

      {menu}
    </div>
  )
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll(
    '"',
    '""',
  )}"`
}

function columnKey(
  tableName,
  columnName,
) {
  return `${tableName}::${columnName}`
}

function relationshipPairs(
  relationship,
) {
  const pairs =
    relationship?.column_pairs

  if (
    Array.isArray(pairs) &&
    pairs.length > 0
  ) {
    return pairs
  }

  return [
    {
      source_column:
        relationship.source_column,
      target_column:
        relationship.target_column,
    },
  ]
}

function relationLabel(
  relationship,
) {
  const pairs =
    relationshipPairs(
      relationship,
    )

  const first = pairs[0]

  const base =
    `${relationship.source_table}.` +
    `${first.source_column} ↔ ` +
    `${relationship.target_table}.` +
    `${first.target_column}`

  if (pairs.length === 1) {
    return base
  }

  return (
    `${base} + ${pairs.length - 1} key`
  )
}

function cardinalityLabel(value) {
  const labels = {
    one_to_one: '1:1',
    one_to_many: '1:N',
    many_to_one: 'N:1',
    many_to_many: 'N:N',
  }

  return labels[value] || value
}

function getJoinCandidate(
  relationship,
  includedTables,
) {
  const sourceIncluded =
    includedTables.has(
      relationship.source_table,
    )

  const targetIncluded =
    includedTables.has(
      relationship.target_table,
    )

  if (
    sourceIncluded === targetIncluded
  ) {
    return null
  }

  return {
    relationship,
    existingTable: sourceIncluded
      ? relationship.source_table
      : relationship.target_table,
    newTable: sourceIncluded
      ? relationship.target_table
      : relationship.source_table,
  }
}

function buildQueryPlan(
  baseTable,
  joins,
  relationshipsById,
) {
  if (!baseTable) {
    return {
      tables: [],
      steps: [],
      error: null,
    }
  }

  const tables = [baseTable]
  const included = new Set([
    baseTable,
  ])
  const steps = []

  for (const join of joins) {
    const relationship =
      relationshipsById[
        join.relationshipId
      ]

    if (!relationship) {
      return {
        tables,
        steps,
        error:
          'Salah satu relationship tidak lagi tersedia.',
      }
    }

    const candidate =
      getJoinCandidate(
        relationship,
        included,
      )

    if (!candidate) {
      return {
        tables,
        steps,
        error:
          'Urutan join tidak valid atau membentuk cycle. Reset join dan pilih relationship yang menghubungkan satu tabel existing ke satu tabel baru.',
      }
    }

    included.add(
      candidate.newTable,
    )
    tables.push(candidate.newTable)

    steps.push({
      ...join,
      relationship,
      existingTable:
        candidate.existingTable,
      newTable:
        candidate.newTable,
    })
  }

  return {
    tables,
    steps,
    error: null,
  }
}

function buildSql({
  baseTable,
  queryPlan,
  selectedColumns,
  tableDetails,
  filters,
  sortConfig,
}) {
  if (!baseTable) {
    return ''
  }

  const aliasByTable = {}

  queryPlan.tables.forEach(
    (tableName, index) => {
      aliasByTable[tableName] =
        `t${index + 1}`
    },
  )

  const selected = []

  for (const tableName of queryPlan.tables) {
    const detail =
      tableDetails[tableName]

    for (const column of (
      detail?.columns || []
    )) {
      const key = columnKey(
        tableName,
        column.column_name,
      )

      if (!selectedColumns.has(key)) {
        continue
      }

      selected.push({
        tableName,
        columnName:
          column.column_name,
        alias:
          `${tableName}__${column.column_name}`,
      })
    }
  }

  const selectSql =
    selected.length > 0
      ? selected
          .map(
            (column) =>
              `    ${
                aliasByTable[
                  column.tableName
                ]
              }.${quoteIdentifier(
                column.columnName,
              )} AS ${quoteIdentifier(
                column.alias,
              )}`,
          )
          .join(',\n')
      : '    -- pilih minimal satu output column'

  const lines = [
    'SELECT',
    selectSql,
    `FROM ${quoteIdentifier(
      baseTable,
    )} AS ${aliasByTable[baseTable]}`,
  ]

  const antiFilters = []

  for (const step of queryPlan.steps) {
    const relationship =
      step.relationship

    const newAlias =
      aliasByTable[step.newTable]

    const sourceAlias =
      aliasByTable[
        relationship.source_table
      ]

    const targetAlias =
      aliasByTable[
        relationship.target_table
      ]

    const isLeftAnti =
      step.joinType ===
      'LEFT ANTI JOIN'

    const isRightAnti =
      step.joinType ===
      'RIGHT ANTI JOIN'

    const isFullAnti =
      step.joinType ===
      'FULL ANTI JOIN'

    const sqlJoinType =
      isLeftAnti
        ? 'LEFT JOIN'
        : isRightAnti
          ? 'RIGHT JOIN'
          : isFullAnti
            ? 'FULL OUTER JOIN'
            : step.joinType

    lines.push(
      `${sqlJoinType} ${quoteIdentifier(
        step.newTable,
      )} AS ${newAlias}`,
    )

    const pairs =
      relationshipPairs(
        relationship,
      )

    const joinConditions =
      pairs.map(
        (pair) =>
          `${sourceAlias}.${quoteIdentifier(
            pair.source_column,
          )} = ${targetAlias}.${quoteIdentifier(
            pair.target_column,
          )}`,
      )

    lines.push(
      `    ON ${joinConditions[0]}`,
    )

    for (
      const condition
      of joinConditions.slice(1)
    ) {
      lines.push(
        `    AND ${condition}`,
      )
    }

    const primaryPair =
      pairs[0]

    if (isLeftAnti) {
      const newColumn =
        relationship.source_table ===
        step.newTable
          ? primaryPair.source_column
          : primaryPair.target_column

      antiFilters.push(
        `${newAlias}.${quoteIdentifier(
          newColumn,
        )} IS NULL`,
      )
    }

    if (isRightAnti) {
      const existingAlias =
        aliasByTable[
          step.existingTable
        ]

      const existingColumn =
        relationship.source_table ===
        step.existingTable
          ? primaryPair.source_column
          : primaryPair.target_column

      antiFilters.push(
        `${existingAlias}.${quoteIdentifier(
          existingColumn,
        )} IS NULL`,
      )
    }

    if (isFullAnti) {
      antiFilters.push(
        `(${sourceAlias}.${quoteIdentifier(
          primaryPair.source_column,
        )} IS NULL OR ${targetAlias}.${quoteIdentifier(
          primaryPair.target_column,
        )} IS NULL)`,
      )
    }
  }

  for (const filter of filters) {
    if (
      !filter.tableName ||
      !filter.columnName ||
      !filter.operator
    ) {
      continue
    }

    const alias =
      aliasByTable[
        filter.tableName
      ]

    if (!alias) {
      continue
    }

    const expression =
      `${alias}.${quoteIdentifier(
        filter.columnName,
      )}`

    let condition = ''

    if (
      filter.operator ===
      'is_empty'
    ) {
      condition =
        `(${expression} IS NULL OR ` +
        `BTRIM(CAST(${expression} AS TEXT)) = '')`
    } else if (
      filter.operator ===
      'is_not_empty'
    ) {
      condition =
        `(${expression} IS NOT NULL AND ` +
        `BTRIM(CAST(${expression} AS TEXT)) <> '')`
    } else if (
      [
        'contains',
        'not_contains',
        'starts_with',
        'ends_with',
      ].includes(
        filter.operator,
      )
    ) {
      let value =
        String(
          filter.value ?? '',
        )

      if (
        filter.operator ===
          'contains' ||
        filter.operator ===
          'not_contains'
      ) {
        value = `%${value}%`
      } else if (
        filter.operator ===
        'starts_with'
      ) {
        value = `${value}%`
      } else {
        value = `%${value}`
      }

      const comparator =
        filter.operator ===
        'not_contains'
          ? 'NOT ILIKE'
          : 'ILIKE'

      condition =
        `CAST(${expression} AS TEXT) ` +
        `${comparator} ${sqlLiteral(
          value,
        )}`
    } else {
      const comparator = {
        equals: '=',
        not_equals: '<>',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
      }[filter.operator]

      if (comparator) {
        condition =
          `${expression} ${comparator} ` +
          `${sqlLiteral(
            filter.value,
          )}`
      }
    }

    if (condition) {
      antiFilters.push(condition)
    }
  }

  if (antiFilters.length > 0) {
    lines.push('WHERE')

    lines.push(
      antiFilters
        .map(
          (filter, index) =>
            `${index === 0 ? '    ' : '    AND '}${filter}`,
        )
        .join('\n'),
    )
  }

  if (
    sortConfig?.tableName &&
    sortConfig?.columnName
  ) {
    const sortAlias =
      aliasByTable[
        sortConfig.tableName
      ]

    if (sortAlias) {
      const direction =
        sortConfig.direction ===
        'desc'
          ? 'DESC'
          : 'ASC'

      lines.push(
        `ORDER BY ${sortAlias}.${quoteIdentifier(
          sortConfig.columnName,
        )} ${direction} NULLS LAST`,
      )
    }
  }

  return `${lines.join('\n')};`
}

function formatPreviewValue(value) {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}


function VisualSqlBuilder({
  tables,
  relationships,
}) {
  const activeRelationships =
    useMemo(
      () =>
        relationships.filter(
          (relationship) =>
            relationship.is_active,
        ),
      [relationships],
    )

  const relationshipsById =
    useMemo(
      () =>
        Object.fromEntries(
          activeRelationships.map(
            (relationship) => [
              String(
                relationship.id,
              ),
              relationship,
            ],
          ),
        ),
      [activeRelationships],
    )

  const [baseTable, setBaseTable] =
    useState('')
  const [joins, setJoins] =
    useState([])
  const [
    relationshipToAdd,
    setRelationshipToAdd,
  ] = useState('')
  const [nextJoinType, setNextJoinType] =
    useState('LEFT JOIN')

  const [
    tableDetails,
    setTableDetails,
  ] = useState({})
  const [
    loadingDetails,
    setLoadingDetails,
  ] = useState(false)

  const [
    selectedColumns,
    setSelectedColumns,
  ] = useState(new Set())

  const [filters, setFilters] =
    useState([])
  const nextFilterId =
    useRef(1)

  const [
    sortConfig,
    setSortConfig,
  ] = useState({
    tableName: '',
    columnName: '',
    dataType: '',
    direction: 'asc',
  })

  const [
    previewPage,
    setPreviewPage,
  ] = useState(1)
  const [
    previewPageSize,
    setPreviewPageSize,
  ] = useState(100)

  const [copyState, setCopyState] =
    useState('idle')

  const [preflight, setPreflight] =
    useState(null)
  const [preflightState, setPreflightState] =
    useState('idle')
  const [preflightError, setPreflightError] =
    useState('')

  const [preview, setPreview] =
    useState(null)
  const [previewState, setPreviewState] =
    useState('idle')
  const [previewError, setPreviewError] =
    useState('')
  const [
    unmaskedColumns,
    setUnmaskedColumns,
  ] = useState(new Set())
  const previewRef = useRef(null)

  const tableOptions = useMemo(
    () =>
      tables.map((table) => ({
        value: table,
        label: table,
      })),
    [tables],
  )

  const queryPlan = useMemo(
    () =>
      buildQueryPlan(
        baseTable,
        joins,
        relationshipsById,
      ),
    [
      baseTable,
      joins,
      relationshipsById,
    ],
  )

  const includedTableSet =
    useMemo(
      () =>
        new Set(
          queryPlan.tables,
        ),
      [queryPlan.tables],
    )

  const availableRelationshipCandidates =
    useMemo(() => {
      if (!baseTable) {
        return []
      }

      return activeRelationships
        .filter(
          (relationship) =>
            !joins.some(
              (join) =>
                String(
                  join.relationshipId,
                ) ===
                String(
                  relationship.id,
                ),
            ),
        )
        .map((relationship) =>
          getJoinCandidate(
            relationship,
            includedTableSet,
          ),
        )
        .filter(Boolean)
    }, [
      activeRelationships,
      baseTable,
      includedTableSet,
      joins,
    ])

  const relationshipOptions =
    useMemo(
      () =>
        availableRelationshipCandidates.map(
          (candidate) => ({
            value: String(
              candidate.relationship.id,
            ),
            label:
              `${candidate.existingTable} → ` +
              `${candidate.newTable} | ` +
              relationLabel(
                candidate.relationship,
              ),
          }),
        ),
      [
        availableRelationshipCandidates,
      ],
    )

  const filterColumnOptions =
    useMemo(
      () =>
        queryPlan.tables.flatMap(
          (tableName) =>
            (
              tableDetails[tableName]
                ?.columns || []
            ).map((column) => ({
              value: columnKey(
                tableName,
                column.column_name,
              ),
              label:
                `${tableName}.${column.column_name}` +
                (column.masked
                  ? ' · masked'
                  : ''),
              tableName,
              columnName:
                column.column_name,
              dataType:
                column.data_type,
              masked:
                Boolean(
                  column.masked,
                ),
            })),
        ),
      [
        queryPlan.tables,
        tableDetails,
      ],
    )


  const sortColumnValue =
    sortConfig.tableName &&
    sortConfig.columnName
      ? columnKey(
          sortConfig.tableName,
          sortConfig.columnName,
        )
      : ''

  const sortColumnOption =
    filterColumnOptions.find(
      (option) =>
        option.value ===
        sortColumnValue,
    ) || null

  const sortDirectionChoices =
    useMemo(
      () =>
        sortDirectionOptions(
          sortConfig.dataType,
        ),
      [sortConfig.dataType],
    )

  const sortDirectionOption =
    sortDirectionChoices.find(
      (option) =>
        option.value ===
        sortConfig.direction,
    ) ||
    sortDirectionChoices[0]

  const sql = useMemo(
    () =>
      buildSql({
        baseTable,
        queryPlan,
        selectedColumns,
        tableDetails,
        filters,
        sortConfig,
      }),
    [
      baseTable,
      queryPlan,
      selectedColumns,
      tableDetails,
      filters,
      sortConfig,
    ],
  )

  const selectedColumnCount =
    selectedColumns.size

  const canPreview =
    preflightState === 'complete' &&
    Boolean(preflight?.can_execute) &&
    selectedColumnCount > 0


  const preflightPayload = useMemo(
    () => ({
      base_table: baseTable,
      joins: joins.map((join) => ({
        relationship_id: Number(
          join.relationshipId,
        ),
        join_type: join.joinType,
      })),
      selected_columns: Array.from(
        selectedColumns,
      )
        .map((key) => {
          const separator =
            key.indexOf('::')

          return {
            table_name:
              key.slice(0, separator),
            column_name:
              key.slice(separator + 2),
          }
        })
        .sort((a, b) =>
          `${a.table_name}.${a.column_name}`.localeCompare(
            `${b.table_name}.${b.column_name}`,
          ),
        ),
      filters: filters.map(
        (filter) => ({
          table_name:
            filter.tableName,
          column_name:
            filter.columnName,
          operator:
            filter.operator,
          value:
            filterNeedsValue(
              filter.operator,
            )
              ? filter.value
              : null,
        }),
      ),
      sort_by:
        sortConfig.tableName &&
        sortConfig.columnName
          ? {
              table_name:
                sortConfig.tableName,
              column_name:
                sortConfig.columnName,
              direction:
                sortConfig.direction,
            }
          : null,
    }),
    [
      baseTable,
      joins,
      selectedColumns,
      filters,
      sortConfig,
    ],
  )

  const maskedColumnCount =
    useMemo(() => {
      let count = 0

      for (const tableName of queryPlan.tables) {
        for (const column of (
          tableDetails[tableName]
            ?.columns || []
        )) {
          if (column.masked) {
            count += 1
          }
        }
      }

      return count
    }, [
      queryPlan.tables,
      tableDetails,
    ])

  useEffect(() => {
    if (
      baseTable ||
      tables.length === 0
    ) {
      return
    }

    setBaseTable(tables[0])
  }, [
    baseTable,
    tables,
  ])

  useEffect(() => {
    setJoins([])
    setRelationshipToAdd('')
    setSelectedColumns(
      new Set(),
    )
    setFilters([])
    setSortConfig({
      tableName: '',
      columnName: '',
      dataType: '',
      direction: 'asc',
    })
    setPreviewPage(1)
  }, [baseTable])

  useEffect(() => {
    const neededTables =
      queryPlan.tables.filter(
        (tableName) =>
          !tableDetails[tableName],
      )

    if (
      neededTables.length === 0
    ) {
      return
    }

    let cancelled = false

    async function load() {
      try {
        setLoadingDetails(true)

        const responses =
          await Promise.all(
            neededTables.map(
              async (tableName) => [
                tableName,
                await getTableDetail(
                  tableName,
                ),
              ],
            ),
          )

        if (cancelled) return

        setTableDetails(
          (current) => ({
            ...current,
            ...Object.fromEntries(
              responses,
            ),
          }),
        )
      } finally {
        if (!cancelled) {
          setLoadingDetails(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [
    queryPlan.tables,
    tableDetails,
  ])

  useEffect(() => {
    const validKeys = new Set()

    for (const tableName of queryPlan.tables) {
      for (const column of (
        tableDetails[tableName]
          ?.columns || []
      )) {
        validKeys.add(
          columnKey(
            tableName,
            column.column_name,
          ),
        )
      }
    }

    setSelectedColumns(
      (current) => {
        const next = new Set(
          Array.from(
            current,
          ).filter((key) =>
            validKeys.has(key),
          ),
        )

        return next
      },
    )
  }, [
    queryPlan.tables,
    tableDetails,
  ])

  useEffect(() => {
    setFilters((current) =>
      current.filter(
        (filter) =>
          includedTableSet.has(
            filter.tableName,
          ),
      ),
    )
  }, [includedTableSet])


  useEffect(() => {
    if (!sortConfig.tableName) {
      return
    }

    const stillAvailable =
      filterColumnOptions.some(
        (option) =>
          option.tableName ===
            sortConfig.tableName &&
          option.columnName ===
            sortConfig.columnName,
      )

    if (!stillAvailable) {
      setSortConfig({
        tableName: '',
        columnName: '',
        dataType: '',
        direction: 'asc',
      })
    }
  }, [
    filterColumnOptions,
    sortConfig,
  ])

  useEffect(() => {
    if (!baseTable) {
      setPreflight(null)
      setPreflightState('idle')
      setPreflightError('')
      return undefined
    }

    if (queryPlan.error) {
      setPreflight({
        status: 'blocked',
        can_execute: false,
        headline:
          'Query perlu diperbaiki',
        message: queryPlan.error,
        issues: [
          {
            severity: 'error',
            code: 'join_path_invalid',
            title:
              'Urutan join perlu diperbaiki',
            message: queryPlan.error,
          },
        ],
        summary: {
          error_count: 1,
          warning_count: 0,
        },
      })
      setPreflightState('complete')
      setPreflightError('')
      return undefined
    }

    const controller =
      new AbortController()

    const timeoutId =
      window.setTimeout(
        async () => {
          try {
            setPreflightState(
              'checking',
            )
            setPreflightError('')

            const response =
              await preflightQuery(
                preflightPayload,
                {
                  signal:
                    controller.signal,
                },
              )

            if (
              controller.signal.aborted
            ) {
              return
            }

            setPreflight(
              response.preflight,
            )
            setPreflightState(
              'complete',
            )
          } catch (error) {
            if (
              controller.signal.aborted
            ) {
              return
            }

            setPreflight(null)
            setPreflightState('error')
            setPreflightError(
              error.message ||
                'Query belum dapat diperiksa.',
            )
          }
        },
        350,
      )

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [
    baseTable,
    preflightPayload,
    queryPlan.error,
  ])

  useEffect(() => {
    setPreview(null)
    setPreviewState('idle')
    setPreviewError('')
    setUnmaskedColumns(
      new Set(),
    )
    setPreviewPage(1)
  }, [preflightPayload])

  async function runPreview(
    nextUnmaskedColumns =
      unmaskedColumns,
    {
      page = previewPage,
      pageSize =
        previewPageSize,
      scroll = true,
    } = {},
  ) {
    if (!canPreview) {
      return
    }

    try {
      setPreviewState('loading')
      setPreviewError('')

      const unmask_columns =
        Array.from(
          nextUnmaskedColumns,
        ).map((key) => {
          const separator =
            key.indexOf('::')

          return {
            table_name:
              key.slice(0, separator),
            column_name:
              key.slice(separator + 2),
          }
        })

      const response =
        await previewQuery({
          ...preflightPayload,
          page,
          page_size:
            pageSize,
          unmask_columns,
        })

      setPreview(
        response.preview,
      )
      setPreviewPage(
        response.preview.page ||
          page,
      )
      setPreviewPageSize(
        response.preview.page_size ||
          pageSize,
      )
      setPreviewState('complete')

      if (scroll) {
        window.requestAnimationFrame(
          () => {
            previewRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          },
        )
      }
    } catch (error) {
      setPreview(null)
      setPreviewState('error')
      setPreviewError(
        error.message ||
          'Data preview belum dapat dijalankan.',
      )
    }
  }

  async function togglePreviewMask(
    column,
  ) {
    const key = columnKey(
      column.table_name,
      column.column_name,
    )

    const next =
      new Set(unmaskedColumns)

    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }

    setUnmaskedColumns(next)

    await runPreview(
      next,
      {
        page: previewPage,
        pageSize:
          previewPageSize,
        scroll: false,
      },
    )
  }

  async function goToPreviewPage(
    page,
  ) {
    await runPreview(
      unmaskedColumns,
      {
        page,
        pageSize:
          previewPageSize,
        scroll: false,
      },
    )
  }

  async function changePreviewPageSize(
    nextPageSize,
  ) {
    const pageSize =
      Number(nextPageSize)

    setPreviewPageSize(
      pageSize,
    )
    setPreviewPage(1)

    if (
      previewState ===
        'complete' &&
      preview
    ) {
      await runPreview(
        unmaskedColumns,
        {
          page: 1,
          pageSize,
          scroll: false,
        },
      )
    }
  }

  function updateSortColumn(
    option,
  ) {
    if (!option) {
      setSortConfig({
        tableName: '',
        columnName: '',
        dataType: '',
        direction: 'asc',
      })
      return
    }

    setSortConfig(
      (current) => ({
        tableName:
          option.tableName,
        columnName:
          option.columnName,
        dataType:
          option.dataType,
        direction:
          current.direction ===
            'desc'
            ? 'desc'
            : 'asc',
      }),
    )
  }

  function updateSortDirection(
    direction,
  ) {
    setSortConfig(
      (current) => ({
        ...current,
        direction:
          direction === 'desc'
            ? 'desc'
            : 'asc',
      }),
    )
  }

  function clearSort() {
    setSortConfig({
      tableName: '',
      columnName: '',
      dataType: '',
      direction: 'asc',
    })
  }

  function addFilter() {
    const firstColumn =
      filterColumnOptions[0]

    if (!firstColumn) {
      return
    }

    const operatorOptions =
      filterOperatorOptions(
        firstColumn.dataType,
      )

    setFilters((current) => [
      ...current,
      {
        id:
          nextFilterId.current++,
        tableName:
          firstColumn.tableName,
        columnName:
          firstColumn.columnName,
        dataType:
          firstColumn.dataType,
        operator:
          operatorOptions[0]
            ?.value ||
          'equals',
        value: '',
      },
    ])
  }

  function updateFilterColumn(
    id,
    option,
  ) {
    if (!option) {
      return
    }

    const operatorOptions =
      filterOperatorOptions(
        option.dataType,
      )

    setFilters((current) =>
      current.map((filter) => {
        if (filter.id !== id) {
          return filter
        }

        const operatorStillValid =
          operatorOptions.some(
            (operator) =>
              operator.value ===
              filter.operator,
          )

        return {
          ...filter,
          tableName:
            option.tableName,
          columnName:
            option.columnName,
          dataType:
            option.dataType,
          operator:
            operatorStillValid
              ? filter.operator
              : operatorOptions[0]
                  ?.value ||
                'equals',
          value: '',
        }
      }),
    )
  }

  function updateFilterOperator(
    id,
    operator,
  ) {
    setFilters((current) =>
      current.map((filter) =>
        filter.id === id
          ? {
              ...filter,
              operator,
              value:
                filterNeedsValue(
                  operator,
                )
                  ? filter.value
                  : '',
            }
          : filter,
      ),
    )
  }

  function updateFilterValue(
    id,
    value,
  ) {
    setFilters((current) =>
      current.map((filter) =>
        filter.id === id
          ? {
              ...filter,
              value,
            }
          : filter,
      ),
    )
  }

  function removeFilter(id) {
    setFilters((current) =>
      current.filter(
        (filter) =>
          filter.id !== id,
      ),
    )
  }

  function addJoin() {
    if (!relationshipToAdd) {
      return
    }

    setJoins((current) => [
      ...current,
      {
        relationshipId:
          relationshipToAdd,
        joinType: nextJoinType,
      },
    ])

    setRelationshipToAdd('')
    setNextJoinType('LEFT JOIN')
  }

  function removeJoin(index) {
    setJoins((current) =>
      current.slice(0, index),
    )

    setRelationshipToAdd('')
  }

  function updateJoinType(
    index,
    joinType,
  ) {
    setJoins((current) =>
      current.map(
        (join, itemIndex) =>
          itemIndex === index
            ? {
                ...join,
                joinType,
              }
            : join,
      ),
    )
  }

  function toggleColumn(
    tableName,
    column,
  ) {
    const key = columnKey(
      tableName,
      column.column_name,
    )

    setSelectedColumns(
      (current) => {
        const next =
          new Set(current)

        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }

        return next
      },
    )
  }

  function toggleTableColumns(
    tableName,
  ) {
    const columns =
      tableDetails[tableName]
        ?.columns || []

    const keys = columns.map(
      (column) =>
        columnKey(
          tableName,
          column.column_name,
        ),
    )

    const allSelected =
      keys.length > 0 &&
      keys.every((key) =>
        selectedColumns.has(key),
      )

    setSelectedColumns(
      (current) => {
        const next =
          new Set(current)

        for (const key of keys) {
          if (allSelected) {
            next.delete(key)
          } else {
            next.add(key)
          }
        }

        return next
      },
    )
  }

  function resetBuilder() {
    setJoins([])
    setRelationshipToAdd('')
    setNextJoinType('LEFT JOIN')
    setSelectedColumns(
      new Set(),
    )
    setFilters([])
    setSortConfig({
      tableName: '',
      columnName: '',
      dataType: '',
      direction: 'asc',
    })
    setPreviewPage(1)
    setPreviewPageSize(100)
    setCopyState('idle')
    setPreview(null)
    setPreviewState('idle')
    setPreviewError('')
    setUnmaskedColumns(
      new Set(),
    )
  }

  async function copySql() {
    if (!sql) return

    try {
      await navigator.clipboard.writeText(
        sql,
      )
      setCopyState('copied')

      window.setTimeout(
        () =>
          setCopyState('idle'),
        1500,
      )
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <section className="tp-sql-builder">
      <div className="tp-sql-builder-intro">
        <div>
          <span>
            Visual SQL Builder
          </span>

          <h2>
            Build query from saved relationships
          </h2>

          <p>
            Susun join dan output column tanpa menulis SQL secara manual. Query disusun secara visual dan diperiksa otomatis sebelum masuk ke tahap eksekusi. SQL tetap tersedia sebagai preview untuk pengguna yang membutuhkannya.
          </p>
        </div>

        <div className="tp-sql-builder-stage">
          Step 6E.4 · Sort & Pagination
        </div>
      </div>

      <div className="tp-sql-builder-grid">
        <div className="tp-sql-builder-workspace">
          <div className="tp-sql-source-row">
            <section className="tp-sql-section tp-sql-base-section">
              <div className="tp-sql-section-heading tp-sql-base-section-heading">
                <div className="tp-sql-step-number">
                  1
                </div>

                <div className="tp-sql-base-heading-copy">
                  <h3>
                    Base and Relation Table
                  </h3>
                  <p>
                    Pilih tabel awal dan relationship untuk membentuk jalur query.
                  </p>
                </div>

                <button
                  type="button"
                  className="tp-sql-reset-button tp-sql-reset-button-top"
                  onClick={resetBuilder}
                >
                  <RotateCcw size={13} />
                  Reset Query
                </button>
              </div>

            <div className="tp-sql-base-relation-controls">
              <div className="tp-sql-source-control">
                <label>
                  Base Table
                </label>

                <Dropdown
                  options={tableOptions}
                  value={
                    tableOptions.find(
                      (option) =>
                        option.value ===
                        baseTable,
                    ) || null
                  }
                  onChange={(option) =>
                    setBaseTable(
                      option?.value || '',
                    )
                  }
                  searchable
                  clearable={false}
                  className="tp-vibe-dropdown"
                />
              </div>

              <div className="tp-sql-source-control">
                <label>
                  Relationship
                </label>

                <Dropdown
                  options={
                    relationshipOptions
                  }
                  value={
                    relationshipOptions.find(
                      (option) =>
                        option.value ===
                        relationshipToAdd,
                    ) || null
                  }
                  onChange={(option) =>
                    setRelationshipToAdd(
                      option?.value || '',
                    )
                  }
                  searchable
                  clearable
                  disabled={
                    relationshipOptions.length ===
                    0
                  }
                  placeholder={
                    relationshipOptions.length ===
                    0
                      ? 'Tidak ada relationship lanjutan'
                      : 'Pilih relationship'
                  }
                  className="tp-vibe-dropdown"
                />
              </div>

              <div className="tp-sql-source-join-row">
                <div className="tp-sql-source-control">
                  <label>
                    Join Type
                  </label>

                  <CompactJoinTypeSelect
                    value={
                      nextJoinType
                    }
                    onChange={(
                      joinType,
                    ) =>
                      setNextJoinType(
                        joinType,
                      )
                    }
                  />
                </div>

                <Button
                  type="button"
                  onClick={addJoin}
                  disabled={
                    !relationshipToAdd
                  }
                >
                  <Plus size={13} />
                  Add Join
                </Button>
              </div>

            </div>

            {activeRelationships.length ===
              0 && (
              <div className="tp-sql-inline-warning">
                <AlertCircle
                  size={13}
                />
                Belum ada relationship aktif. Buat relationship terlebih dahulu pada Relationship Designer.
              </div>
            )}
          </section>

            <section className="tp-sql-section tp-sql-join-section">
              <div className="tp-sql-section-heading">
                <div className="tp-sql-step-number">
                  2
              </div>

              <div>
                <h3>
                  Join Path
                </h3>
                <p>
                  Visualisasi jalur tabel, cardinality, dan tipe join yang digunakan.
                </p>
              </div>
            </div>

            <div className="tp-sql-path">
              {baseTable && (
                <div className="tp-sql-path-table is-base tp-sql-path-base-node">
                  <Database size={13} />

                  <div>
                    <strong>
                      {baseTable}
                    </strong>

                    <span>
                      Base
                    </span>
                  </div>
                </div>
              )}

              {queryPlan.steps.map(
                (step, index) => {
                  const joinOption =
                    JOIN_OPTIONS.find(
                      (option) =>
                        option.value ===
                        step.joinType,
                    ) ||
                    JOIN_OPTIONS[1]

                  return (
                    <div
                      key={
                        step.relationshipId
                      }
                      className="tp-sql-join-step"
                    >
                      <div className="tp-sql-path-connector">
                        <ArrowRight
                          size={14}
                        />

                        <span>
                          {
                            step.joinType
                          }
                        </span>
                      </div>

                      <div className="tp-sql-join-card">
                        <div className="tp-sql-join-card-main">
                          <div className="tp-sql-path-table">
                            <Database
                              size={13}
                            />

                            <div>
                              <div className="tp-sql-table-title-line tp-sql-relation-title">
                                <strong>
                                  {
                                    step.newTable
                                  }
                                </strong>

                                <span className="tp-sql-cardinality-inline">
                                  {cardinalityLabel(
                                    step.relationship
                                      .cardinality,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="tp-sql-remove-join"
                            onClick={() =>
                              removeJoin(
                                index,
                              )
                            }
                            title="Hapus join ini dan seluruh join setelahnya"
                          >
                            <Trash2
                              size={12}
                            />
                          </button>
                        </div>

                        <div className="tp-sql-join-type-row">
                          <CompactJoinTypeSelect
                            value={
                              step.joinType
                            }
                            onChange={(
                              joinType,
                            ) =>
                              updateJoinType(
                                index,
                                joinType,
                              )
                            }
                          />

                          <small>
                            {
                              joinOption.description
                            }
                          </small>
                        </div>
                      </div>
                    </div>
                  )
                },
              )}
            </div>

              {queryPlan.error && (
                <div className="tp-sql-inline-warning">
                  <AlertCircle
                    size={13}
                  />
                  {queryPlan.error}
                </div>
              )}
            </section>
          </div>

          <section className="tp-sql-section">
            <div className="tp-sql-section-heading">
              <div className="tp-sql-step-number">
                3
              </div>

              <div>
                <h3>
                  Output Columns
                </h3>
                <p>
                  Pilih column yang akan muncul pada hasil query.
                </p>
              </div>
            </div>

            {loadingDetails && (
              <div className="tp-sql-loading">
                Membaca schema tabel...
              </div>
            )}

            <div className="tp-sql-column-groups">
              {queryPlan.tables.map(
                (tableName) => {
                  const columns =
                    tableDetails[
                      tableName
                    ]?.columns || []

                  const selectableColumns =
                    columns

                  const allSelected =
                    selectableColumns.length >
                      0 &&
                    selectableColumns.every(
                      (column) =>
                        selectedColumns.has(
                          columnKey(
                            tableName,
                            column.column_name,
                          ),
                        ),
                    )

                  return (
                    <div
                      key={tableName}
                      className="tp-sql-column-group"
                    >
                      <div className="tp-sql-column-group-header">
                        <div>
                          <Table2
                            size={13}
                          />

                          <strong>
                            {tableName}
                          </strong>

                          <span>
                            {
                              columns.length
                            }{' '}
                            columns
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            toggleTableColumns(
                              tableName,
                            )
                          }
                          disabled={
                            selectableColumns.length ===
                            0
                          }
                        >
                          {allSelected
                            ? 'Clear'
                            : 'Select all'}
                        </button>
                      </div>

                      <div className="tp-sql-column-list">
                        {columns.map(
                          (column) => {
                            const key =
                              columnKey(
                                tableName,
                                column.column_name,
                              )

                            const selected =
                              selectedColumns.has(
                                key,
                              )

                            return (
                              <button
                                key={key}
                                type="button"
                                className={`tp-sql-column-item ${
                                  selected
                                    ? 'is-selected'
                                    : ''
                                } ${
                                  column.masked
                                    ? 'is-masked'
                                    : ''
                                }`}
                                onClick={() =>
                                  toggleColumn(
                                    tableName,
                                    column,
                                  )
                                }
                                title={
                                  column.masked
                                    ? 'Masked column dapat dipilih. Nilai hasil query akan dimasking secara default dan dapat di-unmask dari output table.'
                                    : column.column_name
                                }
                              >
                                <span className="tp-sql-column-checkbox">
                                  {selected && (
                                    <Check
                                      size={10}
                                    />
                                  )}
                                </span>

                                <span className="tp-sql-column-item-name">
                                  {column.masked && (
                                    <EyeOff
                                      size={10}
                                    />
                                  )}

                                  {
                                    column.column_name
                                  }
                                </span>

                                <small>
                                  {
                                    column.data_type
                                  }
                                </small>
                              </button>
                            )
                          },
                        )}
                      </div>
                    </div>
                  )
                },
              )}
            </div>

            {maskedColumnCount > 0 && (
              <div className="tp-sql-mask-note">
                <ShieldCheck
                  size={12}
                />

                {maskedColumnCount} masked column terdeteksi. Kolom tetap dapat dipilih sebagai output; nilai akan dimasking secara default pada hasil query dan dapat di-unmask dari output table sesuai kontrol akses.
              </div>
            )}
          </section>

          <div className="tp-sql-refine-row">
            <section className="tp-sql-section tp-sql-filter-section">
              <div className="tp-sql-section-heading tp-sql-filter-heading">
                <div className="tp-sql-step-number">
                  4
              </div>

              <div>
                <h3>
                  Filters
                </h3>
                <p>
                  Opsional. Batasi data tanpa menulis klausa WHERE secara manual.
                </p>
              </div>

              <button
                type="button"
                className="tp-sql-add-filter-button"
                onClick={addFilter}
                disabled={
                  filterColumnOptions.length ===
                  0
                }
              >
                <Plus size={12} />
                Add Filter
              </button>
            </div>

            <div className="tp-sql-filter-builder">
              {filters.length === 0 ? (
                <div className="tp-sql-filter-empty">
                  <SlidersHorizontal
                    size={14}
                  />

                  <div>
                    <strong>
                      No filters
                    </strong>

                    <span>
                      Preview akan menampilkan seluruh row yang memenuhi join. Tambahkan filter jika ingin mempersempit hasil.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="tp-sql-filter-list">
                  {filters.map(
                    (
                      filter,
                      index,
                    ) => {
                      const fieldValue =
                        columnKey(
                          filter.tableName,
                          filter.columnName,
                        )

                      const fieldOption =
                        filterColumnOptions.find(
                          (option) =>
                            option.value ===
                            fieldValue,
                        ) || null

                      const operatorOptions =
                        filterOperatorOptions(
                          filter.dataType,
                        )

                      const operatorOption =
                        operatorOptions.find(
                          (option) =>
                            option.value ===
                            filter.operator,
                        ) ||
                        operatorOptions[0] ||
                        null

                      const needsValue =
                        filterNeedsValue(
                          filter.operator,
                        )

                      return (
                        <div
                          key={
                            filter.id
                          }
                          className="tp-sql-filter-row"
                        >
                          <div className="tp-sql-filter-and">
                            {index === 0
                              ? 'WHERE'
                              : 'AND'}
                          </div>

                          <div className="tp-sql-filter-field">
                            <label>
                              Column
                            </label>

                            <Dropdown
                              options={
                                filterColumnOptions
                              }
                              value={
                                fieldOption
                              }
                              onChange={(
                                option,
                              ) =>
                                updateFilterColumn(
                                  filter.id,
                                  option,
                                )
                              }
                              searchable
                              clearable={
                                false
                              }
                              className="tp-vibe-dropdown"
                            />
                          </div>

                          <div className="tp-sql-filter-operator">
                            <label>
                              Operator
                            </label>

                            <Dropdown
                              options={
                                operatorOptions
                              }
                              value={
                                operatorOption
                              }
                              onChange={(
                                option,
                              ) =>
                                updateFilterOperator(
                                  filter.id,
                                  option?.value ||
                                    'equals',
                                )
                              }
                              searchable={
                                false
                              }
                              clearable={
                                false
                              }
                              className="tp-vibe-dropdown"
                            />
                          </div>

                          <div className="tp-sql-filter-value">
                            <label>
                              Value
                            </label>

                            {needsValue ? (
                              filter.dataType &&
                              dataTypeFamily(
                                filter.dataType,
                              ) ===
                                'boolean' ? (
                                <Dropdown
                                  options={[
                                    {
                                      value:
                                        'true',
                                      label:
                                        'True',
                                    },
                                    {
                                      value:
                                        'false',
                                      label:
                                        'False',
                                    },
                                  ]}
                                  value={
                                    filter.value ===
                                    'true'
                                      ? {
                                          value:
                                            'true',
                                          label:
                                            'True',
                                        }
                                      : filter.value ===
                                          'false'
                                        ? {
                                            value:
                                              'false',
                                            label:
                                              'False',
                                          }
                                        : null
                                  }
                                  onChange={(
                                    option,
                                  ) =>
                                    updateFilterValue(
                                      filter.id,
                                      option?.value ||
                                        '',
                                    )
                                  }
                                  searchable={
                                    false
                                  }
                                  clearable
                                  placeholder="Choose"
                                  className="tp-vibe-dropdown"
                                />
                              ) : (
                                <input
                                  type={filterInputType(
                                    filter.dataType,
                                  )}
                                  step={
                                    dataTypeFamily(
                                      filter.dataType,
                                    ) ===
                                    'number'
                                      ? 'any'
                                      : undefined
                                  }
                                  value={
                                    filter.value
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    updateFilterValue(
                                      filter.id,
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                  placeholder="Enter value"
                                />
                              )
                            ) : (
                              <div className="tp-sql-filter-no-value">
                                No value needed
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            className="tp-sql-remove-filter"
                            onClick={() =>
                              removeFilter(
                                filter.id,
                              )
                            }
                            title="Remove filter"
                          >
                            <Trash2
                              size={12}
                            />
                          </button>
                        </div>
                      )
                    },
                  )}
                </div>
              )}

              {filters.length > 0 && (
                <div className="tp-sql-filter-note">
                  <ShieldCheck
                    size={11}
                  />
                  Semua filter digabungkan dengan AND. Masked column tetap dapat digunakan sebagai filter tanpa membuka nilai pada output.
                </div>
              )}
            </div>
          </section>

            <section className="tp-sql-section tp-sql-sort-section">
              <div className="tp-sql-section-heading">
                <div className="tp-sql-step-number">
                  5
              </div>

              <div>
                <h3>
                  Sort
                </h3>
                <p>
                  Opsional. Atur urutan hasil tanpa menulis ORDER BY secara manual.
                </p>
              </div>
            </div>

            <div className="tp-sql-sort-builder">
              <div className="tp-sql-sort-field">
                <label>
                  Sort by
                </label>

                <Dropdown
                  options={
                    filterColumnOptions
                  }
                  value={
                    sortColumnOption
                  }
                  onChange={
                    updateSortColumn
                  }
                  searchable
                  clearable
                  placeholder="Database order"
                  className="tp-vibe-dropdown"
                />
              </div>

              <div className="tp-sql-sort-direction">
                <label>
                  Direction
                </label>

                <Dropdown
                  options={
                    sortDirectionChoices
                  }
                  value={
                    sortDirectionOption
                  }
                  onChange={(
                    option,
                  ) =>
                    updateSortDirection(
                      option?.value ||
                        'asc',
                    )
                  }
                  searchable={false}
                  clearable={false}
                  disabled={
                    !sortConfig.tableName
                  }
                  className="tp-vibe-dropdown"
                />
              </div>

              <button
                type="button"
                className="tp-sql-clear-sort"
                onClick={clearSort}
                disabled={
                  !sortConfig.tableName
                }
              >
                Clear
              </button>
            </div>

              <div className="tp-sql-sort-note">
                <ArrowDownUp
                  size={11}
                />
                {sortConfig.tableName
                  ? `Hasil diurutkan berdasarkan ${sortConfig.tableName}.${sortConfig.columnName}. Masked column tetap dapat digunakan untuk sort tanpa membuka nilainya.`
                  : 'Tanpa sort eksplisit, database menentukan urutan row preview.'}
              </div>
            </section>
          </div>
        </div>

        <aside className="tp-sql-preview-panel">
          <div className="tp-sql-preview-heading">
            <div>
              <Code2 size={15} />

              <div>
                <strong>
                  SQL Preview
                </strong>

                <span>
                  Generated · read-only
                </span>
              </div>
            </div>

            <button
              type="button"
              className="tp-sql-copy-button"
              onClick={copySql}
              disabled={!sql}
            >
              {copyState ===
              'copied' ? (
                <Check
                  size={12}
                />
              ) : (
                <Clipboard
                  size={12}
                />
              )}

              {copyState ===
              'copied'
                ? 'Copied'
                : 'Copy'}
            </button>
          </div>

          <div className="tp-sql-preview-summary">
            <div>
              <span>
                Tables
              </span>

              <strong>
                {
                  queryPlan.tables
                    .length
                }
              </strong>
            </div>

            <div>
              <span>
                Joins
              </span>

              <strong>
                {
                  queryPlan.steps
                    .length
                }
              </strong>
            </div>

            <div>
              <span>
                Output
              </span>

              <strong>
                {
                  selectedColumnCount
                }
              </strong>
            </div>

            <div>
              <span>
                Filters
              </span>

              <strong>
                {filters.length}
              </strong>
            </div>
          </div>

          <div
            className={`tp-sql-preflight-card ${
              preflightState === 'checking'
                ? 'is-checking'
                : preflight?.status
                  ? `is-${preflight.status}`
                  : preflightState === 'error'
                    ? 'is-error'
                    : 'is-idle'
            }`}
          >
            <div className="tp-sql-preflight-status">
              <div className="tp-sql-preflight-icon">
                {preflightState ===
                'checking' ? (
                  <RotateCcw size={13} />
                ) : preflight?.status ===
                  'ready' ? (
                  <Check size={13} />
                ) : (
                  <AlertCircle size={13} />
                )}
              </div>

              <div>
                <strong>
                  {preflightState ===
                  'checking'
                    ? 'Checking query...'
                    : preflightState ===
                        'error'
                      ? 'Preflight belum tersedia'
                      : preflight?.headline ||
                        'Query preflight'}
                </strong>

                <span>
                  {preflightState ===
                  'checking'
                    ? 'Memeriksa tabel, kolom, relationship, join, filter, dan sort secara otomatis.'
                    : preflightState ===
                        'error'
                      ? preflightError
                      : preflight?.message ||
                        'Pilih tabel dan output column untuk memulai pemeriksaan.'}
                </span>
              </div>
            </div>

            {Array.isArray(
              preflight?.issues,
            ) &&
              preflight.issues.length >
                0 && (
                <div className="tp-sql-preflight-issues">
                  {preflight.issues
                    .slice(0, 3)
                    .map((issue) => (
                      <div
                        key={`${issue.code}-${issue.message}`}
                        className={`tp-sql-preflight-issue is-${issue.severity}`}
                      >
                        <span />
                        <div>
                          <strong>
                            {issue.title}
                          </strong>
                          <p>
                            {issue.message}
                          </p>
                        </div>
                      </div>
                    ))}

                  {preflight.issues.length >
                    3 && (
                    <div className="tp-sql-preflight-more">
                      +{
                        preflight.issues
                          .length - 3
                      } catatan lain
                    </div>
                  )}
                </div>
              )}
          </div>

          <pre className="tp-sql-code-preview">
            <code>
              {sql ||
                '-- pilih Base Table untuk memulai'}
            </code>
          </pre>

          <div className="tp-sql-preview-footer">
            <GitBranch
              size={12}
            />

            SQL dibentuk hanya dari tabel, relationship, join type, output column, filter, dan sort yang dipilih melalui UI. Nilai filter dikirim ke backend sebagai parameter, bukan digabungkan menjadi raw SQL.
          </div>

          <div
            className={`tp-sql-next-stage ${
              canPreview
                ? 'is-ready'
                : ''
            }`}
          >
            <span>
              Preview
            </span>

            <strong>
              Data Preview & Run Query
            </strong>

            <p>
              Query dijalankan read-only dengan server-side sorting dan pagination. Page size dapat dipilih 25, 50, 100, atau 200 baris; masked column tetap disamarkan secara default.
            </p>

            <button
              type="button"
              className="tp-sql-preview-run-button"
              onClick={() =>
                runPreview(
                  new Set(),
                  {
                    page: 1,
                    pageSize:
                      previewPageSize,
                  },
                )
              }
              disabled={
                !canPreview ||
                previewState ===
                  'loading'
              }
            >
              {previewState ===
              'loading' ? (
                <RotateCcw size={13} />
              ) : (
                <Play size={13} />
              )}

              {previewState ===
              'loading'
                ? 'Menjalankan...'
                : canPreview
                  ? 'Preview Data'
                  : 'Lengkapi Query'}
            </button>
          </div>
        </aside>
      </div>

      {previewState !== 'idle' && (
        <section
          ref={previewRef}
          className="tp-sql-data-preview"
        >
          <div className="tp-sql-data-preview-heading">
            <div>
              <span>
                Query Output
              </span>

              <h3>
                Data Preview
              </h3>

              <p>
                Preview read-only dari query yang sudah lolos preflight.
              </p>
            </div>

            <div className="tp-sql-data-preview-badges">
              <span>
                Read-only
              </span>

              {previewState ===
                'complete' && (
                <>
                  <span>
                    {
                      preview?.returned_rows ??
                      0
                    } rows
                  </span>

                  <span>
                    {
                      preview?.elapsed_ms ??
                      0
                    } ms
                  </span>
                </>
              )}
            </div>
          </div>

          {previewState ===
            'loading' && (
            <div className="tp-sql-data-preview-state">
              <RotateCcw size={16} />
              Menjalankan query preview...
            </div>
          )}

          {previewState ===
            'error' && (
            <div className="tp-sql-data-preview-state is-error">
              <AlertCircle size={16} />
              <div>
                <strong>
                  Data preview gagal
                </strong>
                <span>
                  {previewError}
                </span>
              </div>
            </div>
          )}

          {previewState ===
            'complete' &&
            preview && (
            <>
              <div className="tp-sql-data-preview-toolbar">
                <div className="tp-sql-preview-range">
                  {preview.returned_rows >
                  0 ? (
                    <>
                      Showing{' '}
                      <strong>
                        {
                          preview.page_start
                        }–{
                          preview.page_end
                        }
                      </strong>
                    </>
                  ) : (
                    'No rows'
                  )}

                  {preview.has_more &&
                    ' · More rows available'}

                  {preview.sort_by && (
                    <span>
                      {' '}
                      · Sorted by{' '}
                      {
                        preview.sort_by
                          .column_name
                      }
                    </span>
                  )}
                </div>

                <div className="tp-sql-preview-toolbar-actions">
                  <label className="tp-sql-page-size">
                    Rows
                    <select
                      value={
                        previewPageSize
                      }
                      onChange={(
                        event,
                      ) =>
                        changePreviewPageSize(
                          event.target
                            .value,
                        )
                      }
                    >
                      {PAGE_SIZE_OPTIONS.map(
                        (
                          size,
                        ) => (
                          <option
                            key={
                              size
                            }
                            value={
                              size
                            }
                          >
                            {size}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      runPreview(
                        unmaskedColumns,
                        {
                          page:
                            previewPage,
                          pageSize:
                            previewPageSize,
                          scroll:
                            false,
                        },
                      )
                    }
                  >
                    <RotateCcw
                      size={12}
                    />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="tp-sql-output-table-wrap">
                <table className="tp-sql-output-table">
                  <thead>
                    <tr>
                      {preview.columns.map(
                        (column) => (
                          <th
                            key={
                              column.key
                            }
                          >
                            <div className="tp-sql-output-column-heading">
                              <div>
                                <strong>
                                  {
                                    column.column_name
                                  }
                                </strong>

                                <span>
                                  {
                                    column.table_name
                                  }
                                </span>
                              </div>

                              {column.masked && (
                                <button
                                  type="button"
                                  className={`tp-sql-output-mask-button ${
                                    column.unmasked
                                      ? 'is-unmasked'
                                      : ''
                                  }`}
                                  onClick={() =>
                                    togglePreviewMask(
                                      column,
                                    )
                                  }
                                  disabled={
                                    previewState ===
                                    'loading'
                                  }
                                  title={
                                    column.unmasked
                                      ? 'Mask kembali column ini'
                                      : 'Unmask column ini'
                                  }
                                >
                                  {column.unmasked ? (
                                    <EyeOff
                                      size={11}
                                    />
                                  ) : (
                                    <Eye
                                      size={11}
                                    />
                                  )}

                                  {column.unmasked
                                    ? 'Mask'
                                    : 'Unmask'}
                                </button>
                              )}
                            </div>
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {preview.rows.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={
                            preview.columns
                              .length || 1
                          }
                          className="tp-sql-output-empty"
                        >
                          Query valid, tetapi tidak ada row yang cocok.
                        </td>
                      </tr>
                    ) : (
                      preview.rows.map(
                        (
                          row,
                          rowIndex,
                        ) => (
                          <tr
                            key={
                              rowIndex
                            }
                          >
                            {preview.columns.map(
                              (
                                column,
                              ) => (
                                <td
                                  key={
                                    column.key
                                  }
                                  className={
                                    column.masked &&
                                    !column.unmasked
                                      ? 'is-masked'
                                      : ''
                                  }
                                  title={formatPreviewValue(
                                    row[
                                      column
                                        .key
                                    ],
                                  )}
                                >
                                  {formatPreviewValue(
                                    row[
                                      column
                                        .key
                                    ],
                                  )}
                                </td>
                              ),
                            )}
                          </tr>
                        ),
                      )
                    )}
                  </tbody>
                </table>
              </div>

              <div className="tp-sql-pagination">
                <button
                  type="button"
                  onClick={() =>
                    goToPreviewPage(
                      Math.max(
                        1,
                        previewPage -
                          1,
                      ),
                    )
                  }
                  disabled={
                    previewState ===
                      'loading' ||
                    !preview.has_previous
                  }
                >
                  <ChevronLeft
                    size={12}
                  />
                  Previous
                </button>

                <span>
                  Page{' '}
                  <strong>
                    {preview.page}
                  </strong>
                </span>

                <button
                  type="button"
                  onClick={() =>
                    goToPreviewPage(
                      previewPage +
                        1,
                    )
                  }
                  disabled={
                    previewState ===
                      'loading' ||
                    !preview.has_more
                  }
                >
                  Next
                  <ChevronRight
                    size={12}
                  />
                </button>
              </div>

              <div className="tp-sql-data-preview-footer">
                <ShieldCheck
                  size={12}
                />
                Masked column dikirim dalam kondisi tersamarkan secara default. Aksi Unmask menjalankan ulang preview melalui backend sehingga raw value tidak disembunyikan hanya dengan CSS.
              </div>
            </>
          )}
        </section>
      )}
    </section>
  )
}

export default VisualSqlBuilder
