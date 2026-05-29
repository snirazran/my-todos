// SVG imports.
// `import Icon from './x.svg'` -> inline React component (via @svgr/webpack)
// `import url from './x.svg?url'` -> URL string (asset/resource escape hatch)
declare module '*.svg' {
  import type { FC, SVGProps } from 'react';
  const ReactComponent: FC<SVGProps<SVGSVGElement> & { title?: string }>;
  export default ReactComponent;
}

declare module '*.svg?url' {
  const content: string;
  export default content;
}
