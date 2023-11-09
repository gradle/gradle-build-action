import * as inputParams from '../../src/input-params'

describe('input params', () => {
    describe('parses numeric input', () => {
        it('uses default value', () => {
            const val = inputParams.parseNumericInput('param-name', '', 88)
            expect(val).toBe(88)
        })
        it('parses numeric input', () => {
            const val = inputParams.parseNumericInput('param-name', '34', 88)
            expect(val).toBe(34)
        })
        it('fails on non-numeric input', () => {
            const t = () => {
                inputParams.parseNumericInput('param-name', 'xyz', 88)
            };

            expect(t).toThrow(TypeError)
            expect(t).toThrow("The value 'xyz' is not a valid numeric value for 'param-name'.")
        })
    })
})
