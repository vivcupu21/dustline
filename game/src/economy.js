// Economy: money, armor, owned weapons. Armor absorbs 50% of damage until spent.
// Money and armor carry across rounds; resetRound is a no-op hook (ammo refill lives
// in weapons.js). WEAPONS is a map id -> { price, ... }; 'sidearm' is always owned.
export const ARMOR_PRICE = 500;
export const ARMOR_MAX = 100;

export function createEconomy(WEAPONS) {
  const state = {
    money: 800,
    armor: 0,
    owned: new Set(['sidearm']),
  };

  function priceOf(id) {
    if (id === 'armor') return ARMOR_PRICE;
    return WEAPONS[id] ? WEAPONS[id].price : Infinity;
  }

  function canBuy(id) {
    if (state.money < priceOf(id)) return false;
    if (id === 'armor') return state.armor < ARMOR_MAX;
    return !state.owned.has(id);
  }

  function buy(id) {
    if (!canBuy(id)) return false;
    state.money -= priceOf(id);
    if (id === 'armor') state.armor = ARMOR_MAX;
    else state.owned.add(id);
    return true;
  }

  // Armor absorbs half the hit until it runs out; returns the HP damage left over.
  // e.g. dmg 34, armor 100 -> armor 83, returns 17.
  function applyDamage(dmg) {
    const absorbed = Math.min(state.armor, dmg * 0.5);
    state.armor -= absorbed;
    return dmg - absorbed;
  }

  return {
    get money() { return state.money; },
    set money(v) { state.money = v; },
    get armor() { return state.armor; },
    set armor(v) { state.armor = v; },
    owned: state.owned,
    buy,
    canBuy,
    add(n) { state.money += n; },
    applyDamage,
    resetRound() {},
    has(id) { return id === 'armor' ? state.armor > 0 : state.owned.has(id); },
  };
}
