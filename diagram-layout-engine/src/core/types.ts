// Shared types for the flowchart model, the layout result and layout options.

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';

export type NodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'doublecircle'
  | 'asymmetric'
  | 'diamond'
  | 'hexagon'
  | 'parallelogram'
  | 'parallelogram-alt'
  | 'trapezoid'
  | 'trapezoid-alt';

export type LineStyle = 'solid' | 'thick' | 'dotted' | 'invisible';
export type ArrowHead = 'none' | 'arrow' | 'circle' | 'cross';

export interface SourcePos {
  line: number;
  col: number;
  offset: number;
}

export type StyleMap = Record<string, string>;

export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
  classes: string[];
  style: StyleMap;
  /** Id of the innermost subgraph that owns the node, or null at top level. */
  parent: string | null;
  pos: SourcePos;
}

export interface FlowEdge {
  id: string;
  /** Node id or subgraph id. */
  from: string;
  to: string;
  label: string;
  line: LineStyle;
  head: ArrowHead;
  tail: ArrowHead;
  /** Minimum number of layers the edge spans (longer links in the source). */
  minlen: number;
  style: StyleMap;
  pos: SourcePos;
}

export interface FlowSubgraph {
  id: string;
  title: string;
  direction: Direction | null;
  parent: string | null;
  classes: string[];
  style: StyleMap;
  pos: SourcePos;
}

export interface Warning {
  line: number;
  col: number;
  message: string;
}

export interface Flowchart {
  direction: Direction;
  /** Insertion order is the order nodes first appear in the source. */
  nodes: Map<string, FlowNode>;
  edges: FlowEdge[];
  subgraphs: Map<string, FlowSubgraph>;
  classDefs: Map<string, StyleMap>;
  warnings: Warning[];
}

// ---------------------------------------------------------------- options

export type CycleMethod = 'greedy' | 'dfs';
export type RankMethod = 'longest-path' | 'network-simplex';
export type OrderMethod = 'barycenter' | 'median';
export type PositionMethod = 'brandes-kopf' | 'priority';
export type RouteMethod = 'spline' | 'polyline' | 'orthogonal';

export interface LayoutOptions {
  cycle: CycleMethod;
  rank: RankMethod;
  order: OrderMethod;
  transpose: boolean;
  /** Maximum number of down+up sweep pairs during crossing minimization. */
  sweeps: number;
  position: PositionMethod;
  route: RouteMethod;
  nodeSep: number;
  rankSep: number;
  edgeSep: number;
  /** Override the direction given in the source. */
  direction: Direction | null;
  /** Record intermediate stages of the top-level layout for the inspector. */
  record: boolean;
}

export const DEFAULT_OPTIONS: LayoutOptions = {
  cycle: 'greedy',
  rank: 'network-simplex',
  order: 'barycenter',
  transpose: true,
  sweeps: 12,
  position: 'brandes-kopf',
  route: 'spline',
  nodeSep: 40,
  rankSep: 56,
  edgeSep: 16,
  direction: null,
  record: false,
};

// ---------------------------------------------------------------- result

export interface Point {
  x: number;
  y: number;
}

export interface LaidOutNode {
  id: string;
  label: string;
  lines: string[];
  shape: NodeShape;
  /** Centre in diagram coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  classes: string[];
  style: StyleMap;
  rank: number;
  order: number;
  parent: string | null;
}

export interface LaidOutEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  lines: string[];
  line: LineStyle;
  head: ArrowHead;
  tail: ArrowHead;
  /** Polyline the path is built from: first and last points sit on node borders. */
  points: Point[];
  /** SVG path data for the routed edge. */
  path: string;
  labelPos: Point | null;
  labelWidth: number;
  labelHeight: number;
  style: StyleMap;
  reversed: boolean;
  selfLoop: boolean;
}

export interface LaidOutCluster {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: Direction;
  depth: number;
  classes: string[];
  style: StyleMap;
  /** Where the title sits along the top edge, chosen so edges do not cross it. */
  titleAnchor: 'start' | 'middle' | 'end';
}

export interface LayoutStats {
  nodes: number;
  edges: number;
  layers: number;
  dummies: number;
  reversed: number;
  crossings: number;
  /** Bounding box area in px^2. */
  area: number;
  edgeLength: number;
  bends: number;
  ms: number;
}

export interface OrderSnapshot {
  label: string;
  layers: string[][];
  crossings: number;
}

/** Intermediate data from the top-level scope, kept for the pipeline inspector. */
export interface StageRecord {
  direction: Direction;
  nodes: { id: string; label: string; dummy: boolean; cluster: boolean; width: number; height: number }[];
  /** Edges of the layer graph before normalization, after cycle removal. */
  edges: { id: string; v: string; w: string; reversed: boolean }[];
  /** Ranks straight after the layering step. */
  ranks: Record<string, number>;
  /** Ranks a longest-path layering would have produced, for comparison. */
  longestPathRanks: Record<string, number>;
  /** Edges of the normalized (proper) layer graph. */
  properEdges: { v: string; w: string; edge: string }[];
  orders: OrderSnapshot[];
  bestOrder: number;
  positions: Record<string, Point>;
}

export interface Layout {
  direction: Direction;
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  clusters: LaidOutCluster[];
  stats: LayoutStats;
  stages: StageRecord | null;
}
