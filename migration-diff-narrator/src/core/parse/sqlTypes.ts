import type { TypeFamily } from '../types.js';

const EXACT: Record<string, TypeFamily> = {
  int: 'integer',
  int2: 'integer',
  int4: 'integer',
  int8: 'integer',
  integer: 'integer',
  smallint: 'integer',
  bigint: 'integer',
  tinyint: 'integer',
  mediumint: 'integer',
  serial: 'integer',
  smallserial: 'integer',
  bigserial: 'integer',
  year: 'integer',

  decimal: 'decimal',
  numeric: 'decimal',
  money: 'decimal',
  smallmoney: 'decimal',

  float: 'float',
  float4: 'float',
  float8: 'float',
  real: 'float',
  double: 'float',
  'double precision': 'float',

  bool: 'boolean',
  boolean: 'boolean',

  date: 'date',
  time: 'time',
  timetz: 'time',
  'time with time zone': 'time',
  'time without time zone': 'time',

  datetime: 'datetime',
  datetime2: 'datetime',
  smalldatetime: 'datetime',
  timestamp: 'datetime',
  timestamptz: 'datetime',
  'timestamp with time zone': 'datetime',
  'timestamp without time zone': 'datetime',

  uuid: 'uuid',
  uniqueidentifier: 'uuid',

  json: 'json',
  jsonb: 'json',

  bytea: 'binary',
  blob: 'binary',
  binary: 'binary',
  varbinary: 'binary',
  image: 'binary',

  char: 'string',
  bpchar: 'string',
  nchar: 'string',
  varchar: 'string',
  varchar2: 'string',
  nvarchar: 'string',
  'character varying': 'string',
  character: 'string',
  text: 'string',
  ntext: 'string',
  citext: 'string',
  clob: 'string',
  string: 'string',

  enum: 'enum',
};

/**
 * Width rank inside the integer family, so the diff can tell INT -> BIGINT
 * (widening, safe) from BIGINT -> INT (narrowing, breaking).
 */
const INT_RANK: Record<string, number> = {
  tinyint: 1,
  int2: 2,
  smallint: 2,
  smallserial: 2,
  year: 2,
  mediumint: 3,
  int: 3,
  int4: 3,
  integer: 3,
  serial: 3,
  int8: 4,
  bigint: 4,
  bigserial: 4,
};

/** Maps a dialect type name (already stripped of its length tail) onto the IR family. */
export function normalizeSqlType(name: string): TypeFamily {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const exact = EXACT[key];
  if (exact) return exact;

  const head = key.split(' ')[0];
  const byHead = EXACT[head];
  if (byHead) return byHead;

  if (key.includes('char') || key.includes('text')) return 'string';
  if (key.includes('int')) return 'integer';
  return 'unknown';
}

export function sqlIntRank(name: string): number | undefined {
  const head = name.trim().toLowerCase().split(/[\s(]/)[0];
  return INT_RANK[head];
}

/** Types written as several words; matched before the single-word path. */
export const MULTIWORD_TYPES = [
  'timestamp with time zone',
  'timestamp without time zone',
  'time with time zone',
  'time without time zone',
  'double precision',
  'character varying',
  'bit varying',
  'unsigned big int',
];
