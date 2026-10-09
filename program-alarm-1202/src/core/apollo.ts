// The real Apollo 11 descent, for the "Apollo 11" tab. Times are ground
// elapsed time (GET) and are approximate to a few seconds; wording follows
// the public NASA air-to-ground transcript as presented in the Apollo Lunar
// Surface Journal (https://www.nasa.gov/history/alsj/a11/a11.landing.html).

export interface TimelineEntry {
  get: string;
  who: string;
  text: string;
  /** Which alarm, if this line reports one. */
  alarm?: 1201 | 1202;
  note: string;
}

export const APOLLO_11_TIMELINE: readonly TimelineEntry[] = [
  {
    get: '102:33:05',
    who: 'Event',
    text: 'Powered descent initiation.',
    note: 'The descent engine lights. The rendezvous radar switch is in a position that makes its resolver interface keep interrupting the computer to count pulses, quietly stealing roughly 13% of its cycles.',
  },
  {
    get: '102:38:22',
    who: 'Armstrong',
    text: 'Program alarm.',
    note: 'The Executive could not find a free core set for a new job: the computer is overloaded.',
  },
  {
    get: '102:38:26',
    who: 'Armstrong',
    text: "It's a 1202.",
    alarm: 1202,
    note: '1202 means "Executive overflow, no core sets". BAILOUT restarts the software and re-establishes only the restart-protected jobs, so guidance carries on.',
  },
  {
    get: '102:38:53',
    who: 'Armstrong',
    text: 'Give us a reading on the 1202 Program Alarm.',
    note: 'In Mission Control, guidance officer Steve Bales and backroom engineer Jack Garman had rehearsed this alarm and judged it safe as long as it did not recur continuously.',
  },
  {
    get: '102:39:14',
    who: 'Duke (CAPCOM)',
    text: "We're Go on that alarm.",
    note: 'The call that let the landing continue.',
  },
  {
    get: '102:42:17',
    who: 'Aldrin',
    text: 'Program alarm. 1201.',
    alarm: 1201,
    note: '1201 is the sibling alarm: "Executive overflow, no VAC areas". Same cause, different resource running out first.',
  },
  {
    get: '102:42:25',
    who: 'Duke (CAPCOM)',
    text: "We're Go. Same type. We're Go.",
    note: 'Further 1202s follow in the next minute; each restart sheds the low-priority display work and guidance keeps flying.',
  },
  {
    get: '102:45:40',
    who: 'Aldrin',
    text: 'Contact light.',
    note: 'Touchdown, with the computer having restarted itself several times on the way down.',
  },
  {
    get: '102:45:58',
    who: 'Armstrong',
    text: 'Houston, Tranquility Base here. The Eagle has landed.',
    note: 'Margaret Hamilton led the MIT Instrumentation Lab team that wrote the on-board flight software, including the priority scheduling and restart design this page models.',
  },
];
