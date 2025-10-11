import { Faker, Randomizer, base } from "@faker-js/faker";
import fc from "fast-check";

class FakerBuilder<TValue> extends fc.Arbitrary<TValue> {
    constructor(private readonly generator: (faker: Faker) => TValue) {
        super();
    }
    generate(
        mrng: fc.Random,
        biasFactor: number | undefined,
    ): fc.Value<TValue> {
        const randomizer: Randomizer = {
            next: (): number => mrng.nextDouble(),
            seed: () => {}, // no-op, no support for updates of the seed, could even throw
        };
        const customFaker = new Faker({ locale: base, randomizer });
        return new fc.Value(this.generator(customFaker), undefined);
    }
    canShrinkWithoutContext(value: unknown): value is TValue {
        return false;
    }
    shrink(value: TValue, context: unknown): fc.Stream<fc.Value<TValue>> {
        return fc.Stream.nil();
    }
}

export function fakerToArb<TValue>(
    generator: (faker: Faker) => TValue,
): fc.Arbitrary<TValue> {
    return new FakerBuilder(generator);
}
