import * as core from '@actions/core'

export function inputOrNull(name: string): string | null {
    const inputString = core.getInput(name, {required: false})
    if (inputString.length === 0) {
        return null
    }
    return inputString
}

export function inputArrayOrNull(name: string): string[] | null {
    const string = inputOrNull(name)
    if (!string) return null
    return string
        .split('\n')
        .map(s => s.trim())
        .filter(s => s !== '')
}
