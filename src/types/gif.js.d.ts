declare module 'gif.js' {
  export interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
    dither?: boolean | 'FloydSteinberg';
  }

  export default class GIF {
    constructor(options: GIFOptions);
    addFrame(element: HTMLCanvasElement, options: { delay: number; copy: boolean }): void;
    on(event: 'finished', callback: (blob: Blob) => void): void;
    render(): void;
  }
} 