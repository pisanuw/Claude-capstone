// Bundled examples for the editor and the diff view. Each one exercises a
// different part of the engine.

export interface Example {
  id: string;
  title: string;
  blurb: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'ci',
    title: 'CI/CD pipeline',
    blurb: 'Left-to-right flow with a parallel test fan-out, a thick happy path and a dotted rollback.',
    source: `flowchart LR
  push([git push]) --> lint[Lint] & unit[Unit tests] & types[Typecheck]
  lint & unit & types --> build[[Build image]]
  build --> scan{Security scan}
  scan -- clean --> stage[(Staging)]
  scan -- CVE found --> fail>Block release]
  stage ==> e2e[E2E suite] ==> prod[(Production)]
  e2e -. flaky .-> stage
  prod -.->|health check fails| rollback[Roll back]
  rollback --> stage
  classDef ok fill:#dcfce7,stroke:#16a34a
  classDef bad fill:#fee2e2,stroke:#dc2626
  class prod ok
  class fail,rollback bad
`,
  },
  {
    id: 'login',
    title: 'Login with retries',
    blurb: 'Decision diamonds and two cycles (retry and MFA) that cycle removal has to break.',
    source: `flowchart TD
  start((Start)) --> form[/Enter email and password/]
  form --> check{Credentials valid?}
  check -- no --> count{Attempts < 5?}
  count -- yes --> form
  count -- no --> lock[Lock account for 15 min]
  lock --> notify[Email the owner]
  check -- yes --> mfa{MFA enabled?}
  mfa -- no --> session[Create session]
  mfa -- yes --> code[/Enter 6-digit code/]
  code --> verify{Code correct?}
  verify -- no --> code
  verify -- yes --> session
  session --> home([Dashboard])
`,
  },
  {
    id: 'services',
    title: 'Microservices',
    blurb: 'Nested subgraphs with their own directions; edges cross subgraph borders.',
    source: `flowchart TB
  user((User)) --> cdn[CDN]
  subgraph edge [Edge]
    direction LR
    cdn --> waf[WAF] --> lb[Load balancer]
  end
  subgraph app [Application tier]
    direction TB
    api[API gateway]
    subgraph svc [Services]
      direction LR
      auth[Auth] ~~~ orders[Orders] ~~~ catalog[Catalog]
    end
    api --> auth & orders & catalog
  end
  subgraph data [Data]
    direction LR
    pg[(Postgres)] ~~~ redis[(Redis)] ~~~ s3[(Object store)]
  end
  lb --> api
  auth --> redis
  orders --> pg
  catalog --> pg & s3
  orders -.->|events| queue[[Event bus]]
  queue -.-> catalog
`,
  },
  {
    id: 'compiler',
    title: 'Compiler pipeline',
    blurb: 'A left-to-right pipeline whose middle-end subgraph runs top-to-bottom.',
    source: `flowchart LR
  src[/source.c/] --> lex[Lexer] --> parse[Parser] --> ast[(AST)]
  subgraph middle [Middle end]
    direction TB
    ssa[SSA construction] --> opt1[Constant folding]
    opt1 --> opt2[Dead code elimination]
    opt2 --> opt3[Loop invariant motion]
    opt3 -->|fixed point?| opt1
  end
  ast --> sema{Type check} -- ok --> ssa
  sema -- error --> diag>Diagnostics]
  opt3 --> isel[Instruction selection] --> ra[Register allocation] --> asm[/a.out/]
`,
  },
  {
    id: 'tcp',
    title: 'TCP state machine',
    blurb: 'A dense cyclic graph with many labelled transitions and a self-loop.',
    source: `flowchart TD
  CLOSED((CLOSED)) -->|passive open| LISTEN
  CLOSED -->|active open / SYN| SYN_SENT
  LISTEN -->|SYN / SYN+ACK| SYN_RCVD
  LISTEN -->|send / SYN| SYN_SENT
  SYN_SENT -->|SYN / SYN+ACK| SYN_RCVD
  SYN_SENT -->|SYN+ACK / ACK| ESTABLISHED
  SYN_RCVD -->|ACK| ESTABLISHED
  ESTABLISHED -->|data| ESTABLISHED
  ESTABLISHED -->|close / FIN| FIN_WAIT_1
  ESTABLISHED -->|FIN / ACK| CLOSE_WAIT
  FIN_WAIT_1 -->|ACK| FIN_WAIT_2
  FIN_WAIT_1 -->|FIN / ACK| CLOSING
  FIN_WAIT_2 -->|FIN / ACK| TIME_WAIT
  CLOSING -->|ACK| TIME_WAIT
  CLOSE_WAIT -->|close / FIN| LAST_ACK
  LAST_ACK -->|ACK| CLOSED
  TIME_WAIT -->|2 MSL timeout| CLOSED
`,
  },
  {
    id: 'curriculum',
    title: 'CS prerequisites',
    blurb: 'A DAG with long edges: watch the dummy nodes and how layering changes edge length.',
    source: `flowchart TD
  cs1[CS1: Programming] --> cs2[CS2: Data structures]
  disc[Discrete math] --> algo[Algorithms]
  cs2 --> algo
  cs2 --> sys[Computer systems]
  cs1 --> web[Web development]
  sys --> os[Operating systems]
  sys --> net[Networks]
  sys --> comp[Compilers]
  algo --> comp
  algo --> ai[Artificial intelligence]
  stats[Statistics] --> ml[Machine learning]
  ai --> ml
  linalg[Linear algebra] --> ml
  linalg --> gfx[Graphics]
  cs2 --> gfx
  os --> dist[Distributed systems]
  net --> dist
  web --> sec[Security]
  net --> sec
  os --> sec
  disc --> crypto[Cryptography]
  crypto --> sec
  ml --> cap([Capstone])
  dist --> cap
  sec --> cap
  gfx --> cap
`,
  },
  {
    id: 'git',
    title: 'Release branching',
    blurb: 'Parallel edges, thick merges and a hotfix loop, drawn right-to-left.',
    source: `flowchart RL
  main1[main] ==> dev1[develop]
  dev1 --> feat1[feature/login]
  dev1 --> feat2[feature/search]
  feat1 -->|PR #41| dev2[develop]
  feat2 -->|PR #42| dev2
  dev2 --> rel[release/2.0]
  rel -->|bugfix| rel
  rel ==>|merge| main2[main v2.0]
  rel -->|back-merge| dev3[develop]
  main2 --> hot[hotfix/2.0.1]
  hot ==> main3[main v2.0.1]
  hot --> dev3
`,
  },
  {
    id: 'shapes',
    title: 'Shape gallery',
    blurb: 'Every node shape and link style the parser understands.',
    source: `flowchart LR
  a[Rectangle] --> b(Rounded) --> c([Stadium]) --> d[[Subroutine]]
  e[(Database)] --- f((Circle)) --- g(((Double circle))) --- h>Flag]
  i{Diamond} -.-> j{{Hexagon}} -.-> k[/Parallelogram/] -.-> l[\\Alt parallelogram\\]
  m[/Trapezoid\\] ==> n[\\Alt trapezoid/] ==> o["Quoted: (parens) & #quot;quotes#quot;"]
  p[Line<br>break] --o q[Circle head] --x r[Cross head] <--> s[Both ways]
  t[Long link] ---> u[Two layers later]
`,
  },
  {
    id: 'orders',
    title: 'Order fulfilment',
    blurb: 'classDef, class, ::: and style statements, with linkStyle on a few edges.',
    source: `flowchart TD
  order([Order placed]):::event --> pay{Payment authorised?}
  pay -- no --> cancel[Cancel order]:::bad
  pay -- yes --> stock{In stock?}
  stock -- yes --> pick[Pick & pack]
  stock -- no --> back[Backorder]:::warn
  back -->|restocked| pick
  pick --> ship[Ship with carrier]
  ship --> track[[Tracking updates]]
  track --> done([Delivered]):::event
  ship -.->|lost in transit| refund[Refund]:::bad
  classDef event fill:#e0e7ff,stroke:#4338ca,stroke-width:2px,font-weight:bold
  classDef bad fill:#fee2e2,stroke:#b91c1c
  classDef warn fill:#fef3c7,stroke:#b45309
  style ship stroke-dasharray:5 3
  linkStyle 1,9 stroke:#b91c1c,stroke-width:2px
`,
  },
  {
    id: 'sugiyama',
    title: 'This engine',
    blurb: 'The layout pipeline drawn by itself, with the stages grouped into subgraphs.',
    source: `flowchart TD
  text[/Mermaid text/] --> parser[Recursive-descent parser]
  parser -->|line and column| err>Parse error]
  parser --> chart[(Flowchart AST)]
  subgraph sugiyama [Layered layout, per subgraph]
    direction TB
    cyc[1. Cycle removal: greedy FAS] --> rank[2. Layering: network simplex]
    rank --> norm[3. Dummy nodes for long edges]
    norm --> ord[4. Crossing minimisation: barycenter + transpose]
    ord --> pos[5. Coordinates: Brandes-Koepf]
  end
  chart --> cyc
  pos --> route[Edge routing: spline, polyline, orthogonal]
  route --> svg[[Themeable SVG]]
  svg --> diff{Diff two versions?}
  diff -- yes --> union[Union layout, stable positions]
  diff -- no --> out([Export SVG / PNG])
  union --> out
`,
  },
];

export interface DiffExample {
  id: string;
  title: string;
  before: string;
  after: string;
}

export const DIFF_EXAMPLES: DiffExample[] = [
  {
    id: 'checkout',
    title: 'Checkout: add fraud check, drop coupons',
    before: `flowchart TD
  cart[Cart] --> coupon{Coupon?}
  coupon -- yes --> apply[Apply discount]
  coupon -- no --> pay[Payment]
  apply --> pay
  pay --> ok{Authorised?}
  ok -- yes --> confirm([Confirmation])
  ok -- no --> retry[Retry payment]
  retry --> pay
`,
    after: `flowchart TD
  cart[Cart] --> pay[Payment]
  pay --> fraud{Fraud score high?}
  fraud -- yes --> review[Manual review]
  fraud -- no --> ok{Authorised?}
  review --> ok
  ok -- yes --> confirm([Order confirmed])
  ok -- no --> retry[Retry payment]
  retry --> pay
`,
  },
  {
    id: 'arch',
    title: 'Architecture: split the monolith',
    before: `flowchart LR
  web[Web app] --> mono[Monolith]
  mobile[Mobile app] --> mono
  subgraph data [Data]
    db[(Postgres)]
  end
  mono --> db
  mono --> mail[Email provider]
`,
    after: `flowchart LR
  web[Web app] --> gw[API gateway]
  mobile[Mobile app] --> gw
  gw --> users[Users service]
  gw --> orders[Orders service]
  subgraph data [Data]
    db[(Postgres)]
    cache[(Redis)]
  end
  users --> db
  orders --> db
  orders --> cache
  orders -.->|async| mail[Email provider]
`,
  },
];
