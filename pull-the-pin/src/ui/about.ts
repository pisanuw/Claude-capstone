import { CATALOG } from '../core/faults';
import { NET_COUNT, PIN_COUNT } from '../core/netlist';
import { el } from './dom';

export function aboutView(): HTMLElement {
  const p = (t: string) => el('p', {}, t);
  return el(
    'section',
    { class: 'view about card prose' },
    el('h2', {}, 'The machine'),
    p(`A Ben Eater style SAP-1: an 8-bit bus with pull-down resistors, a 4-bit program counter and memory address register, 16 bytes of RAM, an instruction register, A and B registers, an adder/subtractor, a flags register, an output register and a microcode ROM that drives 16 control lines. Every instruction takes five clock cycles: two to fetch, three to execute. Each module is one idealized chip package with ${PIN_COUNT} pins in total, joined by ${NET_COUNT} nets.`),
    p('Each cycle settles in dependency order (register outputs, the control ROM, the ALU, the bus drivers) and then the clock edge latches every register whose load line is high. Values are 0, 1 or Z (floating). Two drivers on one net resolve to the wired-AND, because a low TTL output wins, and the sandbox flags it as bus contention. A floating TTL input reads high, and the control inputs here are active-high, so a floating control pin asserts its line.'),
    el('h2', {}, 'What can break'),
    el(
      'ul',
      {},
      el('li', {}, el('strong', {}, 'Stuck net: '), 'held at 0 or 1 whatever drives it.'),
      el('li', {}, el('strong', {}, 'Open pin: '), 'the leg is lifted. An output no longer reaches its net (probe the pin and you still see the chip driving it); an input floats high.'),
      el('li', {}, el('strong', {}, 'Shorted bus lines: '), 'two adjacent bus lines bridged; both read the wired-AND.'),
      el('li', {}, el('strong', {}, 'Control ROM bit flip: '), 'one bit of one microcode word, addressed by opcode, step and the two flags.'),
      el('li', {}, el('strong', {}, 'Dead chip: '), 'no power: its outputs float and it latches nothing. A dead clock never ticks.'),
    ),
    p(`That is ${CATALOG.length} single faults. Challenges only use faults that make at least one test program show a wrong display, so there is always a symptom to start from.`),
    el('h2', {}, 'Diagnosis by elimination'),
    p('Running a program is free and shows the output display. Capturing one signal on the logic analyzer for one run costs a probe. The consistent-fault view simulates every catalog fault on every program you run (in a background worker), hashes each signal\'s waveform, and keeps only the faults whose hashes match everything you have seen. Groups are sets of faults that no probe of the programs you ran can tell apart; some faults are only separable by a new test program, which is the point: diagnosis needs tests that exercise the suspect path.'),
    p('"Suggest a next probe" picks the program and signal that minimize the expected number of faults left, treating each remaining fault as equally likely. It only ever reasons from the faults that fit your observations, so it never knows more than you have measured. It replaces the optional LLM tutor in the original idea with something deterministic.'),
    p('An answer counts if it is the injected fault, or if it behaves identically on every signal of every test program, since nothing the tool offers could have told them apart.'),
    el('h2', {}, 'Limits'),
    el(
      'ul',
      {},
      el('li', {}, 'Modules are single idealized packages, not the real 74LS parts with their pin numbers, and timing is cycle-level: no propagation delays, glitches or analog levels.'),
      el('li', {}, 'Only single faults. Real boards can have several.'),
      el('li', {}, 'Attempt logs live in the browser that made them; there is no server or class roster. Challenge links are obfuscated, not secret.'),
    ),
  );
}
