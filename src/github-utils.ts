import * as core from '@actions/core'

export function inputOrNull(name: string): string | null {
    const inputString = core.getInput(name, {required: false})
    if (inputString.length === 0) {
        return null
    }
    return inputString
}
