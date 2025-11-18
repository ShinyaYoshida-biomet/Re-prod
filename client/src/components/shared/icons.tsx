import type { SVGProps } from 'react';
import { iconDefinitions } from '@/assets/icons/definitions';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

type PathDef = {
  type: string;
  [key: string]: string | number | undefined;
};

function renderPath(path: PathDef, index: number) {
  const { type, ...attrs } = path;
  const props = { key: index, ...attrs };

  switch (type) {
    case 'path':
      return <path {...props} />;
    case 'circle':
      return <circle {...props} />;
    case 'rect':
      return <rect {...props} />;
    case 'line':
      return <line {...props} />;
    case 'polyline':
      return <polyline {...props} />;
    case 'polygon':
      return <polygon {...props} />;
    default:
      return null;
  }
}

function createIcon(name: keyof typeof iconDefinitions) {
  return function Icon(props: IconProps): JSX.Element {
    const def = iconDefinitions[name];
    return (
      <svg viewBox={def.viewBox} {...base} {...props}>
        {def.paths.map((path, index) => renderPath(path as PathDef, index))}
      </svg>
    );
  };
}

export const IconPlay = createIcon('play');
export const IconPlayCircle = createIcon('playCircle');
export const IconPlus = createIcon('plus');
export const IconRobot = createIcon('robot');
export const IconSend = createIcon('send');
export const IconSquare = createIcon('square');
export const IconClipboard = createIcon('clipboard');
export const IconCheck = createIcon('check');
export const IconTrash = createIcon('trash');
export const IconBarChart = createIcon('barChart');
export const IconCheckCircle = createIcon('checkCircle');
export const IconXCircle = createIcon('xCircle');
export const IconChevronLeft = createIcon('chevronLeft');
export const IconChevronRight = createIcon('chevronRight');
export const IconLightbulb = createIcon('lightbulb');
export const IconInfo = createIcon('info');
export const IconSettings = createIcon('settings');
export const IconKeyboard = createIcon('keyboard');
export const IconRefresh = createIcon('refresh');
