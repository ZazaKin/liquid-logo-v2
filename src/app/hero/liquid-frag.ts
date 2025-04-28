export const liquidFragSource = /* glsl */ `#version 300 es
precision mediump float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D u_image_texture;
uniform float u_time;
uniform float u_ratio;
uniform float u_img_ratio;
uniform float u_patternScale;
uniform float u_refraction;
uniform float u_edge;
uniform float u_patternBlur;
uniform float u_liquid;
uniform int u_ditherType; // 0: none, 1: bayer2x2, 2: bayer4x4, 3: bayer8x8, 4: floyd, 5: random, 6: halftone
uniform float u_ditherIntensity; // Controls dithering strength
uniform int u_halftoneType; // 0: circles, 1: lines, 2: diamonds, 3: crosses, 4: dots
uniform float u_halftoneSize; // Controls the size of halftone pattern

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846


vec3 mod289(vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec2 mod289(vec2 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec3 permute(vec3 x) { return mod289(((x*34.)+1.)*x); }
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1., 0.) : vec2(0., 1.);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.);
    m = m*m;
    m = m*m;
    vec3 x = 2. * fract(p * C.www) - 1.;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130. * dot(m, g);
}

// Bayer matrix for ordered dithering
const mat4 bayerMatrix = mat4(
    0.0/16.0, 8.0/16.0, 2.0/16.0, 10.0/16.0,
    12.0/16.0, 4.0/16.0, 14.0/16.0, 6.0/16.0,
    3.0/16.0, 11.0/16.0, 1.0/16.0, 9.0/16.0,
    15.0/16.0, 7.0/16.0, 13.0/16.0, 5.0/16.0
);

// Apply dithering to a color channel
float applyDither(float color, vec2 pos) {
    int x = int(mod(pos.x, 4.0));
    int y = int(mod(pos.y, 4.0));
    float threshold = bayerMatrix[x][y];
    return step(threshold, color);
}

vec2 get_img_uv() {
    vec2 img_uv = vUv;
    img_uv -= .5;
    if (u_ratio > u_img_ratio) {
        img_uv.x = img_uv.x * u_ratio / u_img_ratio;
    } else {
        img_uv.y = img_uv.y * u_img_ratio / u_ratio;
    }
    float scale_factor = 1.;
    img_uv *= scale_factor;
    img_uv += .5;

    img_uv.y = 1. - img_uv.y;

    return img_uv;
}
vec2 rotate(vec2 uv, float th) {
    return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}
float get_color_channel(float c1, float c2, float stripe_p, vec3 w, float extra_blur, float b) {
    float ch = c2;
    float border = 0.;
    float blur = u_patternBlur + extra_blur;

    ch = mix(ch, c1, smoothstep(.0, blur, stripe_p));

    border = w[0];
    ch = mix(ch, c2, smoothstep(border - blur, border + blur, stripe_p));

    b = smoothstep(.2, .8, b);
    border = w[0] + .4 * (1. - b) * w[1];
    ch = mix(ch, c1, smoothstep(border - blur, border + blur, stripe_p));

    border = w[0] + .5 * (1. - b) * w[1];
    ch = mix(ch, c2, smoothstep(border - blur, border + blur, stripe_p));

    border = w[0] + w[1];
    ch = mix(ch, c1, smoothstep(border - blur, border + blur, stripe_p));

    float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
    float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
    ch = mix(ch, gradient, smoothstep(border - blur, border + blur, stripe_p));

    return ch;
}

float get_img_frame_alpha(vec2 uv, float img_frame_width) {
    float img_frame_alpha = smoothstep(0., img_frame_width, uv.x) * smoothstep(1., 1. - img_frame_width, uv.x);
    img_frame_alpha *= smoothstep(0., img_frame_width, uv.y) * smoothstep(1., 1. - img_frame_width, uv.y);
    return img_frame_alpha;
}

// Bayer matrices
// --- Dithering Matrices ---

// Bayer 2x2 Matrix
const mat2 bayer2x2 = mat2(
    0.0/4.0, 2.0/4.0,
    3.0/4.0, 1.0/4.0
);

// Bayer 4x4 Matrix
const mat4 bayer4x4 = mat4(
     0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
    12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
     3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
    15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
);

// Function to get Bayer 8x8 threshold mathematically
// (Based on https://en.wikipedia.org/wiki/Ordered_dithering#Algorithm)
// Optimized Bayer 8x8 calculation
float getBayer8x8Value(ivec2 p) {
    // Calculate 8x8 Bayer matrix value using bit operations
    // This is more efficient than using a lookup array
    int x = p.x & 7; // Equivalent to p.x % 8
    int y = p.y & 7; // Equivalent to p.y % 8
    
    // Calculate using bit interleaving pattern
    // Based on the recursive definition of the Bayer matrix
    int result = 0;
    
    // Interleave bits from x and y coordinates
    for (int bit = 0; bit < 3; bit++) {
        result = result | (((x >> bit) & 1) << (bit * 2));
        result = result | (((y >> bit) & 1) << (bit * 2 + 1));
    }
    
    return float(result) / 64.0;
}

// Approximate Floyd-Steinberg dithering in a single pass
// True Floyd-Steinberg requires multiple passes for error diffusion
float getFloydSteinbergValue(vec2 pos) {
    // We can't do true error diffusion in a fragment shader,
    // but we can create a pattern that visually resembles it
    
    // Use a combination of noise and position to create a more organic pattern
    float noise = fract(sin(dot(pos * 0.01, vec2(12.9898, 78.233))) * 43758.5453);
    
    // Add some structured variation based on position
    float pattern = fract((pos.x * 0.13) + (pos.y * 0.17) + noise * 0.1);
    
    // Make the pattern more visually similar to Floyd-Steinberg
    // by adding some diagonal bias
    float diagonalBias = fract((pos.x + pos.y) * 0.11);
    
    return mix(pattern, diagonalBias, 0.4);
}

// Simple pseudo-random noise function for dithering
float getRandomNoiseValue(vec2 pos) {
    // Use a simple hash function based on screen position
    // fract(sin(dot(coordinate, vec2(12.9898, 78.233))) * 43758.5453); is a common one
    return fract(sin(dot(pos, vec2(12.9898, 78.233))) * 43758.5453);
}


// Add halftone dithering pattern with different types
float getHalftoneValue(vec2 pos) {
    // Scale the position to control the size of the dots
    // Smaller u_halftoneSize value = larger dots
    float dotScale = u_halftoneSize; 
    
    // Create different rotation angles for each halftone type
    // This creates a more natural look by avoiding perfect alignment with pixels
    float angle = 0.0;
    
    if (u_halftoneType == 0) { // Circles - classic 45° rotation
        angle = 0.785398; // 45 degrees in radians
    } else if (u_halftoneType == 1) { // Lines - slight angle for natural look
        angle = 0.087266; // 5 degrees in radians
    } else if (u_halftoneType == 2) { // Diamonds - 15° rotation
        angle = 0.261799; // 15 degrees in radians
    } else if (u_halftoneType == 3) { // Crosses - 30° rotation
        angle = 0.523599; // 30 degrees in radians
    } else if (u_halftoneType == 4) { // Dots - 60° rotation
        angle = 1.0472; // 60 degrees in radians
    }
    
    // Apply rotation to create a more natural pattern
    vec2 rotatedPos = vec2(
        pos.x * cos(angle) - pos.y * sin(angle),
        pos.x * sin(angle) + pos.y * cos(angle)
    );
    
    // Scale the position based on the pattern type
    vec2 scaledPos = rotatedPos * dotScale;
    
    // Add subtle variation to the grid to break up the mechanical look
    // This creates a more organic feel similar to real printing
    float variation = snoise(scaledPos * 0.1) * 0.05;
    scaledPos += variation;
    
    // Create a grid of dots with slight irregularity
    vec2 grid = fract(scaledPos) - 0.5;
    
    // Add a subtle warping effect to the grid
    // This simulates the imperfections in real printing processes
    float warpAmount = 0.03;
    grid += warpAmount * vec2(
        sin(scaledPos.y * 3.0),
        sin(scaledPos.x * 2.7)
    );
    
    float dist = 0.0;
    float threshold = 0.0;
    float edgeSoftness = 0.0;
    
    // Different halftone patterns based on type
    if (u_halftoneType == 0) { // Circles (classic halftone)
        dist = length(grid);
        threshold = 0.25;
        edgeSoftness = 0.07; // Softer edges for more natural look
    } 
    else if (u_halftoneType == 1) { // Lines
        // Use sine wave for more natural line pattern
        dist = 0.5 - 0.5 * sin(grid.y * PI * 2.0 + scaledPos.x * 0.2);
        threshold = 0.5;
        edgeSoftness = 0.1;
    }
    else if (u_halftoneType == 2) { // Diamonds
        dist = abs(grid.x) + abs(grid.y);
        threshold = 0.3;
        edgeSoftness = 0.08;
    }
    else if (u_halftoneType == 3) { // Crosses
        // Create cross pattern with variable thickness
        float xDist = abs(grid.x);
        float yDist = abs(grid.y);
        float crossThickness = 0.15 + 0.05 * sin(scaledPos.x * 0.5);
        dist = min(xDist, yDist);
        threshold = crossThickness;
        edgeSoftness = 0.05;
    }
    else if (u_halftoneType == 4) { // Dots (smaller, more varied)
        // Create varied dot sizes
        dist = length(grid);
        // Vary the threshold based on position for more organic look
        threshold = 0.2 + 0.05 * sin(scaledPos.x * 0.7 + scaledPos.y * 0.9);
        edgeSoftness = 0.04;
    }
    
    // Apply smoothstep with variable edge softness for more natural transitions
    return smoothstep(threshold - edgeSoftness, threshold + edgeSoftness, dist);
}

// Get dither threshold based on type and screen position
float getDitherThreshold(vec2 screenPos) {
    if (u_ditherType == 1) { // Bayer 2x2
        ivec2 p = ivec2(mod(screenPos, 2.0));
        return bayer2x2[p.x][p.y];
    } else if (u_ditherType == 2) { // Bayer 4x4
        ivec2 p = ivec2(mod(screenPos, 4.0));
        return bayer4x4[p.x][p.y];
    } else if (u_ditherType == 3) { // Bayer 8x8
        ivec2 p = ivec2(mod(screenPos, 8.0));
        return getBayer8x8Value(p);
    } else if (u_ditherType == 4) { // Floyd-Steinberg approximation
        return getFloydSteinbergValue(screenPos);
    } else if (u_ditherType == 5) { // Random Noise
        return getRandomNoiseValue(screenPos);
    } else if (u_ditherType == 6) { // Halftone
        return getHalftoneValue(screenPos);
    }
    // u_ditherType == 0 (None) or unknown: Return high threshold to effectively disable dithering
    return 1.0;
}

// Apply dithering with adjustable intensity
float applyDitherStep(float colorVal, float threshold) {
    float dithered;
    
    // For halftone specifically, we want a more sophisticated approach
    if (u_ditherType == 6) {
        // For halftone, we want to preserve more of the original image detail
        // while still creating a halftone effect
        
        // Map the color value to control dot size
        // This creates a more traditional halftone look where darker areas
        // have larger dots and lighter areas have smaller dots
        float adjustedThreshold = mix(0.7, 0.3, colorVal) * threshold;
        
        // Apply a softer transition for halftones
        float softness = 0.15;
        dithered = smoothstep(adjustedThreshold - softness, adjustedThreshold + softness, 0.5);
    } else {
        // For other dither types, use standard approach
        dithered = step(threshold, colorVal);
    }
    
    // Mix between original color and dithered color based on intensity
    return mix(colorVal, dithered, u_ditherIntensity);
}

// --- End Dithering ---

// ... get_img_uv, rotate, get_color_channel, get_img_frame_alpha functions ...
// REMOVE the duplicate Bayer matrix definitions here if they exist

void main() {
    vec2 uv = vUv;
    uv.y = 1. - uv.y;
    uv.x *= u_ratio;

    float diagonal = uv.x - uv.y;

    float t = .001 * u_time;

    vec2 img_uv = get_img_uv();
    vec4 img = texture(u_image_texture, img_uv);

    vec3 color = vec3(0.);
    float opacity = 1.;

    vec3 color1 = vec3(.98, 0.98, 1.);
    vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, uv.x + uv.y));

    float edge = img.r;


    vec2 grad_uv = uv;
    grad_uv -= .5;

    float dist = length(grad_uv + vec2(0., .2 * diagonal));

    grad_uv = rotate(grad_uv, (.25 - .2 * diagonal) * PI);

    float bulge = pow(1.8 * dist, 1.2);
    bulge = 1. - bulge;
    bulge *= pow(uv.y, .3);


    float cycle_width = u_patternScale;
    float thin_strip_1_ratio = .12 / cycle_width * (1. - .4 * bulge);
    float thin_strip_2_ratio = .07 / cycle_width * (1. + .4 * bulge);
    float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);

    float thin_strip_1_width = cycle_width * thin_strip_1_ratio;
    float thin_strip_2_width = cycle_width * thin_strip_2_ratio;

    opacity = 1. - smoothstep(.9 - .5 * u_edge, 1. - .5 * u_edge, edge);
    opacity *= get_img_frame_alpha(img_uv, 0.01);


    float noise = snoise(uv - t);

    edge += (1. - edge) * u_liquid * noise;

    float refr = 0.;
    refr += (1. - bulge);
    refr = clamp(refr, 0., 1.);

    float dir = grad_uv.x;


    dir += diagonal;

    dir -= 2. * noise * diagonal * (smoothstep(0., 1., edge) * smoothstep(1., 0., edge));

    bulge *= clamp(pow(uv.y, .1), .3, 1.);
    dir *= (.1 + (1.1 - edge) * bulge);

    dir *= smoothstep(1., .7, edge);

    dir += .18 * (smoothstep(.1, .2, uv.y) * smoothstep(.4, .2, uv.y));
    dir += .03 * (smoothstep(.1, .2, 1. - uv.y) * smoothstep(.4, .2, 1. - uv.y));

    dir *= (.5 + .5 * pow(uv.y, 2.));

    dir *= cycle_width;

    dir -= t;

    float refr_r = refr;
    refr_r += .03 * bulge * noise;
    float refr_b = 1.3 * refr;

    refr_r += 5. * (smoothstep(-.1, .2, uv.y) * smoothstep(.5, .1, uv.y)) * (smoothstep(.4, .6, bulge) * smoothstep(1., .4, bulge));
    refr_r -= diagonal;

    refr_b += (smoothstep(0., .4, uv.y) * smoothstep(.8, .1, uv.y)) * (smoothstep(.4, .6, bulge) * smoothstep(.8, .4, bulge));
    refr_b -= .2 * edge;

    refr_r *= u_refraction;
    refr_b *= u_refraction;

    vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
    w[1] -= .02 * smoothstep(.0, 1., edge + bulge);
    float stripe_r = mod(dir + refr_r, 1.);
    float r = get_color_channel(color1.r, color2.r, stripe_r, w, 0.02 + .03 * u_refraction * bulge, bulge);
    float stripe_g = mod(dir, 1.);
    float g = get_color_channel(color1.g, color2.g, stripe_g, w, 0.01 / (1. - diagonal), bulge);
    float stripe_b = mod(dir - refr_b, 1.);
    float b = get_color_channel(color1.b, color2.b, stripe_b, w, .01, bulge);

    color = vec3(r, g, b);

    // Apply dithering effect only if a type is selected (not 'none')
    if (u_ditherType > 0) {
        vec2 screenPos = gl_FragCoord.xy;
        float threshold = getDitherThreshold(screenPos);
        
        // Apply dither before opacity multiplication
        // Use a safer approach that's more compatible with GIF export
        if (opacity > 0.05) { // Only apply dithering to more visible pixels
            // Limit the color range slightly to avoid extreme values
            vec3 safeColor = clamp(color, 0.01, 0.99);
            
            // Apply dithering with adjustable intensity
            color.r = applyDitherStep(safeColor.r, threshold);
            color.g = applyDitherStep(safeColor.g, threshold);
            color.b = applyDitherStep(safeColor.b, threshold);
        }
    }

    // Now apply the opacity
    color *= opacity;

    fragColor = vec4(color, opacity);
}`;

