const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

async function processSpriteSheet() {
    try {
        const imagePath = '/Users/kevin/.gemini/antigravity/brain/89f5145e-099c-4585-a7bb-b0158b2d437a/phantom_sprite_sheet_1774142123751.png';
        const image = await Jimp.read(imagePath);
        
        // Let's assume the sprite sheet is 1024x1024.
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        
        // Find background color from top left pixel
        const bgColor = Jimp.intToRGBA(image.getPixelColor(0, 0));
        
        // Threshold for color difference
        const dist = (c1, c2) => Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
        
        // Make background transparent
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const color = Jimp.intToRGBA(image.getPixelColor(x, y));
                if (dist(color, bgColor) < 30) {
                    image.setPixelColor(Jimp.rgbaToInt(0, 0, 0, 0), x, y);
                }
            }
        }
        
        // Based on the image structure we saw:
        // Top text takes up ~10-15% of height
        // IDLE row is ~15%-45% height
        // RUN row is ~50%-90% height
        // Idle has 6 frames, run has 8 frames (4 per row usually if it's 8 frames, but the image shows 8 frames in 2 rows).
        // Let's just crop out the boxes. Alternatively, we can just save the transparent image and use trial and error in Engine.ts!
        
        const outPath = path.join(__dirname, 'public', 'phantom_sprite_sheet.png');
        await image.writeAsync(outPath);
        console.log("Saved transparent sprite sheet to " + outPath);
        
    } catch (e) {
        console.error(e);
    }
}

processSpriteSheet();
