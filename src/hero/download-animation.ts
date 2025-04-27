import GIF from 'gif.js';

export function captureAnimation(
  canvas: HTMLCanvasElement,
  frameCount: number = 30,
  frameDelay: number = 50,
  quality: number = 1,
  size: number = 256,
  transparent: boolean = false,
  dither: string = 'none', // Add dither parameter
  onProgress?: (framesCaptured: number, frameCount: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Map dither values to what gif.js supports
    let ditherAlgorithm: boolean | string = false;
    
    // GIF.js only supports 'FloydSteinberg' or true/false
    if (dither === 'floydSteinberg') {
      ditherAlgorithm = 'FloydSteinberg';
    } else if (dither !== 'none') {
      // For any other dither type, just enable dithering
      ditherAlgorithm = true;
    }

    const gif = new GIF({
      workers: 4,
      quality: quality,
      width: size,
      height: size,
      dither: ditherAlgorithm as boolean | 'FloydSteinberg' | undefined, // Use the mapped dither algorithm
      workerScript: '/gif.worker.js',
      transparent: transparent ? 0x00000000 : null // Use fully transparent black
    });

    let framesCaptures = 0;

    function captureFrame() {
      requestAnimationFrame(() => {
        try {
          // Create a temporary canvas with the right size
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = size;
          tempCanvas.height = size;
          
          // Create a 2D context with proper settings
          const ctx = tempCanvas.getContext('2d', { 
            willReadFrequently: true,
            alpha: true // Always use alpha channel
          });
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Clear with transparency
          ctx.clearRect(0, 0, size, size);
          
          // Use better compositing for transparent images
          if (transparent) {
            ctx.globalCompositeOperation = 'source-over';
          }
          
          // Draw the current canvas state to our temporary canvas
          // Important: preserve aspect ratio
          const aspectRatio = canvas.width / canvas.height;
          let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
          
          if (aspectRatio >= 1) { // Wider than tall
            drawWidth = size;
            drawHeight = size / aspectRatio;
            offsetY = (size - drawHeight) / 2;
          } else { // Taller than wide
            drawHeight = size;
            drawWidth = size * aspectRatio;
            offsetX = (size - drawWidth) / 2;
          }
          
          ctx.drawImage(
            canvas,
            0, 0, canvas.width, canvas.height,
            offsetX, offsetY, drawWidth, drawHeight
          );
          
          // Add the frame to the GIF with optimized settings
          gif.addFrame(tempCanvas, {
            delay: frameDelay,
            copy: true
          });

          framesCaptures++;
          if (onProgress) onProgress(framesCaptures, frameCount);
          // console.log(`Captured frame ${framesCaptures}/${frameCount}`); // Optional: uncomment for debugging

          if (framesCaptures < frameCount) {
            // Use setTimeout for delay, not requestAnimationFrame again immediately
            setTimeout(captureFrame, 1); // Minimal delay to allow UI updates
          } else {
            console.log('All frames captured, rendering GIF...');
            gif.on('finished', (blob: Blob) => {
              console.log(`GIF generated: ${blob.size} bytes`);
              resolve(URL.createObjectURL(blob));
            });

            gif.render();
          }
        } catch (error) {
          console.error('Error capturing frame:', error);
          reject(error);
        }
      });
    }

    // Start the first frame capture
    captureFrame();
  });
}

export function downloadAnimation(dataUrl: string, filename: string = 'liquid-metal-favicon.gif') {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}