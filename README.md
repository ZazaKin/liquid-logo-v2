# Liquid Metal Favicon Generator

Generate animated liquid metal favicons for your website. This tool allows you to upload your logo and transform it into a shimmering liquid metal animation, perfect for modern websites.

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/liquid-logo.git
cd liquid-logo

# Install dependencies
npm install

# Install gif.js for animation
npm install gif.js

# Copy the worker script to your public directory
cp node_modules/gif.js/dist/gif.worker.js public/

# Start the development server
npm run dev
```

## Usage

1. Open your browser and navigate to `http://localhost:3000`

2. Upload your logo:
   - Click the upload button
   - Drag and drop your image
   - Choose a PNG, JPG, or SVG file (SVG works best)

3. Adjust the settings:
   - Pattern Scale
   - Refraction
   - Edge
   - Pattern Blur
   - Liquid
   - Speed

4. Generate your animated favicon:
   - Open the browser console (F12 or Cmd+Option+J)
   - Run the command: `window.downloadLiquidFavicon()`

## Download Command Options

The download command accepts parameters for customizing your animation:

```javascript
window.downloadLiquidFavicon(frameCount, frameDelay, quality, size, transparent);
```

| Parameter   | Default | Description                                |
|-------------|--------:|--------------------------------------------|
| frameCount  | 30      | Number of frames in the animation          |
| frameDelay  | 50      | Delay between frames (milliseconds)        |
| quality     | 10      | Quality setting (1 = highest, 20 = lowest) |
| size        | 64      | Output size in pixels                      |
| transparent | false   | Enable transparent background              |

### Examples

```javascript
// Standard favicon (64x64)
window.downloadLiquidFavicon(30, 50, 10, 64, false);

// Higher quality animation with transparent background
window.downloadLiquidFavicon(60, 100, 1, 128, true);

// Maximum quality with transparent background
window.downloadLiquidFavicon(90, 100, 1, 512, true);
```

## License

This project is MIT licensed. Feel free to use and modify.

---

