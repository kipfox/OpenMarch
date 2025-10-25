/**
 * Asserts that a condition is true without throwing an error.
 *
 * Errors are displayed in the console and toast.
 *
 * @param condition The condition to assert.
 * @param message The message to display if the condition is false.
 */
export const softAssert = (
    condition: boolean,
    message: string,
    displayToast: boolean = true,
): void => {
    if (!condition) {
        console.error(message);
    }
};

/**
 * Asserts that a condition is true. Meant to mimic assertions in other languages.
 *
 * @param condition The condition to assert.
 * @param message The message to display if the condition is false.
 */
export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
