// The look plan, in one place. Seven values and one accent hue; the lighting makes
// every shade the game needs. The same names are the CSS custom properties in
// index.html. slate is the defending (SLATE) team blue.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  slate: '#5b7fa6',
};

export function shade(name) {
  return PALETTE[name];
}
