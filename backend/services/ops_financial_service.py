"""OPS 7A.2: explicit financial source mappings; no inferred financial account codes."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, DivisionByZero
import ast
import re
import math
from sqlalchemy import (
    Column, DateTime, Integer, MetaData, String, Table, JSON,
    func, inspect, select, insert, update, delete, text,
    and_, cast, Numeric,
)
from sqlalchemy.sql.sqltypes import Numeric as NumericType, Float, Integer as IntegerType
from database.connection import engine
from database.table_service import (
    get_all_tables, get_masked_columns,
    OPS_FINANCIAL_MAPPINGS_TABLE_NAME,
    OPS_FINANCIAL_FORMULAS_TABLE_NAME,
)
from services.bank_ops_service import get_master_bank

# 24 indicators copied from the labels in OPS BPR MAL.xlsx.
# Ratio values are expressed in percentage points, e.g. 58.22 means 58.22%.
METRIC_DEFS = [
    ("total_assets", "Total Aset", "amount"),
    ("total_deposits", "Total Dana Pihak Ketiga", "amount"),
    ("savings", "Tabungan", "amount"),
    ("term_deposits", "Deposito", "amount"),
    ("total_loans", "Total Kredit (Baki Debet)", "amount"),
    ("interbank_placements", "Penempatan pada Bank Lain", "amount"),
    ("foreclosed_assets", "AYDA", "amount"),
    ("current_year_profit", "Laba (Rugi) Tahun Berjalan", "amount"),
    ("prior_year_profit", "Laba (Rugi) Tahun Lalu", "amount"),
    ("operating_income", "Pendapatan Operasional", "amount"),
    ("operating_expenses", "Beban Operasional", "amount"),
    ("paid_up_capital", "Modal Disetor", "amount"),
    ("total_capital", "Total Modal", "amount"),
    ("core_capital", "Modal Inti", "amount"),
    ("supplementary_capital", "Modal Pelengkap", "amount"),
    ("written_off_loans", "Kredit yang Dihapusbuku", "amount"),
    ("car", "Rasio KPMM (CAR)", "ratio"),
    ("npl_gross", "NPL gross", "ratio"),
    ("roa", "ROA", "ratio"),
    ("bopo", "BOPO", "ratio"),
    ("nim", "NIM", "ratio"),
    ("cash_ratio", "Cash Ratio (CR)", "ratio"),
    ("ldr", "LDR", "ratio"),
    ("liquid_assets_ratio", "Total Aset Likuid thd Total Aset", "ratio"),
]
METRICS = {key: {"metric_key": key, "label": label, "kind": kind}
           for key, label, kind in METRIC_DEFS}

mapping_metadata = MetaData()
mapping_table = Table(
    OPS_FINANCIAL_MAPPINGS_TABLE_NAME, mapping_metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('metric_key', String(80), nullable=False, unique=True),
    Column('table_name', String(63), nullable=False),
    Column('value_column', String(63), nullable=False),
    Column('account_column', String(63), nullable=True),
    Column('account_value', String(150), nullable=True),
    Column('aggregation', String(12), nullable=False),
    Column('multiplier', Numeric(20, 6), nullable=False),
    Column('updated_at', DateTime(timezone=True), nullable=False,
           server_default=func.now()),
)

NUMERIC_TYPES = (NumericType, Float, IntegerType)


def ensure_mapping_table():
    mapping_metadata.create_all(engine, tables=[mapping_table], checkfirst=True)


def get_source_catalog():
    inspector = inspect(engine)
    result = []
    for table_name in get_all_tables():
        try:
            cols = inspector.get_columns(table_name)
            names = {row['name'] for row in cols}
            if not {'bank_id','bulan','tahun'}.issubset(names):
                continue
            masked = set(get_masked_columns(table_name))
            result.append({
                'table_name': table_name,
                'columns': [
                    {'name': row['name'], 'data_type': str(row['type']),
                     'is_numeric': isinstance(row['type'], NUMERIC_TYPES),
                     'masked': row['name'] in masked}
                    for row in cols
                ],
            })
        except Exception:
            continue
    return result


def _read_mappings():
    ensure_mapping_table()
    with engine.connect() as conn:
        rows = conn.execute(select(mapping_table)).mappings().all()
    return {row['metric_key']: {
        'metric_key': row['metric_key'],
        'table_name': row['table_name'], 'value_column': row['value_column'],
        'account_column': row['account_column'], 'account_value': row['account_value'],
        'aggregation': row['aggregation'], 'multiplier': float(row['multiplier']),
        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
    } for row in rows}


def _legacy_list_financial_mappings():
    saved = _read_mappings()
    return [{**definition, 'mapping': saved.get(key)}
            for key, definition in METRICS.items()]


def _legacy_save_financial_mapping(metric_key: str, payload: dict):
    if metric_key not in METRICS:
        raise ValueError('Indikator OPS tidak dikenal.')
    source_tables = {item['table_name']: item for item in get_source_catalog()}
    table_name = str(payload.get('table_name') or '').strip()
    source = source_tables.get(table_name)
    if not source:
        raise ValueError('Tabel sumber tidak ditemukan atau tidak memiliki bank_id/bulan/tahun.')
    cols = {column['name']: column for column in source['columns']}
    value_column = str(payload.get('value_column') or '').strip()
    column = cols.get(value_column)
    if not column or not column['is_numeric'] or column['masked']:
        raise ValueError('Kolom nilai harus numerik dan tidak dimasking.')
    account_column = str(payload.get('account_column') or '').strip() or None
    account_value = str(payload.get('account_value') or '').strip() or None
    if bool(account_column) != bool(account_value):
        raise ValueError('Kolom dan nilai filter akun harus diisi bersama-sama.')
    if account_column and account_column not in cols:
        raise ValueError('Kolom kode akun tidak ditemukan di tabel sumber.')
    aggregation = str(payload.get('aggregation') or '').strip().lower()
    if aggregation not in {'sum','single'}:
        raise ValueError('Agregasi harus sum atau single.')
    if METRICS[metric_key]['kind'] == 'ratio' and aggregation != 'single':
        raise ValueError('Rasio wajib memakai single: satu nilai per bank/periode.')
    try:
        multiplier = Decimal(str(payload.get('multiplier', 1)))
    except (InvalidOperation, TypeError):
        raise ValueError('Multiplier tidak valid.')
    if not multiplier.is_finite() or multiplier == 0 or abs(multiplier) > Decimal('1000000'):
        raise ValueError('Multiplier harus bukan nol dan maksimum 1.000.000.')
    values = {
        'table_name': table_name, 'value_column': value_column,
        'account_column': account_column, 'account_value': account_value,
        'aggregation': aggregation, 'multiplier': multiplier,
        'updated_at': func.now(),
    }
    ensure_mapping_table()
    with engine.begin() as conn:
        if conn.execute(select(mapping_table.c.id).where(mapping_table.c.metric_key == metric_key)).first():
            conn.execute(update(mapping_table).where(mapping_table.c.metric_key == metric_key).values(**values))
        else:
            conn.execute(insert(mapping_table).values(metric_key=metric_key, **values))
    return next(item for item in _legacy_list_financial_mappings() if item['metric_key'] == metric_key)


def _legacy_delete_financial_mapping(metric_key: str):
    if metric_key not in METRICS:
        raise ValueError('Indikator OPS tidak dikenal.')
    ensure_mapping_table()
    with engine.begin() as conn:
        conn.execute(delete(mapping_table).where(mapping_table.c.metric_key == metric_key))
    return {'metric_key': metric_key, 'mapping': None}


def _reference_periods(period):
    try:
        year_s, month_s = str(period).split('-')
        year, month = int(year_s), int(month_s)
        assert 2000 <= year <= 2100 and 1 <= month <= 12
    except Exception as exc:
        raise ValueError('Posisi laporan harus YYYY-MM.') from exc
    prior_year = (year - 1, 12)
    previous_month = (year - 1, 12) if month == 1 else (year, month - 1)
    current = (year, month)
    return [prior_year, previous_month, current]


def _growth(current, baseline, is_ratio):
    if current is None or baseline is None:
        return None
    if is_ratio:
        return round(current - baseline, 4)  # percentage points
    if baseline == 0:
        return None  # undefined; don't invent 0% or infinity
    return round((current / baseline - 1) * 100, 4)


def _read_period_value(conn, mapping, bank_id, year, month):
    source = Table(mapping['table_name'], MetaData(), autoload_with=engine)
    col = source.c[mapping['value_column']]
    conditions = [
        source.c.bank_id == str(bank_id),
        source.c.tahun == int(year),
        source.c.bulan == int(month),
    ]
    if mapping['account_column']:
        conditions.append(cast(source.c[mapping['account_column']], String) == mapping['account_value'])
    # Both NULL and repeated rows are handled explicitly. Never convert missing to zero.
    statement = select(func.count().label('rows'), func.count(col).label('values'),
                       func.sum(col).label('sum_value'), func.min(col).label('min_value'))        .where(and_(*conditions))
    row = conn.execute(statement).one()
    count, numeric_count, sum_value, min_value = row
    if count == 0 or numeric_count == 0:
        return None, 'missing' if count == 0 else 'null_value', int(count)
    if numeric_count != count:
        return None, 'incomplete_values', int(count)
    if mapping['aggregation'] == 'single' and count != 1:
        return None, 'ambiguous_multiple_rows', int(count)
    value = min_value if mapping['aggregation'] == 'single' else sum_value
    return round(float(value) * mapping['multiplier'], 4), 'ok', int(count)


def _legacy_get_financial_performance(bank_id: str, period: str):
    get_master_bank(bank_id)
    periods = _reference_periods(period)
    mappings = _read_mappings()
    catalog = {
        item['table_name']: {column['name']: column for column in item['columns']}
        for item in get_source_catalog()
    }
    results = []
    for key, definition in METRICS.items():
        mapping = mappings.get(key)
        if not mapping:
            results.append({
                **definition, 'status': 'unmapped', 'values': [None] * 3,
                'period_status': ['unmapped'] * 3, 'ytd': None,
                'mom': None, 'mapping': None,
            })
            continue
        columns = catalog.get(mapping['table_name'], {})
        valid = (
            mapping['value_column'] in columns
            and columns[mapping['value_column']]['is_numeric']
            and not columns[mapping['value_column']]['masked']
            and (not mapping['account_column'] or mapping['account_column'] in columns)
        )
        if not valid:
            results.append({
                **definition, 'status': 'invalid_mapping', 'values': [None] * 3,
                'period_status': ['invalid_mapping'] * 3, 'ytd': None,
                'mom': None, 'mapping': mapping,
            })
            continue
        values, statuses = [], []
        try:
            # Separate transaction per metric: an error in one source must not
            # poison PostgreSQL's transaction for every subsequent metric.
            with engine.connect() as conn:
                if engine.dialect.name == 'postgresql':
                    conn.execute(text("SET LOCAL statement_timeout = '5s'"))
                for year, month in periods:
                    value, status, _ = _read_period_value(
                        conn, mapping, bank_id, year, month,
                    )
                    values.append(value)
                    statuses.append(status)
        except Exception:
            values, statuses = [None] * 3, ['source_error'] * 3
        results.append({
            **definition,
            'status': 'ok' if all(status == 'ok' for status in statuses) else 'partial',
            'values': values, 'period_status': statuses,
            'ytd': _growth(values[2], values[0], definition['kind'] == 'ratio'),
            'mom': _growth(values[2], values[1], definition['kind'] == 'ratio'),
            'mapping': mapping,
        })
    return {
        'bank_id': str(bank_id), 'selected_period': period,
        'reference_periods': [f'{year:04d}-{month:02d}' for year, month in periods],
        'mapped_count': len(mappings), 'total_metrics': len(METRICS),
        'metrics': results,
        'note': 'Nominal: YtD/MoM dalam %. Rasio: YtD/MoM selisih pp.',
    }


# ============================================================
# 7A.2.1 MULTI-SOURCE FORMULA ENGINE
# ============================================================
# Formula definitions coexist with 7A.2 direct mappings. No migration of
# direct mappings is performed. No eval(), exec(), or user-supplied SQL.

formula_metadata = MetaData()
formula_table = Table(
    OPS_FINANCIAL_FORMULAS_TABLE_NAME, formula_metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('metric_key', String(80), nullable=False, unique=True),
    Column('definition', JSON, nullable=False),
    Column('updated_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
)

SYMBOL_RE = re.compile(r'^[A-Z][A-Z0-9_]{0,19}$')
METRIC_REF_PREFIX = 'metric_'
MAX_COMPONENTS = 12
MAX_AST_NODES = 80
MAX_FORMULA_CHARS = 400
MAX_ABS_VALUE = Decimal('1e25')


def _ensure_formulas():
    formula_metadata.create_all(engine, tables=[formula_table], checkfirst=True)


def _read_formulas():
    _ensure_formulas()
    with engine.connect() as conn:
        rows = conn.execute(select(formula_table)).mappings().all()
    return {row['metric_key']: row['definition'] for row in rows}


def _compile_formula(expression, component_names):
    expression = str(expression or '').strip()
    if not expression or len(expression) > MAX_FORMULA_CHARS:
        raise ValueError('Formula wajib diisi, maksimal 400 karakter.')
    try:
        tree = ast.parse(expression, mode='eval')
    except SyntaxError as error:
        raise ValueError('Sintaks formula tidak valid.') from error
    nodes = list(ast.walk(tree))
    if len(nodes) > MAX_AST_NODES:
        raise ValueError('Formula terlalu kompleks.')
    metric_refs = set()
    allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Add, ast.Sub, ast.Mult,
               ast.Div, ast.UAdd, ast.USub, ast.Name, ast.Load, ast.Constant)
    for node in nodes:
        if not isinstance(node, allowed):
            raise ValueError('Formula hanya boleh memakai +, -, *, /, kurung, angka, dan simbol komponen.')
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise ValueError('Konstanta formula harus berupa angka.')
            numeric = Decimal(str(node.value))
            if not numeric.is_finite() or abs(numeric) > Decimal('1000000000'):
                raise ValueError('Nilai konstanta formula tidak wajar.')
        if isinstance(node, ast.Name):
            if node.id in component_names:
                continue
            if node.id.startswith(METRIC_REF_PREFIX):
                key = node.id[len(METRIC_REF_PREFIX):]
                if key not in METRICS:
                    raise ValueError(f'Indikator referensi tidak dikenal: {key}.')
                metric_refs.add(key)
            else:
                raise ValueError(f'Simbol formula tidak dikenal: {node.id}.')
    return tree, metric_refs


def _validate_source_component(raw, catalog):
    if not isinstance(raw, dict):
        raise ValueError('Komponen formula harus berbentuk objek.')
    symbol = str(raw.get('symbol') or '').strip().upper()
    if not SYMBOL_RE.fullmatch(symbol) or symbol.startswith('METRIC_'):
        raise ValueError('Simbol harus huruf kapital A-Z, angka, underscore; contoh A atau KREDIT_MACET.')
    table_name = str(raw.get('table_name') or '').strip()
    source = catalog.get(table_name)
    if source is None:
        raise ValueError(f'Tabel {table_name} tidak ada atau belum memiliki bank_id, bulan, tahun.')
    cols = {c['name']:c for c in source['columns']}
    value_column = str(raw.get('value_column') or '').strip()
    if value_column not in cols or not cols[value_column]['is_numeric'] or cols[value_column]['masked']:
        raise ValueError(f'Kolom nilai komponen {symbol} harus numerik dan tidak dimasking.')
    account_column = str(raw.get('account_column') or '').strip() or None
    account_value = str(raw.get('account_value') or '').strip() or None
    if bool(account_column) != bool(account_value):
        raise ValueError(f'Komponen {symbol}: filter kolom/nilai akun harus diisi berpasangan.')
    if account_column and account_column not in cols:
        raise ValueError(f'Kolom filter komponen {symbol} tidak ada.')
    if account_value and len(account_value) > 150:
        raise ValueError('Panjang kode akun maksimal 150 karakter.')
    aggregation = str(raw.get('aggregation') or 'sum').lower()
    if aggregation not in {'sum', 'single'}:
        raise ValueError('Agregasi komponen harus sum atau single.')
    try:
        multiplier = Decimal(str(raw.get('multiplier', 1)))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise ValueError(f'Multiplier komponen {symbol} tidak valid.') from error
    if not multiplier.is_finite() or multiplier == 0 or abs(multiplier) > Decimal('1000000'):
        raise ValueError('Multiplier harus non-nol dengan maksimum absolut 1.000.000.')
    return {'symbol': symbol, 'table_name': table_name, 'value_column': value_column,
            'account_column': account_column, 'account_value': account_value,
            'aggregation': aggregation, 'multiplier': float(multiplier)}


def _validate_formula_definition(metric_key, payload, other_formulas):
    if metric_key not in METRICS:
        raise ValueError('Indikator OPS tidak dikenal.')
    raw_components = payload.get('components') or []
    if not isinstance(raw_components, list) or len(raw_components) > MAX_COMPONENTS:
        raise ValueError('Maksimal 12 komponen sumber per formula.')
    catalog = {item['table_name']: item for item in get_source_catalog()}
    components = [_validate_source_component(c, catalog) for c in raw_components]
    names = [c['symbol'] for c in components]
    if len(names) != len(set(names)):
        raise ValueError('Simbol komponen harus unik.')
    expression = str(payload.get('expression') or '').strip()
    _, refs = _compile_formula(expression, set(names))
    if metric_key in refs:
        raise ValueError('Formula tidak boleh merujuk pada indikatornya sendiri.')
    candidate = {**other_formulas, metric_key: {'expression':expression, 'components':components}}
    deps = {}
    for key, definition in candidate.items():
        symbols = {c['symbol'] for c in definition.get('components', [])}
        _, refs_at_key = _compile_formula(definition['expression'], symbols)
        deps[key] = refs_at_key
    visited, visiting = set(), set()
    def check_cycle(key):
        if key in visiting:
            raise ValueError('Circular dependency ditemukan pada formula indikator OPS.')
        if key in visited: return
        visiting.add(key)
        for ref in deps.get(key, set()):
            if ref in deps: check_cycle(ref)
        visiting.remove(key)
        visited.add(key)
    for key in deps: check_cycle(key)
    return {'mode':'formula', 'expression':expression, 'components':components}


def list_financial_mappings():
    direct = _read_mappings()
    formulas = _read_formulas()
    return [{**definition, 'mapping': (
        {**formulas[key], 'mode':'formula'} if key in formulas else
        {'mode':'direct', **direct[key]} if key in direct else None
    )} for key, definition in METRICS.items()]


def save_financial_mapping(metric_key, payload):
    if str(payload.get('mode') or 'direct') != 'formula':
        result = _legacy_save_financial_mapping(metric_key, payload)
        _ensure_formulas()
        with engine.begin() as conn:
            conn.execute(delete(formula_table).where(formula_table.c.metric_key == metric_key))
        return next(item for item in list_financial_mappings() if item['metric_key'] == metric_key)
    formulas = _read_formulas()
    definition = _validate_formula_definition(metric_key, payload, formulas)
    with engine.begin() as conn:
        exists = conn.execute(select(formula_table.c.id).where(formula_table.c.metric_key == metric_key)).first()
        if exists:
            conn.execute(update(formula_table).where(formula_table.c.metric_key == metric_key)
                         .values(definition=definition, updated_at=func.now()))
        else:
            conn.execute(insert(formula_table).values(metric_key=metric_key, definition=definition))
    return next(item for item in list_financial_mappings() if item['metric_key'] == metric_key)


def delete_financial_mapping(metric_key):
    result = _legacy_delete_financial_mapping(metric_key)
    _ensure_formulas()
    with engine.begin() as conn:
        conn.execute(delete(formula_table).where(formula_table.c.metric_key == metric_key))
    return result


def _evaluate_ast(tree, bindings):
    def walk(node):
        if isinstance(node, ast.Expression): return walk(node.body)
        if isinstance(node, ast.Constant): return Decimal(str(node.value))
        if isinstance(node, ast.Name): return bindings[node.id]
        if isinstance(node, ast.UnaryOp):
            v = walk(node.operand)
            return +v if isinstance(node.op, ast.UAdd) else -v
        if isinstance(node, ast.BinOp):
            l, r = walk(node.left), walk(node.right)
            if isinstance(node.op, ast.Add): result = l + r
            elif isinstance(node.op, ast.Sub): result = l - r
            elif isinstance(node.op, ast.Mult): result = l * r
            elif isinstance(node.op, ast.Div):
                if r == 0: raise ZeroDivisionError()
                result = l / r
            else: raise ValueError('Operator formula tidak didukung.')
            if not result.is_finite() or abs(result) > MAX_ABS_VALUE:
                raise ArithmeticError('Hasil formula melebihi batas perhitungan.')
            return result
        raise ValueError('Ekspresi formula tidak valid.')
    return walk(tree)


def get_financial_performance(bank_id: str, period: str, formula_overrides=None):
    # Existing direct mapping behavior, including its period validation and
    # treatment of incomplete/ambiguous sources, remains unchanged.
    result = _legacy_get_financial_performance(bank_id, period)
    formulas = {**_read_formulas(), **(formula_overrides or {})}
    if not formulas: return result
    direct_results = {item['metric_key']:item for item in result['metrics']}
    direct_mappings = _read_mappings()
    periods = _reference_periods(period)
    catalog = {x['table_name']:{c['name']:c for c in x['columns']} for x in get_source_catalog()}
    cache = {}

    def resolve(key, index, stack=()):
        token=(key,index)
        if token in cache:return cache[token]
        if key in stack:
            return {'value':None,'status':'circular_dependency','trace':[]}
        definition = formulas.get(key)
        if not definition:
            value = direct_results.get(key, {}).get('values', [None]*3)[index]
            status = direct_results.get(key, {}).get('period_status', ['unmapped']*3)[index]
            return {'value':value,'status':status,'trace':[]}
        refs = set()
        try:
            tree, refs = _compile_formula(definition['expression'],
                                          {c['symbol'] for c in definition['components']})
        except ValueError:
            return {'value':None,'status':'invalid_formula','trace':[]}
        bindings, trace = {}, []
        for component in definition['components']:
            symbol = component['symbol']
            table_columns = catalog.get(component['table_name'], {})
            valid = (component['value_column'] in table_columns
                     and table_columns[component['value_column']]['is_numeric']
                     and not table_columns[component['value_column']]['masked']
                     and (not component.get('account_column') or component['account_column'] in table_columns))
            if not valid:
                info={'value':None,'status':'invalid_source','rows':0}
            else:
                try:
                    with engine.connect() as conn:
                        if engine.dialect.name=='postgresql':
                            conn.execute(text("SET LOCAL statement_timeout = '5s'"))
                        val, state, rows=_read_period_value(conn, component, bank_id,
                                                             periods[index][0], periods[index][1])
                    info={'value':val,'status':state,'rows':rows}
                except Exception:
                    info={'value':None,'status':'source_error','rows':0}
            trace.append({'symbol':symbol,'type':'source','table_name':component['table_name'],
                          'value_column':component['value_column'], 'account_column':component.get('account_column'),
                          'account_value':component.get('account_value'), 'aggregation':component['aggregation'],
                          **info})
            if info['value'] is None:
                answer={'value':None,'status':'component_'+info['status'],'trace':trace}
                cache[token]=answer
                return answer
            bindings[symbol]=Decimal(str(info['value']))
        for dependency in sorted(refs):
            info=resolve(dependency,index,stack+(key,))
            trace.append({'symbol':'metric_'+dependency,'type':'metric','metric_key':dependency,
                          'value':info['value'],'status':info['status']})
            if info['value'] is None:
                answer={'value':None,'status':'dependency_'+info['status'],'trace':trace}
                cache[token]=answer
                return answer
            bindings['metric_'+dependency]=Decimal(str(info['value']))
        try:
            value=float(round(_evaluate_ast(tree,bindings),4))
            answer={'value':value,'status':'ok','trace':trace}
        except ZeroDivisionError:
            answer={'value':None,'status':'division_by_zero','trace':trace}
        except (ArithmeticError, OverflowError, ValueError, KeyError, InvalidOperation):
            answer={'value':None,'status':'formula_error','trace':trace}
        cache[token]=answer
        return answer

    for item in result['metrics']:
        key=item['metric_key']
        if key not in formulas:
            if key in direct_mappings:
                item['mapping']={'mode':'direct',**direct_mappings[key]}
            continue
        series=[resolve(key,index) for index in range(3)]
        values=[part['value'] for part in series]
        statuses=[part['status'] for part in series]
        item.update({
            'values':values,
            'period_status':statuses,
            'status':'ok' if all(s=='ok' for s in statuses) else 'partial',
            'mapping':{'mode':'formula',**formulas[key]},
            'formula_trace':[part['trace'] for part in series],
            'ytd':_growth(values[2],values[0],item['kind']=='ratio'),
            'mom':_growth(values[2],values[1],item['kind']=='ratio'),
        })
    result['mapped_count']=len(set(direct_mappings)|set(formulas))
    return result


def preview_financial_formula(bank_id: str, period: str, metric_key: str, payload: dict):
    # This preview does not persist mapping or mutate warehouse data.
    existing = _read_formulas()
    definition = _validate_formula_definition(metric_key, payload, existing)
    results = get_financial_performance(
        bank_id, period, formula_overrides={metric_key: definition}
    )
    selected = next(item for item in results['metrics'] if item['metric_key'] == metric_key)
    return {'metric': selected, 'reference_periods': results['reference_periods'],
            'saved': False, 'note': 'Preview hanya membaca data dan tidak menyimpan formula.'}

# ============================================================
# 7A.2.2.7 — OPS calculated-source trace and freshness
# ============================================================
# Keep the original 7A.2.1 computation unchanged. Annotate its output with
# lineage/freshness warnings; never turn an unverified value into zero.
_base_financial_performance = get_financial_performance


def _calculated_source_index():
    """Read tracked calculated-column metadata once per performance request."""
    inspector = inspect(engine)
    if not inspector.has_table('warehouse_calculated_columns'):
        return {}
    definitions = Table('warehouse_calculated_columns', MetaData(), autoload_with=engine)
    states = None
    if inspector.has_table('warehouse_calculated_column_state'):
        states = Table('warehouse_calculated_column_state', MetaData(), autoload_with=engine)
    with engine.connect() as conn:
        source_rows = conn.execute(select(
            definitions.c.table_name, definitions.c.column_name, definitions.c.formula,
        )).all()
        status_rows = {}
        if states is not None:
            status_rows = {(r.table_name, r.column_name): r for r in conn.execute(select(
                states.c.table_name, states.c.column_name,
                states.c.is_stale, states.c.reason, states.c.last_calculated_at,
            ))}
    result = {}
    for row in source_rows:
        state_row = status_rows.get((row.table_name, row.column_name))
        result[(row.table_name, row.column_name)] = {
            'formula': row.formula,
            'status': ('stale' if state_row.is_stale else 'current') if state_row else 'unknown',
            'reason': state_row.reason if state_row else 'Status belum terverifikasi.',
            'last_calculated_at': state_row.last_calculated_at.isoformat() if state_row and state_row.last_calculated_at else None,
        }
    return result


def get_financial_performance(bank_id: str, period: str, formula_overrides=None):
    result = _base_financial_performance(bank_id, period, formula_overrides=formula_overrides)
    source_index = _calculated_source_index()
    risk_count = 0
    for metric in result['metrics']:
        mapping = metric.get('mapping') or {}
        if not mapping:
            metric['source_lineage'] = []
            metric['freshness'] = 'unmapped'
            continue
        if mapping.get('mode') == 'formula':
            components = mapping.get('components') or []
            sources = [(c.get('table_name'), c.get('value_column')) for c in components]
        else:
            sources = [(mapping.get('table_name'), mapping.get('value_column'))]
        lineage = []
        for table_name, column_name in sources:
            if not table_name or not column_name:
                continue
            calc = source_index.get((table_name, column_name))
            lineage.append({
                'table_name': table_name, 'column_name': column_name,
                'kind': 'calculated' if calc else 'source',
                'calculation': calc,
            })
        # An OPS formula can also reference other mapped metrics. Those are
        # inspected recursively; an inherited stale source must be surfaced.
        references = set()
        if mapping.get('mode') == 'formula':
            try:
                _, references = _compile_formula(
                    mapping.get('expression'),
                    {c['symbol'] for c in mapping.get('components') or []},
                )
            except ValueError:
                pass
        metric['source_lineage'] = lineage
        metric['metric_dependencies'] = sorted(references)
        metric['freshness'] = 'stale' if any(
            src['calculation'] and src['calculation']['status'] in ('stale', 'unknown')
            for src in lineage
        ) else 'current'
    by_key = {item['metric_key']: item for item in result['metrics']}
    # At most 24 metrics; bounded closure without untrusted execution.
    for _ in range(len(by_key)):
        updated = False
        for metric in result['metrics']:
            if metric.get('freshness') == 'current' and any(
                by_key[ref].get('freshness') in ('stale', 'unmapped')
                for ref in metric.get('metric_dependencies', []) if ref in by_key
            ):
                metric['freshness'] = 'stale'
                updated = True
        if not updated:
            break
    risk_count = sum(m.get('freshness') == 'stale' for m in result['metrics'])
    result['stale_metric_count'] = risk_count
    result['note_freshness'] = (
        'Stale berlaku pada keseluruhan calculated column dalam tabel, '
        'bukan hanya satu bank/periode. Gunakan Refresh di Data Tables.'
    )
    return result
