import GIF from 'gif.js';

export function captureAnimation(
  canvas: HTMLCanvasElement, 
  frameCount: number = 30, 
  frameDelay: number = 50,
  quality: number = 1,
  size: number = 256
): Promise<string> {
  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 4,
      quality: quality,
      width: size,
      height: size,
      dither: 'FloydSteinberg',
      workerScript: '/gif.worker.js'
    });
    
    let framesCaptures = 0;
    
    function captureFrame() {
      requestAnimationFrame(() => {
        try {
          // Create a temporary canvas
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = size;
          tempCanvas.height = size;
          const ctx = tempCanvas.getContext('2d', { 
            willReadFrequently: true,
            alpha: true
          });
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Clear the context
          ctx.clearRect(0, 0, size, size);
          
          // Looking at the canvas.tsx code, we can see the actual rendering area
          // is a square with sides of 1000 * devicePixelRatio
          // The canvas is contained in a div with aspect-square w-400
          
          // Instead of trying to calculate the viewport, let's draw the entire canvas
          // into our temp canvas - this will preserve the exact proportions
          ctx.drawImage(
            canvas,
            0, 0, canvas.width, canvas.height,
            0, 0, size, size
          );
          
          // Add the frame to the GIF
          gif.addFrame(tempCanvas, { delay: frameDelay, copy: true });
          
          framesCaptures++;
          console.log(`Captured frame ${framesCaptures}/${frameCount}`);
          
          if (framesCaptures < frameCount) {
            setTimeout(captureFrame, frameDelay);
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