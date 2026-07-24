/**
 * Curated word <-> emoji dictionary.
 *
 * Deliberately hand-picked rather than generated from the full Unicode data:
 * we want the *common* sense of a word to win (e.g. "star" -> star, not
 * "star-struck"), and we want reverse lookups to produce a natural gloss.
 *
 * Keys are lowercase single words. Multi-word phrases are supported and are
 * matched before single words (see translate.ts).
 */
export const WORD_TO_EMOJI: Record<string, string> = {
  // people and relationships
  i: '👤', me: '👤', you: '👉', we: '👥', they: '👥', people: '👥',
  person: '🧑', man: '👨', woman: '👩', boy: '👦', girl: '👧',
  baby: '👶', child: '🧒', family: '👨‍👩‍👧', friend: '🤝', friends: '🤝',
  king: '🤴', queen: '👸', doctor: '🧑‍⚕️', teacher: '🧑‍🏫', student: '🧑‍🎓',
  police: '👮', chef: '🧑‍🍳', baby_girl: '👶',

  // feelings
  love: '❤️', like: '👍', happy: '😀', happiness: '😀', joy: '😄',
  sad: '😢', crying: '😭', cry: '😭', angry: '😠', anger: '😠',
  laugh: '😂', laughing: '😂', smile: '🙂', tired: '😴', sleepy: '😴',
  scared: '😱', afraid: '😱', surprised: '😲', confused: '😕',
  cool: '😎', sick: '🤒', bored: '🥱', excited: '🤩', hug: '🤗',
  kiss: '😘', think: '🤔', thinking: '🤔', hope: '🤞', pray: '🙏',
  thanks: '🙏', please: '🙏', sorry: '🙇', celebrate: '🎉', party: '🎉',

  // animals
  cat: '🐱', cats: '🐱', dog: '🐶', dogs: '🐶', bird: '🐦', fish: '🐟',
  horse: '🐴', cow: '🐮', pig: '🐷', sheep: '🐑', mouse: '🐭',
  rabbit: '🐰', bear: '🐻', lion: '🦁', tiger: '🐯', monkey: '🐵',
  elephant: '🐘', snake: '🐍', frog: '🐸', turtle: '🐢', bee: '🐝',
  butterfly: '🦋', spider: '🕷️', whale: '🐳', dolphin: '🐬', penguin: '🐧',
  chicken: '🐔', duck: '🦆', owl: '🦉', fox: '🦊', wolf: '🐺', dragon: '🐉',
  unicorn: '🦄', dinosaur: '🦖',

  // food and drink
  food: '🍽️', eat: '🍽️', eating: '🍽️', hungry: '🍽️', pizza: '🍕',
  burger: '🍔', hamburger: '🍔', fries: '🍟', hotdog: '🌭', taco: '🌮',
  burrito: '🌯', sandwich: '🥪', bread: '🍞', cheese: '🧀', egg: '🥚',
  bacon: '🥓', rice: '🍚', noodles: '🍜', soup: '🍲', salad: '🥗',
  sushi: '🍣', pasta: '🍝', apple: '🍎', banana: '🍌', orange: '🍊',
  grapes: '🍇', strawberry: '🍓', watermelon: '🍉', lemon: '🍋',
  peach: '🍑', cherry: '🍒', carrot: '🥕', corn: '🌽', potato: '🥔',
  tomato: '🍅', mushroom: '🍄', cake: '🍰', cookie: '🍪', candy: '🍬',
  chocolate: '🍫', donut: '🍩', icecream: '🍦', honey: '🍯', popcorn: '🍿',
  coffee: '☕', tea: '🍵', milk: '🥛', water: '💧', juice: '🧃',
  beer: '🍺', wine: '🍷', drink: '🥤', breakfast: '🥞', pancakes: '🥞',

  // nature and weather
  sun: '☀️', sunny: '☀️', moon: '🌙', night: '🌙', star: '⭐', stars: '✨',
  sky: '🌌', cloud: '☁️', cloudy: '☁️', rain: '🌧️', raining: '🌧️',
  snow: '❄️', snowing: '🌨️', storm: '⛈️', lightning: '⚡', wind: '💨',
  rainbow: '🌈', fire: '🔥', hot: '🔥', cold: '🥶', ice: '🧊',
  tree: '🌳', trees: '🌲', flower: '🌸', flowers: '💐', rose: '🌹',
  leaf: '🍃', grass: '🌱', plant: '🌱', mountain: '⛰️', mountains: '🏔️',
  ocean: '🌊', sea: '🌊', wave: '🌊', beach: '🏖️', island: '🏝️',
  desert: '🏜️', forest: '🌲', volcano: '🌋', earth: '🌍', world: '🌍',
  space: '🚀', rocket: '🚀', alien: '👽',

  // places and buildings
  home: '🏠', house: '🏠', building: '🏢', office: '🏢', school: '🏫',
  hospital: '🏥', bank: '🏦', hotel: '🏨', church: '⛪', castle: '🏰',
  store: '🏪', shop: '🏪', city: '🏙️', bridge: '🌉', tent: '⛺',
  farm: '🚜', garden: '🌷',

  // travel and transport
  car: '🚗', bus: '🚌', train: '🚆', plane: '✈️', flight: '✈️',
  fly: '✈️', boat: '⛵', ship: '🚢', bike: '🚲', bicycle: '🚲',
  motorcycle: '🏍️', taxi: '🚕', truck: '🚚', walk: '🚶', walking: '🚶',
  run: '🏃', running: '🏃', travel: '🧳', trip: '🧳', vacation: '🏖️',
  map: '🗺️', road: '🛣️', traffic: '🚦',

  // objects and tech
  phone: '📱', computer: '💻', laptop: '💻', keyboard: '⌨️',
  camera: '📷', tv: '📺', radio: '📻', headphones: '🎧', battery: '🔋',
  light: '💡', idea: '💡', book: '📚', books: '📚', read: '📖',
  reading: '📖', write: '✍️', writing: '✍️', pencil: '✏️', pen: '🖊️',
  paper: '📄', mail: '📧', email: '📧', letter: '✉️', package: '📦',
  money: '💰', cash: '💵', card: '💳', gift: '🎁', present: '🎁',
  key: '🔑', lock: '🔒', clock: '🕐', time: '⏰', calendar: '📅',
  bag: '👜', box: '📦', trash: '🗑️', tools: '🛠️', hammer: '🔨',
  scissors: '✂️', magnet: '🧲', telescope: '🔭', microscope: '🔬',

  // activities
  music: '🎵', song: '🎶', sing: '🎤', singing: '🎤', dance: '💃',
  dancing: '💃', guitar: '🎸', piano: '🎹', drums: '🥁', art: '🎨',
  paint: '🎨', movie: '🎬', film: '🎬', game: '🎮', games: '🎮',
  play: '🎮', sport: '🏅', sports: '🏅', soccer: '⚽', football: '🏈',
  basketball: '🏀', baseball: '⚾', tennis: '🎾', golf: '⛳',
  swimming: '🏊', swim: '🏊', ski: '⛷️', surf: '🏄', climb: '🧗',
  yoga: '🧘', gym: '🏋️', workout: '🏋️', win: '🏆', winner: '🏆',
  medal: '🥇', work: '💼', job: '💼', study: '📚', sleep: '😴',
  shopping: '🛒', cooking: '👨‍🍳', cook: '👨‍🍳', birthday: '🎂',
  wedding: '💒', christmas: '🎄', halloween: '🎃',

  // body
  eye: '👁️', eyes: '👀', see: '👀', look: '👀', watch: '👀',
  ear: '👂', hear: '👂', listen: '👂', nose: '👃', mouth: '👄',
  hand: '✋', hands: '👐', foot: '🦶', leg: '🦵', brain: '🧠',
  heart: '❤️', tooth: '🦷', bone: '🦴', muscle: '💪', strong: '💪',

  // abstract and misc
  yes: '✅', no: '❌', ok: '👌', good: '👍', bad: '👎', great: '🌟',
  new: '🆕', old: '👴', big: '⬆️', small: '⬇️', up: '⬆️', down: '⬇️',
  left: '⬅️', right: '➡️', stop: '🛑', go: '🟢', warning: '⚠️',
  question: '❓', important: '❗', check: '✔️', search: '🔍', find: '🔍',
  help: '🆘', peace: '☮️', magic: '✨', dream: '💭', secret: '🤫',
  fast: '💨', slow: '🐌', clean: '🧼', dirty: '💩', broken: '💔',
  fix: '🔧', build: '🏗️', science: '🔬', math: '🔢', number: '🔢',
  language: '🗣️', talk: '🗣️', speak: '🗣️', say: '💬', chat: '💬',
  message: '💬', news: '📰', flag: '🚩', target: '🎯', dice: '🎲',
  puzzle: '🧩', robot: '🤖', ghost: '👻', skull: '💀', crown: '👑',
  diamond: '💎', bomb: '💣', gun: '🔫', shield: '🛡️', sword: '⚔️',
  door: '🚪', window: '🪟', chair: '🪑', bed: '🛏️', bath: '🛁',
  toilet: '🚽', shower: '🚿', soap: '🧼', umbrella: '☂️', glasses: '👓',
  hat: '🎩', shirt: '👕', pants: '👖', dress: '👗', shoes: '👟',
  socks: '🧦', ring: '💍', bell: '🔔', balloon: '🎈', candle: '🕯️',
};

/** Multi-word phrases, matched before single words. */
export const PHRASE_TO_EMOJI: Record<string, string> = {
  'good morning': '🌅',
  'good night': '🌙',
  'thank you': '🙏',
  'i love you': '👤❤️👉',
  'ice cream': '🍦',
  'hot dog': '🌭',
  'french fries': '🍟',
  'birthday cake': '🎂',
  'high five': '🙌',
  'happy birthday': '🎂🎉',
  'new york': '🗽',
  'sold out': '🚫',
  'be right back': '🏃‍♂️💨',
  'oh no': '😱',
};

/** Reverse map: emoji -> the most natural English word. Built from the two maps
 *  above, with the FIRST key that maps to a given emoji winning (so "love"
 *  beats "heart" for ❤️ only if it appears first; order is curated below). */
function buildReverse(): Record<string, string> {
  const reverse: Record<string, string> = {};
  // Phrases first: a phrase is a better gloss than a single word when unique.
  for (const [phrase, emoji] of Object.entries(PHRASE_TO_EMOJI)) {
    if (!reverse[emoji]) reverse[emoji] = phrase;
  }
  for (const [word, emoji] of Object.entries(WORD_TO_EMOJI)) {
    if (!reverse[emoji]) reverse[emoji] = word;
  }
  return reverse;
}

export const EMOJI_TO_WORD: Record<string, string> = buildReverse();
