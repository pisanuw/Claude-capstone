import type { FieldType } from '../types.js';

const EXACT: Record<string, FieldType> = {
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

/** Maps a dialect type name (already stripped of its length/precision) onto the IR type. */
export function normalizeSqlType(name: string): FieldType {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const exact = EXACT[key];
  if (exact) return exact;

  // Fall back to prefix matching so `varchar2`, `nvarchar2`, `int unsigned`
  // and friends still land somewhere sensible instead of `unknown`.
  const head = key.split(' ')[0];
  const byHead = EXACT[head];
  if (byHead) return byHead;

  if (key.includes('char') || key.includes('text')) return 'string';
  if (key.includes('int')) return 'integer';
  return 'unknown';
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
