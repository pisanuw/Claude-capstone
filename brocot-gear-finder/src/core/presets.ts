import type { Limits } from './search';

export interface Preset {
  id: string;
  name: string;
  /** Reduction: input turns per one output turn, as an expression. */
  target: string;
  note: string;
  limits?: Partial<Limits>;
}

export const DEFAULT_LIMITS: Limits = { minTeeth: 8, maxTeeth: 120, maxStages: 3 };

export const PRESETS: Preset[] = [
  {
    id: 'hour',
    name: 'Clock: hour hand from minute hand',
    target: '12',
    note: 'Motion work. 12 is exact in one stage, but the minute and hour hands share an axis, so real clocks use two stages (e.g. 10:30 then 8:32).',
  },
  {
    id: 'day-motor',
    name: 'Clock: 24-hour dial from a 1 rpm motor',
    target: '24*60',
    note: '1440 = 2⁵ · 3² · 5, so it factors exactly into three stages within 8 to 120 teeth.',
  },
  {
    id: 'minute',
    name: 'Clock: minute hand from a seconds escape wheel',
    target: '60',
    note: 'A seconds pendulum turns a 30-tooth escape wheel once a minute; the minute hand needs 60 of those turns.',
  },
  {
    id: 'sidereal',
    name: 'Astronomical: sidereal from solar time',
    target: '365.2422/366.2422',
    note: "Brocot's showcase. The ratio is irrational in practice, so every train is an approximation; watch the error in seconds per day.",
  },
  {
    id: 'moon',
    name: 'Moon-phase dial from a 24 h wheel',
    target: '29.530589',
    note: 'One synodic month in days. The common 59-tooth moon disc driven twice a day is off by about 0.03 days a month.',
  },
  {
    id: 'year',
    name: 'Orrery: Earth year from a daily wheel',
    target: '365.2422',
    note: 'Tropical year in days. Every convergent has a prime factor above 120, so no train is exact; the search finds three-stage near misses.',
  },
  {
    id: 'venus',
    name: 'Orrery: Venus arm from Earth arm',
    target: '224.701/365.256',
    note: 'Below 1: the output (Venus) turns faster than the input (Earth), so the train steps up.',
  },
  {
    id: 'pi',
    name: 'Curiosity: a train that turns π times slower',
    target: '3.14159265358979',
    note: '355/113 is the famous convergent. 113 is prime, so it needs a 113-tooth wheel: in range here, gone if you cap the teeth at 110.',
  },
  {
    id: 'bike',
    name: 'Bicycle: 44 × 16 crank to wheel',
    target: '16/44',
    note: 'One stage with real cog sizes (11 to 53 teeth): the wheel turns 2.75 times per crank turn. 44 × 16 and 33 × 12 give the same ratio; the search lists the smaller pair.',
    limits: { minTeeth: 11, maxTeeth: 53, maxStages: 1 },
  },
];
