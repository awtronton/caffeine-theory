import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  Search,
  X,
} from 'lucide-react'

import '../../styles/caffeine-dropdown.css'

function optionLabel(option) {
  if (
    option?.label === null ||
    option?.label === undefined
  ) {
    return ''
  }

  return String(option.label)
}

function CaffeineDropdown({
  options = [],
  value = null,
  onChange,
  searchable = false,
  clearable = false,
  disabled = false,
  placeholder = 'Pilih...',
  className = '',
  menuMinWidth = 180,
}) {
  const [open, setOpen] =
    useState(false)
  const [search, setSearch] =
    useState('')
  const [menuStyle, setMenuStyle] =
    useState({})

  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const searchInputRef = useRef(null)

  const selectedValue =
    value?.value
  const selectedLabel =
    value
      ? optionLabel(value)
      : ''

  const filteredOptions =
    useMemo(() => {
      if (!searchable) {
        return options
      }

      const query =
        search.trim().toLowerCase()

      if (!query) {
        return options
      }

      return options.filter(
        (option) =>
          optionLabel(option)
            .toLowerCase()
            .includes(query),
      )
    }, [
      options,
      search,
      searchable,
    ])

  function updateMenuPosition() {
    const rect =
      triggerRef.current?.getBoundingClientRect()

    if (!rect) {
      return
    }

    const viewportPadding = 8
    const width = Math.max(
      rect.width,
      menuMinWidth,
    )

    const estimatedHeight =
      searchable ? 270 : 230
    const spaceBelow =
      window.innerHeight -
      rect.bottom -
      viewportPadding
    const openAbove =
      spaceBelow <
        estimatedHeight &&
      rect.top >
        estimatedHeight

    const left = Math.min(
      Math.max(
        viewportPadding,
        rect.left,
      ),
      Math.max(
        viewportPadding,
        window.innerWidth -
          width -
          viewportPadding,
      ),
    )

    setMenuStyle({
      position: 'fixed',
      left,
      top: openAbove
        ? undefined
        : rect.bottom + 4,
      bottom: openAbove
        ? window.innerHeight -
          rect.top +
          4
        : undefined,
      width,
      zIndex: 3000,
    })
  }

  useEffect(() => {
    if (!open) {
      return undefined
    }

    updateMenuPosition()

    if (searchable) {
      window.requestAnimationFrame(
        () =>
          searchInputRef.current?.focus(),
      )
    }

    function handlePointerDown(
      event,
    ) {
      const insideRoot =
        rootRef.current?.contains(
          event.target,
        )

      const insideMenu =
        event.target.closest?.(
          '.ct-dropdown-menu',
        )

      if (
        !insideRoot &&
        !insideMenu
      ) {
        setOpen(false)
        setSearch('')
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        setSearch('')
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
  }, [
    open,
    searchable,
    menuMinWidth,
  ])

  function toggleMenu() {
    if (disabled) {
      return
    }

    if (!open) {
      updateMenuPosition()
    } else {
      setSearch('')
    }

    setOpen(
      (current) => !current,
    )
  }

  function selectOption(option) {
    onChange?.(option)
    setOpen(false)
    setSearch('')

    window.requestAnimationFrame(
      () =>
        triggerRef.current?.focus(),
    )
  }

  function clearValue(event) {
    event.preventDefault()
    event.stopPropagation()

    if (disabled) {
      return
    }

    onChange?.(null)
    setSearch('')
  }

  const menu =
    open && !disabled
      ? createPortal(
          <div
            className="ct-dropdown-menu"
            style={menuStyle}
          >
            {searchable && (
              <div className="ct-dropdown-search">
                <Search
                  size={12}
                  strokeWidth={1.8}
                />

                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Cari..."
                  aria-label="Cari pilihan"
                />
              </div>
            )}

            <div
              className="ct-dropdown-options"
              role="listbox"
            >
              {filteredOptions.length ===
              0 ? (
                <div className="ct-dropdown-empty">
                  Tidak ada pilihan
                </div>
              ) : (
                filteredOptions.map(
                  (option) => {
                    const selected =
                      Object.is(
                        option.value,
                        selectedValue,
                      )

                    return (
                      <button
                        key={String(
                          option.value,
                        )}
                        type="button"
                        role="option"
                        aria-selected={
                          selected
                        }
                        className={`ct-dropdown-option ${
                          selected
                            ? 'is-selected'
                            : ''
                        }`}
                        onClick={() =>
                          selectOption(
                            option,
                          )
                        }
                      >
                        {option.label}
                      </button>
                    )
                  },
                )
              )}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div
      ref={rootRef}
      className={`ct-dropdown ${
        open ? 'is-open' : ''
      } ${
        disabled ? 'is-disabled' : ''
      } ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ct-dropdown-trigger"
        onClick={toggleMenu}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={`ct-dropdown-value ${
            value
              ? ''
              : 'is-placeholder'
          }`}
        >
          {value
            ? selectedLabel
            : placeholder}
        </span>

        <span className="ct-dropdown-actions">
          {clearable &&
            value &&
            !disabled && (
              <span
                role="button"
                tabIndex={-1}
                className="ct-dropdown-clear"
                onClick={clearValue}
                aria-label="Hapus pilihan"
                title="Hapus pilihan"
              >
                <X
                  size={11}
                  strokeWidth={1.9}
                />
              </span>
            )}

          <ChevronDown
            size={14}
            strokeWidth={2}
            className="ct-dropdown-chevron"
          />
        </span>
      </button>

      {menu}
    </div>
  )
}

export default CaffeineDropdown
