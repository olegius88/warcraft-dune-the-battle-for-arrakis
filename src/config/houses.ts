// The three Great Houses: names, codes used in Emperor file/object names, WC3 colours and races.

export type House = 'Atreides' | 'Harkonnen' | 'Ordos';
/** House prefix of Emperor script and object names. */
export type HouseCode = 'AT' | 'HK' | 'OR';
export type Wc3Race = 'human' | 'orc' | 'undead';

/** Index = house id used at run time (EmpEnemyHouse: 0 AT / 1 HK / 2 OR). */
export const HOUSE_CODES: readonly HouseCode[] = ['AT', 'HK', 'OR'];
export const HOUSES: readonly House[] = ['Atreides', 'Harkonnen', 'Ordos'];

export const HOUSE_BY_CODE: Readonly<Record<HouseCode, House>> = { AT: 'Atreides', HK: 'Harkonnen', OR: 'Ordos' };
export const CODE_BY_HOUSE: Readonly<Record<House, HouseCode>> = { Atreides: 'AT', Harkonnen: 'HK', Ordos: 'OR' };
/** Run-time house id (index into HOUSE_CODES). */
export const HOUSE_ID: Readonly<Record<House, number>> = { Atreides: 0, Harkonnen: 1, Ordos: 2 };

/** Russian names for titles and dialogs. */
export const HOUSE_RU: Readonly<Record<HouseCode, string>> = { AT: 'Атрейдесы', HK: 'Харконнены', OR: 'Ордосы' };
/** Same, indexed by house id. */
export const HOUSE_RU_BY_ID: readonly string[] = ['Атрейдесы', 'Харконнены', 'Ордосы'];

/** WC3 player colour per house id: blue, red, green. */
export const HOUSE_COLOR: readonly number[] = [1, 0, 6];
/** WC3 player colour of an unknown/other enemy (EmpEnemyHouse outside 0..2). */
export const OTHER_ENEMY_COLOR = 6;

/** WC3 race (stand-in models, UI) per house. */
export const HOUSE_RACE: Readonly<Partial<Record<string, Wc3Race>>> = { Atreides: 'human', Harkonnen: 'orc', Ordos: 'undead' };

export const isHouseCode = (s: string): s is HouseCode => s === 'AT' || s === 'HK' || s === 'OR';
export const isHouse = (s: string | null | undefined): s is House => s === 'Atreides' || s === 'Harkonnen' || s === 'Ordos';
