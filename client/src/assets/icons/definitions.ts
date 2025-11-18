export interface IconDefinition {
  viewBox: string;
  content: JSX.Element;
}

export const iconDefinitions = {
  play: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'polygon', points: '6 4 19 12 6 20 6 4', fill: 'currentColor', stroke: 'none' }
    ]
  },
  playCircle: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'circle', cx: 12, cy: 12, r: 10 },
      { type: 'polygon', points: '10 8 16 12 10 16 10 8', fill: 'currentColor', stroke: 'none' }
    ]
  },
  robot: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'rect', x: 4, y: 7, width: 16, height: 12, rx: 3, ry: 3 },
      { type: 'circle', cx: 9, cy: 13, r: 1.6, fill: 'currentColor', stroke: 'none' },
      { type: 'circle', cx: 15, cy: 13, r: 1.6, fill: 'currentColor', stroke: 'none' },
      { type: 'path', d: 'M12 3v4' }
    ]
  },
  send: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'polyline', points: '4 4 20 12 4 20 7 12 4 4' }
    ]
  },
  plus: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'path', d: 'M12 5v14' },
      { type: 'path', d: 'M5 12h14' }
    ]
  },
  square: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'rect', x: 6, y: 6, width: 12, height: 12, rx: 2 }
    ]
  },
  clipboard: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'rect', x: 6, y: 5, width: 12, height: 16, rx: 2 },
      { type: 'path', d: 'M9 5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1' },
      { type: 'rect', x: 9, y: 9, width: 6, height: 2, rx: 0.5, fill: 'currentColor', stroke: 'none' },
      { type: 'rect', x: 9, y: 13, width: 6, height: 2, rx: 0.5, fill: 'currentColor', stroke: 'none', opacity: 0.6 }
    ]
  },
  check: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'polyline', points: '5 12.5 10 17 19 7' }
    ]
  },
  trash: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'path', d: 'M3 7h18' },
      { type: 'path', d: 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
      { type: 'path', d: 'M9 11v6' },
      { type: 'path', d: 'M12 11v6' },
      { type: 'path', d: 'M15 11v6' },
      { type: 'rect', x: 5, y: 7, width: 14, height: 13, rx: 2, ry: 2 }
    ]
  },
  barChart: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'path', d: 'M4 20h16' },
      { type: 'rect', x: 6, y: 10, width: 3, height: 7, rx: 1 },
      { type: 'rect', x: 11, y: 6, width: 3, height: 11, rx: 1 },
      { type: 'rect', x: 16, y: 8, width: 3, height: 9, rx: 1 }
    ]
  },
  checkCircle: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'circle', cx: 12, cy: 12, r: 10 },
      { type: 'polyline', points: '8 12 11 15 16 9' }
    ]
  },
  xCircle: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'circle', cx: 12, cy: 12, r: 10 },
      { type: 'line', x1: 9, y1: 9, x2: 15, y2: 15 },
      { type: 'line', x1: 15, y1: 9, x2: 9, y2: 15 }
    ]
  },
  chevronLeft: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'polyline', points: '15 18 9 12 15 6' }
    ]
  },
  chevronRight: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'polyline', points: '9 18 15 12 9 6' }
    ]
  },
  lightbulb: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'path', d: 'M9 18h6' },
      { type: 'path', d: 'M10 22h4' },
      { type: 'path', d: 'M12 2a7 7 0 0 0-7 7c0 2.6 1.4 4.4 3 6a5 5 0 0 1 1.4 3.1V19h5.2v-0.9c0-1.2.5-2.3 1.4-3.1 1.6-1.6 3-3.4 3-6a7 7 0 0 0-7-7z' }
    ]
  },
  info: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'circle', cx: 12, cy: 12, r: 10 },
      { type: 'line', x1: 12, y1: 10, x2: 12, y2: 16 },
      { type: 'circle', cx: 12, cy: 7, r: 0.8, fill: 'currentColor', stroke: 'none' }
    ]
  },
  settings: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'circle', cx: 12, cy: 12, r: 3 },
      { type: 'path', d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }
    ]
  },
  keyboard: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'rect', x: 3, y: 7, width: 18, height: 10, rx: 2 },
      { type: 'path', d: 'M7 10h0' },
      { type: 'path', d: 'M10 10h0' },
      { type: 'path', d: 'M13 10h0' },
      { type: 'path', d: 'M16 10h0' },
      { type: 'path', d: 'M7 13h0' },
      { type: 'path', d: 'M10 13h0' },
      { type: 'path', d: 'M13 13h0' },
      { type: 'path', d: 'M16 13.5h2' }
    ]
  },
  refresh: {
    viewBox: '0 0 24 24',
    paths: [
      { type: 'polyline', points: '23 4 23 10 17 10' },
      { type: 'polyline', points: '1 20 1 14 7 14' },
      { type: 'path', d: 'M3.51 9a9 9 0 0 1 14.13-3.36L23 10' },
      { type: 'path', d: 'M20.49 15a9 9 0 0 1-14.13 3.36L1 14' }
    ]
  }
} as const;
