// Alleen tijden en aantallen, geen broninhoud. De browser bewaart per fase de laatste meting.
// Ook de ongewijzigde productie-HTML kan zo via de Performance API worden gecontroleerd.
export function finishTiming(name, start, detail = null) {
  const key = `lead:${name}`;
  performance.clearMeasures(key);
  performance.measure(key, { start, end: performance.now(), detail });
}
