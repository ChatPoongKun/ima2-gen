import sharp from "sharp";
export function aspectToCanvas(aspectRatio, resolution) {
    const base = resolution === "720p" ? 720 : 480;
    const ratios = {
        "16:9": [16, 9], "9:16": [9, 16], "4:3": [4, 3], "3:4": [3, 4],
        "3:2": [3, 2], "2:3": [2, 3], "1:1": [1, 1], "auto": [16, 9],
    };
    const [w, h] = ratios[aspectRatio] || [16, 9];
    if (w >= h)
        return { width: Math.round(base * w / h), height: base };
    return { width: base, height: Math.round(base * h / w) };
}
export async function extractStoryboardPanel1B64(gridB64) {
    const input = Buffer.from(gridB64, "base64");
    const meta = await sharp(input).metadata();
    const w = meta.width || 1024;
    const h = meta.height || 1024;
    const panelW = Math.floor(w / 3);
    const panelH = Math.floor(h / 3);
    const buffer = await sharp(input)
        .extract({ left: 0, top: 0, width: panelW, height: panelH })
        .png()
        .toBuffer();
    return buffer.toString("base64");
}
export async function generateWhiteCanvasB64(width, height) {
    const buffer = await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: "#ffffff",
        },
    })
        .png()
        .toBuffer();
    return buffer.toString("base64");
}
