"""Read-only OPS reconciliation across an explicitly selected warehouse row.

No guessed regulatory account mapping: the client selects table and columns.
A selected calculated column may be stale; its value is shown with warning.
"""
from __future__ import annotations

from decimal import Decimal
from sqlalchemy import MetaData, Table, select, and_, inspect
from sqlalchemy.sql.sqltypes import Numeric as NumericType, Float, Integer as IntegerType
from database.connection import engine
from services.ops_financial_service import get_source_catalog, _reference_periods
from services.bank_ops_service import get_master_bank

NUMERIC_TYPES = (NumericType, Float, IntegerType)


def _freshness(conn, table_name, chosen_columns):
    if not inspect(conn).has_table('warehouse_calculated_columns'):
        return {}
    defs = Table('warehouse_calculated_columns', MetaData(), autoload_with=conn)
    definitions = conn.execute(select(defs.c.column_name, defs.c.formula).where(
        defs.c.table_name == table_name, defs.c.column_name.in_(chosen_columns)
    )).all()
    if not definitions:
        return {}
    if not inspect(conn).has_table('warehouse_calculated_column_state'):
        return {name: {'status': 'unknown', 'formula': formula} for name, formula in definitions}
    states = Table('warehouse_calculated_column_state', MetaData(), autoload_with=conn)
    state_rows = {r.column_name: r for r in conn.execute(select(
        states.c.column_name, states.c.is_stale, states.c.reason
    ).where(states.c.table_name == table_name, states.c.column_name.in_(chosen_columns)))}
    return {name: {
        'status': ('stale' if state_rows[name].is_stale else 'current') if name in state_rows else 'unknown',
        'reason': state_rows[name].reason if name in state_rows else 'Belum memiliki metadata freshness.',
        'formula': formula,
    } for name, formula in definitions}


def reconcile_warehouse_columns(bank_id, period, table_name, assets_column, liabilities_column, equity_column, derived_column=None):
    get_master_bank(bank_id)
    year, month = _reference_periods(period)[2]
    catalog = {item['table_name']: item for item in get_source_catalog()}
    source = catalog.get(table_name)
    if not source:
        raise ValueError('Pilih tabel warehouse yang memiliki bank_id, bulan dan tahun.')
    allowed = {col['name'] for col in source['columns'] if col['is_numeric'] and not col['masked']}
    selected = {
        'assets': assets_column, 'liabilities': liabilities_column, 'equity': equity_column,
    }
    if derived_column:
        selected['derived'] = derived_column
    if not all(name in allowed and name not in {'bulan', 'tahun'} for name in selected.values()):
        raise ValueError('Semua kolom rekonsiliasi harus numerik, tersedia, dan tidak dimasking.')
    with engine.connect() as conn:
        table = Table(table_name, MetaData(), autoload_with=conn)
        stmt = select(*[table.c[col] for col in selected.values()]).where(and_(
            table.c.bank_id == str(bank_id), table.c.bulan == month, table.c.tahun == year,
        )).limit(2)
        records = conn.execute(stmt).all()
        freshness = _freshness(conn, table_name, list(selected.values()))
    provenance = {role: {
        'table_name': table_name, 'column_name': column,
        'freshness': freshness.get(column, {'status': 'source'}),
    } for role, column in selected.items()}
    if len(records) != 1:
        return {
            'status': 'missing' if not records else 'ambiguous_multiple_rows',
            'bank_id': str(bank_id), 'period': period, 'table_name': table_name,
            'rows': len(records), 'values': None, 'difference': None,
            'match': None, 'provenance': provenance,
        }
    record = records[0]
    values = {role: (str(record[i]) if record[i] is not None else None)
              for i, role in enumerate(selected)}
    if any(values[k] is None for k in ('assets', 'liabilities', 'equity')):
        difference, match, status = None, None, 'null_value'
    else:
        difference = Decimal(values['assets']) - Decimal(values['liabilities']) - Decimal(values['equity'])
        match = abs(difference) <= Decimal('0.01')
        status = 'balanced' if match else 'difference'
    if any(v['freshness']['status'] in ('stale', 'unknown') for v in provenance.values()):
        status = 'stale_source' if status == 'balanced' else status
    derived_difference = None
    if derived_column and values['derived'] is not None and values['liabilities'] is not None and values['equity'] is not None:
        derived_difference = Decimal(values['derived']) - Decimal(values['liabilities']) - Decimal(values['equity'])
    return {
        'status': status, 'bank_id': str(bank_id), 'period': period, 'table_name': table_name,
        'rows': 1, 'values': values,
        'difference': format(difference, 'f') if difference is not None else None,
        'derived_difference': format(derived_difference, 'f') if derived_difference is not None else None,
        'match': match,
        'provenance': provenance,
        'note': 'Nilai dianggap cocok bila selisih absolut maksimal 0,01 dalam satuan sumber; bukan toleransi materialitas audit.',
    }
