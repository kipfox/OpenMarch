import { faker } from "@faker-js/faker";

type Coord = { x: number; y: number };

interface SvgPathOptions {
    numSegments?: number; // total groups of segments
    xRange?: [number, number];
    yRange?: [number, number];
    allowClose?: boolean;
    seed?: number;
}

/**
 * Generate a random (x, y) coordinate within given ranges.
 */
function randomCoord(
    xRange: [number, number],
    yRange: [number, number],
): Coord {
    const x = faker.number.float({
        min: xRange[0],
        max: xRange[1],
        multipleOf: 0.01,
    });
    const y = faker.number.float({
        min: yRange[0],
        max: yRange[1],
        multipleOf: 0.01,
    });
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

/**
 * Generate a random SVG path.
 * Starts with a Move (M) and can contain Lines (L), Quadratic (Q), or Cubic (C) Bézier curves.
 */
export function generateRandomSvgPath(options: SvgPathOptions = {}): string {
    const {
        numSegments = 3,
        xRange = [0, 500],
        yRange = [0, 500],
        allowClose = true,
        seed,
    } = options;

    if (seed !== undefined) faker.seed(seed);

    let d: string[] = [];
    let current = randomCoord(xRange, yRange);
    d.push(`M${current.x},${current.y}`);

    for (let i = 0; i < numSegments; i++) {
        const segmentType = faker.helpers.arrayElement(["L", "Q", "C"]);
        const segmentCount = faker.number.int({ min: 1, max: 3 });

        for (let j = 0; j < segmentCount; j++) {
            if (segmentType === "L") {
                const p = randomCoord(xRange, yRange);
                d.push(`L${p.x},${p.y}`);
                current = p;
            } else if (segmentType === "Q") {
                const c = randomCoord(xRange, yRange);
                const p = randomCoord(xRange, yRange);
                d.push(`Q${c.x},${c.y} ${p.x},${p.y}`);
                current = p;
            } else if (segmentType === "C") {
                const c1 = randomCoord(xRange, yRange);
                const c2 = randomCoord(xRange, yRange);
                const p = randomCoord(xRange, yRange);
                d.push(`C${c1.x},${c1.y} ${c2.x},${c2.y} ${p.x},${p.y}`);
                current = p;
            }
        }
    }

    if (allowClose && faker.datatype.boolean()) {
        d.push("Z");
    }

    return d.join(" ");
}

/**
 * Example usage — generates multiple paths
 */
if (require.main === module) {
    for (let i = 0; i < 5; i++) {
        console.log(generateRandomSvgPath({ numSegments: 4, seed: i }));
    }
}
