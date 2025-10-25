export type Marcher = {
    id: number;
};

export type Page = {
    id: number;
    // The duration to get to this page from the previous page
    duration: number;
    position: number;
};
export type MarcherPage = {
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
};

export type PageAnimationCache = {
    frameRate: number;
    frameCount: number;
    marcherCoordinates: Record<number, Float32Array>;
};
