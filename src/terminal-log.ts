import cj from 'color-json'

export const customColorMap = {
    black: '\x1b[38;2;0;0;0m',
    red: '\x1b[38;2;249;133;123m',
    green: '\x1b[38;2;163;238;160m',
    yellow: '\x1b[38;2;209;154;102m',
    blue: '\x1b[36m',
    magenta: '\x1b[38;2;209;200;102m',
    cyan: '\x1b[38;2;75;167;239m',
    white: '\x1b[38;2;219;223;244m',
}

export function colorizeJson(data: unknown): string {
    return cj(JSON.stringify(data), undefined, customColorMap, 0)
}

export function timestamp(): string {
    return new Date().toLocaleTimeString()
}
