'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultParams, params, type ShaderParams } from './params';
import { Canvas } from './canvas';
import { Slider } from 'radix-ui';
import { NumberInput } from '@/app/number-input';
import { roundOptimized } from '@/app/round-optimized';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { parseLogoImage } from './parse-logo-image';
import { uploadImage } from '@/hero/upload-image';
import isEqual from 'lodash-es/isEqual';
import { handleLocalImage } from './local-image-handler';

interface HeroProps {
  imageId: string;
}

type State = ShaderParams & {
  background: string;
  frameCount: number;
  frameDelay: number;
  framerate: number | 'custom'; // Add framerate to state
  quality: number;
  size: number;
  transparent: boolean;
  effects: {
    dither: string;
    noiseAmount: number;
    threshold: number;
    invert: boolean;
  }
};

const defaultState: State = { 
  ...defaultParams, 
  background: 'metal', 
  frameCount: 60, 
  frameDelay: 50, 
  framerate: 'custom', // Default to custom since 50ms doesn't match standard framerates
  quality: 5, 
  size: 512, 
  transparent: true,
  effects: {
    dither: 'none',
    noiseAmount: 0,
    threshold: 0,
    invert: false
  }
};

declare global {
  interface Window {
    downloadLiquidFavicon: (
      frameCount: number,
      frameDelay: number,
      quality: number,
      size: number,
      transparent: boolean
    ) => void;
  }
}

// Add a helper function to convert framerate to delay
const framerateToDelay = (fps: number): number => {
  return Math.round(1000 / fps);
};

// Add a helper function to find closest framerate from delay
const delayToFramerate = (delay: number): number | 'custom' => {
  const standardFramerates = [12, 24, 25, 30, 60, 120];
  const targetFps = 1000 / delay;
  
  // Check if it's very close to a standard framerate
  for (const fps of standardFramerates) {
    if (Math.abs(fps - targetFps) < 0.1) {
      return fps;
    }
  }
  
  return 'custom';
};

export function Hero({ imageId }: HeroProps) {
  const [state, setState] = useState<State>(defaultState);
  const [dragging, setDragging] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchParamsPendingUpdate = useRef(false);

  const stateRef = useRef(state);

  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [processing, setProcessing] = useState<boolean>(true);
  // Progress bar state
  const [captureProgress, setCaptureProgress] = useState<{ frames: number; total: number; active: boolean }>({ frames: 0, total: 0, active: false });

  // Check URL for image ID on mount
  useEffect(() => {
    setProcessing(true);

    async function updateImageData() {
      try {
        const res = await fetch(`https://p1ljtcp1ptfohfxm.public.blob.vercel-storage.com/${imageId}.png`);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);

        // Create a temporary canvas to turn the image back into imageData for the shader
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setImageData(imageData);
      } catch (error) {
        console.error(error);
      }

      setProcessing(false);
    }

    updateImageData();
  }, [imageId]);

  useEffect(() => {
    stateRef.current = state;

    // Debounce the history updates
    const timeoutId = setTimeout(() => {
      const searchParams = new URLSearchParams();

      Object.entries(stateRef.current).forEach(([key, value]) => {
        // Handle nested 'effects' object
        if (key === 'effects' && typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([effectKey, effectValue]) => {
            const paramKey = `effects.${effectKey}`; // e.g., effects.dither
            if (typeof effectValue === 'number') {
              searchParams.set(paramKey, roundOptimized(effectValue, 4).toString());
            } else if (typeof effectValue === 'boolean') {
              searchParams.set(paramKey, effectValue.toString());
            } else {
              searchParams.set(paramKey, effectValue as string);
            }
          });
        } else if (typeof value === 'number') { // Handle top-level numbers
          searchParams.set(key, roundOptimized(value, 4).toString());
        } else if (typeof value === 'boolean') { // Handle top-level booleans
           searchParams.set(key, value.toString());
        } else if (typeof value === 'string') { // Handle top-level strings
           searchParams.set(key, value);
        }
        // Ignore other types for URL params for now
      });

      searchParamsPendingUpdate.current = false;
      // Use pushState or replaceState as needed. replaceState avoids polluting history.
      window.history.replaceState({}, '', pathname + '?' + searchParams.toString());
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [state, pathname]);

  useEffect(() => {
    if (searchParamsPendingUpdate.current) {
      return;
    }

    const paramsState: Partial<State> = {}; // Use Partial<State>
    const effectsState: Partial<State['effects']> = {}; // For collecting effects
    let paramsChanged = false;

    for (const [key, value] of searchParams.entries()) {
       let parsedValue: any = value;
       let targetKey: string = key;
       let isEffectParam = false;

       // Check if it's an effect parameter
       if (key.startsWith('effects.')) {
           targetKey = key.substring('effects.'.length); // Get the actual effect key (e.g., 'dither')
           isEffectParam = true;
           // Parse effect value based on default type (improve this if needed)
           if (targetKey === 'noiseAmount' || targetKey === 'threshold') {
               const number = parseFloat(value);
               parsedValue = Number.isNaN(number) ? defaultState.effects[targetKey as keyof State['effects']] : number;
           } else if (targetKey === 'invert') {
               parsedValue = value === 'true';
           } // 'dither' remains a string
       } else if (key in defaultParams) { // Top-level numeric params
           const number = parseFloat(value);
           parsedValue = Number.isNaN(number) ? defaultState[key as keyof ShaderParams] : number;
       } else if (key === 'transparent') { // Top-level boolean
           parsedValue = value === 'true';
       } else if (['frameCount', 'frameDelay', 'quality', 'size'].includes(key)) { // Top-level integers
           const number = parseInt(value);
           parsedValue = Number.isNaN(number) ? defaultState[key as keyof State] : number;
       } else if (key === 'background') { // Top-level string
           // parsedValue remains 'value'
       } else {
           continue; // Ignore unknown keys
       }

       // Compare and update state
       let currentValue: any;
       if (isEffectParam) {
           currentValue = stateRef.current.effects[targetKey as keyof State['effects']];
           if (parsedValue !== currentValue) {
               effectsState[targetKey as keyof State['effects']] = parsedValue;
               paramsChanged = true;
           }
       } else {
           currentValue = stateRef.current[targetKey as keyof State];
           // Match precision for numbers before comparing
           if (typeof currentValue === 'number' && typeof parsedValue === 'number') {
               if (roundOptimized(currentValue, 4) !== roundOptimized(parsedValue, 4)) {
                   (paramsState as any)[targetKey] = parsedValue;
                   paramsChanged = true;
               }
           } else if (parsedValue !== currentValue) {
               (paramsState as any)[targetKey] = parsedValue;
               paramsChanged = true;
           }
       }
    }

    if (paramsChanged) {
      console.log('Updating state from URL params');
      setState((currentState) => ({
          ...currentState,
          ...paramsState, // Apply top-level changes
          effects: { // Merge effects changes
              ...currentState.effects,
              ...effectsState
          }
      }));
    }
  }, [searchParams, pathname]); // Added pathname dependency

  const handleFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      handleFiles(files);
    }
  }, []);

  const handleFiles = async (files: FileList) => {
    if (files.length > 0) {
      const file = files[0];
      const fileType = file.type;

      // Check file size (4.5MB = 4.5 * 1024 * 1024 bytes)
      const maxSize = 4.5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error('File size must be less than 4.5MB');
        return;
      }

      // Check if file is an image or SVG
      if (fileType.startsWith('image/') || fileType === 'image/svg+xml') {
        setProcessing(true);
        parseLogoImage(file).then(({ imageData, pngBlob }) => {
          // Set the image data for the shader to pick up
          setImageData(imageData);
          handleLocalImage(imageData);
          setProcessing(false);
        });
      } else {
        toast.error('Please upload only images or SVG files');
      }
    }
  };

  const handleDownload = async () => {
    // Try to get the canvas element used for rendering
    const canvasElem = document.querySelector('canvas');
    if (!canvasElem) {
      toast.error('Canvas not found');
      return;
    }
    setCaptureProgress({ frames: 0, total: state.frameCount, active: true });
    try {
      // Dynamically import the captureAnimation function
      const { captureAnimation, downloadAnimation } = await import('./download-animation');
      const url = await captureAnimation(
        canvasElem as HTMLCanvasElement,
        state.frameCount,
        state.frameDelay,
        state.quality,
        state.size,
        state.transparent,
        state.effects.dither, // Pass dither state here
        (frames, total) => setCaptureProgress({ frames, total, active: true })
      );
      downloadAnimation(url, 'liquid-metal-favicon.gif');
    } catch (e) {
      console.error('Failed to generate favicon:', e); // Log the error
      toast.error('Failed to generate favicon');
    } finally {
      setTimeout(() => setCaptureProgress({ frames: 0, total: 0, active: false }), 800);
    }
  };

  return (
    <div
      className="flex flex-col items-stretch gap-24 px-32 max-md:max-w-564 md:grid md:grid-cols-[500px_500px] md:gap-32"
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        const files = event.dataTransfer.files;
        handleFiles(files);
      }}
    >
      <div
        className="flex aspect-square w-full items-center justify-center rounded-10"
        style={{
          background: (() => {
            if (typeof state.background === 'string') {
              switch (state.background) {
                case 'metal':
                  return 'linear-gradient(to bottom, #eee, #b8b8b8)';
                default:
                  return state.background;
              }
            }
            return 'black'; // Default fallback if background is not a string
          })(),
        }}
      >
        <div className="aspect-square w-400">
          {imageData && <Canvas imageData={imageData} params={state} processing={processing} effects={state.effects} />}
        </div>
      </div>

      <div className="flex flex-col gap-12">
        <div className="grid auto-rows-[minmax(40px,auto)] grid-cols-[auto_200px] items-center gap-x-24 gap-y-12 rounded-8 p-16 outline outline-white/20 sm:grid-cols-[auto_160px_100px]">
          <div>
            <label className="pr-16 text-nowrap">Background</label>
          </div>
          <div className="flex h-40 items-center gap-9 sm:col-span-2">
            <button
              className="size-28 cursor-pointer rounded-full text-[0px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              style={{ background: 'linear-gradient(to bottom, #eee, #b8b8b8)' }}
              onClick={() => setState({ ...state, background: 'metal' })}
            >
              Metal
            </button>

            <button
              className="size-28 cursor-pointer rounded-full bg-white text-[0px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              onClick={() => setState({ ...state, background: 'white' })}
            >
              White
            </button>

            <button
              className="size-28 cursor-pointer rounded-full bg-black text-[0px] outline outline-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              onClick={() => setState({ ...state, background: 'black' })}
            >
              Black
            </button>

            <label
              className="size-28 cursor-pointer rounded-full text-[0px] focus-within:cursor-default [&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-focus"
              style={{
                background: `
                  radial-gradient(circle, white, transparent 65%),
                  conic-gradient(
                    in oklch,
                    oklch(63.2% 0.254 30),
                    oklch(79% 0.171 70),
                    oklch(96.7% 0.211 110),
                    oklch(87.4% 0.241 150),
                    oklch(90.2% 0.156 190),
                    oklch(76.2% 0.152 230),
                    oklch(46.5% 0.305 270),
                    oklch(59.5% 0.301 310),
                    oklch(65.9% 0.275 350),
                    oklch(63.2% 0.254 30)
                  )
                `,
              }}
            >
              <input
                className="h-full w-full cursor-pointer rounded-full opacity-0"
                type="color"
                onChange={(event) => setState({ ...state, background: event.currentTarget.value })}
              />
              Custom
            </label>
          </div>

          <Control
            label="Dispersion"
            // note we renamed refraction to dispersion but many share links already call it refraction so we're just making a label change for now
            // we could update it to dispersion everywhere if we have time to rewrite the querystring parser to use either name and map it into dispersion
            value={state.refraction}
            min={params.refraction.min}
            max={params.refraction.max}
            step={params.refraction.step}
            onValueChange={(value) => setState((state) => ({ ...state, refraction: value }))}
          />
          <Control
            label="Edge"
            value={state.edge}
            min={params.edge.min}
            max={params.edge.max}
            step={params.edge.step}
            onValueChange={(value) => setState((state) => ({ ...state, edge: value }))}
          />
          <Control
            label="Pattern Blur"
            value={state.patternBlur}
            min={params.patternBlur.min}
            max={params.patternBlur.max}
            step={params.patternBlur.step}
            onValueChange={(value) => setState((state) => ({ ...state, patternBlur: value }))}
          />
          <Control
            label="Liquify"
            value={state.liquid}
            min={params.liquid.min}
            max={params.liquid.max}
            step={params.liquid.step}
            onValueChange={(value) => setState((state) => ({ ...state, liquid: value }))}
          />
          <Control
            label="Speed"
            value={state.speed}
            min={params.speed.min}
            max={params.speed.max}
            step={params.speed.step}
            onValueChange={(value) => setState((state) => ({ ...state, speed: value }))}
          />
          <Control
            label="Pattern Scale"
            value={state.patternScale}
            min={params.patternScale.min}
            max={params.patternScale.max}
            step={params.patternScale.step}
            format={(value) => (value === '0' || value === '10' ? value : parseFloat(value).toFixed(1))}
            onValueChange={(value) => setState((state) => ({ ...state, patternScale: value }))}
          />

          <div className="col-span-full mt-12">
            <label
              htmlFor="file-input"
              className="mb-16 flex h-40 cursor-pointer items-center justify-center rounded-4 bg-button font-medium select-none"
            >
              <input type="file" accept="image/*,.svg" onChange={handleFileInput} id="file-input" className="hidden" />
              Upload image
            </label>
            <p className="w-fill text-sm text-white/80">
              Tips: transparent or white background is required. Shapes work better than words. Use an SVG or a
              high-resolution image.
            </p>
          </div>
        </div>

        {/* Effects Controls Section */}
        <div className="grid auto-rows-[minmax(40px,auto)] grid-cols-[auto_200px] items-center gap-x-24 gap-y-12 rounded-8 p-16 outline outline-white/20 sm:grid-cols-[auto_160px_100px]">
          <div>
            <label className="pr-16 text-nowrap">Dither</label>
          </div>
          <div className="flex h-40 items-center gap-9 sm:col-span-2">
            <select 
              className="w-full h-full bg-black text-white border border-white/30 rounded-4 px-8"
              value={state.effects.dither}
              onChange={(e) => setState({ 
                ...state, 
                effects: { ...state.effects, dither: e.target.value } 
              })}
            >
              <option value="none">None</option>
              <option value="bayer2x2">Bayer 2x2</option>
              <option value="bayer4x4">Bayer 4x4</option>
              <option value="bayer8x8">Bayer 8x8</option>
              <option value="floydSteinberg">Floyd-Steinberg</option>
            </select>
          </div>

          <Control
            label="Noise"
            value={state.effects.noiseAmount}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(value) => setState((state) => ({ 
              ...state, 
              effects: { ...state.effects, noiseAmount: value } 
            }))}
            variant="effects"
          />

          <Control
            label="Threshold"
            value={state.effects.threshold}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(value) => setState((state) => ({ 
              ...state, 
              effects: { ...state.effects, threshold: value } 
            }))}
            variant="effects"
          />

          <div className="col-span-full flex items-center gap-24">
            <label htmlFor="invert" className="pr-16 text-nowrap">Invert Colors</label>
            <input
              type="checkbox"
              id="invert"
              checked={state.effects.invert}
              onChange={(e) => setState({ 
                ...state, 
                effects: { ...state.effects, invert: e.target.checked } 
              })}
              className="size-18 cursor-pointer rounded-full text-[0px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </div>
        </div>

        {/* Download Controls Section */}
        <div className="grid auto-rows-[minmax(40px,auto)] grid-cols-[auto_200px] items-center gap-x-24 gap-y-12 rounded-8 p-16 outline outline-white/20 sm:grid-cols-[auto_160px_100px]">
           <Control
            label="Frame Count"
            value={state.frameCount}
            min={10}
            max={400}
            step={10}
            onValueChange={(value) => setState((state) => ({ ...state, frameCount: value }))}
            variant="export"
          />
           <Control
            label="Frame Delay"
            value={state.frameDelay}
            min={10}
            max={200}
            step={10}
            onValueChange={(value) => setState((state) => ({ ...state, frameDelay: value }))}
            variant="export"
          />
           <Control
            label="Quality"
            value={state.quality}
            min={1}
            max={10}
            step={1}
            onValueChange={(value) => setState((state) => ({ ...state, quality: value }))}
            variant="export"
          />
           <Control
            label="Size"
            value={state.size}
            min={256}
            max={2048}
            step={256}
            onValueChange={(value) => setState((state) => ({ ...state, size: value }))}
            variant="export"
          />
           <div className="col-span-full flex items-center gap-24">
              <label htmlFor="transparent" className="pr-16 text-nowrap">Transparent</label>
              <input
                type="checkbox"
                id="transparent"
                checked={state.transparent}
                onChange={(e) => setState({ ...state, transparent: e.target.checked })}
                className="size-18 cursor-pointer rounded-full text-[0px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              />
           </div>
          <div className="col-span-full mt-12">
            <button
              onClick={handleDownload}
              className="flex h-40 w-full cursor-pointer items-center justify-center rounded-4 bg-button font-medium select-none"
              disabled={captureProgress.active}
            >
              Download Favicon
            </button>
            {captureProgress.active && (
  <div className="w-full mt-8 flex flex-col items-center">
    <div className="w-full h-6 bg-white/20 rounded-full overflow-hidden">
      <div
        className="h-full bg-blue transition-all duration-200"
        style={{ width: `${(captureProgress.frames / captureProgress.total) * 100}%` }}
      />
    </div>
    <div className="text-xs text-white/80 mt-2">
      {captureProgress.frames < captureProgress.total
        ? `Capturing frames: ${captureProgress.frames} / ${captureProgress.total}`
        : 'All frames captured, rendering GIF...'}
    </div>
  </div>
)}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ControlProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (value: string) => string;
  onValueChange: (value: number) => void;
  variant?: 'export' | 'effects' | undefined;
}

function Control({ label, min, max, step, format, value, onValueChange, variant }: ControlProps) {
  // Ensure value is a number to prevent toString() on undefined
  const safeValue = typeof value === 'number' ? value : min || 0;
  
  return (
    <>
      <div>
        <label className="pr-16 text-nowrap" htmlFor={label}>
          {label}
        </label>
      </div>
      <div>
        <Slider.Root min={min} max={max} step={step} value={[safeValue]} onValueChange={([value]) => onValueChange(value)}>
          <Slider.Track className={
            variant === 'export'
              ? 'relative flex h-10 w-full touch-none items-center rounded-full select-none bg-gradient-to-r from-[#a3e635] via-[#22c55e] to-[#166534] shadow-[0_2px_16px_0_rgba(34,197,94,0.18)] backdrop-blur-md'
              : 'relative flex h-32 w-full touch-none items-center rounded-full select-none'
          }>
            {variant === 'export' && (
              <span inert={true} className="absolute inset-x-0 h-10 rounded-full bg-gradient-to-r from-[#bbf7d0] via-[#22c55e] to-[#166534] blur-[2px] pointer-events-none" />
            )}
            <Slider.Range className={
              variant === 'export'
                ? 'absolute h-8 rounded-full bg-gradient-to-r from-[#a3e635] via-[#22c55e] to-[#166534] shadow-[0_2px_24px_0_rgba(34,197,94,0.18)] transition-all duration-300'
                : 'absolute h-6 rounded-full bg-blue select-none'
            } />
            <Slider.Thumb
              tabIndex={-1}
              className={
                variant === 'export'
                  ? 'block size-14 rounded-full bg-white/70 backdrop-blur-md shadow-[0_2px_8px_0_rgba(56,189,248,0.12)] outline-none transition-all duration-200 hover:scale-110 focus-visible:ring-2 focus-visible:ring-cyan-200/60'
                  : 'block size-16 rounded-full bg-white outline-focus select-none focus-visible:outline-2'
              }
              style={variant === 'export' ? { boxShadow: '0 2px 12px 0 #bae6fd, 0 1px 4px 0rgb(143, 141, 49)' } : { boxShadow: '0 2px 6px -2px black' }}
            />
          </Slider.Track>
        </Slider.Root>
      </div> 
      <div className="max-sm:hidden">
        <NumberInput
          id={label}
          min={min}
          max={max}
          increments={[step, step * 10]}
          format={format}
          className="h-40 w-full rounded-4 bg-white/15 pl-12 text-sm tabular-nums outline-white/20 focus:outline-2 focus:-outline-offset-1 focus:outline-blue"
          value={safeValue.toString()}
          onValueCommit={(value) => onValueChange(parseFloat(value))}
        />
      </div>
    </>
  );
}
