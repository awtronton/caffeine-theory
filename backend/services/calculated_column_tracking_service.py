"""Calculated-column lineage and safe invalidation tracking (7A.2.2.6).

PostgreSQL statement-level triggers conservatively invalidate stored calculations
when a table receives INSERT/DELETE or an UPDATE touching any formula input.
Recalculation is explicit and ordered by the dependency DAG.
"""
from __future__ import annotations

import ast
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, MetaData, String, Table, Text,
    func, inspect, select, text,
)

from database.connection import engine
from database.table_service import validate_table_name, is_internal_table

TRACK_TABLE_NAME = 'warehouse_calculated_column_state'
tracking_metadata = MetaData()
state = Table(
    TRACK_TABLE_NAME, tracking_metadata,
    Column('table_name', String(63), primary_key=True),
    Column('column_name', String(63), primary_key=True),
    Column('is_stale', Boolean, nullable=False),
    Column('reason', Text, nullable=True),
    Column('last_invalidated_at', DateTime(timezone=True), nullable=True),
    Column('last_calculated_at', DateTime(timezone=True), nullable=True),
)

# 63-char PostgreSQL identifiers; these are deliberately fixed.
UPDATE_TRIGGER = 'caffeine_calc_dependency_update'
ROWS_TRIGGER = 'caffeine_calc_row_change'
FUNCTION_NAME = 'caffeine_calc_mark_stale'


def references(formula):
    try:
        tree = ast.parse(formula, mode='eval')
    except (TypeError, SyntaxError, ValueError) as exc:
        raise ValueError('Formula tersimpan tidak valid.') from exc
    return sorted({node.id for node in ast.walk(tree) if isinstance(node, ast.Name)})


def _graph(definitions):
    mapping = {row['column_name']: row for row in definitions}
    graph = {name: [source for source in references(row['formula']) if source in mapping]
             for name, row in mapping.items()}
    result = []
    visiting, visited = set(), set()

    def visit(name):
        if name in visiting:
            raise ValueError('Circular dependency ditemukan di calculated column.')
        if name in visited:
            return
        visiting.add(name)
        for dependency in graph[name]:
            visit(dependency)
        visiting.remove(name)
        visited.add(name)
        result.append(name)

    for name in graph:
        visit(name)
    return mapping, graph, result


def _descendants(graph, column_name):
    targets = set()
    changed = True
    while changed:
        changed = False
        for target, upstream in graph.items():
            if target != column_name and target not in targets and (
                column_name in upstream or any(x in targets for x in upstream)
            ):
                targets.add(target)
                changed = True
    return targets


def _init_metadata(conn, calc_table):
    state.create(bind=conn, checkfirst=True)
    definitions = [dict(r) for r in conn.execute(select(calc_table)).mappings()]
    existing = {(r[0], r[1]) for r in conn.execute(select(state.c.table_name, state.c.column_name))}
    for row in definitions:
        key = (row['table_name'], row['column_name'])
        if key not in existing:
            # Preexisting 7A.2.2.5 calculations have unknown freshness; do not label Current.
            conn.execute(state.insert().values(
                table_name=key[0], column_name=key[1], is_stale=True,
                reason='Status awal belum diverifikasi setelah migrasi tracking.',
                last_invalidated_at=datetime.now(timezone.utc),
                last_calculated_at=row['last_calculated_at'],
            ))


def _create_trigger_function(conn):
    if conn.dialect.name != 'postgresql':
        return
    conn.execute(text(f'''
        CREATE OR REPLACE FUNCTION {FUNCTION_NAME}()
        RETURNS trigger LANGUAGE plpgsql AS $fn$
        BEGIN
            IF current_setting('caffeine.calc_refresh', true) = '1' THEN
                RETURN NULL;
            END IF;
            UPDATE {TRACK_TABLE_NAME}
               SET is_stale = TRUE,
                   reason = 'Data sumber berubah melalui INSERT, UPDATE, DELETE, atau TRUNCATE.',
                   last_invalidated_at = CURRENT_TIMESTAMP
             WHERE table_name = TG_TABLE_NAME;
            RETURN NULL;
        END
        $fn$
    '''))


def install_triggers(conn, table_name, definitions):
    """Install/update conservative change tracking on a user table.

    UPDATE OF only tracks columns that appear in formulas, so modifying an
    unrelated column does not invalidate results. All formulas in the table
    are conservatively invalidated when any source column changes.
    """
    if conn.dialect.name != 'postgresql' or not definitions:
        return
    table_name = validate_table_name(table_name)
    if is_internal_table(table_name):
        raise ValueError('Tracking tidak boleh dipasang pada tabel internal.')
    inspector = inspect(conn)
    if not inspector.has_table(table_name):
        return
    columns = {col['name'] for col in inspector.get_columns(table_name)}
    refs = sorted({name for row in definitions for name in references(row['formula']) if name in columns})
    prep = conn.dialect.identifier_preparer
    qtable = prep.quote(table_name)
    conn.execute(text(f'DROP TRIGGER IF EXISTS {UPDATE_TRIGGER} ON {qtable}'))
    conn.execute(text(f'DROP TRIGGER IF EXISTS {ROWS_TRIGGER} ON {qtable}'))
    _create_trigger_function(conn)
    conn.execute(text(f'''
        CREATE TRIGGER {ROWS_TRIGGER}
        AFTER INSERT OR DELETE OR TRUNCATE ON {qtable}
        FOR EACH STATEMENT EXECUTE FUNCTION {FUNCTION_NAME}()
    '''))
    if refs:
        quoted = ', '.join(prep.quote(n) for n in refs)
        conn.execute(text(f'''
            CREATE TRIGGER {UPDATE_TRIGGER}
            AFTER UPDATE OF {quoted} ON {qtable}
            FOR EACH STATEMENT EXECUTE FUNCTION {FUNCTION_NAME}()
        '''))


def _definitions_for(conn, calc_table, table_name):
    return [dict(r) for r in conn.execute(
        select(calc_table).where(calc_table.c.table_name == table_name)
    ).mappings()]


def load_tracking(conn, calc_table, table_name):
    _init_metadata(conn, calc_table)
    defs = _definitions_for(conn, calc_table, table_name)
    lookup, graph, order = _graph(defs)
    statuses = {r['column_name']: dict(r) for r in conn.execute(
        select(state).where(state.c.table_name == table_name)
    ).mappings()}
    return defs, graph, order, statuses


def mark_current(conn, table_name, column_name, calculated_at=None):
    now = calculated_at or datetime.now(timezone.utc)
    conn.execute(state.update().where(
        state.c.table_name == table_name,
        state.c.column_name == column_name,
    ).values(is_stale=False, reason=None, last_calculated_at=now))


def mark_stale(conn, table_name, columns, reason):
    if columns:
        conn.execute(state.update().where(
            state.c.table_name == table_name,
            state.c.column_name.in_(sorted(columns)),
        ).values(
            is_stale=True, reason=reason,
            last_invalidated_at=datetime.now(timezone.utc),
        ))


def report(definitions, graph, order, statuses):
    output = []
    for name in order:
        definition = next(d for d in definitions if d['column_name'] == name)
        st = statuses.get(name, {})
        output.append({
            **definition,
            'source_columns': references(definition['formula']),
            'upstream_calculated_columns': graph[name],
            'downstream_calculated_columns': sorted(_descendants(graph, name)),
            'is_stale': st.get('is_stale', True),
            'status': 'stale' if st.get('is_stale', True) else 'current',
            'stale_reason': st.get('reason'),
            'last_invalidated_at': st.get('last_invalidated_at'),
            'last_calculated_at': st.get('last_calculated_at', definition['last_calculated_at']),
        })
    return output
