"""Safely evaluate and store numeric calculated warehouse columns (7A.2.2.5).

Calculations are single-table, numeric-only, read/write via SQLAlchemy expressions.
No raw SQL fragments supplied by end users are executed.
"""
from __future__ import annotations

import ast
import re
import math
from datetime import datetime, timezone

from sqlalchemy import (
    Column, DateTime, MetaData, String, Table, Text, case, cast,
    func, inspect, select, text, Numeric,
)
from sqlalchemy.sql.sqltypes import Integer, BigInteger, SmallInteger, Float, Numeric as NumericType

from database.connection import engine
from services.calculated_column_tracking_service import (
    state, load_tracking, mark_current, mark_stale, install_triggers,
    report, _descendants, _graph, references,
)
from database.table_service import (
    ensure_internal_tables, validate_column_name, validate_table_name,
    is_internal_table, schema_mapping_table, _ensure_table_state_connection,
)

TABLE_NAME = 'warehouse_calculated_columns'
metadata = MetaData()
calculations = Table(
    TABLE_NAME, metadata,
    Column('table_name', String(63), primary_key=True),
    Column('column_name', String(63), primary_key=True),
    Column('formula', Text, nullable=False),
    Column('last_calculated_at', DateTime(timezone=True), nullable=False),
)
NUMERIC_TYPES = (Integer, BigInteger, SmallInteger, Float, NumericType)
VALID_NAME = re.compile(r'[a-z][a-z0-9_]{0,62}\Z')
SYSTEM_COLUMNS = {'bank_id', 'bulan', 'tahun'}
MAX_FORMULA = 600
MAX_AST_NODES = 100


def _validated_table(connection, table_name):
    table_name = validate_table_name(table_name)
    if is_internal_table(table_name) or table_name == TABLE_NAME:
        raise ValueError('Tabel metadata internal tidak boleh diubah.')
    if not inspect(connection).has_table(table_name):
        raise ValueError(f"Tabel '{table_name}' tidak ditemukan.")
    table = Table(table_name, MetaData(), autoload_with=connection)
    return table


def _compile_formula(formula, table, *, max_nodes=MAX_AST_NODES):
    if not isinstance(formula, str) or not formula.strip() or len(formula) > MAX_FORMULA:
        raise ValueError('Formula harus berupa teks, maksimal 600 karakter.')
    try:
        tree = ast.parse(formula.strip(), mode='eval')
    except SyntaxError as exc:
        raise ValueError('Sintaks formula tidak valid.') from exc
    if sum(1 for _ in ast.walk(tree)) > max_nodes:
        raise ValueError('Formula terlalu kompleks.')
    referenced = set()

    def build(node, depth=0):
        if depth > 30:
            raise ValueError('Formula terlalu dalam.')
        if isinstance(node, ast.Name):
            if node.id not in table.c:
                raise ValueError(f"Kolom sumber '{node.id}' tidak ditemukan.")
            column = table.c[node.id]
            if not isinstance(column.type, NUMERIC_TYPES):
                raise ValueError(f"Kolom '{node.id}' harus bertipe numerik.")
            if node.id in SYSTEM_COLUMNS:
                raise ValueError('Kolom identitas bank/periode tidak boleh menjadi komponen formula.')
            referenced.add(node.id)
            return cast(column, Numeric(38, 12))
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            if not math.isfinite(float(node.value)) or abs(node.value) > 1e15:
                raise ValueError('Konstanta terlalu besar.')
            return cast(node.value, Numeric(38, 12))
        if isinstance(node, ast.UnaryOp):
            operand = build(node.operand, depth+1)
            if isinstance(node.op, ast.USub):
                return -operand
            if isinstance(node.op, ast.UAdd):
                return operand
            raise ValueError('Operator unary tidak didukung.')
        if isinstance(node, ast.BinOp):
            lhs, rhs = build(node.left, depth+1), build(node.right, depth+1)
            if isinstance(node.op, ast.Add):
                return lhs + rhs
            if isinstance(node.op, ast.Sub):
                return lhs - rhs
            if isinstance(node.op, ast.Mult):
                return lhs * rhs
            if isinstance(node.op, ast.Div):
                # SQL NULL rather than a database error for zero denominators.
                return case((rhs == 0, None), else_=lhs / rhs)
            raise ValueError('Gunakan +, -, *, /, dan tanda kurung saja.')
        raise ValueError('Formula hanya boleh memakai nama kolom numerik, angka, dan operator + - * /.')

    expression = build(tree.body)
    if not referenced:
        raise ValueError('Formula harus merujuk setidaknya satu kolom sumber.')
    return expression, sorted(referenced)


def _ready(connection, table_name, formula, column_name=None):
    table = _validated_table(connection, table_name)
    if column_name:
        column_name = validate_column_name(column_name)
        if not VALID_NAME.fullmatch(column_name):
            raise ValueError('Nama kolom hanya boleh huruf kecil, angka, underscore dan diawali huruf.')
        if column_name in table.c:
            raise ValueError(f"Kolom '{column_name}' sudah ada pada tabel '{table_name}'.")
        if column_name in SYSTEM_COLUMNS:
            raise ValueError('Nama kolom sistem tidak boleh digunakan.')
        if len(table.columns) >= 1500:
            raise ValueError('Tabel sudah mencapai batas aman 1500 kolom.')
    expr, refs = _compile_formula(formula, table)
    return table, expr, refs


def preview_calculated_column(*, table_name, formula):
    with engine.connect() as conn:
        table, expr, refs = _ready(conn, table_name, formula)
        rows = conn.execute(select(expr.label('result')).select_from(table).limit(10)).all()
        null_count = conn.execute(
            select(func.count()).select_from(table).where(expr.is_(None))
        ).scalar_one()
        count = conn.execute(select(func.count()).select_from(table)).scalar_one()
        return {
            'status': 'success', 'table_name': table_name, 'formula': formula,
            'source_columns': refs, 'sample_values': [str(r[0]) if r[0] is not None else None for r in rows],
            'row_count': count, 'null_count': null_count,
            'warning': 'Preview hanya membaca data. Pembagi nol dan nilai sumber NULL menghasilkan NULL.',
        }


def create_calculated_column(*, table_name, column_name, formula):
    ensure_internal_tables()
    # Create registry before the transactional schema change; internal table remains if create fails.
    calculations.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        # Migrate legacy definitions before adding a new calculated column.
        existing, graph, order, statuses = load_tracking(conn, calculations, table_name)
        table, expr, refs = _ready(conn, table_name, formula, column_name)
        p = conn.dialect.identifier_preparer
        conn.execute(text(
            f'ALTER TABLE {p.quote(table_name)} ADD COLUMN {p.quote(column_name)} NUMERIC(28, 8)'
        ))
        # Reflect the column just created; do not reuse a stale Table schema.
        fresh_table = Table(table_name, MetaData(), autoload_with=conn)
        fresh_expr, _ = _compile_formula(formula, fresh_table)
        if conn.dialect.name == 'postgresql':
            conn.execute(text("SELECT set_config('caffeine.calc_refresh', '1', true)"))
        conn.execute(fresh_table.update().values({column_name: fresh_expr}))
        ordinal = conn.execute(select(func.max(schema_mapping_table.c.source_ordinal)).where(
            schema_mapping_table.c.table_name == table_name
        )).scalar()
        conn.execute(schema_mapping_table.insert().values(
            table_name=table_name,
            source_ordinal=int(ordinal or 0) + 1,
            source_column=column_name,
            database_column=column_name,
        ))
        conn.execute(calculations.insert().values(
            table_name=table_name, column_name=column_name, formula=formula.strip(),
            last_calculated_at=datetime.now(timezone.utc),
        ))
        # Legacy parent outputs may already be stale; never mark a dependent Current.
        stale_sources = {dep for dep in refs if dep in graph and statuses.get(dep, {}).get('is_stale', True)}
        now = datetime.now(timezone.utc)
        conn.execute(state.insert().values(
            table_name=table_name, column_name=column_name,
            is_stale=bool(stale_sources),
            reason=('Sumber calculated column belum mutakhir: ' + ', '.join(sorted(stale_sources))) if stale_sources else None,
            last_invalidated_at=now if stale_sources else None,
            last_calculated_at=now,
        ))
        definitions = [dict(x) for x in conn.execute(
            select(calculations).where(calculations.c.table_name == table_name)
        ).mappings()]
        install_triggers(conn, table_name, definitions)
        _ensure_table_state_connection(conn, table_name)
        count = conn.execute(select(func.count()).select_from(fresh_table)).scalar_one()
    return {
        'status': 'success', 'table_name': table_name, 'column_name': column_name,
        'formula': formula, 'source_columns': refs, 'row_count': count,
        'data_type': 'NUMERIC(28,8)', 'mode': 'stored_calculated_column',
        'refresh_policy': 'manual',
    }


def list_calculated_columns(table_name):
    # Writes are limited to state migration and missing-trigger installation.
    # Actual warehouse data is never recalculated by listing.
    ensure_internal_tables()
    calculations.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        _validated_table(conn, table_name)
        defs, graph, order, statuses = load_tracking(conn, calculations, table_name)
        if defs and conn.dialect.name == 'postgresql':
            # Ensure triggers exist when migrating from 7A.2.2.5.
            triggers = {row[0] for row in conn.execute(text("SELECT tg.tgname FROM pg_trigger tg JOIN pg_class rel ON rel.oid = tg.tgrelid WHERE rel.relname = :name AND NOT tg.tgisinternal"), {'name': table_name})}
            if 'caffeine_calc_row_change' not in triggers or 'caffeine_calc_dependency_update' not in triggers:
                install_triggers(conn, table_name, defs)
        return {
            'table_name': table_name,
            'columns': report(defs, graph, order, statuses),
            'stale_count': sum(1 for name in order if statuses.get(name, {}).get('is_stale', True)),
            'refresh_policy': 'manual',
            'tracking': 'postgresql_triggers' if conn.dialect.name == 'postgresql' else 'explicit_only',
        }


def _refresh_targets(conn, table_name, requested=None):
    table = _validated_table(conn, table_name)
    defs, graph, order, statuses = load_tracking(conn, calculations, table_name)
    if requested is not None and requested not in graph:
        raise ValueError('Calculated Column tidak ditemukan.')

    if requested:
        required = set()
        def walk(name):
            if name in required:
                return
            required.add(name)
            for dep in graph[name]:
                walk(dep)
        walk(requested)
        targets = [n for n in order if n in required and (
            n == requested or statuses.get(n, {}).get('is_stale', True)
        )]
    else:
        # Include downstream dependents even if their stored state was marked
        # Current before their source was detected as stale.
        stale = {n for n in order if statuses.get(n, {}).get('is_stale', True)}
        expanded = set(stale)
        for source in stale:
            expanded.update(_descendants(graph, source))
        targets = [n for n in order if n in expanded]

    lookup = {row['column_name']: row for row in defs}
    # Prevent trigger invalidation from our own internal recalculation transaction.
    if conn.dialect.name == 'postgresql':
        conn.execute(text("SELECT set_config('caffeine.calc_refresh', '1', true)"))
    for name in targets:
        if name not in table.c:
            raise ValueError(f"Kolom hasil '{name}' tidak ditemukan pada tabel.")
        expression, refs = _compile_formula(lookup[name]['formula'], table)
        if name in refs:
            raise ValueError('Calculated column tidak boleh merujuk dirinya sendiri.')
        conn.execute(table.update().values({name: expression}))
        now = datetime.now(timezone.utc)
        conn.execute(calculations.update().where(
            calculations.c.table_name == table_name,
            calculations.c.column_name == name,
        ).values(last_calculated_at=now))
        mark_current(conn, table_name, name, now)
        # Recalculating a column changes downstream values semantically.
        downstream = _descendants(graph, name)
        mark_stale(conn, table_name, downstream - set(targets[:targets.index(name)+1]),
                   f"Komponen turunan '{name}' telah dihitung ulang.")
    if targets:
        _ensure_table_state_connection(conn, table_name)
    return {
        'status': 'success', 'table_name': table_name,
        'refreshed_columns': targets,
        'refreshed_count': len(targets),
        'refresh_policy': 'manual',
    }


def refresh_calculated_column(*, table_name, column_name):
    ensure_internal_tables()
    calculations.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        return _refresh_targets(conn, table_name, requested=column_name)


def refresh_stale_calculated_columns(*, table_name):
    ensure_internal_tables()
    calculations.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        return _refresh_targets(conn, table_name)
