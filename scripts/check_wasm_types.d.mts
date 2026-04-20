export function checkDrift(input: { cppSource: string; tsSource: string }): {
    errors: string[]
    checkedCount: number
}
